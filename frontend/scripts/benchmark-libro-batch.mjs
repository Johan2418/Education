import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

const DEFAULTS = {
  mode: "smoke",
  concurrency: 2,
  repeat: 1,
  maxPagesSmoke: 24,
  maxPagesStress: 0,
  maxPreguntasSmoke: 25,
  maxPreguntasStress: 0,
  timeoutMsSmoke: 120_000,
  timeoutMsStress: 420_000,
  maxBooksSmoke: 2,
  maxBooksStress: 0,
};

function parseArgs(argv) {
  const raw = {
    mode: DEFAULTS.mode,
    booksDir: path.resolve(repoRoot, "libro_prueba"),
    outDir: path.resolve(repoRoot, "qa-reports"),
    concurrency: DEFAULTS.concurrency,
    repeat: DEFAULTS.repeat,
    maxPages: undefined,
    maxPreguntas: undefined,
    timeoutMs: undefined,
    maxBooks: undefined,
  };

  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [key, value = ""] = token.slice(2).split("=");
    switch (key) {
      case "mode":
        raw.mode = value === "stress" ? "stress" : "smoke";
        break;
      case "books-dir":
      case "folder":
        if (value) raw.booksDir = path.resolve(value);
        break;
      case "out-dir":
        if (value) raw.outDir = path.resolve(value);
        break;
      case "concurrency":
        raw.concurrency = parseIntSafe(value, DEFAULTS.concurrency);
        break;
      case "repeat":
        raw.repeat = parseIntSafe(value, DEFAULTS.repeat);
        break;
      case "max-pages":
        raw.maxPages = parseIntSafe(value, 0);
        break;
      case "max-preguntas":
        raw.maxPreguntas = parseIntSafe(value, 0);
        break;
      case "timeout":
      case "timeout-ms":
        raw.timeoutMs = parseIntSafe(value, 0);
        break;
      case "max-books":
        raw.maxBooks = parseIntSafe(value, 0);
        break;
      default:
        break;
    }
  }

  const mode = raw.mode === "stress" ? "stress" : "smoke";
  const maxPagesDefault = mode === "stress" ? DEFAULTS.maxPagesStress : DEFAULTS.maxPagesSmoke;
  const maxPreguntasDefault = mode === "stress" ? DEFAULTS.maxPreguntasStress : DEFAULTS.maxPreguntasSmoke;
  const timeoutMsDefault = mode === "stress" ? DEFAULTS.timeoutMsStress : DEFAULTS.timeoutMsSmoke;
  const maxBooksDefault = mode === "stress" ? DEFAULTS.maxBooksStress : DEFAULTS.maxBooksSmoke;

  return {
    mode,
    booksDir: raw.booksDir,
    outDir: raw.outDir,
    concurrency: clamp(raw.concurrency, 1, 32),
    repeat: clamp(raw.repeat, 1, 500),
    maxPages: clamp(raw.maxPages ?? maxPagesDefault, 0, 5000),
    maxPreguntas: clamp(raw.maxPreguntas ?? maxPreguntasDefault, 0, 5000),
    timeoutMs: clamp(raw.timeoutMs ?? timeoutMsDefault, 5_000, 3_600_000),
    maxBooks: clamp(raw.maxBooks ?? maxBooksDefault, 0, 10_000),
  };
}

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

async function findPdfFiles(dir) {
  const result = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        result.push(full);
      }
    }
  }
  await walk(dir);
  result.sort((a, b) => a.localeCompare(b));
  return result;
}

function isLikelyExercisePage(text) {
  const normalized = text.toLowerCase();
  if (normalized.length < 15) return false;

  const instructionMatches = (
    normalized.match(
      /\b(ejercicio(?:s)?|pregunta(?:s)?|problema(?:s)?|actividad(?:es)?|tarea(?:s)?|cuestionario|seccion|autoevaluacion|resuelve|responda|responde|complete|completa|selecciona|marca|indica|justifica|calcula)\b/g,
    ) || []
  ).length;
  const numberedItemMatches = (text.match(/(?:^|\s)(?:\d{1,2}[.)]|[a-dA-D][.)])\s+/g) || []).length;
  const questionMarkMatches = (text.match(/[¿?]/g) || []).length;
  const optionsMatches = (text.match(/(?:^|\s)[a-dA-D][.)]\s+/g) || []).length;
  const theoryMatches = (normalized.match(/\b(introduccion|objetivo|resumen|teoria|definicion|concepto|historia|explicacion|contenido)\b/g) || []).length;

  const score =
    instructionMatches * 2 +
    Math.min(numberedItemMatches, 4) * 2 +
    Math.min(questionMarkMatches, 3) +
    Math.min(optionsMatches, 3) -
    (theoryMatches >= 5 ? 2 : 0);

  if (score < 1) return false;
  return numberedItemMatches >= 1 || questionMarkMatches >= 1 || instructionMatches >= 1;
}

