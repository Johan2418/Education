import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { AlertTriangle, BookOpenText, GraduationCap, Loader2, Search, Sparkles, TrendingUp, Users } from "lucide-react";

import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { getMateriaCalificaciones, listMisCursosDocente } from "@/features/teacher/services/docencia";
import type { EstudianteCursoDetail, MateriaCalificacionAlumno, MisCursoDocente } from "@/shared/types";

type MateriaGroup = {
  key: string;
  nombre: string;
  items: MisCursoDocente[];
};

type StudentAcademicRow = {
  estudianteId: string;
  nombre: string;
  email: string;
  cursos: string[];
  promedioFinal10: number | null;
  aprobadas: number;
  reprobadas: number;
  noCompletadas: number;
  sinCalificar: number;
  componentesCalificados: number;
  componentesRequeridos: number;
};

type StudentStatus = "aprobada" | "reprobada" | "materia_no_completada" | "sin_calificar";

function unwrapArray<T>(payload: unknown): T[] {
  let current: unknown = payload;
  let guard = 0;

  while (guard < 4 && current && typeof current === "object" && "data" in (current as Record<string, unknown>)) {
    current = (current as { data?: unknown }).data;
    guard += 1;
  }

  return Array.isArray(current) ? (current as T[]) : [];
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return "Error inesperado";
}

function statusOf(row: StudentAcademicRow): StudentStatus {
  if (row.reprobadas > 0) return "reprobada";
  if (row.noCompletadas > 0) return "materia_no_completada";
  if (row.aprobadas > 0) return "aprobada";
  return "sin_calificar";
}

