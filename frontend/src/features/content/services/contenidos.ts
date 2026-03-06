import api from "@/shared/lib/api";
import type { Materia, Leccion } from "@/shared/types";

export interface MateriaConLecciones extends Materia {
  lecciones: Leccion[];
}

/**
 * List materias (the "content" concept). Teachers see their own materias; admins see all.
 * Uses GET /cursos/{cursoId}/materias — for simplicity we fetch from all cursos.
 */
export async function listMaterias(): Promise<Materia[]> {
  // The Go backend lists materias per curso. We'll fetch cursos first, then materias.
  const cursos: any[] = await api.get("/cursos");
  const all: Materia[] = [];
  for (const c of cursos || []) {
    const materias: Materia[] = await api.get(`/cursos/${c.id}/materias`);
    all.push(...(materias || []));
  }
  return all;
}

/**
 * Get a specific materia by ID
 */
export async function getMateria(id: string): Promise<Materia> {
  return api.get(`/materias/${id}`);
}

/**
 * Create a new materia
 */
export async function createMateria(payload: Partial<Materia>): Promise<Materia> {
  return api.post("/materias", payload);
}

/**
 * Update a materia
 */
export async function updateMateria(id: string, payload: Partial<Materia>): Promise<Materia> {
  return api.put(`/materias/${id}`, payload);
}

/**
 * Delete a materia
 */
export async function deleteMateria(id: string): Promise<void> {
  return api.delete(`/materias/${id}`);
}

/**
 * List lecciones for a given tema
 */
export async function listLeccionesByTema(temaId: string): Promise<Leccion[]> {
  return api.get(`/temas/${temaId}/lecciones`);
}
