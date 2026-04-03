import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { Leccion, LeccionSeccion, ProgresoSeccion } from "@/shared/types";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";

export default function LessonDetailPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Leccion | null>(null);
  const [secciones, setSecciones] = useState<LeccionSeccion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progSecciones, setProgSecciones] = useState<Record<string, ProgresoSeccion>>({});

  useEffect(() => {
    if (!lessonId) return;
    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me) { navigate("/login"); return; }

        const l: Leccion = await api.get(`/lecciones/${lessonId}`);
        setLesson(l);

        const secs: LeccionSeccion[] = await api.get(`/lecciones/${lessonId}/secciones`);
        setSecciones((secs || []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));

        // Fetch progress for sections
        try {
          const ps: ProgresoSeccion[] = await api.get(`/lecciones/${lessonId}/progreso-secciones`);
          const map: Record<string, ProgresoSeccion> = {};
          (ps || []).forEach((p) => { map[p.leccion_seccion_id] = p; });
          setProgSecciones(map);
        } catch { /* no progress yet */ }
      } catch (err) {
        console.error("Error loading lesson", err);
        toast.error(t("lessons.loadError", { defaultValue: "Error al cargar lección" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, navigate, t]);

  const markSectionComplete = async (seccionId: string) => {
    try {
      await api.put("/progreso-secciones", { leccion_seccion_id: seccionId, completado: true });
      setProgSecciones((prev) => ({
        ...prev,
        [seccionId]: { ...prev[seccionId], leccion_seccion_id: seccionId, completado: true } as ProgresoSeccion,
      }));
    } catch {
      toast.error(t("lessons.progressError", { defaultValue: "Error al guardar progreso" }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!lesson) {
    return <div className="text-center py-8 text-gray-500">{t("lessons.notFound", { defaultValue: "Lección no encontrada" })}</div>;
  }

  const currentSection = secciones[currentIdx];

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button onClick={() => navigate("/lessons")} className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; {t("common.back", { defaultValue: "Volver" })}
      </button>

      <h1 className="text-2xl font-bold mb-2">{lesson.titulo}</h1>
      {lesson.nivel && <span className="text-sm text-blue-600 font-medium">{lesson.nivel}</span>}
      {lesson.descripcion && <p className="text-gray-600 mt-2 mb-6">{lesson.descripcion}</p>}

      {secciones.length === 0 ? (
        <p className="text-gray-500">{t("lessons.noSections", { defaultValue: "Esta lección no tiene secciones" })}</p>
      ) : (
        <>
          {/* Section progress indicator */}
          <div className="flex gap-1 mb-6">
            {secciones.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentIdx(idx)}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  progSecciones[s.id]?.completado
                    ? "bg-green-500"
                    : idx === currentIdx
                    ? "bg-blue-500"
                    : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          {/* Current section */}
          {currentSection && (
            <div className="bg-white rounded-lg shadow p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{`${currentSection.tipo} — Sección ${currentIdx + 1}`}</h2>
                {progSecciones[currentSection.id]?.completado && (
                  <CheckCircle size={20} className="text-green-500" />
                )}
              </div>

              {currentSection.tipo === "html" && currentSection.contenido && (
                <div className="prose max-w-none mb-4" dangerouslySetInnerHTML={{ __html: currentSection.contenido }} />
              )}

              {currentSection.tipo === "video" && currentSection.contenido && (
                <div className="mb-4">
                  <video src={currentSection.contenido} controls className="w-full rounded" />
                </div>
              )}

              {currentSection.tipo === "imagen" && currentSection.contenido && (
                <img src={currentSection.contenido} alt="" className="w-full rounded mb-4" />
              )}

              {currentSection.tipo === "texto" && currentSection.contenido && (
                <p className="text-gray-700 mb-4 whitespace-pre-wrap">{currentSection.contenido}</p>
              )}

              {!progSecciones[currentSection.id]?.completado && (
                <button
                  onClick={() => markSectionComplete(currentSection.id)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {t("lessons.markComplete", { defaultValue: "Marcar como completada" })}
                </button>
              )}
            </div>
          )}

          {/* Nav */}
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))}
              disabled={currentIdx === 0}
              className="inline-flex items-center gap-1 px-4 py-2 border rounded-lg disabled:opacity-50"
            >
              <ChevronLeft size={16} /> {t("common.previous", { defaultValue: "Anterior" })}
            </button>
            <button
              onClick={() => setCurrentIdx((p) => Math.min(secciones.length - 1, p + 1))}
              disabled={currentIdx === secciones.length - 1}
              className="inline-flex items-center gap-1 px-4 py-2 border rounded-lg disabled:opacity-50"
            >
              {t("common.next", { defaultValue: "Siguiente" })} <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
