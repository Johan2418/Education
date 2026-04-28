import api from "@/shared/lib/api";

export type EstadoLibroRecurso = "pendiente" | "procesando" | "completado" | "error" | "archivado";

export interface LibroRecursoListItem {
  id: string;
  titulo: string;
  descripcion?: string;
  idioma: string;
  paginas_totales?: number;
  estado: EstadoLibroRecurso;
  es_publico: boolean;
  preguntas_totales: number;
  created_at: string;
  updated_at: string;
}

export interface LibroRecursoListResponse {
  items: LibroRecursoListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface LibroRecursoDetailResponse {
  id: string;
  titulo: string;
  descripcion?: string;
  idioma: string;
  paginas_totales?: number;
  estado: EstadoLibroRecurso;
  es_publico: boolean;
  preguntas_totales: number;
  paginas_detectadas: number;
  created_at: string;
  updated_at: string;
}

export interface ViewerWatermarkConfig {
  enabled: boolean;
  text: string;
}

export interface ViewerControls {
  disable_download: boolean;
  disable_print: boolean;
  disable_context_menu: boolean;
}

export interface ViewerPregunta {
  id: string;
  texto: string;
  tipo: string;
  pagina_libro: number | null;
  orden: number;
}

export interface LibroRecursoPaginaResponse {
  libro_recurso_id: string;
  pagina: number;
  total_paginas: number;
  contenido: string;
  imagen_base64?: string;
  preguntas: ViewerPregunta[];
  watermark: ViewerWatermarkConfig;
  controles: ViewerControls;
}

interface ApiData<T> {
  data: T;
}

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface MCPToolCall {
  name: string;
  input?: unknown;
  output_summary?: string;
  duration_ms: number;
}

export interface LibroChatSession {
  id: string;
  libro_recurso_id: string;
  titulo?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
}

export interface LibroChatSessionListResponse {
  items: LibroChatSession[];
  total: number;
  limit: number;
  offset: number;
}

export interface LibroChatMessage {
  id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  tool_name?: string;
  metadata?: Record<string, unknown>;
  model?: string;
  latency_ms?: number;
  used_fallback: boolean;
  created_by?: string;
  created_at: string;
}

export interface CreateLibroChatSessionRequest {
  titulo?: string;
}

export interface ListLibroChatSessionsParams {
  limit?: number;
  offset?: number;
}

export interface ListLibroChatMessagesParams {
  limit?: number;
}

export interface LibroChatSendMessageRequest {
  mensaje: string;
}

export interface LibroChatSendMessageResponse {
  session_id: string;
  recurso_id: string;
  user_message: string;
  answer: string;
  model?: string;
  used_fallback: boolean;
  latency_ms: number;
  tool_calls: MCPToolCall[];
}

export interface LibroChatToolUsage {
  name: string;
  usage_count: number;
}

export interface LibroChatReportResponse {
  recurso_id: string;
  vistas_recurso_total: number;
  usuarios_vistas_total: number;
  ultima_vista_recurso_at?: string;
  sesiones_total: number;
  mensajes_total: number;
  mensajes_usuario: number;
  mensajes_asistente: number;
  fallback_total: number;
  latencia_promedio_ms: number;
  ultimo_mensaje_at?: string;
  top_tools: LibroChatToolUsage[];
}

export interface ListLibroRecursosParams {
  q?: string;
  estado?: EstadoLibroRecurso;
  es_publico?: boolean;
  page?: number;
  page_size?: number;
}

export async function listLibroRecursos(params: ListLibroRecursosParams): Promise<LibroRecursoListResponse> {
  const qp = new URLSearchParams();
  if (params.q) qp.set("q", params.q);
  if (params.estado) qp.set("estado", params.estado);
  if (typeof params.es_publico === "boolean") qp.set("es_publico", String(params.es_publico));
  if (params.page) qp.set("page", String(params.page));
  if (params.page_size) qp.set("page_size", String(params.page_size));

  const suffix = qp.toString() ? `?${qp.toString()}` : "";
  const res = await api.get<ApiData<LibroRecursoListResponse>>(`/libro-recursos${suffix}`);
  return res.data;
}

export async function getLibroRecursoDetalle(recursoId: string): Promise<LibroRecursoDetailResponse> {
  const res = await api.get<ApiData<LibroRecursoDetailResponse>>(`/libro-recursos/${recursoId}`);
  return res.data;
}

export async function getLibroRecursoPagina(recursoId: string, pagina: number): Promise<LibroRecursoPaginaResponse> {
  const res = await api.get<ApiData<LibroRecursoPaginaResponse>>(`/libro-recursos/${recursoId}/paginas/${pagina}`);
  return res.data;
}

export async function listLibroChatSesiones(
  recursoId: string,
  params: ListLibroChatSessionsParams = {},
): Promise<LibroChatSessionListResponse> {
  const qp = new URLSearchParams();
  if (params.limit) qp.set("limit", String(params.limit));
  if (typeof params.offset === "number") qp.set("offset", String(params.offset));

  const suffix = qp.toString() ? `?${qp.toString()}` : "";
  const res = await api.get<ApiData<LibroChatSessionListResponse>>(`/libro-recursos/${recursoId}/chat/sesiones${suffix}`);
  return res.data;
}

export async function createLibroChatSesion(
  recursoId: string,
  payload: CreateLibroChatSessionRequest = {},
): Promise<LibroChatSession> {
  const res = await api.post<ApiData<LibroChatSession>>(`/libro-recursos/${recursoId}/chat/sesiones`, payload);
  return res.data;
}

export async function listLibroChatMensajes(
  recursoId: string,
  sesionId: string,
  params: ListLibroChatMessagesParams = {},
): Promise<LibroChatMessage[]> {
  const qp = new URLSearchParams();
  if (params.limit) qp.set("limit", String(params.limit));

  const suffix = qp.toString() ? `?${qp.toString()}` : "";
  const res = await api.get<ApiData<LibroChatMessage[]>>(`/libro-recursos/${recursoId}/chat/sesiones/${sesionId}/mensajes${suffix}`);
  return res.data;
}

export async function sendLibroChatMensaje(
  recursoId: string,
  sesionId: string,
  payload: LibroChatSendMessageRequest,
): Promise<LibroChatSendMessageResponse> {
  const res = await api.post<ApiData<LibroChatSendMessageResponse>>(
    `/libro-recursos/${recursoId}/chat/sesiones/${sesionId}/mensajes`,
    payload,
  );
  return res.data;
}

export async function getLibroChatReporte(recursoId: string, topToolsLimit = 5): Promise<LibroChatReportResponse> {
  const qp = new URLSearchParams();
  qp.set("top_tools_limit", String(topToolsLimit));

  const res = await api.get<ApiData<LibroChatReportResponse>>(
    `/libro-recursos/${recursoId}/chat/reportes?${qp.toString()}`,
  );
  return res.data;
}
