import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { Loader2, Users, BarChart3, TrendingUp } from "lucide-react";
import type { EstudianteCursoDetail } from "@/shared/types/academic";
import type { MisCursoDocente } from "@/shared/types/academic";
import { listMisCursosDocente } from "@/features/teacher/services/docencia";

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
  progresos_count: number;
  avg_score: number;
}

export default function TeacherPerformance() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [assignedCursos, setAssignedCursos] = useState<MisCursoDocente[]>([]);
  const [selectedMateriaId, setSelectedMateriaId] = useState<string>("");

  const materiaOptions = useMemo(() => {
    const byMateria = new Map<string, { materia_id: string; materia_nombre: string; curso_id: string; curso_nombre: string }>();
    assignedCursos.forEach((item) => {
      if (!item.materia_id) return;
      if (!byMateria.has(item.materia_id)) {
        byMateria.set(item.materia_id, {
          materia_id: item.materia_id,
          materia_nombre: item.materia_nombre || "Sin materia",
          curso_id: item.curso_id,
          curso_nombre: item.curso_nombre,
        });
      }
    });
    return Array.from(byMateria.values());
  }, [assignedCursos]);

  const filteredStudents = useMemo(() => {
    if (!selectedMateriaId) return students;
    return students.filter((student) => student.materias.some((m) => m.materia_id === selectedMateriaId));
  }, [students, selectedMateriaId]);

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
          const courseMap = new Map<string, MisCursoDocente>();
          assigned.forEach((item) => {
            if (!courseMap.has(item.curso_id)) {
              courseMap.set(item.curso_id, item);
            }
          });

          const results = await Promise.all(
            courseIds.map(async (cursoId) => {
              const res = await api.get<{ data: EstudianteCursoDetail[] }>(`/cursos/${cursoId}/estudiantes`);
              return res.data || [];
            })
          );

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

            const existing = studentById.get(enrollment.estudiante_id);
            if (existing) {
              const existingMaterias = existing.materias.map((m) => m.materia_id);
              materiaItems.forEach((materia) => {
                if (!existingMaterias.includes(materia.materia_id)) {
                  existing.materias.push(materia);
                }
              });
              if (!existing.curso_ids.includes(enrollment.curso_id)) {
                existing.curso_ids.push(enrollment.curso_id);
              }
            } else {
              studentById.set(enrollment.estudiante_id, {
                id: enrollment.estudiante_id,
                display_name: enrollment.display_name || enrollment.email || "—",
                email: enrollment.email || "",
                curso_ids: [enrollment.curso_id],
                materias: materiaItems,
                progresos_count: 0,
                avg_score: 0,
              });
            }
          });

          setStudents(Array.from(studentById.values()));
          return;
        }

        // Admin and super_admin fetch all students by listing users.
        const res: any = await api.get("/admin/users");
        const studentUsers = (res.data || []).filter((u: any) => u.role === "student");
        setStudents(
          studentUsers.map((u: any) => ({
            id: u.id,
            display_name: u.display_name || u.email || "—",
            email: u.email || "",
            curso_ids: [],
            materias: [],
            progresos_count: 0,
            avg_score: 0,
          }))
        );
      } catch (err) {
        toast.error(t("teacher.performance.loadError", { defaultValue: "Error al cargar datos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("teacher.performance.title", { defaultValue: "Rendimiento Estudiantil" })}</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">{t("teacher.performance.subjectFilter", { defaultValue: "Materia" })}</label>
        <select
          className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2"
          value={selectedMateriaId}
          onChange={(e) => setSelectedMateriaId(e.target.value)}
        >
          <option value="">{t("teacher.performance.allSubjects", { defaultValue: "Todas las materias" })}</option>
          {materiaOptions.map((materia) => (
            <option key={materia.materia_id} value={materia.materia_id}>
              {materia.materia_nombre}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t("teacher.performance.totalStudents", { defaultValue: "Total Estudiantes" })}</p>
              <p className="text-xl font-bold">{filteredStudents.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <BarChart3 size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t("teacher.performance.avgScore", { defaultValue: "Promedio General" })}</p>
              <p className="text-xl font-bold">—</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t("teacher.performance.completion", { defaultValue: "Tasa de Completación" })}</p>
              <p className="text-xl font-bold">—</p>
            </div>
          </div>
        </div>
      </div>

      {/* Student list */}
      {filteredStudents.length === 0 ? (
        <div className="text-center text-gray-500 p-6 bg-white rounded-lg shadow">
          {t("teacher.performance.noStudents", { defaultValue: "No hay estudiantes registrados" })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("teacher.performance.student", { defaultValue: "Estudiante" })}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("teacher.performance.email", { defaultValue: "Correo" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{s.display_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{s.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
