import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { BookOpen, Award, XCircle } from "lucide-react";
import type { Progreso, Leccion } from "@/shared/types";

interface ProgresoConLeccion extends Progreso {
  leccion?: Leccion;
}

export default function StudentDashboard() {
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

        // Fetch user's progreso list
        const prog: Progreso[] = await api.get("/progreso");
        setProgresos(prog || []);

        // We don't have a direct "count all lessons" endpoint,
        // but we can estimate from progresos or skip totalLessons for now
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

  return (
    <main className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("student.dashboard.title", { defaultValue: "Mi Dashboard" })}</h1>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">{t("loading", { defaultValue: "Cargando..." })}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-2 bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{profile?.display_name || profile?.first_name || "Estudiante"}</h2>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">{t("student.dashboard.totalScore", { defaultValue: "Puntaje total" })}</div>
                  <div className="text-2xl font-bold">{avgScore}%</div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded">
                  <div className="text-sm text-gray-600">{t("student.dashboard.completedLessons", { defaultValue: "Lecciones completadas" })}</div>
                  <div className="text-xl font-semibold">{completedCount}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <div className="text-sm text-gray-600">{t("student.dashboard.pendingLessons", { defaultValue: "Lecciones pendientes" })}</div>
                  <div className="text-xl font-semibold">{Math.max(0, progresos.length - completedCount)}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                  <div className="text-sm text-gray-600">{t("student.dashboard.averageScore", { defaultValue: "Promedio de puntaje" })}</div>
                  <div className="text-xl font-semibold">{avgScore}%</div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold mb-2">{t("student.dashboard.history", { defaultValue: "Historial" })}</h3>
                {lastVisited ? (
                  <div className="bg-white border p-4 rounded">
                    <div className="text-sm text-gray-500">{t("student.dashboard.lastLesson", { defaultValue: "Última lección vista" })}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {t("student.dashboard.lastAccess", { defaultValue: "\u00daltimo acceso" })}: {new Date(lastVisited.updated_at || "").toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {t("student.dashboard.lastScore", { defaultValue: "Último puntaje" })}: {lastVisited.puntaje ?? "—"}
                    </div>
                    <div className="mt-3">
                      <button onClick={() => navigate(`/lesson/${lastVisited.leccion_id}`)} className="px-3 py-2 bg-blue-600 text-white rounded">
                        {t("student.dashboard.continue", { defaultValue: "Continuar aprendiendo" })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-600">{t("student.dashboard.noHistory", { defaultValue: "Aún no has iniciado ninguna lección" })}</div>
                )}
              </div>
            </div>

            <aside className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">{t("student.dashboard.quickStats", { defaultValue: "Resumen rápido" })}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">{t("student.dashboard.totalLessons", { defaultValue: "Total lecciones progresadas" })}</div>
                  <div className="font-medium">{progresos.length}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">{t("student.dashboard.averageScore", { defaultValue: "Promedio de puntaje" })}</div>
                  <div className="font-medium">{avgScore}%</div>
                </div>
              </div>
            </aside>
          </div>

          {progresos.length === 0 && (
            <div className="mt-6 bg-white rounded-lg shadow p-6 text-center">
              <BookOpen size={40} className="mx-auto text-gray-400 mb-3" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {t("student.dashboard.noFollowedContent", { defaultValue: "No has iniciado ninguna lección aún" })}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {t("student.dashboard.noFollowedContentDesc", { defaultValue: "Explora los contenidos disponibles para comenzar a aprender." })}
              </p>
              <button onClick={() => navigate("/contents")} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                {t("student.dashboard.browseContents", { defaultValue: "Explorar contenidos" })}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
