import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import {
  Loader2, Search, Plus, Trash2, Users, X, FileSpreadsheet,
} from "lucide-react";
import type { Curso, EstudianteCursoDetail, Profile } from "@/shared/types";

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

export default function TeacherEstudiantes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [enrolled, setEnrolled] = useState<EstudianteCursoDetail[]>([]);
  const [search, setSearch] = useState("");

  // Enroll modal
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<Profile[]>([]);
  const [enrollSearch, setEnrollSearch] = useState("");
  const [enrolling, setEnrolling] = useState<string | null>(null);

  /* ── Load data ─────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        // Fetch teacher's courses (backend filters by teacher_id for teacher role)
        const cursosRes = await api.get<{ data: Curso[] }>("/cursos");
        const cursos = cursosRes.data || [];
        if (cursos.length === 0) {
          setCurso(null);
          setLoading(false);
          return;
        }
        const myCurso = cursos[0]; // teacher has at most 1 course (UNIQUE constraint)
        if (!myCurso) {
          setLoading(false);
          return;
        }
        setCurso(myCurso);
        const enrolledRes = await api.get<{ data: EstudianteCursoDetail[] }>(`/cursos/${myCurso.id}/estudiantes`);
        setEnrolled(enrolledRes.data || []);
      } catch {
        toast.error(t("teacher.estudiantes.errors.loadError", { defaultValue: "Error al cargar datos" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  /* ── Open enroll modal ──────────────────────────────────── */
  const openEnrollModal = async () => {
    setEnrollOpen(true);
    setEnrollSearch("");
    try {
      const res = await api.get<{ data: Profile[] }>("/students");
      setAllStudents(res.data || []);
    } catch {
      toast.error(t("teacher.estudiantes.errors.loadStudents", { defaultValue: "Error al cargar estudiantes" }));
    }
  };

  /* ── Available students (exclude already enrolled) ──────── */
  const enrolledIds = useMemo(() => new Set(enrolled.map((e) => e.estudiante_id)), [enrolled]);

  const available = useMemo(() => {
    const q = enrollSearch.toLowerCase();
    return allStudents
      .filter((s) => !enrolledIds.has(s.id))
      .filter((s) => {
        const name = (s.display_name || "").toLowerCase();
        return name.includes(q) || s.email.toLowerCase().includes(q);
      });
  }, [allStudents, enrolledIds, enrollSearch]);

  /* ── Enroll ─────────────────────────────────────────────── */
  const handleEnroll = async (studentId: string) => {
    if (!curso) return;
    setEnrolling(studentId);
    try {
      await api.post(`/cursos/${curso.id}/estudiantes`, { estudiante_id: studentId, curso_id: curso.id });
      // Refresh enrolled list
      const res = await api.get<{ data: EstudianteCursoDetail[] }>(`/cursos/${curso.id}/estudiantes`);
      setEnrolled(res.data || []);
      toast.success(t("teacher.estudiantes.success.enrolled", { defaultValue: "Estudiante inscrito" }));
    } catch {
      toast.error(t("teacher.estudiantes.errors.enrollError", { defaultValue: "Error al inscribir" }));
    } finally {
      setEnrolling(null);
    }
  };

  /* ── Unenroll ───────────────────────────────────────────── */
  const handleUnenroll = async (enrollmentId: string, name: string) => {
    if (!curso) return;
    if (!confirm(t("teacher.estudiantes.confirmUnenroll", { nombre: name, defaultValue: `¿Desinscribir a "${name}"?` }))) return;
    try {
      await api.delete(`/cursos/${curso.id}/estudiantes/${enrollmentId}`);
      setEnrolled((prev) => prev.filter((e) => e.id !== enrollmentId));
      toast.success(t("teacher.estudiantes.success.unenrolled", { defaultValue: "Estudiante desinscrito" }));
    } catch {
      toast.error(t("teacher.estudiantes.errors.unenrollError", { defaultValue: "Error al desinscribir" }));
    }
  };

  /* ── Filtered enrolled ──────────────────────────────────── */
  const filteredEnrolled = useMemo(() => {
    const q = search.toLowerCase();
    return enrolled.filter((e) => {
      const name = (e.display_name || "").toLowerCase();
      return name.includes(q) || e.email.toLowerCase().includes(q);
    });
  }, [enrolled, search]);

  /* ── Render ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!curso) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center text-gray-500 p-12 bg-white rounded-lg shadow">
          <Users size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">{t("teacher.estudiantes.noCurso", { defaultValue: "No tienes un curso asignado" })}</p>
          <p className="text-sm mt-1">{t("teacher.estudiantes.noCursoDesc", { defaultValue: "Contacta a un administrador para que te asigne un curso." })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("teacher.estudiantes.title", { defaultValue: "Mis Estudiantes" })}</h1>
          <p className="text-sm text-gray-500">{curso.nombre} — {enrolled.length} {t("teacher.estudiantes.enrolled", { defaultValue: "inscritos" })}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/teacher/bulk-import")} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
            <FileSpreadsheet size={16} /> Importar Excel
          </button>
          <button onClick={openEnrollModal} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            <Plus size={16} /> {t("teacher.estudiantes.enroll", { defaultValue: "Inscribir" })}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("teacher.estudiantes.searchPlaceholder", { defaultValue: "Buscar por nombre o email..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {filteredEnrolled.length === 0 ? (
        <div className="text-center text-gray-500 p-8 bg-white rounded-lg shadow">
          <Users size={40} className="mx-auto mb-2 text-gray-300" />
          {enrolled.length === 0
            ? t("teacher.estudiantes.empty", { defaultValue: "Aún no hay estudiantes inscritos" })
            : t("teacher.estudiantes.noResults", { defaultValue: "Sin resultados" })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("teacher.estudiantes.table.name", { defaultValue: "Nombre" })}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("teacher.estudiantes.table.email", { defaultValue: "Email" })}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("teacher.estudiantes.table.enrolledAt", { defaultValue: "Inscrito el" })}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("teacher.estudiantes.table.actions", { defaultValue: "Acciones" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEnrolled.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{e.display_name || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleUnenroll(e.id, e.display_name || e.email)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title={t("teacher.estudiantes.unenroll", { defaultValue: "Desinscribir" })}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Enroll Modal ──────────────────────────────── */}
      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t("teacher.estudiantes.enrollModal.title", { defaultValue: "Inscribir Estudiante" })}</h2>
            <button onClick={() => setEnrollOpen(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>

          {/* Search within modal */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              placeholder={t("teacher.estudiantes.enrollModal.search", { defaultValue: "Buscar estudiante..." })}
              value={enrollSearch}
              onChange={(e) => setEnrollSearch(e.target.value)}
            />
          </div>

          {/* Student list */}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {available.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">
                {allStudents.length === 0
                  ? t("teacher.estudiantes.enrollModal.noStudents", { defaultValue: "No hay estudiantes registrados" })
                  : t("teacher.estudiantes.enrollModal.allEnrolled", { defaultValue: "Todos los estudiantes ya están inscritos" })}
              </p>
            ) : (
              available.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                  <div>
                    <p className="font-medium text-sm">{s.display_name || s.email}</p>
                    {s.display_name && <p className="text-xs text-gray-400">{s.email}</p>}
                  </div>
                  <button
                    onClick={() => handleEnroll(s.id)}
                    disabled={enrolling === s.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {enrolling === s.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {t("teacher.estudiantes.enrollModal.add", { defaultValue: "Inscribir" })}
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
