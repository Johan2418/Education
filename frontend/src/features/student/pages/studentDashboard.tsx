import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { BookOpen, Award, Clock, TrendingUp, ArrowRight, Sparkles } from "lucide-react";
import type { Progreso, Leccion } from "@/shared/types";

interface ProgresoConLeccion extends Progreso {
  leccion?: Leccion;
}

export default function StudentDashboard({ highContrast = false }: { highContrast?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [progresos, setProgresos] = useState<ProgresoConLeccion[]>([]);
  const [totalLessons, setTotalLessons] = useState<number>(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me) { navigate("/login"); return; }
        setProfile(me);

        const prog: Progreso[] = await api.get("/progreso");
        setProgresos(prog || []);
        setTotalLessons(0);
      } catch (err) {
        console.error("Error loading dashboard", err);
        toast.error(t("dashboard.loadError", { defaultValue: "Error al cargar dashboard" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const completedCount = progresos.filter((p) => !!p.completado).length;
  const totalScore = progresos.reduce((acc, p) => acc + (p.puntaje ?? 0), 0);
  const avgScore = progresos.length > 0 ? Math.round(totalScore / progresos.length) : 0;

  const lastVisited = progresos.reduce((best: ProgresoConLeccion | null, curr) => {
    if (!curr.updated_at) return best;
    if (!best) return curr;
    return new Date(curr.updated_at) > new Date(best.updated_at || "") ? curr : best;
  }, null);

  const statCards = [
    {
      label: t("student.dashboard.completedLessons", { defaultValue: "Lecciones completadas" }),
      value: completedCount,
      icon: Award,
      from: "from-emerald-500",
      to: "to-teal-500",
    },
    {
      label: t("student.dashboard.pendingLessons", { defaultValue: "Lecciones pendientes" }),
      value: Math.max(0, progresos.length - completedCount),
      icon: Clock,
      from: "from-amber-500",
      to: "to-orange-500",
    },
    {
      label: t("student.dashboard.averageScore", { defaultValue: "Promedio de puntaje" }),
      value: `${avgScore}%`,
      icon: TrendingUp,
      from: "from-indigo-500",
      to: "to-violet-500",
    },
  ];

  return (
    <main className={`max-w-6xl mx-auto p-4 ${highContrast ? "text-yellow-300" : "text-gray-900"}`}>
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Welcome Banner */}
          <div className={`relative overflow-hidden rounded-2xl p-8 mb-8 shadow-xl animate-fade-in-up ${highContrast ? "bg-black border border-yellow-300 text-yellow-300" : "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 text-white"}`}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className={`text-sm font-medium mb-1 ${highContrast ? "text-yellow-200" : "text-white/70"}`}>👋 {t("student.dashboard.welcome", { defaultValue: "Hola" })}</p>
                <h1 className="text-3xl font-bold">{profile?.display_name || profile?.first_name || "Estudiante"}</h1>
                <p className={`text-sm mt-1 ${highContrast ? "text-yellow-200" : "text-white/60"}`}>{t("student.dashboard.subtitle", { defaultValue: "Continúa tu camino de aprendizaje" })}</p>
              </div>
              <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 ${highContrast ? "bg-yellow-900/30 border border-yellow-500" : "bg-white/10 backdrop-blur-sm border border-white/10"}`}>
                <div className="text-center">
                  <p className="text-3xl font-bold">{avgScore}%</p>
                  <p className={`text-xs ${highContrast ? "text-yellow-200" : "text-white/60"}`}>{t("student.dashboard.totalScore", { defaultValue: "Puntaje total" })}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            {statCards.map((card, idx) => (
              <div
                key={card.label}
                className={`group rounded-2xl shadow-md p-5 flex items-center gap-4 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500 hover:bg-yellow-900/20" : "bg-white"}`}
                style={{ animationDelay: `${(idx + 1) * 100}ms` }}
              >
                <div className={`p-3 rounded-xl bg-gradient-to-br ${card.from} ${card.to} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <card.icon size={22} className="text-white" />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{card.value}</p>
                  <p className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{card.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* History Section */}
            <div className="lg:col-span-2">
              <div className={`rounded-2xl shadow-md p-6 animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`} style={{ animationDelay: "400ms" }}>
                <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>
                  <Clock size={18} className={highContrast ? "text-yellow-400" : "text-indigo-500"} />
                  {t("student.dashboard.history", { defaultValue: "Historial" })}
                </h3>
                {lastVisited ? (
                  <div className={`p-5 rounded-xl ${highContrast ? "bg-yellow-900/20 border border-yellow-500" : "bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100"}`}>
                    <div className={`text-sm font-medium mb-2 ${highContrast ? "text-yellow-200" : "text-gray-600"}`}>{t("student.dashboard.lastLesson", { defaultValue: "Última lección vista" })}</div>
                    <div className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                      {t("student.dashboard.lastAccess", { defaultValue: "Último acceso" })}: {new Date(lastVisited.updated_at || "").toLocaleString()}
                    </div>
                    <div className={`text-sm mt-1 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                      {t("student.dashboard.lastScore", { defaultValue: "Último puntaje" })}: <span className={`font-semibold ${highContrast ? "text-yellow-200" : "text-indigo-600"}`}>{lastVisited.puntaje ?? "—"}</span>
                    </div>
                    <button
                      onClick={() => navigate(`/lesson/${lastVisited.leccion_id}`)}
                      className={`group mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.98] ${highContrast ? "bg-yellow-300 text-black hover:bg-yellow-400" : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600"}`}
                    >
                      {t("student.dashboard.continue", { defaultValue: "Continuar aprendiendo" })}
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                ) : (
                  <div className={`py-4 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{t("student.dashboard.noHistory", { defaultValue: "Aún no has iniciado ninguna lección" })}</div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <aside className={`rounded-2xl shadow-md p-6 animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`} style={{ animationDelay: "500ms" }}>
              <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>
                <TrendingUp size={18} className={highContrast ? "text-yellow-400" : "text-violet-500"} />
                {t("student.dashboard.quickStats", { defaultValue: "Resumen rápido" })}
              </h3>
              <div className="space-y-4">
                <div className={`flex items-center justify-between p-3 rounded-xl ${highContrast ? "bg-yellow-900/20" : "bg-gray-50"}`}>
                  <span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>{t("student.dashboard.totalLessons", { defaultValue: "Total lecciones progresadas" })}</span>
                  <span className={`font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{progresos.length}</span>
                </div>
                <div className={`flex items-center justify-between p-3 rounded-xl ${highContrast ? "bg-yellow-900/20" : "bg-gray-50"}`}>
                  <span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>{t("student.dashboard.averageScore", { defaultValue: "Promedio de puntaje" })}</span>
                  <span className={`font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{avgScore}%</span>
                </div>
              </div>
            </aside>
          </div>

          {progresos.length === 0 && (
            <div className={`mt-8 rounded-2xl shadow-md p-10 text-center animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`} style={{ animationDelay: "600ms" }}>
              <div className={`inline-flex p-4 rounded-2xl mb-4 ${highContrast ? "bg-yellow-900/20" : "bg-gradient-to-br from-indigo-100 to-violet-100"}`}>
                <Sparkles size={40} className={highContrast ? "text-yellow-300" : "text-indigo-500"} />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>
                {t("student.dashboard.noFollowedContent", { defaultValue: "No has iniciado ninguna lección aún" })}
              </h3>
              <p className={`text-sm mb-6 max-w-md mx-auto ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                {t("student.dashboard.noFollowedContentDesc", { defaultValue: "Explora los contenidos disponibles para comenzar a aprender." })}
              </p>
              <button
                onClick={() => navigate("/contents")}
                className={`group inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98] ${highContrast ? "bg-yellow-300 text-black hover:bg-yellow-400" : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600"}`}
              >
                {t("student.dashboard.browseContents", { defaultValue: "Explorar contenidos" })}
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
