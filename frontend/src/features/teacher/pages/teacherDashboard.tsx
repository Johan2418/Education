import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe } from "@/shared/lib/auth";
import { useTranslation } from "react-i18next";
import { BookOpen, FileText, HelpCircle, BarChart3 } from "lucide-react";

export default function TeacherDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);

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
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [navigate]);

  if (checkingAuth) return <div className="text-center p-8">{t("loading") || "Cargando..."}</div>;

  const cards = [
    { title: t("teacher.lessons", { defaultValue: "Gestión de Lecciones" }), icon: BookOpen, path: "/teacher/lessons" },
    { title: t("teacher.contents", { defaultValue: "Gestión de Contenidos" }), icon: FileText, path: "/teacher/contents" },
    { title: t("teacher.questions", { defaultValue: "Preguntas y Respuestas" }), icon: HelpCircle, path: "/teacher/pruebas" },
    { title: t("teacher.performance", { defaultValue: "Rendimiento Estudiantil" }), icon: BarChart3, path: "/teacher/performance" },
  ];

  return (
    <main className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("teacher.dashboardTitle", { defaultValue: "Panel del Profesor" })}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <button
            key={c.path}
            onClick={() => navigate(c.path)}
            className="bg-white rounded-lg shadow p-6 flex items-center gap-4 hover:shadow-md transition-shadow text-left"
          >
            <div className="p-3 bg-blue-100 rounded-lg">
              <c.icon size={24} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">{c.title}</h3>
          </button>
        ))}
      </div>
    </main>
  );
}
