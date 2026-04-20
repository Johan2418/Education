import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import {
  Loader2,
  Trash2,
  Search,
  Plus,
  Pencil,
  BookOpen,
  X,
  Users,
  FileSpreadsheet,
  UserPlus,
} from "lucide-react";
import type {
  Curso,
  CursoAnioAsignarMaestrosResult,
  DocenteMateriaAsignacion,
  EstudianteCursoDetail,
  Materia,
} from "@/shared/types";
import type { Profile } from "@/shared/types";
import { asignarMaestrosCursoAnio } from "@/features/teacher/services/docencia";

type MateriaOption = Materia & { curso_nombre: string };

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }
  return fallback;
}

function getDefaultAcademicYear(): string {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
}

function getPreviousAcademicYear(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    const fallback = getDefaultAcademicYear();
    const fallbackMatch = fallback.match(/^(\d{4})-(\d{4})$/);
    if (!fallbackMatch) return value;
    return `${Number(fallbackMatch[1]) - 1}-${Number(fallbackMatch[2]) - 1}`;
  }
  return `${Number(match[1]) - 1}-${Number(match[2]) - 1}`;
}

/* ── Modal wrapper ──────────────────────────────────────── */
function Modal({
  open,
  onClose,
  children,
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  panelClassName?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-hidden ${panelClassName || "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */
export default function AdminCursos() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const [cursos, setCursos] = useState<Curso[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [materiasByCurso, setMateriasByCurso] = useState<Record<string, Materia[]>>({});
  const [allMaterias, setAllMaterias] = useState<MateriaOption[]>([]);
  const [asignaciones, setAsignaciones] = useState<DocenteMateriaAsignacion[]>([]);

  const [search, setSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [anioEscolarFilter, setAnioEscolarFilter] = useState(getDefaultAcademicYear());
  const [onlyActiveAssignments, setOnlyActiveAssignments] = useState(true);

  // Create course modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", descripcion: "", activo: true });
  const [creating, setCreating] = useState(false);

  // Edit course modal
  const [editOpen, setEditOpen] = useState(false);
  const [editCurso, setEditCurso] = useState<Curso | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", descripcion: "", activo: true });
  const [saving, setSaving] = useState(false);

  // Enrollment modal
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCurso, setEnrollCurso] = useState<Curso | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EstudianteCursoDetail[]>([]);
  const [allStudents, setAllStudents] = useState<Profile[]>([]);
  const [enrollSearch, setEnrollSearch] = useState("");
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  // Assignment create/edit
  const [assignmentForm, setAssignmentForm] = useState({
    docente_id: "",
    materia_id: "",
    anio_escolar: getDefaultAcademicYear(),
    activo: true,
  });
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [assignmentEditOpen, setAssignmentEditOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<DocenteMateriaAsignacion | null>(null);
  const [assignmentEditForm, setAssignmentEditForm] = useState({ docente_id: "", anio_escolar: "", activo: true });
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Bulk assign teacher by course/year
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkCurso, setBulkCurso] = useState<Curso | null>(null);
  const [bulkTargetYear, setBulkTargetYear] = useState(getDefaultAcademicYear());
  const [bulkSourceYear, setBulkSourceYear] = useState(getPreviousAcademicYear(getDefaultAcademicYear()));
  const [bulkSourceMaterias, setBulkSourceMaterias] = useState<Materia[]>([]);
  const [bulkTeacherByMateria, setBulkTeacherByMateria] = useState<Record<string, string>>({});
  const [loadingBulkSourceMaterias, setLoadingBulkSourceMaterias] = useState(false);
  const [runningBulkAssign, setRunningBulkAssign] = useState(false);

  // Manual subject creation per course
  const [createMateriaOpen, setCreateMateriaOpen] = useState(false);
  const [createMateriaCurso, setCreateMateriaCurso] = useState<Curso | null>(null);
  const [creatingMateria, setCreatingMateria] = useState(false);
  const [createMateriaForm, setCreateMateriaForm] = useState({
    nombre: "",
    descripcion: "",
    anio_escolar: getDefaultAcademicYear(),
    orden: 0,
    activo: true,
  });

  const loadMateriasByCourseYear = useCallback(async (cursoID: string, anioEscolar: string) => {
    const params = new URLSearchParams();
    if (anioEscolar.trim()) {
      params.set("anio_escolar", anioEscolar.trim());
    }

    const suffix = params.toString();
    const path = suffix ? `/cursos/${cursoID}/materias?${suffix}` : `/cursos/${cursoID}/materias`;
    const res = await api.get<{ data: Materia[] }>(path);
    return res.data || [];
  }, []);

  const loadBulkSourceData = useCallback(async (cursoID: string, sourceYear: string) => {
    setLoadingBulkSourceMaterias(true);
    try {
      const [materias, asignacionesOrigenRes] = await Promise.all([
        loadMateriasByCourseYear(cursoID, sourceYear),
        api.get<{ data: DocenteMateriaAsignacion[] }>(`/asignaciones-docente?curso_id=${encodeURIComponent(cursoID)}&anio_escolar=${encodeURIComponent(sourceYear)}&solo_activas=false`),
      ]);

      const asignacionesOrigen = asignacionesOrigenRes.data || [];
      const teacherByMateria: Record<string, string> = {};
      for (const asignacion of asignacionesOrigen) {
        teacherByMateria[asignacion.materia_id] = asignacion.docente_id;
      }

      setBulkSourceMaterias(materias);
      setBulkTeacherByMateria(teacherByMateria);
    } catch (err) {
      setBulkSourceMaterias([]);
      setBulkTeacherByMateria({});
      toast.error(getErrorMessage(err, "Error al cargar materias y asignaciones del año origen"));
    } finally {
      setLoadingBulkSourceMaterias(false);
    }
  }, [loadMateriasByCourseYear]);

  const openBulkAssignModal = useCallback(async (curso: Curso) => {
    const targetYear = (anioEscolarFilter || getDefaultAcademicYear()).trim();
    const sourceYear = getPreviousAcademicYear(targetYear);

    setBulkCurso(curso);
    setBulkTargetYear(targetYear);
    setBulkSourceYear(sourceYear);
    setBulkSourceMaterias([]);
    setBulkTeacherByMateria({});
    setBulkAssignOpen(true);

    await loadBulkSourceData(curso.id, sourceYear);
  }, [anioEscolarFilter, loadBulkSourceData]);

  const handleBulkTargetYearChange = (value: string) => {
    setBulkTargetYear(value);
    setBulkSourceYear(getPreviousAcademicYear(value));
  };

  const handleRunBulkAssign = async () => {
    if (!bulkCurso) return;

    const destino = bulkTargetYear.trim();
    const origen = bulkSourceYear.trim();
    if (!destino.match(/^\d{4}-\d{4}$/)) {
      toast.error("El año escolar destino debe tener formato YYYY-YYYY");
      return;
    }
    if (!origen.match(/^\d{4}-\d{4}$/)) {
      toast.error("El año escolar origen debe tener formato YYYY-YYYY");
      return;
    }
    if (bulkSourceMaterias.length === 0) {
      toast.error("No hay materias de origen para clonar");
      return;
    }

    const missingTeacher = bulkSourceMaterias.find((materia) => !bulkTeacherByMateria[materia.id]);
    if (missingTeacher) {
      toast.error(`Falta seleccionar docente para ${missingTeacher.nombre}`);
      return;
    }

    setRunningBulkAssign(true);
    try {
      const result: CursoAnioAsignarMaestrosResult = await asignarMaestrosCursoAnio(bulkCurso.id, {
        anio_escolar_destino: destino,
        anio_escolar_origen: origen,
        asignaciones: bulkSourceMaterias.map((materia) => ({
          materia_origen_id: materia.id,
          docente_id: bulkTeacherByMateria[materia.id] || "",
          activo: true,
        })),
      });

      toast.success(
        `Proceso completado. Materias clonadas: ${result.materias_clonadas}, asignaciones creadas: ${result.asignaciones_creadas}, actualizadas: ${result.asignaciones_actualizadas}`,
      );

      setBulkAssignOpen(false);
      setBulkCurso(null);
      setBulkSourceMaterias([]);
      setBulkTeacherByMateria({});

      await Promise.all([
        loadCatalogData(anioEscolarFilter),
        loadAssignments(anioEscolarFilter, onlyActiveAssignments),
      ]);
    } catch (err) {
      toast.error(getErrorMessage(err, "Error al clonar materias y asignar docentes"));
    } finally {
      setRunningBulkAssign(false);
    }
  };

  const loadCatalogData = useCallback(async (anioEscolar?: string) => {
    const [cursosRes, usersRes] = await Promise.all([
      api.get<{ data: Curso[] }>("/cursos"),
      api.get<{ data: Profile[] }>("/admin/users"),
    ]);

    const nextCursos = cursosRes.data || [];
    const nextTeachers = (usersRes.data || []).filter((u) => u.role === "teacher");

    setCursos(nextCursos);
    setTeachers(nextTeachers);

    const materiasEntries = await Promise.all(
      nextCursos.map(async (curso) => {
        try {
          const params = new URLSearchParams();
          if ((anioEscolar || "").trim()) {
            params.set("anio_escolar", (anioEscolar || "").trim());
          }
          const suffix = params.toString();
          const path = suffix ? `/cursos/${curso.id}/materias?${suffix}` : `/cursos/${curso.id}/materias`;
          const materiasRes = await api.get<{ data: Materia[] }>(path);
          return [curso.id, materiasRes.data || []] as [string, Materia[]];
        } catch {
          return [curso.id, []] as [string, Materia[]];
        }
      })
    );

    const nextMateriasByCurso: Record<string, Materia[]> = {};
    for (const [cursoID, materias] of materiasEntries) {
      nextMateriasByCurso[cursoID] = materias;
    }
    setMateriasByCurso(nextMateriasByCurso);

    const flattened: MateriaOption[] = [];
    for (const curso of nextCursos) {
      const materias = nextMateriasByCurso[curso.id] || [];
      for (const materia of materias) {
        flattened.push({
          ...materia,
          curso_nombre: curso.nombre,
        });
      }
    }
    setAllMaterias(flattened);

    setAssignmentForm((prev) => ({
      ...prev,
      docente_id: prev.docente_id || nextTeachers[0]?.id || "",
      materia_id: prev.materia_id || flattened[0]?.id || "",
    }));
  }, []);

  const openCreateMateriaModal = (curso: Curso) => {
    const defaultYear = (anioEscolarFilter || getDefaultAcademicYear()).trim();
    const nextOrder = (materiasByCurso[curso.id]?.length || 0) + 1;

    setCreateMateriaCurso(curso);
    setCreateMateriaForm({
      nombre: "",
      descripcion: "",
      anio_escolar: defaultYear,
      orden: nextOrder,
      activo: true,
    });
    setCreateMateriaOpen(true);
  };

  const handleCreateMateriaManual = async () => {
    if (!createMateriaCurso) return;

    const nombre = createMateriaForm.nombre.trim();
    const anioEscolar = createMateriaForm.anio_escolar.trim();

    if (!nombre) {
      toast.error("El nombre de la materia es obligatorio");
      return;
    }
    if (!anioEscolar.match(/^\d{4}-\d{4}$/)) {
      toast.error("El ano escolar debe tener formato YYYY-YYYY");
      return;
    }

    setCreatingMateria(true);
    try {
      await api.post<{ data: Materia }>("/materias", {
        curso_id: createMateriaCurso.id,
        nombre,
        descripcion: createMateriaForm.descripcion.trim() || null,
        anio_escolar: anioEscolar,
        orden: Number.isFinite(createMateriaForm.orden) ? createMateriaForm.orden : 0,
        activo: createMateriaForm.activo,
      });

      toast.success("Materia creada manualmente");
      setCreateMateriaOpen(false);
      setCreateMateriaCurso(null);

      await Promise.all([
        loadCatalogData(anioEscolarFilter),
        loadAssignments(anioEscolarFilter, onlyActiveAssignments),
      ]);
    } catch (err) {
      toast.error(getErrorMessage(err, "Error al crear materia"));
    } finally {
      setCreatingMateria(false);
    }
  };

  const loadAssignments = useCallback(async (anioEscolar: string, soloActivas: boolean) => {
    setLoadingAssignments(true);
    try {
      const params = new URLSearchParams();
      if (anioEscolar.trim()) params.set("anio_escolar", anioEscolar.trim());
      params.set("solo_activas", String(soloActivas));

      const res = await api.get<{ data: DocenteMateriaAsignacion[] }>(`/asignaciones-docente?${params.toString()}`);
      setAsignaciones(res.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, t("admin.cursos.errors.loadError", { defaultValue: "Error al cargar asignaciones" })));
    } finally {
      setLoadingAssignments(false);
    }
  }, [t]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        await Promise.all([
          loadCatalogData(anioEscolarFilter),
          loadAssignments(anioEscolarFilter, onlyActiveAssignments),
        ]);
      } catch {
        toast.error(t("admin.cursos.errors.loadError", { defaultValue: "Error al cargar cursos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t, loadCatalogData, loadAssignments]);

  const teacherLabelByID = useCallback((teacherID: string, fallbackName?: string | null, fallbackEmail?: string | null) => {
    if (fallbackName && fallbackName.trim()) return fallbackName;
    if (fallbackEmail && fallbackEmail.trim()) return fallbackEmail;

    const teacher = teachers.find((u) => u.id === teacherID);
    if (!teacher) return teacherID;
    return teacher.display_name || teacher.email;
  }, [teachers]);

  /* ── Filters ─────────────────────────────────────────── */
  const filteredCursos = useMemo(() => {
    const q = search.toLowerCase();
    return cursos.filter((c) => {
      const materiasText = (materiasByCurso[c.id] || []).map((m) => m.nombre).join(" ").toLowerCase();
      return (
        c.nombre.toLowerCase().includes(q)
        || (c.descripcion || "").toLowerCase().includes(q)
        || materiasText.includes(q)
      );
    });
  }, [cursos, search, materiasByCurso]);

  const filteredAsignaciones = useMemo(() => {
    const q = assignmentSearch.toLowerCase().trim();
    if (!q) return asignaciones;

    return asignaciones.filter((item) => {
      const teacher = teacherLabelByID(item.docente_id, item.docente_nombre, item.docente_email).toLowerCase();
      return (
        (item.curso_nombre || "").toLowerCase().includes(q)
        || (item.materia_nombre || "").toLowerCase().includes(q)
        || item.anio_escolar.toLowerCase().includes(q)
        || teacher.includes(q)
      );
    });
  }, [asignaciones, assignmentSearch, teacherLabelByID]);

  const activeAssignmentsCount = useMemo(
    () => asignaciones.filter((item) => item.activo).length,
    [asignaciones]
  );

  /* ── Course CRUD ─────────────────────────────────────── */
  const handleCreateCurso = async () => {
    if (!createForm.nombre.trim()) {
      toast.error(t("admin.cursos.errors.nameRequired", { defaultValue: "El nombre es requerido" }));
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        nombre: createForm.nombre,
        descripcion: createForm.descripcion || null,
        activo: createForm.activo,
      };

      await api.post<{ data: Curso }>("/cursos", body);
      toast.success(t("admin.cursos.success.created", { defaultValue: "Curso creado" }));
      setCreateOpen(false);
      setCreateForm({ nombre: "", descripcion: "", activo: true });

      await Promise.all([
        loadCatalogData(anioEscolarFilter),
        loadAssignments(anioEscolarFilter, onlyActiveAssignments),
      ]);
    } catch (err) {
      toast.error(getErrorMessage(err, t("admin.cursos.errors.createError", { defaultValue: "Error al crear curso" })));
    } finally {
      setCreating(false);
    }
  };

  const openEditCurso = (c: Curso) => {
    setEditCurso(c);
    setEditForm({
      nombre: c.nombre,
      descripcion: c.descripcion || "",
      activo: c.activo,
    });
    setEditOpen(true);
  };

  const handleSaveEditCurso = async () => {
    if (!editCurso) return;

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nombre: editForm.nombre,
        descripcion: editForm.descripcion || null,
        activo: editForm.activo,
      };

      await api.put<{ data: Curso }>(`/cursos/${editCurso.id}`, body);
      toast.success(t("admin.cursos.success.updated", { defaultValue: "Curso actualizado" }));
      setEditOpen(false);
      setEditCurso(null);

      await Promise.all([
        loadCatalogData(anioEscolarFilter),
        loadAssignments(anioEscolarFilter, onlyActiveAssignments),
      ]);
    } catch (err) {
      toast.error(getErrorMessage(err, t("admin.cursos.errors.updateError", { defaultValue: "Error al actualizar" })));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurso = async (id: string) => {
    const curso = cursos.find((c) => c.id === id);
    if (!confirm(t("admin.cursos.confirmDelete", { nombre: curso?.nombre ?? "", defaultValue: `¿Eliminar "${curso?.nombre}"?` }))) return;

    try {
      await api.delete(`/cursos/${id}`);
      toast.success(t("admin.cursos.success.deleted", { defaultValue: "Curso eliminado" }));

      await Promise.all([
        loadCatalogData(anioEscolarFilter),
        loadAssignments(anioEscolarFilter, onlyActiveAssignments),
      ]);
    } catch (err) {
      toast.error(getErrorMessage(err, t("admin.cursos.errors.deleteError", { defaultValue: "Error al eliminar" })));
    }
  };

  /* ── Enrollment ────────────────────────────────────────── */
  const openEnrollmentModal = async (c: Curso) => {
    setEnrollCurso(c);
    setEnrollOpen(true);
    setEnrollSearch("");
    try {
      const [enrolledRes, studentsRes] = await Promise.all([
        api.get<{ data: EstudianteCursoDetail[] }>(`/cursos/${c.id}/estudiantes`),
        api.get<{ data: Profile[] }>("/students"),
      ]);
      setEnrolledStudents(enrolledRes.data || []);
      setAllStudents(studentsRes.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, t("admin.cursos.enrollment.loadError", { defaultValue: "Error al cargar estudiantes" })));
    }
  };

  const enrolledIds = useMemo(() => new Set(enrolledStudents.map((e) => e.estudiante_id)), [enrolledStudents]);

  const availableStudents = useMemo(() => {
    const q = enrollSearch.toLowerCase();
    return allStudents
      .filter((s) => !enrolledIds.has(s.id))
      .filter((s) => (s.display_name || "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [allStudents, enrolledIds, enrollSearch]);

  const handleAdminEnroll = async (studentId: string) => {
    if (!enrollCurso) return;
    setEnrollingId(studentId);
    try {
      await api.post(`/cursos/${enrollCurso.id}/estudiantes`, { estudiante_id: studentId, curso_id: enrollCurso.id });
      const res = await api.get<{ data: EstudianteCursoDetail[] }>(`/cursos/${enrollCurso.id}/estudiantes`);
      setEnrolledStudents(res.data || []);
      toast.success(t("admin.cursos.enrollment.enrolled", { defaultValue: "Estudiante inscrito" }));
    } catch (err) {
      toast.error(getErrorMessage(err, t("admin.cursos.enrollment.enrollError", { defaultValue: "Error al inscribir" })));
    } finally {
      setEnrollingId(null);
    }
  };

  const handleAdminUnenroll = async (enrollmentId: string, name: string) => {
    if (!enrollCurso) return;
    if (!confirm(t("admin.cursos.enrollment.confirmUnenroll", { nombre: name, defaultValue: `¿Desinscribir a "${name}"?` }))) return;

    try {
      await api.delete(`/cursos/${enrollCurso.id}/estudiantes/${enrollmentId}`);
      setEnrolledStudents((prev) => prev.filter((e) => e.id !== enrollmentId));
      toast.success(t("admin.cursos.enrollment.unenrolled", { defaultValue: "Estudiante desinscrito" }));
    } catch (err) {
      toast.error(getErrorMessage(err, t("admin.cursos.enrollment.unenrollError", { defaultValue: "Error al desinscribir" })));
    }
  };

  /* ── Asignaciones por materia ─────────────────────────── */
  const handleApplyAssignmentFilters = async () => {
    await Promise.all([
      loadCatalogData(anioEscolarFilter),
      loadAssignments(anioEscolarFilter, onlyActiveAssignments),
    ]);
  };

  const handleCreateAssignment = async () => {
    if (!assignmentForm.materia_id || !assignmentForm.docente_id) {
      toast.error("Selecciona materia y docente");
      return;
    }
    if (!assignmentForm.anio_escolar.trim()) {
      toast.error("El ano escolar es obligatorio");
      return;
    }

    setCreatingAssignment(true);
    try {
      await api.post<{ data: DocenteMateriaAsignacion }>("/asignaciones-docente", {
        docente_id: assignmentForm.docente_id,
        materia_id: assignmentForm.materia_id,
        anio_escolar: assignmentForm.anio_escolar.trim(),
        activo: assignmentForm.activo,
      });

      toast.success("Asignacion creada");
      setAssignmentForm((prev) => ({ ...prev, activo: true }));
      await loadAssignments(anioEscolarFilter, onlyActiveAssignments);
    } catch (err) {
      toast.error(getErrorMessage(err, "Error al crear asignacion"));
    } finally {
      setCreatingAssignment(false);
    }
  };

  const openEditAssignment = (item: DocenteMateriaAsignacion) => {
    setEditingAssignment(item);
    setAssignmentEditForm({
      docente_id: item.docente_id,
      anio_escolar: item.anio_escolar,
      activo: item.activo,
    });
    setAssignmentEditOpen(true);
  };

  const handleSaveAssignment = async () => {
    if (!editingAssignment) return;
    if (!assignmentEditForm.docente_id.trim()) {
      toast.error("Selecciona un docente");
      return;
    }
    if (!assignmentEditForm.anio_escolar.trim()) {
      toast.error("El ano escolar es obligatorio");
      return;
    }

    setSavingAssignment(true);
    try {
      await api.put<{ data: DocenteMateriaAsignacion }>(`/asignaciones-docente/${editingAssignment.id}`, {
        docente_id: assignmentEditForm.docente_id,
        anio_escolar: assignmentEditForm.anio_escolar.trim(),
        activo: assignmentEditForm.activo,
      });

      toast.success("Asignacion actualizada");
      setAssignmentEditOpen(false);
      setEditingAssignment(null);
      await loadAssignments(anioEscolarFilter, onlyActiveAssignments);
    } catch (err) {
      toast.error(getErrorMessage(err, "Error al actualizar asignacion"));
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (item: DocenteMateriaAsignacion) => {
    const label = `${item.materia_nombre || "Materia"} - ${item.curso_nombre || "Curso"}`;
    if (!confirm(`¿Eliminar asignacion ${label}?`)) return;

    try {
      await api.delete(`/asignaciones-docente/${item.id}`);
      toast.success("Asignacion eliminada");
      await loadAssignments(anioEscolarFilter, onlyActiveAssignments);
    } catch (err) {
      toast.error(getErrorMessage(err, "Error al eliminar asignacion"));
    }
  };

  /* ── Render ───────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.cursos.title", { defaultValue: "Gestión de Cursos" })}</h1>
          <p className="text-sm text-gray-500">
            {t("admin.cursos.description", { defaultValue: "Administra cursos, materias y asignaciones docentes" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/admin/bulk-import")} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
            <FileSpreadsheet size={16} /> Importación Masiva
          </button>
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            <Plus size={16} /> {t("admin.cursos.create.button", { defaultValue: "Nuevo Curso" })}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("admin.cursos.search", { defaultValue: "Buscar por curso o materia..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg shadow p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{cursos.length}</p>
          <p className="text-xs text-gray-500">{t("admin.cursos.stats.total", { defaultValue: "Total cursos" })}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">{cursos.filter((c) => c.activo).length}</p>
          <p className="text-xs text-gray-500">{t("admin.cursos.stats.active", { defaultValue: "Activos" })}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3 text-center">
          <p className="text-2xl font-bold text-violet-600">{allMaterias.length}</p>
          <p className="text-xs text-gray-500">Materias</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{activeAssignmentsCount}</p>
          <p className="text-xs text-gray-500">Asignaciones activas</p>
        </div>
      </div>

      {/* Table */}
      {filteredCursos.length === 0 ? (
        <div className="text-center text-gray-500 p-8 bg-white rounded-lg shadow">
          <BookOpen size={40} className="mx-auto mb-2 text-gray-300" />
          {t("admin.cursos.table.noCursos", { defaultValue: "No hay cursos para mostrar" })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.cursos.table.name", { defaultValue: "Nombre" })}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.cursos.table.description", { defaultValue: "Descripción" })}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Materias</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.cursos.table.status", { defaultValue: "Estado" })}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("admin.cursos.table.actions", { defaultValue: "Acciones" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCursos.map((c) => {
                const materias = materiasByCurso[c.id] || [];
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.nombre}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{c.descripcion || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {materias.length === 0 ? (
                        <span className="text-gray-400 italic">Sin materias</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {materias.slice(0, 2).map((materia) => (
                            <span key={materia.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-violet-50 text-violet-700">
                              {materia.nombre}{materia.anio_escolar ? ` (${materia.anio_escolar})` : ""}
                            </span>
                          ))}
                          {materias.length > 2 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                              +{materias.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.activo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.activo ? "bg-emerald-500" : "bg-gray-400"}`} />
                        {c.activo ? t("admin.cursos.active", { defaultValue: "Activo" }) : t("admin.cursos.inactive", { defaultValue: "Inactivo" })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openCreateMateriaModal(c)}
                          className="p-2 text-emerald-700 hover:bg-emerald-50 rounded"
                          title="Agregar materia manual"
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          onClick={() => void openBulkAssignModal(c)}
                          className="p-2 text-violet-700 hover:bg-violet-50 rounded"
                          title="Asignar maestro"
                        >
                          <UserPlus size={16} />
                        </button>
                        <button onClick={() => openEnrollmentModal(c)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded" title={t("admin.cursos.actions.students", { defaultValue: "Estudiantes" })}>
                          <Users size={16} />
                        </button>
                        <button onClick={() => openEditCurso(c)} className="p-2 text-blue-600 hover:bg-blue-50 rounded" title={t("admin.cursos.actions.edit", { defaultValue: "Editar" })}>
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => void handleDeleteCurso(c.id)} className="p-2 text-red-600 hover:bg-red-50 rounded" title={t("admin.cursos.actions.delete", { defaultValue: "Eliminar" })}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Assignment management */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Asignaciones docente por materia</h2>
            <p className="text-sm text-gray-500">Asigna docente por combinación materia + curso + ano escolar.</p>
          </div>
          {loadingAssignments && <Loader2 size={18} className="animate-spin text-blue-600" />}
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Buscar asignación</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  placeholder="Materia, curso, docente o ano"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Ano escolar</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={anioEscolarFilter}
                onChange={(e) => setAnioEscolarFilter(e.target.value)}
                placeholder="YYYY-YYYY"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyActiveAssignments}
                onChange={(e) => setOnlyActiveAssignments(e.target.checked)}
              />
              Solo activas
            </label>

            <button
              onClick={() => void handleApplyAssignmentFilters()}
              className="md:col-span-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              Aplicar filtros
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className="font-semibold mb-3">Crear asignación</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Materia</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={assignmentForm.materia_id}
                onChange={(e) => setAssignmentForm((prev) => ({ ...prev, materia_id: e.target.value }))}
              >
                <option value="">Seleccionar materia</option>
                {allMaterias.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.curso_nombre} - {materia.nombre}{materia.anio_escolar ? ` (${materia.anio_escolar})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Docente</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={assignmentForm.docente_id}
                onChange={(e) => setAssignmentForm((prev) => ({ ...prev, docente_id: e.target.value }))}
              >
                <option value="">Seleccionar docente</option>
                {teachers.map((u) => (
                  <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Ano escolar</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={assignmentForm.anio_escolar}
                onChange={(e) => setAssignmentForm((prev) => ({ ...prev, anio_escolar: e.target.value }))}
                placeholder="YYYY-YYYY"
              />
            </div>

            <button
              onClick={() => void handleCreateAssignment()}
              disabled={creatingAssignment}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creatingAssignment ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Crear
            </button>
          </div>
        </div>

        {filteredAsignaciones.length === 0 ? (
          <div className="text-center text-gray-500 p-8 bg-white rounded-lg shadow">
            No hay asignaciones para los filtros actuales.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Curso</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Materia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Docente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ano escolar</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAsignaciones.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.curso_nombre || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.materia_nombre || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{teacherLabelByID(item.docente_id, item.docente_nombre, item.docente_email)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.anio_escolar}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${item.activo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {item.activo ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEditAssignment(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded" title="Editar asignación">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => void handleDeleteAssignment(item)} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Eliminar asignación">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Bulk Assign Teacher Modal ───────────────────────── */}
      <Modal open={bulkAssignOpen} onClose={() => setBulkAssignOpen(false)} panelClassName="max-w-5xl">
        <div className="p-6 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Asignar maestro por año</h2>
              <p className="text-sm text-gray-500">
                {bulkCurso ? `Curso: ${bulkCurso.nombre}` : "Selecciona un curso"}
              </p>
            </div>
            <button onClick={() => setBulkAssignOpen(false)} className="p-1 hover:bg-gray-100 rounded">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Año destino</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={bulkTargetYear}
                onChange={(e) => handleBulkTargetYearChange(e.target.value)}
                placeholder="YYYY-YYYY"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Año origen</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                value={bulkSourceYear}
                readOnly
              />
            </div>

            <button
              onClick={() => bulkCurso && void loadBulkSourceData(bulkCurso.id, bulkSourceYear)}
              disabled={!bulkCurso || loadingBulkSourceMaterias}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingBulkSourceMaterias ? "Cargando..." : "Recargar materias origen"}
            </button>

            <button
              onClick={() => void handleRunBulkAssign()}
              disabled={!bulkCurso || loadingBulkSourceMaterias || runningBulkAssign}
              className="px-4 py-2 rounded-lg bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {runningBulkAssign ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Ejecutar asignación anual
            </button>
          </div>

          {loadingBulkSourceMaterias ? (
            <div className="py-10 text-center text-gray-500">
              <Loader2 size={22} className="animate-spin mx-auto mb-2 text-violet-600" />
              Cargando materias del año origen...
            </div>
          ) : bulkSourceMaterias.length === 0 ? (
            <div className="text-center text-gray-500 p-8 bg-gray-50 rounded-lg border border-gray-200">
              No se encontraron materias para {bulkSourceYear} en este curso.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Materia origen</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Año origen</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Docente destino</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bulkSourceMaterias.map((materia) => (
                    <tr key={materia.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{materia.nombre}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{materia.anio_escolar || bulkSourceYear}</td>
                      <td className="px-4 py-3">
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          value={bulkTeacherByMateria[materia.id] || ""}
                          onChange={(e) => setBulkTeacherByMateria((prev) => ({ ...prev, [materia.id]: e.target.value }))}
                        >
                          <option value="">Seleccionar docente</option>
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {teacher.display_name || teacher.email}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Create Materia Modal ───────────────────────────── */}
      <Modal open={createMateriaOpen} onClose={() => setCreateMateriaOpen(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Agregar Materia Manual</h2>
              <p className="text-sm text-gray-500">
                {createMateriaCurso ? `Curso: ${createMateriaCurso.nombre}` : "Selecciona un curso"}
              </p>
            </div>
            <button onClick={() => setCreateMateriaOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nombre de la materia</label>
              <input
                className="w-full px-3 py-2 border rounded-lg"
                value={createMateriaForm.nombre}
                onChange={(e) => setCreateMateriaForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej: Matematica"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Descripcion</label>
              <textarea
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                value={createMateriaForm.descripcion}
                onChange={(e) => setCreateMateriaForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Opcional"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Ano escolar</label>
                <input
                  className="w-full px-3 py-2 border rounded-lg"
                  value={createMateriaForm.anio_escolar}
                  onChange={(e) => setCreateMateriaForm((prev) => ({ ...prev, anio_escolar: e.target.value }))}
                  placeholder="YYYY-YYYY"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Orden</label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-3 py-2 border rounded-lg"
                  value={createMateriaForm.orden}
                  onChange={(e) => setCreateMateriaForm((prev) => ({ ...prev, orden: Number(e.target.value || 0) }))}
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createMateriaForm.activo}
                onChange={(e) => setCreateMateriaForm((prev) => ({ ...prev, activo: e.target.checked }))}
              />
              Materia activa
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setCreateMateriaOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button
              onClick={() => void handleCreateMateriaManual()}
              disabled={creatingMateria}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {creatingMateria ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Crear materia
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Create Course Modal ───────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t("admin.cursos.create.title", { defaultValue: "Crear Nuevo Curso" })}</h2>
            <button onClick={() => setCreateOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("admin.cursos.form.name", { defaultValue: "Nombre" })}</label>
              <input className="w-full px-3 py-2 border rounded-lg" value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("admin.cursos.form.description", { defaultValue: "Descripción" })}</label>
              <textarea className="w-full px-3 py-2 border rounded-lg" rows={3} value={createForm.descripcion} onChange={(e) => setCreateForm({ ...createForm, descripcion: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="create-activo" checked={createForm.activo} onChange={(e) => setCreateForm({ ...createForm, activo: e.target.checked })} />
              <label htmlFor="create-activo" className="text-sm">{t("admin.cursos.form.active", { defaultValue: "Activo" })}</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">{t("admin.cursos.cancel", { defaultValue: "Cancelar" })}</button>
            <button onClick={() => void handleCreateCurso()} disabled={creating} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {creating ? t("admin.cursos.creating", { defaultValue: "Creando..." }) : t("admin.cursos.create.button", { defaultValue: "Crear Curso" })}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Course Modal ─────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t("admin.cursos.edit.title", { defaultValue: "Editar Curso" })}</h2>
            <button onClick={() => setEditOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("admin.cursos.form.name", { defaultValue: "Nombre" })}</label>
              <input className="w-full px-3 py-2 border rounded-lg" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("admin.cursos.form.description", { defaultValue: "Descripción" })}</label>
              <textarea className="w-full px-3 py-2 border rounded-lg" rows={3} value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit-activo" checked={editForm.activo} onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })} />
              <label htmlFor="edit-activo" className="text-sm">{t("admin.cursos.form.active", { defaultValue: "Activo" })}</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">{t("admin.cursos.cancel", { defaultValue: "Cancelar" })}</button>
            <button onClick={() => void handleSaveEditCurso()} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("admin.cursos.saving", { defaultValue: "Guardando..." }) : t("admin.cursos.save", { defaultValue: "Guardar" })}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Enrollment Modal ──────────────────────────────── */}
      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{t("admin.cursos.enrollment.title", { defaultValue: "Estudiantes del Curso" })}</h2>
              {enrollCurso && <p className="text-sm text-gray-500">{enrollCurso.nombre}</p>}
            </div>
            <button onClick={() => setEnrollOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>

          {/* Currently enrolled */}
          <h3 className="text-sm font-medium text-gray-700 mb-2">{t("admin.cursos.enrollment.current", { defaultValue: "Inscritos" })} ({enrolledStudents.length})</h3>
          <div className="max-h-40 overflow-y-auto space-y-1 mb-4">
            {enrolledStudents.length === 0 ? (
              <p className="text-center text-gray-400 py-3 text-sm">{t("admin.cursos.enrollment.noStudents", { defaultValue: "Sin estudiantes inscritos" })}</p>
            ) : (
              enrolledStudents.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">{e.display_name || e.email}</p>
                    {e.display_name && <p className="text-xs text-gray-400">{e.email}</p>}
                  </div>
                  <button
                    onClick={() => void handleAdminUnenroll(e.id, e.display_name || e.email)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add students */}
          <h3 className="text-sm font-medium text-gray-700 mb-2">{t("admin.cursos.enrollment.add", { defaultValue: "Agregar estudiante" })}</h3>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder={t("admin.cursos.enrollment.searchPlaceholder", { defaultValue: "Buscar estudiante..." })}
              value={enrollSearch}
              onChange={(e) => setEnrollSearch(e.target.value)}
            />
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {availableStudents.length === 0 ? (
              <p className="text-center text-gray-400 py-3 text-sm">{t("admin.cursos.enrollment.allEnrolled", { defaultValue: "No hay más estudiantes disponibles" })}</p>
            ) : (
              availableStudents.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">{s.display_name || s.email}</p>
                    {s.display_name && <p className="text-xs text-gray-400">{s.email}</p>}
                  </div>
                  <button
                    onClick={() => void handleAdminEnroll(s.id)}
                    disabled={enrollingId === s.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {enrollingId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {t("admin.cursos.enrollment.enroll", { defaultValue: "Inscribir" })}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* ── Edit Assignment Modal ─────────────────────────── */}
      <Modal open={assignmentEditOpen} onClose={() => setAssignmentEditOpen(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Editar Asignación</h2>
            <button onClick={() => setAssignmentEditOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>

          {editingAssignment && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p><span className="font-medium">Curso:</span> {editingAssignment.curso_nombre || "—"}</p>
                <p><span className="font-medium">Materia:</span> {editingAssignment.materia_nombre || "—"}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Docente</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg"
                  value={assignmentEditForm.docente_id}
                  onChange={(e) => setAssignmentEditForm((prev) => ({ ...prev, docente_id: e.target.value }))}
                >
                  <option value="">Seleccionar docente</option>
                  {teachers.map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Ano escolar</label>
                <input
                  className="w-full px-3 py-2 border rounded-lg"
                  value={assignmentEditForm.anio_escolar}
                  onChange={(e) => setAssignmentEditForm((prev) => ({ ...prev, anio_escolar: e.target.value }))}
                  placeholder="YYYY-YYYY"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="assignment-edit-active"
                  checked={assignmentEditForm.activo}
                  onChange={(e) => setAssignmentEditForm((prev) => ({ ...prev, activo: e.target.checked }))}
                />
                <label htmlFor="assignment-edit-active" className="text-sm">Asignación activa</label>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setAssignmentEditOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={() => void handleSaveAssignment()} disabled={savingAssignment} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingAssignment ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
