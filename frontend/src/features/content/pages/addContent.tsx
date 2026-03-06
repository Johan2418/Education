import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { Plus, Save, Loader2 } from "lucide-react";
import type { Curso, Materia } from "@/shared/types";

/**
 * AddContentPage — allows teachers/admins to create new materias (content) 
 * within a selected curso.
 */
export default function AddContentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cursos, setCursos] = useState<Curso[]>([]);
  const [selectedCursoId, setSelectedCursoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        const c: Curso[] = await api.get("/cursos");
        setCursos(c || []);
        if (c && c.length > 0) setSelectedCursoId(c[0]?.id ?? null);
      } catch {
        toast.error(t("addcontent.loadError", { defaultValue: "Error al cargar datos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const handleSave = async () => {
    if (!selectedCursoId || !nombre.trim()) {
      toast.error(t("addcontent.validation", { defaultValue: "Completa los campos requeridos" }));
      return;
    }
    setSaving(true);
    try {
      await api.post("/materias", {
        curso_id: selectedCursoId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
      });
      toast.success(t("addcontent.saveSuccess", { defaultValue: "Contenido creado exitosamente" }));
      navigate("/teacher/contents");
    } catch (err) {
      console.error("Error saving content", err);
      toast.error(t("addcontent.saveError", { defaultValue: "Error al guardar" }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">{t("addcontent.title", { defaultValue: "Agregar contenido" })}</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("addcontent.form.curso", { defaultValue: "Curso" })}</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            value={selectedCursoId ?? ""}
            onChange={(e) => setSelectedCursoId(e.target.value || null)}
          >
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("addcontent.form.title", { defaultValue: "Nombre" })}</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={t("addcontent.form.titlePlaceholder", { defaultValue: "Nombre de la materia" })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("addcontent.form.description", { defaultValue: "Descripción" })}</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={t("addcontent.form.descriptionPlaceholder", { defaultValue: "Descripción del contenido" })}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-2 border border-gray-300 rounded-lg">
            {t("common.cancel", { defaultValue: "Cancelar" })}
          </button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? t("addcontent.saving", { defaultValue: "Guardando..." }) : t("addcontent.save", { defaultValue: "Guardar" })}
          </button>
        </div>
      </div>
    </div>
  );
}
