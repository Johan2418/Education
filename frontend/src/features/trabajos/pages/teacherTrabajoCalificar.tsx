import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { calificarEntrega, getTrabajo, listEntregasByTrabajo } from "@/features/trabajos/services/trabajos";
import type { CalificarEntregaRequest, EntregaConCalificacion, Trabajo } from "@/shared/types/trabajos";

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

  const [form, setForm] = useState<CalificarEntregaRequest>({
    puntaje: 0,
    feedback: "",
    sugerencia_ia: {},
  });

  const selected = useMemo(() => {
    return entregas.find((item) => item.entrega.id === selectedEntrega);
  }, [entregas, selectedEntrega]);

  const loadData = async () => {
    if (!trabajoId) return;
    const [trabajoData, entregasData] = await Promise.all([
      getTrabajo(trabajoId),
      listEntregasByTrabajo(trabajoId),
    ]);

    setTrabajo(trabajoData);
    setEntregas(entregasData);
  };

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
  }, [navigate, t, trabajoId]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      puntaje: selected.calificacion?.puntaje ?? 0,
      feedback: selected.calificacion?.feedback ?? "",
      sugerencia_ia: selected.calificacion?.sugerencia_ia ?? {},
    });
  }, [selected]);

  const handleGuardar = async () => {
    if (!selected) {
      toast.error(t("teacher.trabajos.selectEntrega", { defaultValue: "Selecciona una entrega" }));
      return;
    }
    if (form.puntaje < 0 || form.puntaje > 100) {
      toast.error(t("teacher.trabajos.scoreRange", { defaultValue: "Puntaje debe estar entre 0 y 100" }));
      return;
    }

    setSaving(true);
    try {
      await calificarEntrega(selected.entrega.id, {
        puntaje: Number(form.puntaje),
        feedback: form.feedback,
        sugerencia_ia: form.sugerencia_ia,
      });
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
                      <p className="font-medium">{item.entrega.estudiante_id}</p>
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

        {!selected ? (
          <div className="text-gray-500 text-sm">{t("teacher.trabajos.selectEntrega", { defaultValue: "Selecciona una entrega" })}</div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.respuestas", { defaultValue: "Respuestas" })}</label>
              <pre className="text-xs bg-gray-50 rounded border p-2 max-h-48 overflow-auto">{JSON.stringify(selected.entrega.respuestas, null, 2)}</pre>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.comment", { defaultValue: "Comentario del estudiante" })}</label>
              <p className="text-sm text-gray-700 border rounded p-2 min-h-[42px]">{selected.entrega.comentario || "-"}</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.score", { defaultValue: "Puntaje" })}</label>
              <input
                type="number"
                min={0}
                max={100}
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.puntaje}
                onChange={(e) => setForm((prev) => ({ ...prev, puntaje: Number(e.target.value) }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.trabajos.feedback", { defaultValue: "Feedback" })}</label>
              <textarea
                rows={4}
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.feedback || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, feedback: e.target.value }))}
              />
            </div>

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
