import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BarChart3, BookOpen, FileText, Shield, Users } from "lucide-react";

import { getMe } from "@/shared/lib/auth";
import { getAdminDashboardStats, type AdminDashboardStats } from "@/features/admin/services/dashboard";

const cardStyles = [
  { from: "from-indigo-500", to: "to-violet-500" },
  { from: "from-emerald-500", to: "to-teal-500" },
  { from: "from-violet-500", to: "to-purple-500" },
  { from: "from-sky-500", to: "to-indigo-500" },
];

export default function AdminDashboard({ highContrast = false }: { highContrast?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminDashboardStats>({
    users: 0,
    students: 0,
    teachers: 0,
    admins: 0,
    cursos: 0,
    modelos: 0,
    recursos: 0,
    totalCalificaciones: 0,
    promedioGeneral10: null,
    contenidosCalificados: 0,
    pruebasCalificadas: 0,
    tareasCalificadas: 0,
    anioEscolarActivo: "",
    topCursoNombre: "",
    topCursoPromedio10: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        const nextStats = await getAdminDashboardStats();
        setStats(nextStats);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const cards = [
    {
      label: t("admin.dashboard.users", { defaultValue: "Usuarios" }),
      count: stats.users,
      icon: Users,
      path: "/admin/users",
    },
    {
      label: t("admin.dashboard.cursos", { defaultValue: "Cursos" }),
      count: stats.cursos,
      icon: BookOpen,
      path: "/admin/cursos",
    },
    {
      label: t("admin.dashboard.modelos", { defaultValue: "Modelos 3D" }),
      count: stats.modelos,
      icon: FileText,
      path: "/admin/modelos",
    },
    {
      label: t("admin.dashboard.grades", { defaultValue: "Calificaciones" }),
      count: stats.totalCalificaciones,
      icon: BarChart3,
      path: "/admin/calificaciones",
    },
  ];

  const systemCards = [
    {
      label: t("admin.dashboard.students", { defaultValue: "Estudiantes" }),
      value: stats.students,
    },
    {
      label: t("admin.dashboard.teachers", { defaultValue: "Profesores" }),
      value: stats.teachers,
    },
    {
      label: t("admin.dashboard.gradedContents", { defaultValue: "Contenidos calificados" }),
      value: stats.contenidosCalificados,
    },
    {
      label: t("admin.dashboard.gradedTests", { defaultValue: "Pruebas calificadas" }),
      value: stats.pruebasCalificadas,
    },
    {
      label: t("admin.dashboard.gradedTasks", { defaultValue: "Tareas calificadas" }),
      value: stats.tareasCalificadas,
    },
    {
      label: t("admin.dashboard.averageGrade", { defaultValue: "Promedio general /10" }),
      value: stats.promedioGeneral10 != null ? stats.promedioGeneral10.toFixed(2) : "N/A",
    },
    {
      label: t("admin.dashboard.activeSchoolYear", { defaultValue: "Año escolar activo" }),
      value: stats.anioEscolarActivo || "N/A",
    },
    {
      label: t("admin.dashboard.topCourse", { defaultValue: "Curso destacado" }),
      value: stats.topCursoNombre
        ? `${stats.topCursoNombre} (${stats.topCursoPromedio10?.toFixed(2) ?? "0.00"}/10)`
        : "N/A",
    },
  ];

  return (
    <div className={`max-w-6xl mx-auto p-4 ${highContrast ? "text-yellow-300" : "text-gray-900"}`}>
      <div
        className={`relative overflow-hidden rounded-2xl p-8 mb-8 shadow-xl animate-fade-in-up ${
          highContrast
            ? "bg-black border border-yellow-300 text-yellow-300"
            : "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 text-white"
        }`}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className={`text-sm font-medium mb-1 ${highContrast ? "text-yellow-200" : "text-white/70"}`}>
              <Shield size={14} className="inline mr-1" />
              {t("admin.dashboard.adminPanel", { defaultValue: "Panel de administración" })}
            </p>
            <h1 className="text-3xl font-bold">{t("admin.dashboard.title", { defaultValue: "Panel de administración" })}</h1>
            <p className={`text-sm mt-1 ${highContrast ? "text-yellow-200" : "text-white/60"}`}>
              {t("admin.dashboard.subtitle", {
                defaultValue: "Seguimiento global de usuarios, cursos y rendimiento académico por contenidos, pruebas y tareas.",
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin/calificaciones")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              highContrast
                ? "border border-yellow-300 text-yellow-200 hover:bg-yellow-900/20"
                : "bg-white text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            <BarChart3 size={16} />
            {t("admin.dashboard.ctaGrades", { defaultValue: "Ir a calificaciones" })}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((card, idx) => {
          const color = cardStyles[idx % cardStyles.length]!;
          return (
            <button
              key={card.label}
              onClick={() => navigate(card.path)}
              className={`group relative rounded-2xl shadow-md p-6 flex flex-col items-start gap-4 hover:shadow-xl transition-all duration-300 text-left hover:-translate-y-1 active:scale-[0.99] animate-fade-in-up overflow-hidden ${
                highContrast ? "bg-black border border-yellow-500 hover:bg-yellow-900/20" : "bg-white"
              }`}
              style={{ animationDelay: `${(idx + 1) * 100}ms` }}
            >
              {!highContrast && (
                <div
                  className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${color.from} ${color.to} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                />
              )}

              <div className={`p-3.5 rounded-xl bg-gradient-to-br ${color.from} ${color.to} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <card.icon size={24} className="text-white" />
              </div>
              <div>
                <p className={`text-3xl font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{card.count}</p>
                <p className={`text-sm mt-0.5 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{card.label}</p>
              </div>
              <ArrowRight
                size={16}
                className={`absolute bottom-5 right-5 group-hover:translate-x-1 transition-all duration-200 ${
                  highContrast ? "text-yellow-500" : "text-gray-300 group-hover:text-indigo-500"
                }`}
              />
            </button>
          );
        })}
      </div>

      <section className={`mt-6 rounded-2xl p-5 ${highContrast ? "bg-black border border-yellow-500" : "bg-white shadow-md"}`}>
        <h2 className={`font-semibold mb-4 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>
          {t("admin.dashboard.systemSummary", { defaultValue: "Resumen académico del sistema" })}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {systemCards.map((item) => (
            <article
              key={item.label}
              className={`rounded-xl px-3 py-2 border ${
                highContrast ? "border-yellow-600 bg-yellow-900/20" : "border-gray-100 bg-gray-50"
              }`}
            >
              <p className={`text-xs ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{item.label}</p>
              <p className={`text-lg font-semibold mt-1 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{item.value}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
