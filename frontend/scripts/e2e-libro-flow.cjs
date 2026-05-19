const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

function stamp() {
  const d = new Date();
  const p = (n, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

function short(text, max = 220) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

async function exists(locator) {
  return (await locator.count()) > 0;
}

async function clickFirst(page, selectors, timeoutMs = 10000) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await loc.click({ timeout: timeoutMs });
      return selector;
    }
  }
  throw new Error(`No se encontró selector clickeable: ${selectors.join(" | ")}`);
}

async function fillIfVisible(page, selector, value) {
  const loc = page.locator(selector).first();
  if (await loc.count()) {
    await loc.fill(String(value));
    return true;
  }
  return false;
}

async function run() {
  const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5173";
  const email = process.env.E2E_TEACHER_EMAIL || "jhonsuarez1612@gmail.com";
  const password = process.env.E2E_TEACHER_PASSWORD || "johan1612";
  const reportDir = path.resolve(process.cwd(), "qa-reports");
  const runId = stamp();

  await fs.mkdir(reportDir, { recursive: true });

  const report = {
    runId,
    baseUrl,
    startedAt: new Date().toISOString(),
    credentialsEmail: email,
    steps: [],
    consoleErrors: [],
    consoleWarnings: [],
    requestFailures: [],
    httpErrors: [],
    final: {},
  };

  const pushStep = (name, extra = {}) => {
    report.steps.push({ at: new Date().toISOString(), name, ...extra });
  };

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const entry = {
      type: msg.type(),
      text: short(msg.text(), 500),
      url: page.url(),
      at: new Date().toISOString(),
    };
    if (entry.type === "error") report.consoleErrors.push(entry);
    if (entry.type === "warning" || entry.type === "warn") report.consoleWarnings.push(entry);
  });

  page.on("requestfailed", (req) => {
    report.requestFailures.push({
      at: new Date().toISOString(),
      method: req.method(),
      url: req.url(),
      errorText: req.failure()?.errorText || "unknown",
    });
  });

  page.on("response", async (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (!url.includes("/tareas") && !url.includes("/trabajos") && !url.includes("9082")) return;
    let body = "";
    try {
      body = short(await res.text(), 400);
    } catch {
      body = "<no-body>";
    }
    report.httpErrors.push({
      at: new Date().toISOString(),
      status,
      method: res.request().method(),
      url,
      body,
    });
  });

  let screenshotBase = path.join(reportDir, `e2e-libro-${runId}`);

  try {
    pushStep("goto_login");
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });

    pushStep("fill_login");
    await page.fill("#login-email", email);
    await page.fill("#login-password", password);

    pushStep("submit_login");
    await page.click("button[type='submit']");
    await page.waitForTimeout(1200);

    const loginError = page.locator("#login-error");
    if (await exists(loginError)) {
      report.final.loginError = short(await loginError.innerText(), 500);
      throw new Error(`Login falló: ${report.final.loginError}`);
    }

    pushStep("goto_teacher_trabajos");
    await page.goto(`${baseUrl}/teacher/trabajos`, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(1000);

    pushStep("open_create_modal");
    await clickFirst(page, [
      "button:has-text('Nueva Tarea')",
      "button:has-text('Nueva tarea')",
      "button:has-text('Crear')",
    ]);

    pushStep("select_book_mode");
    await clickFirst(page, [
      "button:has-text('Desde libro')",
      "button:has-text('Libro')",
    ]);

    pushStep("load_demo_pdf");
    await clickFirst(page, [
      "button:has-text('Cargar PDF de prueba')",
    ], 15000);

    // Esperar parse del PDF en frontend
    await page.waitForTimeout(3000);
    const loadedIndicator = page.locator("text=Archivo seleccionado").first();
    await loadedIndicator.waitFor({ state: "visible", timeout: 240000 });

    pushStep("set_page_range");
    await fillIfVisible(page, "input[type='number'] >> nth=0", 1);
    await fillIfVisible(page, "input[type='number'] >> nth=1", 80);

    pushStep("enable_manual_review");
    const manualReviewLabel = page.locator("label:has-text('Requerir verificacion manual de preguntas')").first();
    if (await manualReviewLabel.count()) {
      const checkbox = manualReviewLabel.locator("input[type='checkbox']").first();
      if (!(await checkbox.isChecked())) {
        await manualReviewLabel.click();
      }
    } else {
      const fallback = page.locator("input[type='checkbox']").first();
      if (await fallback.count() && !(await fallback.isChecked())) {
        await fallback.check();
      }
    }

    pushStep("save_create");
    await clickFirst(page, [
      "button:has-text('Guardar')",
    ], 15000);

    pushStep("wait_processing");
    await page.waitForTimeout(3000);

    // Esperar o error/toast o modal de revisión
    const reviewTitle = page.locator("text=Revision secuencial de trabajos de libro").first();
    const spinner = page.locator("text=Guardando...").first();
    const timeoutAt = Date.now() + 420000;
    while (Date.now() < timeoutAt) {
      if (await reviewTitle.count()) {
        report.final.reviewModalOpened = true;
        break;
      }
      if (!(await spinner.count())) {
        // Puede haber terminado con error/toast
        break;
      }
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: `${screenshotBase}-final.png`, fullPage: true });

    const omissionToast = page.locator("text=La IA omitio").first();
    if (await omissionToast.count()) {
      report.final.omissionToast = short(await omissionToast.innerText(), 400);
    }

    const reviewProgress = page.locator("text=Trabajo").first();
    if (await reviewProgress.count()) {
      report.final.reviewProgressText = short(await reviewProgress.innerText(), 220);
    }

    report.final.url = page.url();
    report.final.reviewModalOpened = Boolean(report.final.reviewModalOpened);
    pushStep("finished");
  } catch (err) {
    report.final.error = short(err && err.message ? err.message : String(err), 600);
    report.final.url = page.url();
    try {
      await page.screenshot({ path: `${screenshotBase}-error.png`, fullPage: true });
    } catch {
      // ignore screenshot failure
    }
  } finally {
    report.endedAt = new Date().toISOString();
    const reportPath = path.join(reportDir, `e2e-libro-flow-${runId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
    await browser.close();
    console.log(JSON.stringify({ reportPath, screenshotBase, final: report.final }, null, 2));
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
