// Matches Go backend resources/model.go
export interface Recurso {
  id: string;
  titulo: string;
  tipo: string;
  url: string | null;
  contenido_html: string | null;
  metadata: Record<string, unknown> | null;
  creado_por: string;
  created_at: string;
  updated_at: string;
}

export interface ModeloRA {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  archivo_url: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
  creado_por: string;
  created_at: string;
  updated_at: string;
}
