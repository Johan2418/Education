import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { getTrabajoFormulario, upsertEntrega, updateEntrega } from "@/features/trabajos/services/trabajos";
import type { CreateEntregaRequest, Trabajo, TrabajoEntrega, TrabajoPregunta } from "@/shared/types/trabajos";

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

export default function StudentTrabajoDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [entrega, setEntrega] = useState<TrabajoEntrega | null>(null);
  const [preguntas, setPreguntas] = useState<TrabajoPregunta[]>([]);

  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [archivoUrl, setArchivoUrl] = useState("");
  const [lastSavedSignature, setLastSavedSignature] = useState("");

  const draftKey = useMemo(() => buildDraftKey(trabajoId), [trabajoId]);
  const currentSignature = useMemo(() => JSON.stringify({ respuestas, comentario, archivoUrl }), [archivoUrl, comentario, respuestas]);
  const hasUnsavedChanges = currentSignature !== lastSavedSignature;

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
      setLastSavedSignature(JSON.stringify({ respuestas, comentario, archivoUrl }));
      localStorage.removeItem(draftKey);
      toast.success(t("student.trabajos.saved", { defaultValue: "Entrega guardada" }));
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
          <div>
            <h1 className="text-2xl font-bold">{trabajo.titulo}</h1>
            {trabajo.descripcion && <p className="text-gray-600 mt-1">{trabajo.descripcion}</p>}
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${trabajo.estado === "cerrado" ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-700"}`}>
            {trabajo.estado}
          </span>
        </div>

        {trabajo.instrucciones && (
          <div className="mt-3 p-3 rounded border bg-blue-50 text-sm text-blue-900">
            {trabajo.instrucciones}
          </div>
        )}

        {trabajo.fecha_vencimiento && (
          <p className="text-sm text-gray-500 mt-3">
            {t("student.trabajos.due", { defaultValue: "Vence" })}: {new Date(trabajo.fecha_vencimiento).toLocaleString()}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t("student.trabajos.delivery", { defaultValue: "Tu entrega" })}</h2>

        {preguntas.length === 0 ? (
          <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded p-4">
            {t("student.trabajos.formEmpty", { defaultValue: "Este trabajo no tiene preguntas configuradas." })}
          </div>
        ) : (
          <div className="space-y-4">
            {preguntas.map((pregunta, index) => {
              const answer = respuestas[pregunta.id] || "";
              const options = pregunta.tipo === "verdadero_falso" ? ["Verdadero", "Falso"] : (pregunta.opciones || []);
              const expectsOptions = expectsOptionsResponse(pregunta);
              const useShortInput = (pregunta.tipo === "respuesta_corta" || pregunta.tipo === "completar") && !pregunta.imagen_base64;

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
                  <p className="text-sm font-medium text-gray-900">{index + 1}. {pregunta.texto}</p>

                  {expectsOptions ? (
                    <div className="mt-2 space-y-1">
                      {options.map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`q-${pregunta.id}`}
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
                      placeholder={pregunta.placeholder || t("student.trabajos.answerPlaceholder", { defaultValue: "Escribe tu respuesta" })}
                      onChange={(e) => setRespuestas((prev) => ({ ...prev, [pregunta.id]: e.target.value }))}
                    />
                  ) : (
                    <textarea
                      rows={3}
                      className="mt-2 w-full border border-gray-300 rounded px-3 py-2"
                      placeholder={pregunta.placeholder || t("student.trabajos.answerPlaceholder", { defaultValue: "Escribe tu respuesta" })}
                      value={answer}
                      onChange={(e) => setRespuestas((prev) => ({ ...prev, [pregunta.id]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">{t("student.trabajos.comment", { defaultValue: "Comentario" })}</label>
          <textarea
            rows={3}
            className="w-full border border-gray-300 rounded px-3 py-2"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t("student.trabajos.fileUrl", { defaultValue: "URL de archivo (opcional)" })}</label>
          <input
            type="url"
            className="w-full border border-gray-300 rounded px-3 py-2"
            value={archivoUrl}
            onChange={(e) => setArchivoUrl(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {entrega
              ? t("student.trabajos.lastSubmit", { defaultValue: "Ultima actualizacion" }) + ": " + new Date(entrega.submitted_at).toLocaleString()
              : t("student.trabajos.notSubmitted", { defaultValue: "Aun no has enviado esta entrega" })}
          </p>

          {hasUnsavedChanges && (
            <p className="text-xs text-amber-700 mr-2">{t("student.trabajos.unsaved", { defaultValue: "Tienes cambios sin guardar" })}</p>
          )}

          <button
            disabled={saving || trabajo.estado === "cerrado"}
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
