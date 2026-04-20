// Matches Go backend academic/model.go
export interface Curso {
  id: string;
  nombre: string;
  descripcion: string;
  codigo: string;
  teacher_id: string | null;
  activo: boolean;
  creado_por: string;
  created_at: string;
  updated_at: string;
}

export interface Materia {
  id: string;
  curso_id: string;
  anio_escolar?: string;
  nombre: string;
  descripcion: string;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface Unidad {
  id: string;
  materia_id: string;
  nombre: string;
  descripcion: string;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface Tema {
  id: string;
  unidad_id: string;
  nombre: string;
  descripcion: string;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface Leccion {
  id: string;
  tema_id: string;
  titulo: string;
  descripcion: string | null;
  nivel?: string | null;
  thumbnail_url: string | null;
  orden: number;
  activo?: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeccionSeccion {
  id: string;
  leccion_id: string;
  tipo: string;
  recurso_id?: string | null;
  trabajo_id?: string | null;
  prueba_id?: string | null;
  foro_id?: string | null;
  modelo_id?: string | null;
  actividad_interactiva_id?: string | null;
  estado_publicacion?: "borrador" | "programado" | "publicado" | "despublicado";
  publicado_desde?: string | null;
  programado_para?: string | null;
  visible?: boolean;
  visible_desde?: string | null;
  visible_hasta?: string | null;
  anio_escolar?: string | null;
  nota_maxima?: number;
  peso_calificacion?: number;
  calificable?: boolean;
  orden: number;
  es_obligatorio?: boolean;
  requisitos?: string[];
  contenido?: string;
  bloqueado?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Foro {
  id: string;
  leccion_id: string;
  titulo: string;
  descripcion?: string | null;
  activo: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForoHilo {
  id: string;
  foro_id: string;
  titulo: string;
  contenido?: string | null;
  imagen_url?: string | null;
  fijado: boolean;
  cerrado: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForoMensaje {
  id: string;
  hilo_id: string;
  parent_mensaje_id?: string | null;
  contenido?: string | null;
  imagen_url?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeccionVideoProgreso {
  id: string;
  user_id: string;
  leccion_seccion_id: string;
  youtube_video_id: string;
  watched_seconds: number;
  total_seconds?: number | null;
  porcentaje_visto: number;
  completado: boolean;
  first_seen_at?: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface LeccionSeccionGatingPDF {
  leccion_seccion_id: string;
  habilitado: boolean;
  seccion_preguntas_id?: string | null;
  puntaje_minimo: number;
  requiere_responder_todas: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActividadInteractiva {
  id: string;
  leccion_id: string;
  titulo: string;
  descripcion?: string | null;
  proveedor: "h5p" | "genially" | "educaplay";
  embed_url: string;
  regla_completitud: "manual" | "evento" | "puntaje";
  puntaje_maximo: number;
  intentos_maximos?: number | null;
  configuracion: Record<string, unknown>;
  activo: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActividadInteractivaIntento {
  id: string;
  actividad_id: string;
  user_id: string;
  completado: boolean;
  score_obtenido?: number | null;
  score_normalizado?: number | null;
  tiempo_dedicado: number;
  intentos: number;
  metadata: Record<string, unknown>;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MateriaSeguimiento {
  id: string;
  materia_id: string;
  usuario_id: string;
  created_at: string;
}

export interface EstudianteCursoDetail {
  id: string;
  estudiante_id: string;
  curso_id: string;
  anio_escolar: string | null;
  display_name: string | null;
  email: string;
  created_at: string;
}

export interface DocenteMateriaAsignacion {
  id: string;
  docente_id: string;
  docente_nombre?: string | null;
  docente_email?: string | null;
  materia_id: string;
  materia_nombre?: string;
  curso_id: string;
  curso_nombre?: string;
  anio_escolar: string;
  activo: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MisCursoDocente {
  asignacion_id: string;
  docente_id: string;
  materia_id: string;
  materia_nombre: string;
  curso_id: string;
  curso_nombre: string;
  anio_escolar: string;
  total_estudiantes: number;
  total_lecciones: number;
  total_trabajos: number;
}

export interface DocenteMateriaHorario {
  id: string;
  asignacion_id: string;
  docente_id: string;
  materia_id: string;
  materia_nombre: string;
  curso_id: string;
  curso_nombre: string;
  anio_escolar: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  aula?: string | null;
  activo: boolean;
}

export interface DocenteMateriaHorarioRequest {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  aula?: string | null;
  activo?: boolean;
}

export interface CursoAnioMateriaDocenteInput {
  materia_origen_id: string;
  docente_id: string;
  activo?: boolean;
}

export interface CursoAnioAsignarMaestrosRequest {
  anio_escolar_destino: string;
  anio_escolar_origen?: string;
  asignaciones: CursoAnioMateriaDocenteInput[];
}

export interface CursoAnioAsignarMaestrosDetalle {
  materia_origen_id: string;
  materia_destino_id: string;
  materia_nombre: string;
  docente_id: string;
  accion: "creada" | "actualizada" | "sin_cambios";
}

export interface CursoAnioAsignarMaestrosResult {
  curso_id: string;
  anio_escolar_origen: string;
  anio_escolar_destino: string;
  materias_origen: number;
  materias_clonadas: number;
  materias_existentes: number;
  asignaciones_creadas: number;
  asignaciones_actualizadas: number;
  asignaciones_sin_cambios: number;
  detalle: CursoAnioAsignarMaestrosDetalle[];
}
