import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { Loader2, Users, BarChart3, TrendingUp } from "lucide-react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import type { EstudianteCursoDetail } from "@/shared/types/academic";
import type { MisCursoDocente, MateriaCalificacionAlumno } from "@/shared/types/academic";
import { getMateriaCalificaciones, listMisCursosDocente } from "@/features/teacher/services/docencia";

interface StudentSummary {
  id: string;
  display_name: string;
  email: string;
  curso_ids: string[];
  materias: Array<{
    curso_id: string;
    curso_nombre: string;
    materia_id: string;
    materia_nombre: string;
  }>;
  avg_final_10: number;
  aprobadas: number;
  reprobadas: number;
  no_completadas: number;
}

const STATUS_COLORS = ["#16a34a", "#dc2626", "#d97706"];

export default function TeacherPerformance() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [assignedCursos, setAssignedCursos] = useState<MisCursoDocente[]>([]);
  const [selectedMateriaId, setSelectedMateriaId] = useState<string>("");

  const materiaOptions = useMemo(() => {
    const byMateria = new Map<string, { materia_id: string; materia_nombre: string }>();
    assignedCursos.forEach((item) => {
      if (!item.materia_id || byMateria.has(item.materia_id)) return;
      byMateria.set(item.materia_id, { materia_id: item.materia_id, materia_nombre: item.materia_nombre || "Sin materia" });
    });
    return Array.from(byMateria.values());
  }, [assignedCursos]);

  const filteredStudents = useMemo(() => {
    if (!selectedMateriaId) return students;
    return students.filter((student) => student.materias.some((m) => m.materia_id === selectedMateriaId));
  }, [students, selectedMateriaId]);

  const kpis = useMemo(() => {
    const total = filteredStudents.length;
    const avg = total > 0 ? filteredStudents.reduce((acc, s) => acc + s.avg_final_10, 0) / total : 0;
    const aprobadas = filteredStudents.reduce((acc, s) => acc + s.aprobadas, 0);
    const reprobadas = filteredStudents.reduce((acc, s) => acc + s.reprobadas, 0);
    const noCompletadas = filteredStudents.reduce((acc, s) => acc + s.no_completadas, 0);
    return { total, avg, aprobadas, reprobadas, noCompletadas };
  }, [filteredStudents]);

  const performanceBars = useMemo(
    () => filteredStudents
      .slice()
      .sort((a, b) => b.avg_final_10 - a.avg_final_10)
      .slice(0, 8)
      .map((s) => ({ nombre: s.display_name.split(" ")[0], nota: Number(s.avg_final_10.toFixed(2)) })),
    [filteredStudents]
  );

  const statusPie = useMemo(
    () => [
      { name: "Aprobadas", value: kpis.aprobadas },
      { name: "Reprobadas", value: kpis.reprobadas },
      { name: "No completadas", value: kpis.noCompletadas },
    ],
    [kpis]
  );

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        if (me.role === "teacher") {
          const assigned = await listMisCursosDocente();
          setAssignedCursos(assigned);

          const courseIds = Array.from(new Set(assigned.map((item) => item.curso_id).filter(Boolean)));
          const results = await Promise.all(
            courseIds.map(async (cursoId) => {
              const res = await api.get<{ data: EstudianteCursoDetail[] }>(`/cursos/${cursoId}/estudiantes`);
              return res.data || [];
            })
          );

          const materiaIds = Array.from(new Set(assigned.map((item) => item.materia_id).filter(Boolean)));
          const materiasCalificaciones = await Promise.all(
            materiaIds.map(async (materiaId) => {
              try {
                return await getMateriaCalificaciones(materiaId);
              } catch {
                return null;
              }
            })
          );

          const gradesByStudent = new Map<string, MateriaCalificacionAlumno[]>();
          materiasCalificaciones.filter(Boolean).forEach((m) => {
            (m?.items || []).forEach((item) => {
              const current = gradesByStudent.get(item.estudiante_id) || [];
              current.push(item);
              gradesByStudent.set(item.estudiante_id, current);
            });
          });

          const studentById = new Map<string, StudentSummary>();
          results.flat().forEach((enrollment) => {
            const materiaItems = assigned
              .filter((item) => item.curso_id === enrollment.curso_id)
              .map((item) => ({
                curso_id: item.curso_id,
                curso_nombre: item.curso_nombre,
                materia_id: item.materia_id,
                materia_nombre: item.materia_nombre || "Sin materia",
              }));

            const grades = gradesByStudent.get(enrollment.estudiante_id) || [];
            const avg_final_10 = grades.length > 0 ? grades.reduce((acc, g) => acc + g.nota_final, 0) / grades.length : 0;
            const aprobadas = grades.filter((g) => g.estado_final === "aprobada").length;
            const reprobadas = grades.filter((g) => g.estado_final === "reprobada").length;
            const no_completadas = grades.filter((g) => g.estado_final === "materia_no_completada").length;

            const existing = studentById.get(enrollment.estudiante_id);
            if (existing) {
              materiaItems.forEach((materia) => {
                if (!existing.materias.some((m) => m.materia_id === materia.materia_id)) existing.materias.push(materia);
              });
              if (!existing.curso_ids.includes(enrollment.curso_id)) existing.curso_ids.push(enrollment.curso_id);
              existing.avg_final_10 = avg_final_10;
              existing.aprobadas = aprobadas;
              existing.reprobadas = reprobadas;
              existing.no_completadas = no_completadas;
            } else {
              studentById.set(enrollment.estudiante_id, {
                id: enrollment.estudiante_id,
                display_name: enrollment.display_name || enrollment.email || "-",
                email: enrollment.email || "",
                curso_ids: [enrollment.curso_id],
                materias: materiaItems,
                avg_final_10,
                aprobadas,
                reprobadas,
                no_completadas,
              });
            }
          });

          setStudents(Array.from(studentById.values()));
          return;
        }

        const res: any = await api.get("/admin/users");
        const studentUsers = (res.data || []).filter((u: any) => u.role === "student");
        setStudents(studentUsers.map((u: any) => ({ id: u.id, display_name: u.display_name || u.email || "-", email: u.email || "", curso_ids: [], materias: [], avg_final_10: 0, aprobadas: 0, reprobadas: 0, no_completadas: 0 })));
      } catch {
        toast.error(t("teacher.performance.loadError", { defaultValue: "Error al cargar datos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 size={32} className="animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">{t("teacher.performance.title", { defaultValue: "Rendimiento Estudiantil" })}</h1>

      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("teacher.performance.subjectFilter", { defaultValue: "Materia" })}</label>
        <select className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2" value={selectedMateriaId} onChange={(e) => setSelectedMateriaId(e.target.value)}>
          <option value="">{t("teacher.performance.allSubjects", { defaultValue: "Todas las materias" })}</option>
          {materiaOptions.map((materia) => <option key={materia.materia_id} value={materia.materia_id}>{materia.materia_nombre}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4"><div className="flex items-center gap-3"><div className="p-2 bg-blue-100 rounded-lg"><Users size={20} className="text-blue-600" /></div><div><p className="text-sm text-gray-500">Total estudiantes</p><p className="text-xl font-bold">{kpis.total}</p></div></div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><BarChart3 size={20} className="text-green-600" /></div><div><p className="text-sm text-gray-500">Promedio final /10</p><p className="text-xl font-bold">{kpis.avg.toFixed(2)}</p></div></div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="flex items-center gap-3"><div className="p-2 bg-violet-100 rounded-lg"><TrendingUp size={20} className="text-violet-600" /></div><div><p className="text-sm text-gray-500">Aprobadas vs reprobadas</p><p className="text-xl font-bold">{kpis.aprobadas} / {kpis.reprobadas}</p></div></div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold mb-2">Top desempeño (promedio final /10)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceBars}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nombre" /><YAxis domain={[0, 10]} /><Tooltip /><Bar dataKey="nota" fill="#2563eb" radius={[8, 8, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold mb-2">Distribución de estado académico</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {statusPie.map((_, index) => <Cell key={index} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {filteredStudents.length === 0 ? (
        <div className="text-center text-gray-500 p-6 bg-white rounded-lg shadow">{t("teacher.performance.noStudents", { defaultValue: "No hay estudiantes registrados" })}</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Estudiante</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Correo</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Promedio final /10</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Estado</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-sm">{s.display_name}</td><td className="px-4 py-3 text-sm text-gray-500">{s.email}</td><td className="px-4 py-3 text-sm font-semibold">{s.avg_final_10.toFixed(2)}</td><td className="px-4 py-3 text-sm">Aprobadas: {s.aprobadas} | Reprobadas: {s.reprobadas} | No completadas: {s.no_completadas}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
