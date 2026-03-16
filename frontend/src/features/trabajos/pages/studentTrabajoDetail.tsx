import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { getMiEntrega, getTrabajo, upsertEntrega, updateEntrega } from "@/features/trabajos/services/trabajos";
import type { CreateEntregaRequest, Trabajo, TrabajoEntrega } from "@/shared/types/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

function parseRespuestas(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El JSON de respuestas debe ser un objeto");
  }
  return parsed as Record<string, unknown>;
}

export default function StudentTrabajoDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [entrega, setEntrega] = useState<TrabajoEntrega | null>(null);

  const [respuestasText, setRespuestasText] = useState('{\n  "pregunta_1": ""\n}');
  const [comentario, setComentario] = useState("");
  const [archivoUrl, setArchivoUrl] = useState("");

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

        const [trabajoData, entregaData] = await Promise.all([
          getTrabajo(trabajoId),
          getMiEntrega(trabajoId),
        ]);
        setTrabajo(trabajoData);

        if (entregaData) {
          setEntrega(entregaData);
          setComentario(entregaData.comentario || "");
          setArchivoUrl(entregaData.archivo_url || "");
          setRespuestasText(JSON.stringify(entregaData.respuestas || {}, null, 2));
        }
      } catch (err) {
        toast.error(normalizeError(err));
        navigate("/student/trabajos");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, trabajoId]);

  const handleGuardar = async () => {
    if (!trabajoId) return;

    let payload: CreateEntregaRequest;
    try {
      payload = {
        respuestas: parseRespuestas(respuestasText),
        comentario: comentario.trim() || undefined,
        archivo_url: archivoUrl.trim() || undefined,
      };
    } catch (err) {
      toast.error(normalizeError(err));
      return;
    }

    setSaving(true);
    try {
      let saved: TrabajoEntrega;
      if (entrega?.id) {
        saved = await updateEntrega(entrega.id, payload);
      } else {
        saved = await upsertEntrega(trabajoId, payload);
      }

      setEntrega(saved);
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

        <div>
          <label className="block text-sm font-medium mb-1">{t("student.trabajos.answersJson", { defaultValue: "Respuestas (JSON)" })}</label>
          <textarea
            rows={10}
            className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
            value={respuestasText}
            onChange={(e) => setRespuestasText(e.target.value)}
          />
        </div>

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
