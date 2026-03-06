import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { Prueba, Curso, Materia, Unidad, Tema, Leccion } from "@/shared/types";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";

interface PruebaConLeccion extends Prueba {
  leccion_titulo?: string;
}

export default function TeacherPruebas() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pruebas, setPruebas] = useState<PruebaConLeccion[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        // Collect all lecciones through hierarchy, then fetch pruebas per leccion
        const cursos: Curso[] = await api.get("/cursos");
        const allPruebas: PruebaConLeccion[] = [];

        for (const c of cursos || []) {
          const materias: Materia[] = await api.get(`/cursos/${c.id}/materias`);
          for (const m of materias || []) {
            const unidades: Unidad[] = await api.get(`/materias/${m.id}/unidades`);
            for (const u of unidades || []) {
              const temas: Tema[] = await api.get(`/unidades/${u.id}/temas`);
              for (const tema of temas || []) {
                const lecciones: Leccion[] = await api.get(`/temas/${tema.id}/lecciones`);
                for (const l of lecciones || []) {
                  try {
                    const ps: Prueba[] = await api.get(`/lecciones/${l.id}/pruebas`);
                    allPruebas.push(...(ps || []).map((p) => ({ ...p, leccion_titulo: l.titulo })));
                  } catch { /* skip */ }
                }
              }
            }
          }
        }
        setPruebas(allPruebas);
      } catch {
        toast.error(t("teacher.pruebas.loadError", { defaultValue: "Error al cargar pruebas" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("common.confirmDelete", { defaultValue: "¿Estás seguro?" }))) return;
    try {
      await api.delete(`/pruebas/${id}`);
      setPruebas((prev) => prev.filter((p) => p.id !== id));
      toast.success(t("teacher.pruebas.deleted", { defaultValue: "Prueba eliminada" }));
    } catch {
      toast.error(t("teacher.pruebas.deleteError", { defaultValue: "Error al eliminar" }));
    }
  };

  const filtered = pruebas.filter(
    (p) =>
      (p.titulo || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.leccion_titulo || "").toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-2xl font-bold">{t("teacher.pruebas.title", { defaultValue: "Gestión de Pruebas" })}</h1>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("teacher.pruebas.searchPlaceholder", { defaultValue: "Buscar pruebas..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 p-6 bg-white rounded-lg shadow">
          {t("teacher.pruebas.empty", { defaultValue: "No hay pruebas" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
              <h3 className="font-semibold mb-1">{p.titulo}</h3>
              {p.leccion_titulo && <span className="text-xs text-gray-500 mb-1">{p.leccion_titulo}</span>}
              {p.descripcion && <p className="text-sm text-gray-500 line-clamp-2 mb-2">{p.descripcion}</p>}
              <div className="mt-auto flex items-center gap-2 pt-3">
                <button onClick={() => navigate(`/teacher/pruebas/${p.id}/questions`)} className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                  <Pencil size={16} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
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
