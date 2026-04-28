import { useEffect, useMemo, useState } from "react";
import { FileQuestion, Loader2, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import api from "@/shared/lib/api";
import type { Leccion, Prueba, PruebaCompleta } from "@/shared/types";

interface ApiEnvelope<T> {
  data: T;
}

interface LessonFinalQuizModalProps {
  open: boolean;
  lesson: Leccion | null;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
}

interface OptionDraft {
  localId: string;
  id?: string;
  text: string;
  isCorrect: boolean;
}

interface QuestionDraft {
  localId: string;
  id?: string;
  prompt: string;
  score: string;
  options: OptionDraft[];
}

interface NormalizedOption {
  id?: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

interface NormalizedQuestion {
  id?: string;
  prompt: string;
  score: number;
  order: number;
  options: NormalizedOption[];
}

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

function createDefaultOptions(): OptionDraft[] {
  return [
    { localId: makeId(), text: "", isCorrect: true },
    { localId: makeId(), text: "", isCorrect: false },
    { localId: makeId(), text: "", isCorrect: false },
    { localId: makeId(), text: "", isCorrect: false },
  ];
}

function createQuestionDraft(): QuestionDraft {
  return {
    localId: makeId(),
    prompt: "",
    score: "1",
    options: createDefaultOptions(),
  };
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Error inesperado";
}

export function LessonFinalQuizModal({ open, lesson, onClose, onSaved }: LessonFinalQuizModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pruebaId, setPruebaId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [notaMaxima, setNotaMaxima] = useState("100");
  const [puntajeMinimo, setPuntajeMinimo] = useState("60");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  const canSave = useMemo(() => !!lesson && !loading && !saving, [lesson, loading, saving]);

  useEffect(() => {
    if (!open || !lesson) return;

    (async () => {
      setLoading(true);
      try {
        const pruebasRes = await api.get<Prueba[] | ApiEnvelope<Prueba[]>>(`/lecciones/${lesson.id}/pruebas`);
        const pruebas = unwrapApiData(pruebasRes) || [];
        const ordered = [...pruebas].sort((a, b) => {
          const byOrder = (a.orden ?? 0) - (b.orden ?? 0);
          if (byOrder !== 0) return byOrder;
          return (a.created_at || "").localeCompare(b.created_at || "");
        });
        const target = ordered[0];

        if (!target) {
          setPruebaId(null);
          setTitulo(`Prueba final - ${lesson.titulo}`);
          setNotaMaxima("100");
          setPuntajeMinimo("60");
          setQuestions([createQuestionDraft()]);
          return;
        }

        const completaRes = await api.get<PruebaCompleta | ApiEnvelope<PruebaCompleta>>(`/pruebas/${target.id}/completa`);
        const completa = unwrapApiData(completaRes);
        setPruebaId(completa.id);
        setTitulo(completa.titulo || `Prueba final - ${lesson.titulo}`);
        setNotaMaxima(String(completa.nota_maxima ?? 100));
        setPuntajeMinimo(String(completa.puntaje_minimo ?? 60));

        const mapped = (completa.preguntas || []).map((pregunta) => ({
          localId: makeId(),
          id: pregunta.id,
          prompt: pregunta.texto || "",
          score: String(pregunta.puntaje_maximo ?? 1),
          options:
            (pregunta.respuestas || []).map((respuesta) => ({
              localId: makeId(),
              id: respuesta.id,
              text: respuesta.texto || "",
              isCorrect: !!respuesta.es_correcta,
            })) || [],
        }));
        setQuestions(mapped.length > 0 ? mapped : [createQuestionDraft()]);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [lesson, open]);

  const closeModal = () => {
    if (saving) return;
    onClose();
  };

  const updateQuestion = (questionLocalId: string, updater: (prev: QuestionDraft) => QuestionDraft) => {
    setQuestions((prev) => prev.map((question) => (question.localId === questionLocalId ? updater(question) : question)));
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, createQuestionDraft()]);
  };

  const removeQuestion = (questionLocalId: string) => {
    setQuestions((prev) => prev.filter((question) => question.localId !== questionLocalId));
  };

  const addOption = (questionLocalId: string) => {
    updateQuestion(questionLocalId, (prev) => ({
      ...prev,
      options: [...prev.options, { localId: makeId(), text: "", isCorrect: false }],
    }));
  };

  const removeOption = (questionLocalId: string, optionLocalId: string) => {
    updateQuestion(questionLocalId, (prev) => ({
      ...prev,
      options: prev.options.filter((option) => option.localId !== optionLocalId),
    }));
  };

  const setCorrectOption = (questionLocalId: string, optionLocalId: string) => {
    updateQuestion(questionLocalId, (prev) => ({
      ...prev,
      options: prev.options.map((option) => ({
        ...option,
        isCorrect: option.localId === optionLocalId,
      })),
    }));
  };

  const normalizeQuestions = (): NormalizedQuestion[] => {
    if (questions.length === 0) {
      throw new Error("Agrega al menos una pregunta.");
    }

    return questions.map((question, index) => {
      const prompt = question.prompt.trim();
      if (!prompt) {
        throw new Error(`La pregunta ${index + 1} no tiene enunciado.`);
      }

      const score = Number(question.score);
      if (!Number.isFinite(score) || score <= 0) {
        throw new Error(`La pregunta ${index + 1} debe tener puntaje mayor a 0.`);
      }

      const options = question.options
        .map((option) => ({
          id: option.id,
          text: option.text.trim(),
          isCorrect: option.isCorrect,
        }))
        .filter((option) => option.text !== "")
        .map((option, optionIndex) => ({
          ...option,
          order: optionIndex + 1,
        }));

      if (options.length < 2) {
        throw new Error(`La pregunta ${index + 1} requiere minimo 2 opciones con texto.`);
      }
      if (!options.some((option) => option.isCorrect)) {
        throw new Error(`La pregunta ${index + 1} requiere una respuesta correcta.`);
      }

      return {
        id: question.id,
        prompt,
        score,
        order: index + 1,
        options,
      };
    });
  };

  const onSave = async () => {
    if (!lesson) return;
    const title = titulo.trim();
    if (!title) {
      toast.error("El titulo de la prueba es obligatorio.");
      return;
    }

    const nota = Number(notaMaxima);
    const minimo = Number(puntajeMinimo);
    if (!Number.isFinite(nota) || nota <= 0) {
      toast.error("La nota maxima debe ser mayor a 0.");
      return;
    }
    if (!Number.isFinite(minimo) || minimo < 0 || minimo > nota) {
      toast.error("El puntaje minimo debe estar entre 0 y la nota maxima.");
      return;
    }

    let normalizedQuestions: NormalizedQuestion[] = [];
    try {
      normalizedQuestions = normalizeQuestions();
    } catch (err) {
      toast.error(normalizeError(err));
      return;
    }

    setSaving(true);
    try {
      let workingPruebaId = pruebaId;

      if (!workingPruebaId) {
        const createdRes = await api.post<Prueba | ApiEnvelope<Prueba>>("/pruebas", {
          leccion_id: lesson.id,
          titulo: title,
          nota_maxima: nota,
          puntaje_minimo: minimo,
          peso_calificacion: 1,
          tiempo_limite: null,
          orden: 1,
        });
        const created = unwrapApiData(createdRes);
        workingPruebaId = created.id;
        setPruebaId(created.id);
      } else {
        await api.put(`/pruebas/${workingPruebaId}`, {
          titulo: title,
          nota_maxima: nota,
          puntaje_minimo: minimo,
          peso_calificacion: 1,
          tiempo_limite: null,
          orden: 1,
        });
      }

      if (!workingPruebaId) {
        throw new Error("No se pudo preparar la prueba final.");
      }

      const beforeSyncRes = await api.get<PruebaCompleta | ApiEnvelope<PruebaCompleta>>(`/pruebas/${workingPruebaId}/completa`);
      const beforeSync = unwrapApiData(beforeSyncRes);
      const existingQuestions = beforeSync.preguntas || [];
      const incomingQuestionIds = new Set(normalizedQuestions.map((question) => question.id).filter(Boolean) as string[]);

      for (const existingQuestion of existingQuestions) {
        if (!incomingQuestionIds.has(existingQuestion.id)) {
          await api.delete(`/preguntas/${existingQuestion.id}`);
        }
      }

      for (const question of normalizedQuestions) {
        let workingQuestionId = question.id;
        if (workingQuestionId) {
          await api.put(`/preguntas/${workingQuestionId}`, {
            prueba_id: workingPruebaId,
            texto: question.prompt,
            tipo: "opcion_multiple",
            puntaje_maximo: question.score,
            orden: question.order,
          });
        } else {
          const createdQuestionRes = await api.post<{ id: string } | ApiEnvelope<{ id: string }>>("/preguntas", {
            prueba_id: workingPruebaId,
            texto: question.prompt,
            tipo: "opcion_multiple",
            puntaje_maximo: question.score,
            orden: question.order,
          });
          const createdQuestion = unwrapApiData(createdQuestionRes);
          workingQuestionId = createdQuestion.id;
        }

        const existingQuestion = existingQuestions.find((item) => item.id === workingQuestionId);
        const existingOptions = existingQuestion?.respuestas || [];
        const incomingOptionIds = new Set(question.options.map((option) => option.id).filter(Boolean) as string[]);

        for (const existingOption of existingOptions) {
          if (!incomingOptionIds.has(existingOption.id)) {
            await api.delete(`/respuestas/${existingOption.id}`);
          }
        }

        for (const option of question.options) {
          if (option.id) {
            await api.put(`/respuestas/${option.id}`, {
              pregunta_id: workingQuestionId,
              texto: option.text,
              es_correcta: option.isCorrect,
              orden: option.order,
            });
          } else {
            await api.post("/respuestas", {
              pregunta_id: workingQuestionId,
              texto: option.text,
              es_correcta: option.isCorrect,
              orden: option.order,
            });
          }
        }
      }

      toast.success("Prueba final guardada.");
      await Promise.resolve(onSaved?.());
      onClose();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !lesson) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4" onClick={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-700">Prueba final</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{lesson.titulo}</h2>
            <p className="mt-1 text-sm text-slate-600">Configura preguntas de cierre para este tema.</p>
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

        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 size={26} className="animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm text-slate-800 md:col-span-2">
                Titulo
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                  placeholder="Prueba final del tema"
                />
              </label>
              <label className="text-sm text-slate-800">
                Nota maxima
                <input
                  type="number"
                  min={1}
                  value={notaMaxima}
                  onChange={(e) => setNotaMaxima(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                />
              </label>
              <label className="text-sm text-slate-800">
                Puntaje minimo
                <input
                  type="number"
                  min={0}
                  value={puntajeMinimo}
                  onChange={(e) => setPuntajeMinimo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                />
              </label>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-4 space-y-3 bg-slate-50">
              {questions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 text-center">
                  No hay preguntas configuradas todavia.
                </div>
              ) : (
                questions.map((question, qIndex) => (
                  <article key={question.localId} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800">
                        <FileQuestion size={14} />
                        Pregunta {qIndex + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeQuestion(question.localId)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        <Trash2 size={12} />
                        Eliminar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <label className="text-sm text-slate-800 md:col-span-3">
                        Enunciado
                        <textarea
                          value={question.prompt}
                          onChange={(e) =>
                            updateQuestion(question.localId, (prev) => ({
                              ...prev,
                              prompt: e.target.value,
                            }))
                          }
                          rows={2}
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                        />
                      </label>
                      <label className="text-sm text-slate-800">
                        Puntaje
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={question.score}
                          onChange={(e) =>
                            updateQuestion(question.localId, (prev) => ({
                              ...prev,
                              score: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                        />
                      </label>
                    </div>

                    <div className="mt-3 space-y-2">
                      {question.options.map((option) => (
                        <div key={option.localId} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${question.localId}`}
                            checked={option.isCorrect}
                            onChange={() => setCorrectOption(question.localId, option.localId)}
                          />
                          <input
                            value={option.text}
                            onChange={(e) =>
                              updateQuestion(question.localId, (prev) => ({
                                ...prev,
                                options: prev.options.map((item) =>
                                  item.localId === option.localId ? { ...item, text: e.target.value } : item
                                ),
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            placeholder="Texto de opcion"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(question.localId, option.localId)}
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(question.localId)}
                        className="text-xs font-medium text-indigo-700 hover:underline"
                      >
                        + Agregar opcion
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                <Plus size={14} />
                Agregar pregunta
              </button>
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
                  onClick={() => void onSave()}
                  disabled={!canSave}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar prueba final"}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