function statusBadgeClass(status: StudentStatus): string {
  switch (status) {
    case "aprobada":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "reprobada":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "materia_no_completada":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function statusLabel(status: StudentStatus, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (status) {
    case "aprobada":
      return t("teacher.estudiantes.status.approved", { defaultValue: "Aprobada" });
    case "reprobada":
      return t("teacher.estudiantes.status.failed", { defaultValue: "Reprobada" });
    case "materia_no_completada":
      return t("teacher.estudiantes.status.incomplete", { defaultValue: "Materia no completada" });
    default:
      return t("teacher.estudiantes.status.ungraded", { defaultValue: "Sin calificar" });
  }
}

export default function TeacherEstudiantes() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [bootLoading, setBootLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [assignments, setAssignments] = useState<MisCursoDocente[]>([]);

  const [selectedMateriaKey, setSelectedMateriaKey] = useState("");
  const [selectedCursoId, setSelectedCursoId] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<StudentAcademicRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await getMe();
        if (!me || me.role !== "teacher") {
          navigate("/login");
          return;
        }

        const data = await listMisCursosDocente();
        if (!cancelled) {
          setAssignments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(normalizeError(err));
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const materiaGroups = useMemo<MateriaGroup[]>(() => {
    const grouped = new Map<string, MateriaGroup>();

    for (const item of assignments) {
      const key = item.materia_nombre.trim().toLowerCase();
      const current = grouped.get(key);
      if (current) {
        current.items.push(item);
      } else {
        grouped.set(key, {
          key,
          nombre: item.materia_nombre,
          items: [item],
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [assignments]);

  useEffect(() => {
    if (materiaGroups.length === 0) return;
    if (selectedMateriaKey && materiaGroups.some((group) => group.key === selectedMateriaKey)) return;
    setSelectedMateriaKey(materiaGroups[0]?.key || "");
    setSelectedCursoId("");
  }, [materiaGroups, selectedMateriaKey]);

  const selectedMateriaGroup = useMemo(() => {
    return materiaGroups.find((group) => group.key === selectedMateriaKey) || null;
  }, [materiaGroups, selectedMateriaKey]);

  const cursoOptions = selectedMateriaGroup?.items ?? [];

  const activeAssignments = useMemo(() => {
    if (!selectedMateriaGroup) return [];
    if (!selectedCursoId) return selectedMateriaGroup.items;
    return selectedMateriaGroup.items.filter((item) => item.curso_id === selectedCursoId);
  }, [selectedMateriaGroup, selectedCursoId]);

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      if (activeAssignments.length === 0) {
        setRows([]);
        return;
      }

      setLoadingRows(true);

      try {
        const perAssignment = await Promise.all(
          activeAssignments.map(async (assignment) => {
            const [enrolledPayload, grades] = await Promise.all([
              api.get<{ data?: EstudianteCursoDetail[] } | EstudianteCursoDetail[]>(`/cursos/${assignment.curso_id}/estudiantes`),
              getMateriaCalificaciones(assignment.materia_id),
            ]);

            const enrolled = unwrapArray<EstudianteCursoDetail>(enrolledPayload);
            const gradesByStudent = new Map<string, MateriaCalificacionAlumno>();
            for (const grade of grades.items || []) {
              gradesByStudent.set(grade.estudiante_id, grade);
            }

            return {
              assignment,
              enrolled,
              gradesByStudent,
            };
          })
        );

        const byStudent = new Map<string, {
          estudianteId: string;
          nombre: string;
          email: string;
          cursos: Set<string>;
          sumNotas: number;
          countNotas: number;
          aprobadas: number;
          reprobadas: number;
          noCompletadas: number;
          sinCalificar: number;
          componentesCalificados: number;
          componentesRequeridos: number;
        }>();

        for (const block of perAssignment) {
          for (const student of block.enrolled) {
            const current = byStudent.get(student.estudiante_id) || {
              estudianteId: student.estudiante_id,
              nombre: student.display_name || student.email || student.estudiante_id,
              email: student.email,
              cursos: new Set<string>(),
              sumNotas: 0,
              countNotas: 0,
              aprobadas: 0,
              reprobadas: 0,
              noCompletadas: 0,
              sinCalificar: 0,
              componentesCalificados: 0,
              componentesRequeridos: 0,
            };

            current.cursos.add(block.assignment.curso_nombre);

            const grade = block.gradesByStudent.get(student.estudiante_id);
            if (!grade) {
              current.sinCalificar += 1;
            } else {
              current.sumNotas += grade.nota_final;
              current.countNotas += 1;
              current.componentesCalificados += grade.componentes_calificados;
              current.componentesRequeridos += grade.componentes_requeridos;

              if (grade.estado_final === "aprobada") current.aprobadas += 1;
              else if (grade.estado_final === "reprobada") current.reprobadas += 1;
              else if (grade.estado_final === "materia_no_completada") current.noCompletadas += 1;
              else current.sinCalificar += 1;
            }

            byStudent.set(student.estudiante_id, current);
          }
        }

        const nextRows: StudentAcademicRow[] = Array.from(byStudent.values())
          .map((row) => ({
            estudianteId: row.estudianteId,
            nombre: row.nombre,
            email: row.email,
            cursos: Array.from(row.cursos).sort((a, b) => a.localeCompare(b)),
            promedioFinal10: row.countNotas > 0 ? Number((row.sumNotas / row.countNotas).toFixed(2)) : null,
            aprobadas: row.aprobadas,
            reprobadas: row.reprobadas,
            noCompletadas: row.noCompletadas,
            sinCalificar: row.sinCalificar,
            componentesCalificados: row.componentesCalificados,
            componentesRequeridos: row.componentesRequeridos,
          }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));

        if (!cancelled) {
          setRows(nextRows);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(normalizeError(err));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    };

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [activeAssignments]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      const courseText = row.cursos.join(" ").toLowerCase();
      return row.nombre.toLowerCase().includes(query) || row.email.toLowerCase().includes(query) || courseText.includes(query);
    });
  }, [rows, search]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const withAverage = filteredRows.filter((row) => row.promedioFinal10 != null);
    const avgGeneral = withAverage.length > 0
      ? withAverage.reduce((acc, row) => acc + (row.promedioFinal10 || 0), 0) / withAverage.length
      : 0;

    const aprobadas = filteredRows.filter((row) => statusOf(row) === "aprobada").length;
    const alertas = filteredRows.filter((row) => {
      const status = statusOf(row);
      return status === "reprobada" || status === "materia_no_completada";
    }).length;
    const sinCalificar = filteredRows.filter((row) => statusOf(row) === "sin_calificar").length;

    return {
      total,
      avgGeneral,
      aprobadas,
      alertas,
      sinCalificar,
    };
  }, [filteredRows]);

  if (bootLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (materiaGroups.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Users size={44} className="mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-semibold text-slate-700">
            {t("teacher.estudiantes.emptyAssignments", { defaultValue: "No tienes materias asignadas" })}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("teacher.estudiantes.emptyAssignmentsHint", { defaultValue: "Solicita a administración la asignación de materias para ver estudiantes." })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-white p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-28 w-28 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="relative">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles size={14} />
            {t("teacher.estudiantes.readOnlyTag", { defaultValue: "Vista académica" })}
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            {t("teacher.estudiantes.title", { defaultValue: "Mis Estudiantes" })}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("teacher.estudiantes.readOnlySubtitle", { defaultValue: "Resumen por materia con rendimiento académico. La matrícula la gestiona administración." })}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">
            {t("teacher.estudiantes.filters.subject", { defaultValue: "Materia" })}
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              value={selectedMateriaKey}
              onChange={(e) => {
                setSelectedMateriaKey(e.target.value);
                setSelectedCursoId("");
              }}
            >
              {materiaGroups.map((group) => (
                <option key={group.key} value={group.key}>{group.nombre}</option>
              ))}
            </select>
          </label>

          {cursoOptions.length > 1 ? (
            <label className="text-xs font-medium text-slate-600">
              {t("teacher.estudiantes.filters.course", { defaultValue: "Curso" })}
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                value={selectedCursoId}
                onChange={(e) => setSelectedCursoId(e.target.value)}
              >
                <option value="">{t("teacher.estudiantes.filters.allCourses", { defaultValue: "Todos los cursos" })}</option>
                {cursoOptions.map((item) => (
                  <option key={item.asignacion_id} value={item.curso_id}>
                    {item.curso_nombre} ({item.anio_escolar})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">{t("teacher.estudiantes.filters.scope", { defaultValue: "Alcance" })}</p>
              <p className="mt-1">
                {cursoOptions[0]
                  ? `${cursoOptions[0].curso_nombre} (${cursoOptions[0].anio_escolar})`
                  : t("teacher.estudiantes.filters.scopeEmpty", { defaultValue: "Sin curso disponible" })}
              </p>
            </div>
          )}

          <label className="text-xs font-medium text-slate-600 lg:col-span-1 md:col-span-2">
            {t("teacher.estudiantes.filters.search", { defaultValue: "Buscar" })}
            <div className="relative mt-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm"
                placeholder={t("teacher.estudiantes.searchPlaceholder", { defaultValue: "Nombre, correo o curso" })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{t("teacher.estudiantes.kpi.total", { defaultValue: "Estudiantes" })}</p>
          <p className="mt-2 text-3xl font-black text-sky-900">{summary.total}</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{t("teacher.estudiantes.kpi.avg", { defaultValue: "Promedio general /10" })}</p>
          <p className="mt-2 text-3xl font-black text-emerald-900">{summary.avgGeneral.toFixed(2)}</p>
        </article>
        <article className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("teacher.estudiantes.kpi.approved", { defaultValue: "Con estado aprobada" })}</p>
          <p className="mt-2 text-3xl font-black text-violet-900">{summary.aprobadas}</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t("teacher.estudiantes.kpi.alerts", { defaultValue: "Alertas académicas" })}</p>
          <p className="mt-2 text-3xl font-black text-amber-900">{summary.alertas}</p>
          <p className="mt-1 text-xs text-amber-700">{t("teacher.estudiantes.kpi.ungraded", { defaultValue: "Sin calificar" })}: {summary.sinCalificar}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <GraduationCap size={18} />
          {t("teacher.estudiantes.table.title", { defaultValue: "Resumen académico por estudiante" })}
        </h2>

        {loadingRows ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            <BookOpenText size={20} className="mx-auto mb-2 text-slate-400" />
            {t("teacher.estudiantes.empty", { defaultValue: "No hay estudiantes para los filtros seleccionados" })}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">{t("teacher.estudiantes.table.name", { defaultValue: "Estudiante" })}</th>
                  <th className="py-2 px-3">{t("teacher.estudiantes.table.course", { defaultValue: "Curso(s)" })}</th>
                  <th className="py-2 px-3">{t("teacher.estudiantes.table.average", { defaultValue: "Promedio final /10" })}</th>
                  <th className="py-2 px-3">{t("teacher.estudiantes.table.status", { defaultValue: "Estado académico" })}</th>
                  <th className="py-2 pl-3">{t("teacher.estudiantes.table.progress", { defaultValue: "Progreso calificado" })}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const status = statusOf(row);
                  const progressText = row.componentesRequeridos > 0
                    ? `${row.componentesCalificados}/${row.componentesRequeridos}`
                    : "-";

                  return (
                    <tr key={row.estudianteId} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-800">{row.nombre}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {row.cursos.map((curso) => (
                            <span key={`${row.estudianteId}-${curso}`} className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {curso}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${row.promedioFinal10 != null && row.promedioFinal10 >= 6 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {row.promedioFinal10 != null ? row.promedioFinal10.toFixed(2) : "-"}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}>
                          {statusLabel(status, t)}
                        </span>
                        {(row.reprobadas > 0 || row.noCompletadas > 0) && (
                          <p className="mt-1 text-xs text-rose-600 inline-flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {t("teacher.estudiantes.table.attention", { defaultValue: "Requiere seguimiento" })}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pl-3">
                        <div className="inline-flex items-center gap-2">
                          <TrendingUp size={14} className="text-slate-500" />
                          <span className="text-xs font-semibold text-slate-700">{progressText}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
