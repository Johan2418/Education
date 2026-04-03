import api from "@/shared/lib/api";
import type {
  CalificarEntregaPorPreguntaRequest,
  CalificarEntregaRequest,
  ConfirmarLibroRequest,
  ConfirmarLibroResponse,
  CreateEntregaRequest,
  CreateTrabajoRequest,
  EntregaDetalleResponse,
  EntregaConCalificacion,
  ExtractLibroAsyncResponse,
  LibroExtractJobStatusResponse,
  ExtractLibroRequest,
  ExtractLibroResponse,
  LibroEstadoResponse,
  LibroObservabilityResponse,
  PaginatedEntregasResponse,
  RevisionLibroRequest,
  TrabajoAnalyticsV2Response,
  TrabajoReporte,
  TrabajoNotificacionesResponse,
  Trabajo,
  TrabajoFormularioResponse,
  TrabajoCalificacion,
  TrabajoCalificacionHistorial,
  TrabajoEntrega,
  UpdateTrabajoRequest,
} from "@/shared/types/trabajos";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8082";

interface ApiData<T> {
  data: T;
}

function normalizeFechaVencimiento(fecha?: string): string | undefined {
  if (!fecha) return undefined;
  const trimmed = fecha.trim();
  if (!trimmed) return undefined;

  // datetime-local inputs come without timezone; convert to ISO for backend time.Time parsing.
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return trimmed;
}

export async function listTrabajosByLeccion(leccionId: string): Promise<Trabajo[]> {
  const res = await api.get<ApiData<Trabajo[]>>(`/lecciones/${leccionId}/trabajos`);
  return res.data || [];
}

export async function createTrabajo(payload: CreateTrabajoRequest): Promise<Trabajo> {
  const normalized: CreateTrabajoRequest = {
    ...payload,
    fecha_vencimiento: normalizeFechaVencimiento(payload.fecha_vencimiento),
  };

  const res = await api.post<ApiData<Trabajo>>("/trabajos", normalized);
  return res.data;
}

