import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { Leccion, Tema, Curso, Materia, Unidad, Prueba } from "@/shared/types";
import { Eye, Trash2, Search, Loader2 } from "lucide-react";

interface ApiEnvelope<T> {
  data: T;
}

function unwrapList<T>(payload: T[] | ApiEnvelope<T[]>): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export default function TeacherLessons() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<Leccion[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin", "resource_manager"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        // Fetch all lessons through hierarchy
        const cursos = unwrapList(await api.get<Curso[] | ApiEnvelope<Curso[]>>("/cursos"));
        const all: Leccion[] = [];
        for (const c of cursos) {
          const materias = unwrapList(await api.get<Materia[] | ApiEnvelope<Materia[]>>(`/cursos/${c.id}/materias`));
          for (const m of materias) {
            const unidades = unwrapList(await api.get<Unidad[] | ApiEnvelope<Unidad[]>>(`/materias/${m.id}/unidades`));
            for (const u of unidades) {
              const temas = unwrapList(await api.get<Tema[] | ApiEnvelope<Tema[]>>(`/unidades/${u.id}/temas`));
              for (const tema of temas) {
                const lecciones = unwrapList(await api.get<Leccion[] | ApiEnvelope<Leccion[]>>(`/temas/${tema.id}/lecciones`));
                all.push(...lecciones);
              }
            }
          }
        }
        setLessons(all);
      } catch {
        toast.error(t("teacher.lessons.loadError", { defaultValue: "Error al cargar lecciones" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("common.confirmDelete", { defaultValue: "¿Estás seguro?" }))) return;
    try {
      await api.delete(`/lecciones/${id}`);
      setLessons((prev) => prev.filter((l) => l.id !== id));
      toast.success(t("teacher.lessons.deleted", { defaultValue: "Lección eliminada" }));
    } catch {
      toast.error(t("teacher.lessons.deleteError", { defaultValue: "Error al eliminar" }));
    }
  };

  const openLessonFinalQuiz = async (lessonId: string) => {
    try {
      const pruebas = unwrapList(await api.get<Prueba[] | ApiEnvelope<Prueba[]>>(`/lecciones/${lessonId}/pruebas`));
      const ordered = [...pruebas].sort((a, b) => {
        const byOrder = (a.orden ?? 0) - (b.orden ?? 0);
        if (byOrder !== 0) return byOrder;
        return (a.created_at || "").localeCompare(b.created_at || "");
      });
      const target = ordered[0];
      if (!target) {
        toast.error("Esta leccion no tiene prueba final configurada todavia.");
        return;
      }
      navigate(`/lesson/${lessonId}/prueba/${target.id}`);
    } catch (err) {
      console.error("Error opening lesson final quiz", err);
      toast.error(t("teacher.lessons.loadError", { defaultValue: "Error al cargar lecciones" }));
    }
  };

  const filtered = lessons.filter(
    (l) =>
      (l.titulo || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.descripcion || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{t("teacher.lessons.title", { defaultValue: "Gestión de Lecciones" })}</h1>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("teacher.lessons.searchPlaceholder", { defaultValue: "Buscar lecciones..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 p-6 bg-white rounded-lg shadow">
          {t("teacher.lessons.empty", { defaultValue: "No hay lecciones" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((l) => (
            <div key={l.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
              {l.thumbnail_url && <img src={l.thumbnail_url} alt={l.titulo} className="w-full h-32 object-cover rounded mb-2" />}
              <h3 className="font-semibold mb-1">{l.titulo}</h3>
              {l.nivel && <span className="text-xs text-blue-600 mb-1">{l.nivel}</span>}
              {l.descripcion && <p className="text-sm text-gray-500 line-clamp-2 mb-2">{l.descripcion}</p>}
              <div className="mt-auto flex items-center gap-2 pt-3">
                <button
                  onClick={() => void openLessonFinalQuiz(l.id)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  title={t("teacher.lessons.studentView", { defaultValue: "Abrir prueba final" })}
                >
                  <Eye size={16} />
                </button>
                <button onClick={() => handleDelete(l.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
