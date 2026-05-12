// Matches Go backend evaluations/model.go
export interface Prueba {
  id: string;
  materia_id?: string | null;
  leccion_id: string | null;
  titulo: string;
  descripcion?: string | null;
  orden: number;
  tiempo_limite: number | null;
  nota_maxima: number;
  peso_calificacion: number;
  puntaje_minimo: number;
  activa?: boolean;
  fecha_publicacion?: string | null;
  fecha_activacion?: string | null;
  mostrar_resultado_inmediato?: boolean;
  requiere_revision_docente?: boolean;
  creado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PruebaConLeccion extends Prueba {
  leccion_titulo?: string;
  materia_id?: string;
  materia_nombre?: string;
}

export interface Pregunta {
  id: string;
  prueba_id: string;
  texto: string;
  tipo: "opcion_multiple" | "verdadero_falso" | "respuesta_corta" | "completar";
  puntaje_maximo: number;
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
  puntaje_obtenido: number;
  aprobado: boolean;
  respuestas: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  calificado_por_docente?: boolean;
  calificado_by?: string | null;
  calificado_at?: string | null;
  feedback_docente?: string | null;
  mostrar_puntaje_estudiante?: boolean;
  created_at: string;
  puntaje?: number;
  respuestas_json?: Record<string, unknown> | null;
}

export interface Progreso {
  id: string;
  leccion_id: string;
  usuario_id: string;
  completado: boolean;
  puntaje: number | null;
  updated_at: string;
}

export interface ProgresoSeccion {
  id: string;
  user_id: string;
  leccion_seccion_id: string;
  seccion_id?: string;
  usuario_id: string;
  completado: boolean;
  puntuacion: number | null;
  tiempo_dedicado: number;
  intentos: number;
  created_at: string;
  updated_at: string;
}

// Composite type for a full Prueba with questions and answers
export interface PruebaCompleta extends Prueba {
  preguntas: (Pregunta & { respuestas: Respuesta[] })[];
}
