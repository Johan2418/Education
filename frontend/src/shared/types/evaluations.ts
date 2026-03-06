// Matches Go backend evaluations/model.go
export interface Prueba {
  id: string;
  leccion_id: string;
  titulo: string;
  descripcion: string;
  orden: number;
  tiempo_limite: number | null;
  puntaje_minimo: number;
  activa: boolean;
  creado_por: string;
  created_at: string;
  updated_at: string;
}

export interface Pregunta {
  id: string;
  prueba_id: string;
  texto: string;
  tipo: "opcion_multiple" | "verdadero_falso";
  orden: number;
  created_at: string;
}

export interface Respuesta {
  id: string;
  pregunta_id: string;
  texto: string;
  es_correcta: boolean;
  orden: number;
}

export interface ResultadoPrueba {
  id: string;
  prueba_id: string;
  usuario_id: string;
  puntaje: number;
  respuestas_json: Record<string, unknown> | null;
  created_at: string;
}

export interface Progreso {
  id: string;
  leccion_id: string;
  usuario_id: string;
  completado: boolean;
  puntaje: number;
  updated_at: string;
}

export interface ProgresoSeccion {
  id: string;
  leccion_id: string;
  seccion_id: string;
  usuario_id: string;
  completado: boolean;
  updated_at: string;
}

// Composite type for a full Prueba with questions and answers
export interface PruebaCompleta extends Prueba {
  preguntas: (Pregunta & { respuestas: Respuesta[] })[];
}
