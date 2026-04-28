import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Search, SendHorizontal, XCircle, CheckCircle2, ClipboardList, BarChart3, Trash2, Pencil, Library } from "lucide-react";
import toast from "react-hot-toast";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extractRawText } from "mammoth";

import api from "@/shared/lib/api";
import { getMe } from "@/shared/lib/auth";
import type { Curso, Leccion, Materia, Tema, Unidad } from "@/shared/types";
import type { CreateTrabajoRequest, LibroPreguntaInput, PdfPaginaMetadata, Trabajo, UpdateTrabajoRequest } from "@/shared/types/trabajos";
import {
  confirmarLibro,
  createTrabajo,
  cerrarTrabajo,
  deleteTrabajo,
  extractLibro,
  getLibroEstado,
  listTrabajosByLeccion,
  publicarTrabajo,
  revisarLibro,
  updateTrabajo,
} from "@/features/trabajos/services/trabajos";

interface LeccionOption {
  id: string;
  titulo: string;
}

interface TrabajoRow extends Trabajo {
  leccion_titulo: string;
}

interface PageChunk {
  page: number;
  text: string;
  page_image_base64?: string;
  page_image_metadata?: PdfPaginaMetadata;
}

interface LibroBatchProgress {
  active: boolean;
  total: number;
  processed: number;
  created: number;
  skippedByRegex: number;
  skippedByIA: number;
  failed: number;
  currentPage: number | null;
  currentPhase: "analizando" | "creando" | "extrayendo" | "revisando" | "confirmando" | "finalizado";
}

interface TrabajoLibroReviewDraft {
  titulo: string;
  descripcion: string;
  instrucciones: string;
}

interface ReviewPersistedProgress {
  currentQuestionIndex: number;
  approvedQuestionIndexes: number[];
  updatedAt: string;
}

interface LibroReviewMeta {
  estado: string;
  confirmado: boolean;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_BOOK_QUESTIONS_PER_EXTRACT = 400;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

function normalizeToDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function buildMarkedContentFromChunks(chunks: PageChunk[]): string {
  return chunks
    .map((chunk) => `[PAGINA ${chunk.page}]\n${chunk.text.trim()}`)
    .join("\n\n");
}

function divideChunksIntoBlocks(chunks: PageChunk[], maxPagesPerBlock: number = 50): PageChunk[][] {
  const blocks: PageChunk[][] = [];
  for (let i = 0; i < chunks.length; i += maxPagesPerBlock) {
    blocks.push(chunks.slice(i, i + maxPagesPerBlock));
  }
  return blocks;
}

function normalizeForResourceHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isLikelyExercisePage(text: string): boolean {
  const normalized = text.toLowerCase();
  // Reducido de 20 a 15 para permitir OCR y texto breve
  if (normalized.length < 15) return false;

  // Palabras clave extendidas: agregadas 5 nuevas (pregunta, problema, tarea, sección, autoevaluación)
  const instructionMatches = (normalized.match(/\b(ejercicio(?:s)?|pregunta(?:s)?|problema(?:s)?|actividad(?:es)?|tarea(?:s)?|cuestionario|seccion|autoevaluacion|resuelve|responda|responde|complete|completa|selecciona|marca|indica|justifica|calcula)\b/g) || []).length;
  const numberedItemMatches = (text.match(/(?:^|\s)(?:\d{1,2}[.)]|[a-dA-D][.)])\s+/g) || []).length;
  const questionMarkMatches = (text.match(/[¿?]/g) || []).length;
  const optionsMatches = (text.match(/(?:^|\s)[a-dA-D][.)]\s+/g) || []).length;
  const theoryMatches = (normalized.match(/\b(introduccion|objetivo|resumen|teoria|definicion|concepto|historia|explicacion|contenido)\b/g) || []).length;

  const score =
    instructionMatches * 2 +
    Math.min(numberedItemMatches, 4) * 2 +
    Math.min(questionMarkMatches, 3) +
    Math.min(optionsMatches, 3) -
    (theoryMatches >= 5 ? 2 : 0);  // Aumentado de -1 a -2 para mayor tolerancia

  // Umbral reducido de 2 a 1 para ser menos restrictivo
  if (score < 1) return false;

  return numberedItemMatches >= 1 || questionMarkMatches >= 1 || instructionMatches >= 1;
}

function isLikelyExerciseQuestionText(texto: string): boolean {
  const normalized = texto.trim().toLowerCase();
  if (normalized.length < 12) return false;

  const hasQuestionMark = /[¿?]/.test(normalized);
  const startsWithInstruction = /^(responde|responda|calcula|complete|completa|selecciona|marca|indica|justifica|define|menciona|enumera|relaciona)\b/.test(normalized);
  const startsWithNumber = /^\d{1,2}[.)]\s+/.test(normalized);
  const hasOptions = /(?:^|\s)[a-d][.)]\s+/.test(normalized);

  return hasQuestionMark || startsWithInstruction || startsWithNumber || hasOptions;
}

function looksLikeCompositeQuestion(texto: string): boolean {
  const t = (texto || "").trim();
  if (!t) return false;
  const markerMatches = t.match(/(?:^|\n|\s)(?:\d{1,2}[.)]|[A-Da-d][.)]|pregunta\s+\d+[:.-])/gi) || [];
  return markerMatches.length >= 2;
}

function sanitizeExtractedQuestions(preguntas: LibroPreguntaInput[]): LibroPreguntaInput[] {
  return preguntas.filter((pregunta) => {
    const texto = (pregunta.texto || "").trim();
    if (!texto) return false;

    const genericFallback = texto.toLowerCase() === "resume los conceptos principales del texto proporcionado.";
    const lowConfidenceHeuristic = (pregunta.confianza_ia ?? 1) <= 0.56 && /^explica:\s+/i.test(texto);
    const notExerciseQuestion = !isLikelyExerciseQuestionText(texto);

    return !genericFallback && !lowConfidenceHeuristic && !notExerciseQuestion;
  });
}

function normalizeExtractedQuestions(preguntas: LibroPreguntaInput[]): LibroPreguntaInput[] {
  return preguntas
    .map((pregunta, idx) => ({
      ...pregunta,
      texto: (pregunta.texto || "").trim(),
      orden: pregunta.orden > 0 ? pregunta.orden : idx + 1,
    }))
    .filter((pregunta) => pregunta.texto.length > 0);
}

async function parsePdfPages(file: File, pageStart?: number, pageEnd?: number): Promise<PageChunk[]> {
  const start = pageStart && pageStart > 0 ? pageStart : 1;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const end = pageEnd && pageEnd >= start ? Math.min(pageEnd, doc.numPages) : doc.numPages;

  const chunks: PageChunk[] = [];
  for (let pageNum = start; pageNum <= end; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text || text.length < 30) continue;

    const viewport = page.getViewport({ scale: 1 });
    const hasRenderableArea = viewport.width > 0 && viewport.height > 0;
    let pageImageBase64: string | undefined;
    let pageImageMetadata: PdfPaginaMetadata | undefined;
    if (hasRenderableArea) {
      const canvas = document.createElement("canvas");
      const targetWidth = 960;
      const scale = Math.min(2, Math.max(0.8, targetWidth / Math.max(1, viewport.width)));
      const renderViewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(renderViewport.width));
      canvas.height = Math.max(1, Math.floor(renderViewport.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        await page.render({ canvas, canvasContext: ctx, viewport: renderViewport }).promise;
        pageImageBase64 = canvas.toDataURL("image/jpeg", 0.65);

        const textRegions = content.items
          .map((item) => {
            if (!("str" in item)) return null;
            const texto = String(item.str || "").trim();
            if (!texto) return null;

            const unknownItem = item as unknown as {
              transform?: number[];
              width?: number;
              height?: number;
            };
            const transform = unknownItem.transform;
            if (!Array.isArray(transform) || transform.length < 6) return null;

            const t = pdfjsLib.Util.transform(renderViewport.transform, transform);
            const x = Number.isFinite(t[4]) ? t[4] : 0;
            const estimatedWidth = Math.max(1, Math.abs((unknownItem.width || 0) * scale));
            const estimatedHeight = Math.max(8, Math.abs(t[3]) || Math.abs((unknownItem.height || 0) * scale));
            const y = Number.isFinite(t[5]) ? t[5] - estimatedHeight : 0;

            return {
              texto,
              x: Math.max(0, Math.min(canvas.width - 1, x)),
              y: Math.max(0, Math.min(canvas.height - 1, y)),
              width: Math.max(1, Math.min(canvas.width, estimatedWidth)),
              height: Math.max(1, Math.min(canvas.height, estimatedHeight)),
            };
          })
          .filter((region): region is NonNullable<typeof region> => !!region);

        if (textRegions.length > 0) {
          pageImageMetadata = {
            image_width: canvas.width,
            image_height: canvas.height,
            text_regions: textRegions,
          };
        }
      }
    }

    chunks.push({ page: pageNum, text, page_image_base64: pageImageBase64, page_image_metadata: pageImageMetadata });
  }

  return chunks;
}

