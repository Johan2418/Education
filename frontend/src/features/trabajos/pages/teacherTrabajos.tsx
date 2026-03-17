import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Search, SendHorizontal, XCircle, CheckCircle2, ClipboardList, BarChart3, Trash2, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extractRawText } from "mammoth";

import api from "@/shared/lib/api";
import { getMe } from "@/shared/lib/auth";
import type { Curso, Leccion, Materia, Tema, Unidad } from "@/shared/types";
import type { CreateTrabajoRequest, LibroPreguntaInput, Trabajo, UpdateTrabajoRequest } from "@/shared/types/trabajos";
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

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

function isLikelyExercisePage(text: string): boolean {
  const normalized = text.toLowerCase();
  if (normalized.length < 60) return false;

  const instructionMatches = (normalized.match(/\b(ejercicio(?:s)?|actividad(?:es)?|cuestionario|autoevaluacion|resuelve|responda|responde|complete|completa|selecciona|marca|indica|justifica|calcula)\b/g) || []).length;
  const numberedItemMatches = (text.match(/(?:^|\s)(?:\d{1,2}[\.)]|[a-dA-D][\.)])\s+/g) || []).length;
  const questionMarkMatches = (text.match(/[¿?]/g) || []).length;
  const optionsMatches = (text.match(/(?:^|\s)[a-dA-D][\.)]\s+/g) || []).length;
  const theoryMatches = (normalized.match(/\b(introduccion|objetivo|resumen|teoria|definicion|concepto|historia|explicacion|contenido)\b/g) || []).length;

  const score =
    instructionMatches * 2 +
    Math.min(numberedItemMatches, 4) * 2 +
    Math.min(questionMarkMatches, 4) +
    Math.min(optionsMatches, 4) -
    (theoryMatches >= 3 ? 2 : 0);

  // Keep only pages with strong, combined evidence of exercise-like content.
  if (score < 4) return false;

  return numberedItemMatches >= 1 || questionMarkMatches >= 2;
}

function isLikelyExerciseQuestionText(texto: string): boolean {
  const normalized = texto.trim().toLowerCase();
  if (normalized.length < 12) return false;

  const hasQuestionMark = /[¿?]/.test(normalized);
  const startsWithInstruction = /^(responde|responda|calcula|complete|completa|selecciona|marca|indica|justifica|define|menciona|enumera|relaciona)\b/.test(normalized);
  const startsWithNumber = /^\d{1,2}[\.)]\s+/.test(normalized);
  const hasOptions = /(?:^|\s)[a-d][\.)]\s+/.test(normalized);

  return hasQuestionMark || startsWithInstruction || startsWithNumber || hasOptions;
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

