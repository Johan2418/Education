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
  descripcion: string;
  nivel: string;
  thumbnail_url: string | null;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface LeccionSeccion {
  id: string;
  leccion_id: string;
  tipo: string;
  contenido: string;
  orden: number;
  bloqueado: boolean;
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
