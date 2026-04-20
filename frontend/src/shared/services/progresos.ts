import { api } from "@/shared/lib/api";
import type { Progreso } from "@/shared/types";

type ProgresoListResponse = Progreso[] | { data?: Progreso[] | null };
type ProgresoItemResponse = Progreso | { data?: Progreso | null };

function normalizeProgresos(response: ProgresoListResponse): Progreso[] {
  if (Array.isArray(response)) {
    return response;
  }
  return Array.isArray(response?.data) ? response.data : [];
}

function normalizeProgreso(response: ProgresoItemResponse): Progreso | null {
  if (response && typeof response === "object" && "data" in response) {
    return response.data ?? null;
  }
  return response as Progreso;
}

export async function upsertProgreso(data: {
  leccion_id: string;
  completado: boolean;
  puntaje: number;
}): Promise<Progreso> {
  const res = await api.put<ProgresoItemResponse>("/progreso", data);
  const item = normalizeProgreso(res);
  if (!item) {
    throw new Error("Respuesta inválida al guardar progreso");
  }
  return item;
}

export async function listMisProgresos(): Promise<Progreso[]> {
  const res = await api.get<ProgresoListResponse>("/progreso");
  return normalizeProgresos(res);
}

export async function getProgreso(leccionId: string): Promise<Progreso | null> {
  try {
    const res = await api.get<ProgresoItemResponse>(`/lecciones/${leccionId}/progreso`);
    return normalizeProgreso(res);
  } catch {
    return null;
  }
}
