import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Save, WandSparkles, Clock } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { autoCalificarEntregaCerradas, calificarEntregaPorPregunta, convertDocxToPdf, convertPptxToPdf, getEntregaDetalle, getTrabajo, listEntregasByTrabajo } from "@/features/trabajos/services/trabajos";
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
  const [searchParams] = useSearchParams();
  const entregaIdParam = searchParams.get("entregaId");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoGrading, setAutoGrading] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [entregas, setEntregas] = useState<EntregaConCalificacion[]>([]);
  const [selectedEntrega, setSelectedEntrega] = useState<string>("");
  const [detalle, setDetalle] = useState<EntregaDetalleResponse | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const [items, setItems] = useState<CalificarEntregaPreguntaItem[]>([]);
  const [feedbackGeneral, setFeedbackGeneral] = useState("");
  const [motivoOverride, setMotivoOverride] = useState("");
  const [manualScore, setManualScore] = useState<number>(0);
  const [filePreviewModal, setFilePreviewModal] = useState<{ url: string; type: 'pdf' | 'image' | 'other' } | null>(null);
  const [convertingFile, setConvertingFile] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

  // Auto-select entrega if entregaId is provided in query parameter
  useEffect(() => {
    if (entregaIdParam && entregas.length > 0) {
      const exists = entregas.find((e) => e.entrega.id === entregaIdParam);
      if (exists) {
        setSelectedEntrega(entregaIdParam);
      }
    }
  }, [entregaIdParam, entregas]);

  useEffect(() => {
    if (!selectedEntrega) {
      setDetalle(null);
      setItems([]);
      setFeedbackGeneral("");
      setMotivoOverride("");
      setManualScore(0);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingDetalle(true);
      try {
        const payload = await getEntregaDetalle(selectedEntrega);
        if (cancelled) return;
        setDetalle(payload);

        // Load existing manual score if it's a file-based assignment
        if (payload.calificacion && (payload.preguntas.length === 0 || trabajo?.tipo_trabajo === "archivo")) {
          setManualScore(payload.calificacion.puntaje);
        }

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

    // Check if it's a file-based assignment (no questions or tipo_trabajo is "archivo")
    const isFileBased = detalle.preguntas.length === 0 || trabajo?.tipo_trabajo === "archivo";

    if (!isFileBased) {
      if (items.length === 0) {
        toast.error(t("teacher.trabajos.gradeByQuestion.minItems", { defaultValue: "Debes calificar al menos una pregunta" }));
        return;
      }

      if (items.some((item) => item.puntaje < 0)) {
        toast.error(t("teacher.trabajos.gradeByQuestion.nonNegative", { defaultValue: "Cada puntaje por pregunta debe ser >= 0" }));
        return;
      }
    }

    const isOverride = Boolean(detalle.calificacion) && detalle.entrega.estado === "calificada";
    const motivo = motivoOverride.trim();
    if (isOverride && motivo.length === 0) {
      toast.error(t("teacher.trabajos.overrideReasonRequired", { defaultValue: "Debes indicar un motivo para sobrescribir una calificacion" }));
      return;
    }

    setSaving(true);
    try {
      if (isFileBased) {
        // For file-based assignments, use the manual score
        const updated = await calificarEntregaPorPregunta(selected.entrega.id, {
          items: [],
          feedback: feedbackGeneral.trim() || undefined,
          sugerencia_ia: {},
          tipo_cambio: isOverride ? "manual_override" : "manual",
          motivo: isOverride ? motivo : undefined,
          manual_score: manualScore,
        });
        setDetalle(updated);
        setManualScore(updated.calificacion?.puntaje || 0);
      } else {
        // For question-based assignments, use question scores
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
      }

      toast.success(t("teacher.trabajos.graded", { defaultValue: "Entrega calificada" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAutoCalificar = async () => {
    if (!selected) {
      toast.error(t("teacher.trabajos.selectEntrega", { defaultValue: "Selecciona una entrega" }));
      return;
    }

    setAutoGrading(true);
    try {
      const updated = await autoCalificarEntregaCerradas(selected.entrega.id);
      setDetalle(updated);
      setFeedbackGeneral(updated.calificacion?.feedback || "");
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

      await loadData();
      toast.success(updated.entrega.estado === "calificada" ? "Autocalificación completada y entrega calificada" : "Autocalificación aplicada en preguntas cerradas");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setAutoGrading(false);
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
                        {item.entrega.estado === "revisada"
                          ? "Revisada"
                          : item.calificacion
                            ? t("teacher.trabajos.gradedTag", { defaultValue: "Calificada" })
                            : t("teacher.trabajos.pendingTag", { defaultValue: "Pendiente" })}
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
            {/* Delivery Info */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium mb-2">Información de entrega</p>
              <p className="text-xs text-gray-600">
                <span className="font-medium">Estudiante:</span> {selected?.estudiante_nombre || selected?.entrega.estudiante_id}
              </p>
              <p className="text-xs text-gray-600">
                <span className="font-medium">Entregado el:</span> {new Date(detalle.entrega.submitted_at).toLocaleString()}
              </p>
              {trabajo?.fecha_vencimiento && (
                <>
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">Fecha límite:</span> {new Date(trabajo.fecha_vencimiento).toLocaleString()}
                  </p>
                  {(() => {
                    const submittedDate = new Date(detalle.entrega.submitted_at);
                    const fechaVencimiento = new Date(trabajo.fecha_vencimiento);
                    const isLate = submittedDate > fechaVencimiento;
                    return isLate ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 mt-1">
                        <Clock size={10} />
                        Entregado atrasado
                      </span>
                    ) : null;
                  })()}
                </>
              )}
            </div>

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
                  {(pregunta.tipo === "opcion_multiple" || pregunta.tipo === "verdadero_falso") && (
                    <p className="text-xs text-blue-700 mt-1">
                      Respuesta correcta: {pregunta.respuesta_correcta || "No configurada"}
                    </p>
                  )}

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
              <label className="block text-sm font-medium mb-1">Archivo entregado</label>
              {detalle.entrega.archivo_url ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFilePreview(detalle.entrega.archivo_url!)}
                    disabled={convertingFile}
                    className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {convertingFile ? "Convirtiendo..." : "Ver archivo"}
                  </button>
                  <a
                    href={detalle.entrega.archivo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-gray-500 hover:text-gray-700"
                    download
                  >
                    ⬇
                  </a>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Sin archivo</p>
              )}
            </div>

            {detalle.preguntas.length === 0 || trabajo?.tipo_trabajo === "archivo" ? (
              <div>
                <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.manualScore", { defaultValue: "Puntaje manual (archivo)" })}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  value={manualScore}
                  onChange={(e) => setManualScore(Number(e.target.value || 0))}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.gradeByQuestion.total", { defaultValue: "Puntaje total (suma)" })}</label>
                <input
                  type="number"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  value={Number(totalPuntaje.toFixed(2))}
                  readOnly
                />
              </div>
            )}

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                disabled={autoGrading}
                onClick={handleAutoCalificar}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <WandSparkles size={14} />
                {autoGrading ? "Autocalificando..." : "Autocalificar cerradas"}
              </button>

              <button
                disabled={saving}
                onClick={handleGuardar}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? t("common.saving", { defaultValue: "Guardando..." }) : t("teacher.trabajos.saveGrade", { defaultValue: "Guardar calificacion" })}
              </button>
            </div>
          </div>
        )}
      </div>

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
