import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileQuestion,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Puzzle,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import api from "@/shared/lib/api";
import type { Leccion, LeccionSeccion, Tema } from "@/shared/types";

type BlockType = "document" | "video" | "image" | "quiz" | "interactive";
type InteractiveProvider = "h5p" | "genially" | "educaplay" | "nativo";

interface ApiEnvelope<T> {
  data: T;
}

interface OptionDraft {
  id: string;
  text: string;
  isCorrect: boolean;
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

function createBlock(type: BlockType): ContentBlockDraft {
  const labels: Record<BlockType, string> = {
    document: "Documento",
    video: "Video",
    image: "Imagen",
    quiz: "Preguntas del tema",
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
    questions: type === "video" || type === "image" || type === "quiz" ? [createQuestion()] : [],
    interactiveProvider: "h5p",
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

function blockLabel(type: BlockType): string {
  switch (type) {
    case "document":
      return "Documento (PDF / Word / PowerPoint)";
    case "video":
      return "Video con preguntas";
    case "image":
      return "Imagen con preguntas";
    case "quiz":
      return "Preguntas del tema";
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
    case "quiz":
      return <FileQuestion size={15} />;
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
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBlocks([]);
    setDraggingId(null);
  }, [open, topic?.id]);

  const canSave = useMemo(() => !saving && !!topic, [saving, topic]);

  if (!open || !topic) return null;

  const addBlock = (type: BlockType) => {
    setBlocks((prev) => [...prev, createBlock(type)]);
  };

  const updateBlock = (blockId: string, updater: (prev: ContentBlockDraft) => ContentBlockDraft) => {
    setBlocks((prev) => prev.map((block) => (block.id === blockId ? updater(block) : block)));
  };

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== blockId));
  };

  const moveBlockUp = (index: number) => {
    setBlocks((prev) => moveItem(prev, index, index - 1));
  };

  const moveBlockDown = (index: number) => {
    setBlocks((prev) => moveItem(prev, index, index + 1));
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
      questions: [...prev.questions, createQuestion()],
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

  const closeModal = () => {
    if (saving) return;
    onClose();
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
      if (block.type === "video" || block.type === "image" || block.type === "quiz") {
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
        if (block.interactiveProvider !== "nativo" && !block.interactiveEmbedUrl.trim()) {
          toast.error(`La actividad "${block.title}" requiere URL de embed.`);
          return;
        }
        if (block.interactiveProvider === "nativo") {
          const questionsErr = validateQuestions(block.questions, block.title.trim() || "Actividad nativa");
          if (questionsErr) {
            toast.error(questionsErr);
            return;
          }
          if (block.nativeQuickQuizEnabled) {
            const quickSeconds = Number(block.nativeQuickTimeSeconds);
            if (!Number.isFinite(quickSeconds) || quickSeconds <= 0) {
              toast.error(`La actividad "${block.title}" requiere un tiempo por pregunta mayor a 0 para Quiz veloz.`);
              return;
            }
          }
        }
      }
    }

    setSaving(true);
    try {
      for (const [blockIndex, block] of blocks.entries()) {
        const lessonRes = await api.post<Leccion | ApiEnvelope<Leccion>>("/lecciones", {
          tema_id: topic.id,
          titulo: block.title.trim(),
          descripcion: block.description.trim() || null,
          orden: blockIndex + 1,
        });
        const lesson = unwrapApiData(lessonRes);
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
            tipo: block.type === "video" ? "video" : "recurso",
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
            const quizSectionRes = await api.post<LeccionSeccion | ApiEnvelope<LeccionSeccion>>("/secciones", {
              leccion_id: lesson.id,
              tipo: "prueba",
              prueba_id: quizId,
              orden: sectionOrder,
              visible: true,
              es_obligatorio: true,
              calificable: true,
              nota_maxima: 100,
              peso_calificacion: 1,
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

        if (block.type === "quiz") {
          const quizId = await createQuizForLesson(lesson.id, block.title.trim(), block.questions);
          await api.post("/secciones", {
            leccion_id: lesson.id,
            tipo: "prueba",
            prueba_id: quizId,
            orden: sectionOrder,
            visible: true,
            es_obligatorio: true,
            calificable: true,
            nota_maxima: 100,
            peso_calificacion: 1,
          });
          sectionOrder += 1;
        }

        if (block.type === "interactive") {
          const quickTimePerQuestion = Math.max(1, Math.round(Number(block.nativeQuickTimeSeconds) || 0));
          const nativeConfig = block.interactiveProvider === "nativo"
            ? {
                native_activity_type: "quiz",
                score_threshold: 70,
                modo_quiz_veloz: block.nativeQuickQuizEnabled,
                quick_quiz: block.nativeQuickQuizEnabled,
                tiempo_por_pregunta_segundos: quickTimePerQuestion || 15,
                time_per_question_seconds: quickTimePerQuestion || 15,
                auto_saltar_timeout: block.nativeQuickAutoSkipOnTimeout,
                auto_skip_on_timeout: block.nativeQuickAutoSkipOnTimeout,
                preguntas: block.questions.map((question) => ({
                  prompt: question.prompt.trim(),
                  opciones: question.options
                    .filter((option) => option.text.trim())
                    .map((option) => ({
                      text: option.text.trim(),
                      isCorrect: option.isCorrect,
                    })),
                })),
              }
            : {};
          const activityRes = await api.post<{ id: string } | ApiEnvelope<{ id: string }>>("/actividades-interactivas", {
            leccion_id: lesson.id,
            titulo: block.title.trim(),
            descripcion: block.description.trim() || null,
            proveedor: block.interactiveProvider,
            embed_url: block.interactiveProvider === "nativo" ? "" : block.interactiveEmbedUrl.trim(),
            regla_completitud: block.interactiveProvider === "nativo" ? "puntaje" : "manual",
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
        className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
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

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => addBlock("document")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <FileText size={16} /> PDF / Word / PowerPoint
          </button>
          <button
            type="button"
            onClick={() => addBlock("video")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <Video size={16} /> Video con preguntas
          </button>
          <button
            type="button"
            onClick={() => addBlock("image")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <ImageIcon size={16} /> Imagen con preguntas
          </button>
          <button
            type="button"
            onClick={() => addBlock("quiz")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <FileQuestion size={16} /> Preguntas del tema
          </button>
          <button
            type="button"
            onClick={() => addBlock("interactive")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 md:col-span-2"
          >
            <Puzzle size={16} /> Actividad interactiva
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto border-t border-slate-100 p-4 pt-3">
          {blocks.length === 0 ? (
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
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateBlock(block.id, (prev) => ({ ...prev, sourceMode: "url" }))}
                          className={`rounded-md px-2 py-1 text-xs ${
                            block.sourceMode === "url"
                              ? "bg-violet-600 text-white"
                              : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          URL
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBlock(block.id, (prev) => ({ ...prev, sourceMode: "file" }))}
                          className={`rounded-md px-2 py-1 text-xs ${
                            block.sourceMode === "file"
                              ? "bg-violet-600 text-white"
                              : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          Archivo local
                        </button>
                      </div>

                      {block.sourceMode === "url" ? (
                        <label className="text-sm text-slate-800">
                          URL del archivo
                          <input
                            value={block.sourceUrl}
                            onChange={(e) =>
                              updateBlock(block.id, (prev) => ({
                                ...prev,
                                sourceUrl: e.target.value,
                              }))
                            }
                            placeholder="https://..."
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Upload size={14} />
                          Seleccionar archivo
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
                      )}

                      {block.sourceMode === "file" && block.sourceFileName && (
                        <p className="mt-2 text-xs text-slate-600">Archivo cargado: {block.sourceFileName}</p>
                      )}
                    </div>
                  )}

                  {block.type === "interactive" && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="text-sm text-slate-800">
                          Proveedor
                          <select
                            value={block.interactiveProvider}
                            onChange={(e) =>
                              updateBlock(block.id, (prev) => ({
                                ...prev,
                                interactiveProvider: e.target.value as InteractiveProvider,
                                questions:
                                  e.target.value === "nativo" && prev.questions.length === 0
                                    ? [createQuestion()]
                                    : prev.questions,
                              }))
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          >
                            <option value="h5p">H5P</option>
                            <option value="genially">Genially</option>
                            <option value="educaplay">Educaplay</option>
                            <option value="nativo">Nativa (quiz interno)</option>
                          </select>
                        </label>
                        {block.interactiveProvider !== "nativo" ? (
                          <label className="text-sm text-slate-800 md:col-span-2">
                            URL de embed
                            <input
                              value={block.interactiveEmbedUrl}
                              onChange={(e) =>
                                updateBlock(block.id, (prev) => ({ ...prev, interactiveEmbedUrl: e.target.value }))
                              }
                              placeholder="https://..."
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                            />
                          </label>
                        ) : (
                          <>
                            <div className="text-sm text-emerald-800 md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                              Actividad nativa: se ejecuta dentro de la plataforma y no requiere URL de embed.
                            </div>
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
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {(block.type === "video" || block.type === "image" || block.type === "quiz" || (block.type === "interactive" && block.interactiveProvider === "nativo")) && (
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
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">Preguntas configurables</p>
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
