import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, Link2, Loader2, Paperclip, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { api } from "@/shared/lib/api";
import type { Materia, MateriaCalificacionesResponse, MisCursoDocente } from "@/shared/types";
import { listMisCursosDocente, getMateriaCalificaciones } from "@/features/teacher/services/docencia";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") return msg;
  }
  return "Error inesperado";
}

function unwrapData<T>(value: T | { data?: T | null } | null | undefined): T | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "data" in value) {
    return ((value as { data?: T | null }).data ?? null) as T | null;
  }
  return value as T;
}

function buildMateriaContextQuery(item: MisCursoDocente): string {
  const params = new URLSearchParams();
  params.set("materiaId", item.materia_id);
  params.set("materiaNombre", item.materia_nombre);
  params.set("cursoNombre", item.curso_nombre);
  params.set("anioEscolar", item.anio_escolar);
  return params.toString();
}

function estadoBadge(estado: string): string {
  switch (estado) {
    case "aprobada":
      return "bg-emerald-100 text-emerald-700";
    case "reprobada":
      return "bg-rose-100 text-rose-700";
    case "materia_no_completada":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function estadoLabel(estado: string): string {
  switch (estado) {
    case "aprobada":
      return "Aprobada";
    case "reprobada":
      return "Reprobada";
    case "materia_no_completada":
      return "Materia no completada";
    default:
      return "Sin calificar";
  }
}

export default function TeacherMaterias() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<MisCursoDocente[]>([]);

  const [gradingOpen, setGradingOpen] = useState(false);
  const [gradingTarget, setGradingTarget] = useState<MisCursoDocente | null>(null);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingSaving, setGradingSaving] = useState(false);
  const [gradingData, setGradingData] = useState<MateriaCalificacionesResponse | null>(null);
  const [gradingConfig, setGradingConfig] = useState({
    peso_contenidos_pct: "35",
    peso_lecciones_pct: "35",
    peso_trabajos_pct: "30",
    puntaje_total: "10",
    puntaje_minimo_aprobacion: "6",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        const data = await listMisCursosDocente();
        setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const filtered = useMemo(() => {
    const source = Array.isArray(items) ? items : [];
    const query = search.trim().toLowerCase();
    if (!query) return source;

    return source.filter((item) => {
      const materia = item.materia_nombre.toLowerCase();
      const curso = item.curso_nombre.toLowerCase();
      const anio = item.anio_escolar.toLowerCase();
      return materia.includes(query) || curso.includes(query) || anio.includes(query);
    });
  }, [items, search]);

  const openRecursosPersonales = (item: MisCursoDocente) => {
    navigate(`/teacher/recursos-personales?${buildMateriaContextQuery(item)}`);
  };

  const openRecursosGlobales = (item: MisCursoDocente) => {
    navigate(`/teacher/recursos?${buildMateriaContextQuery(item)}`);
  };

  const openVistaTemas = (item: MisCursoDocente) => {
    navigate(`/contents/${item.materia_id}`);
  };

  const openCrearContenido = (item: MisCursoDocente) => {
    navigate(`/contents/${item.materia_id}?openCreate=1`);
  };

  const openCalificaciones = async (item: MisCursoDocente) => {
    setGradingOpen(true);
    setGradingTarget(item);
    setGradingLoading(true);
    try {
      const [materiaPayload, calificaciones] = await Promise.all([
        api.get<Materia | { data?: Materia | null }>(`/materias/${item.materia_id}`),
        getMateriaCalificaciones(item.materia_id),
      ]);

      const materia = unwrapData(materiaPayload);
      if (materia) {
        setGradingConfig({
          peso_contenidos_pct: String(materia.peso_contenidos_pct ?? calificaciones.peso_contenidos_pct ?? 35),
          peso_lecciones_pct: String(materia.peso_lecciones_pct ?? calificaciones.peso_lecciones_pct ?? 35),
          peso_trabajos_pct: String(materia.peso_trabajos_pct ?? calificaciones.peso_trabajos_pct ?? 30),
          puntaje_total: String(materia.puntaje_total ?? calificaciones.puntaje_total ?? 10),
          puntaje_minimo_aprobacion: String(materia.puntaje_minimo_aprobacion ?? calificaciones.puntaje_minimo_aprobacion ?? 6),
        });
      } else {
        setGradingConfig({
          peso_contenidos_pct: String(calificaciones.peso_contenidos_pct ?? 35),
          peso_lecciones_pct: String(calificaciones.peso_lecciones_pct ?? 35),
          peso_trabajos_pct: String(calificaciones.peso_trabajos_pct ?? 30),
          puntaje_total: String(calificaciones.puntaje_total ?? 10),
          puntaje_minimo_aprobacion: String(calificaciones.puntaje_minimo_aprobacion ?? 6),
        });
      }
      setGradingData(calificaciones);
    } catch (err) {
      toast.error(normalizeError(err));
      setGradingOpen(false);
      setGradingTarget(null);
      setGradingData(null);
    } finally {
      setGradingLoading(false);
    }
  };

  const closeCalificaciones = () => {
    setGradingOpen(false);
    setGradingTarget(null);
    setGradingData(null);
  };

  const handleSaveConfig = async () => {
    if (!gradingTarget) return;

    const pesoContenidos = Number(gradingConfig.peso_contenidos_pct);
    const pesoLecciones = Number(gradingConfig.peso_lecciones_pct);
    const pesoTrabajos = Number(gradingConfig.peso_trabajos_pct);
    const puntajeTotal = Number(gradingConfig.puntaje_total);
    const puntajeMinimo = Number(gradingConfig.puntaje_minimo_aprobacion);

    if ([pesoContenidos, pesoLecciones, pesoTrabajos, puntajeTotal, puntajeMinimo].some((n) => !Number.isFinite(n))) {
      toast.error("Todos los campos deben ser numéricos");
      return;
    }
    if (pesoContenidos < 0 || pesoLecciones < 0 || pesoTrabajos < 0) {
      toast.error("Las ponderaciones no pueden ser negativas");
      return;
    }
    if (Math.abs(pesoContenidos + pesoLecciones + pesoTrabajos - 100) > 0.001) {
      toast.error("La suma de ponderaciones debe ser 100%");
      return;
    }
    if (puntajeTotal <= 0) {
      toast.error("El puntaje total debe ser mayor a 0");
      return;
    }
    if (puntajeMinimo < 0 || puntajeMinimo > puntajeTotal) {
      toast.error("El mínimo de aprobación debe estar entre 0 y el puntaje total");
      return;
    }

    setGradingSaving(true);
    try {
      await api.put(`/materias/${gradingTarget.materia_id}`, {
        peso_contenidos_pct: pesoContenidos,
        peso_lecciones_pct: pesoLecciones,
        peso_trabajos_pct: pesoTrabajos,
        puntaje_total: puntajeTotal,
        puntaje_minimo_aprobacion: puntajeMinimo,
      });

      const refreshed = await getMateriaCalificaciones(gradingTarget.materia_id);
      setGradingData(refreshed);
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setGradingSaving(false);
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
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("teacher.subjects.title", { defaultValue: "Mis materias" })}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("teacher.subjects.subtitle", { defaultValue: "Gestiona recursos por materia para construir la vista de temas para estudiantes." })}
        </p>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("teacher.subjects.search", { defaultValue: "Buscar por materia, curso o ano..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 p-10 bg-white rounded-lg shadow">
          <BookOpen size={42} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{t("teacher.subjects.empty", { defaultValue: "No hay materias asignadas" })}</p>
          <p className="text-sm mt-1">{t("teacher.subjects.emptyHint", { defaultValue: "Solicita a administracion la asignacion por materia." })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const metricItems = [
              { key: "students", label: t("teacher.cursos.metrics.students", { defaultValue: "Estudiantes" }), value: item.total_estudiantes },
              { key: "lessons", label: t("teacher.cursos.metrics.lessons", { defaultValue: "Lecciones" }), value: item.total_lecciones },
              { key: "tasks", label: t("teacher.cursos.metrics.tasks", { defaultValue: "Trabajos" }), value: item.total_trabajos },
            ];

            return (
              <article key={item.asignacion_id} className="bg-white rounded-xl shadow p-4 border border-gray-100 hover:border-blue-300 hover:shadow-lg transition">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h2 className="font-semibold text-gray-900">{item.materia_nombre}</h2>
                    <p className="text-sm text-gray-500">{item.curso_nombre}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700">{item.anio_escolar}</span>
                </div>

                <p className="text-xs text-slate-500 mt-1">
                  {t("teacher.subjects.resourceHubHint", {
                    defaultValue: "Define recursos para preparar temas de clase y experiencia del estudiante.",
                  })}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {metricItems.map((metric) => (
                    <div key={`${item.asignacion_id}-${metric.key}`} className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-2 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{metric.label}</p>
                      <p className="text-sm font-semibold text-slate-800">{metric.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button type="button" onClick={() => openRecursosPersonales(item)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 transition">
                    <Paperclip size={15} />
                    {t("teacher.subjects.actions.personalResources", { defaultValue: "Recursos personales" })}
                  </button>

                  <button type="button" onClick={() => openCrearContenido(item)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 text-white px-3 py-2 text-sm font-medium hover:bg-violet-700 transition">
                    <Plus size={15} />
                    {t("teacher.subjects.actions.createContent", { defaultValue: "Crear contenido" })}
                  </button>

                  <button type="button" onClick={() => openRecursosGlobales(item)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700 transition">
                    <Link2 size={15} />
                    {t("teacher.subjects.actions.globalResources", { defaultValue: "Recursos" })}
                  </button>

                  <button type="button" onClick={() => openCalificaciones(item)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 text-white px-3 py-2 text-sm font-medium hover:bg-amber-600 transition">
                    <SlidersHorizontal size={15} />
                    Calificaciones
                  </button>

                  <button type="button" onClick={() => openVistaTemas(item)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 text-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-50 transition">
                    <BookOpen size={15} />
                    {t("teacher.subjects.actions.viewTopics", { defaultValue: "Vista temas" })}
                    <ChevronRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {gradingOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="font-semibold text-lg">Calificaciones y ponderación</h3>
                <p className="text-sm text-gray-500">{gradingTarget?.materia_nombre} · {gradingTarget?.curso_nombre}</p>
              </div>
              <button type="button" onClick={closeCalificaciones} className="p-2 rounded hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {gradingLoading ? (
              <div className="p-10 flex items-center justify-center">
                <Loader2 size={26} className="animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="p-4 space-y-4 overflow-auto max-h-[calc(90vh-64px)]">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <label className="text-sm">
                    Contenidos (%)
                    <input type="number" className="mt-1 w-full border rounded px-3 py-2" value={gradingConfig.peso_contenidos_pct} onChange={(e) => setGradingConfig((p) => ({ ...p, peso_contenidos_pct: e.target.value }))} />
                  </label>
                  <label className="text-sm">
                    Lecciones (%)
                    <input type="number" className="mt-1 w-full border rounded px-3 py-2" value={gradingConfig.peso_lecciones_pct} onChange={(e) => setGradingConfig((p) => ({ ...p, peso_lecciones_pct: e.target.value }))} />
                  </label>
                  <label className="text-sm">
                    Trabajos (%)
                    <input type="number" className="mt-1 w-full border rounded px-3 py-2" value={gradingConfig.peso_trabajos_pct} onChange={(e) => setGradingConfig((p) => ({ ...p, peso_trabajos_pct: e.target.value }))} />
                  </label>
                  <label className="text-sm">
                    Puntaje total
                    <input type="number" className="mt-1 w-full border rounded px-3 py-2" value={gradingConfig.puntaje_total} onChange={(e) => setGradingConfig((p) => ({ ...p, puntaje_total: e.target.value }))} />
                  </label>
                  <label className="text-sm">
                    Mínimo aprobación
                    <input type="number" className="mt-1 w-full border rounded px-3 py-2" value={gradingConfig.puntaje_minimo_aprobacion} onChange={(e) => setGradingConfig((p) => ({ ...p, puntaje_minimo_aprobacion: e.target.value }))} />
                  </label>
                </div>

                <div className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <span>Suma de ponderaciones: {Number(gradingConfig.peso_contenidos_pct || 0) + Number(gradingConfig.peso_lecciones_pct || 0) + Number(gradingConfig.peso_trabajos_pct || 0)}%</span>
                  <button type="button" disabled={gradingSaving} onClick={() => void handleSaveConfig()} className="px-3 py-1.5 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                    {gradingSaving ? "Guardando..." : "Guardar configuración"}
                  </button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 text-sm font-medium">Calificaciones registradas</div>
                  {!gradingData || gradingData.items.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">No hay estudiantes con calificación registrada en esta materia.</div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="text-left px-3 py-2">Estudiante</th>
                            <th className="text-left px-3 py-2">Contenidos (10)</th>
                            <th className="text-left px-3 py-2">Lecciones (10)</th>
                            <th className="text-left px-3 py-2">Trabajos (10)</th>
                            <th className="text-left px-3 py-2">Final</th>
                            <th className="text-left px-3 py-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gradingData.items.map((row) => (
                            <tr key={row.estudiante_id} className="border-t">
                              <td className="px-3 py-2">
                                <p className="font-medium">{row.estudiante_nombre || row.estudiante_email || row.estudiante_id}</p>
                                <p className="text-xs text-gray-500">{row.estudiante_email || row.estudiante_id}</p>
                              </td>
                              <td className="px-3 py-2">{row.promedio_contenidos_10 != null ? row.promedio_contenidos_10.toFixed(2) : "-"}</td>
                              <td className="px-3 py-2">{row.promedio_lecciones_10 != null ? row.promedio_lecciones_10.toFixed(2) : "-"}</td>
                              <td className="px-3 py-2">{row.promedio_trabajos_10 != null ? row.promedio_trabajos_10.toFixed(2) : "-"}</td>
                              <td className="px-3 py-2 font-semibold">{row.nota_final.toFixed(2)} / {gradingData.puntaje_total.toFixed(2)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${estadoBadge(row.estado_final)}`}>
                                  {estadoLabel(row.estado_final)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
