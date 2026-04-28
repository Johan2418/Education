import { api } from "@/shared/lib/api";
import { listMisProgresos } from "@/shared/services/progresos";
import { listMisMateriasEstudiante } from "@/shared/services/studentAcademic";
import type { Leccion, LeccionSeccion, Materia, Progreso, ProgresoSeccion, Tema, Unidad } from "@/shared/types";

type ApiItemResponse<T> = T | { data?: T | null };
type ApiListResponse<T> = T[] | { data?: T[] | null };

export type StudentLessonAccessReason = "ok" | "not_enrolled" | "blocked_sequence";

export interface StudentLessonAccess {
  allowed: boolean;
  materiaId: string | null;
  reason: StudentLessonAccessReason;
}

function unwrapItem<T>(response: ApiItemResponse<T>): T | null {
  if (response && typeof response === "object" && "data" in response) {
    return response.data ?? null;
  }
  return response as T;
}

function unwrapList<T>(response: ApiListResponse<T>): T[] {
  if (Array.isArray(response)) return response;
  return Array.isArray(response?.data) ? response.data : [];
}

function sortByOrderAndName<T extends { orden?: number | null; nombre?: string | null; titulo?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrder = Number.isFinite(a.orden as number) ? Number(a.orden) : 0;
    const bOrder = Number.isFinite(b.orden as number) ? Number(b.orden) : 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aName = (a.nombre || a.titulo || "").toLowerCase();
    const bName = (b.nombre || b.titulo || "").toLowerCase();
    return aName.localeCompare(bName);
  });
}

function buildProgressByLesson(progresos: Progreso[]): Record<string, Progreso> {
  const map: Record<string, Progreso> = {};
  for (const progress of progresos) {
    map[progress.leccion_id] = progress;
  }
  return map;
}

async function getTema(temaId: string): Promise<Tema | null> {
  const response = await api.get<ApiItemResponse<Tema>>(`/temas/${temaId}`);
  return unwrapItem(response);
}

async function getUnidad(unidadId: string): Promise<Unidad | null> {
  const response = await api.get<ApiItemResponse<Unidad>>(`/unidades/${unidadId}`);
  return unwrapItem(response);
}

async function listUnidades(materiaId: string): Promise<Unidad[]> {
  const response = await api.get<ApiListResponse<Unidad>>(`/materias/${materiaId}/unidades`);
  return sortByOrderAndName(unwrapList(response));
}

async function listTemas(unidadId: string): Promise<Tema[]> {
  const response = await api.get<ApiListResponse<Tema>>(`/unidades/${unidadId}/temas`);
  return sortByOrderAndName(unwrapList(response));
}

async function listLecciones(temaId: string): Promise<Leccion[]> {
  const response = await api.get<ApiListResponse<Leccion>>(`/temas/${temaId}/lecciones`);
  return sortByOrderAndName(unwrapList(response));
}

async function listSeccionesByLeccion(leccionId: string): Promise<LeccionSeccion[]> {
  const response = await api.get<ApiListResponse<LeccionSeccion>>(`/lecciones/${leccionId}/secciones`);
  return sortByOrderAndName(unwrapList(response));
}

async function listProgresoSeccionesByLeccion(leccionId: string): Promise<ProgresoSeccion[]> {
  const response = await api.get<ApiListResponse<ProgresoSeccion>>(`/lecciones/${leccionId}/progreso-secciones`);
  return unwrapList(response);
}

function averageScore(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, current) => sum + current, 0) / valid.length;
}

function getTemaPuntajeMinimo(topic: Tema): number {
  const value = topic.puntaje_minimo_aprobacion;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 60;
}

function getTemaPesoLeccion(topic: Tema): number {
  const value = topic.peso_calificacion_leccion;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 100;
}

