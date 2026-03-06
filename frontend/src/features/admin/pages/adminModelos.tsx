import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { ModeloRA } from "@/shared/types";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";

export default function AdminModelos() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [modelos, setModelos] = useState<ModeloRA[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin", "teacher"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        const data: ModeloRA[] = await api.get("/modelos");
        setModelos(data || []);
      } catch {
        toast.error(t("admin.modelos.loadError", { defaultValue: "Error al cargar modelos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("common.confirmDelete", { defaultValue: "¿Estás seguro?" }))) return;
    try {
      await api.delete(`/modelos/${id}`);
      setModelos((prev) => prev.filter((m) => String(m.id) !== String(id)));
      toast.success(t("admin.modelos.deleted", { defaultValue: "Modelo eliminado" }));
    } catch {
      toast.error(t("admin.modelos.deleteError", { defaultValue: "Error al eliminar" }));
    }
  };

  const filtered = modelos.filter(
    (m) =>
      (m.nombre || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.tipo || "").toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-2xl font-bold">{t("admin.modelos.title", { defaultValue: "Modelos 3D" })}</h1>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("admin.modelos.search", { defaultValue: "Buscar modelos..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 p-6 bg-white rounded-lg shadow">
          {t("admin.modelos.empty", { defaultValue: "No hay modelos" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <div key={m.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
              {m.thumbnail_url && <img src={m.thumbnail_url} alt={m.nombre} className="w-full h-40 object-cover rounded mb-2" />}
              <h3 className="font-semibold mb-1">{m.nombre}</h3>
              <span className="text-xs text-gray-500 mb-1">{m.tipo}</span>
              <div className="mt-auto flex items-center gap-2 pt-3">
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