async function parseDocxPages(file: File, pageStart?: number): Promise<PageChunk[]> {
  const start = pageStart && pageStart > 0 ? pageStart : 1;
  const { value } = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = value.replace(/\r/g, "\n").trim();
  if (!text) return [];

  const chunkSize = 3500;
  const chunks: PageChunk[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    const page = start + Math.floor(i / chunkSize);
    const part = text.slice(i, i + chunkSize).trim();
    if (!part || part.length < 30) continue;
    chunks.push({ page, text: part });
  }
  return chunks;
}

async function parseTxtPages(file: File, pageStart?: number): Promise<PageChunk[]> {
  const start = pageStart && pageStart > 0 ? pageStart : 1;
  const text = (await file.text()).trim();
  if (!text) return [];

  const formFeedPages = text.split(/\f+/g).map((s) => s.trim()).filter(Boolean);
  if (formFeedPages.length > 1) {
    return formFeedPages
      .map((pageText, idx) => ({ page: start + idx, text: pageText }))
      .filter((item) => item.text.length >= 30);
  }

  const chunkSize = 3500;
  const chunks: PageChunk[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    const page = start + Math.floor(i / chunkSize);
    const part = text.slice(i, i + chunkSize).trim();
    if (!part || part.length < 30) continue;
    chunks.push({ page, text: part });
  }
  return chunks;
}