function getTemaPesoContenido(topic: Tema): number {
  const value = topic.peso_calificacion_contenido;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

export interface StudentTopicEvaluation {
  approved: boolean;
  lessonScore: number | null;
  contentScore: number | null;
  weightedScore: number | null;
}

export async function evaluateStudentTopic(topic: Tema, lecciones: Leccion[], progressByLesson: Record<string, Progreso>): Promise<StudentTopicEvaluation> {
  const lessonScore = averageScore(
    lecciones
      .map((leccion) => progressByLesson[leccion.id]?.puntaje)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  );
  const minimoAprobacion = getTemaPuntajeMinimo(topic);
  const usarSoloLeccion = topic.usar_solo_calificacion_leccion ?? true;

  if (usarSoloLeccion) {
    return {
      approved: lessonScore != null && lessonScore >= minimoAprobacion,
      lessonScore,
      contentScore: null,
      weightedScore: lessonScore,
    };
  }

  const pesoLeccion = getTemaPesoLeccion(topic);
  const pesoContenido = getTemaPesoContenido(topic);
  const requiereLeccion = pesoLeccion > 0;
  const requiereContenido = pesoContenido > 0;

  let contentScore: number | null = null;
  if (requiereContenido) {
    const contentScores: number[] = [];

    for (const leccion of lecciones) {
      const [secciones, progresoSecciones] = await Promise.all([
        listSeccionesByLeccion(leccion.id),
        listProgresoSeccionesByLeccion(leccion.id),
      ]);
      const progresoBySectionId: Record<string, ProgresoSeccion> = {};
      for (const progress of progresoSecciones) {
        progresoBySectionId[progress.leccion_seccion_id] = progress;
      }

      for (const seccion of secciones) {
        const esContenidoCalificado =
          seccion.calificable === true &&
          seccion.tipo !== "prueba" &&
          seccion.tipo !== "trabajo" &&
          !seccion.prueba_id;
        if (!esContenidoCalificado) continue;

        const score = progresoBySectionId[seccion.id]?.puntuacion;
        if (typeof score === "number" && Number.isFinite(score)) {
          contentScores.push(score);
        }
      }
    }

    contentScore = averageScore(contentScores);
  }

  if (requiereLeccion && lessonScore == null) {
    return { approved: false, lessonScore, contentScore, weightedScore: null };
  }
  if (requiereContenido && contentScore == null) {
    return { approved: false, lessonScore, contentScore, weightedScore: null };
  }

  const weightedScore = ((lessonScore ?? 0) * pesoLeccion + (contentScore ?? 0) * pesoContenido) / 100;
  return {
    approved: weightedScore >= minimoAprobacion,
    lessonScore,
    contentScore,
    weightedScore,
  };
}

function isMateriaEnrolled(materias: Materia[], materiaId: string): boolean {
  return materias.some((materia) => materia.id === materiaId);
}

export async function getStudentLessonAccess(lesson: Pick<Leccion, "tema_id">): Promise<StudentLessonAccess> {
  if (!lesson.tema_id) {
    return { allowed: false, materiaId: null, reason: "blocked_sequence" };
  }

  const tema = await getTema(lesson.tema_id);
  if (!tema) {
    return { allowed: false, materiaId: null, reason: "blocked_sequence" };
  }

  const unidadObjetivo = await getUnidad(tema.unidad_id);
  if (!unidadObjetivo) {
    return { allowed: false, materiaId: null, reason: "blocked_sequence" };
  }

  const materiaId = unidadObjetivo.materia_id;

  const [materiasInscritas, progresos] = await Promise.all([
    listMisMateriasEstudiante(),
    listMisProgresos(),
  ]);
  if (!isMateriaEnrolled(materiasInscritas, materiaId)) {
    return { allowed: false, materiaId, reason: "not_enrolled" };
  }

  const progressByLesson = buildProgressByLesson(progresos);
  const unidades = await listUnidades(materiaId);

  let previousUnitCompleted = true;
  for (const unidad of unidades) {
    const unitLocked = !previousUnitCompleted;
    const temas = await listTemas(unidad.id);

    let previousTopicCompleted = true;
    let unitCompleted = true;

    for (const topic of temas) {
      const topicLocked = unitLocked || !previousTopicCompleted;
      const lecciones = await listLecciones(topic.id);
      const topicEvaluation = await evaluateStudentTopic(topic, lecciones, progressByLesson);
      const topicCompleted = lecciones.length === 0 ? true : topicEvaluation.approved;

      if (topic.id === tema.id) {
        if (topicLocked) {
          return { allowed: false, materiaId, reason: "blocked_sequence" };
        }
        return { allowed: true, materiaId, reason: "ok" };
      }

      previousTopicCompleted = topicCompleted;
      if (!topicCompleted) {
        unitCompleted = false;
      }
    }

    previousUnitCompleted = unitCompleted;
  }

  return { allowed: true, materiaId, reason: "ok" };
}
