import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Search, SendHorizontal, XCircle, CheckCircle2, ClipboardList, BarChart3, Trash2, Pencil, Library, FileText, Settings, BookOpen, GraduationCap, Users, UploadCloud, CheckCircle, Calendar, X, AlertCircle, HelpCircle } from "lucide-react";
import toast from "react-hot-toast";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extractRawText } from "mammoth";

import api from "@/shared/lib/api";
import { getMe } from "@/shared/lib/auth";
import { convertDocxToPdf, convertPptxToPdf } from "@/features/trabajos/services/trabajos";
import type { Curso, Leccion, Materia, Tema, Unidad } from "@/shared/types";
import type { CreateTrabajoRequest, LibroPreguntaInput, PdfPaginaMetadata, Trabajo, UpdateTrabajoRequest, EntregaConCalificacion } from "@/shared/types/trabajos";
import {
  confirmarLibro,
  createTrabajo,
  cerrarTrabajo,
  deleteTrabajo,
  extractLibro,
  getLibroEstado,
  listTrabajosByLeccion,
  listTrabajosByMateria,
  listEntregasByTrabajo,
  publicarTrabajo,
  revisarLibro,
  updateTrabajo,
} from "@/features/trabajos/services/trabajos";

interface LeccionOption {
  id: string;
  titulo: string;
}

interface TrabajoRow extends Trabajo {
  leccion_titulo?: string;
  materia_titulo?: string;
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
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [selectedMateria, setSelectedMateria] = useState<string>("");
  const [selectedCurso, setSelectedCurso] = useState<string>("");

