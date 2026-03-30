import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BarChart3, CalendarRange, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import type { TrabajoAnalyticsV2Response } from "@/shared/types/trabajos";
import { getTrabajoAnalyticsV2 } from "@/features/trabajos/services/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") return msg;
  }
  return "Error inesperado";
}

function toDateInputValue(input: Date): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(base: string, delta: number): string {
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return toDateInputValue(date);
}

export default function TeacherTrabajosAnalytics() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const today = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<TrabajoAnalyticsV2Response | null>(null);
  const [previousSummary, setPreviousSummary] = useState<TrabajoAnalyticsV2Response["summary"] | null>(null);

  const [from, setFrom] = useState<string>(toDateInputValue(new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate() - 30))));
  const [to, setTo] = useState<string>(toDateInputValue(today));
  const [cursoId, setCursoId] = useState<string>("");
  const [leccionId, setLeccionId] = useState<string>("");

  const cursoOptions = useMemo(() => analytics?.cursos ?? [], [analytics]);
  const leccionOptions = useMemo(() => {
    const all = analytics?.lecciones ?? [];
    if (!cursoId) return all;
    return all.filter((item) => item.curso_id === cursoId);
  }, [analytics, cursoId]);

  const runLoad = useCallback(async (showLoader: boolean) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const current = await getTrabajoAnalyticsV2({
        from,
        to,
        curso_id: cursoId || undefined,
        leccion_id: leccionId || undefined,
      });
      setAnalytics(current);

      // Comparative against previous period with same duration.
      const fromDate = new Date(`${from}T00:00:00`);
      const toDate = new Date(`${to}T00:00:00`);
      const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
      const prevTo = shiftDays(from, -1);
      const prevFrom = shiftDays(prevTo, -(days - 1));

      const previous = await getTrabajoAnalyticsV2({
        from: prevFrom,
        to: prevTo,
        curso_id: cursoId || undefined,
        leccion_id: leccionId || undefined,
      });
      setPreviousSummary(previous.summary);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cursoId, from, leccionId, to]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        await runLoad(true);
      } catch (err) {
        toast.error(normalizeError(err));
        navigate("/teacher/trabajos");
      }
    })();
  }, [navigate, runLoad]);

  const compareText = (current: number, previous: number | null | undefined) => {
    if (previous == null) return "-";
    const diff = current - previous;
    if (diff === 0) return t("teacher.trabajos.analytics.stable", { defaultValue: "Sin cambios" });
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button
            className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
            onClick={() => navigate("/teacher/trabajos")}
          >
            <ArrowLeft size={14} />
            {t("common.back", { defaultValue: "Volver" })}
          </button>
          <h1 className="text-2xl font-bold mt-1 inline-flex items-center gap-2">
            <BarChart3 size={22} />
            {t("teacher.trabajos.analytics.title", { defaultValue: "Analytics Trabajos v2" })}
          </h1>
        </div>

        <button
          onClick={() => runLoad(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {t("teacher.trabajos.analytics.refresh", { defaultValue: "Actualizar" })}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="text-gray-600">{t("teacher.trabajos.analytics.from", { defaultValue: "Desde" })}</span>
          <input type="date" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">{t("teacher.trabajos.analytics.to", { defaultValue: "Hasta" })}</span>
          <input type="date" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">{t("teacher.trabajos.analytics.course", { defaultValue: "Curso" })}</span>
          <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={cursoId} onChange={(e) => {
            setCursoId(e.target.value);
            setLeccionId("");
          }}>
            <option value="">{t("teacher.trabajos.analytics.all", { defaultValue: "Todos" })}</option>
            {cursoOptions.map((curso) => (
              <option key={curso.curso_id} value={curso.curso_id}>{curso.curso_nombre}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-gray-600">{t("teacher.trabajos.analytics.lesson", { defaultValue: "Leccion" })}</span>
          <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={leccionId} onChange={(e) => setLeccionId(e.target.value)}>
            <option value="">{t("teacher.trabajos.analytics.all", { defaultValue: "Todos" })}</option>
            {leccionOptions.map((leccion) => (
              <option key={leccion.leccion_id} value={leccion.leccion_id}>{leccion.leccion_titulo}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.analytics.totalTrabajos", { defaultValue: "Trabajos" })}</p>
          <p className="text-2xl font-bold mt-1">{analytics?.summary.total_trabajos ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">{compareText(analytics?.summary.total_trabajos ?? 0, previousSummary?.total_trabajos)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.analytics.totalEntregas", { defaultValue: "Entregas" })}</p>
          <p className="text-2xl font-bold mt-1">{analytics?.summary.total_entregas ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">{compareText(analytics?.summary.total_entregas ?? 0, previousSummary?.total_entregas)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.analytics.totalCalificadas", { defaultValue: "Calificadas" })}</p>
          <p className="text-2xl font-bold mt-1">{analytics?.summary.total_calificadas ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">{compareText(analytics?.summary.total_calificadas ?? 0, previousSummary?.total_calificadas)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.analytics.promedio", { defaultValue: "Promedio" })}</p>
          <p className="text-2xl font-bold mt-1">{analytics?.summary.promedio_puntaje != null ? analytics.summary.promedio_puntaje.toFixed(1) : "-"}</p>
          <p className="text-xs text-gray-500 mt-1">{t("teacher.trabajos.analytics.activeStudents", { defaultValue: "Estudiantes activos" })}: {analytics?.summary.estudiantes_activos ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold mb-2 inline-flex items-center gap-2"><CalendarRange size={16} />{t("teacher.trabajos.analytics.byCourse", { defaultValue: "Por curso" })}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="py-2 pr-2">{t("teacher.trabajos.analytics.course", { defaultValue: "Curso" })}</th>
                  <th className="py-2 pr-2">{t("teacher.trabajos.analytics.totalEntregas", { defaultValue: "Entregas" })}</th>
                  <th className="py-2 pr-2">{t("teacher.trabajos.analytics.promedio", { defaultValue: "Promedio" })}</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.cursos ?? []).map((item) => (
                  <tr key={item.curso_id} className="border-b border-gray-100">
                    <td className="py-2 pr-2">{item.curso_nombre}</td>
                    <td className="py-2 pr-2">{item.total_entregas}</td>
                    <td className="py-2 pr-2">{item.promedio_puntaje != null ? item.promedio_puntaje.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold mb-2 inline-flex items-center gap-2"><CalendarRange size={16} />{t("teacher.trabajos.analytics.byLesson", { defaultValue: "Por leccion" })}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="py-2 pr-2">{t("teacher.trabajos.analytics.lesson", { defaultValue: "Leccion" })}</th>
                  <th className="py-2 pr-2">{t("teacher.trabajos.analytics.totalEntregas", { defaultValue: "Entregas" })}</th>
                  <th className="py-2 pr-2">{t("teacher.trabajos.analytics.promedio", { defaultValue: "Promedio" })}</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.lecciones ?? []).map((item) => (
                  <tr key={item.leccion_id} className="border-b border-gray-100">
                    <td className="py-2 pr-2">{item.leccion_titulo}</td>
                    <td className="py-2 pr-2">{item.total_entregas}</td>
                    <td className="py-2 pr-2">{item.promedio_puntaje != null ? item.promedio_puntaje.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-2">{t("teacher.trabajos.analytics.byStudent", { defaultValue: "Por estudiante" })}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="py-2 pr-2">{t("teacher.trabajos.analytics.student", { defaultValue: "Estudiante" })}</th>
                <th className="py-2 pr-2">{t("teacher.trabajos.analytics.course", { defaultValue: "Curso" })}</th>
                <th className="py-2 pr-2">{t("teacher.trabajos.analytics.lesson", { defaultValue: "Leccion" })}</th>
                <th className="py-2 pr-2">{t("teacher.trabajos.analytics.totalEntregas", { defaultValue: "Entregas" })}</th>
                <th className="py-2 pr-2">{t("teacher.trabajos.analytics.promedio", { defaultValue: "Promedio" })}</th>
              </tr>
            </thead>
            <tbody>
              {(analytics?.estudiantes ?? []).map((item) => (
                <tr key={`${item.estudiante_id}-${item.leccion_id}`} className="border-b border-gray-100">
                  <td className="py-2 pr-2">{item.estudiante_nombre || item.estudiante_email || item.estudiante_id}</td>
                  <td className="py-2 pr-2">{item.curso_nombre}</td>
                  <td className="py-2 pr-2">{item.leccion_titulo}</td>
                  <td className="py-2 pr-2">{item.total_entregas}</td>
                  <td className="py-2 pr-2">{item.promedio_puntaje != null ? item.promedio_puntaje.toFixed(1) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
