import api from "@/shared/lib/api";
import type { Curso, ModeloRA, Profile, Recurso } from "@/shared/types";
import type { TrabajoAnalyticsV2Response } from "@/shared/types/trabajos";

interface ApiData<T> {
  data?: T;
}

function ensureArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && "data" in (value as Record<string, unknown>)) {
    const next = (value as ApiData<unknown>).data;
    return Array.isArray(next) ? (next as T[]) : [];
  }
  return [];
}

export interface AdminDashboardStats {
  users: number;
  students: number;
  teachers: number;
  admins: number;
  cursos: number;
  modelos: number;
  recursos: number;
  totalTrabajos: number;
  totalEntregas: number;
  totalCalificadas: number;
  promedioPuntaje: number | null;
  estudiantesActivos: number;
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

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const [usersRes, cursosRes, modelosRes, recursosRes, analytics] = await Promise.all([
    api.get<ApiData<Profile[]> | Profile[]>("/admin/users").catch(() => ({ data: [] })),
    api.get<ApiData<Curso[]> | Curso[]>("/cursos").catch(() => ({ data: [] })),
    api.get<ApiData<ModeloRA[]> | ModeloRA[]>("/modelos").catch(() => ({ data: [] })),
    api.get<ApiData<Recurso[]> | Recurso[]>("/recursos").catch(() => ({ data: [] })),
    getTrabajoAnalytics(),
  ]);

  const users = ensureArray<Profile>(usersRes);
  const cursos = ensureArray<Curso>(cursosRes);
  const modelos = ensureArray<ModeloRA>(modelosRes);
  const recursos = ensureArray<Recurso>(recursosRes);

  const students = users.filter((user) => user.role === "student").length;
  const teachers = users.filter((user) => user.role === "teacher").length;
  const admins = users.filter((user) => user.role === "admin" || user.role === "super_admin").length;

  return {
    users: users.length,
    students,
    teachers,
    admins,
    cursos: cursos.length,
    modelos: modelos.length,
    recursos: recursos.length,
    totalTrabajos: analytics?.summary.total_trabajos ?? 0,
    totalEntregas: analytics?.summary.total_entregas ?? 0,
    totalCalificadas: analytics?.summary.total_calificadas ?? 0,
    promedioPuntaje: analytics?.summary.promedio_puntaje ?? null,
    estudiantesActivos: analytics?.summary.estudiantes_activos ?? 0,
  };
}
