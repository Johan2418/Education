import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/shared/lib/api";
import { getMe } from "@/shared/lib/auth";
import { listMisProgresos } from "@/shared/services/progresos";
import { listMisMateriasEstudiante } from "@/shared/services/studentAcademic";
import { evaluateStudentTopic } from "@/shared/services/studentProgression";
import toast from "react-hot-toast";
import { FileQuestion, Loader2, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import type { Materia, Unidad, Tema, Leccion, Progreso, Prueba } from "@/shared/types";
import { HierarchyViewer } from "../components/HierarchyViewer";
import { TopicConfigurationModal } from "../components/TopicConfigurationModal";
import { LessonFinalQuizModal } from "../components/LessonFinalQuizModal";

interface ApiEnvelope<T> {
  data: T;
}

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Error inesperado";
}

function byOrderAndName<T extends { orden?: number | null; nombre?: string | null; titulo?: string | null }>(a: T, b: T): number {
  const aOrder = Number.isFinite(a.orden as number) ? Number(a.orden) : 0;
  const bOrder = Number.isFinite(b.orden as number) ? Number(b.orden) : 0;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aName = (a.nombre || a.titulo || "").toLowerCase();
  const bName = (b.nombre || b.titulo || "").toLowerCase();
  return aName.localeCompare(bName);
}

type UnidadConTemas = (Unidad & { activo?: boolean }) & {
  temas: ((Tema & { activo?: boolean }) & { lecciones: Leccion[] })[];
};

interface StudentTopicView {
  topic: Tema & { lecciones: Leccion[] };
  locked: boolean;
  completed: boolean;
  averageScore: number | null;
}

interface StudentUnitView {
  unit: UnidadConTemas;
  locked: boolean;
  completed: boolean;
  topics: StudentTopicView[];
}

interface TemaEditorOption extends Tema {
  lecciones: Leccion[];
  unidadNombre: string;
  activo?: boolean;
}

interface LeccionEditorOption extends Leccion {
  temaNombre: string;
  unidadNombre: string;
}

