import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import {
  Loader2, Trash2, Search, Plus, Pencil, BookOpen, X, UserCheck, Users, FileSpreadsheet,
} from "lucide-react";
import type { Curso, EstudianteCursoDetail } from "@/shared/types";
import type { Profile } from "@/shared/types";

/* ── Modal wrapper ──────────────────────────────────────── */
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", descripcion: "", teacher_id: "", activo: true });
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editCurso, setEditCurso] = useState<Curso | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", descripcion: "", teacher_id: "", activo: true });
  const [saving, setSaving] = useState(false);

  // Enrollment modal
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCurso, setEnrollCurso] = useState<Curso | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EstudianteCursoDetail[]>([]);
  const [allStudents, setAllStudents] = useState<Profile[]>([]);
  const [enrollSearch, setEnrollSearch] = useState("");
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        const [cursosRes, usersRes] = await Promise.all([
          api.get<{ data: Curso[] }>("/cursos"),
          api.get<{ data: Profile[] }>("/admin/users"),
        ]);
        setCursos(cursosRes.data || []);
        setTeachers((usersRes.data || []).filter((u) => u.role === "teacher"));
      } catch {
        toast.error(t("admin.cursos.errors.loadError", { defaultValue: "Error al cargar cursos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  /* ── Helpers ─────────────────────────────────────────── */
  const teacherName = (teacherId: string | null) => {
    if (!teacherId) return null;
    const teacher = teachers.find((u) => u.id === teacherId);
    return teacher ? (teacher.display_name || teacher.email) : null;
  };

  // Teachers already assigned to a course (excluding current edit)
  const assignedTeacherIds = useMemo(() => {
    const editId = editCurso?.id;
    return new Set(cursos.filter((c) => c.teacher_id && c.id !== editId).map((c) => c.teacher_id!));
  }, [cursos, editCurso]);

  const availableTeachers = useMemo(() => {
    return teachers.filter((t) => !assignedTeacherIds.has(t.id));
  }, [teachers, assignedTeacherIds]);

  /* ── Filtered ─────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return cursos.filter((c) => {
      const tName = teacherName(c.teacher_id) || "";
      return (
        c.nombre.toLowerCase().includes(q) ||
        (c.descripcion || "").toLowerCase().includes(q) ||
        tName.toLowerCase().includes(q)
      );
    });
  }, [cursos, search, teachers]);

  /* ── Create ───────────────────────────────────────────── */
  const handleCreate = async () => {
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
      if (createForm.teacher_id) body.teacher_id = createForm.teacher_id;
      const res = await api.post<{ data: Curso }>("/cursos", body);
      if (res.data?.id) {
        setCursos((prev) => [...prev, res.data]);
      }
      toast.success(t("admin.cursos.success.created", { defaultValue: "Curso creado" }));
      setCreateOpen(false);
      setCreateForm({ nombre: "", descripcion: "", teacher_id: "", activo: true });
    } catch {
      toast.error(t("admin.cursos.errors.createError", { defaultValue: "Error al crear curso" }));
    } finally {
      setCreating(false);
    }
  };

  /* ── Edit ──────────────────────────────────────────────── */
  const openEdit = (c: Curso) => {
    setEditCurso(c);
    setEditForm({
      nombre: c.nombre,
      descripcion: c.descripcion || "",
      teacher_id: c.teacher_id || "",
      activo: c.activo,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editCurso) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nombre: editForm.nombre,
        descripcion: editForm.descripcion || null,
        teacher_id: editForm.teacher_id || "",
        activo: editForm.activo,
      };
      const res = await api.put<{ data: Curso }>(`/cursos/${editCurso.id}`, body);
      if (res.data) {
        setCursos((prev) => prev.map((c) => (c.id === editCurso.id ? res.data : c)));
      }
      toast.success(t("admin.cursos.success.updated", { defaultValue: "Curso actualizado" }));
      setEditOpen(false);
      setEditCurso(null);
    } catch {
      toast.error(t("admin.cursos.errors.updateError", { defaultValue: "Error al actualizar" }));
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ───────────────────────────────────────────── */
  const handleDelete = async (id: string) => {
    const curso = cursos.find((c) => c.id === id);
    if (!confirm(t("admin.cursos.confirmDelete", { nombre: curso?.nombre ?? "", defaultValue: `¿Eliminar "${curso?.nombre}"?` }))) return;
    try {
      await api.delete(`/cursos/${id}`);
      setCursos((prev) => prev.filter((c) => c.id !== id));
      toast.success(t("admin.cursos.success.deleted", { defaultValue: "Curso eliminado" }));
    } catch {
      toast.error(t("admin.cursos.errors.deleteError", { defaultValue: "Error al eliminar" }));
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
    } catch {
      toast.error(t("admin.cursos.enrollment.loadError", { defaultValue: "Error al cargar estudiantes" }));
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
    } catch {
      toast.error(t("admin.cursos.enrollment.enrollError", { defaultValue: "Error al inscribir" }));
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
    } catch {
      toast.error(t("admin.cursos.enrollment.unenrollError", { defaultValue: "Error al desinscribir" }));
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
          <p className="text-sm text-gray-500">{t("admin.cursos.description", { defaultValue: "Administra cursos y asigna profesores" })}</p>
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
          placeholder={t("admin.cursos.search", { defaultValue: "Buscar por nombre, descripción o profesor..." })}
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
          <p className="text-2xl font-bold text-amber-600">{cursos.filter((c) => c.teacher_id).length}</p>
          <p className="text-xs text-gray-500">{t("admin.cursos.stats.assigned", { defaultValue: "Con profesor" })}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3 text-center">
          <p className="text-2xl font-bold text-gray-400">{cursos.filter((c) => !c.teacher_id).length}</p>
          <p className="text-xs text-gray-500">{t("admin.cursos.stats.unassigned", { defaultValue: "Sin profesor" })}</p>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.cursos.table.teacher", { defaultValue: "Profesor" })}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.cursos.table.status", { defaultValue: "Estado" })}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("admin.cursos.table.actions", { defaultValue: "Acciones" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const tName = teacherName(c.teacher_id);
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.nombre}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{c.descripcion || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {tName ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <UserCheck size={14} /> {tName}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">{t("admin.cursos.noTeacher", { defaultValue: "Sin asignar" })}</span>
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
                        <button onClick={() => openEnrollmentModal(c)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded" title={t("admin.cursos.actions.students", { defaultValue: "Estudiantes" })}>
                          <Users size={16} />
                        </button>
                        <button onClick={() => openEdit(c)} className="p-2 text-blue-600 hover:bg-blue-50 rounded" title={t("admin.cursos.actions.edit", { defaultValue: "Editar" })}>
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="p-2 text-red-600 hover:bg-red-50 rounded" title={t("admin.cursos.actions.delete", { defaultValue: "Eliminar" })}>
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

      {/* ── Create Modal ──────────────────────────────── */}
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
            <div>
              <label className="block text-sm font-medium mb-1">{t("admin.cursos.form.teacher", { defaultValue: "Profesor asignado" })}</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={createForm.teacher_id} onChange={(e) => setCreateForm({ ...createForm, teacher_id: e.target.value })}>
                <option value="">{t("admin.cursos.form.noTeacher", { defaultValue: "— Sin asignar —" })}</option>
                {availableTeachers.map((u) => (
                  <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="create-activo" checked={createForm.activo} onChange={(e) => setCreateForm({ ...createForm, activo: e.target.checked })} />
              <label htmlFor="create-activo" className="text-sm">{t("admin.cursos.form.active", { defaultValue: "Activo" })}</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">{t("admin.cursos.cancel", { defaultValue: "Cancelar" })}</button>
            <button onClick={handleCreate} disabled={creating} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {creating ? t("admin.cursos.creating", { defaultValue: "Creando..." }) : t("admin.cursos.create.button", { defaultValue: "Crear Curso" })}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Modal ────────────────────────────────── */}
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
            <div>
              <label className="block text-sm font-medium mb-1">{t("admin.cursos.form.teacher", { defaultValue: "Profesor asignado" })}</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editForm.teacher_id} onChange={(e) => setEditForm({ ...editForm, teacher_id: e.target.value })}>
                <option value="">{t("admin.cursos.form.noTeacher", { defaultValue: "— Sin asignar —" })}</option>
                {/* Show current teacher (even if already assigned) + available ones */}
                {teachers.filter((u) => u.id === editForm.teacher_id || !assignedTeacherIds.has(u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit-activo" checked={editForm.activo} onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })} />
              <label htmlFor="edit-activo" className="text-sm">{t("admin.cursos.form.active", { defaultValue: "Activo" })}</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">{t("admin.cursos.cancel", { defaultValue: "Cancelar" })}</button>
            <button onClick={handleSaveEdit} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? t("admin.cursos.saving", { defaultValue: "Guardando..." }) : t("admin.cursos.save", { defaultValue: "Guardar" })}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Enrollment Modal ──────────────────────────── */}
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
                    onClick={() => handleAdminUnenroll(e.id, e.display_name || e.email)}
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
                    onClick={() => handleAdminEnroll(s.id)}
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
    </div>
  );
}
