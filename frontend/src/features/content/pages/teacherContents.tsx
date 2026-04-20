import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { Pencil, Trash2, Search, Plus, Loader2, Library } from "lucide-react";
import type { Materia } from "@/shared/types";

export default function TeacherContents() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        const cursosRes = await api.get<{ data: any[] }>("/cursos");
        const cursos = cursosRes.data || [];
        const all: Materia[] = [];
        for (const c of cursos) {
          try {
            const matsRes = await api.get<{ data: Materia[] }>(`/cursos/${c.id}/materias`);
            all.push(...(matsRes.data || []));
          } catch { /* skip */ }
        }
        setMaterias(all);
      } catch {
        toast.error(t("teacher.contents.loadError", { defaultValue: "Error al cargar contenidos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("common.confirmDelete", { defaultValue: "¿Estás seguro?" }))) return;
    try {
      await api.delete(`/materias/${id}`);
      setMaterias((prev) => prev.filter((m) => m.id !== id));
      toast.success(t("teacher.contents.deleted", { defaultValue: "Eliminado" }));
    } catch {
      toast.error(t("teacher.contents.deleteError", { defaultValue: "Error al eliminar" }));
    }
  };

  const filtered = materias.filter((m) =>
    (m.nombre || "").toLowerCase().includes(search.toLowerCase()) ||
    (m.descripcion || "").toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-2xl font-bold">{t("teacher.contents.title", { defaultValue: "Gestión de Contenidos" })}</h1>
        <button onClick={() => navigate("/add-content")} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus size={16} /> {t("teacher.contents.add", { defaultValue: "Nuevo" })}
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("teacher.contents.searchPlaceholder", { defaultValue: "Buscar..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 p-6 bg-white rounded-lg shadow">
          {t("teacher.contents.empty", { defaultValue: "No hay contenidos" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <div key={m.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
              <h3 className="font-semibold mb-1">{m.nombre}</h3>
              {m.descripcion && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{m.descripcion}</p>}
              <div className="mt-auto flex items-center gap-2 pt-3">
                <button onClick={() => navigate(`/add-content?materiaId=${m.id}`)} className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => navigate(`/teacher/recursos-personales?materiaId=${m.id}`)}
                  className="p-2 text-emerald-700 hover:bg-emerald-50 rounded"
                  title="Gestionar recursos personales"
                >
                  <Library size={16} />
                </button>
                <button onClick={() => handleDelete(m.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
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
