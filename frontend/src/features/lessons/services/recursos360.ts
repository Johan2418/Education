import { api } from "@/shared/lib/api";
import type {
  Foro,
  ForoHilo,
  ForoMensaje,
  LeccionSeccion,
  LeccionSeccionGatingPDF,
  LeccionVideoProgreso,
} from "@/shared/types";

interface ApiData<T> {
  data: T;
}

export interface CreateForoHiloPayload {
  titulo: string;
  contenido?: string;
  imagen_url?: string;
}

export interface CreateForoMensajePayload {
  parent_mensaje_id?: string;
  contenido?: string;
  imagen_url?: string;
}

export interface UpsertVideoProgresoPayload {
  leccion_seccion_id: string;
  youtube_video_id: string;
  watched_seconds?: number;
  total_seconds?: number;
  porcentaje_visto?: number;
}

export interface UpsertGatingPdfPayload {
  habilitado?: boolean;
  seccion_preguntas_id?: string;
  puntaje_minimo?: number;
  requiere_responder_todas?: boolean;
}

export interface UpdateLeccionSeccionPayload {
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
  orden?: number;
  es_obligatorio?: boolean;
  requisitos?: string[];
}

export interface PatchLeccionSeccionLifecyclePayload {
  estado_publicacion?: "borrador" | "programado" | "publicado" | "despublicado";
  publicado_desde?: string | null;
  programado_para?: string | null;
  visible?: boolean;
  visible_desde?: string | null;
  visible_hasta?: string | null;
  anio_escolar?: string | null;
}

export interface RecursoDetalle {
  id: string;
  titulo: string;
  descripcion?: string;
  tipo: string;
  archivo_url?: string;
  texto_html?: string;
}

export async function getRecursoDetalle(recursoId: string): Promise<RecursoDetalle> {
  const res = await api.get<ApiData<RecursoDetalle>>(`/recursos/${recursoId}`);
  return res.data;
}

export async function listForosByLeccion(leccionId: string): Promise<Foro[]> {
  const res = await api.get<ApiData<Foro[]>>(`/lecciones/${leccionId}/foros`);
  return res.data;
}

export async function listForoHilos(foroId: string): Promise<ForoHilo[]> {
  const res = await api.get<ApiData<ForoHilo[]>>(`/foros/${foroId}/hilos`);
  return res.data;
}

export async function createForoHilo(foroId: string, payload: CreateForoHiloPayload): Promise<ForoHilo> {
  const res = await api.post<ApiData<ForoHilo>>(`/foros/${foroId}/hilos`, payload);
  return res.data;
}

export async function listForoMensajes(hiloId: string): Promise<ForoMensaje[]> {
  const res = await api.get<ApiData<ForoMensaje[]>>(`/hilos/${hiloId}/mensajes`);
  return res.data;
}

export async function createForoMensaje(hiloId: string, payload: CreateForoMensajePayload): Promise<ForoMensaje> {
  const res = await api.post<ApiData<ForoMensaje>>(`/hilos/${hiloId}/mensajes`, payload);
  return res.data;
}

export async function upsertVideoProgreso(payload: UpsertVideoProgresoPayload): Promise<LeccionVideoProgreso> {
  const res = await api.put<ApiData<LeccionVideoProgreso>>(`/video-progreso`, payload);
  return res.data;
}

export async function listVideoProgreso(leccionId: string): Promise<LeccionVideoProgreso[]> {
  const res = await api.get<ApiData<LeccionVideoProgreso[]>>(`/lecciones/${leccionId}/video-progreso`);
  return res.data;
}

export async function updateLeccionSeccion(seccionId: string, payload: UpdateLeccionSeccionPayload): Promise<LeccionSeccion> {
  const res = await api.put<ApiData<LeccionSeccion>>(`/secciones/${seccionId}`, payload);
  return res.data;
}

export async function patchLeccionSeccionLifecycle(
  seccionId: string,
  payload: PatchLeccionSeccionLifecyclePayload,
): Promise<LeccionSeccion> {
  const res = await api.patch<ApiData<LeccionSeccion>>(`/secciones/${seccionId}/lifecycle`, payload);
  return res.data;
}

export async function getSeccionGatingPdf(seccionId: string): Promise<LeccionSeccionGatingPDF | null> {
  try {
    const res = await api.get<ApiData<LeccionSeccionGatingPDF>>(`/secciones/${seccionId}/gating-pdf`);
    return res.data;
  } catch (err) {
    if (typeof err === "object" && err !== null && "status" in err && (err as { status?: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function upsertSeccionGatingPdf(seccionId: string, payload: UpsertGatingPdfPayload): Promise<LeccionSeccionGatingPDF> {
  const res = await api.put<ApiData<LeccionSeccionGatingPDF>>(`/secciones/${seccionId}/gating-pdf`, payload);
  return res.data;
}
