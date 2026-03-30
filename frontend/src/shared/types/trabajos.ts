export type EstadoTrabajo = "borrador" | "publicado" | "cerrado";
export type EstadoEntregaTrabajo = "enviada" | "revisada" | "calificada";

export interface Trabajo {
  id: string;
  leccion_id: string;
  titulo: string;
  descripcion: string | null;
  instrucciones: string | null;
  fecha_vencimiento: string | null;
  estado: EstadoTrabajo;
  extraido_de_libro?: boolean;
  id_extraccion?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoExtraccionLibro =
  | "pendiente"
  | "extrayendo"
  | "completado"
  | "en_revision"
  | "aprobado"
  | "cancelado";

export interface LibroExtraccion {
  id: string;
  trabajo_id: string;
  archivo_url: string | null;
  idioma: string;
  pagina_inicio: number;
  pagina_fin: number | null;
  estado: EstadoExtraccionLibro;
  preguntas_detectadas: number;
  confianza_promedio: number | null;
  notas_extraccion: string | null;
  notas_revision: string | null;
  usado_fallback: boolean;
  created_by: string | null;
  revisado_por: string | null;
  confirmado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrabajoPregunta {
  id: string;
  trabajo_id: string;
  texto: string;
  tipo: "opcion_multiple" | "verdadero_falso" | "respuesta_corta" | "completar";
  opciones: string[];
  pagina_libro: number | null;
  confianza_ia: number | null;
  imagen_base64?: string | null;
  imagen_fuente?: string | null;
  respuesta_esperada_tipo?: "abierta" | "opciones" | null;
  placeholder?: string | null;
  orden: number;
  created_at: string;
}

export interface LibroEstadoResponse {
  extraccion: LibroExtraccion | null;
  preguntas: TrabajoPregunta[];
}

export interface ExtractLibroRequest {
  archivo_url?: string;
  contenido: string;
  hash_archivo?: string;
  hash_contenido?: string;
  pagina_inicio?: number;
  pagina_fin?: number;
  idioma?: string;
  max_preguntas?: number;
  imagenes_por_pagina?: Record<string, string>;
  imagenes_metadata_por_pagina?: Record<string, PdfPaginaMetadata>;
}

export interface PdfTextoRegion {
  texto: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPaginaMetadata {
  image_width: number;
  image_height: number;
  text_regions: PdfTextoRegion[];
}

export interface LibroPreguntaInput {
  id?: string;
  texto: string;
  tipo: "opcion_multiple" | "verdadero_falso" | "respuesta_corta" | "completar";
  opciones?: string[];
  pagina_libro?: number;
  confianza_ia?: number;
  imagen_base64?: string;
  imagen_fuente?: string;
  imagen_manual_override?: boolean;
  respuesta_esperada_tipo?: "abierta" | "opciones";
  placeholder?: string;
  orden: number;
}

export interface RevisionLibroRequest {
  preguntas: LibroPreguntaInput[];
  notas_revision?: string;
  aprobar: boolean;
}

export interface ConfirmarLibroRequest {
  publicar: boolean;
  notas_finales?: string;
}

export interface ExtractLibroResponse {
  extraccion: LibroExtraccion;
  preguntas: TrabajoPregunta[];
}

export interface ConfirmarLibroResponse {
  trabajo: Trabajo;
  extraccion: LibroExtraccion;
}

export type EstadoExtraccionJob = "pendiente" | "en_progreso" | "completado" | "error";

export interface ExtractLibroAsyncResponse {
  job_id: string;
  trabajo_id: string;
  estado: EstadoExtraccionJob;
  progress: number;
  message: string;
}

export interface LibroExtractJobStatusResponse {
  job_id: string;
  trabajo_id: string;
  estado: EstadoExtraccionJob;
  progress: number;
  message: string;
  error?: string;
  error_type?: string;
  error_message?: string;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  failed_at?: string;
  duration_ms: number;
  result?: ExtractLibroResponse;
}

export interface TrabajoEntrega {
  id: string;
  trabajo_id: string;
  estudiante_id: string;
  respuestas: Record<string, unknown>;
  archivo_url: string | null;
  comentario: string | null;
  estado: EstadoEntregaTrabajo;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface TrabajoRespuestaPregunta {
  id: string;
  entrega_id: string;
  pregunta_id: string;
  respuesta_texto: string | null;
  respuesta_opcion: string | null;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface TrabajoCalificacion {
  id: string;
  entrega_id: string;
  docente_id: string;
  puntaje: number;
  feedback: string | null;
  sugerencia_ia: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TrabajoCalificacionPregunta {
  id: string;
  calificacion_id: string;
  pregunta_id: string;
  puntaje: number;
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntregaConCalificacion {
  entrega: TrabajoEntrega;
  calificacion?: TrabajoCalificacion;
  estudiante_nombre?: string;
  estudiante_email?: string;
}

export interface PaginatedEntregasResponse {
  items: EntregaConCalificacion[];
  total: number;
  limit: number;
  offset: number;
  has_next: boolean;
}

export interface TrabajoReporte {
  trabajo_id: string;
  total_entregas: number;
  total_calificadas: number;
  total_pendientes: number;
  promedio_puntaje: number | null;
  ultima_entrega_at: string | null;
}

export interface NotificationEventMetric {
  sent: number;
  failed: number;
  last_sent: string | null;
  last_error: string | null;
}

export interface TrabajoNotificacionesResponse {
  trabajo_id: string;
  events: Record<string, NotificationEventMetric>;
}

export interface LibroObservabilityResponse {
  trabajo_id: string;
  extract_total: number;
  fallback_total: number;
  error_total: number;
  average_latency_ms: number;
  last_latency_ms: number;
  last_duration_ms: number;
  last_error: string | null;
  last_error_type?: string | null;
  error_by_type?: Record<string, number>;
  last_event_at: string | null;
}

export interface TrabajoAnalyticsSummary {
  total_trabajos: number;
  total_entregas: number;
  total_calificadas: number;
  promedio_puntaje: number | null;
  estudiantes_activos: number;
}

export interface CursoAnalyticsItem {
  curso_id: string;
  curso_nombre: string;
  total_trabajos: number;
  total_entregas: number;
  total_calificadas: number;
  promedio_puntaje: number | null;
  estudiantes_activos: number;
}

export interface LeccionAnalyticsItem {
  leccion_id: string;
  leccion_titulo: string;
  curso_id: string;
  curso_nombre: string;
  total_trabajos: number;
  total_entregas: number;
  total_calificadas: number;
  promedio_puntaje: number | null;
  estudiantes_activos: number;
}

export interface EstudianteAnalyticsItem {
  estudiante_id: string;
  estudiante_nombre: string | null;
  estudiante_email: string | null;
  curso_id: string;
  curso_nombre: string;
  leccion_id: string;
  leccion_titulo: string;
  total_entregas: number;
  total_calificadas: number;
  promedio_puntaje: number | null;
  ultima_entrega_at: string | null;
}

export interface TrabajoAnalyticsV2Response {
  scope: {
    curso_id?: string;
    leccion_id?: string;
    estudiante_id?: string;
    from?: string;
    to?: string;
    teacher_id?: string;
  };
  summary: TrabajoAnalyticsSummary;
  cursos: CursoAnalyticsItem[];
  lecciones: LeccionAnalyticsItem[];
  estudiantes: EstudianteAnalyticsItem[];
  generated_at: string;
}

export interface CreateTrabajoRequest {
  leccion_id: string;
  titulo: string;
  descripcion?: string;
  instrucciones?: string;
  fecha_vencimiento?: string;
}

export type UpdateTrabajoRequest = Omit<CreateTrabajoRequest, "leccion_id">;

export interface CreateEntregaRequest {
  respuestas?: Record<string, unknown>;
  respuestas_preguntas?: CreateEntregaPreguntaRespuesta[];
  archivo_url?: string;
  comentario?: string;
}

export interface CreateEntregaPreguntaRespuesta {
  pregunta_id: string;
  respuesta_texto?: string;
  respuesta_opcion?: string;
}

export interface CalificarEntregaRequest {
  puntaje: number;
  feedback?: string;
  sugerencia_ia?: Record<string, unknown>;
}

export interface CalificarEntregaPreguntaItem {
  pregunta_id: string;
  puntaje: number;
  feedback?: string;
}

export interface CalificarEntregaPorPreguntaRequest {
  items: CalificarEntregaPreguntaItem[];
  feedback?: string;
  sugerencia_ia?: Record<string, unknown>;
}

export interface TrabajoFormularioResponse {
  trabajo: Trabajo;
  preguntas: TrabajoPregunta[];
  mi_entrega?: TrabajoEntrega;
  respuestas_preguntas: TrabajoRespuestaPregunta[];
}

export interface EntregaDetalleResponse {
  trabajo: Trabajo;
  entrega: TrabajoEntrega;
  preguntas: TrabajoPregunta[];
  respuestas_preguntas: TrabajoRespuestaPregunta[];
  calificacion?: TrabajoCalificacion;
  calificaciones_pregunta: TrabajoCalificacionPregunta[];
}
