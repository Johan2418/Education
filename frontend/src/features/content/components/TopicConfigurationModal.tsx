import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  FileQuestion,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Plus,
  Puzzle,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import api from "@/shared/lib/api";
import NativeActivityMatchingForm from "@/features/lessons/components/nativeActivities/NativeActivityMatchingForm";
import NativeActivityOrderingForm from "@/features/lessons/components/nativeActivities/NativeActivityOrderingForm";
import { getActividadInteractiva, parseNativeInteractiveConfig } from "@/features/lessons/services/interactivas";
import type { NativeInteractiveActivityType } from "@/features/lessons/services/interactivas";
import type { Leccion, LeccionSeccion, PruebaCompleta, Tema } from "@/shared/types";

type BlockType = "document" | "video" | "image" | "interactive";
type InteractiveProvider = "nativo";
type InteractiveMode = NativeInteractiveActivityType;

interface ApiEnvelope<T> {
  data: T;
}

interface OptionDraft {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface MatchingPairDraft {
  id: string;
  leftText: string;
  rightText: string;
}

interface OrderingItemDraft {
  id: string;
  text: string;
}

interface FillBlankEntryDraft {
  id: string;
  text: string;
}

interface QuestionDraft {
  id: string;
  prompt: string;
  options: OptionDraft[];
}

interface ContentBlockDraft {
  id: string;
  type: BlockType;
  title: string;
  description: string;
  sourceMode: "url" | "file";
  sourceUrl: string;
  sourceFileName: string;
  sourceFileDataUrl: string;
  questions: QuestionDraft[];
  nativeActivityType: InteractiveMode;
  matchingPairs: MatchingPairDraft[];
  orderingItems: OrderingItemDraft[];
  fillBlankText: string;
  fillBlankWordBank: FillBlankEntryDraft[];
  fillBlankAnswers: FillBlankEntryDraft[];
  calificable: boolean;
  calificacionPeso: string;
  interactiveProvider: InteractiveProvider;
  interactiveEmbedUrl: string;
  videoCheckpointSeconds: string;
  nativeQuickQuizEnabled: boolean;
  nativeQuickTimeSeconds: string;
  nativeQuickAutoSkipOnTimeout: boolean;
}

interface TopicConfigurationModalProps {
  open: boolean;
  topic: Tema | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const MAX_EMBEDDED_FILE_SIZE = 10 * 1024 * 1024;

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Error inesperado";
}

function createDefaultOptions(): OptionDraft[] {
  return [
    { id: makeId(), text: "", isCorrect: true },
    { id: makeId(), text: "", isCorrect: false },
    { id: makeId(), text: "", isCorrect: false },
    { id: makeId(), text: "", isCorrect: false },
  ];
}

function createQuestion(): QuestionDraft {
  return {
    id: makeId(),
    prompt: "",
    options: createDefaultOptions(),
  };
}

function createTrueFalseQuestion(): QuestionDraft {
  return {
    id: makeId(),
    prompt: "",
    options: [
      { id: makeId(), text: "Verdadero", isCorrect: true },
      { id: makeId(), text: "Falso", isCorrect: false },
    ],
  };
}

function createMatchingPair(): MatchingPairDraft {
  return {
    id: makeId(),
    leftText: "",
    rightText: "",
  };
}

function createOrderingItem(): OrderingItemDraft {
  return {
    id: makeId(),
    text: "",
  };
}

function createFillBlankEntry(): FillBlankEntryDraft {
  return {
    id: makeId(),
    text: "",
  };
}

function createBlock(type: BlockType): ContentBlockDraft {
  const labels: Record<BlockType, string> = {
    document: "Documento",
    video: "Video",
    image: "Imagen",
    interactive: "Actividad interactiva",
  };

  return {
    id: makeId(),
    type,
    title: labels[type],
    description: "",
    sourceMode: "url",
    sourceUrl: "",
    sourceFileName: "",
    sourceFileDataUrl: "",
    questions: type === "video" || type === "image" ? [createQuestion()] : [],
    nativeActivityType: "quiz",
    matchingPairs: [],
    orderingItems: [],
    fillBlankText: "",
    fillBlankWordBank: [],
    fillBlankAnswers: [],
    calificable: false,
    calificacionPeso: "0",
    interactiveProvider: "nativo",
    interactiveEmbedUrl: "",
    videoCheckpointSeconds: type === "video" ? "45" : "",
    nativeQuickQuizEnabled: false,
    nativeQuickTimeSeconds: "15",
    nativeQuickAutoSkipOnTimeout: true,
  };
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
  const next = [...items];
  const [picked] = next.splice(from, 1);
  if (picked === undefined) return items;
  next.splice(to, 0, picked);
  return next;
}

function inferBlockTypeFromResourceType(resourceType: string): BlockType {
  if (resourceType === "video") return "video";
  if (resourceType === "imagen") return "image";
  return "document";
}

function toObject(input: unknown): Record<string, unknown> | null {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return null;
}

function parseConfigObject(input: unknown): Record<string, unknown> {
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return toObject(parsed) || {};
    } catch {
      return {};
    }
  }
  return toObject(input) || {};
}