function choosePagesForTrabajos(parsedPages, candidatePages) {
  const minCandidatesThreshold = Math.ceil(parsedPages.length * 0.3);
  const shouldUseCandidates = candidatePages.length >= minCandidatesThreshold;
  return {
    minCandidatesThreshold,
    shouldUseCandidates,
    pagesForTrabajos: shouldUseCandidates ? candidatePages : parsedPages,
    skippedByRegex: shouldUseCandidates ? parsedPages.length - candidatePages.length : 0,
  };
}

function estimateQuestionsFromText(text) {
  const numbered = (text.match(/(?:^|\n|\s)(?:\d{1,2}[.)]|[a-dA-D][.)])\s+/g) || []).length;
  const marks = (text.match(/[¿?]/g) || []).length;
  const prompts = (text.match(/\b(responde|responda|calcula|completa|justifica|indica|selecciona|marca)\b/gi) || []).length;
  return Math.max(numbered, marks > 0 ? Math.ceil(marks / 2) : 0, Math.ceil(prompts / 2), 1);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

function classifyError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("timeout")) return "timeout";
  if (msg.includes("pdf") || msg.includes("parse")) return "parse_error";
  if (msg.includes("enoent")) return "file_not_found";
  return "unknown_error";
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function loadFileBlobFromCache(filePath, caches) {
  const stat = await fs.stat(filePath);
  const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;
  const cached = caches.fileBlobByPath.get(cacheKey);
  if (cached) return cached;

  const pending = caches.fileBlobPendingByPath.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const bytes = await fs.readFile(filePath);
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const blob = { bytes, hash, size: stat.size };
    caches.fileBlobByPath.set(cacheKey, blob);
    return blob;
  })();

  caches.fileBlobPendingByPath.set(cacheKey, task);
  try {
    return await task;
  } finally {
    caches.fileBlobPendingByPath.delete(cacheKey);
  }
}

async function parsePdfBlob(blob, options) {
  const parseStart = performance.now();
  const pdf = await getDocument({ data: new Uint8Array(blob.bytes), disableWorker: true }).promise;
  const pagesTotal = pdf.numPages;
  const pageLimit = options.maxPages > 0 ? Math.min(pagesTotal, options.maxPages) : pagesTotal;
  const parsedPages = [];

  for (let pageNum = 1; pageNum <= pageLimit; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 0) parsedPages.push({ page: pageNum, text });
  }
  await pdf.destroy();

  const candidatePages = parsedPages.filter((item) => isLikelyExercisePage(item.text));
  const decision = choosePagesForTrabajos(parsedPages, candidatePages);
  const selectedPages = decision.pagesForTrabajos;

  let preguntasEstimadas = 0;
  for (const page of selectedPages) {
    preguntasEstimadas += estimateQuestionsFromText(page.text);
    if (options.maxPreguntas > 0 && preguntasEstimadas >= options.maxPreguntas) {
      preguntasEstimadas = options.maxPreguntas;
      break;
    }
  }

  const parsed = {
    pagesTotal,
    pagesProcessed: parsedPages.length,
    candidatePages: candidatePages.length,
    pagesForTrabajos: selectedPages.length,
    skippedByRegex: decision.skippedByRegex,
    preguntasEstimadas,
    parseMs: Math.round(performance.now() - parseStart),
  };
  return parsed;
}

async function parsePdfWithCache(filePath, options, caches) {
  const blob = await loadFileBlobFromCache(filePath, caches);
  if (caches.bookByHash.has(blob.hash)) {
    return { cacheHit: true, hash: blob.hash, size: blob.size, ...caches.bookByHash.get(blob.hash) };
  }

  const pendingByHash = caches.bookPendingByHash.get(blob.hash);
  if (pendingByHash) {
    const parsed = await pendingByHash;
    return { cacheHit: true, hash: blob.hash, size: blob.size, ...parsed };
  }

  const parseTask = parsePdfBlob(blob, options).then((parsed) => {
    caches.bookByHash.set(blob.hash, parsed);
    return parsed;
  });
  caches.bookPendingByHash.set(blob.hash, parseTask);
  let parsed;
  try {
    parsed = await parseTask;
  } finally {
    caches.bookPendingByHash.delete(blob.hash);
  }
  return {
    cacheHit: false,
    hash: blob.hash,
    size: blob.size,
    ...parsed,
  };
}

