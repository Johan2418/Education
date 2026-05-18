import { api } from "@/shared/lib/api";
import type {
  Materia,
  MateriaCalificacionEstudianteResponse,
  StudentGradeDetailResponse,
  StudentGradeFilters,
} from "@/shared/types";

type MateriaListResponse = Materia[] | { data?: Materia[] | null };
type MateriaCalificacionesListResponse =
  | MateriaCalificacionEstudianteResponse[]
  | { data?: MateriaCalificacionEstudianteResponse[] | null };
type StudentGradeDetailApiResponse = StudentGradeDetailResponse | { data?: StudentGradeDetailResponse | null };

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

export async function getStudentGradeDetails(filters: StudentGradeFilters = {}): Promise<StudentGradeDetailResponse> {
  const params = new URLSearchParams();
  const append = (key: string, value?: string | number) => {
    if (value === undefined || value === null) return;
    const stringValue = String(value).trim();
    if (!stringValue) return;
    params.set(key, stringValue);
  };

  append("materia_id", filters.materia_id);
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
  const res = await api.get<StudentGradeDetailApiResponse>(`/student/calificaciones/detalle${query ? `?${query}` : ""}`);
  if (res && !Array.isArray(res) && "items" in res) {
    return res as StudentGradeDetailResponse;
  }
  const payload = (res as { data?: StudentGradeDetailResponse | null })?.data;
  return payload ?? {
    items: [],
    total: 0,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
    aggregates: {
      total: 0,
      promedio_general_10: 0,
      promedio_general_100: 0,
      por_tipo: [],
      por_materia: [],
      por_unidad: [],
      por_tema: [],
    },
  };
}