function readString(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function countFillBlankSlots(text: string): number {
  return (text.match(/___+/g) || []).length;
}

function syncFillBlankEntries(entries: FillBlankEntryDraft[], count: number): FillBlankEntryDraft[] {
  const next = entries.slice(0, count);
  while (next.length < count) {
    next.push(createFillBlankEntry());
  }
  return next;
}

function parseMatchingPairsFromConfig(input: unknown): MatchingPairDraft[] {
  const cfg = parseConfigObject(input);
  const rawPairs = cfg.pairs ?? cfg.matchingPairs ?? cfg.pares ?? cfg.parejas;
  if (Array.isArray(rawPairs)) {
    const pairs = rawPairs
      .map((rawPair, index) => {
        const pair = toObject(rawPair);
        if (!pair) return null;
        const leftText = readString(pair, ["left", "leftText", "izquierda", "texto_izquierdo", "prompt", "enunciado"]);
        const rightText = readString(pair, ["right", "rightText", "derecha", "texto_derecho", "response", "respuesta"]);
        if (!leftText || !rightText) return null;
        const id = typeof pair.id === "string" && pair.id.trim() ? pair.id.trim() : `pair_${index + 1}`;
        return { id, leftText, rightText };
      })
      .filter((pair): pair is MatchingPairDraft => pair !== null);

    if (pairs.length > 0) return pairs;
  }

  const preguntas = cfg.preguntas ?? cfg.questions;
  if (!Array.isArray(preguntas)) return [];

  return preguntas
    .map((rawQuestion, index) => {
      const question = toObject(rawQuestion);
      if (!question) return null;
      const leftText = readString(question, ["prompt", "enunciado", "text", "texto"]);
      const opciones = question.opciones ?? question.options;
      const firstOption = Array.isArray(opciones) ? opciones[0] : null;
      const rightObject = toObject(firstOption);
      const rightText = rightObject ? readString(rightObject, ["text", "texto", "label", "respuesta"]) : "";
      if (!leftText || !rightText) return null;
      return {
        id: typeof question.id === "string" && question.id.trim() ? question.id.trim() : `pair_${index + 1}`,
        leftText,
        rightText,
      };
    })
    .filter((pair): pair is MatchingPairDraft => pair !== null);
}

function parseOrderingItemsFromConfig(input: unknown): OrderingItemDraft[] {
  const cfg = parseConfigObject(input);
  const rawItems = cfg.ordering_items ?? cfg.orderingItems ?? cfg.items ?? cfg.elementos ?? cfg.elements;
  if (Array.isArray(rawItems)) {
    const items = rawItems
      .map((rawItem, index) => {
        const item = toObject(rawItem);
        if (!item) return null;
        const text = readString(item, ["text", "texto", "label", "elemento"]);
        if (!text) return null;
        return {
          id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `item_${index + 1}`,
          text,
        };
      })
      .filter((item): item is OrderingItemDraft => item !== null);

    if (items.length > 0) return items;
  }

  const preguntas = cfg.preguntas ?? cfg.questions;
  if (!Array.isArray(preguntas)) return [];

  return preguntas
    .map((rawQuestion, index) => {
      const question = toObject(rawQuestion);
      if (!question) return null;
      const text = readString(question, ["prompt", "enunciado", "text", "texto"]);
      if (!text) return null;
      return {
        id: typeof question.id === "string" && question.id.trim() ? question.id.trim() : `item_${index + 1}`,
        text,
      };
    })
    .filter((item): item is OrderingItemDraft => item !== null);
}

function normalizeQuestionsForNativeType(type: InteractiveMode, questions: QuestionDraft[]): QuestionDraft[] {
  if (type === "true_false") {
    return questions.map((question) => {
      const currentTrue = question.options.find((option) => option.isCorrect);
      const currentFalse = question.options.find((option) => !option.isCorrect);
      return {
        ...question,
        options: [
          { id: currentTrue?.id || makeId(), text: "Verdadero", isCorrect: Boolean(currentTrue?.isCorrect ?? true) },
          { id: currentFalse?.id || makeId(), text: "Falso", isCorrect: Boolean(currentFalse?.isCorrect ?? false) },
        ],
      };
    });
  }

  return questions;
}

async function fetchQuizQuestions(pruebaId: string): Promise<QuestionDraft[]> {
  const response = await api.get<PruebaCompleta | ApiEnvelope<PruebaCompleta>>(`/pruebas/${pruebaId}/completa`);
  const prueba = unwrapApiData(response);
  if (!prueba || !Array.isArray(prueba.preguntas)) return [];
  return prueba.preguntas.map((pregunta) => ({
    id: pregunta.id,
    prompt: pregunta.texto || "",
    options: (pregunta.respuestas || []).map((respuesta) => ({
      id: respuesta.id,
      text: respuesta.texto || "",
      isCorrect: respuesta.es_correcta ?? false,
    })),
  }));
}

async function getLessonSections(lessonId: string): Promise<LeccionSeccion[]> {
  const sectionsRes = await api.get<LeccionSeccion[] | ApiEnvelope<LeccionSeccion[]>>(`/lecciones/${lessonId}/secciones`);
  return Array.isArray(sectionsRes) ? sectionsRes : unwrapApiData(sectionsRes);
}

async function deleteLessonSections(lessonId: string): Promise<void> {
  const sections = await getLessonSections(lessonId);
  await Promise.all(sections.map((section) => api.delete(`/secciones/${section.id}`)));
}

async function buildBlockFromLesson(lesson: Leccion, sections: LeccionSeccion[], topic: Tema): Promise<ContentBlockDraft | null> {
  const resourceSection = sections.find((section) => section.tipo === "recurso" && section.recurso_id);
  const activitySection = sections.find((section) => section.tipo === "actividad_interactiva" && section.actividad_interactiva_id);
  const quizSection = sections.find((section) => section.tipo === "prueba" && section.prueba_id);

  if (resourceSection && resourceSection.recurso_id) {
    const recursoRes = await api.get<{ data: { id: string; titulo: string; descripcion?: string; tipo: string; archivo_url?: string } }>(`/recursos/${resourceSection.recurso_id}`);
    const recurso = unwrapApiData(recursoRes);
    const type = inferBlockTypeFromResourceType(recurso.tipo || "documento");
    const block = createBlock(type);
    block.id = lesson.id;
    block.title = lesson.titulo || recurso.titulo || block.title;
    block.description = lesson.descripcion || recurso.descripcion || "";
    block.sourceMode = "url";
    block.sourceUrl = recurso.archivo_url || "";
    block.sourceFileName = recurso.titulo || "";
    if (quizSection && quizSection.prueba_id) {
      block.questions = await fetchQuizQuestions(quizSection.prueba_id);
      block.calificable = quizSection.calificable ?? true;
      const absWeight = Number(quizSection.peso_calificacion ?? 0);
      const topicContentWeight = Number(topic.peso_calificacion_contenido ?? 0);
      block.calificacionPeso = topicContentWeight > 0
        ? String((absWeight * 100) / topicContentWeight)
        : String(absWeight);
    }
    return block;
  }

  if (activitySection && activitySection.actividad_interactiva_id) {
    const block = createBlock("interactive");
    block.id = lesson.id;
    block.title = lesson.titulo || block.title;
    block.description = lesson.descripcion || "";
    block.sourceMode = "url";
    block.interactiveEmbedUrl = "";
    block.interactiveProvider = "nativo";

    try {
      const actividad = await getActividadInteractiva(activitySection.actividad_interactiva_id);
      
      // ⚠️ VALIDATION: Reject deprecated providers
      const deprecatedProviders = ["h5p", "genially", "educaplay"];
      if (deprecatedProviders.includes(actividad.proveedor)) {
        console.warn(`⚠️ Actividad "${actividad.titulo}" usa proveedor deprecated "${actividad.proveedor}". Ignorando.`);
        return null; // Skip deprecated activities
      }
      
      // Force nativo provider
      block.interactiveProvider = "nativo";
      
      {
        const nativeConfig = parseNativeInteractiveConfig(actividad.configuracion as Record<string, unknown> | null);
        const rawConfig = parseConfigObject(actividad.configuracion);
        block.nativeActivityType = nativeConfig.activityType;
        block.questions = nativeConfig.questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          options: question.options.map((option) => ({
            id: option.id,
            text: option.text,
            isCorrect: option.isCorrect,
          })),
        }));
        block.questions = normalizeQuestionsForNativeType(nativeConfig.activityType, block.questions);
        block.matchingPairs = parseMatchingPairsFromConfig(rawConfig);
        block.orderingItems = parseOrderingItemsFromConfig(rawConfig);
        block.fillBlankText = nativeConfig.fillBlankText || "";
        block.fillBlankWordBank = (nativeConfig.fillBlankWordBank || []).map((text) => ({ id: makeId(), text }));
        block.fillBlankAnswers = (nativeConfig.fillBlankAnswers || []).map((text) => ({ id: makeId(), text }));
        block.nativeQuickQuizEnabled = nativeConfig.isQuickQuiz;
        block.nativeQuickTimeSeconds = String(nativeConfig.timePerQuestionSeconds);
        block.nativeQuickAutoSkipOnTimeout = nativeConfig.autoSkipOnTimeout;
      }
    } catch (error) {
      console.warn("No se pudo cargar la actividad interactiva existente", error);
      return null; // Skip on error
    }

    return block;
  }

  return null;
}

function blockLabel(type: BlockType): string {
  switch (type) {
    case "document":
      return "Documento (PDF / Word / PowerPoint)";
    case "video":
      return "Video con preguntas";
    case "image":
      return "Imagen con preguntas";
    case "interactive":
      return "Actividad interactiva";
    default:
      return "Bloque";
  }
}

function blockIcon(type: BlockType) {
  switch (type) {
    case "document":
      return <FileText size={15} />;
    case "video":
      return <Video size={15} />;
    case "image":
      return <ImageIcon size={15} />;
    case "interactive":
      return <Puzzle size={15} />;
    default:
      return <FileText size={15} />;
  }
}

function inferResourceType(block: ContentBlockDraft): "documento" | "presentacion" | "video" | "imagen" | "enlace" {
  if (block.type === "video") return "video";
  if (block.type === "image") return "imagen";
  if (block.type !== "document") return "enlace";

  const sourceName = `${block.sourceFileName} ${block.sourceUrl}`.toLowerCase();
  if (sourceName.includes(".ppt") || sourceName.includes(".pptx")) return "presentacion";
  return "documento";
}

function validateQuestions(questions: QuestionDraft[], blockTitle: string): string | null {
  if (questions.length === 0) return "Agrega al menos una pregunta.";

  for (const [i, q] of questions.entries()) {
    if (!q.prompt.trim()) {
      return `La pregunta ${i + 1} de "${blockTitle}" no tiene enunciado.`;
    }
    const filledOptions = q.options.filter((opt) => opt.text.trim());
    if (filledOptions.length < 2) {
      return `La pregunta ${i + 1} de "${blockTitle}" requiere mínimo 2 opciones con texto.`;
    }
    const hasCorrect = filledOptions.some((opt) => opt.isCorrect);
    if (!hasCorrect) {
      return `La pregunta ${i + 1} de "${blockTitle}" requiere al menos una respuesta correcta.`;
    }
  }

  return null;
}

