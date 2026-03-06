import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { Heart } from "lucide-react";
import type { Materia } from "@/shared/types";

export default function ContentsPage() {
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
      const cursos: any[] = await api.get("/cursos");
      const allMaterias: Materia[] = [];
      for (const c of cursos || []) {
        try {
          const mats: Materia[] = await api.get(`/cursos/${c.id}/materias`);
          allMaterias.push(...(mats || []));
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
    return <div className="text-center py-8 text-gray-500">{t("loading", { defaultValue: "Cargando..." })}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{t("contents.title", { defaultValue: "Contenidos" })}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {materias.length === 0 ? (
          <div className="col-span-full text-center text-gray-500 p-6 bg-white rounded-lg shadow">
            {t("contents.noRecords", { defaultValue: "No hay contenidos disponibles" })}
          </div>
        ) : (
          materias.map((m) => (
            <article key={m.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">{m.nombre}</h3>
                {m.descripcion && (
                  <p className="text-sm text-gray-600 mb-3">{m.descripcion.slice(0, 160)}{m.descripcion.length > 160 ? "…" : ""}</p>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2 justify-between">
                {userId && userRole === "student" && (
                  <button
                    onClick={() => toggleFollow(m.id)}
                    disabled={togglingFollow === m.id}
                    className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
                      followedIds.has(m.id) ? "bg-pink-100 text-pink-600 hover:bg-pink-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    } disabled:opacity-50`}
                  >
                    <Heart size={16} className={followedIds.has(m.id) ? "fill-pink-500" : ""} />
                    {followedIds.has(m.id)
                      ? t("contents.following", { defaultValue: "Siguiendo" })
                      : t("contents.follow", { defaultValue: "Seguir" })}
                  </button>
                )}
                <button
                  onClick={() => navigate(`/contents/${m.id}`)}
                  className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                >
                  {t("contents.card.view", { defaultValue: "Ver detalle" })}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
