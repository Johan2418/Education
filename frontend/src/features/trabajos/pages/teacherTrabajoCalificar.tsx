import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { calificarEntregaPorPregunta, getEntregaDetalle, getTrabajo, listEntregasByTrabajo } from "@/features/trabajos/services/trabajos";
import type { CalificarEntregaPreguntaItem, EntregaConCalificacion, EntregaDetalleResponse, Trabajo } from "@/shared/types/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

export default function TeacherTrabajoCalificar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [entregas, setEntregas] = useState<EntregaConCalificacion[]>([]);
  const [selectedEntrega, setSelectedEntrega] = useState<string>("");
  const [detalle, setDetalle] = useState<EntregaDetalleResponse | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const [items, setItems] = useState<CalificarEntregaPreguntaItem[]>([]);
  const [feedbackGeneral, setFeedbackGeneral] = useState("");
  const [motivoOverride, setMotivoOverride] = useState("");

  const selected = useMemo(() => entregas.find((item) => item.entrega.id === selectedEntrega), [entregas, selectedEntrega]);

  const totalPuntaje = useMemo(() => items.reduce((acc, item) => acc + (Number.isFinite(item.puntaje) ? item.puntaje : 0), 0), [items]);

  const loadData = useCallback(async () => {
    if (!trabajoId) return;
    const [trabajoData, entregasData] = await Promise.all([
      getTrabajo(trabajoId),
      listEntregasByTrabajo(trabajoId),
    ]);

    setTrabajo(trabajoData);
    setEntregas(entregasData);
  }, [trabajoId]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        if (!trabajoId) {
          toast.error(t("teacher.trabajos.noTrabajo", { defaultValue: "Trabajo invalido" }));
          navigate("/teacher/trabajos");
          return;
        }

        await loadData();
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData, navigate, t, trabajoId]);

  useEffect(() => {
    if (!selectedEntrega) {
      setDetalle(null);
      setItems([]);
      setFeedbackGeneral("");
      setMotivoOverride("");
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingDetalle(true);
      try {
        const payload = await getEntregaDetalle(selectedEntrega);
        if (cancelled) return;
        setDetalle(payload);

        const calByPregunta = new Map(payload.calificaciones_pregunta.map((item) => [item.pregunta_id, item]));
        const initialItems: CalificarEntregaPreguntaItem[] = payload.preguntas.map((pregunta) => {
          const existing = calByPregunta.get(pregunta.id);
          return {
            pregunta_id: pregunta.id,
            puntaje: existing?.puntaje ?? 0,
            feedback: existing?.feedback || "",
          };
        });

        setItems(initialItems);
        setFeedbackGeneral(payload.calificacion?.feedback || "");
        setMotivoOverride("");
      } catch (err) {
        if (!cancelled) {
          toast.error(normalizeError(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingDetalle(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEntrega]);

  const handleGuardar = async () => {
    if (!selected || !detalle) {
      toast.error(t("teacher.trabajos.selectEntrega", { defaultValue: "Selecciona una entrega" }));
      return;
    }

    if (items.length === 0) {
      toast.error(t("teacher.trabajos.gradeByQuestion.minItems", { defaultValue: "Debes calificar al menos una pregunta" }));
      return;
    }

    if (items.some((item) => item.puntaje < 0)) {
      toast.error(t("teacher.trabajos.gradeByQuestion.nonNegative", { defaultValue: "Cada puntaje por pregunta debe ser >= 0" }));
      return;
    }

    const isOverride = Boolean(detalle.calificacion);
    const motivo = motivoOverride.trim();
    if (isOverride && motivo.length === 0) {
      toast.error(t("teacher.trabajos.overrideReasonRequired", { defaultValue: "Debes indicar un motivo para sobrescribir una calificacion" }));
      return;
    }

    setSaving(true);
    try {
      const updated = await calificarEntregaPorPregunta(selected.entrega.id, {
        items: items.map((item) => ({
          pregunta_id: item.pregunta_id,
          puntaje: Number(item.puntaje || 0),
          feedback: (item.feedback || "").trim() || undefined,
        })),
        feedback: feedbackGeneral.trim() || undefined,
        sugerencia_ia: {},
        tipo_cambio: isOverride ? "manual_override" : "manual",
        motivo: isOverride ? motivo : undefined,
      });

      setDetalle(updated);
      setMotivoOverride("");

      const calByPregunta = new Map(updated.calificaciones_pregunta.map((item) => [item.pregunta_id, item]));
      setItems(updated.preguntas.map((pregunta) => {
        const existing = calByPregunta.get(pregunta.id);
        return {
          pregunta_id: pregunta.id,
          puntaje: existing?.puntaje ?? 0,
          feedback: existing?.feedback || "",
        };
      }));

      toast.success(t("teacher.trabajos.graded", { defaultValue: "Entrega calificada" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
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
    <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">{t("teacher.trabajos.gradingTitle", { defaultValue: "Bandeja de calificacion" })}</h1>
            <p className="text-sm text-gray-500">{trabajo?.titulo}</p>
          </div>
          <button className="text-sm text-blue-600" onClick={() => navigate("/teacher/trabajos")}>{t("common.back", { defaultValue: "Volver" })}</button>
        </div>

        {entregas.length === 0 ? (
          <div className="text-center text-gray-500 py-10">{t("teacher.trabajos.noEntregas", { defaultValue: "No hay entregas para este trabajo" })}</div>
        ) : (
          <div className="space-y-2">
            {entregas.map((item) => {
              const isSelected = item.entrega.id === selectedEntrega;
              return (
                <button
                  key={item.entrega.id}
                  onClick={() => setSelectedEntrega(item.entrega.id)}
                  className={`w-full border rounded-lg p-3 text-left transition ${isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.estudiante_nombre || item.entrega.estudiante_id}</p>
                      <p className="text-xs text-gray-500">{item.estudiante_email || item.entrega.estudiante_id}</p>
                      <p className="text-xs text-gray-500">{new Date(item.entrega.submitted_at).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full ${item.calificacion ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {item.calificacion ? t("teacher.trabajos.gradedTag", { defaultValue: "Calificada" }) : t("teacher.trabajos.pendingTag", { defaultValue: "Pendiente" })}
                      </span>
                      {item.calificacion && <p className="text-sm mt-1 font-semibold">{item.calificacion.puntaje}/100</p>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="lg:col-span-2 bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">{t("teacher.trabajos.gradeForm", { defaultValue: "Calificar entrega" })}</h2>

        {!selected || loadingDetalle ? (
          loadingDetalle ? (
            <div className="py-10 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={24} /></div>
          ) : (
          <div className="text-gray-500 text-sm">{t("teacher.trabajos.selectEntrega", { defaultValue: "Selecciona una entrega" })}</div>
          )
        ) : !detalle ? (
          <div className="text-gray-500 text-sm">{t("teacher.trabajos.noTrabajo", { defaultValue: "Trabajo invalido" })}</div>
        ) : (
          <div className="space-y-3">
            {detalle.preguntas.map((pregunta, index) => {
              const answer = detalle.respuestas_preguntas.find((item) => item.pregunta_id === pregunta.id);
              const itemIndex = items.findIndex((item) => item.pregunta_id === pregunta.id);
              const item = itemIndex >= 0 ? items[itemIndex]! : { pregunta_id: pregunta.id, puntaje: 0, feedback: "" };
              const answerText = answer?.respuesta_opcion ?? answer?.respuesta_texto ?? "-";

              return (
                <div key={pregunta.id} className="border border-gray-200 rounded-lg p-3">
                  {pregunta.imagen_base64 && (
                    <img
                      src={pregunta.imagen_base64}
                      alt={t("teacher.trabajos.illustration", { defaultValue: "Ilustracion de la pregunta" })}
                      className="w-full max-h-64 object-contain rounded border border-gray-200 mb-2 bg-gray-50"
                      loading="lazy"
                    />
                  )}
                  <p className="text-sm font-medium text-gray-900">{index + 1}. {pregunta.texto}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t("teacher.trabajos.libro.type", { defaultValue: "Tipo" })}: {pregunta.tipo}
                    {" | "}
                    {t("teacher.trabajos.expectedAnswer", { defaultValue: "Respuesta esperada" })}: {pregunta.respuesta_esperada_tipo || "abierta"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{t("teacher.trabajos.respuestas", { defaultValue: "Respuestas" })}: {answerText}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    <label className="text-sm">
                      {t("teacher.trabajos.gradeByQuestion.scoreQuestion", { defaultValue: "Puntaje de la pregunta" })}
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                        value={item.puntaje}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0);
                          setItems((prev) => prev.map((it) => it.pregunta_id === pregunta.id ? { ...it, puntaje: value } : it));
                        }}
                      />
                    </label>

                    <label className="text-sm">
                      {t("teacher.trabajos.gradeByQuestion.feedbackQuestion", { defaultValue: "Feedback de la pregunta" })}
                      <input
                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
                        value={item.feedback || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setItems((prev) => prev.map((it) => it.pregunta_id === pregunta.id ? { ...it, feedback: value } : it));
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.comment", { defaultValue: "Comentario del estudiante" })}</label>
              <p className="text-sm text-gray-700 border rounded p-2 min-h-[42px]">{detalle.entrega.comentario || "-"}</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.gradeByQuestion.total", { defaultValue: "Puntaje total (suma)" })}</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={Number(totalPuntaje.toFixed(2))}
                readOnly
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.feedback", { defaultValue: "Feedback" })} ({t("teacher.trabajos.gradeByQuestion.general", { defaultValue: "general" })})</label>
              <textarea
                rows={4}
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={feedbackGeneral}
                onChange={(e) => setFeedbackGeneral(e.target.value)}
              />
            </div>

            {detalle.calificacion && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("teacher.trabajos.overrideReason", { defaultValue: "Motivo de sobreescritura" })}
                </label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  value={motivoOverride}
                  onChange={(e) => setMotivoOverride(e.target.value)}
                  placeholder={t("teacher.trabajos.overrideReasonPlaceholder", { defaultValue: "Explica por que se modifica la calificacion anterior" })}
                />
                <p className="text-xs text-amber-700 mt-1">
                  {t("teacher.trabajos.overrideReasonHint", { defaultValue: "La entrega ya tenia una calificacion; este motivo quedara registrado en el historial." })}
                </p>
              </div>
            )}

            <button
              disabled={saving}
              onClick={handleGuardar}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? t("common.saving", { defaultValue: "Guardando..." }) : t("teacher.trabajos.saveGrade", { defaultValue: "Guardar calificacion" })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
