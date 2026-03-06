import { api } from "@/shared/lib/api";
import type { Progreso } from "@/shared/types";

export async function upsertProgreso(data: {
  leccion_id: string;
  completado: boolean;
  puntaje: number;
}): Promise<Progreso> {
  const res = await api.put<{ data: Progreso }>("/progreso", data);
  return res.data;
}

export async function listMisProgresos(): Promise<Progreso[]> {
  const res = await api.get<{ data: Progreso[] }>("/progreso");
  return res.data;
}

export async function getProgreso(leccionId: string): Promise<Progreso | null> {
  try {
    const res = await api.get<{ data: Progreso }>(`/lecciones/${leccionId}/progreso`);
    return res.data;
  } catch {
    return null;
  }
}
