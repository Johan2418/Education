import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { listMisTrabajos } from "@/features/trabajos/services/trabajos";
import type { TrabajoConEstadoEntrega } from "@/shared/types/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

export default function StudentTrabajos() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "submitted" | "closed">("all");
  const [trabajos, setTrabajos] = useState<TrabajoConEstadoEntrega[]>([]);

  const loadTrabajos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await getMe();
      if (!me || me.role !== "student") {
        navigate("/login");
        return;
      }

      const data = await listMisTrabajos();
      setTrabajos(data);
    } catch (err) {
      const errorMsg = normalizeError(err);
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void (async () => {
      try {
        await loadTrabajos();
      } catch {
        // no-op
      }
    })();
  }, [loadTrabajos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trabajos.filter((trabajo) => {
      const matchesSearch =
        trabajo.titulo.toLowerCase().includes(q) ||
        (trabajo.descripcion || "").toLowerCase().includes(q) ||
        trabajo.estado.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" && !trabajo.entregada && trabajo.estado !== "cerrado") ||
        (statusFilter === "submitted" && Boolean(trabajo.entregada)) ||
        (statusFilter === "closed" && trabajo.estado === "cerrado");

      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, trabajos]);

  const summary = useMemo(() => {
    const now = Date.now();
    let pending = 0;
    let submitted = 0;
    let overdue = 0;

    for (const trabajo of trabajos) {
      if (trabajo.entregada) {
        submitted += 1;
      } else if (trabajo.estado !== "cerrado") {
        pending += 1;
      }

      if (!trabajo.entregada && trabajo.fecha_vencimiento) {
        const due = new Date(trabajo.fecha_vencimiento).getTime();
        if (!Number.isNaN(due) && due < now) overdue += 1;
      }
    }

    return { pending, submitted, overdue };
  }, [trabajos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">{t("student.trabajos.title", { defaultValue: "Mis Trabajos" })}</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle size={48} className="mx-auto mb-3 text-red-500" />
          <p className="text-red-800 font-medium">{t("student.trabajos.error", { defaultValue: "Error al cargar trabajos" })}</p>
          <p className="text-red-600 text-sm mt-2">{error}</p>
          <button
            onClick={() => void loadTrabajos()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            {t("common.retry", { defaultValue: "Reintentar" })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("student.trabajos.title", { defaultValue: "Mis Trabajos" })}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">{t("student.trabajos.pending", { defaultValue: "Pendientes" })}</p>
          <p className="text-xl font-semibold text-amber-900">{summary.pending}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">{t("student.trabajos.entregado", { defaultValue: "Entregado" })}</p>
          <p className="text-xl font-semibold text-emerald-900">{summary.submitted}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-700">{t("student.trabajos.overdue", { defaultValue: "Vencidos" })}</p>
          <p className="text-xl font-semibold text-rose-900">{summary.overdue}</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          aria-label={t("student.trabajos.search", { defaultValue: "Buscar trabajos" })}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("student.trabajos.search", { defaultValue: "Buscar trabajos" })}
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-sm border ${statusFilter === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300"}`}
        >
          {t("common.all", { defaultValue: "Todos" })}
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("pending")}
          className={`px-3 py-1.5 rounded-full text-sm border ${statusFilter === "pending" ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-700 border-gray-300"}`}
        >
          {t("student.trabajos.pendiente", { defaultValue: "Pendiente" })}
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("submitted")}
          className={`px-3 py-1.5 rounded-full text-sm border ${statusFilter === "submitted" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-300"}`}
        >
          {t("student.trabajos.entregado", { defaultValue: "Entregado" })}
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("closed")}
          className={`px-3 py-1.5 rounded-full text-sm border ${statusFilter === "closed" ? "bg-slate-700 text-white border-slate-700" : "bg-white text-gray-700 border-gray-300"}`}
        >
          {t("student.trabajos.closed", { defaultValue: "Cerrados" })}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-2 text-gray-300" />
          {t("student.trabajos.empty", { defaultValue: "No tienes trabajos asignados" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((trabajo) => (
            <button
              key={trabajo.id}
              className="text-left bg-white rounded-lg shadow p-4 border border-gray-100 hover:border-blue-400 transition"
              onClick={() => navigate(`/student/trabajos/${trabajo.id}`)}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-900">{trabajo.titulo}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                    {trabajo.tipo_trabajo === "preguntas" && t("student.trabajos.tipoPreguntas", { defaultValue: "Preguntas" })}
                    {trabajo.tipo_trabajo === "archivo" && t("student.trabajos.tipoArchivo", { defaultValue: "Archivo" })}
                    {trabajo.tipo_trabajo === "mixto" && t("student.trabajos.tipoMixto", { defaultValue: "Mixto" })}
                    {!trabajo.tipo_trabajo && t("student.trabajos.tipoPreguntas", { defaultValue: "Preguntas" })}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${trabajo.estado === "cerrado" ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {trabajo.estado}
                  </span>
                  {trabajo.entregada ? (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      trabajo.entrega_estado === "calificada" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"
                    }`}>
                      <CheckCircle2 size={12} className="inline mr-1" />
                      {trabajo.entrega_estado === "calificada"
                        ? `${t("student.trabajos.calificado", { defaultValue: "Calificado" })}: ${trabajo.calificacion?.toFixed(1)}`
                        : t("student.trabajos.entregado", { defaultValue: "Entregado" })}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                      {t("student.trabajos.pendiente", { defaultValue: "Pendiente" })}
                    </span>
                  )}
                </div>
              </div>
              {trabajo.descripcion && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{trabajo.descripcion}</p>}
              {trabajo.fecha_vencimiento && (
                <p className="text-xs text-gray-500 mt-3">
                  {t("student.trabajos.due", { defaultValue: "Vence" })}: {new Date(trabajo.fecha_vencimiento).toLocaleString()}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