export default function TeacherTrabajos() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [trabajos, setTrabajos] = useState<TrabajoRow[]>([]);
  const [lecciones, setLecciones] = useState<LeccionOption[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [editingTrabajoId, setEditingTrabajoId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"manual" | "libro">("manual");
  const [libroPages, setLibroPages] = useState<PageChunk[]>([]);
  const [libroFileName, setLibroFileName] = useState("");
  const [libroPageStart, setLibroPageStart] = useState(1);
  const [libroPageEnd, setLibroPageEnd] = useState<number | "">("");
  const [libroMaxPreguntas, setLibroMaxPreguntas] = useState(5);
  const [libroIdioma, setLibroIdioma] = useState("es");
  const [libroPublicarAlCrear, setLibroPublicarAlCrear] = useState(false);
  const [libroMinPreguntasPublicar, setLibroMinPreguntasPublicar] = useState(3);
  const [libroRevisionManual, setLibroRevisionManual] = useState(false);
  const [libroProgress, setLibroProgress] = useState<LibroBatchProgress>({
    active: false,
    total: 0,
    processed: 0,
    created: 0,
    skippedByRegex: 0,
    skippedByIA: 0,
    failed: 0,
    currentPage: null,
    currentPhase: "analizando",
  });
  const [reviewQueueIds, setReviewQueueIds] = useState<string[]>([]);
  const [reviewQueueIndex, setReviewQueueIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewTrabajo, setReviewTrabajo] = useState<TrabajoRow | null>(null);
  const [reviewPreguntas, setReviewPreguntas] = useState<LibroPreguntaInput[]>([]);
  const [reviewNotas, setReviewNotas] = useState("");
  const [reviewCurrentQuestionIndex, setReviewCurrentQuestionIndex] = useState(0);
  const [reviewApprovedQuestionIndexes, setReviewApprovedQuestionIndexes] = useState<number[]>([]);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [libroReviewMetaByTrabajo, setLibroReviewMetaByTrabajo] = useState<Record<string, LibroReviewMeta>>({});
  const [reviewDraft, setReviewDraft] = useState<TrabajoLibroReviewDraft>({
    titulo: "",
    descripcion: "",
    instrucciones: "",
  });
  const [newTrabajo, setNewTrabajo] = useState<CreateTrabajoRequest>({
    leccion_id: "",
    titulo: "",
    descripcion: "",
    instrucciones: "",
    fecha_vencimiento: "",
  });

  const loadData = useCallback(async () => {
    const cursosRes = await api.get<{ data: Curso[] }>("/cursos");
    const cursos = cursosRes.data || [];

    const allLecciones: LeccionOption[] = [];
    const allTrabajos: TrabajoRow[] = [];

    for (const curso of cursos) {
      const materiasRes = await api.get<{ data: Materia[] }>(`/cursos/${curso.id}/materias`);
      const materias = materiasRes.data || [];

      for (const materia of materias) {
        const unidadesRes = await api.get<{ data: Unidad[] }>(`/materias/${materia.id}/unidades`);
        const unidades = unidadesRes.data || [];

        for (const unidad of unidades) {
          const temasRes = await api.get<{ data: Tema[] }>(`/unidades/${unidad.id}/temas`);
          const temas = temasRes.data || [];

          for (const tema of temas) {
            const leccionesRes = await api.get<{ data: Leccion[] }>(`/temas/${tema.id}/lecciones`);
            const leccionesData = leccionesRes.data || [];

            for (const leccion of leccionesData) {
              allLecciones.push({ id: leccion.id, titulo: leccion.titulo });

              try {
                const trabajosLeccion = await listTrabajosByLeccion(leccion.id);
                for (const trabajo of trabajosLeccion) {
                  allTrabajos.push({ ...trabajo, leccion_titulo: leccion.titulo });
                }
              } catch {
                // Skip lecciones where listing fails so the page remains usable.
              }
            }
          }
        }
      }
    }

    const reviewCandidates = allTrabajos.filter((trabajo) => trabajo.extraido_de_libro && trabajo.id_extraccion && trabajo.estado === "borrador");

    const reviewEntries = await Promise.all(reviewCandidates.map(async (trabajo) => {
      try {
        const estadoLibro = await getLibroEstado(trabajo.id);
        return [trabajo.id, {
          estado: estadoLibro.extraccion?.estado || "pendiente",
          confirmado: Boolean(estadoLibro.extraccion?.confirmado_por),
        }] as const;
      } catch {
        // If libro state fails to load, keep item in manual queue to avoid premature publication visibility.
        return [trabajo.id, { estado: "pendiente", confirmado: false }] as const;
      }
    }));

    const nextReviewMetaByTrabajo: Record<string, LibroReviewMeta> = {};
    for (const [trabajoId, meta] of reviewEntries) {
      nextReviewMetaByTrabajo[trabajoId] = meta;
    }

    setLecciones(allLecciones);
    setTrabajos(allTrabajos);
    setLibroReviewMetaByTrabajo(nextReviewMetaByTrabajo);

    setNewTrabajo((prev) => {
      if (prev.leccion_id || allLecciones.length === 0) return prev;
      return { ...prev, leccion_id: allLecciones[0]?.id || "" };
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        await loadData();
      } catch (err) {
        toast.error(t("teacher.trabajos.loadError", { defaultValue: normalizeError(err) }));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData, navigate, t]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trabajos.filter((trabajo) => {
      return (
        (trabajo.titulo || "").toLowerCase().includes(q) ||
        (trabajo.leccion_titulo || "").toLowerCase().includes(q) ||
        (trabajo.estado || "").toLowerCase().includes(q)
      );
    });
  }, [search, trabajos]);

  const isPendingManualReview = useCallback((trabajo: TrabajoRow): boolean => {
    if (!trabajo.extraido_de_libro || !trabajo.id_extraccion || trabajo.estado !== "borrador") {
      return false;
    }

    const meta = libroReviewMetaByTrabajo[trabajo.id];
    if (!meta) {
      return true;
    }

    return meta.estado !== "aprobado" || !meta.confirmado;
  }, [libroReviewMetaByTrabajo]);

  const pendingManualReviewTrabajos = useMemo(
    () => filtered.filter((trabajo) => isPendingManualReview(trabajo)),
    [filtered, isPendingManualReview],
  );

  const visibleTrabajos = useMemo(
    () => filtered.filter((trabajo) => !isPendingManualReview(trabajo)),
    [filtered, isPendingManualReview],
  );

  const resetCreateState = () => {
    setShowCreate(false);
    setEditingTrabajoId(null);
    setCreateMode("manual");
    setLibroPages([]);
    setLibroFileName("");
    setLibroPageStart(1);
    setLibroPageEnd("");
    setLibroMaxPreguntas(5);
    setLibroIdioma("es");
    setLibroPublicarAlCrear(false);
    setLibroMinPreguntasPublicar(3);
    setLibroRevisionManual(false);
    setLibroProgress({
      active: false,
      total: 0,
      processed: 0,
      created: 0,
      skippedByRegex: 0,
      skippedByIA: 0,
      failed: 0,
      currentPage: null,
      currentPhase: "analizando",
    });
    setNewTrabajo((prev) => ({
      ...prev,
      titulo: "",
      descripcion: "",
      instrucciones: "",
      fecha_vencimiento: "",
    }));
  };

  const getReviewProgressStorageKey = (trabajoId: string) => `trabajo_libro_review_progress_${trabajoId}`;

  const saveReviewProgressSnapshot = (trabajoId: string, payload: ReviewPersistedProgress) => {
    try {
      localStorage.setItem(getReviewProgressStorageKey(trabajoId), JSON.stringify(payload));
    } catch {
      // Ignore localStorage failures to keep review flow functional.
    }
  };

  const readReviewProgressSnapshot = (trabajoId: string): ReviewPersistedProgress | null => {
    try {
      const raw = localStorage.getItem(getReviewProgressStorageKey(trabajoId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ReviewPersistedProgress;
      if (!Array.isArray(parsed.approvedQuestionIndexes)) return null;
      if (typeof parsed.currentQuestionIndex !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const clearReviewProgressSnapshot = (trabajoId: string) => {
    try {
      localStorage.removeItem(getReviewProgressStorageKey(trabajoId));
    } catch {
      // Ignore localStorage failures to keep review flow functional.
    }
  };

  const closeSequentialReview = () => {
    setReviewOpen(false);
    setReviewQueueIds([]);
    setReviewQueueIndex(0);
    setReviewTrabajo(null);
    setReviewPreguntas([]);
    setReviewNotas("");
    setReviewCurrentQuestionIndex(0);
    setReviewApprovedQuestionIndexes([]);
    setReviewDirty(false);
    setReviewDraft({ titulo: "", descripcion: "", instrucciones: "" });
  };

  const loadReviewItem = async (ids: string[], index: number) => {
    const trabajoId = ids[index];
    if (!trabajoId) {
      closeSequentialReview();
      return;
    }

    setReviewLoading(true);
    try {
      const estado = await getLibroEstado(trabajoId);
      const trabajoActual = trabajos.find((item) => item.id === trabajoId) || null;

      if (!trabajoActual) {
        throw new Error(t("teacher.trabajos.bookReview.notFound", { defaultValue: "No se encontro el trabajo para revisar" }));
      }

      const preguntasMapeadas: LibroPreguntaInput[] = (estado.preguntas || []).map((p, idx) => ({
        id: p.id,
        texto: p.texto,
        tipo: p.tipo,
        opciones: p.opciones || [],
        pagina_libro: p.pagina_libro ?? undefined,
        confianza_ia: p.confianza_ia ?? undefined,
        imagen_base64: p.imagen_base64 ?? undefined,
        imagen_fuente: p.imagen_fuente ?? undefined,
        respuesta_esperada_tipo: p.respuesta_esperada_tipo ?? undefined,
        placeholder: p.placeholder ?? undefined,
        orden: p.orden || idx + 1,
      }));

      const previousProgress = readReviewProgressSnapshot(trabajoActual.id);
      const boundedApproved = (previousProgress?.approvedQuestionIndexes || [])
        .filter((value) => Number.isInteger(value) && value >= 0 && value < preguntasMapeadas.length)
        .sort((a, b) => a - b);
      const firstPendingIndex = preguntasMapeadas.findIndex((_, idxPregunta) => !boundedApproved.includes(idxPregunta));
      const preferredIndex = typeof previousProgress?.currentQuestionIndex === "number"
        ? Math.max(0, Math.min(previousProgress.currentQuestionIndex, Math.max(0, preguntasMapeadas.length - 1)))
        : firstPendingIndex >= 0
          ? firstPendingIndex
          : 0;

      setReviewTrabajo(trabajoActual);
      setReviewPreguntas(preguntasMapeadas);
      setReviewNotas(estado.extraccion?.notas_revision || "");
      setReviewDraft({
        titulo: trabajoActual.titulo || "",
        descripcion: trabajoActual.descripcion || "",
        instrucciones: trabajoActual.instrucciones || "",
      });
      setReviewCurrentQuestionIndex(preferredIndex);
      setReviewApprovedQuestionIndexes(boundedApproved);
      setReviewDirty(false);
      setReviewQueueIds(ids);
      setReviewQueueIndex(index);
      setReviewOpen(true);
    } finally {
      setReviewLoading(false);
    }
  };

  const startSequentialReview = async (ids: string[]) => {
    const filteredIds = ids.filter(Boolean);
    if (filteredIds.length === 0) return;
    await loadReviewItem(filteredIds, 0);
  };

  const updateReviewPregunta = (index: number, patch: Partial<LibroPreguntaInput>) => {
    setReviewDirty(true);
    setReviewPreguntas((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const clearReviewPreguntaImage = (index: number) => {
    updateReviewPregunta(index, {
      imagen_base64: undefined,
      imagen_fuente: undefined,
      imagen_manual_override: true,
    });
  };

  const addReviewPregunta = () => {
    setReviewDirty(true);
    setReviewPreguntas((prev) => ([
      ...prev,
      {
        texto: "",
        tipo: "respuesta_corta",
        opciones: [],
        orden: prev.length + 1,
      },
    ]));
  };

  const removeReviewPregunta = (index: number) => {
    setReviewDirty(true);
    setReviewPreguntas((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, orden: i + 1 })));
    setReviewApprovedQuestionIndexes((prev) => prev.filter((item) => item !== index).map((item) => (item > index ? item - 1 : item)));
    setReviewCurrentQuestionIndex((prev) => {
      if (reviewPreguntas.length <= 1) return 0;
      if (prev > index) return prev - 1;
      return Math.min(prev, reviewPreguntas.length - 2);
    });
  };

  const normalizeReviewQuestions = (): LibroPreguntaInput[] => {
    return reviewPreguntas
      .map((pregunta, idx) => ({
        ...pregunta,
        texto: (pregunta.texto || "").trim(),
        orden: pregunta.orden > 0 ? pregunta.orden : idx + 1,
      }))
      .filter((pregunta) => pregunta.texto.length > 0);
  };

  const persistCurrentReviewSnapshot = (
    trabajoId: string,
    approvedIndexes: number[],
    currentIndex: number,
  ) => {
    saveReviewProgressSnapshot(trabajoId, {
      currentQuestionIndex: currentIndex,
      approvedQuestionIndexes: approvedIndexes,
      updatedAt: new Date().toISOString(),
    });
  };

  const saveReviewProgress = async (options?: { silent?: boolean; approveCurrent?: boolean }): Promise<boolean> => {
    if (!reviewTrabajo) return false;
    const preguntasValidas = normalizeReviewQuestions();

    if (!reviewDraft.titulo.trim()) {
      toast.error(t("teacher.trabajos.bookReview.titleRequired", { defaultValue: "El titulo es obligatorio para aprobar" }));
      return false;
    }

    if (preguntasValidas.length === 0) {
      toast.error(t("teacher.trabajos.libro.error.minQuestion", { defaultValue: "Debes conservar al menos una pregunta" }));
      return false;
    }

    setReviewSaving(true);
    try {
      await updateTrabajo(reviewTrabajo.id, {
        titulo: reviewDraft.titulo.trim(),
        descripcion: reviewDraft.descripcion.trim() || undefined,
        instrucciones: reviewDraft.instrucciones.trim() || undefined,
      });

      await revisarLibro(reviewTrabajo.id, {
        preguntas: preguntasValidas,
        aprobar: false,
        notas_revision: reviewNotas.trim() || undefined,
      });

      let approvedIndexes = [...reviewApprovedQuestionIndexes];
      if (options?.approveCurrent && reviewPreguntas.length > 0) {
        const currentIndex = Math.max(0, Math.min(reviewCurrentQuestionIndex, reviewPreguntas.length - 1));
        if (!approvedIndexes.includes(currentIndex)) {
          approvedIndexes = [...approvedIndexes, currentIndex].sort((a, b) => a - b);
          setReviewApprovedQuestionIndexes(approvedIndexes);
        }
      }

      persistCurrentReviewSnapshot(reviewTrabajo.id, approvedIndexes, reviewCurrentQuestionIndex);
      setReviewDirty(false);
      if (!options?.silent) {
        toast.success(
          options?.approveCurrent
            ? t("teacher.trabajos.bookReview.questionApproved", { defaultValue: "Pregunta verificada y guardada" })
            : t("teacher.trabajos.bookReview.progressSaved", { defaultValue: "Progreso guardado" }),
        );
      }
      await loadData();
      return true;
    } catch (err) {
      toast.error(normalizeError(err));
      return false;
    } finally {
      setReviewSaving(false);
    }
  };

  const moveToReviewQuestion = async (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= reviewPreguntas.length) return;
    if (reviewDirty) {
      const saved = await saveReviewProgress({ silent: true });
      if (!saved) return;
    }
    setReviewCurrentQuestionIndex(nextIndex);
    if (reviewTrabajo) {
      persistCurrentReviewSnapshot(reviewTrabajo.id, reviewApprovedQuestionIndexes, nextIndex);
    }
  };

  const approveCurrentReviewQuestion = async () => {
    const ok = await saveReviewProgress({ approveCurrent: true });
    if (!ok) return;
    if (reviewCurrentQuestionIndex < reviewPreguntas.length - 1) {
      await moveToReviewQuestion(reviewCurrentQuestionIndex + 1);
    }
  };

  const requestCloseSequentialReview = async () => {
    if (reviewDirty) {
      const saved = await saveReviewProgress({ silent: true });
      if (!saved) {
        const closeWithoutSaving = window.confirm(
          t("teacher.trabajos.bookReview.discardChangesConfirm", { defaultValue: "No se pudo guardar el progreso. ¿Deseas cerrar y descartar cambios no guardados?" }),
        );
        if (!closeWithoutSaving) return;
      }
    }
    closeSequentialReview();
  };

  const goNextReviewItem = async () => {
    const nextIndex = reviewQueueIndex + 1;
    if (nextIndex >= reviewQueueIds.length) {
      closeSequentialReview();
      await loadData();
      toast.success(t("teacher.trabajos.bookReview.completed", { defaultValue: "Revision secuencial completada" }));
      return;
    }

    await loadReviewItem(reviewQueueIds, nextIndex);
  };

  const finishAndPublishCurrentReview = async () => {
    if (!reviewTrabajo) return;

    const isAllApproved = reviewPreguntas.length > 0 && reviewApprovedQuestionIndexes.length >= reviewPreguntas.length;
    if (!isAllApproved) {
      toast.error(t("teacher.trabajos.bookReview.mustApproveAll", { defaultValue: "Debes verificar todas las preguntas antes de finalizar" }));
      return;
    }

    if (reviewDirty) {
      const saved = await saveReviewProgress({ silent: true });
      if (!saved) return;
    }

    const preguntasValidas = normalizeReviewQuestions();

    setReviewSaving(true);
    try {
      await updateTrabajo(reviewTrabajo.id, {
        titulo: reviewDraft.titulo.trim(),
        descripcion: reviewDraft.descripcion.trim() || undefined,
        instrucciones: reviewDraft.instrucciones.trim() || undefined,
      });

      await revisarLibro(reviewTrabajo.id, {
        preguntas: preguntasValidas,
        aprobar: true,
        notas_revision: reviewNotas.trim() || undefined,
      });

      await confirmarLibro(reviewTrabajo.id, {
        publicar: true,
        notas_finales: t("teacher.trabajos.bookReview.autoPublished", { defaultValue: "Aprobado y publicado desde revision secuencial" }),
      });

      clearReviewProgressSnapshot(reviewTrabajo.id);

      await goNextReviewItem();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setReviewSaving(false);
    }
  };

  const skipAndContinueReview = async () => {
    if (reviewDirty) {
      const saved = await saveReviewProgress({ silent: true });
      if (!saved) return;
    }
    await goNextReviewItem();
  };

  const openCreateModal = () => {
    setEditingTrabajoId(null);
    setCreateMode("manual");
    setShowCreate(true);
  };

  const openEditModal = (trabajo: TrabajoRow) => {
    setEditingTrabajoId(trabajo.id);
    setCreateMode("manual");
    setLibroPages([]);
    setLibroFileName("");
    setLibroProgress((prev) => ({ ...prev, active: false }));
    setNewTrabajo((prev) => ({
      ...prev,
      titulo: trabajo.titulo || "",
      descripcion: trabajo.descripcion || "",
      instrucciones: trabajo.instrucciones || "",
      fecha_vencimiento: normalizeToDateTimeLocal(trabajo.fecha_vencimiento),
    }));
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!editingTrabajoId && !newTrabajo.leccion_id) {
      toast.error(t("teacher.trabajos.validation", { defaultValue: "Leccion y titulo son obligatorios" }));
      return;
    }

    const requiresManualTitle = editingTrabajoId !== null || createMode === "manual";
    if (requiresManualTitle && !newTrabajo.titulo.trim()) {
      toast.error(t("teacher.trabajos.validation", { defaultValue: "Leccion y titulo son obligatorios" }));
      return;
    }

    if (!editingTrabajoId && createMode === "libro" && libroPages.length === 0) {
      toast.error(t("teacher.trabajos.bookCreate.noPages", { defaultValue: "Carga un libro con paginas validas antes de crear" }));
      return;
    }

    setSaving(true);
    try {
      const createdBookTrabajoIds: string[] = [];

      if (editingTrabajoId) {
        const payload: UpdateTrabajoRequest = {
          titulo: newTrabajo.titulo.trim(),
          descripcion: newTrabajo.descripcion || undefined,
          instrucciones: newTrabajo.instrucciones || undefined,
          fecha_vencimiento: newTrabajo.fecha_vencimiento || undefined,
        };
        await updateTrabajo(editingTrabajoId, payload);
      } else if (createMode === "manual") {
        await createTrabajo({
          leccion_id: newTrabajo.leccion_id,
          titulo: newTrabajo.titulo.trim(),
          descripcion: newTrabajo.descripcion || undefined,
          instrucciones: newTrabajo.instrucciones || undefined,
          fecha_vencimiento: newTrabajo.fecha_vencimiento || undefined,
        });
      } else {
        const leccionTitulo = lecciones.find((item) => item.id === newTrabajo.leccion_id)?.titulo || "Leccion";
        const libroBase = libroFileName ? libroFileName.replace(/\.[^.]+$/, "") : "Libro";
        const parsedPages = libroPages.filter((chunk) => chunk.text.trim().length > 0);
        const candidatePages = parsedPages.filter((chunk) => isLikelyExercisePage(chunk.text));
        
        // Safeguard: si < 30% de páginas pasan el filtro, usar TODAS (previene casos donde se rechaza demasiado)
        const minCandidatesThreshold = Math.ceil(parsedPages.length * 0.3);
        const shouldUseCandidates = candidatePages.length >= minCandidatesThreshold;
        const pagesForTrabajos = shouldUseCandidates ? candidatePages : parsedPages;
        const skippedByRegex = shouldUseCandidates ? parsedPages.length - candidatePages.length : 0;

        if (pagesForTrabajos.length === 0) {
          toast.error(t("teacher.trabajos.bookCreate.noExercisePages", { defaultValue: "No se detectaron paginas con ejercicios o preguntas" }));
          return;
        }

        console.info("[Libro/Create] parsed pages diagnostics", {
          totalParsed: parsedPages.length,
          candidatePages: candidatePages.length,
          minCandidatesThreshold,
          shouldUseCandidates,
          usedForTrabajos: pagesForTrabajos.length,
          skippedByRegex,
          lastCandidatePage: candidatePages[candidatePages.length - 1]?.page ?? null,
          lastParsedPage: parsedPages[parsedPages.length - 1]?.page ?? null,
          filterPassed: `${((candidatePages.length / parsedPages.length) * 100).toFixed(1)}%`,
        });

        setLibroProgress({
          active: true,
          total: pagesForTrabajos.length,
          processed: 0,
          created: 0,
          skippedByRegex,
          skippedByIA: 0,
          failed: 0,
          currentPage: pagesForTrabajos[0]?.page ?? null,
          currentPhase: "analizando",
        });

        let createdCount = 0;
        let skippedByIACount = 0;
        let failedCount = 0;

        const trabajosPorPagina: Array<{ trabajoId: string; page: number }> = [];
        const maxPage = Math.max(...parsedPages.map((chunk) => chunk.page));
        const fullMarkedContent = buildMarkedContentFromChunks(parsedPages);
        const contentHash = await sha256Hex(normalizeForResourceHash(fullMarkedContent));
        const imagenesPorPagina = Object.fromEntries(
          parsedPages
            .filter((chunk) => Boolean(chunk.page_image_base64))
            .map((chunk) => [String(chunk.page), chunk.page_image_base64 as string]),
        );
        const imagenesMetadataPorPagina = Object.fromEntries(
          parsedPages
            .filter((chunk) => Boolean(chunk.page_image_metadata))
            .map((chunk) => [String(chunk.page), chunk.page_image_metadata as PdfPaginaMetadata]),
        );

        for (const [i, chunk] of pagesForTrabajos.entries()) {
          try {
            setLibroProgress((prev) => ({
              ...prev,
              currentPage: chunk.page,
              currentPhase: "creando",
            }));

            const trabajo = await createTrabajo({
              leccion_id: newTrabajo.leccion_id,
              titulo: `${leccionTitulo} - ${libroBase} - Pagina ${chunk.page}`,
              descripcion: `Generado automaticamente desde libro (${libroBase}), pagina ${chunk.page}`,
              instrucciones: "Responde las preguntas basadas en el contenido de la pagina asignada.",
              fecha_vencimiento: newTrabajo.fecha_vencimiento || undefined,
            });

            trabajosPorPagina.push({ trabajoId: trabajo.id, page: chunk.page });
          } catch {
            failedCount += 1;
          } finally {
            const processed = i + 1;
            setLibroProgress((prev) => ({
              ...prev,
              processed,
              created: trabajosPorPagina.length,
              skippedByIA: skippedByIACount,
              failed: failedCount,
            }));
          }
        }

        if (trabajosPorPagina.length === 0) {
          throw new Error("No se pudieron crear trabajos para el libro seleccionado");
        }

        const seed = trabajosPorPagina[0];
        if (!seed) {
          throw new Error("No se encontró trabajo base para extracción");
        }

        setLibroProgress((prev) => ({
          ...prev,
          currentPage: seed.page,
          currentPhase: "extrayendo",
        }));

        // Check if content is too large and needs to be split into blocks
        const contentSize = fullMarkedContent.length;
        let allPreguntasExtraidas: LibroPreguntaInput[] = [];
        
        if (contentSize > 2 * 1024 * 1024) {
          // Content is larger than 2MB, split into blocks
          const pageBlocks = divideChunksIntoBlocks(parsedPages, 50);
          
          for (let blockIdx = 0; blockIdx < pageBlocks.length; blockIdx++) {
            const blockPages = pageBlocks[blockIdx];
            if (!blockPages || blockPages.length === 0) continue;
            
            const blockContent = buildMarkedContentFromChunks(blockPages);
            
            // Use first trabajo for first block, others for subsequent blocks
            const targetTrabajoId = blockIdx === 0 ? seed.trabajoId : trabajosPorPagina[blockIdx]?.trabajoId || seed.trabajoId;
            const targetPage = blockPages[0]?.page ?? seed.page;
            const blockMaxPage = blockPages[blockPages.length - 1]?.page ?? maxPage;
            
            try {
              const extracted = await extractLibro(targetTrabajoId, {
                archivo_url: libroFileName || undefined,
                contenido: blockContent,
                hash_contenido: contentHash, // Use same hash for all blocks
                pagina_inicio: blockPages[0]?.page,
                pagina_fin: blockMaxPage,
                idioma: libroIdioma,
                max_preguntas: Math.min(MAX_BOOK_QUESTIONS_PER_EXTRACT, Math.max(libroMaxPreguntas, libroMaxPreguntas * blockPages.length)),
                imagenes_por_pagina: Object.keys(imagenesPorPagina).length > 0 ? imagenesPorPagina : undefined,
                imagenes_metadata_por_pagina: Object.keys(imagenesMetadataPorPagina).length > 0 ? imagenesMetadataPorPagina : undefined,
              });
              
              const blockPreguntas: LibroPreguntaInput[] = (extracted.preguntas || []).map((p, idx) => ({
                id: p.id,
                texto: p.texto,
                tipo: p.tipo,
                opciones: p.opciones || [],
                pagina_libro: p.pagina_libro ?? undefined,
                confianza_ia: p.confianza_ia ?? undefined,
                imagen_base64: p.imagen_base64 ?? undefined,
                imagen_fuente: p.imagen_fuente ?? undefined,
                respuesta_esperada_tipo: p.respuesta_esperada_tipo ?? undefined,
                placeholder: p.placeholder ?? undefined,
                orden: allPreguntasExtraidas.length + idx + 1,
              }));
              
              allPreguntasExtraidas = allPreguntasExtraidas.concat(blockPreguntas);
              
              setLibroProgress((prev) => ({
                ...prev,
                currentPage: targetPage,
                currentPhase: "extrayendo",
              }));
            } catch (blockErr) {
              toast.error(`Error extrayendo bloque ${blockIdx + 1}: ${normalizeError(blockErr)}`);
              throw blockErr;
            }
          }
        } else {
          // Content is small enough to process in one request
          const extracted = await extractLibro(seed.trabajoId, {
            archivo_url: libroFileName || undefined,
            contenido: fullMarkedContent,
            hash_contenido: contentHash,
            pagina_inicio: parsedPages[0]?.page,
            pagina_fin: maxPage,
            idioma: libroIdioma,
            max_preguntas: Math.min(MAX_BOOK_QUESTIONS_PER_EXTRACT, Math.max(libroMaxPreguntas, libroMaxPreguntas * pagesForTrabajos.length)),
            imagenes_por_pagina: Object.keys(imagenesPorPagina).length > 0 ? imagenesPorPagina : undefined,
            imagenes_metadata_por_pagina: Object.keys(imagenesMetadataPorPagina).length > 0 ? imagenesMetadataPorPagina : undefined,
          });
          
          allPreguntasExtraidas = (extracted.preguntas || []).map((p, idx) => ({
            id: p.id,
            texto: p.texto,
            tipo: p.tipo,
            opciones: p.opciones || [],
            pagina_libro: p.pagina_libro ?? undefined,
            confianza_ia: p.confianza_ia ?? undefined,
            imagen_base64: p.imagen_base64 ?? undefined,
            imagen_fuente: p.imagen_fuente ?? undefined,
            respuesta_esperada_tipo: p.respuesta_esperada_tipo ?? undefined,
            placeholder: p.placeholder ?? undefined,
            orden: p.orden || idx + 1,
          }));
        }

        let preguntasLibro = sanitizeExtractedQuestions(allPreguntasExtraidas);
        if (preguntasLibro.length === 0) {
          preguntasLibro = normalizeExtractedQuestions(allPreguntasExtraidas);
        }

        if (preguntasLibro.length === 0) {
          for (const item of trabajosPorPagina) {
            try {
              await deleteTrabajo(item.trabajoId);
            } catch {
              // Best effort cleanup when extraction yields no usable questions.
            }
          }
          throw new Error("No se pudieron extraer preguntas del libro. Prueba ampliar el rango de páginas o revisar la calidad del texto.");
        }

        const preguntasPorPagina = new Map<number, LibroPreguntaInput[]>();
        for (const pregunta of preguntasLibro) {
          const page = pregunta.pagina_libro;
          if (!page) continue;
          const current = preguntasPorPagina.get(page) || [];
          current.push(pregunta);
          preguntasPorPagina.set(page, current);
        }

        for (const [i, item] of trabajosPorPagina.entries()) {
          const pageQuestionsRaw = (preguntasPorPagina.get(item.page) || []).map((pregunta, idx) => ({
            ...pregunta,
            orden: idx + 1,
          }));

          if (pageQuestionsRaw.length === 0) {
            skippedByIACount += 1;
            try {
              await deleteTrabajo(item.trabajoId);
            } catch {
              // Best effort cleanup if page has no questions after extraction.
            }
          } else {
            if (item.trabajoId !== seed.trabajoId) {
              await extractLibro(item.trabajoId, {
                archivo_url: libroFileName || undefined,
                contenido: fullMarkedContent,
                hash_contenido: contentHash,
                pagina_inicio: parsedPages[0]?.page,
                pagina_fin: maxPage,
                idioma: libroIdioma,
                max_preguntas: Math.min(MAX_BOOK_QUESTIONS_PER_EXTRACT, Math.max(libroMaxPreguntas, libroMaxPreguntas * pagesForTrabajos.length)),
                imagenes_por_pagina: Object.keys(imagenesPorPagina).length > 0 ? imagenesPorPagina : undefined,
                imagenes_metadata_por_pagina: Object.keys(imagenesMetadataPorPagina).length > 0 ? imagenesMetadataPorPagina : undefined,
              });
            }

            setLibroProgress((prev) => ({
              ...prev,
              currentPage: item.page,
              currentPhase: "revisando",
            }));

            const revision = await revisarLibro(item.trabajoId, {
              preguntas: pageQuestionsRaw,
              aprobar: !libroRevisionManual,
              notas_revision: libroRevisionManual
                ? "Revision manual requerida desde nuevo trabajo por libro"
                : "Aprobacion automatica desde nuevo trabajo por libro",
            });

            if (!revision.preguntas || revision.preguntas.length === 0) {
              throw new Error("No se pudieron registrar preguntas individuales para el trabajo");
            }

            if (!libroRevisionManual) {
              setLibroProgress((prev) => ({
                ...prev,
                currentPage: item.page,
                currentPhase: "confirmando",
              }));

              const publicarAhora = libroPublicarAlCrear && pageQuestionsRaw.length >= libroMinPreguntasPublicar;

              await confirmarLibro(item.trabajoId, {
                publicar: publicarAhora,
                notas_finales: "Confirmacion automatica desde nuevo trabajo por libro",
              });
            }

            createdCount += 1;
            createdBookTrabajoIds.push(item.trabajoId);
          }

          setLibroProgress((prev) => ({
            ...prev,
            processed: i + 1,
            created: createdCount,
            skippedByIA: skippedByIACount,
            failed: failedCount,
          }));
        }

        setLibroProgress((prev) => ({
          ...prev,
          currentPhase: "finalizado",
          currentPage: null,
        }));
      }

      toast.success(editingTrabajoId
        ? t("teacher.trabajos.updated", { defaultValue: "Trabajo actualizado" })
        : createMode === "manual"
          ? t("teacher.trabajos.created", { defaultValue: "Trabajo creado" })
        : libroRevisionManual
          ? t("teacher.trabajos.bookCreate.createdBatchManual", { defaultValue: "Trabajos creados desde libro y enviados a revision manual" })
          : t("teacher.trabajos.bookCreate.createdBatch", { defaultValue: "Trabajos creados desde libro" }));

      const mustStartSequentialReview = !editingTrabajoId && createMode === "libro" && libroRevisionManual && createdBookTrabajoIds.length > 0;
      resetCreateState();
      await loadData();

      if (mustStartSequentialReview) {
        await startSequentialReview(createdBookTrabajoIds);
      }
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const onUploadLibro = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("teacher.trabajos.libro.error.maxSize", { defaultValue: "Archivo demasiado grande (max 50MB)" }));
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "txt"].includes(extension)) {
      toast.error(t("teacher.trabajos.libro.error.unsupportedType", { defaultValue: "Formato no soportado. Usa PDF, DOCX o TXT." }));
      return;
    }

    if (libroPageEnd !== "" && libroPageStart > Number(libroPageEnd)) {
      toast.error(t("teacher.trabajos.libro.error.pageRange", { defaultValue: "Rango de paginas invalido" }));
      return;
    }

    setSaving(true);
    try {
      let chunks: PageChunk[] = [];
      if (extension === "pdf") {
        chunks = await parsePdfPages(file, libroPageStart, libroPageEnd === "" ? undefined : Number(libroPageEnd));
      } else if (extension === "docx") {
        chunks = await parseDocxPages(file, libroPageStart);
      } else {
        chunks = await parseTxtPages(file, libroPageStart);
      }

      if (chunks.length === 0) {
        toast.error(t("teacher.trabajos.bookCreate.noPages", { defaultValue: "Carga un libro con paginas validas antes de crear" }));
        return;
      }

      setLibroFileName(file.name);
      setLibroPages(chunks);
      toast.success(t("teacher.trabajos.bookCreate.loaded", { defaultValue: "Libro cargado correctamente" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePublicar = async (trabajoId: string) => {
    if (!confirm(t("teacher.trabajos.confirmPublish", { defaultValue: "Deseas publicar este trabajo?" }))) {
      return;
    }
    try {
      await publicarTrabajo(trabajoId);
      toast.success(t("teacher.trabajos.published", { defaultValue: "Trabajo publicado" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const handleCerrar = async (trabajoId: string) => {
    if (!confirm(t("teacher.trabajos.confirmClose", { defaultValue: "Deseas cerrar este trabajo?" }))) {
      return;
    }
    try {
      await cerrarTrabajo(trabajoId);
      toast.success(t("teacher.trabajos.closed", { defaultValue: "Trabajo cerrado" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const handleEliminar = async (trabajoId: string) => {
    if (!confirm(t("teacher.trabajos.confirmDelete", { defaultValue: "Deseas eliminar este trabajo? Esta accion no se puede deshacer." }))) {
      return;
    }
    try {
      await deleteTrabajo(trabajoId);
      toast.success(t("teacher.trabajos.deleted", { defaultValue: "Trabajo eliminado" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const reviewCurrentQuestion = reviewPreguntas[reviewCurrentQuestionIndex] || null;
  const reviewApprovedCount = reviewApprovedQuestionIndexes.length;
  const reviewAllQuestionsApproved = reviewPreguntas.length > 0 && reviewApprovedCount >= reviewPreguntas.length;
  const reviewCurrentQuestionApproved = reviewApprovedQuestionIndexes.includes(reviewCurrentQuestionIndex);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{t("teacher.trabajos.title", { defaultValue: "Gestion de Trabajos" })}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/teacher/trabajos/analytics")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <BarChart3 size={16} />
            {t("teacher.trabajos.analytics.nav", { defaultValue: "Analytics v2" })}
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            {t("teacher.trabajos.new", { defaultValue: "Nuevo Trabajo" })}
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("teacher.trabajos.search", { defaultValue: "Buscar por titulo, leccion o estado" })}
        />
      </div>

      {pendingManualReviewTrabajos.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold text-amber-900">
                {t("teacher.trabajos.bookReview.queueTitle", { defaultValue: "Cola de revision manual" })}
              </h2>
              <p className="text-xs text-amber-800 mt-1">
                {t("teacher.trabajos.bookReview.queueHint", {
                  defaultValue: "Estos trabajos no se publican ni aparecen en la lista principal hasta completar su revision.",
                })}
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              {t("teacher.trabajos.bookReview.pendingCount", {
                defaultValue: "Pendientes: {{count}}",
                count: pendingManualReviewTrabajos.length,
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingManualReviewTrabajos.map((trabajo) => (
              <div key={trabajo.id} className="bg-white rounded-lg shadow p-4 border border-amber-200">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{trabajo.titulo}</h3>
                    <p className="text-xs text-gray-500 mt-1">{trabajo.leccion_titulo}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                    {t("teacher.trabajos.bookReview.pending", { defaultValue: "Pendiente" })}
                  </span>
                </div>

                {trabajo.descripcion && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{trabajo.descripcion}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => { void startSequentialReview([trabajo.id]); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"
                  >
                    <CheckCircle2 size={14} />
                    {t("teacher.trabajos.verifyBook", { defaultValue: "Verificar libro" })}
                  </button>

                  <button
                    onClick={() => openEditModal(trabajo)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Pencil size={14} />
                    {t("teacher.trabajos.edit", { defaultValue: "Editar" })}
                  </button>

                  <button
                    onClick={() => handleEliminar(trabajo.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
                  >
                    <Trash2 size={14} />
                    {t("teacher.trabajos.delete", { defaultValue: "Eliminar" })}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleTrabajos.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-2 text-gray-300" />
          {t("teacher.trabajos.empty", { defaultValue: "No hay trabajos registrados" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleTrabajos.map((trabajo) => (
            <div key={trabajo.id} className="bg-white rounded-lg shadow p-4 border border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{trabajo.titulo}</h3>
                  <p className="text-xs text-gray-500 mt-1">{trabajo.leccion_titulo}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${trabajo.estado === "publicado" ? "bg-emerald-100 text-emerald-700" : trabajo.estado === "cerrado" ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-700"}`}>
                  {trabajo.estado}
                </span>
              </div>

              {trabajo.descripcion && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{trabajo.descripcion}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                {trabajo.estado === "borrador" && (
                  <button
                    onClick={() => handlePublicar(trabajo.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <SendHorizontal size={14} />
                    {t("teacher.trabajos.publish", { defaultValue: "Publicar" })}
                  </button>
                )}

                {trabajo.estado !== "cerrado" && (
                  <button
                    onClick={() => handleCerrar(trabajo.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-gray-700 text-white hover:bg-gray-800"
                  >
                    <XCircle size={14} />
                    {t("teacher.trabajos.close", { defaultValue: "Cerrar" })}
                  </button>
                )}

                <button
                  onClick={() => navigate(`/teacher/trabajos/${trabajo.id}/calificar`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  <CheckCircle2 size={14} />
                  {t("teacher.trabajos.grade", { defaultValue: "Calificar" })}
                </button>

                <button
                  onClick={() => navigate(`/teacher/trabajos/${trabajo.id}/preguntas`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-slate-700 text-white hover:bg-slate-800"
                >
                  <ClipboardList size={14} />
                  Preguntas
                </button>

                <button
                  onClick={() => openEditModal(trabajo)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Pencil size={14} />
                  {t("teacher.trabajos.edit", { defaultValue: "Editar" })}
                </button>

                {trabajo.extraido_de_libro && trabajo.id_extraccion && trabajo.estado === "borrador" && (
                  <button
                    onClick={() => { void startSequentialReview([trabajo.id]); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"
                  >
                    <CheckCircle2 size={14} />
                    {t("teacher.trabajos.verifyBook", { defaultValue: "Verificar libro" })}
                  </button>
                )}

                <button
                  onClick={() => navigate(`/teacher/trabajos/${trabajo.id}/reportes`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-cyan-600 text-white hover:bg-cyan-700"
                >
                  <BarChart3 size={14} />
                  {t("teacher.trabajos.reports", { defaultValue: "Reportes" })}
                </button>

                <button
                  onClick={() => navigate(`/teacher/recursos-personales?trabajoId=${trabajo.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Library size={14} />
                  Recursos personales
                </button>

                <button
                  onClick={() => handleEliminar(trabajo.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
                >
                  <Trash2 size={14} />
                  {t("teacher.trabajos.delete", { defaultValue: "Eliminar" })}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { if (!saving) resetCreateState(); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingTrabajoId
                  ? t("teacher.trabajos.editTitle", { defaultValue: "Editar trabajo" })
                  : t("teacher.trabajos.createTitle", { defaultValue: "Crear trabajo" })}
              </h2>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {!editingTrabajoId && (
                <div className="grid grid-cols-2 gap-2">
              <button
                className={`px-3 py-2 rounded border text-sm ${createMode === "manual" ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
                onClick={() => setCreateMode("manual")}
                type="button"
              >
                {t("teacher.trabajos.bookCreate.manualMode", { defaultValue: "Manual" })}
              </button>
              <button
                className={`px-3 py-2 rounded border text-sm ${createMode === "libro" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white"}`}
                onClick={() => setCreateMode("libro")}
                type="button"
              >
                {t("teacher.trabajos.bookCreate.bookMode", { defaultValue: "Desde libro" })}
              </button>
                </div>
              )}

              <div className="space-y-3">
              {!editingTrabajoId && (
                <div>
                  <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.leccion", { defaultValue: "Leccion" })}</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={newTrabajo.leccion_id}
                    onChange={(e) => setNewTrabajo((prev) => ({ ...prev, leccion_id: e.target.value }))}
                  >
                    {lecciones.map((leccion) => (
                      <option key={leccion.id} value={leccion.id}>{leccion.titulo}</option>
                    ))}
                  </select>
                </div>
              )}

              {(editingTrabajoId || createMode === "manual") && (
                <>
              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.titulo", { defaultValue: "Titulo" })}</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={newTrabajo.titulo}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, titulo: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.descripcion", { defaultValue: "Descripcion" })}</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={2}
                  value={newTrabajo.descripcion || ""}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, descripcion: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.instrucciones", { defaultValue: "Instrucciones" })}</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={3}
                  value={newTrabajo.instrucciones || ""}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, instrucciones: e.target.value }))}
                />
              </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.fechaVencimiento", { defaultValue: "Fecha de vencimiento" })}</label>
                <input
                  type="datetime-local"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={newTrabajo.fecha_vencimiento || ""}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, fecha_vencimiento: e.target.value }))}
                />
              </div>

              {!editingTrabajoId && createMode === "libro" && (
                <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/50 space-y-3">
                  <p className="text-sm font-medium text-indigo-800">
                    {t("teacher.trabajos.bookCreate.help", { defaultValue: "Se creara un trabajo por pagina con preguntas extraidas automaticamente" })}
                  </p>

                  <label className="text-sm block">
                    {t("teacher.trabajos.libro.uploadFile", { defaultValue: "Subir archivo (PDF, DOCX, TXT)" })}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onUploadLibro(file);
                      }}
                    />
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className="text-sm">
                      {t("teacher.trabajos.libro.pageStart", { defaultValue: "Pagina inicio" })}
                      <input
                        type="number"
                        min={1}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                        value={libroPageStart}
                        onChange={(e) => setLibroPageStart(Number(e.target.value || 1))}
                      />
                    </label>

                    <label className="text-sm">
                      {t("teacher.trabajos.libro.pageEnd", { defaultValue: "Pagina fin (opcional)" })}
                      <input
                        type="number"
                        min={1}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                        value={libroPageEnd}
                        onChange={(e) => setLibroPageEnd(e.target.value ? Number(e.target.value) : "")}
                      />
                    </label>

                    <label className="text-sm">
                      {t("teacher.trabajos.libro.maxQuestions", { defaultValue: "Maximo de preguntas" })}
                      <input
                        type="number"
                        min={1}
                        max={30}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                        value={libroMaxPreguntas}
                        onChange={(e) => setLibroMaxPreguntas(Number(e.target.value || 8))}
                      />
                    </label>
                  </div>

                  <label className="text-sm block">
                    {t("teacher.trabajos.libro.language", { defaultValue: "Idioma" })}
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                      value={libroIdioma}
                      onChange={(e) => setLibroIdioma(e.target.value || "es")}
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={libroRevisionManual}
                      onChange={(e) => setLibroRevisionManual(e.target.checked)}
                    />
                    {t("teacher.trabajos.bookCreate.manualReviewMode", { defaultValue: "Requerir verificacion manual de preguntas" })}
                  </label>

                  {libroRevisionManual && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      {t("teacher.trabajos.bookCreate.manualReviewHelp", { defaultValue: "Los trabajos se crearan en borrador y quedaran pendientes para revision en \"Verificar libro\"." })}
                    </p>
                  )}

                  {!libroRevisionManual && (
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={libroPublicarAlCrear}
                        onChange={(e) => setLibroPublicarAlCrear(e.target.checked)}
                      />
                      {t("teacher.trabajos.bookCreate.publishOnCreate", { defaultValue: "Publicar automaticamente cada trabajo creado" })}
                    </label>
                  )}

                  {!libroRevisionManual && libroPublicarAlCrear && (
                    <label className="text-sm block">
                      {t("teacher.trabajos.bookCreate.minQuestionsToPublish", { defaultValue: "Minimo de preguntas para publicar" })}
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                        value={libroMinPreguntasPublicar}
                        onChange={(e) => setLibroMinPreguntasPublicar(Math.max(1, Number(e.target.value || 1)))}
                      />
                    </label>
                  )}

                  <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
                    {libroFileName
                      ? `${t("teacher.trabajos.libro.fileSelected", { defaultValue: "Archivo seleccionado" })}: ${libroFileName} · ${t("teacher.trabajos.bookCreate.pagesDetected", { defaultValue: "Paginas detectadas" })}: ${libroPages.length}`
                      : t("teacher.trabajos.bookCreate.noFile", { defaultValue: "Aun no se ha cargado archivo" })}
                  </div>

                  {libroProgress.active && libroProgress.total > 0 && (
                    <div className="bg-white border border-gray-200 rounded p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-700">
                        <span>{t("teacher.trabajos.bookCreate.progressTitle", { defaultValue: "Progreso de creacion" })}</span>
                        <span>{Math.round((libroProgress.processed / libroProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all"
                          style={{ width: `${Math.round((libroProgress.processed / libroProgress.total) * 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600">
                        {t("teacher.trabajos.bookCreate.progressDetail", {
                          defaultValue: "Fase: {{phase}} · Pagina: {{page}} · Procesadas: {{processed}}/{{total}}",
                          phase: libroProgress.currentPhase,
                          page: libroProgress.currentPage ?? "-",
                          processed: libroProgress.processed,
                          total: libroProgress.total,
                        })}
                      </div>
                      <div className="text-xs text-gray-700">
                        {t("teacher.trabajos.bookCreate.progressSummary", {
                          defaultValue: "Creadas: {{created}} · Omitidas (regex): {{regex}} · Omitidas (IA): {{ia}} · Fallidas: {{failed}}",
                          created: libroProgress.created,
                          regex: libroProgress.skippedByRegex,
                          ia: libroProgress.skippedByIA,
                          failed: libroProgress.failed,
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-white flex justify-end gap-2">
              <button className="px-4 py-2 rounded border disabled:opacity-50" onClick={resetCreateState} disabled={saving}>
                {t("common.cancel", { defaultValue: "Cancelar" })}
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? t("common.saving", { defaultValue: "Guardando..." }) : editingTrabajoId ? t("teacher.trabajos.edit", { defaultValue: "Editar" }) : t("common.save", { defaultValue: "Guardar" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { if (!reviewSaving) { void requestCloseSequentialReview(); } }}>
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{t("teacher.trabajos.bookReview.title", { defaultValue: "Revision secuencial de trabajos de libro" })}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {t("teacher.trabajos.bookReview.progress", {
                  defaultValue: "Trabajo {{current}} de {{total}}",
                  current: reviewQueueIndex + 1,
                  total: reviewQueueIds.length,
                })}
              </p>
            </div>

            {reviewLoading || !reviewTrabajo ? (
              <div className="p-6 flex items-center justify-center min-h-[220px]">
                <Loader2 size={28} className="animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="p-5 overflow-y-auto space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="text-sm block">
                    {t("teacher.trabajos.titulo", { defaultValue: "Titulo" })}
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                      value={reviewDraft.titulo}
                      onChange={(e) => {
                        setReviewDirty(true);
                        setReviewDraft((prev) => ({ ...prev, titulo: e.target.value }));
                      }}
                    />
                  </label>

                  <label className="text-sm block">
                    {t("teacher.trabajos.instrucciones", { defaultValue: "Instrucciones" })}
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                      value={reviewDraft.instrucciones}
                      onChange={(e) => {
                        setReviewDirty(true);
                        setReviewDraft((prev) => ({ ...prev, instrucciones: e.target.value }));
                      }}
                    />
                  </label>
                </div>

                <label className="text-sm block">
                  {t("teacher.trabajos.descripcion", { defaultValue: "Descripcion" })}
                  <textarea
                    rows={2}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={reviewDraft.descripcion}
                    onChange={(e) => {
                      setReviewDirty(true);
                      setReviewDraft((prev) => ({ ...prev, descripcion: e.target.value }));
                    }}
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {t("teacher.trabajos.libro.reviewTitle", { defaultValue: "Revisar preguntas" })}
                  </h3>
                  <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-1">
                    {t("teacher.trabajos.bookReview.questionProgress", {
                      defaultValue: "Verificadas: {{approved}} / {{total}}",
                      approved: reviewApprovedCount,
                      total: reviewPreguntas.length,
                    })}
                  </div>
                </div>

                {reviewPreguntas.length === 0 || !reviewCurrentQuestion ? (
                  <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4">
                    {t("teacher.trabajos.libro.noQuestions", { defaultValue: "Aun no hay preguntas. Ejecuta la extraccion primero." })}
                  </div>
                ) : (
                  <div className="space-y-3 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        {t("teacher.trabajos.libro.question", { defaultValue: "Pregunta" })} {reviewCurrentQuestionIndex + 1} / {reviewPreguntas.length}
                      </div>
                      <div className="flex items-center gap-2">
                        {reviewCurrentQuestionApproved ? (
                          <span className="text-xs bg-emerald-100 text-emerald-700 rounded px-2 py-1">
                            {t("teacher.trabajos.bookReview.approved", { defaultValue: "Verificada" })}
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-1">
                            {t("teacher.trabajos.bookReview.pending", { defaultValue: "Pendiente" })}
                          </span>
                        )}
                        <button
                          onClick={() => removeReviewPregunta(reviewCurrentQuestionIndex)}
                          className="text-xs text-rose-600 hover:underline"
                          type="button"
                        >
                          {t("common.delete", { defaultValue: "Eliminar" })}
                        </button>
                      </div>
                    </div>

                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
                      rows={3}
                      value={reviewCurrentQuestion.texto}
                      onChange={(e) => updateReviewPregunta(reviewCurrentQuestionIndex, { texto: e.target.value })}
                    />

                    {reviewCurrentQuestion.imagen_base64 && (
                      <div className="mb-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                        <img
                          src={reviewCurrentQuestion.imagen_base64}
                          alt={t("teacher.trabajos.libro.questionImage", { defaultValue: "Imagen asociada a la pregunta" })}
                          className="w-full max-h-56 object-contain rounded border border-gray-200 bg-white"
                          loading="lazy"
                        />
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => clearReviewPreguntaImage(reviewCurrentQuestionIndex)}
                            className="px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            {t("teacher.trabajos.libro.removeImage", { defaultValue: "Quitar imagen" })}
                          </button>
                          <span className="text-xs text-gray-500">
                            {t("teacher.trabajos.libro.imageSource", { defaultValue: "Fuente" })}: {reviewCurrentQuestion.imagen_fuente || "-"}
                          </span>
                        </div>
                      </div>
                    )}

                    {looksLikeCompositeQuestion(reviewCurrentQuestion.texto) && (
                      <p className="text-xs text-amber-700 mb-2">
                        {t("teacher.trabajos.libro.compositeWarning", { defaultValue: "Parece contener varias preguntas. Sepáralas para guardarlas como items individuales." })}
                      </p>
                    )}

                    <div className="grid md:grid-cols-4 gap-2 text-sm">
                      <label>
                        {t("teacher.trabajos.libro.type", { defaultValue: "Tipo" })}
                        <select
                          className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                          value={reviewCurrentQuestion.tipo}
                          onChange={(e) => updateReviewPregunta(reviewCurrentQuestionIndex, { tipo: e.target.value as LibroPreguntaInput["tipo"] })}
                        >
                          <option value="opcion_multiple">{t("teacher.trabajos.libro.questionTypes.opcion_multiple", { defaultValue: "Opcion multiple" })}</option>
                          <option value="verdadero_falso">{t("teacher.trabajos.libro.questionTypes.verdadero_falso", { defaultValue: "Verdadero/Falso" })}</option>
                          <option value="respuesta_corta">{t("teacher.trabajos.libro.questionTypes.respuesta_corta", { defaultValue: "Respuesta corta" })}</option>
                          <option value="completar">{t("teacher.trabajos.libro.questionTypes.completar", { defaultValue: "Completar" })}</option>
                        </select>
                      </label>

                      <label>
                        {t("teacher.trabajos.libro.order", { defaultValue: "Orden" })}
                        <input
                          type="number"
                          min={1}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                          value={reviewCurrentQuestion.orden}
                          onChange={(e) => updateReviewPregunta(reviewCurrentQuestionIndex, { orden: Number(e.target.value || reviewCurrentQuestionIndex + 1) })}
                        />
                      </label>

                      <label>
                        {t("teacher.trabajos.libro.page", { defaultValue: "Pagina" })}
                        <input
                          type="number"
                          min={1}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                          value={reviewCurrentQuestion.pagina_libro || ""}
                          onChange={(e) => updateReviewPregunta(reviewCurrentQuestionIndex, { pagina_libro: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </label>

                      <label>
                        {t("teacher.trabajos.libro.confidence", { defaultValue: "Confianza IA" })}
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                          value={reviewCurrentQuestion.confianza_ia ?? ""}
                          onChange={(e) => updateReviewPregunta(reviewCurrentQuestionIndex, { confianza_ia: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </label>
                    </div>

                    <label className="text-sm block mt-2">
                      {t("teacher.trabajos.libro.options", { defaultValue: "Opciones (separadas por coma)" })}
                      <input
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={(reviewCurrentQuestion.opciones || []).join(", ")}
                        onChange={(e) => {
                          const opciones = e.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean);
                          updateReviewPregunta(reviewCurrentQuestionIndex, { opciones });
                        }}
                      />
                    </label>

                    <div className="flex justify-between gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded border disabled:opacity-50"
                        onClick={() => { void moveToReviewQuestion(reviewCurrentQuestionIndex - 1); }}
                        disabled={reviewSaving || reviewCurrentQuestionIndex <= 0}
                      >
                        {t("teacher.trabajos.bookReview.previous", { defaultValue: "Anterior" })}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded border disabled:opacity-50"
                        onClick={() => { void moveToReviewQuestion(reviewCurrentQuestionIndex + 1); }}
                        disabled={reviewSaving || reviewCurrentQuestionIndex >= reviewPreguntas.length - 1}
                      >
                        {t("teacher.trabajos.bookReview.next", { defaultValue: "Siguiente" })}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={addReviewPregunta}
                    className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                    type="button"
                  >
                    {t("teacher.trabajos.libro.addQuestion", { defaultValue: "Agregar pregunta" })}
                  </button>
                </div>

                <label className="text-sm block">
                  {t("teacher.trabajos.libro.reviewNotes", { defaultValue: "Notas de revision" })}
                  <textarea
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    rows={2}
                    value={reviewNotas}
                    onChange={(e) => {
                      setReviewDirty(true);
                      setReviewNotas(e.target.value);
                    }}
                  />
                </label>

                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                  {t("teacher.trabajos.bookReview.publishHint", { defaultValue: "Verifica y guarda cada pregunta. Al completar todas, finaliza para publicar el trabajo." })}
                </p>
              </div>
            )}

            <div className="p-5 border-t border-gray-100 bg-white flex flex-wrap justify-between gap-2">
              <button
                className="px-4 py-2 rounded border disabled:opacity-50"
                onClick={() => { void skipAndContinueReview(); }}
                disabled={reviewSaving || reviewLoading}
                type="button"
              >
                {reviewQueueIndex + 1 >= reviewQueueIds.length
                  ? t("teacher.trabajos.bookReview.finishWithoutApprove", { defaultValue: "Finalizar sin publicar" })
                  : t("teacher.trabajos.bookReview.skipContinue", { defaultValue: "Omitir y continuar" })}
              </button>

              <div className="flex flex-wrap gap-2">
                <button
                  className="px-4 py-2 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  onClick={() => { void saveReviewProgress(); }}
                  disabled={reviewSaving || reviewLoading}
                  type="button"
                >
                  {t("teacher.trabajos.bookReview.saveProgress", { defaultValue: "Guardar progreso" })}
                </button>

                <button
                  className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  onClick={() => { void approveCurrentReviewQuestion(); }}
                  disabled={reviewSaving || reviewLoading || reviewPreguntas.length === 0}
                  type="button"
                >
                  {t("teacher.trabajos.bookReview.approveQuestion", { defaultValue: "Verificar pregunta" })}
                </button>

                <button
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => { void finishAndPublishCurrentReview(); }}
                  disabled={reviewSaving || reviewLoading || !reviewAllQuestionsApproved}
                  type="button"
                >
                  {reviewSaving
                    ? t("common.saving", { defaultValue: "Guardando..." })
                    : t("teacher.trabajos.bookReview.finishPublish", { defaultValue: "Finalizar y publicar" })}
                </button>

                <button
                  className="px-4 py-2 rounded border disabled:opacity-50"
                  onClick={() => { void requestCloseSequentialReview(); }}
                  disabled={reviewSaving || reviewLoading}
                  type="button"
                >
                  {t("common.close", { defaultValue: "Cerrar" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
