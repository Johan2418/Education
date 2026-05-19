import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileQuestion, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import type { Trabajo, TrabajoPregunta, TrabajoPreguntaInput } from "@/shared/types/trabajos";
import { getTrabajoFormulario, updateTrabajoPreguntas } from "@/features/trabajos/services/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

interface OptionDraft {
  localId: string;
  text: string;
  isCorrect: boolean;
}

interface PreguntaInputWithDraftOptions extends TrabajoPreguntaInput {
  optionDrafts?: OptionDraft[];
}

function isClosedType(tipo: TrabajoPreguntaInput["tipo"]): boolean {
  return tipo === "opcion_multiple" || tipo === "verdadero_falso";
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultOptions(): OptionDraft[] {
  return [
    { localId: makeId(), text: "", isCorrect: true },
    { localId: makeId(), text: "", isCorrect: false },
    { localId: makeId(), text: "", isCorrect: false },
    { localId: makeId(), text: "", isCorrect: false },
  ];
}

function mapPreguntaToInput(pregunta: TrabajoPregunta): PreguntaInputWithDraftOptions {
  const opciones = Array.isArray(pregunta.opciones) ? pregunta.opciones : [];
  const respuestaCorrecta = pregunta.respuesta_correcta || "";
  
  // Create option drafts from the existing data
  const optionDrafts: OptionDraft[] = opciones.map((text, idx) => ({
    localId: makeId(),
    text,
    isCorrect: text === respuestaCorrecta,
  }));
  
  // If no options but it's a closed type, create defaults
  if (optionDrafts.length === 0 && isClosedType(pregunta.tipo)) {
    if (pregunta.tipo === "verdadero_falso") {
      optionDrafts.push(
        { localId: makeId(), text: "Verdadero", isCorrect: respuestaCorrecta === "Verdadero" },
        { localId: makeId(), text: "Falso", isCorrect: respuestaCorrecta === "Falso" }
      );
    } else {
      optionDrafts.push(...createDefaultOptions());
    }
  }

  return {
    texto: pregunta.texto || "",
    tipo: pregunta.tipo,
    opciones,
    respuesta_correcta: respuestaCorrecta,
    puntaje_maximo: pregunta.puntaje_maximo || 1,
    pagina_libro: pregunta.pagina_libro ?? undefined,
    confianza_ia: pregunta.confianza_ia ?? undefined,
    imagen_base64: pregunta.imagen_base64 ?? undefined,
    imagen_fuente: pregunta.imagen_fuente ?? undefined,
    respuesta_esperada_tipo: pregunta.respuesta_esperada_tipo ?? undefined,
    placeholder: pregunta.placeholder ?? undefined,
    orden: pregunta.orden,
    optionDrafts,
  };
}


function createEmptyPregunta(trabajo?: Trabajo | null): PreguntaInputWithDraftOptions {
  const isClosedEnded = !!trabajo?.calificacion_automatica && !trabajo?.extraido_de_libro;
  return {
    texto: "",
    tipo: isClosedEnded ? "opcion_multiple" : "respuesta_corta",
    opciones: isClosedEnded ? ["Opción 1", "Opción 2"] : [],
    respuesta_correcta: isClosedEnded ? "Opción 1" : "",
    puntaje_maximo: 1,
    respuesta_esperada_tipo: isClosedEnded ? "opciones" : "abierta",
    placeholder: "",
    optionDrafts: isClosedEnded ? createDefaultOptions() : [],
  };
}

export default function TeacherTrabajoPreguntas() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [preguntas, setPreguntas] = useState<PreguntaInputWithDraftOptions[]>([]);
  const allowMixedTypes = !!trabajo?.extraido_de_libro;

  const totalPuntaje = useMemo(
    () => preguntas.reduce((acc, pregunta) => acc + Number(pregunta.puntaje_maximo || 0), 0),
    [preguntas]
  );

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        if (!trabajoId) {
          navigate("/teacher/trabajos");
          return;
        }

        const payload = await getTrabajoFormulario(trabajoId);
        setTrabajo(payload.trabajo);
        const initial = (payload.preguntas || []).map(mapPreguntaToInput);
        setPreguntas(initial.length > 0 ? initial : [createEmptyPregunta(payload.trabajo)]);
      } catch (err) {
        toast.error(normalizeError(err));
        navigate("/teacher/trabajos");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, trabajoId]);

  const handleChange = (index: number, patch: Partial<PreguntaInputWithDraftOptions>) => {
    setPreguntas((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const updateOption = (preguntaIndex: number, optionLocalId: string, updater: (prev: OptionDraft) => OptionDraft) => {
    setPreguntas((prev) =>
      prev.map((pregunta, idx) => {
        if (idx !== preguntaIndex) return pregunta;
        const updatedOptions = (pregunta.optionDrafts || []).map((opt) =>
          opt.localId === optionLocalId ? updater(opt) : opt
        );
        return { ...pregunta, optionDrafts: updatedOptions };
      })
    );
  };

  const addOption = (preguntaIndex: number) => {
    setPreguntas((prev) =>
      prev.map((pregunta, idx) => {
        if (idx !== preguntaIndex) return pregunta;
        return {
          ...pregunta,
          optionDrafts: [...(pregunta.optionDrafts || []), { localId: makeId(), text: "", isCorrect: false }],
        };
      })
    );
  };

  const removeOption = (preguntaIndex: number, optionLocalId: string) => {
    setPreguntas((prev) =>
      prev.map((pregunta, idx) => {
        if (idx !== preguntaIndex) return pregunta;
        const updatedOptions = (pregunta.optionDrafts || []).filter((opt) => opt.localId !== optionLocalId);
        return { ...pregunta, optionDrafts: updatedOptions };
      })
    );
  };

  const setCorrectOption = (preguntaIndex: number, optionLocalId: string) => {
    setPreguntas((prev) =>
      prev.map((pregunta, idx) => {
        if (idx !== preguntaIndex) return pregunta;
        const updatedOptions = (pregunta.optionDrafts || []).map((opt) => ({
          ...opt,
          isCorrect: opt.localId === optionLocalId,
        }));
        return { ...pregunta, optionDrafts: updatedOptions };
      })
    );
  };

  const handleChangeTipo = (index: number, tipo: TrabajoPreguntaInput["tipo"]) => {
    setPreguntas((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (tipo === "verdadero_falso") {
          return {
            ...item,
            tipo,
            opciones: ["Verdadero", "Falso"],
            respuesta_correcta: "Verdadero",
            respuesta_esperada_tipo: "opciones",
            optionDrafts: [
              { localId: makeId(), text: "Verdadero", isCorrect: true },
              { localId: makeId(), text: "Falso", isCorrect: false },
            ],
          };
        }
        if (tipo === "opcion_multiple") {
          const existingOptions = item.optionDrafts || [];
          const hasValidOptions = existingOptions.length >= 2 && existingOptions.some((opt) => opt.text.trim() !== "");
          return {
            ...item,
            tipo,
            opciones: hasValidOptions ? existingOptions.map((opt) => opt.text).filter(Boolean) : ["Opción 1", "Opción 2"],
            respuesta_correcta: hasValidOptions ? (existingOptions.find((opt) => opt.isCorrect)?.text || "Opción 1") : "Opción 1",
            respuesta_esperada_tipo: "opciones",
            optionDrafts: hasValidOptions ? existingOptions : createDefaultOptions(),
          };
        }
        return {
          ...item,
          tipo,
          opciones: [],
          respuesta_correcta: "",
          respuesta_esperada_tipo: "abierta",
          optionDrafts: [],
        };
      })
    );
  };

  const handleGuardar = async () => {
    if (!trabajoId) return;

    const normalized = preguntas.map((pregunta, index) => {
      const tipo = pregunta.tipo;
      const texto = (pregunta.texto || "").trim();
      const puntaje = Number(pregunta.puntaje_maximo || 1);
      
      // Get opciones from optionDrafts for closed types
      let opciones: string[] = [];
      let respuestaCorrecta = "";
      
      if (isClosedType(tipo) && pregunta.optionDrafts) {
        opciones = pregunta.optionDrafts
          .map((opt) => opt.text.trim())
          .filter(Boolean);
        const correctOption = pregunta.optionDrafts.find((opt) => opt.isCorrect);
        respuestaCorrecta = correctOption?.text || "";
      } else {
        opciones = (pregunta.opciones || []).map((opt) => opt.trim()).filter(Boolean);
        respuestaCorrecta = (pregunta.respuesta_correcta || "").trim();
      }

      if (!texto) {
        throw new Error(`La pregunta ${index + 1} no tiene texto`);
      }
      if (!Number.isFinite(puntaje) || puntaje <= 0) {
        throw new Error(`La pregunta ${index + 1} debe tener puntaje mayor a 0`);
      }
      if (tipo === "opcion_multiple" && opciones.length < 2) {
        throw new Error(`La pregunta ${index + 1} debe tener al menos 2 opciones`);
      }
      if (tipo === "verdadero_falso" && opciones.length === 0) {
        opciones.push("Verdadero", "Falso");
      }
      if (isClosedType(tipo) && !respuestaCorrecta) {
        throw new Error(`La pregunta ${index + 1} requiere respuesta correcta`);
      }

      return {
        ...pregunta,
        texto,
        puntaje_maximo: puntaje,
        opciones,
        respuesta_correcta: isClosedType(tipo) ? respuestaCorrecta : undefined,
        respuesta_esperada_tipo: isClosedType(tipo) ? "opciones" : "abierta",
        orden: index + 1,
      } as TrabajoPreguntaInput;
    });

    setSaving(true);
    try {
      const updated = await updateTrabajoPreguntas(trabajoId, { preguntas: normalized });
      setPreguntas(updated.map(mapPreguntaToInput));
      toast.success(t("teacher.workQuestionBank.toasts.updated"));
      navigate("/teacher/trabajos");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={30} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <button type="button" className="text-sm text-blue-600" onClick={() => navigate("/teacher/trabajos")}>
        {t("teacher.workQuestionBank.back")}
      </button>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{t("teacher.workQuestionBank.title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{trabajo?.titulo}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full ${
            allowMixedTypes
              ? "bg-violet-100 text-violet-700"
              : trabajo?.calificacion_automatica
                ? "bg-emerald-100 text-emerald-700"
                : "bg-blue-100 text-blue-700"
          }`}>
            {allowMixedTypes
              ? t("teacher.workQuestionBank.mixed", { defaultValue: "Mixto" })
              : trabajo?.calificacion_automatica
                ? t("teacher.workQuestionBank.closed")
                : t("teacher.workQuestionBank.open")}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-2">{t("teacher.workQuestionBank.totalScore")}: {totalPuntaje.toFixed(2)}</p>
      </div>

      <div className="space-y-3">
        {preguntas.map((pregunta, index) => (
          <div key={`pregunta-${index}`} className="bg-white rounded-xl shadow p-4 space-y-3 border border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t("teacher.workQuestionBank.question")} {index + 1}</h2>
              <button
                type="button"
                onClick={() => setPreguntas((prev) => prev.filter((_, idx) => idx !== index))}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
              >
                <Trash2 size={14} />
                {t("teacher.workQuestionBank.delete")}
              </button>
            </div>

            <label className="text-sm block">
              {t("teacher.workQuestionBank.statement")}
              <textarea
                rows={2}
                className="mt-1 w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={pregunta.texto}
                onChange={(e) => handleChange(index, { texto: e.target.value })}
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm block">
                {t("teacher.workQuestionBank.type")}
                <select
                  className="mt-1 w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pregunta.tipo}
                  onChange={(e) => handleChangeTipo(index, e.target.value as TrabajoPreguntaInput["tipo"])}
                >
                  {allowMixedTypes ? (
                    <>
                      <option value="opcion_multiple">{t("teacher.workQuestionBank.types.multipleChoice")}</option>
                      <option value="verdadero_falso">{t("teacher.workQuestionBank.types.trueFalse")}</option>
                      <option value="respuesta_corta">{t("teacher.workQuestionBank.types.shortAnswer")}</option>
                      <option value="completar">{t("teacher.workQuestionBank.types.complete", { defaultValue: "Completar" })}</option>
                    </>
                  ) : trabajo?.calificacion_automatica ? (
                    <>
                      <option value="opcion_multiple">{t("teacher.workQuestionBank.types.multipleChoice")}</option>
                      <option value="verdadero_falso">{t("teacher.workQuestionBank.types.trueFalse")}</option>
                    </>
                  ) : (
                    <option value="respuesta_corta">{t("teacher.workQuestionBank.types.shortAnswer")}</option>
                  )}
                </select>
              </label>

              <label className="text-sm block">
                {t("teacher.workQuestionBank.maxScore")}
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  className="mt-1 w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pregunta.puntaje_maximo ?? 1}
                  onChange={(e) => handleChange(index, { puntaje_maximo: Number(e.target.value || 1) })}
                />
              </label>

              <label className="text-sm block">
                {t("teacher.workQuestionBank.placeholder")}
                <input
                  className="mt-1 w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pregunta.placeholder || ""}
                  onChange={(e) => handleChange(index, { placeholder: e.target.value })}
                />
              </label>
            </div>

            {isClosedType(pregunta.tipo) && (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-700">{t("teacher.workQuestionBank.optionsAndCorrect")}</p>
                {pregunta.tipo === "verdadero_falso" ? (
                  <div className="space-y-2">
                    {(pregunta.optionDrafts || []).map((option) => (
                      <div key={option.localId} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                        <input
                          type="radio"
                          name={`correct-${index}`}
                          checked={option.isCorrect}
                          onChange={() => setCorrectOption(index, option.localId)}
                        />
                        <span className="text-sm font-medium">{option.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {(pregunta.optionDrafts || []).map((option) => (
                      <div key={option.localId} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                        <input
                          type="radio"
                          name={`correct-${index}`}
                          checked={option.isCorrect}
                          onChange={() => setCorrectOption(index, option.localId)}
                        />
                        <input
                          value={option.text}
                          onChange={(e) => updateOption(index, option.localId, (prev) => ({ ...prev, text: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={t("teacher.workQuestionBank.optionText")}
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(index, option.localId)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addOption(index)}
                      className="text-xs font-medium text-indigo-700 hover:underline"
                    >
                      {t("teacher.workQuestionBank.addOption")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPreguntas((prev) => [...prev, createEmptyPregunta(trabajo)])}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-slate-700 text-white hover:bg-slate-800"
        >
          <Plus size={14} />
          {t("teacher.workQuestionBank.addQuestion")}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleGuardar()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? t("teacher.workQuestionBank.saving") : t("teacher.workQuestionBank.save")}
        </button>
      </div>
    </div>
  );
}
