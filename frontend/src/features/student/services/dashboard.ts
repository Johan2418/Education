import api from "@/shared/lib/api";
import { listMisProgresos } from "@/shared/services/progresos";
import { listMisCalificacionesMateriasEstudiante, listMisMateriasEstudiante } from "@/shared/services/studentAcademic";
import { listMisPruebasEstudiante } from "@/features/pruebas/services/pruebas";
import { listMisTrabajos } from "@/features/trabajos/services/trabajos";
import type { Leccion, Materia, MateriaCalificacionEstudianteResponse, Progreso, PruebaConLeccion, Tema, TrabajoConEstadoEntrega, Unidad } from "@/shared/types";
import { API_BASE_URL } from "@/shared/lib/api";

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
  const response = await api.get<ListResponse<Leccion>>(`/temas/${temaId}/contenidos`);
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

export interface StudentDashboardStats {
  materias: Materia[];
  materiaCalificaciones: MateriaCalificacionEstudianteResponse[];
  progresos: Progreso[];
  examenes: PruebaConLeccion[];
  trabajos: TrabajoConEstadoEntrega[];
  totalMaterias: number;
  materiasAprobadas: number;
  materiasReprobadas: number;
  materiasNoCompletadas: number;
  totalContenidos: number;
  contenidosCompletados: number;
  contenidosPendientes: number;
  examenesPendientes: number;
  examenesCompletados: number;
  trabajosPendientes: number;
  trabajosEntregados: number;
  trabajosCalificados: number;
  promedioGeneral: number;
  lastVisited: Progreso | null;
}

export async function getStudentDashboardStats(): Promise<StudentDashboardStats> {
  const [materias, progresos, trabajos, examenes, materiaCalificaciones] = await Promise.all([
    listMisMateriasEstudiante(),
    listMisProgresos(),
    listMisTrabajos().catch(() => []),
    listMisPruebasEstudiante().catch(() => []),
    listMisCalificacionesMateriasEstudiante().catch(() => []),
  ]);

  const contenidoCounts = await Promise.all(materias.map((materia) => countLessonsForMateria(materia)));
  const totalContenidos = contenidoCounts.reduce((acc, value) => acc + value, 0);
  const contenidosCompletados = progresos.filter((progress) => progress.completado).length;
  const contenidosPendientes = Math.max(0, totalContenidos - contenidosCompletados);
  const examenesCompletados = examenes.filter((examen) => {
    const now = Date.now();
    if (examen.activa === false) return false;
    if (examen.fecha_activacion && new Date(examen.fecha_activacion).getTime() > now) return false;
    return true;
  }).length;
  const examenesPendientes = Math.max(0, examenes.length - examenesCompletados);
  const trabajosPendientes = trabajos.filter((trabajo) => !trabajo.entregada && trabajo.estado !== "cerrado").length;
  const trabajosEntregados = trabajos.filter((trabajo) => Boolean(trabajo.entregada)).length;
  const trabajosCalificados = trabajos.filter((trabajo) => trabajo.entrega_estado === "calificada").length;
  const promedioGeneral = materiaCalificaciones.length > 0
    ? Number((materiaCalificaciones.reduce((acc, item) => acc + item.nota_final, 0) / materiaCalificaciones.length).toFixed(2))
    : 0;

  const materiasAprobadas = materiaCalificaciones.filter((item) => item.estado_final === "aprobada").length;
  const materiasReprobadas = materiaCalificaciones.filter((item) => item.estado_final === "reprobada").length;
  const materiasNoCompletadas = materiaCalificaciones.filter((item) => item.estado_final === "materia_no_completada").length;

  return {
    materias,
    materiaCalificaciones,
    progresos,
    examenes,
    trabajos,
    totalMaterias: materias.length,
    materiasAprobadas,
    materiasReprobadas,
    materiasNoCompletadas,
    totalContenidos,
    contenidosCompletados,
    contenidosPendientes,
    examenesPendientes,
    examenesCompletados,
    trabajosPendientes,
    trabajosEntregados,
    trabajosCalificados,
    promedioGeneral,
    lastVisited: getLastVisited(progresos),
  };
}

export function createStudentGradesStream(
  opts: {
    onGradeEvent: () => void;
    onOpen?: () => void;
    onError?: (error: unknown) => void;
  }
): () => void {
  let abortController: AbortController | null = null;
  let active = true;
  let retryMs = 3000;
  let retryTimer: number | null = null;

  const scheduleReconnect = () => {
    if (!active) return;
    if (retryTimer != null) window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      void connect();
    }, retryMs);
    retryMs = Math.min(30000, retryMs * 1.5);
  };

  const connect = async () => {
    if (!active) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    abortController?.abort();
    abortController = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/student/calificaciones/stream`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`stream_status_${response.status}`);
      }

      retryMs = 3000;
      opts.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (active) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          if (!chunk.includes("event: grade_updated")) continue;
          opts.onGradeEvent();
        }
      }
    } catch (error) {
      if (!active) return;
      opts.onError?.(error);
      scheduleReconnect();
    }
  };

  void connect();

  return () => {
    active = false;
    abortController?.abort();
    if (retryTimer != null) window.clearTimeout(retryTimer);
  };
}
