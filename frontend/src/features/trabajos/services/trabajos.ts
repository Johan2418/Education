import api from "@/shared/lib/api";
import type {
  CalificarEntregaRequest,
  CreateEntregaRequest,
  CreateTrabajoRequest,
  EntregaConCalificacion,
  Trabajo,
  TrabajoCalificacion,
  TrabajoEntrega,
} from "@/shared/types/trabajos";

interface ApiData<T> {
  data: T;
}

export async function listTrabajosByLeccion(leccionId: string): Promise<Trabajo[]> {
  const res = await api.get<ApiData<Trabajo[]>>(`/lecciones/${leccionId}/trabajos`);
  return res.data || [];
}

export async function createTrabajo(payload: CreateTrabajoRequest): Promise<Trabajo> {
  const res = await api.post<ApiData<Trabajo>>("/trabajos", payload);
  return res.data;
}

export async function publicarTrabajo(trabajoId: string): Promise<Trabajo> {
  const res = await api.put<ApiData<Trabajo>>(`/trabajos/${trabajoId}/publicar`);
  return res.data;
}

export async function cerrarTrabajo(trabajoId: string): Promise<Trabajo> {
  const res = await api.put<ApiData<Trabajo>>(`/trabajos/${trabajoId}/cerrar`);
  return res.data;
}

export async function getTrabajo(trabajoId: string): Promise<Trabajo> {
  const res = await api.get<ApiData<Trabajo>>(`/trabajos/${trabajoId}`);
  return res.data;
}

export async function listMisTrabajos(): Promise<Trabajo[]> {
  const res = await api.get<ApiData<Trabajo[]>>("/mis-trabajos");
  return res.data || [];
}

export async function upsertEntrega(trabajoId: string, payload: CreateEntregaRequest): Promise<TrabajoEntrega> {
  const res = await api.post<ApiData<TrabajoEntrega>>(`/trabajos/${trabajoId}/entregas`, payload);
  return res.data;
}

export async function getMiEntrega(trabajoId: string): Promise<TrabajoEntrega | null> {
  const res = await api.get<ApiData<TrabajoEntrega | null>>(`/trabajos/${trabajoId}/mi-entrega`);
  return res.data ?? null;
}

export async function updateEntrega(entregaId: string, payload: CreateEntregaRequest): Promise<TrabajoEntrega> {
  const res = await api.put<ApiData<TrabajoEntrega>>(`/entregas/${entregaId}`, payload);
  return res.data;
}

export async function listEntregasByTrabajo(trabajoId: string): Promise<EntregaConCalificacion[]> {
  const res = await api.get<ApiData<EntregaConCalificacion[]>>(`/trabajos/${trabajoId}/entregas`);
  return res.data || [];
}

export async function calificarEntrega(entregaId: string, payload: CalificarEntregaRequest): Promise<TrabajoCalificacion> {
  const res = await api.put<ApiData<TrabajoCalificacion>>(`/entregas/${entregaId}/calificar`, payload);
  return res.data;
}
