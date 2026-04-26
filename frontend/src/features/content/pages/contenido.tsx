import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/shared/lib/api";
import { getMe } from "@/shared/lib/auth";
import toast from "react-hot-toast";
import { Loader2, Plus, Settings, Trash2 } from "lucide-react";
import type { Materia, Unidad, Tema, Leccion } from "@/shared/types";
import { HierarchyViewer } from "../components/HierarchyViewer";
import { TopicConfigurationModal } from "../components/TopicConfigurationModal";

interface ApiEnvelope<T> {
  data: T;
}

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

export default function ContenidoPage() {
  const { materiaId } = useParams<{ materiaId: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [materia, setMateria] = useState<Materia | null>(null);
  const [unidades, setUnidades] = useState<(Unidad & { temas: (Tema & { lecciones: Leccion[] })[] })[]>([]);
  const [backPath, setBackPath] = useState("/contents");
  const [canCreateContent, setCanCreateContent] = useState(false);
  const [showCreateSection, setShowCreateSection] = useState(searchParams.get("openCreate") === "1");
  const [isSavingUnidad, setIsSavingUnidad] = useState(false);
  const [isSavingTema, setIsSavingTema] = useState(false);
  const [isSavingLeccion, setIsSavingLeccion] = useState(false);
  const [isDeletingUnidad, setIsDeletingUnidad] = useState<string | null>(null);
  const [isDeletingTema, setIsDeletingTema] = useState<string | null>(null);
  const [isDeletingLeccion, setIsDeletingLeccion] = useState<string | null>(null);
  const [isTopicConfigOpen, setIsTopicConfigOpen] = useState(false);
  const [topicBeingConfigured, setTopicBeingConfigured] = useState<Tema | null>(null);
  const createSectionRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);

  const [unidadForm, setUnidadForm] = useState({
    nombre: "",
    descripcion: "",
  });
  const [temaForm, setTemaForm] = useState({
    unidad_id: "",
    nombre: "",
    descripcion: "",
  });
  const [leccionForm, setLeccionForm] = useState({
    tema_id: "",
    titulo: "",
    descripcion: "",
    nivel: "",
  });

  const loadHierarchy = useCallback(async () => {
    if (!materiaId) return;

    const mat: Materia = await api.get(`/materias/${materiaId}`);
    setMateria(mat);

    // The backend wraps responses in {data: ...}, so we need to extract it
    const unisResponse = await api.get<{ data: Unidad[] } | Unidad[]>(`/materias/${materiaId}/unidades`);
    const unis = Array.isArray(unisResponse) ? unisResponse : (unisResponse?.data || []);
    
    // Deduplicate unidades by id
    const unidadesMap = new Map<string, Unidad>();
    (unis || []).forEach(u => unidadesMap.set(u.id, u));
    const uniqueUnidades = Array.from(unidadesMap.values());
    
    const enriched = await Promise.all(
      uniqueUnidades.map(async (u) => {
        const temasResponse = await api.get<{ data: Tema[] } | Tema[]>(`/unidades/${u.id}/temas`);
        const temas = Array.isArray(temasResponse) ? temasResponse : (temasResponse?.data || []);
        
        // Deduplicate temas by id
        const temasMap = new Map<string, Tema>();
        (temas || []).forEach(t => temasMap.set(t.id, t));
        const uniqueTemas = Array.from(temasMap.values());
        
        const temasConLecciones = await Promise.all(
          uniqueTemas.map(async (tema) => {
            const leccionesResponse = await api.get<{ data: Leccion[] } | Leccion[]>(`/temas/${tema.id}/lecciones`);
            const lecciones = Array.isArray(leccionesResponse) ? leccionesResponse : (leccionesResponse?.data || []);
            
            // Deduplicate lecciones by id
            const leccionesMap = new Map<string, Leccion>();
            (lecciones || []).forEach(l => leccionesMap.set(l.id, l));
            const uniqueLecciones = Array.from(leccionesMap.values());
            
            return { ...tema, lecciones: uniqueLecciones || [] };
          })
        );
        return { ...u, temas: temasConLecciones };
      })
    );

    setUnidades(enriched);
  }, [materiaId]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (me && ["teacher", "admin", "super_admin"].includes(me.role || "")) {
          setBackPath("/teacher/materias");
          setCanCreateContent(true);
        }
      } catch {
        // Not logged in or token invalid — keep default back path.
      }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("openCreate") === "1" && canCreateContent) {
      setShowCreateSection(true);
    }
  }, [searchParams, canCreateContent]);

  useEffect(() => {
    if (!showCreateSection) return;
    createSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showCreateSection]);

  useEffect(() => {
    if (!materiaId) return;
    (async () => {
      setLoading(true);
      try {
        await loadHierarchy();
      } catch (err) {
        console.error("Error loading materia", err);
        toast.error(t("contents.loadError", { defaultValue: "Error al cargar contenido" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadHierarchy, materiaId, t]);

  const onCreateUnidad = async () => {
    if (!materiaId) return;
    const nombre = unidadForm.nombre.trim();
    if (!nombre) {
      toast.error(t("teacher.subjects.createSection.validation.unitName", { defaultValue: "El nombre de la unidad es obligatorio." }));
      return;
    }

    setIsSavingUnidad(true);
    try {
      await api.post("/unidades", {
        materia_id: materiaId,
        nombre,
        descripcion: unidadForm.descripcion.trim() || null,
      });
      setUnidadForm({ nombre: "", descripcion: "" });
      await loadHierarchy();
      toast.success(t("teacher.subjects.createSection.created.unit", { defaultValue: "Unidad creada" }));
    } catch (err) {
      console.error("[onCreateUnidad] Error:", err);
      toast.error(t("teacher.subjects.createSection.errors.unit", { defaultValue: "No se pudo crear la unidad" }));
    } finally {
      setIsSavingUnidad(false);
    }
  };

  const onCreateTema = async () => {
    const nombre = temaForm.nombre.trim();
    if (!temaForm.unidad_id) {
      toast.error(t("teacher.subjects.createSection.validation.selectUnit", { defaultValue: "Selecciona una unidad." }));
      return;
    }
    if (!nombre) {
      toast.error(t("teacher.subjects.createSection.validation.topicName", { defaultValue: "El nombre del tema es obligatorio." }));
      return;
    }

    setIsSavingTema(true);
    try {
      const createdTemaResponse = await api.post<Tema | ApiEnvelope<Tema>>("/temas", {
        unidad_id: temaForm.unidad_id,
        nombre,
        descripcion: temaForm.descripcion.trim() || null,
      });
      const createdTema = unwrapApiData(createdTemaResponse);
      setTemaForm((prev) => ({ ...prev, nombre: "", descripcion: "" }));
      await loadHierarchy();
      setTopicBeingConfigured(createdTema);
      setIsTopicConfigOpen(true);
      toast.success(t("teacher.subjects.createSection.created.topic", { defaultValue: "Tema creado" }));
    } catch (err) {
      console.error("[onCreateTema] Error:", err);
      toast.error(t("teacher.subjects.createSection.errors.topic", { defaultValue: "No se pudo crear el tema" }));
    } finally {
      setIsSavingTema(false);
    }
  };

  const onCreateLeccion = async () => {
    const titulo = leccionForm.titulo.trim();
    if (!leccionForm.tema_id) {
      toast.error(t("teacher.subjects.createSection.validation.selectTopic", { defaultValue: "Selecciona un tema." }));
      return;
    }
    if (!titulo) {
      toast.error(t("teacher.subjects.createSection.validation.lessonTitle", { defaultValue: "El título de la lección es obligatorio." }));
      return;
    }

    setIsSavingLeccion(true);
    try {
      await api.post("/lecciones", {
        tema_id: leccionForm.tema_id,
        titulo,
        descripcion: leccionForm.descripcion.trim() || null,
        nivel: leccionForm.nivel.trim() || null,
      });
      setLeccionForm((prev) => ({ ...prev, titulo: "", descripcion: "", nivel: "" }));
      await loadHierarchy();
      toast.success(t("teacher.subjects.createSection.created.lesson", { defaultValue: "Lección creada" }));
    } catch (err) {
      console.error("[onCreateLeccion] Error:", err);
      toast.error(t("teacher.subjects.createSection.errors.lesson", { defaultValue: "No se pudo crear la lección" }));
    } finally {
      setIsSavingLeccion(false);
    }
  };

  const onDeleteUnidad = async (unidadId: string, nombre: string) => {
    if (!window.confirm(t("teacher.subjects.deleteSection.confirmUnit", { defaultValue: `¿Eliminar unidad "${nombre}" y todo su contenido? Esta acción no se puede deshacer.` }))) {
      return;
    }

    setIsDeletingUnidad(unidadId);
    try {
      await api.delete(`/unidades/${unidadId}`);
      await loadHierarchy();
      toast.success(t("teacher.subjects.deleteSection.deletedUnit", { defaultValue: "Unidad eliminada" }));
    } catch (err) {
      console.error("[onDeleteUnidad] Error:", err);
      toast.error(t("teacher.subjects.deleteSection.errorUnit", { defaultValue: "No se pudo eliminar la unidad" }));
    } finally {
      setIsDeletingUnidad(null);
    }
  };

  const onDeleteTema = async (temaId: string, nombre: string) => {
    if (!window.confirm(t("teacher.subjects.deleteSection.confirmTopic", { defaultValue: `¿Eliminar tema "${nombre}" y todas sus lecciones? Esta acción no se puede deshacer.` }))) {
      return;
    }

    setIsDeletingTema(temaId);
    try {
      await api.delete(`/temas/${temaId}`);
      await loadHierarchy();
      toast.success(t("teacher.subjects.deleteSection.deletedTopic", { defaultValue: "Tema eliminado" }));
    } catch (err) {
      console.error("[onDeleteTema] Error:", err);
      toast.error(t("teacher.subjects.deleteSection.errorTopic", { defaultValue: "No se pudo eliminar el tema" }));
    } finally {
      setIsDeletingTema(null);
    }
  };

  const onDeleteLeccion = async (leccionId: string, titulo: string) => {
    if (!window.confirm(t("teacher.subjects.deleteSection.confirmLesson", { defaultValue: `¿Eliminar lección "${titulo}"? Esta acción no se puede deshacer.` }))) {
      return;
    }

    setIsDeletingLeccion(leccionId);
    try {
      await api.delete(`/lecciones/${leccionId}`);
      await loadHierarchy();
      toast.success(t("teacher.subjects.deleteSection.deletedLesson", { defaultValue: "Lección eliminada" }));
    } catch (err) {
      console.error("[onDeleteLeccion] Error:", err);
      toast.error(t("teacher.subjects.deleteSection.errorLesson", { defaultValue: "No se pudo eliminar la lección" }));
    } finally {
      setIsDeletingLeccion(null);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-500">{t("loading", { defaultValue: "Cargando..." })}</div>;
  if (!materia) return <div className="text-center py-8 text-gray-500">{t("contents.notFound", { defaultValue: "Contenido no encontrado" })}</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button onClick={() => navigate(backPath)} className="text-blue-600 hover:underline mb-4 inline-block">&larr; {t("common.back", { defaultValue: "Volver" })}</button>
      <h1 className="text-2xl font-bold mb-2">{materia.nombre}</h1>
      {materia.descripcion && <p className="text-gray-600 mb-6">{materia.descripcion}</p>}

      {canCreateContent && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowCreateSection(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition"
          >
            <Plus size={16} />
            {t("teacher.subjects.actions.createContent", { defaultValue: "Crear contenido" })}
          </button>
        </div>
      )}

      {/* Hierarchy Viewer - Show existing content */}
      <HierarchyViewer 
        unidades={unidades}
        canDelete={canCreateContent}
        isDeletingUnidad={isDeletingUnidad}
        isDeletingTema={isDeletingTema}
        isDeletingLeccion={isDeletingLeccion}
        onSelectUnidad={(unidadId) => {
          const firstTema = unidades.find(u => u.id === unidadId)?.temas?.[0];
          setTemaForm((prev) => ({ ...prev, unidad_id: unidadId, nombre: "", descripcion: "" }));
          if (firstTema) {
            setLeccionForm((prev) => ({ ...prev, tema_id: firstTema.id, titulo: "", descripcion: "", nivel: "" }));
          }
        }}
        onSelectTema={(temaId) => {
          setLeccionForm((prev) => ({ ...prev, tema_id: temaId, titulo: "", descripcion: "", nivel: "" }));
        }}
        onDeleteUnidad={onDeleteUnidad}
        onDeleteTema={onDeleteTema}
        onDeleteLeccion={onDeleteLeccion}
      />

      {canCreateContent && showCreateSection && (
        <section ref={createSectionRef} className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-700">
            {t("teacher.subjects.createSection.badge", { defaultValue: "Nuevo flujo" })}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-violet-900">
            {t("teacher.subjects.createSection.title", { defaultValue: "Crear contenido para esta materia" })}
          </h2>
          <p className="mt-1 text-sm text-violet-800">
            {t("teacher.subjects.createSection.description", {
              defaultValue: "Sección inicial lista para la próxima fase: aquí construiremos la creación de unidades, temas y lecciones por materia.",
            })}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-violet-200 bg-white p-3">
              <p className="text-sm font-semibold text-violet-900 mb-2">
                {t("teacher.subjects.createSection.items.unit", { defaultValue: "Unidad" })}
              </p>
              <input
                className="w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                placeholder={t("teacher.subjects.createSection.placeholders.unitName", { defaultValue: "Nombre de la unidad" })}
                value={unidadForm.nombre}
                onChange={(e) => setUnidadForm((prev) => ({ ...prev, nombre: e.target.value }))}
              />
              <textarea
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                rows={3}
                placeholder={t("teacher.subjects.createSection.placeholders.unitDescription", { defaultValue: "Descripción (opcional)" })}
                value={unidadForm.descripcion}
                onChange={(e) => setUnidadForm((prev) => ({ ...prev, descripcion: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => void onCreateUnidad()}
                disabled={isSavingUnidad}
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isSavingUnidad ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {t("teacher.subjects.createSection.actions.createUnit", { defaultValue: "Crear unidad" })}
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3">
              <p className="text-sm font-semibold text-violet-900 mb-2">
                {t("teacher.subjects.createSection.items.topic", { defaultValue: "Tema" })}
              </p>
              <select
                className="w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                value={temaForm.unidad_id}
                onChange={(e) => {
                  const unidadId = e.target.value;
                  // Find the first tema of this unidad and auto-select it
                  const firstTema = unidadId ? unidades.find(u => u.id === unidadId)?.temas?.[0] : null;
                  setTemaForm((prev) => ({
                    ...prev,
                    unidad_id: unidadId,
                    nombre: "",
                    descripcion: "",
                  }));
                  if (firstTema) {
                    setLeccionForm((prev) => ({ ...prev, tema_id: "" }));
                  }
                }}
              >
                <option value="">{t("teacher.subjects.createSection.placeholders.selectUnit", { defaultValue: "Selecciona unidad" })}</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
              <input
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                placeholder={t("teacher.subjects.createSection.placeholders.topicName", { defaultValue: "Nombre del tema" })}
                value={temaForm.nombre}
                onChange={(e) => setTemaForm((prev) => ({ ...prev, nombre: e.target.value }))}
              />
              <textarea
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                rows={3}
                placeholder={t("teacher.subjects.createSection.placeholders.topicDescription", { defaultValue: "Descripción (opcional)" })}
                value={temaForm.descripcion}
                onChange={(e) => setTemaForm((prev) => ({ ...prev, descripcion: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => void onCreateTema()}
                disabled={isSavingTema}
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isSavingTema ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {t("teacher.subjects.createSection.actions.createTopic", { defaultValue: "Crear tema" })}
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3">
              <p className="text-sm font-semibold text-violet-900 mb-2">
                {t("teacher.subjects.createSection.items.lesson", { defaultValue: "Lección" })}
              </p>
              <select
                className="w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                value={leccionForm.tema_id}
                onChange={(e) => {
                  const temaId = e.target.value;
                  setLeccionForm((prev) => ({
                    ...prev,
                    tema_id: temaId,
                    titulo: "",
                    descripcion: "",
                    nivel: "",
                  }));
                }}
              >
                <option value="">{t("teacher.subjects.createSection.placeholders.selectTopic", { defaultValue: "Selecciona tema" })}</option>
                {temaForm.unidad_id && unidades
                  .find(u => u.id === temaForm.unidad_id)
                  ?.temas.map((tema) => (
                    <option key={tema.id} value={tema.id}>{tema.nombre}</option>
                  ))
                }
              </select>
              <input
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                placeholder={t("teacher.subjects.createSection.placeholders.lessonTitle", { defaultValue: "Título de la lección" })}
                value={leccionForm.titulo}
                onChange={(e) => setLeccionForm((prev) => ({ ...prev, titulo: e.target.value }))}
              />
              <input
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                placeholder={t("teacher.subjects.createSection.placeholders.lessonLevel", { defaultValue: "Nivel (opcional)" })}
                value={leccionForm.nivel}
                onChange={(e) => setLeccionForm((prev) => ({ ...prev, nivel: e.target.value }))}
              />
              <textarea
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                rows={3}
                placeholder={t("teacher.subjects.createSection.placeholders.lessonDescription", { defaultValue: "Descripción (opcional)" })}
                value={leccionForm.descripcion}
                onChange={(e) => setLeccionForm((prev) => ({ ...prev, descripcion: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => void onCreateLeccion()}
                disabled={isSavingLeccion}
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isSavingLeccion ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {t("teacher.subjects.createSection.actions.createLesson", { defaultValue: "Crear lección" })}
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-violet-900">
            {t("teacher.subjects.createSection.hint", { defaultValue: "Después de crear una lección, configúrala en detalle para agregar recursos, preguntas, actividades y reglas de avance." })}
          </p>
        </section>
      )}

      <TopicConfigurationModal
        open={isTopicConfigOpen}
        topic={topicBeingConfigured}
        onClose={() => {
          setIsTopicConfigOpen(false);
          setTopicBeingConfigured(null);
        }}
        onSaved={async () => {
          await loadHierarchy();
        }}
      />

      {unidades.length === 0 ? (
        <p className="text-gray-500">{t("contents.noUnits", { defaultValue: "No hay unidades disponibles" })}</p>
      ) : (
        <div className="space-y-6">
          {unidades.map((u) => (
            <div key={u.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start justify-between mb-2">
                <h2 className="text-lg font-semibold">{u.nombre}</h2>
                {canCreateContent && (
                  <button
                    onClick={() => onDeleteUnidad(u.id, u.nombre)}
                    disabled={isDeletingUnidad === u.id}
                    className="rounded px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 transition text-sm inline-flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    {t("common.delete", { defaultValue: "Eliminar" })}
                  </button>
                )}
              </div>
              {u.descripcion && <p className="text-sm text-gray-500 mb-3">{u.descripcion}</p>}
              {u.temas.length === 0 ? (
                <p className="text-sm text-gray-400">{t("contents.noTopics", { defaultValue: "Sin temas" })}</p>
              ) : (
                u.temas.map((tema) => (
                  <div key={tema.id} className="ml-4 mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-gray-800">{tema.nombre}</h3>
                      {canCreateContent && (
                        <button
                          onClick={() => onDeleteTema(tema.id, tema.nombre)}
                          disabled={isDeletingTema === tema.id}
                          className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50 transition text-xs inline-flex items-center gap-0.5"
                        >
                          <Trash2 size={12} />
                          {t("common.delete", { defaultValue: "Eliminar" })}
                        </button>
                      )}
                    </div>
                    {tema.lecciones.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {tema.lecciones.map((l) => (
                          <li key={l.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <button onClick={() => navigate(`/lesson/${l.id}`)} className="text-blue-600 hover:underline text-sm">
                                {l.titulo}
                              </button>
                              {canCreateContent && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/teacher/lessons/${l.id}/sections`)}
                                    className="inline-flex items-center gap-1 rounded-md border border-violet-200 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
                                  >
                                    <Settings size={12} />
                                    {t("teacher.subjects.createSection.actions.configureLesson", { defaultValue: "Configurar lección" })}
                                  </button>
                                  <button
                                    onClick={() => onDeleteLeccion(l.id, l.titulo)}
                                    disabled={isDeletingLeccion === l.id}
                                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <Trash2 size={12} />
                                    {t("common.delete", { defaultValue: "Eliminar" })}
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
