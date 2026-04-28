import api from "@/shared/lib/api";
import { listMisProgresos } from "@/shared/services/progresos";
import { listMisCalificacionesMateriasEstudiante, listMisMateriasEstudiante } from "@/shared/services/studentAcademic";
import type { Leccion, Materia, MateriaCalificacionEstudianteResponse, Progreso, Tema, Trabajo, Unidad } from "@/shared/types";

interface ApiData<T> {
  data?: T;
}

type ListResponse<T> = T[] | ApiData<T[]>;

function unwrapList<T>(value: ListResponse<T>): T[] {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.data) ? value.data : [];
}

async function listUnidadesByMateria(materiaId: string): Promise<Unidad[]> {
  const response = await api.get<ListResponse<Unidad>>(`/materias/${materiaId}/unidades`);
  return unwrapList(response);
}

async function listTemasByUnidad(unidadId: string): Promise<Tema[]> {
  const response = await api.get<ListResponse<Tema>>(`/unidades/${unidadId}/temas`);
  return unwrapList(response);
}

async function listLeccionesByTema(temaId: string): Promise<Leccion[]> {
  const response = await api.get<ListResponse<Leccion>>(`/temas/${temaId}/lecciones`);
  return unwrapList(response);
}

async function countLessonsForMateria(materia: Materia): Promise<number> {
  try {
    const unidades = await listUnidadesByMateria(materia.id);
    if (unidades.length === 0) return 0;

    const temasPorUnidad = await Promise.all(unidades.map((unidad) => listTemasByUnidad(unidad.id)));
    const temas = temasPorUnidad.flat();
    if (temas.length === 0) return 0;

    const leccionesPorTema = await Promise.all(temas.map((tema) => listLeccionesByTema(tema.id)));
    return leccionesPorTema.reduce((acc, lecciones) => acc + lecciones.length, 0);
  } catch {
    return 0;
  }
}

function getLastVisited(progresos: Progreso[]): Progreso | null {
  return progresos.reduce<Progreso | null>((best, current) => {
    if (!current.updated_at) return best;
    if (!best) return current;
    return new Date(current.updated_at) > new Date(best.updated_at || "") ? current : best;
  }, null);
}

async function listMisTrabajos(): Promise<Trabajo[]> {
  const response = await api.get<ApiData<Trabajo[]> | Trabajo[]>("/mis-trabajos");
  return unwrapList(response as ListResponse<Trabajo>);
}

export interface StudentDashboardStats {
  materias: Materia[];
  materiaCalificaciones: MateriaCalificacionEstudianteResponse[];
  progresos: Progreso[];
  totalMaterias: number;
  materiasAprobadas: number;
  materiasReprobadas: number;
  materiasNoCompletadas: number;
  totalLessons: number;
  completedLessons: number;
  pendingLessons: number;
  totalScore: number;
  averageScore: number;
  trabajosPendientes: number;
  lastVisited: Progreso | null;
}

export async function getStudentDashboardStats(): Promise<StudentDashboardStats> {
  const [materias, progresos, trabajos, materiaCalificaciones] = await Promise.all([
    listMisMateriasEstudiante(),
    listMisProgresos(),
    listMisTrabajos().catch(() => []),
    listMisCalificacionesMateriasEstudiante().catch(() => []),
  ]);

  const lessonCounts = await Promise.all(materias.map((materia) => countLessonsForMateria(materia)));
  const totalLessons = lessonCounts.reduce((acc, value) => acc + value, 0);
  const completedLessons = progresos.filter((progress) => progress.completado).length;
  const pendingLessons = Math.max(0, totalLessons - completedLessons);
  const totalScore = progresos.reduce((acc, progress) => acc + (progress.puntaje ?? 0), 0);
  const averageScore = progresos.length > 0 ? Math.round(totalScore / progresos.length) : 0;
  const trabajosPendientes = trabajos.filter((trabajo) => trabajo.estado === "publicado").length;

  const materiasAprobadas = materiaCalificaciones.filter((item) => item.estado_final === "aprobada").length;
  const materiasReprobadas = materiaCalificaciones.filter((item) => item.estado_final === "reprobada").length;
  const materiasNoCompletadas = materiaCalificaciones.filter((item) => item.estado_final === "materia_no_completada").length;

  return {
    materias,
    materiaCalificaciones,
    progresos,
    totalMaterias: materias.length,
    materiasAprobadas,
    materiasReprobadas,
    materiasNoCompletadas,
    totalLessons,
    completedLessons,
    pendingLessons,
    totalScore,
    averageScore,
    trabajosPendientes,
    lastVisited: getLastVisited(progresos),
  };
}
