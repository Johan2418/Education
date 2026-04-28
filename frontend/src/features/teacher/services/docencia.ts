import api from "@/shared/lib/api";
import type {
  CursoAnioAsignarMaestrosRequest,
  CursoAnioAsignarMaestrosResult,
  DocenteMateriaAsignacion,
  DocenteMateriaHorario,
  DocenteMateriaHorarioRequest,
  MateriaCalificacionesResponse,
  MisCursoDocente,
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

export async function listHorariosDocente(docenteId?: string): Promise<DocenteMateriaHorario[]> {
  const resp = await api.get<unknown>(withDocenteQuery("/teacher/horarios", docenteId));
  return ensureArray<DocenteMateriaHorario>(unwrapDataRecursive(resp));
}

export async function listHorariosByAsignacion(asignacionId: string): Promise<DocenteMateriaHorario[]> {
  const resp = await api.get<unknown>(`/asignaciones-docente/${asignacionId}/horarios`);
  return ensureArray<DocenteMateriaHorario>(unwrapDataRecursive(resp));
}

export async function createHorarioAsignacion(asignacionId: string, payload: DocenteMateriaHorarioRequest): Promise<DocenteMateriaHorario> {
  const resp = await api.post<unknown>(`/asignaciones-docente/${asignacionId}/horarios`, payload);
  return unwrapDataRecursive<DocenteMateriaHorario>(resp);
}

export async function updateHorarioAsignacion(horarioId: string, payload: Partial<DocenteMateriaHorarioRequest>): Promise<DocenteMateriaHorario> {
  const resp = await api.put<unknown>(`/horarios-docente/${horarioId}`, payload);
  return unwrapDataRecursive<DocenteMateriaHorario>(resp);
}

export async function deleteHorarioAsignacion(horarioId: string): Promise<void> {
  await api.delete(`/horarios-docente/${horarioId}`);
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
