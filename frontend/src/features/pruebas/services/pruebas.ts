import api from "@/shared/lib/api";
import type { Prueba, PruebaConLeccion, PruebaCompleta, Pregunta, Respuesta, ResultadoPrueba } from "@/shared/types";

interface ApiEnvelope<T> {
  data: T;
}

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

export async function listPruebasByLeccion(leccionId: string): Promise<Prueba[]> {
  const res = await api.get<Prueba[] | ApiEnvelope<Prueba[]>>(`/lecciones/${leccionId}/pruebas`);
  return unwrapApiData(res) || [];
}

export async function listMisPruebasEstudiante(): Promise<PruebaConLeccion[]> {
  const res = await api.get<PruebaConLeccion[] | ApiEnvelope<PruebaConLeccion[]>>(`/student/pruebas`);
  return unwrapApiData(res) || [];
}

export async function getPrueba(id: string): Promise<Prueba> {
  const res = await api.get<Prueba | ApiEnvelope<Prueba>>(`/pruebas/${id}`);
  return unwrapApiData(res);
}

export async function getPruebaCompleta(id: string): Promise<PruebaCompleta> {
  const res = await api.get<PruebaCompleta | ApiEnvelope<PruebaCompleta>>(`/pruebas/${id}/completa`);
  return unwrapApiData(res);
}

export async function createPrueba(payload: Partial<Prueba>): Promise<Prueba> {
  const res = await api.post<Prueba | ApiEnvelope<Prueba>>("/pruebas", payload);
  return unwrapApiData(res);
}

export async function updatePrueba(id: string, payload: Partial<Prueba>): Promise<Prueba> {
  const res = await api.put<Prueba | ApiEnvelope<Prueba>>(`/pruebas/${id}`, payload);
  return unwrapApiData(res);
}

export async function deletePrueba(id: string): Promise<void> {
  return api.delete(`/pruebas/${id}`);
}

export async function listPreguntas(pruebaId: string): Promise<Pregunta[]> {
  const res = await api.get<Pregunta[] | ApiEnvelope<Pregunta[]>>(`/pruebas/${pruebaId}/preguntas`);
  return unwrapApiData(res) || [];
}

export async function createPregunta(payload: Partial<Pregunta>): Promise<Pregunta> {
  const res = await api.post<Pregunta | ApiEnvelope<Pregunta>>("/preguntas", payload);
  return unwrapApiData(res);
}

export async function updatePregunta(id: string, payload: Partial<Pregunta>): Promise<Pregunta> {
  const res = await api.put<Pregunta | ApiEnvelope<Pregunta>>(`/preguntas/${id}`, payload);
  return unwrapApiData(res);
}

export async function deletePregunta(id: string): Promise<void> {
  return api.delete(`/preguntas/${id}`);
}

export async function createRespuesta(payload: Partial<Respuesta>): Promise<Respuesta> {
  const res = await api.post<Respuesta | ApiEnvelope<Respuesta>>("/respuestas", payload);
  return unwrapApiData(res);
}

export async function updateRespuesta(id: string, payload: Partial<Respuesta>): Promise<Respuesta> {
  const res = await api.put<Respuesta | ApiEnvelope<Respuesta>>(`/respuestas/${id}`, payload);
  return unwrapApiData(res);
}

export async function deleteRespuesta(id: string): Promise<void> {
  return api.delete(`/respuestas/${id}`);
}

export async function submitResultado(payload: Partial<ResultadoPrueba>): Promise<ResultadoPrueba> {
  const res = await api.post<ResultadoPrueba | ApiEnvelope<ResultadoPrueba>>("/resultados", payload);
  return unwrapApiData(res);
}

export async function listResultadosByPrueba(pruebaId: string): Promise<ResultadoPrueba[]> {
  const res = await api.get<ResultadoPrueba[] | ApiEnvelope<ResultadoPrueba[]>>(`/pruebas/${pruebaId}/resultados`);
  return unwrapApiData(res) || [];
}

export async function calificarResultado(
  resultadoId: string,
  payload: {
    puntaje_obtenido?: number;
    aprobado?: boolean;
    feedback_docente?: string;
    mostrar_puntaje_estudiante?: boolean;
  }
): Promise<ResultadoPrueba> {
  const res = await api.put<ResultadoPrueba | ApiEnvelope<ResultadoPrueba>>(`/resultados/${resultadoId}/calificar`, payload);
  return unwrapApiData(res);
}

export async function listMisResultados(pruebaId: string): Promise<ResultadoPrueba[]> {
  const res = await api.get<ResultadoPrueba[] | ApiEnvelope<ResultadoPrueba[]>>(`/pruebas/${pruebaId}/mis-resultados`);
  return unwrapApiData(res) || [];
}

export async function getBestResultado(pruebaId: string): Promise<ResultadoPrueba | null> {
  const res = await api.get<ResultadoPrueba | null | ApiEnvelope<ResultadoPrueba | null>>(`/pruebas/${pruebaId}/mejor-resultado`);
  return unwrapApiData(res);
}