async function createQuizForLesson(leccionId: string, title: string, questions: QuestionDraft[]): Promise<string> {
  const pruebaPayload = {
    leccion_id: leccionId,
    titulo: title,
    tiempo_limite: null,
    nota_maxima: 100,
    peso_calificacion: 1,
    puntaje_minimo: 60,
    orden: 1,
  };
  const pruebaRes = await api.post<{ id: string } | ApiEnvelope<{ id: string }>>("/pruebas", pruebaPayload);
  const prueba = unwrapApiData(pruebaRes);
  const maxScore = questions.length > 0 ? Math.max(1, Math.round(100 / questions.length)) : 1;

  for (const [qIndex, question] of questions.entries()) {
    const preguntaRes = await api.post<{ id: string } | ApiEnvelope<{ id: string }>>("/preguntas", {
      prueba_id: prueba.id,
      texto: question.prompt.trim(),
      tipo: "opcion_multiple",
      puntaje_maximo: maxScore,
      orden: qIndex + 1,
    });
    const pregunta = unwrapApiData(preguntaRes);

    const validOptions = question.options.filter((option) => option.text.trim());
    for (const [optIndex, option] of validOptions.entries()) {
      await api.post("/respuestas", {
        pregunta_id: pregunta.id,
        texto: option.text.trim(),
        es_correcta: option.isCorrect,
        orden: optIndex + 1,
      });
    }
  }

  return prueba.id;
}

