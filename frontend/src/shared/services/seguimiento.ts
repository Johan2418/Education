import { api } from "@/shared/lib/api";
import type { MateriaSeguimiento } from "@/shared/types";

export async function listSeguimientos(materiaId: string): Promise<MateriaSeguimiento[]> {
  const res = await api.get<{ data: MateriaSeguimiento[] }>(
    `/materias/${materiaId}/seguimientos`
  );
  return res.data;
}

export async function seguirMateria(materiaId: string): Promise<void> {
  await api.post(`/materias/${materiaId}/seguir`);
}

export async function dejarDeSeguirMateria(materiaId: string): Promise<void> {
  await api.delete(`/materias/${materiaId}/seguir`);
}
