import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import {
  Activity,
  BookMarked,
  Filter,
  GraduationCap,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
} from "lucide-react";

import { getMe } from "@/shared/lib/auth";
import { getStudentGradeDetails, listMisMateriasEstudiante } from "@/shared/services/studentAcademic";
import { createStudentGradesStream } from "@/features/student/services/dashboard";
import type {
  Materia,
  StudentGradeDetailItem,
  StudentGradeDetailResponse,
  StudentGradeDetailTipo,
  StudentGradeFilters,
} from "@/shared/types";

const STORAGE_MATERIA_FILTER = "student.calificaciones.materia_id";
const PAGE_SIZE = 200;

const TYPE_COLORS: Record<StudentGradeDetailTipo, string> = {
  contenido: "#0ea5e9",
  prueba: "#8b5cf6",
  tarea: "#f97316",
};

const EMPTY_DETAIL: StudentGradeDetailResponse = {
  items: [],
  total: 0,
  limit: PAGE_SIZE,
  offset: 0,
  aggregates: {
    total: 0,
    promedio_general_10: 0,
    promedio_general_100: 0,
    por_tipo: [],
    por_materia: [],
    por_unidad: [],
    por_tema: [],
  },
};

function scoreTone(score: number): string {
  if (score >= 8) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 6) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return "Error inesperado";
}

type GroupedTema = {
  key: string;
  tema: string;
  items: StudentGradeDetailItem[];
};

type GroupedUnidad = {
  key: string;
  unidad: string;
  temas: GroupedTema[];
};