export async function updateTrabajo(trabajoId: string, payload: UpdateTrabajoRequest): Promise<Trabajo> {
  const normalized: UpdateTrabajoRequest = {
    ...payload,
    fecha_vencimiento: normalizeFechaVencimiento(payload.fecha_vencimiento),
  };

  const res = await api.put<ApiData<Trabajo>>(`/trabajos/${trabajoId}`, normalized);
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

export async function deleteTrabajo(trabajoId: string): Promise<void> {
  await api.delete<{ message?: string }>(`/trabajos/${trabajoId}`);
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

export async function getTrabajoFormulario(trabajoId: string): Promise<TrabajoFormularioResponse> {
  const res = await api.get<ApiData<TrabajoFormularioResponse>>(`/trabajos/${trabajoId}/formulario`);
  return res.data;
}

export async function getEntregaDetalle(entregaId: string): Promise<EntregaDetalleResponse> {
  const res = await api.get<ApiData<EntregaDetalleResponse>>(`/entregas/${entregaId}/detalle`);
  return res.data;
}

export async function getCalificacionHistorial(entregaId: string): Promise<TrabajoCalificacionHistorial[]> {
  const res = await api.get<ApiData<TrabajoCalificacionHistorial[]>>(`/entregas/${entregaId}/calificacion-historial`);
  return res.data || [];
}

export async function listEntregasByTrabajo(
  trabajoId: string,
  pagination?: { limit?: number; offset?: number }
): Promise<EntregaConCalificacion[]> {
  const params = new URLSearchParams();
  if (pagination?.limit != null) params.set("limit", String(pagination.limit));
  if (pagination?.offset != null) params.set("offset", String(pagination.offset));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await api.get<ApiData<EntregaConCalificacion[] | PaginatedEntregasResponse>>(`/trabajos/${trabajoId}/entregas${suffix}`);

  if (Array.isArray(res.data)) {
    return res.data;
  }
  return res.data?.items || [];
}

export async function getTrabajoReporte(trabajoId: string): Promise<TrabajoReporte> {
  const res = await api.get<ApiData<TrabajoReporte>>(`/trabajos/${trabajoId}/reportes`);
  return res.data;
}

export async function exportEntregasCSV(trabajoId: string): Promise<void> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${BASE_URL}/trabajos/${trabajoId}/entregas/export`, { headers });
  if (!resp.ok) {
    throw new Error("No se pudo exportar el CSV");
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trabajo_${trabajoId}_entregas.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportEntregasXLSX(trabajoId: string): Promise<void> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${BASE_URL}/trabajos/${trabajoId}/entregas/export.xlsx`, { headers });
  if (!resp.ok) {
    throw new Error("No se pudo exportar el XLSX");
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trabajo_${trabajoId}_entregas.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getTrabajoNotificaciones(trabajoId: string): Promise<TrabajoNotificacionesResponse> {
  const res = await api.get<ApiData<TrabajoNotificacionesResponse>>(`/trabajos/${trabajoId}/notificaciones`);
  return res.data;
}

export async function getLibroObservabilidad(trabajoId: string): Promise<LibroObservabilityResponse> {
  const res = await api.get<ApiData<LibroObservabilityResponse>>(`/trabajos/${trabajoId}/libro/observabilidad`);
  return res.data;
}

export async function getTrabajoAnalyticsV2(filters?: {
  curso_id?: string;
  unidad_id?: string;
  tema_id?: string;
  leccion_id?: string;
  estudiante_id?: string;
  from?: string;
  to?: string;
}): Promise<TrabajoAnalyticsV2Response> {
  const params = new URLSearchParams();
  if (filters?.curso_id) params.set("curso_id", filters.curso_id);
  if (filters?.unidad_id) params.set("unidad_id", filters.unidad_id);
  if (filters?.tema_id) params.set("tema_id", filters.tema_id);
  if (filters?.leccion_id) params.set("leccion_id", filters.leccion_id);
  if (filters?.estudiante_id) params.set("estudiante_id", filters.estudiante_id);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await api.get<ApiData<TrabajoAnalyticsV2Response>>(`/trabajos/analytics/v2${suffix}`);
  return res.data;
}

export async function calificarEntrega(entregaId: string, payload: CalificarEntregaRequest): Promise<TrabajoCalificacion> {
  const res = await api.put<ApiData<TrabajoCalificacion>>(`/entregas/${entregaId}/calificar`, payload);
  return res.data;
}

export async function calificarEntregaPorPregunta(entregaId: string, payload: CalificarEntregaPorPreguntaRequest): Promise<EntregaDetalleResponse> {
  const res = await api.put<ApiData<EntregaDetalleResponse>>(`/entregas/${entregaId}/calificar-por-pregunta`, payload);
  return res.data;
}

export async function getLibroEstado(trabajoId: string): Promise<LibroEstadoResponse> {
  const res = await api.get<ApiData<LibroEstadoResponse>>(`/trabajos/${trabajoId}/libro`);
  return res.data;
}

export async function extractLibro(trabajoId: string, payload: ExtractLibroRequest): Promise<ExtractLibroResponse> {
  const res = await api.post<ApiData<ExtractLibroResponse>>(`/trabajos/${trabajoId}/libro/extract`, payload);
  return res.data;
}

export async function extractLibroAsync(trabajoId: string, payload: ExtractLibroRequest): Promise<ExtractLibroAsyncResponse> {
  const res = await api.post<ApiData<ExtractLibroAsyncResponse>>(`/trabajos/${trabajoId}/libro/extract-async`, payload);
  return res.data;
}

export async function getLibroExtractJobStatus(trabajoId: string, jobId: string): Promise<LibroExtractJobStatusResponse> {
  const res = await api.get<ApiData<LibroExtractJobStatusResponse>>(`/trabajos/${trabajoId}/libro/jobs/${jobId}`);
  return res.data;
}

export async function revisarLibro(trabajoId: string, payload: RevisionLibroRequest): Promise<LibroEstadoResponse> {
  const res = await api.put<ApiData<LibroEstadoResponse>>(`/trabajos/${trabajoId}/libro/revision`, payload);
  return res.data;
}

export async function confirmarLibro(trabajoId: string, payload: ConfirmarLibroRequest): Promise<ConfirmarLibroResponse> {
  const res = await api.put<ApiData<ConfirmarLibroResponse>>(`/trabajos/${trabajoId}/libro/confirmar`, payload);
  return res.data;
}
