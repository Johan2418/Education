import api from "@/shared/lib/api";
import type {
  CursoAnioAsignarMaestrosRequest,
  CursoAnioAsignarMaestrosResult,
  DocenteMateriaAsignacion,
  MateriaCalificacionesResponse,
  MisCursoDocente,
  TeacherGradeDetailResponse,
  TeacherGradeFilters,
} from "@/shared/types";

function unwrapDataRecursive<T>(payload: unknown): T {
  let current: unknown = payload;
  let depth = 0;

  while (
    current &&
    typeof current === "object" &&
    "data" in (current as Record<string, unknown>) &&
    depth < 4
  ) {
    const next = (current as { data?: unknown }).data;
    if (typeof next === "undefined") break;
    current = next;
    depth += 1;
  }

  return current as T;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function withDocenteQuery(path: string, docenteId?: string): string {
  const trimmed = (docenteId || "").trim();
  if (!trimmed) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}docente_id=${encodeURIComponent(trimmed)}`;
}

export async function listMisCursosDocente(docenteId?: string): Promise<MisCursoDocente[]> {
  const resp = await api.get<unknown>(withDocenteQuery("/teacher/mis-cursos", docenteId));
  return ensureArray<MisCursoDocente>(unwrapDataRecursive(resp));
}

export async function listAsignacionesDocente(params: {
  docente_id?: string;
  curso_id?: string;
  materia_id?: string;
  anio_escolar?: string;
  solo_activas?: boolean;
} = {}): Promise<DocenteMateriaAsignacion[]> {
  const query = new URLSearchParams();
  if (params.docente_id) query.set("docente_id", params.docente_id);
  if (params.curso_id) query.set("curso_id", params.curso_id);
  if (params.materia_id) query.set("materia_id", params.materia_id);
  if (params.anio_escolar) query.set("anio_escolar", params.anio_escolar);
  if (typeof params.solo_activas === "boolean") query.set("solo_activas", String(params.solo_activas));

  const suffix = query.toString();
  const path = suffix ? `/asignaciones-docente?${suffix}` : "/asignaciones-docente";
  const resp = await api.get<unknown>(path);
  return ensureArray<DocenteMateriaAsignacion>(unwrapDataRecursive(resp));
}

export async function createAsignacionDocente(payload: {
  docente_id: string;
  materia_id: string;
  anio_escolar: string;
  activo?: boolean;
}): Promise<DocenteMateriaAsignacion> {
  const resp = await api.post<unknown>("/asignaciones-docente", payload);
  return unwrapDataRecursive<DocenteMateriaAsignacion>(resp);
}

export async function updateAsignacionDocente(asignacionId: string, payload: {
  docente_id?: string;
  anio_escolar?: string;
  activo?: boolean;
}): Promise<DocenteMateriaAsignacion> {
  const resp = await api.put<unknown>(`/asignaciones-docente/${asignacionId}`, payload);
  return unwrapDataRecursive<DocenteMateriaAsignacion>(resp);
}

export async function deleteAsignacionDocente(asignacionId: string): Promise<void> {
  await api.delete(`/asignaciones-docente/${asignacionId}`);
}

export async function asignarMaestrosCursoAnio(
  cursoId: string,
  payload: CursoAnioAsignarMaestrosRequest,
): Promise<CursoAnioAsignarMaestrosResult> {
  const resp = await api.post<unknown>(`/admin/cursos/${cursoId}/asignar-maestros-anio`, payload);
  return unwrapDataRecursive<CursoAnioAsignarMaestrosResult>(resp);
}

export async function getMateriaCalificaciones(materiaId: string): Promise<MateriaCalificacionesResponse> {
  const resp = await api.get<unknown>(`/materias/${materiaId}/calificaciones`);
  return unwrapDataRecursive<MateriaCalificacionesResponse>(resp);
}

export async function getTeacherGradeDetails(filters: TeacherGradeFilters = {}): Promise<TeacherGradeDetailResponse> {
  const params = new URLSearchParams();
  const append = (key: string, value?: string | number) => {
    if (value === undefined || value === null) return;
    const stringValue = String(value).trim();
    if (!stringValue) return;
    params.set(key, stringValue);
  };

  append("curso_id", filters.curso_id);
  append("anio_escolar", filters.anio_escolar);
  append("materia_id", filters.materia_id);
  append("estudiante_id", filters.estudiante_id);
  if (filters.tipo && filters.tipo !== "all") append("tipo", filters.tipo);
  if (filters.estado && filters.estado !== "todos") append("estado", filters.estado);
  append("unidad_id", filters.unidad_id);
  append("tema_id", filters.tema_id);
  append("desde", filters.desde);
  append("hasta", filters.hasta);
  append("q", filters.q);
  append("limit", filters.limit);
  append("offset", filters.offset);

  const query = params.toString();
  const resp = await api.get<unknown>(`/teacher/calificaciones/detalle${query ? `?${query}` : ""}`);
  const payload = unwrapDataRecursive<TeacherGradeDetailResponse | null>(resp);

  return payload ?? {
    items: [],
    total: 0,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
    anio_escolar_activo: "",
    aggregates: {
      total: 0,
      promedio_general_10: 0,
      promedio_general_100: 0,
      por_tipo: [],
      por_curso: [],
      por_materia: [],
      por_estudiante: [],
      por_unidad: [],
      por_tema: [],
      por_anio: [],
    },
  };
}
