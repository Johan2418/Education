import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { Leccion, Progreso, Curso, Materia, Unidad, Tema } from "@/shared/types";
import { Loader2 } from "lucide-react";

export default function LessonsPage() {
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
          const prog: Progreso[] = await api.get("/progreso");
          const map: Record<string, Progreso> = {};
          (prog || []).forEach((p) => { map[p.leccion_id] = p; });
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
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("lessons.title", { defaultValue: "Lecciones" })}</h1>

      {lessons.length === 0 ? (
        <div className="text-center text-gray-500 p-6 bg-white rounded-lg shadow">
          {t("lessons.noLessons", { defaultValue: "No hay lecciones disponibles" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lessons.map((l) => {
            const prog = progresos[l.id];
            return (
              <article
                key={l.id}
                className="bg-white rounded-lg shadow p-4 flex flex-col cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/lesson/${l.id}`)}
              >
                {l.thumbnail_url && (
                  <img src={l.thumbnail_url} alt={l.titulo} className="w-full h-40 object-cover rounded mb-3" />
                )}
                <h3 className="text-lg font-semibold mb-1">{l.titulo}</h3>
                {l.nivel && <span className="text-xs text-blue-600 font-medium mb-2">{l.nivel}</span>}
                {l.descripcion && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{l.descripcion}</p>}
                {prog && (
                  <div className="mt-auto pt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{prog.completado ? t("lessons.completed", { defaultValue: "Completada" }) : t("lessons.inProgress", { defaultValue: "En progreso" })}</span>
                      <span>{prog.puntaje ?? 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full">
                      <div className={`h-full rounded-full ${prog.completado ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${prog.puntaje ?? 0}%` }} />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