function buildBookDescriptionFromQuestions(page: number, preguntas: LibroPreguntaInput[]): string {
  const header = `Preguntas extraidas de la pagina ${page}:`;
  const lines = preguntas.map((pregunta, idx) => `${idx + 1}. ${pregunta.texto.trim()}`);
  return [header, ...lines].join("\n");
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
    chunks.push({ page: pageNum, text });
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
  const [libroMaxPreguntas, setLibroMaxPreguntas] = useState(8);
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

  const loadData = async () => {
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

    setLecciones(allLecciones);
    setTrabajos(allTrabajos);

    if (!newTrabajo.leccion_id && allLecciones.length > 0) {
      setNewTrabajo((prev) => ({ ...prev, leccion_id: allLecciones[0]?.id || "" }));
    }
  };

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
  }, [navigate, t]);

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

  const resetCreateState = () => {
    setShowCreate(false);
    setEditingTrabajoId(null);
    setCreateMode("manual");
    setLibroPages([]);
    setLibroFileName("");
    setLibroPageStart(1);
    setLibroPageEnd("");
    setLibroMaxPreguntas(8);
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

  const closeSequentialReview = () => {
    setReviewOpen(false);
    setReviewQueueIds([]);
    setReviewQueueIndex(0);
    setReviewTrabajo(null);
    setReviewPreguntas([]);
    setReviewNotas("");
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
        orden: p.orden || idx + 1,
      }));

      setReviewTrabajo(trabajoActual);
      setReviewPreguntas(preguntasMapeadas);
      setReviewNotas(estado.extraccion?.notas_revision || "");
      setReviewDraft({
        titulo: trabajoActual.titulo || "",
        descripcion: trabajoActual.descripcion || "",
        instrucciones: trabajoActual.instrucciones || "",
      });
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
    setReviewPreguntas((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addReviewPregunta = () => {
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
    setReviewPreguntas((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, orden: i + 1 })));
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

  const approveAndContinueReview = async () => {
    if (!reviewTrabajo) return;
    const preguntasValidas = normalizeReviewQuestions();

    if (!reviewDraft.titulo.trim()) {
      toast.error(t("teacher.trabajos.bookReview.titleRequired", { defaultValue: "El titulo es obligatorio para aprobar" }));
      return;
    }

    if (preguntasValidas.length === 0) {
      toast.error(t("teacher.trabajos.libro.error.minQuestion", { defaultValue: "Debes conservar al menos una pregunta" }));
      return;
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
        aprobar: true,
        notas_revision: reviewNotas.trim() || undefined,
      });

      await confirmarLibro(reviewTrabajo.id, {
        publicar: true,
        notas_finales: t("teacher.trabajos.bookReview.autoPublished", { defaultValue: "Aprobado y publicado desde revision secuencial" }),
      });

      await goNextReviewItem();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setReviewSaving(false);
    }
  };

  const skipAndContinueReview = async () => {
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
      let createdBookTrabajoIds: string[] = [];

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
        const candidatePages = libroPages.filter((chunk) => isLikelyExercisePage(chunk.text));
        const skippedByRegex = libroPages.length - candidatePages.length;

        if (candidatePages.length === 0) {
          toast.error(t("teacher.trabajos.bookCreate.noExercisePages", { defaultValue: "No se detectaron paginas con ejercicios o preguntas" }));
          return;
        }

        setLibroProgress({
          active: true,
          total: candidatePages.length,
          processed: 0,
          created: 0,
          skippedByRegex,
          skippedByIA: 0,
          failed: 0,
          currentPage: candidatePages[0]?.page ?? null,
          currentPhase: "analizando",
        });

        let createdCount = 0;
        let skippedByIACount = 0;
        let failedCount = 0;

        for (const [i, chunk] of candidatePages.entries()) {
          if (!chunk) continue;
          let trabajoCreadoId = "";

          setLibroProgress((prev) => ({
            ...prev,
            currentPage: chunk.page,
            currentPhase: "creando",
          }));

          try {
            const trabajo = await createTrabajo({
              leccion_id: newTrabajo.leccion_id,
              titulo: `${leccionTitulo} - ${libroBase} - Pagina ${chunk.page}`,
              descripcion: `Generado automaticamente desde libro (${libroBase}), pagina ${chunk.page}`,
              instrucciones: "Responde las preguntas basadas en el contenido de la pagina asignada.",
              fecha_vencimiento: newTrabajo.fecha_vencimiento || undefined,
            });
            trabajoCreadoId = trabajo.id;

            setLibroProgress((prev) => ({
              ...prev,
              currentPage: chunk.page,
              currentPhase: "extrayendo",
            }));

            const extracted = await extractLibro(trabajo.id, {
              archivo_url: libroFileName || undefined,
              contenido: `[PAGINA ${chunk.page}]\n${chunk.text}`,
              pagina_inicio: chunk.page,
              pagina_fin: chunk.page,
              idioma: libroIdioma,
              max_preguntas: libroMaxPreguntas,
            });

            const preguntasExtraidas: LibroPreguntaInput[] = (extracted.preguntas || []).map((p, idx) => ({
              id: p.id,
              texto: p.texto,
              tipo: p.tipo,
              opciones: p.opciones || [],
              pagina_libro: p.pagina_libro ?? chunk.page,
              confianza_ia: p.confianza_ia ?? undefined,
              orden: p.orden || idx + 1,
            }));

            const preguntas = sanitizeExtractedQuestions(preguntasExtraidas);

            if (preguntas.length === 0) {
              skippedByIACount += 1;
              if (trabajoCreadoId) {
                await deleteTrabajo(trabajoCreadoId);
                trabajoCreadoId = "";
              }
            } else {
              const descripcionGenerada = buildBookDescriptionFromQuestions(chunk.page, preguntas);
              await updateTrabajo(trabajo.id, {
                titulo: trabajo.titulo,
                descripcion: descripcionGenerada,
              });

              setLibroProgress((prev) => ({
                ...prev,
                currentPage: chunk.page,
                currentPhase: "revisando",
              }));

              await revisarLibro(trabajo.id, {
                preguntas,
                aprobar: !libroRevisionManual,
                notas_revision: libroRevisionManual
                  ? "Revision manual requerida desde nuevo trabajo por libro"
                  : "Aprobacion automatica desde nuevo trabajo por libro",
              });

              if (!libroRevisionManual) {
                setLibroProgress((prev) => ({
                  ...prev,
                  currentPage: chunk.page,
                  currentPhase: "confirmando",
                }));

                const publicarAhora = libroPublicarAlCrear && preguntas.length >= libroMinPreguntasPublicar;

                await confirmarLibro(trabajo.id, {
                  publicar: publicarAhora,
                  notas_finales: "Confirmacion automatica desde nuevo trabajo por libro",
                });
              }

              createdCount += 1;
              createdBookTrabajoIds.push(trabajo.id);
            }
          } catch {
            failedCount += 1;
            if (trabajoCreadoId) {
              try {
                await deleteTrabajo(trabajoCreadoId);
              } catch {
                // Best effort cleanup for partial work when a page fails.
              }
            }
          } finally {
            const processed = i + 1;
            setLibroProgress((prev) => ({
              ...prev,
              processed,
              created: createdCount,
              skippedByIA: skippedByIACount,
              failed: failedCount,
            }));
          }
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

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-2 text-gray-300" />
          {t("teacher.trabajos.empty", { defaultValue: "No hay trabajos registrados" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((trabajo) => (
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { if (!reviewSaving) closeSequentialReview(); }}>
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
                      onChange={(e) => setReviewDraft((prev) => ({ ...prev, titulo: e.target.value }))}
                    />
                  </label>

                  <label className="text-sm block">
                    {t("teacher.trabajos.instrucciones", { defaultValue: "Instrucciones" })}
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                      value={reviewDraft.instrucciones}
                      onChange={(e) => setReviewDraft((prev) => ({ ...prev, instrucciones: e.target.value }))}
                    />
                  </label>
                </div>

                <label className="text-sm block">
                  {t("teacher.trabajos.descripcion", { defaultValue: "Descripcion" })}
                  <textarea
                    rows={3}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={reviewDraft.descripcion}
                    onChange={(e) => setReviewDraft((prev) => ({ ...prev, descripcion: e.target.value }))}
                  />
                </label>

                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {t("teacher.trabajos.libro.reviewTitle", { defaultValue: "Paso 2: Revisar preguntas" })} ({reviewPreguntas.length})
                  </h3>
                  <button
                    onClick={addReviewPregunta}
                    className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                    type="button"
                  >
                    {t("teacher.trabajos.libro.addQuestion", { defaultValue: "Agregar pregunta" })}
                  </button>
                </div>

                {reviewPreguntas.length === 0 ? (
                  <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4">
                    {t("teacher.trabajos.libro.noQuestions", { defaultValue: "Aun no hay preguntas. Ejecuta la extraccion primero." })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reviewPreguntas.map((pregunta, index) => (
                      <div key={`${pregunta.id || "new"}-${index}`} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-gray-500">{t("teacher.trabajos.libro.question", { defaultValue: "Pregunta" })} #{index + 1}</div>
                          <button onClick={() => removeReviewPregunta(index)} className="text-xs text-rose-600 hover:underline" type="button">
                            {t("common.delete", { defaultValue: "Eliminar" })}
                          </button>
                        </div>

                        <textarea
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
                          rows={2}
                          value={pregunta.texto}
                          onChange={(e) => updateReviewPregunta(index, { texto: e.target.value })}
                        />

                        <div className="grid md:grid-cols-4 gap-2 text-sm">
                          <label>
                            {t("teacher.trabajos.libro.type", { defaultValue: "Tipo" })}
                            <select
                              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                              value={pregunta.tipo}
                              onChange={(e) => updateReviewPregunta(index, { tipo: e.target.value as LibroPreguntaInput["tipo"] })}
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
                              value={pregunta.orden}
                              onChange={(e) => updateReviewPregunta(index, { orden: Number(e.target.value || index + 1) })}
                            />
                          </label>

                          <label>
                            {t("teacher.trabajos.libro.page", { defaultValue: "Pagina" })}
                            <input
                              type="number"
                              min={1}
                              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                              value={pregunta.pagina_libro || ""}
                              onChange={(e) => updateReviewPregunta(index, { pagina_libro: e.target.value ? Number(e.target.value) : undefined })}
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
                              value={pregunta.confianza_ia ?? ""}
                              onChange={(e) => updateReviewPregunta(index, { confianza_ia: e.target.value ? Number(e.target.value) : undefined })}
                            />
                          </label>
                        </div>

                        <label className="text-sm block mt-2">
                          {t("teacher.trabajos.libro.options", { defaultValue: "Opciones (separadas por coma)" })}
                          <input
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                            value={(pregunta.opciones || []).join(", ")}
                            onChange={(e) => {
                              const opciones = e.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean);
                              updateReviewPregunta(index, { opciones });
                            }}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}

                <label className="text-sm block">
                  {t("teacher.trabajos.libro.reviewNotes", { defaultValue: "Notas de revision" })}
                  <textarea
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    rows={2}
                    value={reviewNotas}
                    onChange={(e) => setReviewNotas(e.target.value)}
                  />
                </label>

                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                  {t("teacher.trabajos.bookReview.publishHint", { defaultValue: "Al aprobar, este trabajo se publica automaticamente y puedes continuar al siguiente." })}
                </p>
              </div>
            )}

            <div className="p-5 border-t border-gray-100 bg-white flex justify-between gap-2">
              <button
                className="px-4 py-2 rounded border disabled:opacity-50"
                onClick={() => { void skipAndContinueReview(); }}
                disabled={reviewSaving || reviewLoading}
                type="button"
              >
                {reviewQueueIndex + 1 >= reviewQueueIds.length
                  ? t("teacher.trabajos.bookReview.finishWithoutApprove", { defaultValue: "Finalizar sin aprobar" })
                  : t("teacher.trabajos.bookReview.skipContinue", { defaultValue: "Omitir y continuar" })}
              </button>

              <button
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => { void approveAndContinueReview(); }}
                disabled={reviewSaving || reviewLoading}
                type="button"
              >
                {reviewSaving
                  ? t("common.saving", { defaultValue: "Guardando..." })
                  : reviewQueueIndex + 1 >= reviewQueueIds.length
                    ? t("teacher.trabajos.bookReview.approveFinish", { defaultValue: "Aprobar y finalizar" })
                    : t("teacher.trabajos.bookReview.approveContinue", { defaultValue: "Aprobar y continuar" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