export default function StudentCalificacionesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [bootLoading, setBootLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [detail, setDetail] = useState<StudentGradeDetailResponse>(EMPTY_DETAIL);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  const [materiaId, setMateriaId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_MATERIA_FILTER) ?? "";
    } catch {
      return "";
    }
  });
  const [tipo, setTipo] = useState<"all" | StudentGradeDetailTipo>("all");
  const [unidadId, setUnidadId] = useState("");
  const [temaId, setTemaId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      if (materiaId) localStorage.setItem(STORAGE_MATERIA_FILTER, materiaId);
      else localStorage.removeItem(STORAGE_MATERIA_FILTER);
    } catch {
      // ignore
    }
  }, [materiaId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await getMe();
        if (!me || me.role !== "student") {
          navigate("/login");
          return;
        }
        const enrolled = await listMisMateriasEstudiante();
        if (cancelled) return;
        setMaterias(enrolled);
        setAuthorized(true);
      } catch (err) {
        if (cancelled) return;
        const message = toErrorMessage(err);
        setError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const filters = useMemo<StudentGradeFilters>(() => ({
    materia_id: materiaId || undefined,
    tipo,
    estado: "calificada",
    unidad_id: unidadId || undefined,
    tema_id: temaId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    q: search.trim() || undefined,
    limit: PAGE_SIZE,
    offset: 0,
  }), [desde, hasta, materiaId, search, temaId, tipo, unidadId]);

  const fetchAllGradePages = useCallback(async (activeFilters: StudentGradeFilters): Promise<StudentGradeDetailResponse> => {
    let offset = 0;
    let total = 0;
    let aggregates = EMPTY_DETAIL.aggregates;
    const items: StudentGradeDetailItem[] = [];

    for (let page = 0; page < 20; page += 1) {
      const response = await getStudentGradeDetails({
        ...activeFilters,
        limit: PAGE_SIZE,
        offset,
      });

      if (page === 0) {
        total = response.total;
        aggregates = response.aggregates;
      }

      items.push(...response.items);
      if (response.items.length === 0 || items.length >= response.total) break;
      offset += PAGE_SIZE;
    }

    return {
      items,
      total,
      limit: items.length,
      offset: 0,
      aggregates,
    };
  }, []);

  const loadDetails = useCallback(async (silent = false) => {
    if (!authorized) return;

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const payload = await fetchAllGradePages(filters);
      setDetail(payload);
      setError(null);
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [authorized, fetchAllGradePages, filters]);

  useEffect(() => {
    if (!authorized) return;
    void loadDetails(false);
  }, [authorized, loadDetails]);

  const loadDetailsRef = useRef(loadDetails);
  useEffect(() => {
    loadDetailsRef.current = loadDetails;
  }, [loadDetails]);

  useEffect(() => {
    if (!authorized) return;

    const closeStream = createStudentGradesStream({
      onOpen: () => setStreamConnected(true),
      onError: () => setStreamConnected(false),
      onGradeEvent: () => {
        void loadDetailsRef.current(true);
      },
    });

    const fallbackPoll = window.setInterval(() => {
      void loadDetailsRef.current(true);
    }, 90000);

    return () => {
      closeStream();
      window.clearInterval(fallbackPoll);
    };
  }, [authorized]);

  const typeTotals = useMemo(() => {
    const map: Record<StudentGradeDetailTipo, number> = {
      contenido: 0,
      prueba: 0,
      tarea: 0,
    };
    for (const row of detail.aggregates.por_tipo) {
      if (row.tipo in map) map[row.tipo as StudentGradeDetailTipo] = row.total;
    }
    return map;
  }, [detail.aggregates.por_tipo]);

  const typeChartData = useMemo(() => ([
    {
      tipo: "contenido",
      name: t("student.grades.types.content", { defaultValue: "Contenidos" }),
      value: typeTotals.contenido,
      color: TYPE_COLORS.contenido,
    },
    {
      tipo: "prueba",
      name: t("student.grades.types.exam", { defaultValue: "Pruebas" }),
      value: typeTotals.prueba,
      color: TYPE_COLORS.prueba,
    },
    {
      tipo: "tarea",
      name: t("student.grades.types.assignment", { defaultValue: "Tareas" }),
      value: typeTotals.tarea,
      color: TYPE_COLORS.tarea,
    },
  ]), [t, typeTotals.contenido, typeTotals.prueba, typeTotals.tarea]);

  const materiaChartData = useMemo(() => {
    return [...detail.aggregates.por_materia]
      .sort((a, b) => b.promedio_10 - a.promedio_10)
      .slice(0, 10)
      .map((row) => ({
        materia: row.materia.length > 14 ? `${row.materia.slice(0, 14)}...` : row.materia,
        promedio: Number(row.promedio_10.toFixed(2)),
      }));
  }, [detail.aggregates.por_materia]);

  const grouped = useMemo<GroupedUnidad[]>(() => {
    const units = new Map<string, { unidad: string; temas: Map<string, { tema: string; items: StudentGradeDetailItem[] }> }>();

    for (const item of detail.items) {
      const unitKey = item.unidad_id || "sin_unidad";
      const unitLabel = item.unidad || t("student.grades.grouping.noUnit", { defaultValue: "Sin unidad" });
      if (!units.has(unitKey)) {
        units.set(unitKey, { unidad: unitLabel, temas: new Map() });
      }

      const temaKey = item.tema_id || "sin_tema";
      const temaLabel = item.tema || t("student.grades.grouping.noTopic", { defaultValue: "Sin tema" });
      const unit = units.get(unitKey)!;
      if (!unit.temas.has(temaKey)) {
        unit.temas.set(temaKey, { tema: temaLabel, items: [] });
      }
      unit.temas.get(temaKey)!.items.push(item);
    }

    const normalized: GroupedUnidad[] = [];
    for (const [unitKey, unitValue] of units.entries()) {
      const temas: GroupedTema[] = [];
      for (const [temaKey, temaValue] of unitValue.temas.entries()) {
        temas.push({
          key: temaKey,
          tema: temaValue.tema,
          items: [...temaValue.items].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
        });
      }
      temas.sort((a, b) => a.tema.localeCompare(b.tema));
      normalized.push({
        key: unitKey,
        unidad: unitValue.unidad,
        temas,
      });
    }

    normalized.sort((a, b) => a.unidad.localeCompare(b.unidad));
    return normalized;
  }, [detail.items, t]);

  const unitOptions = detail.aggregates.por_unidad;
  const temaOptions = detail.aggregates.por_tema;

  const clearFilters = () => {
    setMateriaId("");
    setTipo("all");
    setUnidadId("");
    setTemaId("");
    setDesde("");
    setHasta("");
    setSearch("");
  };

  const topMateria = useMemo(() => {
    if (detail.aggregates.por_materia.length === 0) return null;
    return [...detail.aggregates.por_materia].sort((a, b) => b.promedio_10 - a.promedio_10)[0] || null;
  }, [detail.aggregates.por_materia]);

  const latestGrade = detail.items.length > 0 ? detail.items[0] : null;

  const typeLabel = (value: StudentGradeDetailTipo) => {
    if (value === "contenido") return t("student.grades.types.content", { defaultValue: "Contenidos" });
    if (value === "prueba") return t("student.grades.types.exam", { defaultValue: "Pruebas" });
    return t("student.grades.types.assignment", { defaultValue: "Tareas" });
  };

  const totalByType = typeTotals.contenido + typeTotals.prueba + typeTotals.tarea;

  if (bootLoading || (loading && !authorized)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-sky-50 to-white p-6 shadow-md">
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700">
                <Sparkles size={14} />
                {t("student.grades.title", { defaultValue: "Calificaciones" })}
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                {t("student.grades.title", { defaultValue: "Calificaciones" })}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {t("student.grades.subtitle", { defaultValue: "Detalle de contenidos, pruebas y tareas con vista por materia, unidad y tema." })}
              </p>
            </div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur">
              <RefreshCw size={16} className={refreshing ? "animate-spin text-blue-600" : "text-slate-500"} />
              <span className="text-xs font-semibold text-slate-700">
                {streamConnected
                  ? t("student.grades.realtime.active", { defaultValue: "Tiempo real activo" })
                  : t("student.grades.realtime.reconnecting", { defaultValue: "Reconectando stream..." })}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTipo("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${tipo === "all" ? "bg-indigo-600 text-white shadow-md" : "bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              {t("student.grades.filters.allTypes", { defaultValue: "Todos los tipos" })}
            </button>
            {(["contenido", "prueba", "tarea"] as StudentGradeDetailTipo[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTipo(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${tipo === value ? "text-white shadow-md" : "bg-white text-slate-700 hover:bg-slate-100"}`}
                style={tipo === value ? { backgroundColor: TYPE_COLORS[value] } : undefined}
              >
                {typeLabel(value)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter size={16} />
          {t("student.grades.filters.title", { defaultValue: "Filtros" })}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.subject", { defaultValue: "Materia" })}
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={materiaId}
              onChange={(e) => setMateriaId(e.target.value)}
            >
              <option value="">{t("student.grades.filters.allSubjects", { defaultValue: "Todas las materias" })}</option>
              {materias.map((materia) => (
                <option key={materia.id} value={materia.id}>{materia.nombre}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.type", { defaultValue: "Tipo" })}
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "all" | StudentGradeDetailTipo)}
            >
              <option value="all">{t("student.grades.filters.allTypes", { defaultValue: "Todos los tipos" })}</option>
              <option value="contenido">{t("student.grades.types.content", { defaultValue: "Contenidos" })}</option>
              <option value="prueba">{t("student.grades.types.exam", { defaultValue: "Pruebas" })}</option>
              <option value="tarea">{t("student.grades.types.assignment", { defaultValue: "Tareas" })}</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.unit", { defaultValue: "Unidad" })}
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
            >
              <option value="">{t("student.grades.filters.allUnits", { defaultValue: "Todas las unidades" })}</option>
              {unitOptions.map((row) => (
                <option key={row.unidad_id} value={row.unidad_id}>{row.unidad}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.topic", { defaultValue: "Tema" })}
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={temaId}
              onChange={(e) => setTemaId(e.target.value)}
            >
              <option value="">{t("student.grades.filters.allTopics", { defaultValue: "Todos los temas" })}</option>
              {temaOptions.map((row) => (
                <option key={row.tema_id} value={row.tema_id}>{row.tema}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.from", { defaultValue: "Desde" })}
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.to", { defaultValue: "Hasta" })}
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>

          <label className="text-xs font-medium text-slate-600 md:col-span-2">
            {t("student.grades.filters.search", { defaultValue: "Buscar" })}
            <div className="relative mt-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("student.grades.filters.searchPlaceholder", { defaultValue: "Titulo, materia, unidad o tema" })}
              />
            </div>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDetails(false)}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:translate-y-[-1px] hover:shadow-lg"
          >
            {t("student.grades.filters.apply", { defaultValue: "Aplicar filtros" })}
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t("student.grades.filters.clear", { defaultValue: "Limpiar" })}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-sky-700">{t("student.grades.kpis.total", { defaultValue: "Total calificaciones" })}</p>
            <BookMarked size={16} className="text-sky-600" />
          </div>
          <p className="text-3xl font-extrabold text-sky-900">{detail.total}</p>
          <p className="mt-1 text-[11px] text-slate-500">{t("student.grades.kpis.totalHint", { defaultValue: "Registros visibles con filtros actuales" })}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-700">{t("student.grades.kpis.average10", { defaultValue: "Promedio general /10" })}</p>
            <GraduationCap size={16} className="text-emerald-600" />
          </div>
          <p className="text-3xl font-extrabold text-emerald-900">{detail.aggregates.promedio_general_10.toFixed(2)}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, detail.aggregates.promedio_general_10 * 10))}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-violet-700">{t("student.grades.kpis.exams", { defaultValue: "Pruebas calificadas" })}</p>
            <Trophy size={16} className="text-violet-600" />
          </div>
          <p className="text-3xl font-extrabold text-violet-900">{typeTotals.prueba}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {totalByType > 0 ? `${Math.round((typeTotals.prueba / totalByType) * 100)}%` : "0%"}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-orange-700">{t("student.grades.kpis.assignments", { defaultValue: "Tareas calificadas" })}</p>
            <Activity size={16} className="text-orange-600" />
          </div>
          <p className="text-3xl font-extrabold text-orange-900">{typeTotals.tarea}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {totalByType > 0 ? `${Math.round((typeTotals.tarea / totalByType) * 100)}%` : "0%"}
          </p>
        </div>
        <div className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold text-fuchsia-700">{t("student.grades.kpis.topSubject", { defaultValue: "Materia destacada" })}</p>
          <p className="mt-1 truncate text-base font-bold text-fuchsia-900">{topMateria?.materia || "-"}</p>
          <p className="mt-1 text-sm text-fuchsia-700">
            {topMateria ? `${topMateria.promedio_10.toFixed(2)} /10` : t("student.grades.kpis.noData", { defaultValue: "Sin datos" })}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            {latestGrade
              ? `${t("student.grades.kpis.latestGrade", { defaultValue: "Ultima nota" })}: ${new Date(latestGrade.fecha).toLocaleDateString()}`
              : t("student.grades.kpis.latestGradeNone", { defaultValue: "Sin calificaciones recientes" })}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            {t("student.grades.charts.byType", { defaultValue: "Distribucion de calificaciones por tipo" })}
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            {t("student.grades.charts.byTypeHint", { defaultValue: "Muestra como se reparte tu actividad evaluada entre contenidos, pruebas y tareas." })}
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={105} label>
                  {typeChartData.map((row) => (
                    <Cell key={row.tipo} fill={row.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            {t("student.grades.charts.bySubject", { defaultValue: "Promedio por materia (/10)" })}
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            {t("student.grades.charts.bySubjectHint", { defaultValue: "Comparacion de rendimiento en tus materias con mayor actividad." })}
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={materiaChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="materia" />
                <YAxis domain={[0, 10]} />
                <Tooltip />
                <Bar dataKey="promedio" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            {t("student.grades.list.title", { defaultValue: "Detalle agrupado por Unidad y Tema" })}
          </h3>
          <button
            type="button"
            onClick={() => navigate("/student/dashboard")}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t("student.grades.list.backDashboard", { defaultValue: "Volver al panel" })}
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-[16vh] items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {t("student.grades.empty", { defaultValue: "No hay calificaciones para los filtros seleccionados." })}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((unidad) => (
              <div key={unidad.key} className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-cyan-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
                  {t("student.grades.grouping.unit", { defaultValue: "Unidad" })}: {unidad.unidad}
                </div>
                <div className="space-y-4 p-4">
                  {unidad.temas.map((tema) => (
                    <div key={tema.key} className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {t("student.grades.grouping.topic", { defaultValue: "Tema" })}: {tema.tema}
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-slate-700">
                            <tr>
                              <th className="px-3 py-2 text-left">{t("student.grades.table.date", { defaultValue: "Fecha" })}</th>
                              <th className="px-3 py-2 text-left">{t("student.grades.table.type", { defaultValue: "Tipo" })}</th>
                              <th className="px-3 py-2 text-left">{t("student.grades.table.activity", { defaultValue: "Actividad" })}</th>
                              <th className="px-3 py-2 text-left">{t("student.grades.table.subject", { defaultValue: "Materia" })}</th>
                              <th className="px-3 py-2 text-left">{t("student.grades.table.grade10", { defaultValue: "Nota /10" })}</th>
                              <th className="px-3 py-2 text-left">{t("student.grades.table.score100", { defaultValue: "Puntaje /100" })}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tema.items.map((item) => (
                              <tr key={item.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-600">{new Date(item.fecha).toLocaleString()}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm"
                                    style={{ backgroundColor: `${TYPE_COLORS[item.tipo]}22`, color: TYPE_COLORS[item.tipo], border: `1px solid ${TYPE_COLORS[item.tipo]}44` }}
                                  >
                                    {typeLabel(item.tipo)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-medium text-slate-900">{item.titulo}</td>
                                <td className="px-3 py-2 text-slate-700">{item.materia || "-"}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${scoreTone(item.nota_10)}`}>
                                    {item.nota_10.toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-semibold text-slate-800">{item.puntaje_100.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
