import api from "@/shared/lib/api";
import type { Prueba, PruebaCompleta, Pregunta, Respuesta, ResultadoPrueba } from "@/shared/types";

export async function listPruebasByLeccion(leccionId: string): Promise<Prueba[]> {
  return api.get(`/lecciones/${leccionId}/pruebas`);
}

export async function getPrueba(id: string): Promise<Prueba> {
  return api.get(`/pruebas/${id}`);
}

export async function getPruebaCompleta(id: string): Promise<PruebaCompleta> {
  return api.get(`/pruebas/${id}/completa`);
}

export async function createPrueba(payload: Partial<Prueba>): Promise<Prueba> {
  return api.post("/pruebas", payload);
}

export async function updatePrueba(id: string, payload: Partial<Prueba>): Promise<Prueba> {
  return api.put(`/pruebas/${id}`, payload);
}

export async function deletePrueba(id: string): Promise<void> {
  return api.delete(`/pruebas/${id}`);
}

export async function listPreguntas(pruebaId: string): Promise<Pregunta[]> {
  return api.get(`/pruebas/${pruebaId}/preguntas`);
}

export async function createPregunta(payload: Partial<Pregunta>): Promise<Pregunta> {
  return api.post("/preguntas", payload);
}

export async function updatePregunta(id: string, payload: Partial<Pregunta>): Promise<Pregunta> {
  return api.put(`/preguntas/${id}`, payload);
}

export async function deletePregunta(id: string): Promise<void> {
  return api.delete(`/preguntas/${id}`);
}

export async function createRespuesta(payload: Partial<Respuesta>): Promise<Respuesta> {
  return api.post("/respuestas", payload);
}

export async function updateRespuesta(id: string, payload: Partial<Respuesta>): Promise<Respuesta> {
  return api.put(`/respuestas/${id}`, payload);
}

export async function deleteRespuesta(id: string): Promise<void> {
  return api.delete(`/respuestas/${id}`);
}

export async function submitResultado(payload: Partial<ResultadoPrueba>): Promise<ResultadoPrueba> {
  return api.post("/resultados", payload);
}

export async function listResultadosByPrueba(pruebaId: string): Promise<ResultadoPrueba[]> {
  return api.get(`/pruebas/${pruebaId}/resultados`);
}

export async function listMisResultados(pruebaId: string): Promise<ResultadoPrueba[]> {
  return api.get(`/pruebas/${pruebaId}/mis-resultados`);
}

export async function getBestResultado(pruebaId: string): Promise<ResultadoPrueba | null> {
  return api.get(`/pruebas/${pruebaId}/mejor-resultado`);
}
