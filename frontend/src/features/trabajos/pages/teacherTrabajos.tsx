import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Search, SendHorizontal, XCircle, CheckCircle2, ClipboardList } from "lucide-react";
import toast from "react-hot-toast";

import api from "@/shared/lib/api";
import { getMe } from "@/shared/lib/auth";
import type { Curso, Leccion, Materia, Tema, Unidad } from "@/shared/types";
import type { CreateTrabajoRequest, Trabajo } from "@/shared/types/trabajos";
import { createTrabajo, cerrarTrabajo, listTrabajosByLeccion, publicarTrabajo } from "@/features/trabajos/services/trabajos";

interface LeccionOption {
  id: string;
  titulo: string;
}

interface TrabajoRow extends Trabajo {
  leccion_titulo: string;
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

export default function TeacherTrabajos() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [trabajos, setTrabajos] = useState<TrabajoRow[]>([]);
  const [lecciones, setLecciones] = useState<LeccionOption[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [newTrabajo, setNewTrabajo] = useState<CreateTrabajoRequest>({
    leccion_id: "",
    titulo: "",
    descripcion: "",
    instrucciones: "",
    fecha_vencimiento: "",
  });

  const loadData = async () => {
    const cursosRes = await api.get<{ data: Curso[] }>("/cursos");
    const cursos = cursosRes.data || [];

    const allLecciones: LeccionOption[] = [];
    const allTrabajos: TrabajoRow[] = [];

    for (const curso of cursos) {
      const materiasRes = await api.get<{ data: Materia[] }>(`/cursos/${curso.id}/materias`);
      const materias = materiasRes.data || [];

      for (const materia of materias) {
        const unidadesRes = await api.get<{ data: Unidad[] }>(`/materias/${materia.id}/unidades`);
        const unidades = unidadesRes.data || [];

        for (const unidad of unidades) {
          const temasRes = await api.get<{ data: Tema[] }>(`/unidades/${unidad.id}/temas`);
          const temas = temasRes.data || [];

          for (const tema of temas) {
            const leccionesRes = await api.get<{ data: Leccion[] }>(`/temas/${tema.id}/lecciones`);
            const leccionesData = leccionesRes.data || [];

            for (const leccion of leccionesData) {
              allLecciones.push({ id: leccion.id, titulo: leccion.titulo });

              try {
                const trabajosLeccion = await listTrabajosByLeccion(leccion.id);
                for (const trabajo of trabajosLeccion) {
                  allTrabajos.push({ ...trabajo, leccion_titulo: leccion.titulo });
                }
              } catch {
                // Skip lecciones where listing fails so the page remains usable.
              }
            }
          }
        }
      }
    }

    setLecciones(allLecciones);
    setTrabajos(allTrabajos);

    if (!newTrabajo.leccion_id && allLecciones.length > 0) {
      setNewTrabajo((prev) => ({ ...prev, leccion_id: allLecciones[0]?.id || "" }));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        await loadData();
      } catch (err) {
        toast.error(t("teacher.trabajos.loadError", { defaultValue: normalizeError(err) }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trabajos.filter((trabajo) => {
      return (
        (trabajo.titulo || "").toLowerCase().includes(q) ||
        (trabajo.leccion_titulo || "").toLowerCase().includes(q) ||
        (trabajo.estado || "").toLowerCase().includes(q)
      );
    });
  }, [search, trabajos]);

  const handleCreate = async () => {
    if (!newTrabajo.leccion_id || !newTrabajo.titulo.trim()) {
      toast.error(t("teacher.trabajos.validation", { defaultValue: "Leccion y titulo son obligatorios" }));
      return;
    }

    setSaving(true);
    try {
      await createTrabajo({
        leccion_id: newTrabajo.leccion_id,
        titulo: newTrabajo.titulo.trim(),
        descripcion: newTrabajo.descripcion || undefined,
        instrucciones: newTrabajo.instrucciones || undefined,
        fecha_vencimiento: newTrabajo.fecha_vencimiento || undefined,
      });

      toast.success(t("teacher.trabajos.created", { defaultValue: "Trabajo creado" }));
      setShowCreate(false);
      setNewTrabajo((prev) => ({ ...prev, titulo: "", descripcion: "", instrucciones: "", fecha_vencimiento: "" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePublicar = async (trabajoId: string) => {
    if (!confirm(t("teacher.trabajos.confirmPublish", { defaultValue: "Deseas publicar este trabajo?" }))) {
      return;
    }
    try {
      await publicarTrabajo(trabajoId);
      toast.success(t("teacher.trabajos.published", { defaultValue: "Trabajo publicado" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const handleCerrar = async (trabajoId: string) => {
    if (!confirm(t("teacher.trabajos.confirmClose", { defaultValue: "Deseas cerrar este trabajo?" }))) {
      return;
    }
    try {
      await cerrarTrabajo(trabajoId);
      toast.success(t("teacher.trabajos.closed", { defaultValue: "Trabajo cerrado" }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
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
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{t("teacher.trabajos.title", { defaultValue: "Gestion de Trabajos" })}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          {t("teacher.trabajos.new", { defaultValue: "Nuevo Trabajo" })}
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("teacher.trabajos.search", { defaultValue: "Buscar por titulo, leccion o estado" })}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-2 text-gray-300" />
          {t("teacher.trabajos.empty", { defaultValue: "No hay trabajos registrados" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((trabajo) => (
            <div key={trabajo.id} className="bg-white rounded-lg shadow p-4 border border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{trabajo.titulo}</h3>
                  <p className="text-xs text-gray-500 mt-1">{trabajo.leccion_titulo}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${trabajo.estado === "publicado" ? "bg-emerald-100 text-emerald-700" : trabajo.estado === "cerrado" ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-700"}`}>
                  {trabajo.estado}
                </span>
              </div>

              {trabajo.descripcion && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{trabajo.descripcion}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                {trabajo.estado === "borrador" && (
                  <button
                    onClick={() => handlePublicar(trabajo.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <SendHorizontal size={14} />
                    {t("teacher.trabajos.publish", { defaultValue: "Publicar" })}
                  </button>
                )}

                {trabajo.estado !== "cerrado" && (
                  <button
                    onClick={() => handleCerrar(trabajo.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-gray-700 text-white hover:bg-gray-800"
                  >
                    <XCircle size={14} />
                    {t("teacher.trabajos.close", { defaultValue: "Cerrar" })}
                  </button>
                )}

                <button
                  onClick={() => navigate(`/teacher/trabajos/${trabajo.id}/calificar`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  <CheckCircle2 size={14} />
                  {t("teacher.trabajos.grade", { defaultValue: "Calificar" })}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{t("teacher.trabajos.createTitle", { defaultValue: "Crear trabajo" })}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.leccion", { defaultValue: "Leccion" })}</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={newTrabajo.leccion_id}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, leccion_id: e.target.value }))}
                >
                  {lecciones.map((leccion) => (
                    <option key={leccion.id} value={leccion.id}>{leccion.titulo}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.titulo", { defaultValue: "Titulo" })}</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={newTrabajo.titulo}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, titulo: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.descripcion", { defaultValue: "Descripcion" })}</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={2}
                  value={newTrabajo.descripcion || ""}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, descripcion: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.instrucciones", { defaultValue: "Instrucciones" })}</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={3}
                  value={newTrabajo.instrucciones || ""}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, instrucciones: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("teacher.trabajos.fechaVencimiento", { defaultValue: "Fecha de vencimiento" })}</label>
                <input
                  type="datetime-local"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={newTrabajo.fecha_vencimiento || ""}
                  onChange={(e) => setNewTrabajo((prev) => ({ ...prev, fecha_vencimiento: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button className="px-4 py-2 rounded border" onClick={() => setShowCreate(false)}>
                {t("common.cancel", { defaultValue: "Cancelar" })}
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? t("common.saving", { defaultValue: "Guardando..." }) : t("common.save", { defaultValue: "Guardar" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
