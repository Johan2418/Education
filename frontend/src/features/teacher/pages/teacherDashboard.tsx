import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe } from "@/shared/lib/auth";
import { useTranslation } from "react-i18next";
import { BookOpen, FileText, HelpCircle, BarChart3, ArrowRight, CalendarDays, Layers3 } from "lucide-react";

const cardColors = [
  { from: "from-indigo-500", to: "to-violet-500", light: "bg-indigo-50", text: "text-indigo-600" },
  { from: "from-emerald-500", to: "to-teal-500", light: "bg-emerald-50", text: "text-emerald-600" },
  { from: "from-amber-500", to: "to-orange-500", light: "bg-amber-50", text: "text-amber-600" },
  { from: "from-rose-500", to: "to-pink-500", light: "bg-rose-50", text: "text-rose-600" },
];

export default function TeacherDashboard({ highContrast = false }: { highContrast?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    (async () => {
      setCheckingAuth(true);
      try {
        const me = await getMe();
        if (!me) { navigate("/login"); return; }
        const role = me.role;
        if (!["teacher", "admin", "super_admin", "student"].includes(role || "")) {
          navigate("/login");
          return;
        }
        setDisplayName(me.display_name || "Profesor");
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [navigate]);

  if (checkingAuth) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  const cards = [
    { title: t("teacher.lessons", { defaultValue: "Gestión de Lecciones" }), desc: "Crear y administrar lecciones para tus estudiantes", icon: BookOpen, path: "/teacher/lessons" },
    { title: t("teacher.contents", { defaultValue: "Gestión de Contenidos" }), desc: "Organizar materias, unidades y temas", icon: FileText, path: "/teacher/contents" },
    { title: t("teacher.questions", { defaultValue: "Preguntas y Respuestas" }), desc: "Crear evaluaciones y pruebas", icon: HelpCircle, path: "/teacher/pruebas" },
    { title: t("teacher.performance", { defaultValue: "Rendimiento Estudiantil" }), desc: "Analizar el progreso de tus estudiantes", icon: BarChart3, path: "/teacher/performance" },
    { title: t("teacher.cursos.title", { defaultValue: "Mis cursos" }), desc: "Ver materias asignadas con métricas clave", icon: Layers3, path: "/teacher/cursos" },
    { title: t("teacher.horario.title", { defaultValue: "Mi horario" }), desc: "Organizar bloques semanales sin solapamientos", icon: CalendarDays, path: "/teacher/horario" },
  ];

  return (
    <main className={`max-w-6xl mx-auto p-4 ${highContrast ? "text-yellow-300" : "text-gray-900"}`}>
      {/* Welcome Banner */}
      <div className={`relative overflow-hidden rounded-2xl p-8 mb-8 shadow-xl animate-fade-in-up ${highContrast ? "bg-black border border-yellow-300 text-yellow-300" : "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 text-white"}`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        <div className="relative">
          <p className={`text-sm font-medium mb-1 ${highContrast ? "text-yellow-200" : "text-white/70"}`}>👋 {t("teacher.welcome", { defaultValue: "Bienvenido de vuelta" })}</p>
          <h1 className="text-3xl font-bold mb-2">{displayName}</h1>
          <p className={`text-sm ${highContrast ? "text-yellow-200" : "text-white/60"}`}>{t("teacher.dashboardSubtitle", { defaultValue: "Gestiona tus clases y contenidos desde aquí" })}</p>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {cards.map((c, idx) => {
          const color = cardColors[idx % cardColors.length]!;
          return (
            <button
              key={c.path}
              onClick={() => navigate(c.path)}
              className={`group relative rounded-2xl shadow-md p-6 flex items-start gap-5 hover:shadow-xl transition-all duration-300 text-left hover:-translate-y-1 active:scale-[0.99] animate-fade-in-up overflow-hidden ${highContrast ? "bg-black border border-yellow-500 hover:bg-yellow-900/20" : "bg-white"}`}
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              {/* Gradient top border */}
              {!highContrast && <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${color.from} ${color.to} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />}

              <div className={`p-3.5 rounded-xl bg-gradient-to-br ${color.from} ${color.to} shadow-lg shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                <c.icon size={24} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-base mb-1 transition-colors ${highContrast ? "text-yellow-200" : "text-gray-900 group-hover:text-indigo-700"}`}>{c.title}</h3>
                <p className={`text-sm line-clamp-2 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{c.desc}</p>
              </div>
              <ArrowRight size={18} className={`group-hover:translate-x-1 transition-all duration-200 shrink-0 mt-1 ${highContrast ? "text-yellow-500" : "text-gray-300 group-hover:text-indigo-500"}`} />
            </button>
          );
        })}
      </div>
    </main>
  );
}
