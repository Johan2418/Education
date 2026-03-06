import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { Loader2, Users, BarChart3, TrendingUp } from "lucide-react";

interface StudentSummary {
  id: string;
  display_name: string;
  email: string;
  progresos_count: number;
  avg_score: number;
}

export default function TeacherPerformance() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentSummary[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        // For admin/teacher, list users and their basic stats
        // The Go backend has GET /admin/users listing
        try {
          const users: any[] = await api.get("/admin/users");
          const studentUsers = (users || []).filter((u: any) => u.role === "student");
          setStudents(
            studentUsers.map((u: any) => ({
              id: u.id,
              display_name: u.display_name || u.email || "—",
              email: u.email || "",
              progresos_count: 0,
              avg_score: 0,
            }))
          );
        } catch {
          // May not have admin access — just show empty
          setStudents([]);
        }
      } catch {
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t("teacher.performance.totalStudents", { defaultValue: "Total Estudiantes" })}</p>
              <p className="text-xl font-bold">{students.length}</p>
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
      {students.length === 0 ? (
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
              {students.map((s) => (
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
