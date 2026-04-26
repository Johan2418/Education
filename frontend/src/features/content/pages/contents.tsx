import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { Heart, ArrowRight, BookOpenText } from "lucide-react";
import type { Materia } from "@/shared/types";

function toArray<T>(value: T[] | { data?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { data?: T[] }).data)) {
    return (value as { data?: T[] }).data ?? [];
  }
  return [];
}

export default function ContentsPage({ highContrast = false }: { highContrast?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [togglingFollow, setTogglingFollow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load user
      try {
        const me = await getMe();
        if (me) {
          if (["teacher", "admin", "super_admin"].includes(me.role || "")) {
            navigate("/teacher/materias", { replace: true });
            return;
          }
          setUserId(me.id);
          setUserRole(me.role);
          // Load followed materias
          let seguimientos: any[] = [];
          try { seguimientos = await api.get(`/materias/0/seguimientos`); } catch { /* ignore */ }
          setFollowedIds(new Set(seguimientos.map((s: any) => s.materia_id)));
        }
      } catch {
        // Not logged in — ok
      }

      // Load all cursos then all materias
      const cursosRes = await api.get<any[] | { data?: any[] }>("/cursos");
      const cursos = toArray(cursosRes);
      const allMaterias: Materia[] = [];
      for (const c of cursos) {
        try {
          const matsRes = await api.get<Materia[] | { data?: Materia[] }>(`/cursos/${c.id}/materias`);
          allMaterias.push(...toArray(matsRes));
        } catch {
          // skip
        }
      }
      setMaterias(allMaterias);
    } catch (err) {
      console.error("Error fetching contents:", err);
      toast.error(t("contents.loadRecordsError", { defaultValue: "Error al cargar contenidos" }));
    } finally {
      setLoading(false);
    }
  };

  const toggleFollow = async (materiaId: string) => {
    if (!userId) {
      toast.error(t("login.required", { defaultValue: "Necesitas iniciar sesión" }));
      return;
    }
    setTogglingFollow(materiaId);
    try {
      if (followedIds.has(materiaId)) {
        await api.delete(`/materias/${materiaId}/seguir`);
        setFollowedIds((prev) => { const s = new Set(prev); s.delete(materiaId); return s; });
        toast.success(t("contents.unfollowed", { defaultValue: "Dejaste de seguir este contenido" }));
      } else {
        await api.post(`/materias/${materiaId}/seguir`, {});
        setFollowedIds((prev) => new Set(prev).add(materiaId));
        toast.success(t("contents.followed", { defaultValue: "Ahora sigues este contenido" }));
      }
    } catch (e) {
      console.error("Error toggling follow", e);
      toast.error(t("contents.followError", { defaultValue: "Error al actualizar seguimiento" }));
    } finally {
      setTogglingFollow(null);
    }
  };

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
            <BookOpenText size={22} className={highContrast ? "text-black" : "text-white"} />
          </div>
          <h1 className={`text-2xl font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{t("contents.title", { defaultValue: "Contenidos" })}</h1>
        </div>
        {highContrast ? (
          <div className="h-[3px] w-20 bg-yellow-300 rounded-full" />
        ) : (
          <div className="h-[3px] w-20 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 rounded-full" />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {materias.length === 0 ? (
          <div className={`col-span-full text-center py-16 rounded-2xl shadow-md animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
            <div className={`inline-flex p-4 rounded-2xl mb-4 ${highContrast ? "bg-yellow-900/20" : "bg-gradient-to-br from-indigo-100 to-violet-100"}`}>
              <BookOpenText size={40} className={highContrast ? "text-yellow-300" : "text-indigo-500"} />
            </div>
            <p className={`text-lg font-medium ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{t("contents.noRecords", { defaultValue: "No hay contenidos disponibles" })}</p>
          </div>
        ) : (
          materias.map((m, idx) => (
            <article
              key={m.id}
              className={`group relative rounded-2xl shadow-md flex flex-col overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in-up ${highContrast ? "bg-black border border-yellow-500 hover:bg-yellow-900/20" : "bg-white"}`}
              style={{ animationDelay: `${Math.min(idx, 8) * 75}ms` }}
            >
              {/* Gradient top accent */}
              {!highContrast && <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />}

              <div className="p-5 flex-1">
                <h3 className={`text-base font-semibold mb-2 transition-colors ${highContrast ? "text-yellow-200" : "text-gray-900 group-hover:text-indigo-700"}`}>{m.nombre}</h3>
                {m.descripcion && (
                  <p className={`text-sm line-clamp-3 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{m.descripcion.slice(0, 160)}{m.descripcion.length > 160 ? "..." : ""}</p>
                )}
              </div>

              <div className="px-5 pb-5 flex items-center gap-2 justify-between">
                {userId && userRole === "student" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFollow(m.id); }}
                    disabled={togglingFollow === m.id}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      followedIds.has(m.id)
                        ? highContrast
                          ? "bg-yellow-900/20 text-yellow-200 border border-yellow-500"
                          : "bg-gradient-to-r from-pink-50 to-rose-50 text-pink-600 border border-pink-200 hover:from-pink-100 hover:to-rose-100"
                        : highContrast
                          ? "bg-black text-yellow-300 border border-yellow-500 hover:bg-yellow-900/20"
                          : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                    } disabled:opacity-50 active:scale-[0.97]`}
                  >
                    <Heart size={15} className={`transition-all duration-300 ${followedIds.has(m.id) ? "fill-pink-500 text-pink-500 scale-110" : ""}`} />
                    {followedIds.has(m.id)
                      ? t("contents.following", { defaultValue: "Siguiendo" })
                      : t("contents.follow", { defaultValue: "Seguir" })}
                  </button>
                )}
                <button
                  onClick={() => navigate(`/contents/${m.id}`)}
                  className={`group/btn flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 active:scale-[0.97] ${highContrast ? "bg-yellow-300 text-black hover:bg-yellow-400" : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600"}`}
                >
                  {t("contents.card.view", { defaultValue: "Ver detalle" })}
                  <ArrowRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
