import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Save, Upload, Clock, CheckCircle, AlertCircle, FileText, HelpCircle, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { getEntregaDetalle, getTrabajoFormulario, upsertEntrega, updateEntrega, uploadFile } from "@/features/trabajos/services/trabajos";
import type { CreateEntregaRequest, EntregaDetalleResponse, Trabajo, TrabajoEntrega, TrabajoPregunta, TipoTrabajo } from "@/shared/types/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

function buildDraftKey(trabajoId: string): string {
  return `student_trabajo_draft:${trabajoId}`;
}

function expectsOptionsResponse(pregunta: TrabajoPregunta): boolean {
  return pregunta.respuesta_esperada_tipo === "opciones" || pregunta.tipo === "opcion_multiple" || pregunta.tipo === "verdadero_falso";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function StudentTrabajoDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [entrega, setEntrega] = useState<TrabajoEntrega | null>(null);
  const [detalleEntrega, setDetalleEntrega] = useState<EntregaDetalleResponse | null>(null);
  const [preguntas, setPreguntas] = useState<TrabajoPregunta[]>([]);

  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [archivoUrl, setArchivoUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lastSavedSignature, setLastSavedSignature] = useState("");

  const draftKey = useMemo(() => buildDraftKey(trabajoId), [trabajoId]);
  const currentSignature = useMemo(() => JSON.stringify({ respuestas, comentario, archivoUrl }), [archivoUrl, comentario, respuestas]);
  const hasUnsavedChanges = currentSignature !== lastSavedSignature;
  const isLockedByGrade = detalleEntrega?.entrega.estado === "calificada";
  const calificacionesPorPregunta = useMemo(
    () => new Map((detalleEntrega?.calificaciones_pregunta || []).map((item) => [item.pregunta_id, item])),
    [detalleEntrega]
  );

  // Enhanced assignment type helpers
  const isOverdue = useMemo(() => {
    if (!trabajo?.fecha_vencimiento) return false;
    return new Date(trabajo.fecha_vencimiento) < new Date();
  }, [trabajo]);

  const timeRemaining = useMemo(() => {
    if (!trabajo?.fecha_vencimiento) return null;
    const now = new Date();
    const due = new Date(trabajo.fecha_vencimiento);
    const diff = due.getTime() - now.getTime();
    if (diff <= 0) return null;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, [trabajo]);

  const shouldShowQuestions = useMemo(() => {
    if (!trabajo) return false;
    const tipo = trabajo.tipo_trabajo || "preguntas";
    return tipo === "preguntas" || tipo === "mixto";
  }, [trabajo]);

  const shouldShowFileUpload = useMemo(() => {
    if (!trabajo) return false;
    return trabajo.permite_archivo;
  }, [trabajo]);

  const preguntasAgrupadasPorPagina = useMemo(() => {
    if (!preguntas.length) return [] as Array<{ pagina: number | null; items: TrabajoPregunta[] }>;

    const groups = new Map<number, TrabajoPregunta[]>();
    for (const pregunta of preguntas) {
      const page = typeof pregunta.pagina_libro === "number" && pregunta.pagina_libro > 0 ? pregunta.pagina_libro : -1;
      const bucket = groups.get(page) || [];
      bucket.push(pregunta);
      groups.set(page, bucket);
    }

    const pages = Array.from(groups.keys()).sort((a, b) => {
      if (a === -1) return 1;
      if (b === -1) return -1;
      return a - b;
    });

    return pages.map((page) => ({
      pagina: page === -1 ? null : page,
      items: (groups.get(page) || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)),
    }));
  }, [preguntas]);

  // Check if submission is editable based on permite_entrega_tardia and deadline
  const isEditable = useMemo(() => {
    if (!trabajo || isLockedByGrade) return false;
    
    // If late submissions are allowed, always editable
    if (trabajo.permite_entrega_tardia) return true;
    
    // If trabajo is closed, check if deadline has passed
    if (trabajo.estado === "cerrado") {
      if (!trabajo.fecha_vencimiento) return false;
      const now = new Date();
      const deadline = new Date(trabajo.fecha_vencimiento);
      return now < deadline;
    }
    
    // If trabajo is published, it's editable
    return trabajo.estado === "publicado";
  }, [trabajo, isLockedByGrade]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error("No se ha seleccionado ningún archivo");
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error(t("student.trabajos.maxSize", { defaultValue: "Maximo 50MB" }));
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadFile(selectedFile);
      setArchivoUrl(url);
      setSelectedFile(null);
      toast.success(t("student.trabajos.fileUploaded", { defaultValue: "Archivo subido exitosamente" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || me.role !== "student") {
          navigate("/login");
          return;
        }

        if (!trabajoId) {
          navigate("/student/trabajos");
          return;
        }

        const formulario = await getTrabajoFormulario(trabajoId);
        setTrabajo(formulario.trabajo);
        setPreguntas(formulario.preguntas || []);

        const respuestasIniciales: Record<string, string> = {};
        for (const item of formulario.respuestas_preguntas || []) {
          const value = item.respuesta_opcion ?? item.respuesta_texto ?? "";
          respuestasIniciales[item.pregunta_id] = value;
        }

        if (formulario.mi_entrega) {
          setEntrega(formulario.mi_entrega);
          setComentario(formulario.mi_entrega.comentario || "");
          setArchivoUrl(formulario.mi_entrega.archivo_url || "");
          setRespuestas(respuestasIniciales);
          setLastSavedSignature(JSON.stringify({
            respuestas: respuestasIniciales,
            comentario: formulario.mi_entrega.comentario || "",
            archivoUrl: formulario.mi_entrega.archivo_url || "",
          }));
          localStorage.removeItem(draftKey);

          try {
            const detalle = await getEntregaDetalle(formulario.mi_entrega.id);
            setDetalleEntrega(detalle);
          } catch {
            setDetalleEntrega(null);
          }
        } else {
          let initialRespuestas: Record<string, string> = respuestasIniciales;
          let initialComentario = "";
          let initialArchivoUrl = "";

          const draftRaw = localStorage.getItem(draftKey);
          if (draftRaw) {
            try {
              const draft = JSON.parse(draftRaw) as { respuestas?: Record<string, string>; comentario?: string; archivoUrl?: string };
              if (draft.respuestas && typeof draft.respuestas === "object") initialRespuestas = draft.respuestas;
              if (typeof draft.comentario === "string") initialComentario = draft.comentario;
              if (typeof draft.archivoUrl === "string") initialArchivoUrl = draft.archivoUrl;
            } catch {
              localStorage.removeItem(draftKey);
            }
          }

          setRespuestas(initialRespuestas);
          setComentario(initialComentario);
          setArchivoUrl(initialArchivoUrl);
          setDetalleEntrega(null);
          setLastSavedSignature(JSON.stringify({
            respuestas: initialRespuestas,
            comentario: initialComentario,
            archivoUrl: initialArchivoUrl,
          }));
        }
      } catch (err) {
        toast.error(normalizeError(err));
        navigate("/student/trabajos");
      } finally {
        setLoading(false);
      }
    })();
  }, [draftKey, navigate, trabajoId]);

  useEffect(() => {
    if (!trabajoId || loading || !hasUnsavedChanges) return;
    const timeout = window.setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify({ respuestas, comentario, archivoUrl }));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [archivoUrl, comentario, draftKey, hasUnsavedChanges, loading, respuestas, trabajoId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleGuardar = async () => {
    if (!trabajoId) return;

    // Validation based on tipo_trabajo
    const tipo = trabajo?.tipo_trabajo || "preguntas";

    // Validate questions if required
    if (tipo === "preguntas" || tipo === "mixto") {
      const preguntasSinRespuesta = preguntas.filter((pregunta) => {
        const value = (respuestas[pregunta.id] || "").trim();
        return value === "";
      });
      if (preguntasSinRespuesta.length > 0) {
        toast.error(t("student.trabajos.errorMissingAnswers", { defaultValue: "Debes responder todas las preguntas" }));
        return;
      }
    }

    // Validate file/URL if required (mutually exclusive - one or the other, not both required)
    if (tipo === "archivo" || (tipo === "mixto" && trabajo?.permite_archivo)) {
      const hasFile = selectedFile !== null;
      const hasUrl = archivoUrl.trim() !== "";
      
      if (!hasFile && !hasUrl) {
        toast.error(t("student.trabajos.errorMissingFile", { defaultValue: "Debes proporcionar un archivo o una URL" }));
        return;
      }

      // Auto-upload file if selectedFile is set
      if (hasFile && !hasUrl) {
        if (selectedFile.size > 50 * 1024 * 1024) {
          toast.error(t("student.trabajos.maxSize", { defaultValue: "Maximo 50MB" }));
          return;
        }
        setUploading(true);
        try {
          const { url } = await uploadFile(selectedFile);
          setArchivoUrl(url);
          setSelectedFile(null);
        } catch (err) {
          toast.error(normalizeError(err));
          setUploading(false);
          return;
        }
        setUploading(false);
      }
    }

    const respuestasPreguntas = preguntas.map((pregunta) => {
      const value = (respuestas[pregunta.id] || "").trim();
      if (expectsOptionsResponse(pregunta)) {
        return {
          pregunta_id: pregunta.id,
          respuesta_opcion: value,
        };
      }
      return {
        pregunta_id: pregunta.id,
        respuesta_texto: value,
      };
    });

    const respuestasLegacy: Record<string, unknown> = {};
    for (const item of respuestasPreguntas) {
      if (item.respuesta_opcion != null) {
        respuestasLegacy[item.pregunta_id] = item.respuesta_opcion;
      } else {
        respuestasLegacy[item.pregunta_id] = item.respuesta_texto || "";
      }
    }

    const payload: CreateEntregaRequest = {
      respuestas: respuestasLegacy,
      respuestas_preguntas: respuestasPreguntas,
      comentario: comentario.trim() || undefined,
      archivo_url: archivoUrl.trim() || undefined,
    };

    setSaving(true);
    try {
      let saved: TrabajoEntrega;
      if (entrega?.id) {
        saved = await updateEntrega(entrega.id, payload);
      } else {
        saved = await upsertEntrega(trabajoId, payload);
      }

      setEntrega(saved);
      try {
        const detalle = await getEntregaDetalle(saved.id);
        setDetalleEntrega(detalle);
      } catch {
        setDetalleEntrega(null);
      }
      setLastSavedSignature(JSON.stringify({ respuestas, comentario, archivoUrl }));
      localStorage.removeItem(draftKey);
      toast.success(t("student.trabajos.saved", { defaultValue: "Entrega guardada" }));
      navigate("/student/trabajos");
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

  if (!trabajo) {
    return (
      <div className="max-w-4xl mx-auto p-4 text-center text-gray-500">
        {t("student.trabajos.notFound", { defaultValue: "Trabajo no encontrado" })}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <button className="text-sm text-blue-600" onClick={() => navigate("/student/trabajos")}>← {t("common.back", { defaultValue: "Volver" })}</button>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{trabajo.titulo}</h1>
              {/* Assignment Type Badge */}
              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                {trabajo.tipo_trabajo === "preguntas" && t("student.trabajos.tipoPreguntas", { defaultValue: "Preguntas" })}
                {trabajo.tipo_trabajo === "archivo" && t("student.trabajos.tipoArchivo", { defaultValue: "Archivo" })}
                {trabajo.tipo_trabajo === "mixto" && t("student.trabajos.tipoMixto", { defaultValue: "Mixto" })}
              </span>
            </div>
            {trabajo.descripcion && <p className="text-gray-600 mt-1">{trabajo.descripcion}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${trabajo.estado === "cerrado" ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-700"}`}>
              {trabajo.estado}
            </span>
            {/* Time remaining indicator */}
            {trabajo.fecha_vencimiento && (
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                isOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              }`}>
                {isOverdue ? (
                  <><AlertCircle size={12} /> {t("student.trabajos.overdue", { defaultValue: "Vencido" })}</>
                ) : timeRemaining ? (
                  <><Clock size={12} /> {timeRemaining}</>
                ) : (
                  <><Clock size={12} /> {t("student.trabajos.dueSoon", { defaultValue: "Pronto" })}</>
                )}
              </div>
            )}
          </div>
        </div>

        {trabajo.instrucciones && (
          <div className="mt-3 p-3 rounded border bg-blue-50 text-sm text-blue-900">
            <div className="flex items-center gap-2 mb-1">
              <HelpCircle size={16} />
              <span className="font-semibold">{t("student.trabajos.instructions", { defaultValue: "Instrucciones" })}</span>
            </div>
            {trabajo.instrucciones}
          </div>
        )}

        {trabajo.fecha_vencimiento && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
            <Clock size={16} />
            <span>
              {t("student.trabajos.due", { defaultValue: "Vence" })}: {formatDateTime(trabajo.fecha_vencimiento)}
            </span>
          </div>
        )}

        {/* Assignment type specific info */}
        {trabajo.calificacion_automatica && shouldShowQuestions && (
          <div className="mt-3 flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
            <CheckCircle size={12} />
            {t("student.trabajos.autoGrading", { defaultValue: "Calificación automática habilitada" })}
          </div>
        )}

        {/* Attempts remaining */}
        {trabajo.max_intentos && trabajo.max_intentos > 0 && entrega && (
          <div className="mt-3 flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
            <RefreshCw size={12} />
            {t("student.trabajos.attempts", { defaultValue: "Intentos" })}: {entrega.intentos_usados}/{trabajo.max_intentos}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("student.trabajos.delivery", { defaultValue: "Tu entrega" })}</h2>

        {detalleEntrega?.calificacion && (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-800">
              Calificación: {detalleEntrega.calificacion.puntaje.toFixed(2)} / 100
            </p>
            <p className="text-xs text-emerald-700 mt-1">Estado: {detalleEntrega.entrega.estado}</p>
            {detalleEntrega.calificacion.feedback && (
              <p className="text-sm text-emerald-900 mt-2">{detalleEntrega.calificacion.feedback}</p>
            )}
          </div>
        )}

        {preguntas.length === 0 && shouldShowQuestions ? (
          <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded p-4">
            {t("student.trabajos.formEmpty", { defaultValue: "Este trabajo no tiene preguntas configuradas." })}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Questions Section - Only show for assignment types that include questions */}
            {shouldShowQuestions && preguntas.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-md font-semibold flex items-center gap-2">
                  <HelpCircle size={16} />
                  {t("student.trabajos.questions", { defaultValue: "Preguntas" })}
                </h3>
                {preguntasAgrupadasPorPagina.map((group) => (
                  <div key={group.pagina ?? "sin-pagina"} className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                      {group.pagina ? `Pagina ${group.pagina}` : "Preguntas sin pagina"}
                    </div>

                    {group.items.map((pregunta, index) => {
                      const answer = respuestas[pregunta.id] || "";
                      const options = (pregunta.opciones || []) as string[];
                      const expectsOptions = expectsOptionsResponse(pregunta);
                      const useShortInput = (pregunta.tipo === "respuesta_corta" || pregunta.tipo === "completar") && !pregunta.imagen_base64;
                      const questionNumber = pregunta.orden > 0 ? pregunta.orden : index + 1;

                      return (
                        <div key={pregunta.id} className="border border-gray-200 rounded-lg p-3">
                          {pregunta.imagen_base64 && (
                            <img
                              src={pregunta.imagen_base64}
                              alt={t("student.trabajos.illustration", { defaultValue: "Ilustracion de apoyo" })}
                              className="w-full max-h-72 object-contain rounded border border-gray-200 mb-2 bg-gray-50"
                              loading="lazy"
                            />
                          )}
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-medium text-gray-900 flex-1">{questionNumber}. {pregunta.texto}</p>
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                              {pregunta.puntaje_maximo} {t("student.trabajos.points", { defaultValue: "puntos" })}
                            </span>
                          </div>

                          {expectsOptions ? (
                            <div className="mt-2 space-y-1">
                              {options.map((option) => (
                                <label key={option} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`q-${pregunta.id}`}
                                    disabled={isLockedByGrade}
                                    checked={answer === option}
                                    onChange={() => setRespuestas((prev) => ({ ...prev, [pregunta.id]: option }))}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          ) : useShortInput ? (
                            <input
                              className="mt-2 w-full border border-gray-300 rounded px-3 py-2"
                              value={answer}
                              disabled={isLockedByGrade}
                              placeholder={pregunta.placeholder || t("student.trabajos.answerPlaceholder", { defaultValue: "Escribe tu respuesta" })}
                              onChange={(e) => setRespuestas((prev) => ({ ...prev, [pregunta.id]: e.target.value }))}
                            />
                          ) : (
                            <textarea
                              rows={3}
                              className="mt-2 w-full border border-gray-300 rounded px-3 py-2"
                              disabled={isLockedByGrade}
                              placeholder={pregunta.placeholder || t("student.trabajos.answerPlaceholder", { defaultValue: "Escribe tu respuesta" })}
                              value={answer}
                              onChange={(e) => setRespuestas((prev) => ({ ...prev, [pregunta.id]: e.target.value }))}
                            />
                          )}

                          {calificacionesPorPregunta.get(pregunta.id) && (
                            <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                              Puntaje: {calificacionesPorPregunta.get(pregunta.id)?.puntaje?.toFixed(2) ?? "0.00"}
                              {calificacionesPorPregunta.get(pregunta.id)?.feedback
                                ? ` - ${calificacionesPorPregunta.get(pregunta.id)?.feedback}`
                                : ""}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* File Upload Section - Only show for assignment types that allow files */}
        {shouldShowFileUpload && (
          <div>
            <label className="block text-sm font-medium mb-1">
              <FileText size={16} className="inline mr-1" />
              {t("student.trabajos.fileUpload", { defaultValue: "Archivo" })}
              {trabajo.tipo_trabajo === "archivo" && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            
            {/* Drag & Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                type="file"
                id="file-upload"
                className="hidden"
                disabled={isLockedByGrade || uploading}
                onChange={handleFileSelect}
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer flex flex-col items-center ${isLockedByGrade || uploading ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Upload size={48} className="text-gray-400 mb-2" />
                {selectedFile ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : archivoUrl ? (
                  <div>
                    <p className="text-sm font-medium text-green-700">{t("student.trabajos.fileUploaded", { defaultValue: "Archivo subido" })}</p>
                    <p className="text-xs text-gray-500 truncate max-w-xs">{archivoUrl}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">
                      {t("student.trabajos.dragDrop", { defaultValue: "Arrastra un archivo aquí o haz clic para seleccionar" })}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t("student.trabajos.maxSize", { defaultValue: "Máximo 50MB" })}
                    </p>
                  </div>
                )}
              </label>
            </div>

            {/* Upload Button */}
            {selectedFile && (
              <button
                onClick={handleFileUpload}
                disabled={uploading || isLockedByGrade}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t("common.uploading", { defaultValue: "Subiendo..." })}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    {t("student.trabajos.uploadFile", { defaultValue: "Subir archivo" })}
                  </>
                )}
              </button>
            )}

            {/* Manual URL fallback */}
            {!selectedFile && !archivoUrl && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">
                  {t("student.trabajos.orEnterUrl", { defaultValue: "O ingresa una URL:" })}
                </label>
                <input
                  type="url"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  disabled={isLockedByGrade}
                  value={archivoUrl}
                  onChange={(e) => setArchivoUrl(e.target.value)}
                  placeholder={t("student.trabajos.urlPlaceholder", { defaultValue: "https://..." })}
                />
              </div>
            )}

            {/* Remove file option */}
            {archivoUrl && !selectedFile && (
              <button
                onClick={() => setArchivoUrl("")}
                disabled={isLockedByGrade}
                className="mt-2 text-xs text-red-600 hover:text-red-700"
              >
                {t("student.trabajos.removeFile", { defaultValue: "Eliminar archivo" })}
              </button>
            )}
          </div>
        )}

        {/* Comment Section */}
        <div>
          <label className="block text-sm font-medium mb-1">{t("student.trabajos.comment", { defaultValue: "Comentario" })}</label>
          <textarea
            rows={3}
            className="w-full border border-gray-300 rounded px-3 py-2"
            disabled={isLockedByGrade}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={t("student.trabajos.commentPlaceholder", { defaultValue: "Agrega un comentario opcional" })}
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {entrega
              ? t("student.trabajos.lastSubmit", { defaultValue: "Ultima actualizacion" }) + ": " + formatDateTime(entrega.submitted_at)
              : t("student.trabajos.notSubmitted", { defaultValue: "Aun no has enviado esta entrega" })}
          </p>

          {hasUnsavedChanges && (
            <p className="text-xs text-amber-700 mr-2">{t("student.trabajos.unsaved", { defaultValue: "Tienes cambios sin guardar" })}</p>
          )}

          {isLockedByGrade && (
            <p className="text-xs text-emerald-700 mr-2">Entrega bloqueada porque ya fue calificada.</p>
          )}

          <button
            disabled={saving || !isEditable || isLockedByGrade}
            onClick={handleGuardar}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={14} />
            {saving
              ? t("common.saving", { defaultValue: "Guardando..." })
              : entrega
                ? t("student.trabajos.update", { defaultValue: "Actualizar entrega" })
                : t("student.trabajos.submit", { defaultValue: "Enviar entrega" })}
          </button>
        </div>
      </div>
    </div>
  );
}
