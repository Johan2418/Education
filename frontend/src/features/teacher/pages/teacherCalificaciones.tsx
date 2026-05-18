import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { BarChart, Bar, CartesianGrid, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Activity, BookMarked, Filter, RefreshCw, Search, Sparkles, Trophy, Users } from "lucide-react";

import { getMe } from "@/shared/lib/auth";
import { getTeacherGradeDetails, listMisCursosDocente } from "@/features/teacher/services/docencia";
import type {
  TeacherGradeDetailItem,
  TeacherGradeDetailResponse,
  TeacherGradeDetailTipo,
  TeacherGradeFilters,
  MisCursoDocente,
} from "@/shared/types";

const PAGE_SIZE = 200;
const POLLING_MS = 90000;

const TYPE_COLORS: Record<TeacherGradeDetailTipo, string> = {
  contenido: "#0ea5e9",
  prueba: "#8b5cf6",
  tarea: "#f97316",
};

const EMPTY_RESPONSE: TeacherGradeDetailResponse = {
  items: [],
  total: 0,
  limit: PAGE_SIZE,
  offset: 0,
  aggregates: {
    total: 0,
    promedio_general_10: 0,
    promedio_general_100: 0,
    por_tipo: [],
    por_curso: [],
    por_materia: [],
    por_estudiante: [],
    por_unidad: [],
    por_tema: [],
  },
};

function toErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return "Error inesperado";
}

function scoreTone(score: number): string {
  if (score >= 8) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 6) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

type GroupedTema = {
  key: string;
  tema: string;
  items: TeacherGradeDetailItem[];
};

type GroupedUnidad = {
  key: string;
  unidad: string;
  temas: GroupedTema[];
};

function firstName(fullName: string): string {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return "-";
  const parts = trimmed.split(/\s+/g);
  return parts[0] || trimmed;
}