  const [showCreate, setShowCreate] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedTrabajo, setSelectedTrabajo] = useState<TrabajoRow | null>(null);
  const [trabajoEntregas, setTrabajoEntregas] = useState<EntregaConCalificacion[]>([]);
  const [loadingEntregas, setLoadingEntregas] = useState(false);
  const [editingTrabajoId, setEditingTrabajoId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"manual" | "libro">("manual");
  const [filePreviewModal, setFilePreviewModal] = useState<{ url: string; type: 'pdf' | 'image' | 'other' } | null>(null);
  const [convertingFile, setConvertingFile] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedWorkType, setSelectedWorkType] = useState<"archivo" | "preguntas_abiertas" | "preguntas_cerradas">("preguntas_abiertas");
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
    leccion_id: undefined,
    materia_id: undefined,
    titulo: "",
    descripcion: "",
    instrucciones: "",
    fecha_vencimiento: "",
    tipo_trabajo: "preguntas",
    permite_archivo: false,
    permite_entrega_tardia: false,
    max_intentos: null,
  });

  const loadData = useCallback(async () => {
    const cursosRes = await api.get<{ data: Curso[] }>("/cursos");
    const cursos = cursosRes.data || [];

    // Cargar materias del profesor usando cursos existentes
    const allMaterias: Materia[] = [];
    for (const curso of cursos) {
      const materiasRes = await api.get<{ data: Materia[] }>(`/cursos/${curso.id}/materias`);
      const materias = materiasRes.data || [];
      allMaterias.push(...materias);
    }
    setMaterias(allMaterias);

    const allLecciones: LeccionOption[] = [];
    const allTrabajos: TrabajoRow[] = [];

    for (const curso of cursos) {
      const materiasRes = await api.get<{ data: Materia[] }>(`/cursos/${curso.id}/materias`);
      const materias = materiasRes.data || [];

      for (const materia of materias) {
        // Cargar trabajos por materia
        try {
          const trabajosMateria = await listTrabajosByMateria(materia.id);
          for (const trabajo of trabajosMateria) {
            allTrabajos.push({ ...trabajo, materia_titulo: materia.nombre });
          }
        } catch {
          // Skip materias where listing fails so the page remains usable.
        }

        // Cargar lecciones para mantener compatibilidad con trabajos antiguos
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
    // Validar materia (solo para creación nueva)
    if (!editingTrabajoId && !selectedMateria) {
      toast.error(t("teacher.trabajos.validation.materiaRequired", { defaultValue: "Materia es obligatoria" }));
      return;
    }

    // Validar título (para edición y creación manual)
    if ((editingTrabajoId !== null || createMode === "manual") && !newTrabajo.titulo.trim()) {
      toast.error(t("teacher.trabajos.validation.titleRequired", { defaultValue: "Título es obligatorio" }));
      return;
    }

    // Validar tipo de trabajo (solo para creación manual)
    if (!editingTrabajoId && createMode === "manual" && !selectedWorkType) {
      toast.error(t("teacher.trabajos.validation.workTypeRequired", { defaultValue: "Tipo de trabajo es obligatorio" }));
      return;
    }

    // Validar libro (solo para creación desde libro)
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
          tipo_trabajo: newTrabajo.tipo_trabajo,
          permite_archivo: newTrabajo.permite_archivo,
          permite_entrega_tardia: newTrabajo.permite_entrega_tardia,
          max_intentos: newTrabajo.max_intentos,
        };
        await updateTrabajo(editingTrabajoId, payload);
      } else if (createMode === "manual") {
        const workTypeConfig = {
          archivo: { tipo_trabajo: "archivo" as const, permite_archivo: true, calificacion_automatica: false },
          preguntas_abiertas: { tipo_trabajo: "preguntas" as const, permite_archivo: false, calificacion_automatica: false },
          preguntas_cerradas: { tipo_trabajo: "preguntas" as const, permite_archivo: false, calificacion_automatica: true },
        }[selectedWorkType];
        
        console.log("Creando trabajo manual con:", {
          materia_id: selectedMateria,
          titulo: newTrabajo.titulo.trim(),
          tipo_trabajo: workTypeConfig.tipo_trabajo,
          permite_archivo: workTypeConfig.permite_archivo,
          calificacion_automatica: workTypeConfig.calificacion_automatica,
        });
        
        const createdTrabajo = await createTrabajo({
          leccion_id: undefined,
          materia_id: selectedMateria || undefined,
          titulo: newTrabajo.titulo.trim(),
          descripcion: newTrabajo.descripcion || undefined,
          instrucciones: newTrabajo.instrucciones || undefined,
          fecha_vencimiento: newTrabajo.fecha_vencimiento || undefined,
          tipo_trabajo: workTypeConfig.tipo_trabajo,
          permite_archivo: workTypeConfig.permite_archivo,
          permite_entrega_tardia: newTrabajo.permite_entrega_tardia,
          max_intentos: newTrabajo.max_intentos,
          calificacion_automatica: workTypeConfig.calificacion_automatica,
        });
        
        // Publicar automáticamente el trabajo creado
        try {
          await publicarTrabajo(createdTrabajo.id);
          console.log("Trabajo publicado automáticamente:", createdTrabajo.id);
          toast.success(t("teacher.trabajos.published", { defaultValue: "Trabajo creado y publicado exitosamente" }));
          
          // Redirect to preguntas page if creating questions-based assignment
          if (selectedWorkType === "preguntas_abiertas" || selectedWorkType === "preguntas_cerradas") {
            navigate(`/teacher/trabajos/${createdTrabajo.id}/preguntas`);
            return;
          }
        } catch (err) {
          console.error("Error al publicar trabajo automáticamente:", JSON.stringify(err, null, 2));
          toast.error("Error al publicar trabajo automáticamente: " + (err as any)?.message || "Error desconocido");
        }
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
      console.error("Error al crear/editar trabajo:", err);
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

  const handleViewTrabajoDetails = async (trabajo: TrabajoRow) => {
    setSelectedTrabajo(trabajo);
    setShowDetails(true);
    setLoadingEntregas(true);
    try {
      const entregas = await listEntregasByTrabajo(trabajo.id);
      setTrabajoEntregas(entregas);
    } catch (err) {
      console.error("Error al cargar entregas:", err);
      setTrabajoEntregas([]);
    } finally {
      setLoadingEntregas(false);
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

  const handleFilePreview = async (fileUrl: string) => {
    const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:9082";
    const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${BASE_URL}${fileUrl}`;
    const extension = fileUrl.split('.').pop()?.toLowerCase();
    
    // File types that can be displayed directly
    const viewableExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    
    if (viewableExtensions.includes(extension || '')) {
      setFilePreviewModal({ url: fullUrl, type: extension === 'pdf' ? 'pdf' : 'image' });
      // Reset zoom and pan when opening new file
      setImageZoom(1);
      setImagePan({ x: 0, y: 0 });
    } else if (extension === 'docx' || extension === 'pptx') {
      setConvertingFile(true);
      try {
        const file = await fetch(fullUrl).then(r => r.blob());
        const fileObj = new File([file], fileUrl.split('/').pop() || 'file.' + extension, { type: file.type });
        
        let pdfBlob: Blob;
        if (extension === 'docx') {
          pdfBlob = await convertDocxToPdf(fileObj);
        } else {
          pdfBlob = await convertPptxToPdf(fileObj);
        }
        
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setFilePreviewModal({ url: pdfUrl, type: 'pdf' });
      } catch (err) {
        toast.error("No se pudo convertir el archivo a PDF");
        setFilePreviewModal({ url: fullUrl, type: 'other' });
      } finally {
        setConvertingFile(false);
      }
    } else {
      setFilePreviewModal({ url: fullUrl, type: 'other' });
    }
  };

  const handleZoomIn = () => setImageZoom(prev => Math.min(prev + 0.25, 5));
  const handleZoomOut = () => setImageZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
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
      {/* Header mejorado con selector de materias */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 mb-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white mb-3">{t("teacher.trabajos.title", { defaultValue: "Gestión de Trabajos" })}</h1>
            
            {materias.length > 0 && (
              <div className="bg-white/20 backdrop-blur rounded-lg p-4">
                <label className="block text-sm font-medium text-white mb-2">{t("teacher.trabajos.filterByMateria", { defaultValue: "Filtrar por materia:" })}</label>
                <select
                  className="w-full border border-white/30 rounded-lg px-4 py-2 text-sm bg-white/90 backdrop-blur focus:ring-2 focus:ring-white/50"
                  value={selectedMateria}
                  onChange={(e) => setSelectedMateria(e.target.value)}
                >
                  <option value="">{t("teacher.trabajos.allMaterias", { defaultValue: "Todas las materias" })}</option>
                  {materias.map((materia) => (
                    <option key={materia.id} value={materia.id}>{materia.nombre}</option>
                  ))}
                </select>
                {selectedMateria && (
                  <p className="text-xs text-white/90 mt-2">
                    {t("teacher.trabajos.materiaFilterActive", { defaultValue: "Mostrando trabajos de: " })}
                    {materias.find(m => m.id === selectedMateria)?.nombre}
                  </p>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/teacher/trabajos/analytics")}
              className="inline-flex items-center gap-2 px-5 py-3 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors shadow-md font-medium"
            >
              <BarChart3 size={18} />
              <span>{t("teacher.trabajos.analytics.nav", { defaultValue: "Analytics v2" })}</span>
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md font-medium"
            >
              <Plus size={18} />
              <span>{t("teacher.trabajos.new", { defaultValue: "Nuevo Trabajo" })}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("teacher.trabajos.search", { defaultValue: "Buscar por titulo, leccion o estado" })}
        />
        {selectedMateria && (
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <GraduationCap size={14} />
            <span>{t("teacher.trabajos.materiaSelected", { defaultValue: "Los estudiantes de esta materia verán este trabajo" })}</span>
          </div>
        )}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleTrabajos.map((trabajo) => (
            <div 
              key={trabajo.id} 
              className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100 cursor-pointer"
              onClick={() => handleViewTrabajoDetails(trabajo)}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-lg">{trabajo.titulo}</h3>
                  <p className="text-sm text-gray-500 mt-1">{trabajo.materia_titulo || trabajo.leccion_titulo}</p>
                </div>
                <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                  trabajo.estado === "publicado" ? "bg-emerald-100 text-emerald-700" : 
                  trabajo.estado === "cerrado" ? "bg-gray-200 text-gray-700" : 
                  "bg-amber-100 text-amber-700"
                }`}>
                  {trabajo.estado.charAt(0).toUpperCase() + trabajo.estado.slice(1)}
                </span>
              </div>

              {trabajo.descripcion && (
                <p className="text-sm text-gray-600 mt-3 line-clamp-2">{trabajo.descripcion}</p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {new Date(trabajo.created_at).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  {trabajo.tipo_trabajo === "preguntas" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/teacher/trabajos/${trabajo.id}/preguntas`);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200"
                    >
                      <HelpCircle size={12} />
                      Banco de preguntas
                    </button>
                  )}
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    Ver detalles
                  </span>
                </div>
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
              {materias.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4">
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="text-blue-600" size={16} />
                      {t("teacher.trabajos.selectMateriaForCreate", { defaultValue: "Asignar a materia:" })}
                    </div>
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                    value={selectedMateria}
                    onChange={(e) => {
                      setSelectedMateria(e.target.value);
                      const materia = materias.find(m => m.id === e.target.value);
                      if (materia) {
                        setSelectedCurso(materia.curso_id);
                      }
                    }}
                  >
                    <option value="">{t("teacher.trabajos.selectMateria", { defaultValue: "Selecciona una materia" })}</option>
                    {materias.map((materia) => (
                      <option key={materia.id} value={materia.id}>{materia.nombre}</option>
                    ))}
                  </select>
                  {selectedMateria && (
                    <p className="text-xs text-blue-700 mt-2 flex items-center gap-2">
                      <Users size={12} />
                      {t("teacher.trabajos.materiaSelected", { defaultValue: "Los estudiantes de esta materia verán este trabajo" })}
                    </p>
                  )}
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
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.workType", { defaultValue: "Tipo de trabajo" })}</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className={`px-3 py-2 rounded border text-sm ${
                      selectedWorkType === "archivo"
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white"
                    }`}
                    onClick={() => setSelectedWorkType("archivo")}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <UploadCloud size={16} />
                      <span>{t("teacher.trabajos.workType.file", { defaultValue: "Archivo" })}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded border text-sm ${
                      selectedWorkType === "preguntas_abiertas"
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white"
                    }`}
                    onClick={() => setSelectedWorkType("preguntas_abiertas")}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <FileText size={16} />
                      <span>{t("teacher.trabajos.workType.openQuestions", { defaultValue: "Abiertas" })}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded border text-sm ${
                      selectedWorkType === "preguntas_cerradas"
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white"
                    }`}
                    onClick={() => setSelectedWorkType("preguntas_cerradas")}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <CheckCircle size={16} />
                      <span>{t("teacher.trabajos.workType.closedQuestions", { defaultValue: "Cerradas" })}</span>
                    </div>
                  </button>
                </div>
                {selectedWorkType === "preguntas_abiertas" && (
                  <p className="text-xs text-gray-600 mt-1">{t("teacher.trabajos.workType.openQuestionsHint", { defaultValue: "Revisión manual por el docente" })}</p>
                )}
                {selectedWorkType === "preguntas_cerradas" && (
                  <p className="text-xs text-gray-600 mt-1">{t("teacher.trabajos.workType.closedQuestionsHint", { defaultValue: "Calificación automática por el sistema" })}</p>
                )}
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

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="permite_entrega_tardia"
                  checked={newTrabajo.permite_entrega_tardia}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, permite_entrega_tardia: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label htmlFor="permite_entrega_tardia" className="text-sm">
                  {t("teacher.trabajos.permiteEntregaTardia", { defaultValue: "Permitir entregas tardías después de la fecha límite" })}
                </label>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.maxIntentos", { defaultValue: "Número máximo de intentos (opcional)" })}</label>
                <input
                  type="number"
                  min="1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={newTrabajo.max_intentos ?? ""}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, max_intentos: e.target.value ? parseInt(e.target.value) : null }))}
                  placeholder={t("teacher.trabajos.maxIntentosPlaceholder", { defaultValue: "Sin límite si se deja vacío" })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t("teacher.trabajos.maxIntentosHelp", { defaultValue: "Dejar vacío para permitir intentos ilimitados" })}
                </p>
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

      {showDetails && selectedTrabajo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowDetails(false)}>
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedTrabajo.titulo}</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedTrabajo.materia_titulo || selectedTrabajo.leccion_titulo}</p>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Información del trabajo */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <FileText size={18} />
                  Información del trabajo
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Estado:</span>
                    <span className={`text-sm font-medium ${
                      selectedTrabajo.estado === "publicado" ? "text-emerald-600" :
                      selectedTrabajo.estado === "cerrado" ? "text-gray-600" :
                      "text-amber-600"
                    }`}>
                      {selectedTrabajo.estado.charAt(0).toUpperCase() + selectedTrabajo.estado.slice(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Fecha de creación:</span>
                    <span className="text-sm font-medium">{new Date(selectedTrabajo.created_at).toLocaleDateString()}</span>
                  </div>
                  {selectedTrabajo.descripcion && (
                    <div className="pt-2">
                      <span className="text-sm text-gray-600 block mb-1">Descripción:</span>
                      <p className="text-sm text-gray-800">{selectedTrabajo.descripcion}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Lista de estudiantes */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Users size={18} />
                  Entregas de estudiantes
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  {loadingEntregas ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="animate-spin text-gray-400" />
                    </div>
                  ) : trabajoEntregas.length === 0 ? (
                    <p className="text-sm text-gray-600 text-center py-8">
                      No hay entregas registradas
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {trabajoEntregas.map((entrega) => {
                        const submittedDate = new Date(entrega.entrega.submitted_at);
                        const fechaVencimiento = selectedTrabajo?.fecha_vencimiento ? new Date(selectedTrabajo.fecha_vencimiento) : null;
                        const isLate = fechaVencimiento && submittedDate > fechaVencimiento;

                        return (
                          <div key={entrega.entrega.id} className="flex items-center justify-between p-3 bg-white rounded border border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <CheckCircle size={16} className="text-emerald-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{entrega.estudiante_nombre || "Estudiante"}</p>
                                <p className="text-xs text-gray-500">
                                  Entregado el {submittedDate.toLocaleDateString()}
                                </p>
                                {isLate && (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 mt-1">
                                    <AlertCircle size={10} />
                                    Entregado atrasado
                                  </span>
                                )}
                                {entrega.entrega.archivo_url && (
                                  <button
                                    onClick={() => handleFilePreview(entrega.entrega.archivo_url!)}
                                    disabled={convertingFile}
                                    className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors mt-1 disabled:opacity-50"
                                  >
                                    {convertingFile ? "Convirtiendo..." : "Ver archivo"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => navigate(`/teacher/trabajos/${selectedTrabajo?.id}/calificar?entregaId=${entrega.entrega.id}`)}
                              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {entrega.calificacion ? "Revisar" : "Calificar"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-between items-center">
              <button
                onClick={() => {
                  if (selectedTrabajo && confirm("¿Estás seguro de eliminar este trabajo? Esta acción no se puede deshacer.")) {
                    handleEliminar(selectedTrabajo.id);
                    setShowDetails(false);
                  }
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
              >
                Eliminar trabajo
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate(`/teacher/trabajos/${selectedTrabajo.id}/calificar`)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Ir a calificar
                </button>
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {filePreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Vista previa del archivo</h3>
              <button
                onClick={() => {
                  setFilePreviewModal(null);
                  if (filePreviewModal.url.startsWith('blob:')) {
                    URL.revokeObjectURL(filePreviewModal.url);
                  }
                  setImageZoom(1);
                  setImagePan({ x: 0, y: 0 });
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold px-2"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-0">
              {filePreviewModal.type === 'pdf' ? (
                <iframe
                  src={filePreviewModal.url}
                  className="w-full h-full border-0"
                  style={{ height: '80vh' }}
                  title="PDF Preview"
                />
              ) : filePreviewModal.type === 'image' ? (
                <div className="relative w-full h-full flex items-center justify-center bg-gray-100" style={{ height: '80vh', overflow: 'hidden' }}>
                  <div
                    className="cursor-move"
                    style={{
                      transform: `scale(${imageZoom}) translate(${imagePan.x}px, ${imagePan.y}px)`,
                      transformOrigin: 'center',
                      transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                    onMouseDown={(e) => {
                      setIsDragging(true);
                      setDragStart({ x: e.clientX - imagePan.x, y: e.clientY - imagePan.y });
                    }}
                    onMouseMove={(e) => {
                      if (isDragging) {
                        setImagePan({
                          x: e.clientX - dragStart.x,
                          y: e.clientY - dragStart.y
                        });
                      }
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                  >
                    <img
                      src={filePreviewModal.url}
                      alt="Preview"
                      className="max-w-full max-h-full object-contain"
                      draggable={false}
                    />
                  </div>
                  {/* Zoom Controls */}
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 bg-white rounded-lg shadow-lg p-2">
                    <button
                      onClick={handleZoomOut}
                      className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      −
                    </button>
                    <span className="w-12 flex items-center justify-center text-sm font-medium">
                      {Math.round(imageZoom * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      +
                    </button>
                    <button
                      onClick={handleResetZoom}
                      className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-xs"
                    >
                      ⟲
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8" style={{ minHeight: '60vh' }}>
                  <p className="text-gray-600 mb-4 text-center">
                    Este formato de archivo no se puede visualizar directamente.
                  </p>
                  <div className="flex gap-3">
                    <a
                      href={filePreviewModal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Descargar archivo
                    </a>
                    <button
                      onClick={() => setFilePreviewModal(null)}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