export function TopicConfigurationModal({ open, topic, onClose, onSaved }: TopicConfigurationModalProps) {
  const [blocks, setBlocks] = useState<ContentBlockDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [existingLessonIds, setExistingLessonIds] = useState<Set<string>>(new Set());
  const [usarSoloCalificacionLeccion, setUsarSoloCalificacionLeccion] = useState<boolean>(true);
  const [pesoCalificacionLeccion, setPesoCalificacionLeccion] = useState<string>("100");
  const [pesoCalificacionContenido, setPesoCalificacionContenido] = useState<string>("0");

  useEffect(() => {
    if (!open || !topic) return;

    setUsarSoloCalificacionLeccion(topic.usar_solo_calificacion_leccion ?? true);
    setPesoCalificacionLeccion(String(topic.peso_calificacion_leccion ?? 100));
    setPesoCalificacionContenido(String(topic.peso_calificacion_contenido ?? 0));

    const loadExistingTopicContent = async () => {
      setLoadingBlocks(true);
      setBlocks([]);
      setDraggingId(null);
      setExistingLessonIds(new Set());
      try {
        const leccionesRes = await api.get<Leccion[] | ApiEnvelope<Leccion[]>>(`/temas/${topic.id}/lecciones`);
        const lecciones = Array.isArray(leccionesRes) ? leccionesRes : unwrapApiData(leccionesRes);
        const contentBlocks: ContentBlockDraft[] = [];

        for (const leccion of lecciones) {
          const sectionsRes = await api.get<LeccionSeccion[] | ApiEnvelope<LeccionSeccion[]>>(`/lecciones/${leccion.id}/secciones`);
          const sections = Array.isArray(sectionsRes) ? sectionsRes : unwrapApiData(sectionsRes);
          const hasContentSection = sections.some((section) => section.tipo === "recurso" || section.tipo === "actividad_interactiva");
          const hasOnlyEvaluationSections = sections.length > 0 && sections.every((section) => section.tipo === "prueba");

          if (!hasContentSection) continue;

          if (leccion.nivel !== "tema_contenido") {
            try {
              await api.put(`/lecciones/${leccion.id}`, {
                nivel: "tema_contenido",
              });
            } catch (error) {
              console.warn(`No se pudo normalizar nivel de lección ${leccion.id}`, error);
            }
          }

          const block = await buildBlockFromLesson(leccion, sections, topic);
          if (block) {
            contentBlocks.push(block);
          }
        }

        setBlocks(contentBlocks);
        setExistingLessonIds(new Set(contentBlocks.map((block) => block.id)));
      } catch (err) {
        console.error("Error cargando contenido de tema", err);
      } finally {
        setLoadingBlocks(false);
      }
    };

    void loadExistingTopicContent();
  }, [open, topic?.id]);

  const canSave = useMemo(() => !saving && !loadingBlocks && !!topic, [saving, loadingBlocks, topic]);

  const contenidoCalificableTotal = useMemo(
    () => blocks.reduce((total, block) => total + (block.calificable ? Number(block.calificacionPeso) : 0), 0),
    [blocks]
  );

  const pesoCalificacionContenidoComputed = useMemo(() => Number(pesoCalificacionContenido), [pesoCalificacionContenido]);

  useEffect(() => {
    if (blocks.some((block) => block.calificable) && usarSoloCalificacionLeccion) {
      setUsarSoloCalificacionLeccion(false);
    }
  }, [blocks, usarSoloCalificacionLeccion]);

  if (!open || !topic) return null;

  const addBlock = (type: BlockType) => {
    setBlocks((prev) => {
      const next = [...prev, createBlock(type)];
      if (prev.length === 0 && usarSoloCalificacionLeccion) {
        setUsarSoloCalificacionLeccion(false);
        setPesoCalificacionLeccion("50");
        setPesoCalificacionContenido("50");
      }
      return next;
    });
  };

  const updateBlock = (blockId: string, updater: (prev: ContentBlockDraft) => ContentBlockDraft) => {
    setBlocks((prev) => prev.map((block) => (block.id === blockId ? updater(block) : block)));
  };

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => {
      const next = prev.filter((block) => block.id !== blockId);
      if (next.length === 0) {
        setUsarSoloCalificacionLeccion(true);
        setPesoCalificacionLeccion("100");
        setPesoCalificacionContenido("0");
      }
      return next;
    });
  };

  const moveBlockUp = (index: number) => {
    setBlocks((prev) => moveItem(prev, index, index - 1));
  };

  const moveBlockDown = (index: number) => {
    setBlocks((prev) => moveItem(prev, index, index + 1));
  };

  const setNativeActivityType = (blockId: string, nativeActivityType: InteractiveMode) => {
    updateBlock(blockId, (prev) => {
      const next: ContentBlockDraft = {
        ...prev,
        nativeActivityType,
        questions: nativeActivityType === "true_false"
          ? (prev.questions.length > 0 ? normalizeQuestionsForNativeType(nativeActivityType, prev.questions) : [createTrueFalseQuestion()])
          : prev.questions,
        matchingPairs: nativeActivityType === "matching" ? (prev.matchingPairs.length > 0 ? prev.matchingPairs : [createMatchingPair(), createMatchingPair()]) : prev.matchingPairs,
        orderingItems: nativeActivityType === "ordering" ? (prev.orderingItems.length > 0 ? prev.orderingItems : [createOrderingItem(), createOrderingItem()]) : prev.orderingItems,
        fillBlankText: nativeActivityType === "fill_in_the_blank" && !prev.fillBlankText.trim()
          ? "Escribe el texto y usa ____ en cada espacio"
          : prev.fillBlankText,
        fillBlankWordBank: nativeActivityType === "fill_in_the_blank" ? (prev.fillBlankWordBank.length > 0 ? prev.fillBlankWordBank : [createFillBlankEntry(), createFillBlankEntry()]) : prev.fillBlankWordBank,
        fillBlankAnswers: nativeActivityType === "fill_in_the_blank" ? syncFillBlankEntries(prev.fillBlankAnswers, Math.max(1, countFillBlankSlots(prev.fillBlankText))) : prev.fillBlankAnswers,
      };

      if (nativeActivityType === "quiz" && prev.questions.length === 0) {
        next.questions = [createQuestion()];
      }

      return next;
    });
  };

  const onFilePicked = async (blockId: string, file: File | null) => {
    if (!file) return;
    if (file.size > MAX_EMBEDDED_FILE_SIZE) {
      toast.error("El archivo supera 10 MB. Usa URL pública para archivos grandes.");
      return;
    }

    const asDataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
      reader.readAsDataURL(file);
    });

    updateBlock(blockId, (prev) => ({
      ...prev,
      sourceMode: "file",
      sourceFileName: file.name,
      sourceFileDataUrl: asDataURL,
      sourceUrl: "",
    }));
  };

  const addQuestion = (blockId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: [...prev.questions, prev.nativeActivityType === "true_false" ? createTrueFalseQuestion() : createQuestion()],
    }));
  };

  const updateQuestionOptions = (blockId: string, questionId: string, options: OptionDraft[]) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: prev.questions.map((question) => (question.id === questionId ? { ...question, options } : question)),
    }));
  };

  const removeQuestion = (blockId: string, questionId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== questionId),
    }));
  };

  const updateQuestionPrompt = (blockId: string, questionId: string, prompt: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === questionId ? { ...q, prompt } : q)),
    }));
  };

  const addOption = (blockId: string, questionId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId ? { ...q, options: [...q.options, { id: makeId(), text: "", isCorrect: false }] } : q
      ),
    }));
  };

  const removeOption = (blockId: string, questionId: string, optionId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId ? { ...q, options: q.options.filter((opt) => opt.id !== optionId) } : q
      ),
    }));
  };

  const updateOptionText = (blockId: string, questionId: string, optionId: string, text: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((opt) => (opt.id === optionId ? { ...opt, text } : opt)),
            }
          : q
      ),
    }));
  };

  const setCorrectOption = (blockId: string, questionId: string, optionId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((opt) => ({
                ...opt,
                isCorrect: opt.id === optionId,
              })),
            }
          : q
      ),
    }));
  };

  const addFillBlankWordBankEntry = (blockId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      fillBlankWordBank: [...prev.fillBlankWordBank, createFillBlankEntry()],
    }));
  };

  const addFillBlankAnswerEntry = (blockId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      fillBlankAnswers: [...prev.fillBlankAnswers, createFillBlankEntry()],
    }));
  };

  const updateFillBlankText = (blockId: string, value: string) => {
    updateBlock(blockId, (prev) => ({ ...prev, fillBlankText: value }));
  };

  const updateFillBlankWordBankEntry = (blockId: string, entryId: string, value: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      fillBlankWordBank: prev.fillBlankWordBank.map((entry) => (entry.id === entryId ? { ...entry, text: value } : entry)),
    }));
  };

  const updateFillBlankAnswerEntry = (blockId: string, entryId: string, value: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      fillBlankAnswers: prev.fillBlankAnswers.map((entry) => (entry.id === entryId ? { ...entry, text: value } : entry)),
    }));
  };

  const updateFillBlankAnswerAtIndex = (blockId: string, index: number, value: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      fillBlankAnswers: prev.fillBlankAnswers.map((entry, entryIndex) => (entryIndex === index ? { ...entry, text: value } : entry)),
    }));
  };

  const removeFillBlankWordBankEntry = (blockId: string, entryId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      fillBlankWordBank: prev.fillBlankWordBank.filter((entry) => entry.id !== entryId),
    }));
  };

  const removeFillBlankAnswerEntry = (blockId: string, entryId: string) => {
    updateBlock(blockId, (prev) => ({
      ...prev,
      fillBlankAnswers: prev.fillBlankAnswers.filter((entry) => entry.id !== entryId),
    }));
  };

  const closeModal = () => {
    if (saving) return;
    onClose();
  };

  const buildNativeInteractiveConfig = (block: ContentBlockDraft): Record<string, unknown> => {
    const baseConfig: Record<string, unknown> = {
      activityType: block.nativeActivityType,
      tipo_actividad: block.nativeActivityType,
      native_activity_type: block.nativeActivityType,
      nativeActivityType: block.nativeActivityType,
      interactive_activity_type: block.nativeActivityType,
      score_threshold: 70,
      puntaje_minimo: 70,
    };

    if (block.nativeActivityType === "quiz" || block.nativeActivityType === "true_false") {
      const normalizedQuestions = normalizeQuestionsForNativeType(block.nativeActivityType, block.questions);
      const quizFields = {
        modo_quiz_veloz: block.nativeQuickQuizEnabled,
        quick_quiz: block.nativeQuickQuizEnabled,
        tiempo_por_pregunta_segundos: Math.max(1, Math.round(Number(block.nativeQuickTimeSeconds) || 0)),
        time_per_question_seconds: Math.max(1, Math.round(Number(block.nativeQuickTimeSeconds) || 0)),
        auto_saltar_timeout: block.nativeQuickAutoSkipOnTimeout,
        auto_skip_on_timeout: block.nativeQuickAutoSkipOnTimeout,
      };

      return {
        ...baseConfig,
        ...quizFields,
        preguntas: normalizedQuestions.map((question) => ({
          id: question.id,
          prompt: question.prompt.trim(),
          enunciado: question.prompt.trim(),
          opciones: question.options.map((option) => ({
            id: option.id,
            text: option.text.trim(),
            texto: option.text.trim(),
            isCorrect: option.isCorrect,
            correcta: option.isCorrect,
          })),
          options: question.options.map((option) => ({
            id: option.id,
            text: option.text.trim(),
            isCorrect: option.isCorrect,
          })),
        })),
        questions: normalizedQuestions.map((question) => ({
          id: question.id,
          prompt: question.prompt.trim(),
          options: question.options.map((option) => ({
            id: option.id,
            text: option.text.trim(),
            isCorrect: option.isCorrect,
          })),
        })),
      };
    }

    if (block.nativeActivityType === "fill_in_the_blank") {
      const wordBank = block.fillBlankWordBank.map((entry) => entry.text.trim()).filter((item) => item.length > 0);
      const answers = block.fillBlankAnswers.map((entry) => entry.text.trim()).filter((item) => item.length > 0);
      return {
        ...baseConfig,
        fillBlankText: block.fillBlankText.trim(),
        fill_blank_text: block.fillBlankText.trim(),
        wordBank,
        word_bank: wordBank,
        banco_palabras: wordBank,
        fillBlankWordBank: wordBank,
        fill_blank_answers: answers,
        fillBlankAnswers: answers,
        answers,
        preguntas: block.fillBlankText.trim()
          ? [{
              id: "fill_blank_1",
              prompt: block.fillBlankText.trim(),
              enunciado: block.fillBlankText.trim(),
              opciones: [...wordBank, ...answers].map((text, index) => ({
                id: `opt_${index + 1}`,
                text,
                texto: text,
                isCorrect: answers.some((answer) => answer.toLowerCase() === text.toLowerCase()),
                correcta: answers.some((answer) => answer.toLowerCase() === text.toLowerCase()),
              })),
              options: [...wordBank, ...answers].map((text, index) => ({
                id: `opt_${index + 1}`,
                text,
                isCorrect: answers.some((answer) => answer.toLowerCase() === text.toLowerCase()),
              })),
            }]
          : [],
      };
    }

    if (block.nativeActivityType === "matching") {
      const validPairs = block.matchingPairs.filter((pair) => pair.leftText.trim() && pair.rightText.trim());
      return {
        ...baseConfig,
        pairs: validPairs.map((pair) => ({
          id: pair.id,
          left: pair.leftText.trim(),
          right: pair.rightText.trim(),
          izquierda: pair.leftText.trim(),
          derecha: pair.rightText.trim(),
          texto_izquierdo: pair.leftText.trim(),
          texto_derecho: pair.rightText.trim(),
        })),
        preguntas: [
          {
            id: "matching_1",
            prompt: block.title.trim() || "Emparejar",
            enunciado: block.title.trim() || "Emparejar",
            opciones: validPairs.map((pair) => ({
              id: pair.id,
              text: pair.rightText.trim(),
              texto: pair.rightText.trim(),
              isCorrect: true,
              correcta: true,
            })),
            options: validPairs.map((pair) => ({
              id: pair.id,
              text: pair.rightText.trim(),
              isCorrect: true,
            })),
          },
        ],
      };
    }

    if (block.nativeActivityType === "ordering") {
      const validItems = block.orderingItems.filter((item) => item.text.trim());
      return {
        ...baseConfig,
        ordering_items: validItems.map((item) => ({
          id: item.id,
          text: item.text.trim(),
        })),
        orderingItems: validItems.map((item) => ({
          id: item.id,
          text: item.text.trim(),
        })),
        items: validItems.map((item) => ({
          id: item.id,
          text: item.text.trim(),
        })),
        preguntas: [
          {
            id: "ordering_1",
            prompt: block.title.trim() || "Ordena los elementos",
            enunciado: block.title.trim() || "Ordena los elementos",
            opciones: validItems.map((item) => ({
              id: item.id,
              text: item.text.trim(),
              texto: item.text.trim(),
              isCorrect: true,
              correcta: true,
            })),
            options: validItems.map((item) => ({
              id: item.id,
              text: item.text.trim(),
              isCorrect: true,
            })),
          },
        ],
      };
    }

    return baseConfig;
  };

  const onSaveTopicConfiguration = async () => {
    if (!topic) return;
    if (blocks.length === 0) {
      toast.error("Agrega al menos un bloque de contenido.");
      return;
    }

    for (const block of blocks) {
      if (!block.title.trim()) {
        toast.error("Todos los bloques deben tener título.");
        return;
      }
      if (block.type === "document" || block.type === "video" || block.type === "image") {
        const hasSource = block.sourceMode === "file" ? !!block.sourceFileDataUrl : !!block.sourceUrl.trim();
        if (!hasSource) {
          toast.error(`El bloque "${block.title}" requiere archivo o URL.`);
          return;
        }
      }
      if (block.calificable) {
        const weight = Number(block.calificacionPeso);
        if (!Number.isFinite(weight) || weight <= 0) {
          toast.error(`El bloque "${block.title}" requiere un peso de calificación mayor a 0.`);
          return;
        }
      }
      if (block.type === "video" || block.type === "image") {
        const questionsErr = validateQuestions(block.questions, block.title.trim() || blockLabel(block.type));
        if (questionsErr) {
          toast.error(questionsErr);
          return;
        }
      }
      if (block.type === "video") {
        const checkpoint = Number(block.videoCheckpointSeconds);
        if (!Number.isFinite(checkpoint) || checkpoint <= 0) {
          toast.error(`El bloque "${block.title}" requiere un checkpoint de video en segundos mayor a 0.`);
          return;
        }
      }
      if (block.type === "interactive") {
        if (block.interactiveProvider !== "nativo") {
          toast.error(`Bloque "${block.title}": solo se permite proveedor 'nativo'.`);
          return;
        }

        if (block.nativeActivityType === "quiz") {
          const questionsErr = validateQuestions(block.questions, block.title.trim() || "Quiz");
          if (questionsErr) {
            toast.error(questionsErr);
            return;
          }
        } else if (block.nativeActivityType === "true_false") {
          const questionsErr = validateQuestions(block.questions, block.title.trim() || "Verdadero / Falso");
          if (questionsErr) {
            toast.error(questionsErr);
            return;
          }
          const hasValidBinaryOptions = block.questions.every((question) => question.options.length === 2);
          if (!hasValidBinaryOptions) {
            toast.error(`La actividad "${block.title}" de Verdadero / Falso requiere exactamente 2 opciones por pregunta.`);
            return;
          }
        } else if (block.nativeActivityType === "fill_in_the_blank") {
          if (!block.fillBlankText.trim()) {
            toast.error(`La actividad "${block.title}" requiere un texto base con espacios en blanco.`);
            return;
          }
          const blankCount = countFillBlankSlots(block.fillBlankText);
          if (blankCount === 0) {
            toast.error(`La actividad "${block.title}" debe contener al menos un espacio marcado con ____.`);
            return;
          }
          const answers = block.fillBlankAnswers.filter((entry) => entry.text.trim());
          if (answers.length < blankCount) {
            toast.error(`La actividad "${block.title}" requiere una respuesta correcta por cada espacio detectado.`);
            return;
          }
          const wordBank = block.fillBlankWordBank.filter((entry) => entry.text.trim());
          if (wordBank.length === 0) {
            toast.error(`La actividad "${block.title}" requiere al menos una palabra falsa en el banco de palabras.`);
            return;
          }
        } else if (block.nativeActivityType === "matching") {
          const validPairs = block.matchingPairs.filter((pair) => pair.leftText.trim() && pair.rightText.trim());
          if (validPairs.length < 2) {
            toast.error(`La actividad "${block.title}" requiere al menos 2 pares completos.`);
            return;
          }
        } else if (block.nativeActivityType === "ordering") {
          const validItems = block.orderingItems.filter((item) => item.text.trim());
          if (validItems.length < 2) {
            toast.error(`La actividad "${block.title}" requiere al menos 2 elementos para ordenar.`);
            return;
          }
        }

        if (block.nativeQuickQuizEnabled && (block.nativeActivityType === "quiz" || block.nativeActivityType === "true_false")) {
          const quickSeconds = Number(block.nativeQuickTimeSeconds);
          if (!Number.isFinite(quickSeconds) || quickSeconds <= 0) {
            toast.error(`La actividad "${block.title}" requiere un tiempo por pregunta mayor a 0 para Quiz veloz.`);
            return;
          }
        }
      }
    }

    if (!usarSoloCalificacionLeccion) {
      const pesoLeccionValue = Number(pesoCalificacionLeccion);
      const pesoContenidoValue = Number(pesoCalificacionContenido);

      if (!Number.isFinite(pesoLeccionValue) || pesoLeccionValue < 0 || pesoLeccionValue > 100) {
        toast.error("El peso de la evaluación final debe estar entre 0 y 100%.");
        return;
      }
      if (!Number.isFinite(pesoContenidoValue) || pesoContenidoValue < 0 || pesoContenidoValue > 100) {
        toast.error("El peso del contenido del tema debe estar entre 0 y 100%.");
        return;
      }
      if (Math.abs(pesoLeccionValue + pesoContenidoValue - 100) > 0.1) {
        toast.error("El peso de evaluación final y contenido debe sumar 100%.");
        return;
      }
      if (contenidoCalificableTotal === 0 && pesoContenidoValue > 0) {
        toast.error("Define bloques calificables cuya suma interna sea 100% cuando el contenido del tema tiene peso.");
        return;
      }
      if (contenidoCalificableTotal !== 0 && Math.abs(contenidoCalificableTotal - 100) > 0.1) {
        toast.error("La suma de los bloques calificables debe ser exactamente 100%.");
        return;
      }
      if (pesoContenidoValue === 0 && contenidoCalificableTotal > 0) {
        toast.error("No puede haber bloques calificables cuando el contenido del tema tiene peso 0%.");
        return;
      }
    }

    setSaving(true);
    try {
      await api.put(`/temas/${topic.id}`, {
        usar_solo_calificacion_leccion: usarSoloCalificacionLeccion,
        peso_calificacion_leccion: usarSoloCalificacionLeccion ? 100 : Number(pesoCalificacionLeccion),
        peso_calificacion_contenido: usarSoloCalificacionLeccion ? 0 : Number(pesoCalificacionContenido),
      });

      for (const [blockIndex, block] of blocks.entries()) {
        let lesson: Leccion;
        const isExistingLesson = existingLessonIds.has(block.id);

        if (isExistingLesson) {
          await api.put(`/lecciones/${block.id}`, {
            titulo: block.title.trim(),
            descripcion: block.description.trim() || null,
            orden: blockIndex + 1,
            nivel: "tema_contenido",
          });
          lesson = { id: block.id } as Leccion;
          await deleteLessonSections(block.id);
        } else {
          const lessonRes = await api.post<Leccion | ApiEnvelope<Leccion>>("/lecciones", {
            tema_id: topic.id,
            titulo: block.title.trim(),
            descripcion: block.description.trim() || null,
            nivel: "tema_contenido",
            orden: blockIndex + 1,
          });
          lesson = unwrapApiData(lessonRes);
        }

        let sectionOrder = 1;

        if (block.type === "document" || block.type === "video" || block.type === "image") {
          const source = block.sourceMode === "file" ? block.sourceFileDataUrl : block.sourceUrl.trim();
          const resourceRes = await api.post<{ id: string } | ApiEnvelope<{ id: string }>>("/recursos", {
            titulo: block.title.trim(),
            descripcion: block.description.trim() || null,
            tipo: inferResourceType(block),
            archivo_url: source || null,
            texto_html: null,
            tags: [],
            es_publico: false,
          });
          const resource = unwrapApiData(resourceRes);
          const resourceSectionRes = await api.post<LeccionSeccion | ApiEnvelope<LeccionSeccion>>("/secciones", {
            leccion_id: lesson.id,
            tipo: "recurso",
            recurso_id: resource.id,
            orden: sectionOrder,
            visible: true,
            es_obligatorio: true,
          });
          const resourceSection = unwrapApiData(resourceSectionRes);
          sectionOrder += 1;

          if (block.questions.length > 0) {
            const quizId = await createQuizForLesson(
              lesson.id,
              `${block.title.trim()} - Preguntas`,
              block.questions
            );
            const pesoContenidoValue = usarSoloCalificacionLeccion ? 0 : Number(pesoCalificacionContenido);
            const bloquePesoRelativo = block.calificable ? Number(block.calificacionPeso) : 0;
            const pesoPorBloque = block.calificable ? (bloquePesoRelativo * pesoContenidoValue) / 100 : 0;
            const quizSectionRes = await api.post<LeccionSeccion | ApiEnvelope<LeccionSeccion>>("/secciones", {
              leccion_id: lesson.id,
              tipo: "prueba",
              prueba_id: quizId,
              orden: sectionOrder,
              visible: true,
              es_obligatorio: true,
              calificable: block.calificable,
              nota_maxima: 100,
              peso_calificacion: Number(pesoPorBloque.toFixed(2)),
            });
            const quizSection = unwrapApiData(quizSectionRes);
            sectionOrder += 1;

            if (block.type === "video") {
              const checkpoint = Math.max(1, Math.round(Number(block.videoCheckpointSeconds)));
              await api.put(`/secciones/${resourceSection.id}/gating-pdf`, {
                habilitado: true,
                seccion_preguntas_id: quizSection.id,
                puntaje_minimo: 100,
                requiere_responder_todas: true,
                checkpoint_segundos: checkpoint,
              });
            }
          }
        }

        if (block.type === "interactive") {
          if (block.interactiveProvider !== "nativo") {
            toast.error(`Bloque "${block.title}": solo se permite proveedor 'nativo'. Provider actual: ${block.interactiveProvider}`);
            return;
          }
          const nativeConfig = buildNativeInteractiveConfig(block);
          const activityRes = await api.post<{ id: string } | ApiEnvelope<{ id: string }>>("/actividades-interactivas", {
            leccion_id: lesson.id,
            titulo: block.title.trim(),
            descripcion: block.description.trim() || null,
            proveedor: "nativo",
            embed_url: "",
            regla_completitud: block.calificable ? "puntaje" : "manual",
            puntaje_maximo: 100,
            intentos_maximos: null,
            configuracion: nativeConfig,
            activo: true,
          });
          const activity = unwrapApiData(activityRes);
          await api.post("/secciones", {
            leccion_id: lesson.id,
            tipo: "actividad_interactiva",
            actividad_interactiva_id: activity.id,
            orden: sectionOrder,
            visible: true,
            es_obligatorio: true,
          });
        }
      }

      await Promise.resolve(onSaved());
      toast.success("Tema configurado correctamente.");
      onClose();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-6xl max-h-[92vh] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-violet-700">Configurar tema</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{topic.nombre}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Agrega bloques, configura contenido y preguntas, y ordena el recorrido de aprendizaje.
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <X size={14} />
            Cerrar
          </button>
        </header>

        <div className="p-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Ponderación del tema</p>
                <p className="mt-1 text-sm text-slate-600">
                  {blocks.length === 0
                    ? "Este tema no tiene contenido interno. La evaluación final se considera 100%."
                    : "Divide el porcentaje entre evaluación final y contenido calificado."
                  }
                </p>
              </div>
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                <span className="font-semibold">Total:</span>
                <span>{blocks.length === 0 ? "100% final" : "100% final + contenido"}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[auto,1fr] sm:items-center">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={usarSoloCalificacionLeccion}
                    disabled={blocks.length === 0}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUsarSoloCalificacionLeccion(checked);
                      if (checked) {
                        setPesoCalificacionLeccion("100");
                        setPesoCalificacionContenido("0");
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600"
                  />
                  Usar solo la evaluación final de lección
                </label>
                <button
                  type="button"
                  disabled={blocks.length === 0}
                  onClick={() => {
                    setUsarSoloCalificacionLeccion(false);
                    setPesoCalificacionLeccion("0");
                    setPesoCalificacionContenido("100");
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Puntaje solo de contenido
                </button>
              </div>

              {!usarSoloCalificacionLeccion && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-800">
                    Peso evaluación final (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={pesoCalificacionLeccion}
                      onChange={(e) => setPesoCalificacionLeccion(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-sm text-slate-800">
                    Peso contenido del tema (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={pesoCalificacionContenido}
                      onChange={(e) => setPesoCalificacionContenido(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <p className="sm:col-span-2 text-xs text-slate-500">
                    Los bloques marcados como calificables deben sumar 100% entre sí. Ese 100% se escala al {pesoCalificacionContenidoComputed.toFixed(1)}% del tema.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => addBlock("document")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <FileText size={16} /> PDF / Word / PowerPoint
            </button>
            <button
              type="button"
              onClick={() => addBlock("video")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <Video size={16} /> Video con preguntas
            </button>
            <button
              type="button"
              onClick={() => addBlock("image")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <ImageIcon size={16} /> Imagen con preguntas
            </button>
            <button
              type="button"
              onClick={() => addBlock("interactive")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <Puzzle size={16} /> Actividad interactiva
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 p-4 pt-5">
          {loadingBlocks ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
              <div className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Cargando contenidos...
              </div>
            </div>
          ) : blocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
              Aún no hay bloques. Agrega contenido para configurar el tema.
            </div>
          ) : (
            <div className="space-y-4">
              {blocks.map((block, index) => (
                <article
                  key={block.id}
                  draggable
                  onDragStart={() => setDraggingId(block.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!draggingId || draggingId === block.id) return;
                    const from = blocks.findIndex((item) => item.id === draggingId);
                    const to = blocks.findIndex((item) => item.id === block.id);
                    setBlocks((prev) => moveItem(prev, from, to));
                    setDraggingId(null);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`rounded-xl border p-4 ${draggingId === block.id ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-800">
                      <GripVertical size={15} className="text-slate-400" />
                      <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                        #{index + 1}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold">
                        {blockIcon(block.type)}
                        {blockLabel(block.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveBlockUp(index)}
                        disabled={index === 0}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        title="Subir"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlockDown(index)}
                        disabled={index === blocks.length - 1}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        title="Bajar"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                        title="Eliminar bloque"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-800">
                      Título
                      <input
                        value={block.title}
                        onChange={(e) => updateBlock(block.id, (prev) => ({ ...prev, title: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="text-sm text-slate-800 md:col-span-2">
                      Descripción
                      <textarea
                        value={block.description}
                        onChange={(e) => updateBlock(block.id, (prev) => ({ ...prev, description: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 min-h-[72px]"
                      />
                    </label>
                  </div>

                  {(block.type === "document" || block.type === "video" || block.type === "image") && (
                    <div className={`mt-4 rounded-2xl border-2 p-5 shadow-md transition-all ${
                      block.type === "image"
                        ? "border-gradient-to-r from-pink-300 to-orange-300 bg-gradient-to-br from-pink-50 to-orange-50"
                        : block.type === "video"
                          ? "border-slate-300 bg-gradient-to-br from-blue-50 to-white"
                          : "border-slate-300 bg-gradient-to-br from-slate-50 to-white"
                    }`}>
                      <div className="mb-4 flex items-center gap-3">
                        <div className={`p-2.5 rounded-lg ${
                          block.type === "image"
                            ? "bg-gradient-to-br from-pink-200 to-orange-200"
                            : block.type === "video"
                              ? "bg-gradient-to-br from-blue-200 to-cyan-200"
                              : "bg-slate-200"
                        }`}>
                          {block.type === "image" ? (
                            <ImageIcon size={18} className="text-orange-700" />
                          ) : block.type === "video" ? (
                            <Video size={18} className="text-blue-700" />
                          ) : (
                            <FileText size={18} className="text-slate-700" />
                          )}
                        </div>
                        <h4 className={`text-sm font-bold ${
                          block.type === "image"
                            ? "text-orange-900"
                            : block.type === "video"
                              ? "text-blue-900"
                              : "text-slate-900"
                        }`}>
                          {block.type === "image" ? "Configurar Imagen" : block.type === "video" ? "Configurar Video" : "Configurar Documento"}
                        </h4>
                      </div>
                      
                      <div className={`mb-4 flex gap-2 rounded-xl p-3 ${
                        block.type === "image"
                          ? "bg-white/70"
                          : "bg-white"
                      }`}>
                        <button
                          type="button"
                          onClick={() => updateBlock(block.id, (prev) => ({ ...prev, sourceMode: "url" }))}
                          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                            block.sourceMode === "url"
                              ? block.type === "image"
                                ? "bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg"
                                : "bg-violet-600 text-white shadow-lg"
                              : "border-2 border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          🔗 URL
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBlock(block.id, (prev) => ({ ...prev, sourceMode: "file" }))}
                          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                            block.sourceMode === "file"
                              ? block.type === "image"
                                ? "bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg"
                                : "bg-violet-600 text-white shadow-lg"
                              : "border-2 border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          💾 Local
                        </button>
                      </div>

                      {block.sourceMode === "url" ? (
                        <div className="space-y-4">
                          <label className="block">
                            <span className={`text-sm font-semibold ${block.type === "image" ? "text-orange-900" : "text-slate-900"}`}>
                              URL del {block.type === "image" ? "Archivo de Imagen" : block.type === "video" ? "Video" : "Documento"}
                            </span>
                            <input
                              value={block.sourceUrl}
                              onChange={(e) =>
                                updateBlock(block.id, (prev) => ({
                                  ...prev,
                                  sourceUrl: e.target.value,
                                }))
                              }
                              placeholder={block.type === "image" ? "https://ejemplo.com/imagen.jpg" : "https://..."}
                              className={`mt-2 w-full rounded-lg border-2 px-4 py-2.5 text-sm placeholder-slate-400 transition-all focus:outline-none ${
                                block.type === "image"
                                  ? "border-pink-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-300"
                                  : "border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-300"
                              }`}
                            />
                          </label>
                          {block.type === "image" && block.sourceUrl && (
                            <div className="mt-4 rounded-xl border-3 border-dashed border-orange-200 bg-gradient-to-b from-white to-orange-50 p-4 overflow-hidden">
                              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-orange-700">📸 Vista Previa:</p>
                              <div className="rounded-lg bg-white p-3 shadow-inner">
                                <img 
                                  src={block.sourceUrl} 
                                  alt="Preview" 
                                  className="max-h-72 max-w-full rounded-lg object-contain shadow-md mx-auto"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <label className={`flex cursor-pointer items-center justify-center gap-3 rounded-xl border-3 border-dashed p-6 transition-all ${
                            block.type === "image"
                              ? "border-orange-300 bg-gradient-to-br from-orange-100 to-pink-100 hover:from-orange-200 hover:to-pink-200 text-orange-700"
                              : "border-violet-300 bg-gradient-to-br from-violet-100 to-fuchsia-100 hover:from-violet-200 hover:to-fuchsia-200 text-violet-700"
                          }`}>
                            <div className="text-center">
                              <Upload size={28} className="mx-auto mb-2" />
                              <span className="font-bold text-base">Selecciona un archivo</span>
                              <span className="block text-xs mt-1 opacity-80">o arrastra aquí</span>
                            </div>
                            <input
                              type="file"
                              className="hidden"
                              accept={
                                block.type === "document"
                                  ? ".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                  : block.type === "video"
                                    ? "video/*"
                                    : "image/*"
                              }
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                void onFilePicked(block.id, file);
                              }}
                            />
                          </label>

                          {block.sourceMode === "file" && block.sourceFileName && (
                            <div className={`rounded-xl border-2 p-4 ${
                              block.type === "image"
                                ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-green-50"
                                : "border-emerald-300 bg-emerald-50"
                            }`}>
                              <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${
                                    block.type === "image"
                                      ? "bg-emerald-200"
                                      : "bg-emerald-200"
                                  }`}>
                                    <CheckCircle size={20} className="text-emerald-700" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-emerald-900">Archivo cargado exitosamente</p>
                                    <p className="text-xs text-emerald-700">{block.sourceFileName}</p>
                                  </div>
                                </div>
                              </div>
                              {block.type === "image" && block.sourceFileDataUrl && (
                                <div className="rounded-lg border-3 border-dashed border-emerald-200 bg-white p-4 overflow-hidden">
                                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">📸 Vista Previa:</p>
                                  <img 
                                    src={block.sourceFileDataUrl} 
                                    alt="Preview" 
                                    className="max-h-72 max-w-full rounded-lg object-contain shadow-md mx-auto"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {block.type === "interactive" && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="text-sm text-slate-800">
                          Proveedor
                          <div className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-2 py-1.5 text-slate-700">
                            Nativa (quiz interno)
                          </div>
                        </label>

                        <label className="text-sm text-slate-800">
                          Tipo de actividad
                          <select
                            value={block.nativeActivityType}
                            onChange={(e) => setNativeActivityType(block.id, e.target.value as InteractiveMode)}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
                          >
                            <option value="quiz">Quiz</option>
                            <option value="true_false">Verdadero / Falso</option>
                            <option value="fill_in_the_blank">Completar espacios</option>
                            <option value="matching">Emparejar</option>
                            <option value="ordering">Ordenar</option>
                          </select>
                        </label>

                        <div className="text-sm text-emerald-800 md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                          Actividad nativa: se ejecuta dentro de la plataforma y no requiere URL de embed.
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:col-span-2 rounded-lg border border-slate-200 bg-white p-3">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              checked={block.calificable}
                              onChange={(e) => updateBlock(block.id, (prev) => ({ ...prev, calificable: e.target.checked }))}
                            />
                            Calificable
                          </label>
                          <label className="text-sm text-slate-800">
                            Peso (%)
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={block.calificacionPeso}
                              onChange={(e) => updateBlock(block.id, (prev) => ({ ...prev, calificacionPeso: e.target.value }))}
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                            />
                          </label>
                        </div>
                      </div>

                      {(block.nativeActivityType === "quiz" || block.nativeActivityType === "true_false") && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 rounded-lg border border-indigo-200 bg-white p-3">
                          <label className="text-sm text-slate-800 inline-flex items-center gap-2 md:col-span-2">
                            <input
                              type="checkbox"
                              checked={block.nativeQuickQuizEnabled}
                              onChange={(e) =>
                                updateBlock(block.id, (prev) => ({ ...prev, nativeQuickQuizEnabled: e.target.checked }))
                              }
                            />
                            Activar modo Quiz veloz (una pregunta por vez)
                          </label>
                          {block.nativeQuickQuizEnabled && (
                            <>
                              <label className="text-sm text-slate-800">
                                Tiempo por pregunta (segundos)
                                <input
                                  type="number"
                                  min={1}
                                  value={block.nativeQuickTimeSeconds}
                                  onChange={(e) =>
                                    updateBlock(block.id, (prev) => ({ ...prev, nativeQuickTimeSeconds: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                                />
                              </label>
                              <label className="text-sm text-slate-800 inline-flex items-center gap-2 pt-6">
                                <input
                                  type="checkbox"
                                  checked={block.nativeQuickAutoSkipOnTimeout}
                                  onChange={(e) =>
                                    updateBlock(block.id, (prev) => ({ ...prev, nativeQuickAutoSkipOnTimeout: e.target.checked }))
                                  }
                                />
                                Auto-saltar cuando se agote el tiempo
                              </label>
                            </>
                          )}
                        </div>
                      )}

                      {block.nativeActivityType === "quiz" && (
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-800">Preguntas de Quiz</p>
                            <button
                              type="button"
                              onClick={() => addQuestion(block.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700"
                            >
                              <Plus size={13} />
                              Agregar pregunta
                            </button>
                          </div>

                          <div className="space-y-3">
                            {block.questions.map((question, qIdx) => (
                              <div key={question.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                                    Pregunta {qIdx + 1}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => removeQuestion(block.id, question.id)}
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                                <input
                                  value={question.prompt}
                                  onChange={(e) => updateQuestionPrompt(block.id, question.id, e.target.value)}
                                  placeholder="Escribe el enunciado..."
                                  className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                />
                                <div className="space-y-2">
                                  {question.options.map((option) => (
                                    <div key={option.id} className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        name={`correct-${question.id}`}
                                        checked={option.isCorrect}
                                        onChange={() => setCorrectOption(block.id, question.id, option.id)}
                                      />
                                      <input
                                        value={option.text}
                                        onChange={(e) => updateOptionText(block.id, question.id, option.id, e.target.value)}
                                        placeholder="Opción..."
                                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeOption(block.id, question.id, option.id)}
                                        className="text-xs text-red-600 hover:underline"
                                      >
                                        Quitar
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => addOption(block.id, question.id)}
                                  className="mt-2 text-xs font-medium text-violet-700 hover:underline"
                                >
                                  + Agregar opción
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {block.nativeActivityType === "true_false" && (
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-800">Preguntas de Verdadero / Falso</p>
                            <button
                              type="button"
                              onClick={() => addQuestion(block.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700"
                            >
                              <Plus size={13} />
                              Agregar pregunta
                            </button>
                          </div>

                          <div className="space-y-3">
                            {block.questions.map((question, qIdx) => (
                              <div key={question.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                                    Pregunta {qIdx + 1}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => removeQuestion(block.id, question.id)}
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                                <input
                                  value={question.prompt}
                                  onChange={(e) => updateQuestionPrompt(block.id, question.id, e.target.value)}
                                  placeholder="Escribe el enunciado..."
                                  className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                />
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                  <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                    <input
                                      type="radio"
                                      name={`tf-${question.id}`}
                                      checked={question.options[0]?.isCorrect === true}
                                      onChange={() => updateQuestionOptions(block.id, question.id, [
                                        { id: question.options[0]?.id || makeId(), text: "Verdadero", isCorrect: true },
                                        { id: question.options[1]?.id || makeId(), text: "Falso", isCorrect: false },
                                      ])}
                                    />
                                    Verdadero
                                  </label>
                                  <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                    <input
                                      type="radio"
                                      name={`tf-${question.id}`}
                                      checked={question.options[1]?.isCorrect === true}
                                      onChange={() => updateQuestionOptions(block.id, question.id, [
                                        { id: question.options[0]?.id || makeId(), text: "Verdadero", isCorrect: false },
                                        { id: question.options[1]?.id || makeId(), text: "Falso", isCorrect: true },
                                      ])}
                                    />
                                    Falso
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {block.nativeActivityType === "fill_in_the_blank" && (
                        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3">
                          <label className="text-sm text-slate-800 block">
                            Texto base con espacios
                            <textarea
                              value={block.fillBlankText}
                              onChange={(e) => {
                                const nextText = e.target.value;
                                updateFillBlankText(block.id, nextText);
                                const blankCount = countFillBlankSlots(nextText);
                                if (blankCount > 0) {
                                  updateBlock(block.id, (prev) => ({
                                    ...prev,
                                    fillBlankAnswers: syncFillBlankEntries(prev.fillBlankAnswers, blankCount),
                                  }));
                                }
                              }}
                              placeholder="Escribe el texto y usa ____ en cada espacio"
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 min-h-[96px]"
                            />
                          </label>

                          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            Espacios detectados: <span className="font-semibold">{countFillBlankSlots(block.fillBlankText)}</span>. Escribe una respuesta correcta por cada espacio; el banco falso va aparte.
                          </div>

                          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-800">Respuestas correctas por espacio</p>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextCount = Math.max(1, countFillBlankSlots(block.fillBlankText));
                                  updateBlock(block.id, (prev) => ({
                                    ...prev,
                                    fillBlankAnswers: syncFillBlankEntries(prev.fillBlankAnswers, nextCount),
                                  }));
                                }}
                                className="text-xs font-medium text-violet-700 hover:underline"
                              >
                                Sincronizar espacios
                              </button>
                            </div>
                            {countFillBlankSlots(block.fillBlankText) === 0 ? (
                              <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                                Agrega al menos un espacio con ____ en el texto para definir las respuestas correctas.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {Array.from({ length: countFillBlankSlots(block.fillBlankText) }).map((_, index) => (
                                  <div key={`blank-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[auto,1fr] md:items-center">
                                    <span className="rounded-md bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 border border-slate-200">
                                      Espacio {index + 1}
                                    </span>
                                    <input
                                      value={block.fillBlankAnswers[index]?.text || ""}
                                      onChange={(e) => updateFillBlankAnswerAtIndex(block.id, index, e.target.value)}
                                      placeholder="Palabra correcta para este espacio"
                                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-800">Banco de palabras falsas</p>
                              <button
                                type="button"
                                onClick={() => addFillBlankWordBankEntry(block.id)}
                                className="text-xs font-medium text-violet-700 hover:underline"
                              >
                                + Agregar palabra falsa
                              </button>
                            </div>
                            <p className="text-xs text-slate-500">Aquí van solo distractores. No pongas aquí las respuestas correctas.</p>
                            <div className="space-y-2">
                              {block.fillBlankWordBank.length === 0 ? (
                                <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                                  Aún no hay palabras falsas.
                                </div>
                              ) : (
                                block.fillBlankWordBank.map((entry) => (
                                  <div key={entry.id} className="flex items-center gap-2">
                                    <input
                                      value={entry.text}
                                      onChange={(e) => updateFillBlankWordBankEntry(block.id, entry.id, e.target.value)}
                                      placeholder="Palabra falsa"
                                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeFillBlankWordBankEntry(block.id, entry.id)}
                                      className="text-xs text-red-600 hover:underline"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-slate-500">
                            Usa <span className="font-semibold">____</span> donde el estudiante deberá completar el texto.
                          </p>
                        </div>
                      )}

                      {block.nativeActivityType === "matching" && (
                        <NativeActivityMatchingForm
                          pairs={block.matchingPairs}
                          onPairsChange={(pairs) => updateBlock(block.id, (prev) => ({ ...prev, matchingPairs: pairs }))}
                          description="Crea pares de conceptos y respuestas. Esta UI reemplaza completamente los formatos antiguos."
                        />
                      )}

                      {block.nativeActivityType === "ordering" && (
                        <NativeActivityOrderingForm
                          items={block.orderingItems}
                          onItemsChange={(items) => updateBlock(block.id, (prev) => ({ ...prev, orderingItems: items }))}
                          description="Define el orden correcto de los elementos."
                        />
                      )}
                    </div>
                  )}

                  {(block.type === "video" || block.type === "image") && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      {block.type === "video" && (
                        <label className="mb-3 block text-sm text-slate-800">
                          Checkpoint del video (segundos)
                          <input
                            type="number"
                            min={1}
                            value={block.videoCheckpointSeconds}
                            onChange={(e) => updateBlock(block.id, (prev) => ({ ...prev, videoCheckpointSeconds: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>
                      )}
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800">Preguntas configurables</p>
                        <div className="flex flex-wrap gap-2">
                          <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={block.calificable}
                              onChange={(e) => updateBlock(block.id, (prev) => ({ ...prev, calificable: e.target.checked }))}
                            />
                            Calificable
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                            Peso (%)
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={block.calificacionPeso}
                              onChange={(e) => updateBlock(block.id, (prev) => ({ ...prev, calificacionPeso: e.target.value }))}
                              className="w-20 rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => addQuestion(block.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700"
                          >
                            <Plus size={13} />
                            Agregar pregunta
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {block.questions.map((question, qIdx) => (
                          <div key={question.id} className="rounded-md border border-slate-200 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                                Pregunta {qIdx + 1}
                              </p>
                              <button
                                type="button"
                                onClick={() => removeQuestion(block.id, question.id)}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Eliminar
                              </button>
                            </div>
                            <input
                              value={question.prompt}
                              onChange={(e) => updateQuestionPrompt(block.id, question.id, e.target.value)}
                              placeholder="Escribe el enunciado..."
                              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            />
                            <div className="space-y-2">
                              {question.options.map((option) => (
                                <div key={option.id} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct-${question.id}`}
                                    checked={option.isCorrect}
                                    onChange={() => setCorrectOption(block.id, question.id, option.id)}
                                  />
                                  <input
                                    value={option.text}
                                    onChange={(e) => updateOptionText(block.id, question.id, option.id, e.target.value)}
                                    placeholder="Opción..."
                                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeOption(block.id, question.id, option.id)}
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => addOption(block.id, question.id)}
                              className="mt-2 text-xs font-medium text-violet-700 hover:underline"
                            >
                              + Agregar opción
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
          <p className="text-xs text-slate-600">
            Consejo: puedes arrastrar bloques, o usar flechas para definir el orden del avance del tema.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void onSaveTopicConfiguration()}
              disabled={!canSave}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? "Guardando configuración..." : "Guardar tema"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