export default function TeacherCalificacionesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [bootLoading, setBootLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedCursos, setAssignedCursos] = useState<MisCursoDocente[]>([]);
  const [detail, setDetail] = useState<TeacherGradeDetailResponse>(EMPTY_RESPONSE);

  const [cursoId, setCursoId] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [estudianteId, setEstudianteId] = useState("");
  const [tipo, setTipo] = useState<"all" | TeacherGradeDetailTipo>("all");
  const [unidadId, setUnidadId] = useState("");
  const [temaId, setTemaId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        if (me.role === "teacher") {
          const cursos = await listMisCursosDocente();
          if (!cancelled) setAssignedCursos(Array.isArray(cursos) ? cursos : []);
        }

        if (!cancelled) {
          setAuthorized(true);
          setError(null);
        }
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

  const filters = useMemo<TeacherGradeFilters>(() => ({
    curso_id: cursoId || undefined,
    materia_id: materiaId || undefined,
    estudiante_id: estudianteId || undefined,
    tipo,
    estado: "calificada",
    unidad_id: unidadId || undefined,
    tema_id: temaId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    q: search.trim() || undefined,
    limit: PAGE_SIZE,
    offset: 0,
  }), [cursoId, desde, estudianteId, hasta, materiaId, search, temaId, tipo, unidadId]);

  const fetchAllGradePages = useCallback(async (activeFilters: TeacherGradeFilters): Promise<TeacherGradeDetailResponse> => {
    let offset = 0;
    let total = 0;
    let aggregates = EMPTY_RESPONSE.aggregates;
    const items: TeacherGradeDetailItem[] = [];

    for (let page = 0; page < 20; page += 1) {
      const response = await getTeacherGradeDetails({
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

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => {
      void loadDetails(true);
    }, POLLING_MS);
    return () => window.clearInterval(timer);
  }, [authorized, loadDetails]);

  const typeTotals = useMemo(() => {
    const map: Record<TeacherGradeDetailTipo, number> = {
      contenido: 0,
      prueba: 0,
      tarea: 0,
    };
    for (const row of detail.aggregates.por_tipo) {
      if (row.tipo in map) map[row.tipo as TeacherGradeDetailTipo] = row.total;
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
    const source = estudianteId
      ? detail.items.filter((item) => item.estudiante_id === estudianteId)
      : detail.items;

    const units = new Map<string, { unidad: string; temas: Map<string, { tema: string; items: TeacherGradeDetailItem[] }> }>();

    for (const item of source) {
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
  }, [detail.items, estudianteId, t]);

  const cursosOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of assignedCursos) {
      if (item.curso_id && item.curso_nombre) map.set(item.curso_id, item.curso_nombre);
    }
    for (const item of detail.aggregates.por_curso) {
      if (item.curso_id && item.curso) map.set(item.curso_id, item.curso);
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [assignedCursos, detail.aggregates.por_curso]);

  const materiasOptions = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; cursoId?: string }>();
    for (const item of assignedCursos) {
      if (!item.materia_id) continue;
      map.set(item.materia_id, { id: item.materia_id, nombre: item.materia_nombre || "-", cursoId: item.curso_id });
    }
    for (const item of detail.aggregates.por_materia) {
      if (!item.materia_id) continue;
      map.set(item.materia_id, { id: item.materia_id, nombre: item.materia || "-", cursoId: item.curso_id || undefined });
    }

    let options = Array.from(map.values());
    if (cursoId) options = options.filter((item) => item.cursoId === cursoId);
    return options.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [assignedCursos, cursoId, detail.aggregates.por_materia]);

  const estudiantesOptions = useMemo(() => {
    return [...detail.aggregates.por_estudiante]
      .map((row) => ({
        id: row.estudiante_id,
        nombre: row.estudiante || row.estudiante_email || row.estudiante_id,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [detail.aggregates.por_estudiante]);

  const unitOptions = detail.aggregates.por_unidad;
  const temaOptions = detail.aggregates.por_tema;

  const latestGrade = detail.items.length > 0 ? detail.items[0] : null;

  const topStudent = useMemo(() => {
    if (detail.aggregates.por_estudiante.length === 0) return null;
    return [...detail.aggregates.por_estudiante].sort((a, b) => b.promedio_10 - a.promedio_10)[0] || null;
  }, [detail.aggregates.por_estudiante]);

  const topMateria = useMemo(() => {
    if (detail.aggregates.por_materia.length === 0) return null;
    return [...detail.aggregates.por_materia].sort((a, b) => b.promedio_10 - a.promedio_10)[0] || null;
  }, [detail.aggregates.por_materia]);

  const clearFilters = () => {
    setCursoId("");
    setMateriaId("");
    setEstudianteId("");
    setTipo("all");
    setUnidadId("");
    setTemaId("");
    setDesde("");
    setHasta("");
    setSearch("");
  };

  const typeLabel = (value: TeacherGradeDetailTipo) => {
    if (value === "contenido") return t("student.grades.types.content", { defaultValue: "Contenidos" });
    if (value === "prueba") return t("student.grades.types.exam", { defaultValue: "Pruebas" });
    return t("student.grades.types.assignment", { defaultValue: "Tareas" });
  };

  if (bootLoading || (loading && !authorized)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-indigo-50 to-white p-6 shadow-md">
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-indigo-200/35 blur-3xl" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-xs font-semibold text-sky-700">
                <Sparkles size={14} />
                {t("teacher.grades.title", { defaultValue: "Calificaciones" })}
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                {t("teacher.grades.title", { defaultValue: "Calificaciones" })}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {t("teacher.grades.subtitle", { defaultValue: "Vista docente por estudiante de contenidos, pruebas y tareas con filtros por curso, materia, unidad y tema." })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDetails(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin text-blue-600" : "text-slate-500"} />
              {refreshing
                ? t("teacher.grades.realtime.refreshing", { defaultValue: "Actualizando..." })
                : t("teacher.grades.realtime.refresh", { defaultValue: "Actualizar" })}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTipo("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${tipo === "all" ? "bg-indigo-600 text-white shadow-md" : "bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              {t("student.grades.filters.allTypes", { defaultValue: "Todos los tipos" })}
            </button>
            {(["contenido", "prueba", "tarea"] as TeacherGradeDetailTipo[]).map((value) => (
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
            {t("teacher.grades.filters.course", { defaultValue: "Curso" })}
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={cursoId} onChange={(e) => {
              setCursoId(e.target.value);
              setMateriaId("");
              setEstudianteId("");
            }}>
              <option value="">{t("teacher.grades.filters.allCourses", { defaultValue: "Todos los cursos" })}</option>
              {cursosOptions.map((curso) => (
                <option key={curso.id} value={curso.id}>{curso.nombre}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.subject", { defaultValue: "Materia" })}
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={materiaId} onChange={(e) => {
              setMateriaId(e.target.value);
              setEstudianteId("");
            }}>
              <option value="">{t("teacher.performance.allSubjects", { defaultValue: "Todas las materias" })}</option>
              {materiasOptions.map((materia) => (
                <option key={materia.id} value={materia.id}>{materia.nombre}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("teacher.grades.filters.student", { defaultValue: "Estudiante" })}
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={estudianteId} onChange={(e) => setEstudianteId(e.target.value)}>
              <option value="">{t("teacher.grades.filters.allStudents", { defaultValue: "Todos los estudiantes" })}</option>
              {estudiantesOptions.map((student) => (
                <option key={student.id} value={student.id}>{student.nombre}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.type", { defaultValue: "Tipo" })}
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={tipo} onChange={(e) => setTipo((e.target.value as "all" | TeacherGradeDetailTipo) || "all")}>
              <option value="all">{t("student.grades.filters.allTypes", { defaultValue: "Todos los tipos" })}</option>
              <option value="contenido">{t("student.grades.types.content", { defaultValue: "Contenidos" })}</option>
              <option value="prueba">{t("student.grades.types.exam", { defaultValue: "Pruebas" })}</option>
              <option value="tarea">{t("student.grades.types.assignment", { defaultValue: "Tareas" })}</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.unit", { defaultValue: "Unidad" })}
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              <option value="">{t("student.grades.filters.allUnits", { defaultValue: "Todas las unidades" })}</option>
              {unitOptions.map((unit) => (
                <option key={unit.unidad_id} value={unit.unidad_id}>{unit.unidad}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.topic", { defaultValue: "Tema" })}
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={temaId} onChange={(e) => setTemaId(e.target.value)}>
              <option value="">{t("student.grades.filters.allTopics", { defaultValue: "Todos los temas" })}</option>
              {temaOptions.map((topic) => (
                <option key={topic.tema_id} value={topic.tema_id}>{topic.tema}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.from", { defaultValue: "Desde" })}
            <input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>

          <label className="text-xs font-medium text-slate-600">
            {t("student.grades.filters.to", { defaultValue: "Hasta" })}
            <input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>

        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm"
              placeholder={t("teacher.grades.filters.search", { defaultValue: "Buscar por título, materia, unidad o tema" })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" onClick={clearFilters} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {t("student.grades.filters.clear", { defaultValue: "Limpiar" })}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{t("teacher.grades.kpi.totalGrades", { defaultValue: "Total calificaciones" })}</p>
          <p className="mt-2 text-3xl font-black text-sky-900">{detail.aggregates.total}</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{t("teacher.grades.kpi.average", { defaultValue: "Promedio general /10" })}</p>
          <p className="mt-2 text-3xl font-black text-emerald-900">{detail.aggregates.promedio_general_10.toFixed(2)}</p>
        </article>
        <article className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("teacher.grades.kpi.topStudent", { defaultValue: "Mejor estudiante" })}</p>
          <p className="mt-2 text-xl font-black text-violet-900">{topStudent ? firstName(topStudent.estudiante) : "-"}</p>
          <p className="text-xs text-violet-700">{topStudent ? `${topStudent.promedio_10.toFixed(2)} / 10` : ""}</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t("teacher.grades.kpi.topSubject", { defaultValue: "Materia destacada" })}</p>
          <p className="mt-2 text-xl font-black text-amber-900">{topMateria?.materia || "-"}</p>
          <p className="text-xs text-amber-700">{topMateria ? `${topMateria.promedio_10.toFixed(2)} / 10` : ""}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Activity size={18} />
            {t("teacher.grades.charts.byType", { defaultValue: "Distribución de calificaciones por tipo" })}
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeChartData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>
                  {typeChartData.map((entry) => (
                    <Cell key={entry.tipo} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BookMarked size={18} />
            {t("teacher.grades.charts.bySubject", { defaultValue: "Promedio por materia (/10)" })}
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={materiaChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="materia" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 10]} />
                <Tooltip />
                <Bar dataKey="promedio" fill="#4f46e5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Users size={18} />
            {t("teacher.grades.students.title", { defaultValue: "Promedios por estudiante" })}
          </h2>
          {estudianteId && (
            <button type="button" onClick={() => setEstudianteId("")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {t("teacher.grades.students.clear", { defaultValue: "Quitar selección" })}
            </button>
          )}
        </div>

        {detail.aggregates.por_estudiante.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            {t("teacher.grades.empty", { defaultValue: "No hay calificaciones para los filtros seleccionados." })}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2">{t("teacher.grades.students.name", { defaultValue: "Estudiante" })}</th>
                  <th className="py-2 px-2">{t("teacher.grades.students.email", { defaultValue: "Correo" })}</th>
                  <th className="py-2 px-2">{t("teacher.grades.students.total", { defaultValue: "Calificadas" })}</th>
                  <th className="py-2 px-2">{t("teacher.grades.students.average", { defaultValue: "Promedio /10" })}</th>
                  <th className="py-2 pl-2">{t("teacher.grades.students.action", { defaultValue: "Acción" })}</th>
                </tr>
              </thead>
              <tbody>
                {detail.aggregates.por_estudiante.map((student) => (
                  <tr key={student.estudiante_id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="py-2 pr-2 font-medium text-slate-800">{student.estudiante || student.estudiante_email || student.estudiante_id}</td>
                    <td className="py-2 px-2 text-slate-600">{student.estudiante_email || "-"}</td>
                    <td className="py-2 px-2">{student.total}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreTone(student.promedio_10)}`}>
                        {student.promedio_10.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2 pl-2">
                      <button
                        type="button"
                        onClick={() => setEstudianteId((current) => current === student.estudiante_id ? "" : student.estudiante_id)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                      >
                        {estudianteId === student.estudiante_id
                          ? t("teacher.grades.students.hideDetail", { defaultValue: "Ocultar" })
                          : t("teacher.grades.students.viewDetail", { defaultValue: "Ver detalle" })}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Trophy size={18} />
          {t("teacher.grades.detail.title", { defaultValue: "Detalle de actividades calificadas" })}
        </h2>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            {t("teacher.grades.empty", { defaultValue: "No hay calificaciones para los filtros seleccionados." })}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((unit) => (
              <article key={unit.key} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <h3 className="text-sm font-semibold text-slate-800">{unit.unidad}</h3>
                <div className="mt-2 space-y-2">
                  {unit.temas.map((tema) => (
                    <div key={tema.key} className="rounded-lg border border-slate-200 bg-white p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tema.tema}</h4>
                      <div className="mt-2 space-y-2">
                        {tema.items.map((item) => (
                          <div key={`${item.id}-${item.estudiante_id}`} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{item.titulo}</p>
                              <p className="text-xs text-slate-500">
                                {typeLabel(item.tipo)} · {item.estudiante || item.estudiante_email || item.estudiante_id} · {new Date(item.fecha).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreTone(item.nota_10)}`}>
                                {item.nota_10.toFixed(2)} / 10
                              </span>
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                                {item.puntaje_100.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {latestGrade && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-900">
          <strong>{t("teacher.grades.latest.title", { defaultValue: "Última calificación registrada" })}:</strong>{" "}
          {latestGrade.titulo} · {latestGrade.estudiante || latestGrade.estudiante_email || latestGrade.estudiante_id} · {latestGrade.nota_10.toFixed(2)} / 10
        </section>
      )}
    </div>
  );
}
