import api from "@/shared/lib/api";
import { getAdminGradeDetails } from "@/features/admin/services/calificaciones";
import type { Curso, ModeloRA, Profile, Recurso } from "@/shared/types";

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

function totalByType(rows: Array<{ tipo: string; total: number }>, type: string): number {
  const match = rows.find((row) => row.tipo === type);
  return match?.total ?? 0;
}

export interface AdminDashboardStats {
  users: number;
  students: number;
  teachers: number;
  admins: number;
  cursos: number;
  modelos: number;
  recursos: number;
  totalCalificaciones: number;
  promedioGeneral10: number | null;
  contenidosCalificados: number;
  pruebasCalificadas: number;
  tareasCalificadas: number;
  anioEscolarActivo: string;
  topCursoNombre: string;
  topCursoPromedio10: number | null;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const [usersRes, cursosRes, modelosRes, recursosRes, grades] = await Promise.all([
    api.get<ApiData<Profile[]> | Profile[]>("/admin/users").catch(() => ({ data: [] })),
    api.get<ApiData<Curso[]> | Curso[]>("/cursos").catch(() => ({ data: [] })),
    api.get<ApiData<ModeloRA[]> | ModeloRA[]>("/modelos").catch(() => ({ data: [] })),
    api.get<ApiData<Recurso[]> | Recurso[]>("/recursos").catch(() => ({ data: [] })),
    getAdminGradeDetails({ estado: "calificada", limit: 1, offset: 0 }).catch(() => null),
  ]);

  const users = ensureArray<Profile>(usersRes);
  const cursos = ensureArray<Curso>(cursosRes);
  const modelos = ensureArray<ModeloRA>(modelosRes);
  const recursos = ensureArray<Recurso>(recursosRes);

  const students = users.filter((user) => user.role === "student").length;
  const teachers = users.filter((user) => user.role === "teacher").length;
  const admins = users.filter((user) => user.role === "admin" || user.role === "super_admin").length;

  const topCurso = grades?.aggregates.por_curso?.length
    ? [...grades.aggregates.por_curso].sort((a, b) => b.promedio_10 - a.promedio_10)[0]
    : null;

  return {
    users: users.length,
    students,
    teachers,
    admins,
    cursos: cursos.length,
    modelos: modelos.length,
    recursos: recursos.length,
    totalCalificaciones: grades?.aggregates.total ?? 0,
    promedioGeneral10: grades ? grades.aggregates.promedio_general_10 : null,
    contenidosCalificados: grades ? totalByType(grades.aggregates.por_tipo, "contenido") : 0,
    pruebasCalificadas: grades ? totalByType(grades.aggregates.por_tipo, "prueba") : 0,
    tareasCalificadas: grades ? totalByType(grades.aggregates.por_tipo, "tarea") : 0,
    anioEscolarActivo: grades?.anio_escolar_activo ?? "",
    topCursoNombre: topCurso?.curso ?? "",
    topCursoPromedio10: topCurso?.promedio_10 ?? null,
  };
}
