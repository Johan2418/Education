import { api } from "@/shared/lib/api";

interface ApiData<T> {
  data: T;
}

export type RecursoPersonalTipo =
  | "presentacion"
  | "documento"
  | "video_url"
  | "enlace"
  | "html_embed"
  | "texto";

export interface RecursoPersonal {
  id: string;
  owner_teacher_id: string;
  titulo: string;
  descripcion?: string | null;
  tipo: RecursoPersonalTipo;
  url?: string | null;
  html_contenido?: string | null;
  texto_contenido?: string | null;
  tags: string[];
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecursoPersonalPayload {
  titulo: string;
  descripcion?: string | null;
  tipo: RecursoPersonalTipo;
  url?: string | null;
  html_contenido?: string | null;
  texto_contenido?: string | null;
  tags?: string[];
  activo?: boolean;
}

export interface ListRecursosPersonalesParams {
  q?: string;
  tipo?: RecursoPersonalTipo;
  activo?: boolean;
}

function toQueryString(params: ListRecursosPersonalesParams): string {
  const search = new URLSearchParams();
  if (params.q && params.q.trim()) {
    search.set("q", params.q.trim());
  }
  if (params.tipo) {
    search.set("tipo", params.tipo);
  }
  if (typeof params.activo === "boolean") {
    search.set("activo", String(params.activo));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listRecursosPersonales(params: ListRecursosPersonalesParams = {}): Promise<RecursoPersonal[]> {
  const res = await api.get<ApiData<RecursoPersonal[]>>(`/recursos-personales${toQueryString(params)}`);
  return res.data || [];
}

export async function getRecursoPersonal(recursoPersonalId: string): Promise<RecursoPersonal> {
  const res = await api.get<ApiData<RecursoPersonal>>(`/recursos-personales/${recursoPersonalId}`);
  return res.data;
}

export async function createRecursoPersonal(payload: RecursoPersonalPayload): Promise<RecursoPersonal> {
  const res = await api.post<ApiData<RecursoPersonal>>("/recursos-personales", payload);
  return res.data;
}

export async function updateRecursoPersonal(recursoPersonalId: string, payload: RecursoPersonalPayload): Promise<RecursoPersonal> {
  const res = await api.put<ApiData<RecursoPersonal>>(`/recursos-personales/${recursoPersonalId}`, payload);
  return res.data;
}

export async function deleteRecursoPersonal(recursoPersonalId: string): Promise<void> {
  await api.delete<ApiData<{ message: string }>>(`/recursos-personales/${recursoPersonalId}`);
}

export async function listMateriaRecursosPersonales(materiaId: string): Promise<RecursoPersonal[]> {
  const res = await api.get<ApiData<RecursoPersonal[]>>(`/materias/${materiaId}/recursos-personales`);
  return res.data || [];
}

export async function attachRecursoPersonalToMateria(materiaId: string, recursoPersonalId: string): Promise<void> {
  await api.post<ApiData<{ message: string }>>(`/materias/${materiaId}/recursos-personales/${recursoPersonalId}`);
}

export async function detachRecursoPersonalFromMateria(materiaId: string, recursoPersonalId: string): Promise<void> {
  await api.delete<ApiData<{ message: string }>>(`/materias/${materiaId}/recursos-personales/${recursoPersonalId}`);
}

export async function listSeccionRecursosPersonales(seccionId: string): Promise<RecursoPersonal[]> {
  const res = await api.get<ApiData<RecursoPersonal[]>>(`/secciones/${seccionId}/recursos-personales`);
  return res.data || [];
}

export async function attachRecursoPersonalToSeccion(seccionId: string, recursoPersonalId: string): Promise<void> {
  await api.post<ApiData<{ message: string }>>(`/secciones/${seccionId}/recursos-personales/${recursoPersonalId}`);
}

export async function detachRecursoPersonalFromSeccion(seccionId: string, recursoPersonalId: string): Promise<void> {
  await api.delete<ApiData<{ message: string }>>(`/secciones/${seccionId}/recursos-personales/${recursoPersonalId}`);
}

export async function listTrabajoRecursosPersonales(trabajoId: string): Promise<RecursoPersonal[]> {
  const res = await api.get<ApiData<RecursoPersonal[]>>(`/trabajos/${trabajoId}/recursos-personales`);
  return res.data || [];
}

export async function attachRecursoPersonalToTrabajo(trabajoId: string, recursoPersonalId: string): Promise<void> {
  await api.post<ApiData<{ message: string }>>(`/trabajos/${trabajoId}/recursos-personales/${recursoPersonalId}`);
}

export async function detachRecursoPersonalFromTrabajo(trabajoId: string, recursoPersonalId: string): Promise<void> {
  await api.delete<ApiData<{ message: string }>>(`/trabajos/${trabajoId}/recursos-personales/${recursoPersonalId}`);
}
