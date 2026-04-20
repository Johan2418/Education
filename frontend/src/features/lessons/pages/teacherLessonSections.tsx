import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Loader2, Library } from "lucide-react";

import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import type { ActividadInteractiva, Leccion, LeccionSeccion, LeccionSeccionGatingPDF } from "@/shared/types";
import {
  createActividadInteractiva,
  extractInteractiveAllowedOrigins,
  listActividadesInteractivasByLeccion,
  updateActividadInteractiva,
} from "@/features/lessons/services/interactivas";
import {
  getSeccionGatingPdf,
  patchLeccionSeccionLifecycle,
  updateLeccionSeccion,
  upsertSeccionGatingPdf,
} from "@/features/lessons/services/recursos360";

function roleAllowed(role?: string): boolean {
  return ["teacher", "admin", "super_admin", "resource_manager"].includes(role || "");
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "Error inesperado";
}

function toDatetimeLocalValue(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISOOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface ActividadFormState {
  titulo: string;
  descripcion: string;
  proveedor: "h5p" | "genially" | "educaplay";
  embed_url: string;
  regla_completitud: "manual" | "evento" | "puntaje";
  puntaje_maximo: string;
  intentos_maximos: string;
  activo: boolean;
  configuracion: string;
}

function emptyActividadForm(): ActividadFormState {
  return {
    titulo: "",
    descripcion: "",
    proveedor: "h5p",
    embed_url: "",
    regla_completitud: "manual",
    puntaje_maximo: "100",
    intentos_maximos: "",
    activo: true,
    configuracion: "{}",
  };
}

function toActividadFormState(item: ActividadInteractiva): ActividadFormState {
  return {
    titulo: item.titulo,
    descripcion: item.descripcion || "",
    proveedor: item.proveedor,
    embed_url: item.embed_url,
    regla_completitud: item.regla_completitud,
    puntaje_maximo: String(item.puntaje_maximo),
    intentos_maximos: item.intentos_maximos != null ? String(item.intentos_maximos) : "",
    activo: item.activo,
    configuracion: JSON.stringify(item.configuracion || {}, null, 2),
  };
}

function canManageInteractive(role: string): boolean {
  return ["teacher", "admin", "super_admin"].includes(role);
}

function parseConfigObject(rawConfig: string): Record<string, unknown> {
  const parsed = JSON.parse(rawConfig || "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

export default function TeacherLessonSectionsPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState("");
  const [savingSectionSettings, setSavingSectionSettings] = useState(false);
  const [savingGatingSettings, setSavingGatingSettings] = useState(false);
  const [savingActividadLink, setSavingActividadLink] = useState(false);
  const [savingActividadForm, setSavingActividadForm] = useState(false);
  const [loadingActividades, setLoadingActividades] = useState(false);

  const [lesson, setLesson] = useState<Leccion | null>(null);
  const [secciones, setSecciones] = useState<LeccionSeccion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentGating, setCurrentGating] = useState<LeccionSeccionGatingPDF | null>(null);
  const [actividades, setActividades] = useState<ActividadInteractiva[]>([]);
  const [selectedActividadId, setSelectedActividadId] = useState("");
  const [actividadForm, setActividadForm] = useState<ActividadFormState>(emptyActividadForm());

  const [sectionSettingsForm, setSectionSettingsForm] = useState({
    estado_publicacion: "borrador" as "borrador" | "programado" | "publicado" | "despublicado",
    publicado_desde: "",
    programado_para: "",
    visible: true,
    visible_desde: "",
    visible_hasta: "",
    anio_escolar: "",
  });

  const [gatingForm, setGatingForm] = useState({
    habilitado: false,
    seccion_preguntas_id: "",
    puntaje_minimo: "0",
    requiere_responder_todas: true,
  });

  useEffect(() => {
    if (!lessonId) return;

    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me) {
          navigate("/login");
          return;
        }
        if (!roleAllowed(me.role)) {
          toast.error("No tienes permisos para configurar secciones");
          navigate("/");
          return;
        }
        setCurrentRole(me.role || "");

        const lessonRes = await api.get<{ data: Leccion }>(`/lecciones/${lessonId}`);
        setLesson(lessonRes.data);

        const seccionesRes = await api.get<{ data: LeccionSeccion[] }>(`/lecciones/${lessonId}/secciones`);
        const ordered = [...(seccionesRes.data || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        setSecciones(ordered);
        setCurrentIdx(0);

        if (canManageInteractive(me.role || "")) {
          setLoadingActividades(true);
          try {
            const items = await listActividadesInteractivasByLeccion(lessonId);
            setActividades(items);
          } catch (err) {
            toast.error(normalizeError(err));
          } finally {
            setLoadingActividades(false);
          }
        }
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, navigate]);

  const currentSection = secciones[currentIdx];

  useEffect(() => {
    if (currentIdx <= secciones.length - 1) return;
    setCurrentIdx(Math.max(0, secciones.length - 1));
  }, [currentIdx, secciones.length]);

  useEffect(() => {
    if (!currentSection) return;

    setSectionSettingsForm({
      estado_publicacion: currentSection.estado_publicacion || "borrador",
      publicado_desde: toDatetimeLocalValue(currentSection.publicado_desde),
      programado_para: toDatetimeLocalValue(currentSection.programado_para),
      visible: currentSection.visible !== false,
      visible_desde: toDatetimeLocalValue(currentSection.visible_desde),
      visible_hasta: toDatetimeLocalValue(currentSection.visible_hasta),
      anio_escolar: currentSection.anio_escolar || "",
    });

    let active = true;
    (async () => {
      try {
        const gating = await getSeccionGatingPdf(currentSection.id);
        if (!active) return;
        setCurrentGating(gating);
      } catch (err) {
        if (!active) return;
        setCurrentGating(null);
        toast.error(normalizeError(err));
      }
    })();

    return () => {
      active = false;
    };
  }, [currentSection]);

  useEffect(() => {
    setGatingForm({
      habilitado: currentGating?.habilitado ?? false,
      seccion_preguntas_id: currentGating?.seccion_preguntas_id || "",
      puntaje_minimo: String(currentGating?.puntaje_minimo ?? 0),
      requiere_responder_todas: currentGating?.requiere_responder_todas ?? true,
    });
  }, [currentGating]);

  useEffect(() => {
    if (!currentSection) return;

    const linkedId = currentSection.actividad_interactiva_id || "";
    setSelectedActividadId(linkedId);

    if (!linkedId) {
      setActividadForm(emptyActividadForm());
      return;
    }

    const linkedActividad = actividades.find((item) => item.id === linkedId);
    if (linkedActividad) {
      setActividadForm(toActividadFormState(linkedActividad));
    }
  }, [currentSection?.id, currentSection?.actividad_interactiva_id]);

  useEffect(() => {
    if (!selectedActividadId) return;
    const selected = actividades.find((item) => item.id === selectedActividadId);
    if (selected) {
      setActividadForm(toActividadFormState(selected));
    }
  }, [selectedActividadId, actividades]);

  const gatingSectionCandidates = useMemo(() => {
    if (!currentSection) return [];
    const all = secciones.filter((item) => item.id !== currentSection.id);
    const preferred = all.filter((item) => item.tipo === "preguntas" || item.tipo === "prueba" || !!item.prueba_id);
    return preferred.length > 0 ? preferred : all;
  }, [currentSection, secciones]);

  const selectedActividad = useMemo(
    () => actividades.find((item) => item.id === selectedActividadId) || null,
    [actividades, selectedActividadId]
  );

  const linkedActividad = useMemo(
    () => actividades.find((item) => item.id === currentSection?.actividad_interactiva_id) || null,
    [actividades, currentSection?.actividad_interactiva_id]
  );

  const providerOriginDefaults = useMemo(
    () => extractInteractiveAllowedOrigins(actividadForm.proveedor, null),
    [actividadForm.proveedor]
  );

  const canManageInteractiveContent = canManageInteractive(currentRole);

  const refreshActividades = async () => {
    if (!lessonId || !canManageInteractiveContent) return;
    setLoadingActividades(true);
    try {
      const items = await listActividadesInteractivasByLeccion(lessonId);
      setActividades(items);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setLoadingActividades(false);
    }
  };

  const buildFullSectionPayload = (section: LeccionSeccion, actividadId: string | null) => ({
    leccion_id: section.leccion_id,
    tipo: section.tipo,
    recurso_id: section.recurso_id ?? null,
    trabajo_id: section.trabajo_id ?? null,
    prueba_id: section.prueba_id ?? null,
    foro_id: section.foro_id ?? null,
    modelo_id: section.modelo_id ?? null,
    actividad_interactiva_id: actividadId,
    estado_publicacion: section.estado_publicacion ?? "borrador",
    publicado_desde: section.publicado_desde ?? null,
    programado_para: section.programado_para ?? null,
    visible: section.visible ?? true,
    visible_desde: section.visible_desde ?? null,
    visible_hasta: section.visible_hasta ?? null,
    anio_escolar: section.anio_escolar ?? null,
    nota_maxima: section.nota_maxima ?? 10,
    peso_calificacion: section.peso_calificacion ?? 1,
    calificable: section.calificable ?? false,
    orden: section.orden ?? 0,
    es_obligatorio: section.es_obligatorio ?? true,
    requisitos: section.requisitos ?? [],
  });

  const onSaveSectionSettings = async () => {
    if (!currentSection) return;
    if (sectionSettingsForm.estado_publicacion === "programado" && !sectionSettingsForm.programado_para) {
      toast.error("Debes indicar fecha de programación para estado programado");
      return;
    }

    setSavingSectionSettings(true);
    try {
      const updated = await patchLeccionSeccionLifecycle(currentSection.id, {
        estado_publicacion: sectionSettingsForm.estado_publicacion,
        publicado_desde: toISOOrNull(sectionSettingsForm.publicado_desde),
        programado_para: toISOOrNull(sectionSettingsForm.programado_para),
        visible: sectionSettingsForm.visible,
        visible_desde: toISOOrNull(sectionSettingsForm.visible_desde),
        visible_hasta: toISOOrNull(sectionSettingsForm.visible_hasta),
        anio_escolar: sectionSettingsForm.anio_escolar.trim() || null,
      });

      setSecciones((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      toast.success("Configuración de sección actualizada");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSavingSectionSettings(false);
    }
  };

  const onSaveGatingConfig = async () => {
    if (!currentSection) return;
    const puntajeMinimo = Number(gatingForm.puntaje_minimo);
    if (!Number.isFinite(puntajeMinimo) || puntajeMinimo < 0 || puntajeMinimo > 100) {
      toast.error("El puntaje mínimo debe estar entre 0 y 100");
      return;
    }
    if (gatingForm.habilitado && !gatingForm.seccion_preguntas_id) {
      toast.error("Debes seleccionar una sección de preguntas para habilitar el gating");
      return;
    }

    setSavingGatingSettings(true);
    try {
      const updated = await upsertSeccionGatingPdf(currentSection.id, {
        habilitado: gatingForm.habilitado,
        seccion_preguntas_id: gatingForm.habilitado ? gatingForm.seccion_preguntas_id : undefined,
        puntaje_minimo: puntajeMinimo,
        requiere_responder_todas: gatingForm.requiere_responder_todas,
      });
      setCurrentGating(updated);
      toast.success("Regla de gating guardada");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSavingGatingSettings(false);
    }
  };

  const onSelectActividad = (actividadId: string) => {
    setSelectedActividadId(actividadId);
    if (!actividadId) {
      setActividadForm(emptyActividadForm());
      return;
    }

    const item = actividades.find((actividad) => actividad.id === actividadId);
    if (item) {
      setActividadForm(toActividadFormState(item));
    }
  };

  const onSaveActividadLink = async (actividadId: string | null) => {
    if (!currentSection) return;
    if (currentSection.tipo !== "actividad_interactiva") {
      toast.error("La sección actual debe ser de tipo actividad_interactiva para vincular actividades");
      return;
    }

    setSavingActividadLink(true);
    try {
      const updated = await updateLeccionSeccion(currentSection.id, buildFullSectionPayload(currentSection, actividadId));
      setSecciones((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSelectedActividadId(actividadId || "");
      toast.success(actividadId ? "Actividad vinculada a la sección" : "Actividad desvinculada de la sección");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSavingActividadLink(false);
    }
  };

  const applyActividadPreset = (mode: "secure" | "evento" | "puntaje") => {
    let baseConfig: Record<string, unknown> = {};
    try {
      baseConfig = parseConfigObject(actividadForm.configuracion);
    } catch {
      toast.error("La configuración JSON actual no es válida. Se aplicará un preset limpio.");
      baseConfig = {};
    }

    const commonPatch: Record<string, unknown> = {
      allowed_origins: providerOriginDefaults,
      event_ingestion: "postmessage",
      event_id_keys: ["event_id", "eventId", "id"],
      event_key_field: "event_key",
    };

    let nextRule: "manual" | "evento" | "puntaje" = actividadForm.regla_completitud;
    let modePatch: Record<string, unknown> = {};
    let successMessage = "Preset seguro aplicado";

    if (mode === "evento") {
      nextRule = "evento";
      modePatch = {
        completion_mode: "event",
        completion_events: ["completed", "passed", "finished", "done"],
      };
      successMessage = "Preset de regla por evento aplicado";
    }

    if (mode === "puntaje") {
      nextRule = "puntaje";
      modePatch = {
        completion_mode: "score",
        score_threshold: 70,
        puntaje_minimo: 70,
      };
      successMessage = "Preset de regla por puntaje aplicado";
    }

    const merged = {
      ...baseConfig,
      ...commonPatch,
      ...modePatch,
    };

    setActividadForm((prev) => ({
      ...prev,
      regla_completitud: nextRule,
      configuracion: JSON.stringify(merged, null, 2),
    }));
    toast.success(successMessage);
  };

  const onSaveActividad = async () => {
    if (!lesson || !canManageInteractiveContent) return;

    const titulo = actividadForm.titulo.trim();
    const embedURL = actividadForm.embed_url.trim();
    if (!titulo) {
      toast.error("El título de la actividad es obligatorio");
      return;
    }
    if (!embedURL) {
      toast.error("La URL de embed es obligatoria");
      return;
    }

    const puntajeMaximo = Number(actividadForm.puntaje_maximo);
    if (!Number.isFinite(puntajeMaximo) || puntajeMaximo <= 0) {
      toast.error("El puntaje máximo debe ser mayor a 0");
      return;
    }

    let intentosMaximos: number | null | undefined = undefined;
    const intentosRaw = actividadForm.intentos_maximos.trim();
    if (intentosRaw) {
      const parsedIntentos = Number(intentosRaw);
      if (!Number.isFinite(parsedIntentos) || parsedIntentos <= 0) {
        toast.error("Los intentos máximos deben ser un número mayor a 0");
        return;
      }
      intentosMaximos = Math.round(parsedIntentos);
    } else {
      intentosMaximos = null;
    }

    let configuracionObj: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(actividadForm.configuracion || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error("La configuración debe ser un objeto JSON válido");
        return;
      }
      configuracionObj = parsed as Record<string, unknown>;
    } catch {
      toast.error("La configuración no es JSON válido");
      return;
    }

    setSavingActividadForm(true);
    try {
      const payload = {
        titulo,
        descripcion: actividadForm.descripcion.trim() || null,
        proveedor: actividadForm.proveedor,
        embed_url: embedURL,
        regla_completitud: actividadForm.regla_completitud,
        puntaje_maximo: puntajeMaximo,
        intentos_maximos: intentosMaximos,
        configuracion: configuracionObj,
        activo: actividadForm.activo,
      };

      let saved: ActividadInteractiva;
      if (selectedActividadId) {
        saved = await updateActividadInteractiva(selectedActividadId, payload);
      } else {
        saved = await createActividadInteractiva({
          leccion_id: lesson.id,
          ...payload,
        });
      }

      await refreshActividades();
      setSelectedActividadId(saved.id);
      toast.success(selectedActividadId ? "Actividad actualizada" : "Actividad creada");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSavingActividadForm(false);
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
    return <div className="text-center py-8 text-gray-500">Lección no encontrada</div>;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <button onClick={() => navigate("/teacher/lessons")} className="text-blue-600 hover:underline">
          &larr; Volver a Gestión de Lecciones
        </button>
        <button
          onClick={() => navigate(`/lesson/${lesson.id}`)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Ver vista estudiante
        </button>
      </div>

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600">Panel docente</p>
        <h1 className="text-2xl font-semibold mt-1">Configuración de secciones</h1>
        <p className="text-slate-600 mt-2">
          Lección: <span className="font-medium text-slate-900">{lesson.titulo}</span>
        </p>
        {!!lesson.descripcion && <p className="text-sm text-slate-500 mt-1">{lesson.descripcion}</p>}
      </section>

      {secciones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          Esta lección no tiene secciones configuradas.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <aside className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 shadow-sm p-3">
            <p className="text-sm font-semibold text-slate-700 mb-2">Secciones</p>
            <div className="space-y-2">
              {secciones.map((item, idx) => {
                const isActive = idx === currentIdx;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                      isActive ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900">Sección {idx + 1} · {item.tipo}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Publicación: {item.estado_publicacion || "borrador"} · {item.visible === false ? "Oculta" : "Visible"}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="lg:col-span-8 space-y-4">
            {currentSection && (
              <>
                <article className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Sección activa</p>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        Sección {currentIdx + 1} · {currentSection.tipo}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/teacher/recursos-personales?seccionId=${currentSection.id}`)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Library size={16} />
                      Recursos personales
                    </button>
                  </div>
                </article>

                <article className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <h2 className="text-base font-semibold text-slate-900 mb-3">Publicación y visibilidad</h2>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 mb-3">
                    Esta configuración usa PATCH parcial para no alterar vínculos de recurso, trabajo, prueba, foro, modelo o actividad interactiva.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-sm text-slate-800">
                      Estado de publicación
                      <select
                        value={sectionSettingsForm.estado_publicacion}
                        onChange={(e) => setSectionSettingsForm((prev) => ({
                          ...prev,
                          estado_publicacion: e.target.value as "borrador" | "programado" | "publicado" | "despublicado",
                        }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      >
                        <option value="borrador">Borrador</option>
                        <option value="programado">Programado</option>
                        <option value="publicado">Publicado</option>
                        <option value="despublicado">Despublicado</option>
                      </select>
                    </label>

                    <label className="text-sm text-slate-800">
                      Año escolar
                      <input
                        value={sectionSettingsForm.anio_escolar}
                        onChange={(e) => setSectionSettingsForm((prev) => ({ ...prev, anio_escolar: e.target.value }))}
                        placeholder="Ej: 2026"
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>

                    <label className="text-sm text-slate-800">
                      Publicado desde
                      <input
                        type="datetime-local"
                        value={sectionSettingsForm.publicado_desde}
                        onChange={(e) => setSectionSettingsForm((prev) => ({ ...prev, publicado_desde: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>

                    <label className="text-sm text-slate-800">
                      Programado para
                      <input
                        type="datetime-local"
                        value={sectionSettingsForm.programado_para}
                        onChange={(e) => setSectionSettingsForm((prev) => ({ ...prev, programado_para: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>

                    <label className="text-sm text-slate-800 inline-flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        checked={sectionSettingsForm.visible}
                        onChange={(e) => setSectionSettingsForm((prev) => ({ ...prev, visible: e.target.checked }))}
                      />
                      Visible para estudiantes
                    </label>

                    <div />

                    <label className="text-sm text-slate-800">
                      Visible desde
                      <input
                        type="datetime-local"
                        value={sectionSettingsForm.visible_desde}
                        onChange={(e) => setSectionSettingsForm((prev) => ({ ...prev, visible_desde: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>

                    <label className="text-sm text-slate-800">
                      Visible hasta
                      <input
                        type="datetime-local"
                        value={sectionSettingsForm.visible_hasta}
                        onChange={(e) => setSectionSettingsForm((prev) => ({ ...prev, visible_hasta: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => void onSaveSectionSettings()}
                      disabled={savingSectionSettings}
                      className="px-3 py-2 rounded-md bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50"
                    >
                      {savingSectionSettings ? "Guardando..." : "Guardar publicación y visibilidad"}
                    </button>
                  </div>
                </article>

                <article className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <h2 className="text-base font-semibold text-slate-900 mb-3">Gating PDF por sección de preguntas</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-sm text-slate-800 inline-flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        checked={gatingForm.habilitado}
                        onChange={(e) => setGatingForm((prev) => ({ ...prev, habilitado: e.target.checked }))}
                      />
                      Habilitar gating
                    </label>

                    <label className="text-sm text-slate-800 inline-flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        checked={gatingForm.requiere_responder_todas}
                        onChange={(e) => setGatingForm((prev) => ({ ...prev, requiere_responder_todas: e.target.checked }))}
                      />
                      Requiere responder todas
                    </label>

                    <label className="text-sm text-slate-800">
                      Sección de preguntas requerida
                      <select
                        value={gatingForm.seccion_preguntas_id}
                        onChange={(e) => setGatingForm((prev) => ({ ...prev, seccion_preguntas_id: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      >
                        <option value="">Selecciona una sección</option>
                        {gatingSectionCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {`Sección ${candidate.orden ?? 0} (${candidate.tipo})`}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm text-slate-800">
                      Puntaje mínimo (%)
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={gatingForm.puntaje_minimo}
                        onChange={(e) => setGatingForm((prev) => ({ ...prev, puntaje_minimo: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => void onSaveGatingConfig()}
                      disabled={savingGatingSettings}
                      className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingGatingSettings ? "Guardando..." : "Guardar gating PDF"}
                    </button>
                  </div>
                </article>

                <article className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <h2 className="text-base font-semibold text-slate-900 mb-3">Actividad interactiva (H5P, Genially, Educaplay)</h2>

                  {!canManageInteractiveContent ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Solo docente, admin y super_admin pueden crear o editar actividades interactivas.
                    </div>
                  ) : (
                    <>
                      {currentSection.tipo !== "actividad_interactiva" && (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 mb-3">
                          Esta sección no es de tipo actividad_interactiva. Puedes crear actividades, pero el vínculo solo se permitirá cuando el tipo de sección sea actividad_interactiva.
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <label className="text-sm text-slate-800">
                          Actividad existente
                          <select
                            value={selectedActividadId}
                            onChange={(e) => onSelectActividad(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                            disabled={loadingActividades}
                          >
                            <option value="">(Nueva actividad)</option>
                            {actividades.map((actividad) => (
                              <option key={actividad.id} value={actividad.id}>
                                {`${actividad.titulo} · ${actividad.proveedor}`}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="text-sm text-slate-700 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="font-medium text-slate-900 mb-1">Estado de vínculo con sección</p>
                          {linkedActividad ? (
                            <>
                              <p>Vinculada: {linkedActividad.titulo}</p>
                              <p>Proveedor: {linkedActividad.proveedor}</p>
                            </>
                          ) : (
                            <p>Sin actividad vinculada</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <button
                          onClick={() => void onSaveActividadLink(selectedActividadId || null)}
                          disabled={savingActividadLink || !selectedActividadId || currentSection.tipo !== "actividad_interactiva"}
                          className="px-3 py-1.5 rounded-md bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50"
                        >
                          {savingActividadLink ? "Vinculando..." : "Vincular actividad seleccionada"}
                        </button>

                        <button
                          onClick={() => void onSaveActividadLink(null)}
                          disabled={savingActividadLink || !currentSection.actividad_interactiva_id || currentSection.tipo !== "actividad_interactiva"}
                          className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Desvincular actividad
                        </button>

                        <button
                          onClick={() => {
                            setSelectedActividadId("");
                            setActividadForm(emptyActividadForm());
                          }}
                          className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                          Nueva actividad
                        </button>

                        <button
                          onClick={() => void refreshActividades()}
                          disabled={loadingActividades}
                          className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {loadingActividades ? "Actualizando..." : "Actualizar listado"}
                        </button>
                      </div>

                      <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 mb-4">
                        <p className="text-sm font-medium text-indigo-900 mb-2">Presets recomendados de eventos y orígenes</p>
                        <p className="text-xs text-indigo-800 mb-2">
                          Orígenes sugeridos para {actividadForm.proveedor}: {providerOriginDefaults.join(", ") || "(sin valores por defecto)"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => applyActividadPreset("secure")}
                            className="px-3 py-1.5 rounded-md border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
                          >
                            Preset seguro de orígenes
                          </button>
                          <button
                            onClick={() => applyActividadPreset("evento")}
                            className="px-3 py-1.5 rounded-md border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
                          >
                            Preset regla evento
                          </button>
                          <button
                            onClick={() => applyActividadPreset("puntaje")}
                            className="px-3 py-1.5 rounded-md border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
                          >
                            Preset regla puntaje (70%)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="text-sm text-slate-800">
                          Título
                          <input
                            value={actividadForm.titulo}
                            onChange={(e) => setActividadForm((prev) => ({ ...prev, titulo: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>

                        <label className="text-sm text-slate-800">
                          Proveedor
                          <select
                            value={actividadForm.proveedor}
                            onChange={(e) => setActividadForm((prev) => ({
                              ...prev,
                              proveedor: e.target.value as "h5p" | "genially" | "educaplay",
                            }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          >
                            <option value="h5p">H5P</option>
                            <option value="genially">Genially</option>
                            <option value="educaplay">Educaplay</option>
                          </select>
                        </label>

                        <label className="text-sm text-slate-800 md:col-span-2">
                          Descripción
                          <textarea
                            value={actividadForm.descripcion}
                            onChange={(e) => setActividadForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 min-h-[72px]"
                          />
                        </label>

                        <label className="text-sm text-slate-800 md:col-span-2">
                          URL embed
                          <input
                            value={actividadForm.embed_url}
                            onChange={(e) => setActividadForm((prev) => ({ ...prev, embed_url: e.target.value }))}
                            placeholder="https://..."
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>

                        <label className="text-sm text-slate-800">
                          Regla de completitud
                          <select
                            value={actividadForm.regla_completitud}
                            onChange={(e) => setActividadForm((prev) => ({
                              ...prev,
                              regla_completitud: e.target.value as "manual" | "evento" | "puntaje",
                            }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          >
                            <option value="manual">Manual</option>
                            <option value="evento">Evento</option>
                            <option value="puntaje">Puntaje</option>
                          </select>
                        </label>

                        <label className="text-sm text-slate-800">
                          Puntaje máximo
                          <input
                            type="number"
                            min={1}
                            value={actividadForm.puntaje_maximo}
                            onChange={(e) => setActividadForm((prev) => ({ ...prev, puntaje_maximo: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>

                        <label className="text-sm text-slate-800">
                          Intentos máximos (opcional)
                          <input
                            type="number"
                            min={1}
                            value={actividadForm.intentos_maximos}
                            onChange={(e) => setActividadForm((prev) => ({ ...prev, intentos_maximos: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>

                        <label className="text-sm text-slate-800 inline-flex items-center gap-2 pt-6">
                          <input
                            type="checkbox"
                            checked={actividadForm.activo}
                            onChange={(e) => setActividadForm((prev) => ({ ...prev, activo: e.target.checked }))}
                          />
                          Actividad activa
                        </label>

                        <label className="text-sm text-slate-800 md:col-span-2">
                          Configuración JSON
                          <textarea
                            value={actividadForm.configuracion}
                            onChange={(e) => setActividadForm((prev) => ({ ...prev, configuracion: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs min-h-[120px]"
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => void onSaveActividad()}
                          disabled={savingActividadForm}
                          className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {savingActividadForm
                            ? "Guardando..."
                            : (selectedActividad ? "Actualizar actividad seleccionada" : "Crear actividad")}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
