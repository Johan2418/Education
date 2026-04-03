import { api } from "@/shared/lib/api";
import type { ProgresoSeccion } from "@/shared/types";

export async function upsertProgresoSeccion(data: {
  leccion_seccion_id: string;
  completado?: boolean;
  puntuacion?: number;
  tiempo_dedicado?: number;
  intentos?: number;
}): Promise<ProgresoSeccion> {
  const res = await api.put<{ data: ProgresoSeccion }>("/progreso-secciones", data);
  return res.data;
}

export async function listProgresoSecciones(leccionId: string): Promise<ProgresoSeccion[]> {
  const res = await api.get<{ data: ProgresoSeccion[] }>(
    `/lecciones/${leccionId}/progreso-secciones`
  );
  return res.data;
}
