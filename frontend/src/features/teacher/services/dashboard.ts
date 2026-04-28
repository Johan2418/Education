import api from "@/shared/lib/api";
import { listMisCursosDocente } from "@/features/teacher/services/docencia";
import type { MisCursoDocente } from "@/shared/types";
import type { TrabajoAnalyticsV2Response } from "@/shared/types/trabajos";

export interface TeacherDashboardStats {
  totalCursos: number;
  totalMaterias: number;
  totalEstudiantes: number;
  totalLecciones: number;
  totalTrabajos: number;
  totalEntregas: number;
  totalCalificadas: number;
  promedioPuntaje: number | null;
  promedioFinal10: number | null;
}

function toSafeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((acc, item) => acc + toSafeNumber(selector(item)), 0);
}

function countUnique(items: MisCursoDocente[], selector: (item: MisCursoDocente) => string): number {
  const values = new Set<string>();
  for (const item of items) {
    const value = selector(item).trim();
    if (value) values.add(value);
  }
  return values.size;
}

function estimateTotalEstudiantes(items: MisCursoDocente[]): number {
  const byCurso = new Map<string, number>();
  for (const item of items) {
    const cursoId = item.curso_id.trim();
    if (!cursoId) continue;

    const current = byCurso.get(cursoId) ?? 0;
    const next = Math.max(current, toSafeNumber(item.total_estudiantes));
    byCurso.set(cursoId, next);
  }

  let total = 0;
  for (const value of byCurso.values()) {
    total += value;
  }
  return total;
}

async function getTrabajoAnalytics(): Promise<TrabajoAnalyticsV2Response | null> {
  try {
    const response = await api.get<{ data?: TrabajoAnalyticsV2Response } | TrabajoAnalyticsV2Response>("/trabajos/analytics/v2");
    if (response && typeof response === "object" && "data" in response) {
      return response.data ?? null;
    }
    return response as TrabajoAnalyticsV2Response;
  } catch {
    return null;
  }
}

export async function getTeacherDashboardStats(docenteId?: string): Promise<TeacherDashboardStats> {
  const [misCursos, analytics] = await Promise.all([
    listMisCursosDocente(docenteId).catch(() => []),
    getTrabajoAnalytics(),
  ]);

  const cursos = Array.isArray(misCursos) ? misCursos : [];

  return {
    totalCursos: countUnique(cursos, (item) => item.curso_id),
    totalMaterias: countUnique(cursos, (item) => item.materia_id),
    totalEstudiantes: estimateTotalEstudiantes(cursos),
    totalLecciones: sumBy(cursos, (item) => item.total_lecciones),
    totalTrabajos: sumBy(cursos, (item) => item.total_trabajos),
    totalEntregas: toSafeNumber(analytics?.summary.total_entregas),
    totalCalificadas: toSafeNumber(analytics?.summary.total_calificadas),
    promedioPuntaje: analytics?.summary.promedio_puntaje ?? null,
    promedioFinal10: analytics?.summary.promedio_final_10 ?? null,
  };
}
