import api from "@/shared/lib/api";
import type { Leccion, LeccionSeccion } from "@/shared/types";

export async function listLecciones(): Promise<Leccion[]> {
  // No direct "list all lessons" endpoint — we fetch via temas.
  // For a general listing, the caller should iterate cursos → materias → unidades → temas → lecciones.
  // As a convenience, we expose this function that tries a common approach.
  return [];
}

export async function getLeccion(id: string): Promise<Leccion> {
  return api.get(`/lecciones/${id}`);
}

export async function createLeccion(payload: Partial<Leccion>): Promise<Leccion> {
  return api.post("/lecciones", payload);
}

export async function updateLeccion(id: string, payload: Partial<Leccion>): Promise<Leccion> {
  return api.put(`/lecciones/${id}`, payload);
}

export async function deleteLeccion(id: string): Promise<void> {
  return api.delete(`/lecciones/${id}`);
}

export async function listLeccionesByTema(temaId: string): Promise<Leccion[]> {
  return api.get(`/temas/${temaId}/lecciones`);
}

export async function listSecciones(leccionId: string): Promise<LeccionSeccion[]> {
  return api.get(`/lecciones/${leccionId}/secciones`);
}

export async function createSeccion(payload: Partial<LeccionSeccion>): Promise<LeccionSeccion> {
  return api.post("/secciones", payload);
}

export async function updateSeccion(id: string, payload: Partial<LeccionSeccion>): Promise<LeccionSeccion> {
  return api.put(`/secciones/${id}`, payload);
}

export async function deleteSeccion(id: string): Promise<void> {
  return api.delete(`/secciones/${id}`);
}