export default function ContenidoPage() {
  const { materiaId } = useParams<{ materiaId: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [materia, setMateria] = useState<Materia | null>(null);
  const [unidades, setUnidades] = useState<UnidadConTemas[]>([]);
  const [backPath, setBackPath] = useState("/contents");
  const [currentRole, setCurrentRole] = useState("");
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
  const [isLessonQuizModalOpen, setIsLessonQuizModalOpen] = useState(false);
  const [lessonBeingQuizConfigured, setLessonBeingQuizConfigured] = useState<Leccion | null>(null);
  const [isUpdatingUnidad, setIsUpdatingUnidad] = useState(false);
  const [isUpdatingTema, setIsUpdatingTema] = useState(false);
  const [isUpdatingLeccion, setIsUpdatingLeccion] = useState(false);
  const createSectionRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [lessonProgressById, setLessonProgressById] = useState<Record<string, Progreso>>({});
  const [unidadOrderDraft, setUnidadOrderDraft] = useState<Record<string, string>>({});
  const [temaOrderDraft, setTemaOrderDraft] = useState<Record<string, string>>({});
  const [savingUnidadOrder, setSavingUnidadOrder] = useState<string | null>(null);
  const [savingTemaOrder, setSavingTemaOrder] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [studentAccessDenied, setStudentAccessDenied] = useState(false);
  const [studentRoadmap, setStudentRoadmap] = useState<StudentUnitView[]>([]);

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
  const [editUnidadForm, setEditUnidadForm] = useState({
    id: "",
    nombre: "",
    descripcion: "",
    orden: "0",
    activo: true,
  });
  const [editTemaForm, setEditTemaForm] = useState({
    id: "",
    nombre: "",
    descripcion: "",
    usar_solo_calificacion_leccion: true,
    peso_calificacion_leccion: "100",
    peso_calificacion_contenido: "0",
    puntaje_minimo_aprobacion: "60",
    orden: "0",
    activo: true,
  });
  const [editLeccionForm, setEditLeccionForm] = useState({
    id: "",
    titulo: "",
    descripcion: "",
    orden: "0",
    activo: true,
  });

  const loadHierarchy = useCallback(async () => {
    if (!materiaId) return;

    const matResponse = await api.get<Materia | ApiEnvelope<Materia>>(`/materias/${materiaId}`);
    const mat = unwrapApiData(matResponse);
    setMateria(mat);

    // The backend wraps responses in {data: ...}, so we need to extract it
    const unisResponse = await api.get<{ data: Unidad[] } | Unidad[]>(`/materias/${materiaId}/unidades`);
    const unis = Array.isArray(unisResponse) ? unisResponse : (unisResponse?.data || []);

    // Deduplicate unidades by id
    const unidadesMap = new Map<string, Unidad>();
    (unis || []).forEach(u => unidadesMap.set(u.id, u));
    const uniqueUnidades = Array.from(unidadesMap.values()).sort(byOrderAndName);

    const enriched = await Promise.all(
      uniqueUnidades.map(async (u) => {
        const temasResponse = await api.get<{ data: Tema[] } | Tema[]>(`/unidades/${u.id}/temas`);
        const temas = Array.isArray(temasResponse) ? temasResponse : (temasResponse?.data || []);

        // Deduplicate temas by id
        const temasMap = new Map<string, Tema>();
        (temas || []).forEach(t => temasMap.set(t.id, t));
        const uniqueTemas = Array.from(temasMap.values()).sort(byOrderAndName);

        const temasConLecciones = await Promise.all(
          uniqueTemas.map(async (tema) => {
            const leccionesResponse = await api.get<{ data: Leccion[] } | Leccion[]>(`/temas/${tema.id}/lecciones`);
            const lecciones = Array.isArray(leccionesResponse) ? leccionesResponse : (leccionesResponse?.data || []);

            // Deduplicate lecciones by id
            const leccionesMap = new Map<string, Leccion>();
            (lecciones || []).forEach(l => leccionesMap.set(l.id, l));
            const uniqueLecciones = Array.from(leccionesMap.values()).sort(byOrderAndName);

            return { ...tema, lecciones: uniqueLecciones || [] };
          })
        );
        return { ...u, temas: temasConLecciones.sort(byOrderAndName) };
      })
    );

    setUnidades(enriched.sort(byOrderAndName));
  }, [materiaId]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        const role = me?.role || "";
        setCurrentRole(role);

        if (me && ["teacher", "admin", "super_admin"].includes(role)) {
          setBackPath("/teacher/materias");
          setCanCreateContent(true);
          return;
        }

        if (role === "student") {
          setBackPath("/student/dashboard");
          setCanCreateContent(false);
        }
      } catch {
        // Not logged in or token invalid - keep default back path.
      } finally {
        setProfileLoaded(true);
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
    if (!profileLoaded) return;
    (async () => {
      setLoading(true);
      setStudentAccessDenied(false);
      try {
        if (currentRole === "student") {
          const materiasInscritas = await listMisMateriasEstudiante();
          const hasAccess = materiasInscritas.some((item) => item.id === materiaId);
          if (!hasAccess) {
            setStudentAccessDenied(true);
            setMateria(null);
            setUnidades([]);
            setLessonProgressById({});
            return;
          }
        }

        await loadHierarchy();
        if (currentRole === "student") {
          const progresos = await listMisProgresos();
          const map: Record<string, Progreso> = {};
          for (const progress of progresos) {
            map[progress.leccion_id] = progress;
          }
          setLessonProgressById(map);
        } else {
          setLessonProgressById({});
        }
      } catch (err) {
        console.error("Error loading materia", err);
        toast.error(t("contents.loadError", { defaultValue: "Error al cargar contenido" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [currentRole, loadHierarchy, materiaId, profileLoaded, t]);

  useEffect(() => {
    const nextUnidadDraft: Record<string, string> = {};
    const nextTemaDraft: Record<string, string> = {};

    for (const unidad of unidades) {
      nextUnidadDraft[unidad.id] = String(unidad.orden ?? 0);
      for (const tema of unidad.temas) {
        nextTemaDraft[tema.id] = String(tema.orden ?? 0);
      }
    }

    setUnidadOrderDraft(nextUnidadDraft);
    setTemaOrderDraft(nextTemaDraft);
  }, [unidades]);

  const temasEditorOptions = useMemo<TemaEditorOption[]>(() => {
    const items: TemaEditorOption[] = [];
    for (const unidad of unidades) {
      for (const tema of unidad.temas) {
        items.push({ ...tema, unidadNombre: unidad.nombre });
      }
    }
    return items;
  }, [unidades]);

  const leccionesEditorOptions = useMemo<LeccionEditorOption[]>(() => {
    const items: LeccionEditorOption[] = [];
    for (const unidad of unidades) {
      for (const tema of unidad.temas) {
        for (const leccion of tema.lecciones) {
          items.push({
            ...leccion,
            temaNombre: tema.nombre,
            unidadNombre: unidad.nombre,
          });
        }
      }
    }
    return items;
  }, [unidades]);

  const temaSeleccionadoParaEdicion = useMemo(() => {
    if (!editTemaForm.id) return null;
    return temasEditorOptions.find((tema) => tema.id === editTemaForm.id) ?? null;
  }, [editTemaForm.id, temasEditorOptions]);

  const fillUnidadEditor = (unidad: UnidadConTemas) => {
    setEditUnidadForm({
      id: unidad.id,
      nombre: unidad.nombre || "",
      descripcion: unidad.descripcion || "",
      orden: String(unidad.orden ?? 0),
      activo: unidad.activo ?? true,
    });
  };

  const fillTemaEditor = (tema: TemaEditorOption) => {
    setEditTemaForm({
      id: tema.id,
      nombre: tema.nombre || "",
      descripcion: tema.descripcion || "",
      usar_solo_calificacion_leccion: tema.usar_solo_calificacion_leccion ?? true,
      peso_calificacion_leccion: String(tema.peso_calificacion_leccion ?? 100),
      peso_calificacion_contenido: String(tema.peso_calificacion_contenido ?? 0),
      puntaje_minimo_aprobacion: String(tema.puntaje_minimo_aprobacion ?? 60),
      orden: String(tema.orden ?? 0),
      activo: tema.activo ?? true,
    });
  };

  const fillLeccionEditor = (leccion: LeccionEditorOption) => {
    setEditLeccionForm({
      id: leccion.id,
      titulo: leccion.titulo || "",
      descripcion: leccion.descripcion || "",
      orden: String(leccion.orden ?? 0),
      activo: leccion.activo ?? true,
    });
  };

  useEffect(() => {
    if (unidades.length > 0 && !temaForm.unidad_id) {
      const firstUnidad = unidades[0];
      if (firstUnidad) {
        setTemaForm((prev) => ({ ...prev, unidad_id: firstUnidad.id }));
      }
    }
  }, [temaForm.unidad_id, unidades]);

  useEffect(() => {
    if (!temaForm.unidad_id) return;
    const temas = unidades.find((unidad) => unidad.id === temaForm.unidad_id)?.temas ?? [];
    if (temas.length === 0) {
      setLeccionForm((prev) => ({ ...prev, tema_id: "" }));
      return;
    }
    if (!leccionForm.tema_id || !temas.some((tema) => tema.id === leccionForm.tema_id)) {
      const firstTema = temas[0];
      if (firstTema) {
        setLeccionForm((prev) => ({ ...prev, tema_id: firstTema.id }));
      }
    }
  }, [leccionForm.tema_id, temaForm.unidad_id, unidades]);

  useEffect(() => {
    if (unidades.length === 0) {
      setEditUnidadForm({ id: "", nombre: "", descripcion: "", orden: "0", activo: true });
      setEditTemaForm({
        id: "",
        nombre: "",
        descripcion: "",
        usar_solo_calificacion_leccion: true,
        peso_calificacion_leccion: "100",
        peso_calificacion_contenido: "0",
        puntaje_minimo_aprobacion: "60",
        orden: "0",
        activo: true,
      });
      setEditLeccionForm({ id: "", titulo: "", descripcion: "", orden: "0", activo: true });
      return;
    }

    if (!editUnidadForm.id || !unidades.some((unidad) => unidad.id === editUnidadForm.id)) {
      const firstUnidad = unidades[0];
      if (firstUnidad) {
        fillUnidadEditor(firstUnidad);
      }
    }
    if (temasEditorOptions.length === 0 && editTemaForm.id) {
      setEditTemaForm({
        id: "",
        nombre: "",
        descripcion: "",
        usar_solo_calificacion_leccion: true,
        peso_calificacion_leccion: "100",
        peso_calificacion_contenido: "0",
        puntaje_minimo_aprobacion: "60",
        orden: "0",
        activo: true,
      });
    }
    if (temasEditorOptions.length > 0 && (!editTemaForm.id || !temasEditorOptions.some((tema) => tema.id === editTemaForm.id))) {
      const firstTema = temasEditorOptions[0];
      if (firstTema) {
        fillTemaEditor(firstTema);
      }
    }
    if (leccionesEditorOptions.length === 0 && editLeccionForm.id) {
      setEditLeccionForm({ id: "", titulo: "", descripcion: "", orden: "0", activo: true });
    }
    if (leccionesEditorOptions.length > 0 && (!editLeccionForm.id || !leccionesEditorOptions.some((leccion) => leccion.id === editLeccionForm.id))) {
      const firstLeccion = leccionesEditorOptions[0];
      if (firstLeccion) {
        fillLeccionEditor(firstLeccion);
      }
    }
  }, [
    editLeccionForm.id,
    editTemaForm.id,
    editUnidadForm.id,
    leccionesEditorOptions,
    temasEditorOptions,
    unidades,
  ]);

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
      const createdLeccionResponse = await api.post<Leccion | ApiEnvelope<Leccion>>("/lecciones", {
        tema_id: leccionForm.tema_id,
        titulo,
        descripcion: leccionForm.descripcion.trim() || null,
        nivel: leccionForm.nivel.trim() || null,
      });
      const createdLeccion = unwrapApiData(createdLeccionResponse);
      setLeccionForm((prev) => ({ ...prev, titulo: "", descripcion: "", nivel: "" }));
      await loadHierarchy();
      setLessonBeingQuizConfigured(createdLeccion);
      setIsLessonQuizModalOpen(true);
      toast.success(t("teacher.subjects.createSection.created.lesson", { defaultValue: "Lección creada" }));
    } catch (err) {
      console.error("[onCreateLeccion] Error:", err);
      toast.error(t("teacher.subjects.createSection.errors.lesson", { defaultValue: "No se pudo crear la lección" }));
    } finally {
      setIsSavingLeccion(false);
    }
  };

  const onUpdateUnidad = async () => {
    const nombre = editUnidadForm.nombre.trim();
    if (!editUnidadForm.id) {
      toast.error("Selecciona una unidad para editar");
      return;
    }
    if (!nombre) {
      toast.error("El nombre de la unidad es obligatorio");
      return;
    }

    const order = Number(editUnidadForm.orden);
    if (!Number.isFinite(order) || order < 0) {
      toast.error("El orden de la unidad debe ser un numero mayor o igual a 0");
      return;
    }

    setIsUpdatingUnidad(true);
    try {
      await api.put(`/unidades/${editUnidadForm.id}`, {
        nombre,
        descripcion: editUnidadForm.descripcion.trim(),
        orden: Math.trunc(order),
        activo: editUnidadForm.activo,
      });
      await loadHierarchy();
      toast.success("Unidad actualizada");
    } catch (err) {
      console.error("[onUpdateUnidad] Error:", err);
      toast.error("No se pudo actualizar la unidad");
    } finally {
      setIsUpdatingUnidad(false);
    }
  };

  const onUpdateTema = async () => {
    const nombre = editTemaForm.nombre.trim();
    if (!editTemaForm.id) {
      toast.error("Selecciona un tema para editar");
      return;
    }
    if (!nombre) {
      toast.error("El nombre del tema es obligatorio");
      return;
    }

    const order = Number(editTemaForm.orden);
    if (!Number.isFinite(order) || order < 0) {
      toast.error("El orden del tema debe ser un numero mayor o igual a 0");
      return;
    }

    const usarSoloLeccion = !!editTemaForm.usar_solo_calificacion_leccion;
    const pesoLeccion = Number(editTemaForm.peso_calificacion_leccion);
    const pesoContenido = Number(editTemaForm.peso_calificacion_contenido);
    const puntajeMinimo = Number(editTemaForm.puntaje_minimo_aprobacion);

    if (!Number.isFinite(puntajeMinimo) || puntajeMinimo < 0 || puntajeMinimo > 100) {
      toast.error("El puntaje minimo de aprobacion del tema debe estar entre 0 y 100.");
      return;
    }
    if (!Number.isFinite(pesoLeccion) || pesoLeccion < 0 || pesoLeccion > 100) {
      toast.error("El peso de evaluacion final debe estar entre 0 y 100.");
      return;
    }
    if (!Number.isFinite(pesoContenido) || pesoContenido < 0 || pesoContenido > 100) {
      toast.error("El peso de contenido calificado debe estar entre 0 y 100.");
      return;
    }
    if (!usarSoloLeccion && Math.abs((pesoLeccion + pesoContenido) - 100) > 0.01) {
      toast.error("La suma de pesos de evaluacion final y contenido debe ser 100.");
      return;
    }

    setIsUpdatingTema(true);
    try {
      await api.put(`/temas/${editTemaForm.id}`, {
        nombre,
        descripcion: editTemaForm.descripcion.trim(),
        usar_solo_calificacion_leccion: usarSoloLeccion,
        peso_calificacion_leccion: usarSoloLeccion ? 100 : pesoLeccion,
        peso_calificacion_contenido: usarSoloLeccion ? 0 : pesoContenido,
        puntaje_minimo_aprobacion: puntajeMinimo,
        orden: Math.trunc(order),
        activo: editTemaForm.activo,
      });
      await loadHierarchy();
      toast.success("Tema actualizado");
    } catch (err) {
      console.error("[onUpdateTema] Error:", err);
      toast.error("No se pudo actualizar el tema");
    } finally {
      setIsUpdatingTema(false);
    }
  };

  const onUpdateLeccion = async () => {
    const titulo = editLeccionForm.titulo.trim();
    if (!editLeccionForm.id) {
      toast.error("Selecciona una evaluacion final para editar");
      return;
    }
    if (!titulo) {
      toast.error("El titulo de la evaluacion final es obligatorio");
      return;
    }

    const order = Number(editLeccionForm.orden);
    if (!Number.isFinite(order) || order < 0) {
      toast.error("El orden de la evaluacion final debe ser un numero mayor o igual a 0");
      return;
    }

    setIsUpdatingLeccion(true);
    try {
      await api.put(`/lecciones/${editLeccionForm.id}`, {
        titulo,
        descripcion: editLeccionForm.descripcion.trim(),
        orden: Math.trunc(order),
        activo: editLeccionForm.activo,
      });
      await loadHierarchy();
      toast.success("Evaluacion final actualizada");
    } catch (err) {
      console.error("[onUpdateLeccion] Error:", err);
      toast.error("No se pudo actualizar la evaluacion final");
    } finally {
      setIsUpdatingLeccion(false);
    }
  };

  const openCreateSectionAndScroll = () => {
    setShowCreateSection(true);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        createSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const openUnidadEditor = (unidadId: string) => {
    const unidad = unidades.find((item) => item.id === unidadId);
    if (!unidad) return;
    fillUnidadEditor(unidad);
    openCreateSectionAndScroll();
  };

  const openTemaEditor = (temaId: string) => {
    const tema = temasEditorOptions.find((item) => item.id === temaId);
    if (!tema) return;
    fillTemaEditor(tema);
    openCreateSectionAndScroll();
  };

  const openLeccionEditor = (leccionId: string) => {
    const leccion = leccionesEditorOptions.find((item) => item.id === leccionId);
    if (!leccion) return;
    fillLeccionEditor(leccion);
    openCreateSectionAndScroll();
  };

  const openTopicContentEditor = (temaId: string) => {
    const tema = temasEditorOptions.find((item) => item.id === temaId);
    if (!tema) return;
    setTopicBeingConfigured({
      id: tema.id,
      unidad_id: tema.unidad_id,
      nombre: tema.nombre,
      descripcion: tema.descripcion,
      orden: tema.orden,
      created_at: tema.created_at,
      updated_at: tema.updated_at,
    });
    setIsTopicConfigOpen(true);
  };

  const openLessonFinalQuizEditor = (leccionId: string) => {
    const leccion = leccionesEditorOptions.find((item) => item.id === leccionId);
    if (!leccion) return;
    setLessonBeingQuizConfigured(leccion);
    setIsLessonQuizModalOpen(true);
  };

  const getPrimaryQuizForLesson = async (leccionId: string): Promise<Prueba | null> => {
    const pruebasRes = await api.get<Prueba[] | ApiEnvelope<Prueba[]>>(`/lecciones/${leccionId}/pruebas`);
    const rawPruebas = unwrapApiData(pruebasRes);
    const pruebas = Array.isArray(rawPruebas) ? rawPruebas : [];
    const ordered = [...pruebas].sort((a, b) => {
      const byOrder = (a.orden ?? 0) - (b.orden ?? 0);
      if (byOrder !== 0) return byOrder;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    return ordered[0] ?? null;
  };

  const openLessonEvaluation = async (leccionId: string) => {
    try {
      const prueba = await getPrimaryQuizForLesson(leccionId);
      if (!prueba) {
        if (canCreateContent) {
          toast("Esta leccion aun no tiene prueba final. Configurala ahora.");
          openLessonFinalQuizEditor(leccionId);
        } else {
          toast.error("Esta leccion no tiene una prueba final disponible todavia.");
        }
        return;
      }
      navigate(`/lesson/${leccionId}/prueba/${prueba.id}`);
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const onDeleteUnidad = async (unidadId: string, nombre: string) => {
    if (!window.confirm(
      t("teacher.subjects.deleteSection.confirmUnit", {
        nombre,
        defaultValue: "¿Eliminar unidad \"{{nombre}}\" y todo su contenido? Esta acción no se puede deshacer.",
      })
    )) {
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
    if (!window.confirm(
      t("teacher.subjects.deleteSection.confirmTopic", {
        nombre,
        defaultValue: "¿Eliminar tema \"{{nombre}}\" y todas sus lecciones? Esta acción no se puede deshacer.",
      })
    )) {
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
    if (!window.confirm(
      t("teacher.subjects.deleteSection.confirmLesson", {
        titulo,
        defaultValue: "¿Eliminar lección \"{{titulo}}\"? Esta acción no se puede deshacer.",
      })
    )) {
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

  const onSaveUnidadOrder = async (unidad: UnidadConTemas) => {
    const raw = unidadOrderDraft[unidad.id] ?? String(unidad.orden ?? 0);
    const order = Number(raw);
    if (!Number.isFinite(order) || order < 0) {
      toast.error("El orden de la unidad debe ser un número mayor o igual a 0");
      return;
    }

    setSavingUnidadOrder(unidad.id);
    try {
      await api.put(`/unidades/${unidad.id}`, {
        materia_id: unidad.materia_id,
        nombre: unidad.nombre,
        descripcion: unidad.descripcion || null,
        orden: Math.trunc(order),
      });
      await loadHierarchy();
      toast.success("Orden de unidad actualizado");
    } catch (err) {
      console.error("[onSaveUnidadOrder] Error:", err);
      toast.error("No se pudo actualizar el orden de la unidad");
    } finally {
      setSavingUnidadOrder(null);
    }
  };

  const onSaveTemaOrder = async (tema: Tema & { lecciones: Leccion[] }) => {
    const raw = temaOrderDraft[tema.id] ?? String(tema.orden ?? 0);
    const order = Number(raw);
    if (!Number.isFinite(order) || order < 0) {
      toast.error("El orden del tema debe ser un número mayor o igual a 0");
      return;
    }

    setSavingTemaOrder(tema.id);
    try {
      await api.put(`/temas/${tema.id}`, {
        unidad_id: tema.unidad_id,
        nombre: tema.nombre,
        descripcion: tema.descripcion || null,
        orden: Math.trunc(order),
      });
      await loadHierarchy();
      toast.success("Orden de tema actualizado");
    } catch (err) {
      console.error("[onSaveTemaOrder] Error:", err);
      toast.error("No se pudo actualizar el orden del tema");
    } finally {
      setSavingTemaOrder(null);
    }
  };

  const isStudentView = currentRole === "student";

  useEffect(() => {
    let active = true;
    if (!isStudentView) {
      setStudentRoadmap([]);
      return () => {
        active = false;
      };
    }

    (async () => {
      const roadmap: StudentUnitView[] = [];
      let previousUnitCompleted = true;

      for (const unidad of [...unidades].sort(byOrderAndName)) {
        const topics: StudentTopicView[] = [];
        const unitLocked = !previousUnitCompleted;
        let previousTopicCompleted = true;

        for (const topic of [...unidad.temas].sort(byOrderAndName)) {
          const topicLocked = unitLocked || !previousTopicCompleted;
          const orderedLessons = [...topic.lecciones].sort(byOrderAndName);
          const topicEvaluation = await evaluateStudentTopic(topic, orderedLessons, lessonProgressById);
          const topicCompleted = orderedLessons.length === 0 ? true : topicEvaluation.approved;
          const averageScore =
            topicEvaluation.weightedScore != null
              ? Math.round(topicEvaluation.weightedScore)
              : topicEvaluation.lessonScore != null
                ? Math.round(topicEvaluation.lessonScore)
                : null;

          topics.push({
            topic,
            locked: topicLocked,
            completed: topicCompleted,
            averageScore,
          });
          previousTopicCompleted = topicCompleted;
        }

        const unitCompleted = topics.every((topic) => topic.completed);
        roadmap.push({
          unit: unidad,
          locked: unitLocked,
          completed: unitCompleted,
          topics,
        });
        previousUnitCompleted = unitCompleted;
      }

      if (active) {
        setStudentRoadmap(roadmap);
      }
    })().catch((err) => {
      console.error("[studentRoadmap] Error:", err);
      if (active) {
        setStudentRoadmap([]);
      }
    });

    return () => {
      active = false;
    };
  }, [isStudentView, lessonProgressById, unidades]);

  if (loading) return <div className="text-center py-8 text-gray-500">{t("loading", { defaultValue: "Cargando..." })}</div>;
  if (studentAccessDenied) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate("/contents")} className="text-blue-600 hover:underline mb-4 inline-block">&larr; {t("common.back", { defaultValue: "Volver" })}</button>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Esta materia no está matriculada en tu cuenta.
        </div>
      </div>
    );
  }
  if (!materia) return <div className="text-center py-8 text-gray-500">{t("contents.notFound", { defaultValue: "Contenido no encontrado" })}</div>;

  if (isStudentView) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <button onClick={() => navigate(backPath)} className="text-blue-600 hover:underline mb-4 inline-block">&larr; {t("common.back", { defaultValue: "Volver" })}</button>
        <h1 className="text-2xl font-bold mb-2">{materia.nombre}</h1>
        {materia.descripcion && <p className="text-gray-600 mb-6">{materia.descripcion}</p>}

        {studentRoadmap.length === 0 ? (
          <p className="text-gray-500">{t("contents.noUnits", { defaultValue: "No hay unidades disponibles" })}</p>
        ) : (
          <div className="space-y-6">
            {studentRoadmap.map(({ unit, topics, locked: unitLocked, completed: unitCompleted }) => (
              <section key={unit.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h2 className="text-lg font-semibold">{unit.nombre}</h2>
                  {unitCompleted && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Completada</span>}
                  {unitLocked && !unitCompleted && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Bloqueada</span>}
                </div>
                {unit.descripcion && <p className="text-sm text-slate-500 mb-3">{unit.descripcion}</p>}

                <div className="space-y-3">
                  {topics.map(({ topic, locked, completed, averageScore }) => (
                    <div key={topic.id} className={`rounded-lg border p-3 ${locked ? "border-slate-200 bg-slate-50" : "border-indigo-100 bg-indigo-50/40"}`}>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className={`font-medium ${locked ? "text-slate-600" : "text-slate-900"}`}>{topic.nombre}</h3>
                        {completed && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Completado</span>}
                        {!completed && locked && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Bloqueado</span>}
                        {!completed && !locked && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Disponible</span>}
                        {averageScore != null && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Promedio: {averageScore}%</span>}
                      </div>
                      {topic.descripcion && <p className="text-sm text-slate-500 mb-2">{topic.descripcion}</p>}

                      {topic.lecciones.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin evaluaciones finales en este tema.</p>
                      ) : (
                        <div className="space-y-1">
                          {topic.lecciones.map((lesson) => {
                            const progress = lessonProgressById[lesson.id];
                            return (
                              <button
                                key={lesson.id}
                                onClick={() => void openLessonEvaluation(lesson.id)}
                                disabled={locked}
                                className={`w-full text-left rounded-md border px-3 py-2 text-sm transition ${
                                  locked
                                    ? "cursor-not-allowed border-slate-200 text-slate-400 bg-slate-100"
                                    : "border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50"
                                }`}
                              >
                                <span className="font-medium">{lesson.titulo}</span>
                                {progress?.completado && (
                                  <span className="ml-2 text-xs text-emerald-600">
                                    ({progress.puntaje != null ? `${Math.round(progress.puntaje)}%` : "Completada"})
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button onClick={() => navigate(backPath)} className="text-blue-600 hover:underline mb-4 inline-block">&larr; {t("common.back", { defaultValue: "Volver" })}</button>
      <h1 className="text-2xl font-bold mb-2">{materia.nombre}</h1>
      {materia.descripcion && <p className="text-gray-600 mb-6">{materia.descripcion}</p>}

      {canCreateContent && (
        <div className="mb-5">
          <button
            type="button"
            onClick={openCreateSectionAndScroll}
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
          const selectedUnidad = unidades.find((u) => u.id === unidadId);
          const firstTema = unidades.find(u => u.id === unidadId)?.temas?.[0];
          if (selectedUnidad) fillUnidadEditor(selectedUnidad);
          setTemaForm((prev) => ({ ...prev, unidad_id: unidadId, nombre: "", descripcion: "" }));
          if (firstTema) {
            setLeccionForm((prev) => ({ ...prev, tema_id: firstTema.id, titulo: "", descripcion: "", nivel: "" }));
            fillTemaEditor({ ...firstTema, unidadNombre: unidades.find((u) => u.id === unidadId)?.nombre || "" });
          }
        }}
        onSelectTema={(temaId) => {
          setLeccionForm((prev) => ({ ...prev, tema_id: temaId, titulo: "", descripcion: "", nivel: "" }));
          const selectedTema = temasEditorOptions.find((item) => item.id === temaId);
          if (selectedTema) fillTemaEditor(selectedTema);
        }}
        onDeleteUnidad={onDeleteUnidad}
        onDeleteTema={onDeleteTema}
        onDeleteLeccion={onDeleteLeccion}
      />

      {canCreateContent && showCreateSection && (
        <section ref={createSectionRef} className="mb-6 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-700">
            {t("teacher.subjects.createSection.badge", { defaultValue: "Flujo docente" })}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-violet-900">
            {t("teacher.subjects.createSection.title", { defaultValue: "Crear y editar contenido de la materia" })}
          </h2>
          <p className="mt-1 text-sm text-violet-800">
            {t("teacher.subjects.createSection.description", {
              defaultValue: "Crea unidades y temas con su contenido interno, y usa las lecciones solo como evaluaciones finales por tema.",
            })}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-violet-200 bg-white p-4">
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
                placeholder={t("teacher.subjects.createSection.placeholders.unitDescription", { defaultValue: "Descripcion (opcional)" })}
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

            <div className="rounded-xl border border-violet-200 bg-white p-4">
              <p className="text-sm font-semibold text-violet-900 mb-2">
                {t("teacher.subjects.createSection.items.topic", { defaultValue: "Tema" })}
              </p>
              <select
                className="w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                value={temaForm.unidad_id}
                onChange={(e) => {
                  const unidadId = e.target.value;
                  setTemaForm((prev) => ({
                    ...prev,
                    unidad_id: unidadId,
                    nombre: "",
                    descripcion: "",
                  }));
                  setLeccionForm((prev) => ({ ...prev, tema_id: "" }));
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
                placeholder={t("teacher.subjects.createSection.placeholders.topicDescription", { defaultValue: "Descripcion (opcional)" })}
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

            <div className="rounded-xl border border-violet-200 bg-white p-4">
              <p className="text-sm font-semibold text-violet-900 mb-2">
                {t("teacher.subjects.createSection.items.lesson", { defaultValue: "Evaluacion final (Leccion)" })}
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
                  .find((u) => u.id === temaForm.unidad_id)
                  ?.temas.map((tema) => (
                    <option key={tema.id} value={tema.id}>{tema.nombre}</option>
                  ))
                }
              </select>
              <input
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                placeholder={t("teacher.subjects.createSection.placeholders.lessonTitle", { defaultValue: "Titulo de la evaluacion final" })}
                value={leccionForm.titulo}
                onChange={(e) => setLeccionForm((prev) => ({ ...prev, titulo: e.target.value }))}
              />
              <textarea
                className="mt-2 w-full rounded-md border border-violet-200 px-2 py-1.5 text-sm"
                rows={3}
                placeholder={t("teacher.subjects.createSection.placeholders.lessonDescription", { defaultValue: "Instrucciones o descripcion de la evaluacion (opcional)" })}
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
                {t("teacher.subjects.createSection.actions.createLesson", { defaultValue: "Crear evaluacion final" })}
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-violet-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-violet-900">Editar contenido existente</h3>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                Usa el icono de lapiz del listado para cargar rapido
              </span>
            </div>
            <p className="mt-1 text-xs text-violet-700">
              Edita unidad, tema o evaluacion final sin salir de esta pantalla.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Unidad</p>
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={editUnidadForm.id}
                  onChange={(e) => {
                    const selected = unidades.find((item) => item.id === e.target.value);
                    if (selected) fillUnidadEditor(selected);
                  }}
                >
                  {unidades.length === 0 ? (
                    <option value="">Sin unidades</option>
                  ) : (
                    unidades.map((unidad) => (
                      <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>
                    ))
                  )}
                </select>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={editUnidadForm.nombre}
                  onChange={(e) => setEditUnidadForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Nombre de la unidad"
                  disabled={!editUnidadForm.id}
                />
                <textarea
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  rows={2}
                  value={editUnidadForm.descripcion}
                  onChange={(e) => setEditUnidadForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Descripcion"
                  disabled={!editUnidadForm.id}
                />
                <div className="mt-2 flex items-center gap-3">
                  <label className="text-xs text-slate-600">
                    Orden
                    <input
                      type="number"
                      min={0}
                      className="ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-xs bg-white"
                      value={editUnidadForm.orden}
                      onChange={(e) => setEditUnidadForm((prev) => ({ ...prev, orden: e.target.value }))}
                      disabled={!editUnidadForm.id}
                    />
                  </label>
                  <label className="text-xs text-slate-600 inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={editUnidadForm.activo}
                      onChange={(e) => setEditUnidadForm((prev) => ({ ...prev, activo: e.target.checked }))}
                      disabled={!editUnidadForm.id}
                    />
                    Activa
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void onUpdateUnidad()}
                  disabled={!editUnidadForm.id || isUpdatingUnidad}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                >
                  {isUpdatingUnidad ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                  Guardar unidad
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Tema</p>
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={editTemaForm.id}
                  onChange={(e) => {
                    const selected = temasEditorOptions.find((item) => item.id === e.target.value);
                    if (selected) fillTemaEditor(selected);
                  }}
                >
                  {temasEditorOptions.length === 0 ? (
                    <option value="">Sin temas</option>
                  ) : (
                    temasEditorOptions.map((tema) => (
                      <option key={tema.id} value={tema.id}>{tema.unidadNombre} / {tema.nombre}</option>
                    ))
                  )}
                </select>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={editTemaForm.nombre}
                  onChange={(e) => setEditTemaForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Nombre del tema"
                  disabled={!editTemaForm.id}
                />
                <textarea
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  rows={2}
                  value={editTemaForm.descripcion}
                  onChange={(e) => setEditTemaForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Descripcion"
                  disabled={!editTemaForm.id}
                />
                <div className="mt-2 flex items-center gap-3">
                  <label className="text-xs text-slate-600">
                    Orden
                    <input
                      type="number"
                      min={0}
                      className="ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-xs bg-white"
                      value={editTemaForm.orden}
                      onChange={(e) => setEditTemaForm((prev) => ({ ...prev, orden: e.target.value }))}
                      disabled={!editTemaForm.id}
                    />
                  </label>
                  <label className="text-xs text-slate-600 inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={editTemaForm.activo}
                      onChange={(e) => setEditTemaForm((prev) => ({ ...prev, activo: e.target.checked }))}
                      disabled={!editTemaForm.id}
                    />
                    Activo
                  </label>
                </div>
                <div className="mt-3 rounded-md border border-slate-200 bg-white p-2">
                  <p className="text-xs font-semibold text-slate-800">Aprobacion del tema</p>
                  <label className="mt-2 text-xs text-slate-700 inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editTemaForm.usar_solo_calificacion_leccion}
                      onChange={(e) => setEditTemaForm((prev) => ({
                        ...prev,
                        usar_solo_calificacion_leccion: e.target.checked,
                        peso_calificacion_leccion: e.target.checked ? "100" : prev.peso_calificacion_leccion,
                        peso_calificacion_contenido: e.target.checked ? "0" : prev.peso_calificacion_contenido,
                      }))}
                      disabled={!editTemaForm.id}
                    />
                    Usar solo la evaluacion final de leccion
                  </label>
                  <label className="mt-2 block text-xs text-slate-700">
                    Puntaje minimo para aprobar el tema (0-100)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      value={editTemaForm.puntaje_minimo_aprobacion}
                      onChange={(e) => setEditTemaForm((prev) => ({ ...prev, puntaje_minimo_aprobacion: e.target.value }))}
                      disabled={!editTemaForm.id}
                    />
                  </label>
                  {!editTemaForm.usar_solo_calificacion_leccion && (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-700">
                        Peso evaluacion final (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          value={editTemaForm.peso_calificacion_leccion}
                          onChange={(e) => setEditTemaForm((prev) => ({ ...prev, peso_calificacion_leccion: e.target.value }))}
                          disabled={!editTemaForm.id}
                        />
                      </label>
                      <label className="text-xs text-slate-700">
                        Peso contenido calificado (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          value={editTemaForm.peso_calificacion_contenido}
                          onChange={(e) => setEditTemaForm((prev) => ({ ...prev, peso_calificacion_contenido: e.target.value }))}
                          disabled={!editTemaForm.id}
                        />
                      </label>
                      <p className="sm:col-span-2 text-[11px] text-slate-500">
                        Suma actual:{" "}
                        {(Number(editTemaForm.peso_calificacion_leccion || 0) + Number(editTemaForm.peso_calificacion_contenido || 0)).toFixed(2)}%
                      </p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onUpdateTema()}
                  disabled={!editTemaForm.id || isUpdatingTema}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                >
                  {isUpdatingTema ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                  Guardar tema
                </button>

                <button
                  type="button"
                  onClick={() => openTopicContentEditor(editTemaForm.id)}
                  disabled={!editTemaForm.id}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                >
                  <Settings size={12} />
                  Editar contenidos internos
                </button>

                <div className="mt-3 rounded-md border border-violet-100 bg-violet-50 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Evaluaciones del tema</p>
                  {!temaSeleccionadoParaEdicion || temaSeleccionadoParaEdicion.lecciones.length === 0 ? (
                    <p className="mt-1 text-xs text-violet-700/80">Este tema no tiene evaluaciones finales creadas.</p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {temaSeleccionadoParaEdicion.lecciones.map((leccion) => (
                        <div key={leccion.id} className="rounded border border-violet-200 bg-white p-2">
                          <p className="text-xs font-medium text-slate-800">{leccion.titulo}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openLeccionEditor(leccion.id)}
                              className="inline-flex items-center gap-1 rounded border border-indigo-200 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50"
                            >
                              <Pencil size={11} />
                              Editar evaluacion
                            </button>
                            <button
                              type="button"
                              onClick={() => openLessonFinalQuizEditor(leccion.id)}
                              className="inline-flex items-center gap-1 rounded border border-cyan-200 px-2 py-0.5 text-[11px] font-medium text-cyan-700 hover:bg-cyan-50"
                            >
                              <FileQuestion size={11} />
                              Prueba final
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Evaluacion final (Leccion)</p>
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={editLeccionForm.id}
                  onChange={(e) => {
                    const selected = leccionesEditorOptions.find((item) => item.id === e.target.value);
                    if (selected) fillLeccionEditor(selected);
                  }}
                >
                  {leccionesEditorOptions.length === 0 ? (
                    <option value="">Sin lecciones</option>
                  ) : (
                    leccionesEditorOptions.map((leccion) => (
                      <option key={leccion.id} value={leccion.id}>
                        {leccion.unidadNombre} / {leccion.temaNombre} / {leccion.titulo}
                      </option>
                    ))
                  )}
                </select>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={editLeccionForm.titulo}
                  onChange={(e) => setEditLeccionForm((prev) => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Titulo de la evaluacion final"
                  disabled={!editLeccionForm.id}
                />
                <textarea
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  rows={2}
                  value={editLeccionForm.descripcion}
                  onChange={(e) => setEditLeccionForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Descripcion"
                  disabled={!editLeccionForm.id}
                />
                <div className="mt-2 flex items-center gap-3">
                  <label className="text-xs text-slate-600">
                    Orden
                    <input
                      type="number"
                      min={0}
                      className="ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-xs bg-white"
                      value={editLeccionForm.orden}
                      onChange={(e) => setEditLeccionForm((prev) => ({ ...prev, orden: e.target.value }))}
                      disabled={!editLeccionForm.id}
                    />
                  </label>
                  <label className="text-xs text-slate-600 inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={editLeccionForm.activo}
                      onChange={(e) => setEditLeccionForm((prev) => ({ ...prev, activo: e.target.checked }))}
                      disabled={!editLeccionForm.id}
                    />
                    Activa
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onUpdateLeccion()}
                    disabled={!editLeccionForm.id || isUpdatingLeccion}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                  >
                    {isUpdatingLeccion ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                    Guardar evaluacion
                  </button>
                  <button
                    type="button"
                    onClick={() => openLessonFinalQuizEditor(editLeccionForm.id)}
                    disabled={!editLeccionForm.id}
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-200 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                  >
                    <FileQuestion size={12} />
                    Prueba final
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-sm font-medium text-violet-900">
            {t("teacher.subjects.createSection.hint", {
              defaultValue: "Consejo: abre cualquier elemento del listado con el icono de lapiz para cargarlo directo en el panel de edicion.",
            })}
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

      <LessonFinalQuizModal
        open={isLessonQuizModalOpen}
        lesson={lessonBeingQuizConfigured}
        onClose={() => {
          setIsLessonQuizModalOpen(false);
          setLessonBeingQuizConfigured(null);
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
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <h2 className="text-lg font-semibold">{u.nombre}</h2>
                {canCreateContent && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">
                      Orden
                      <input
                        type="number"
                        min={0}
                        value={unidadOrderDraft[u.id] ?? String(u.orden ?? 0)}
                        onChange={(e) => setUnidadOrderDraft((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-xs"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void onSaveUnidadOrder(u)}
                      disabled={savingUnidadOrder === u.id}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {savingUnidadOrder === u.id ? "Guardando..." : "Guardar orden"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openUnidadEditor(u.id)}
                      className="rounded border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-1"
                    >
                      <Pencil size={12} />
                      Editar
                    </button>
                    <button
                      onClick={() => onDeleteUnidad(u.id, u.nombre)}
                      disabled={isDeletingUnidad === u.id}
                      className="rounded px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 transition text-sm inline-flex items-center gap-1"
                    >
                      <Trash2 size={14} />
                      {t("common.delete", { defaultValue: "Eliminar" })}
                    </button>
                  </div>
                )}
              </div>
              {u.descripcion && <p className="text-sm text-gray-500 mb-3">{u.descripcion}</p>}
              {u.temas.length === 0 ? (
                <p className="text-sm text-gray-400">{t("contents.noTopics", { defaultValue: "Sin temas" })}</p>
              ) : (
                u.temas.map((tema) => (
                  <div key={tema.id} className="ml-4 mb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <h3 className="font-medium text-gray-800">{tema.nombre}</h3>
                      {canCreateContent && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500">
                            Orden
                            <input
                              type="number"
                              min={0}
                              value={temaOrderDraft[tema.id] ?? String(tema.orden ?? 0)}
                              onChange={(e) => setTemaOrderDraft((prev) => ({ ...prev, [tema.id]: e.target.value }))}
                              className="ml-1 w-14 rounded border border-slate-300 px-1 py-0.5 text-[11px]"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void onSaveTemaOrder(tema)}
                            disabled={savingTemaOrder === tema.id}
                            className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {savingTemaOrder === tema.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openTemaEditor(tema.id)}
                            className="rounded border border-indigo-200 px-2 py-0.5 text-[11px] text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-0.5"
                          >
                            <Pencil size={11} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => openTopicContentEditor(tema.id)}
                            className="rounded border border-violet-200 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-50 inline-flex items-center gap-0.5"
                          >
                            <Settings size={11} />
                            Contenido
                          </button>
                          <button
                            onClick={() => onDeleteTema(tema.id, tema.nombre)}
                            disabled={isDeletingTema === tema.id}
                            className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50 transition text-xs inline-flex items-center gap-0.5"
                          >
                            <Trash2 size={12} />
                            {t("common.delete", { defaultValue: "Eliminar" })}
                          </button>
                        </div>
                      )}
                    </div>
                    {tema.lecciones.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {tema.lecciones.map((l) => (
                          <li key={l.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <button onClick={() => void openLessonEvaluation(l.id)} className="text-blue-600 hover:underline text-sm">
                                {l.titulo}
                              </button>
                              {canCreateContent && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openLeccionEditor(l.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                  >
                                    <Pencil size={12} />
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openLessonFinalQuizEditor(l.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-cyan-200 px-2 py-0.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50"
                                  >
                                    <FileQuestion size={12} />
                                    Prueba final
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


