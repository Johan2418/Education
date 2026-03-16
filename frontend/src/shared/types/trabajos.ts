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
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

export interface EntregaConCalificacion {
  entrega: TrabajoEntrega;
  calificacion?: TrabajoCalificacion;
}

export interface CreateTrabajoRequest {
  leccion_id: string;
  titulo: string;
  descripcion?: string;
  instrucciones?: string;
  fecha_vencimiento?: string;
}

export interface CreateEntregaRequest {
  respuestas: Record<string, unknown>;
  archivo_url?: string;
  comentario?: string;
}

export interface CalificarEntregaRequest {
  puntaje: number;
  feedback?: string;
  sugerencia_ia?: Record<string, unknown>;
}
