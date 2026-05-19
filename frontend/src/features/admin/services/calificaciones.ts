import api from "@/shared/lib/api";
import type { TeacherGradeDetailResponse, TeacherGradeFilters } from "@/shared/types";

function unwrapDataRecursive<T>(payload: unknown): T {
  let current: unknown = payload;
  let depth = 0;

  while (
    current &&
    typeof current === "object" &&
    "data" in (current as Record<string, unknown>) &&
    depth < 4
  ) {
    const next = (current as { data?: unknown }).data;
    if (typeof next === "undefined") break;
    current = next;
    depth += 1;
  }

  return current as T;
}

export async function getAdminGradeDetails(filters: TeacherGradeFilters = {}): Promise<TeacherGradeDetailResponse> {
  const params = new URLSearchParams();
  const append = (key: string, value?: string | number) => {
    if (value === undefined || value === null) return;
    const stringValue = String(value).trim();
    if (!stringValue) return;
    params.set(key, stringValue);
  };

  append("anio_escolar", filters.anio_escolar);
  append("curso_id", filters.curso_id);
  append("materia_id", filters.materia_id);
  append("estudiante_id", filters.estudiante_id);
  if (filters.tipo && filters.tipo !== "all") append("tipo", filters.tipo);
  if (filters.estado && filters.estado !== "todos") append("estado", filters.estado);
  append("unidad_id", filters.unidad_id);
  append("tema_id", filters.tema_id);
  append("desde", filters.desde);
  append("hasta", filters.hasta);
  append("q", filters.q);
  append("limit", filters.limit);
  append("offset", filters.offset);

  const query = params.toString();
  const resp = await api.get<unknown>(`/admin/calificaciones/detalle${query ? `?${query}` : ""}`);
  const payload = unwrapDataRecursive<TeacherGradeDetailResponse | null>(resp);

  return payload ?? {
    items: [],
    total: 0,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
    anio_escolar_activo: "",
    aggregates: {
      total: 0,
      promedio_general_10: 0,
      promedio_general_100: 0,
      por_tipo: [],
      por_curso: [],
      por_materia: [],
      por_estudiante: [],
      por_unidad: [],
      por_tema: [],
      por_anio: [],
    },
  };
}

