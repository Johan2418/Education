import { api } from "@/shared/lib/api";
import type { Materia, MateriaCalificacionEstudianteResponse } from "@/shared/types";

type MateriaListResponse = Materia[] | { data?: Materia[] | null };
type MateriaCalificacionesListResponse =
  | MateriaCalificacionEstudianteResponse[]
  | { data?: MateriaCalificacionEstudianteResponse[] | null };

function normalizeMaterias(response: MateriaListResponse): Materia[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

export async function listMisMateriasEstudiante(): Promise<Materia[]> {
  const res = await api.get<MateriaListResponse>("/student/materias");
  return normalizeMaterias(res);
}

export async function listMisCalificacionesMateriasEstudiante(): Promise<MateriaCalificacionEstudianteResponse[]> {
  const res = await api.get<MateriaCalificacionesListResponse>("/student/materias/calificaciones");
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}