function toCsv(rows) {
  const headers = [
    "job_index",
    "book_name",
    "iteration",
    "status",
    "wait_ms",
    "run_ms",
    "total_ms",
    "cache_hit",
    "pages_total",
    "pages_processed",
    "candidate_pages",
    "pages_for_trabajos",
    "preguntas_estimadas",
    "error_type",
    "error_message",
  ];
  const escapeCell = (value) => {
    const raw = value == null ? "" : String(value);
    if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
      return `"${raw.replace(/"/g, "\"\"")}"`;
    }
    return raw;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  }
  return lines.join("\n");
}

function hasComparableConfig(report, current) {
  if (!report || !current) return false;
  const cfg = report.config || {};
  return (
    report.mode === current.mode &&
    Number(cfg.concurrency) === Number(current.concurrency) &&
    Number(cfg.repeat) === Number(current.repeat) &&
    Number(cfg.max_pages) === Number(current.max_pages) &&
    Number(cfg.max_preguntas) === Number(current.max_preguntas) &&
    Number(cfg.timeout_ms) === Number(current.timeout_ms) &&
    Number(cfg.max_books) === Number(current.max_books)
  );
}

async function readPreviousBatchReport(outDir, nextFileName, currentConfigSignature) {
  try {
    const entries = await fs.readdir(outDir);
    const prior = entries
      .filter((name) => name.startsWith("libro-batch-") && name.endsWith(".json") && name !== nextFileName)
      .sort((a, b) => b.localeCompare(a));
    for (const name of prior) {
      const data = await fs.readFile(path.join(outDir, name), "utf-8");
      const report = JSON.parse(data);
      if (hasComparableConfig(report, currentConfigSignature)) {
        return report;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildComparison(previous, currentAggregate) {
  if (!previous?.aggregate) return null;
  const prev = previous.aggregate;
  const pct = (curr, old) => {
    if (!old || old === 0) return null;
    return Number((((curr - old) / old) * 100).toFixed(2));
  };
  return {
    previous_generated_at: previous.generated_at || null,
    throughput_books_min_delta_pct: pct(currentAggregate.throughput_books_min, prev.throughput_books_min || 0),
    latency_ms_p95_delta_pct: pct(currentAggregate.latency_ms_p95, prev.latency_ms_p95 || 0),
    jobs_failed_delta: currentAggregate.jobs_failed - (prev.jobs_failed || 0),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outDir, { recursive: true });

  const discovered = await findPdfFiles(options.booksDir);
  if (!discovered.length) {
    throw new Error(`No se encontraron PDFs en ${options.booksDir}`);
  }
  const selected =
    options.maxBooks > 0 && discovered.length > options.maxBooks ? discovered.slice(0, options.maxBooks) : discovered;

  const jobs = [];
  for (const pdfPath of selected) {
    for (let iteration = 1; iteration <= options.repeat; iteration += 1) {
      jobs.push({
        pdfPath,
        iteration,
        queuedAt: Date.now(),
      });
    }
  }

  const caches = {
    fileBlobByPath: new Map(),
    fileBlobPendingByPath: new Map(),
    bookByHash: new Map(),
    bookPendingByHash: new Map(),
  };
  const runStart = performance.now();

  const results = await runWithConcurrency(jobs, options.concurrency, async (job, index) => {
    const startedAtMs = Date.now();
    const waitMs = Math.max(0, startedAtMs - job.queuedAt);
    const jobStart = performance.now();
    try {
      const parsed = await withTimeout(
        parsePdfWithCache(job.pdfPath, options, caches),
        options.timeoutMs,
        `book ${path.basename(job.pdfPath)}`,
      );
      const runMs = Math.round(performance.now() - jobStart);
      return {
        job_index: index + 1,
        book_path: job.pdfPath,
        book_name: path.basename(job.pdfPath),
        iteration: job.iteration,
        status: "ok",
        queued_at: new Date(job.queuedAt).toISOString(),
        started_at: new Date(startedAtMs).toISOString(),
        wait_ms: waitMs,
        run_ms: runMs,
        total_ms: waitMs + runMs,
        cache_hit: parsed.cacheHit,
        pages_total: parsed.pagesTotal,
        pages_processed: parsed.pagesProcessed,
        candidate_pages: parsed.candidatePages,
        pages_for_trabajos: parsed.pagesForTrabajos,
        skipped_by_regex: parsed.skippedByRegex,
        preguntas_estimadas: parsed.preguntasEstimadas,
        hash: parsed.hash,
        size_bytes: parsed.size,
        parse_ms: parsed.parseMs,
        error_type: "",
        error_message: "",
      };
    } catch (err) {
      const runMs = Math.round(performance.now() - jobStart);
      return {
        job_index: index + 1,
        book_path: job.pdfPath,
        book_name: path.basename(job.pdfPath),
        iteration: job.iteration,
        status: "failed",
        queued_at: new Date(job.queuedAt).toISOString(),
        started_at: new Date(startedAtMs).toISOString(),
        wait_ms: waitMs,
        run_ms: runMs,
        total_ms: waitMs + runMs,
        cache_hit: false,
        pages_total: 0,
        pages_processed: 0,
        candidate_pages: 0,
        pages_for_trabajos: 0,
        skipped_by_regex: 0,
        preguntas_estimadas: 0,
        hash: "",
        size_bytes: 0,
        parse_ms: 0,
        error_type: classifyError(err),
        error_message: String(err?.message || err),
      };
    }
  });

  const wallMs = Math.max(1, performance.now() - runStart);
  const okJobs = results.filter((r) => r.status === "ok");
  const failedJobs = results.filter((r) => r.status !== "ok");
  const latencies = okJobs.map((r) => r.total_ms);
  const errorBreakdown = failedJobs.reduce((acc, job) => {
    const key = job.error_type || "unknown_error";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const aggregate = {
    books_total: jobs.length,
    books_unique: selected.length,
    jobs_ok: okJobs.length,
    jobs_failed: failedJobs.length,
    throughput_books_min: Number((okJobs.length / (wallMs / 60_000)).toFixed(3)),
    latency_ms_p50: Number(percentile(latencies, 50).toFixed(2)),
    latency_ms_p95: Number(percentile(latencies, 95).toFixed(2)),
    parse_ms_total: okJobs.reduce((sum, item) => sum + (item.parse_ms || 0), 0),
    cache_hits: okJobs.filter((item) => item.cache_hit).length,
    cache_misses: okJobs.filter((item) => !item.cache_hit).length,
    error_breakdown: errorBreakdown,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonName = `libro-batch-${stamp}.json`;
  const csvName = `libro-batch-${stamp}.csv`;
  const currentConfigSignature = {
    mode: options.mode,
    concurrency: options.concurrency,
    repeat: options.repeat,
    max_pages: options.maxPages,
    max_preguntas: options.maxPreguntas,
    timeout_ms: options.timeoutMs,
    max_books: options.maxBooks,
  };
  const previous = await readPreviousBatchReport(options.outDir, jsonName, currentConfigSignature);
  const comparison = buildComparison(previous, aggregate);

  const report = {
    generated_at: new Date().toISOString(),
    mode: options.mode,
    input: {
      books_dir: options.booksDir,
      discovered_pdfs: discovered.length,
      selected_pdfs: selected.length,
    },
    config: {
      concurrency: options.concurrency,
      repeat: options.repeat,
      max_pages: options.maxPages,
      max_preguntas: options.maxPreguntas,
      timeout_ms: options.timeoutMs,
      max_books: options.maxBooks,
    },
    aggregate,
    comparison_vs_previous: comparison,
    jobs: results,
  };

  const jsonPath = path.join(options.outDir, jsonName);
  const csvPath = path.join(options.outDir, csvName);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");
  await fs.writeFile(csvPath, toCsv(results), "utf-8");

  console.log("Batch QA finalizado.");
  console.log(`- Jobs totales: ${aggregate.books_total} (OK=${aggregate.jobs_ok}, FAIL=${aggregate.jobs_failed})`);
  console.log(`- Throughput (books/min): ${aggregate.throughput_books_min}`);
  console.log(`- Latencia p50/p95 (ms): ${aggregate.latency_ms_p50} / ${aggregate.latency_ms_p95}`);
  if (Object.keys(errorBreakdown).length) {
    console.log(`- Error breakdown: ${JSON.stringify(errorBreakdown)}`);
  }
  if (comparison) {
    console.log(`- Comparacion vs previo: ${JSON.stringify(comparison)}`);
  }
  console.log(`- Reporte JSON: ${jsonPath}`);
  console.log(`- Reporte CSV: ${csvPath}`);
}

main().catch((err) => {
  console.error("Error ejecutando batch QA de libros:");
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
