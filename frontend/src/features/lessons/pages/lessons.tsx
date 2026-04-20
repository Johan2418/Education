import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { listMisProgresos } from "@/shared/services/progresos";
import toast from "react-hot-toast";
import type { Leccion, Progreso, Curso, Materia, Unidad, Tema } from "@/shared/types";
import { BookOpen, GraduationCap } from "lucide-react";

export default function LessonsPage({ highContrast = false }: { highContrast?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<Leccion[]>([]);
  const [progresos, setProgresos] = useState<Record<string, Progreso>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me) { navigate("/login"); return; }

        // Fetch all lessons through the hierarchy
        const cursos: Curso[] = await api.get("/cursos");
        const allLessons: Leccion[] = [];
        for (const c of cursos || []) {
          const materias: Materia[] = await api.get(`/cursos/${c.id}/materias`);
          for (const m of materias || []) {
            const unidades: Unidad[] = await api.get(`/materias/${m.id}/unidades`);
            for (const u of unidades || []) {
              const temas: Tema[] = await api.get(`/unidades/${u.id}/temas`);
              for (const tema of temas || []) {
                const lecciones: Leccion[] = await api.get(`/temas/${tema.id}/lecciones`);
                allLessons.push(...(lecciones || []));
              }
            }
          }
        }
        setLessons(allLessons);

        // Fetch progress
        try {
          const prog = await listMisProgresos();
          const map: Record<string, Progreso> = {};
          prog.forEach((p) => { map[p.leccion_id] = p; });
          setProgresos(map);
        } catch { /* no progress yet */ }
      } catch (err) {
        console.error("Error loading lessons", err);
        toast.error(t("lessons.loadError", { defaultValue: "Error al cargar lecciones" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`max-w-6xl mx-auto p-4 ${highContrast ? "text-yellow-300" : "text-gray-900"}`}>
      {/* Page Header */}
      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2.5 rounded-xl shadow-lg ${highContrast ? "bg-yellow-300" : "bg-gradient-to-br from-indigo-500 to-violet-600"}`}>
            <GraduationCap size={22} className={highContrast ? "text-black" : "text-white"} />
          </div>
          <h1 className={`text-2xl font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{t("lessons.title", { defaultValue: "Lecciones" })}</h1>
        </div>
        {highContrast ? (
          <div className="h-[3px] w-20 bg-yellow-300 rounded-full" />
        ) : (
          <div className="h-[3px] w-20 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 rounded-full" />
        )}
      </div>

      {lessons.length === 0 ? (
        <div className={`text-center py-16 rounded-2xl shadow-md animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
          <div className={`inline-flex p-4 rounded-2xl mb-4 ${highContrast ? "bg-yellow-900/20" : "bg-gradient-to-br from-indigo-100 to-violet-100"}`}>
            <BookOpen size={40} className={highContrast ? "text-yellow-300" : "text-indigo-500"} />
          </div>
          <p className={`text-lg font-medium ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{t("lessons.noLessons", { defaultValue: "No hay lecciones disponibles" })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {lessons.map((l, idx) => {
            const prog = progresos[l.id];
            return (
              <article
                key={l.id}
                className={`group relative rounded-2xl shadow-md flex flex-col cursor-pointer hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500 hover:bg-yellow-900/20" : "bg-white"}`}
                style={{ animationDelay: `${Math.min(idx, 8) * 75}ms` }}
                onClick={() => navigate(`/lesson/${l.id}`)}
              >
                {/* Gradient top accent */}
                {!highContrast && <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />}

                {l.thumbnail_url && (
                  <div className="relative overflow-hidden">
                    <img src={l.thumbnail_url} alt={l.titulo} className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}

                <div className="p-5 flex flex-col flex-1">
                  <h3 className={`text-base font-semibold mb-1 transition-colors ${highContrast ? "text-yellow-200" : "text-gray-900 group-hover:text-indigo-700"}`}>{l.titulo}</h3>
                  {l.nivel && (
                    <span className={`inline-flex self-start text-xs px-3 py-1 rounded-full font-medium mb-2 ${highContrast ? "bg-yellow-900/20 text-yellow-200 border border-yellow-500" : "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 border border-indigo-100"}`}>
                      {l.nivel}
                    </span>
                  )}
                  {l.descripcion && <p className={`text-sm mb-3 line-clamp-2 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{l.descripcion}</p>}

                  {prog && (
                    <div className={`mt-auto pt-3 ${highContrast ? "border-t border-yellow-500/40" : "border-t border-gray-100"}`}>
                      <div className={`flex justify-between text-xs mb-1.5 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                        <span className="font-medium">
                          {prog.completado
                            ? t("lessons.completed", { defaultValue: "Completada" })
                            : t("lessons.inProgress", { defaultValue: "En progreso" })
                          }
                        </span>
                        <span className={`font-semibold ${highContrast ? "text-yellow-200" : "text-gray-700"}`}>{prog.puntaje ?? 0}%</span>
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${highContrast ? "bg-yellow-900/30" : "bg-gray-100"}`}>
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            prog.completado
                              ? highContrast ? "bg-yellow-400" : "bg-gradient-to-r from-emerald-400 to-teal-500"
                              : highContrast ? "bg-yellow-300" : "bg-gradient-to-r from-indigo-400 to-violet-500"
                          }`}
                          style={{ width: `${prog.puntaje ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
