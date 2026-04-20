import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, Loader2, Search, Users } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import type { MisCursoDocente } from "@/shared/types";
import { listMisCursosDocente } from "@/features/teacher/services/docencia";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") return msg;
  }
  return "Error inesperado";
}

export default function TeacherMisCursos() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<MisCursoDocente[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        const data = await listMisCursosDocente();
        setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const filtered = useMemo(() => {
    const source = Array.isArray(items) ? items : [];
    const query = search.trim().toLowerCase();
    if (!query) return source;
    return source.filter((item) => {
      const materia = item.materia_nombre.toLowerCase();
      const curso = item.curso_nombre.toLowerCase();
      const anio = item.anio_escolar.toLowerCase();
      return materia.includes(query) || curso.includes(query) || anio.includes(query);
    });
  }, [items, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("teacher.cursos.title", { defaultValue: "Mis cursos" })}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("teacher.cursos.subtitle", { defaultValue: "Materias asignadas por ano escolar" })}
        </p>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("teacher.cursos.search", { defaultValue: "Buscar por materia, curso o ano..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 p-10 bg-white rounded-lg shadow">
          <BookOpen size={42} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">
            {t("teacher.cursos.empty", { defaultValue: "No hay materias asignadas" })}
          </p>
          <p className="text-sm mt-1">
            {t("teacher.cursos.emptyHint", { defaultValue: "Solicita a administracion la asignacion por materia." })}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <article key={item.asignacion_id} className="bg-white rounded-xl shadow p-4 border border-gray-100">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{item.materia_nombre}</h2>
                  <p className="text-sm text-gray-500">{item.curso_nombre}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                  {item.anio_escolar}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-lg bg-indigo-50 px-2 py-2 text-center">
                  <p className="text-[11px] text-indigo-700">{t("teacher.cursos.metrics.students", { defaultValue: "Estudiantes" })}</p>
                  <p className="text-lg font-bold text-indigo-800">{item.total_estudiantes}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">
                  <p className="text-[11px] text-emerald-700">{t("teacher.cursos.metrics.lessons", { defaultValue: "Lecciones" })}</p>
                  <p className="text-lg font-bold text-emerald-800">{item.total_lecciones}</p>
                </div>
                <div className="rounded-lg bg-amber-50 px-2 py-2 text-center">
                  <p className="text-[11px] text-amber-700">{t("teacher.cursos.metrics.tasks", { defaultValue: "Trabajos" })}</p>
                  <p className="text-lg font-bold text-amber-800">{item.total_trabajos}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => navigate(`/teacher/horario?asignacion=${encodeURIComponent(item.asignacion_id)}`)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  <CalendarDays size={14} />
                  {t("teacher.cursos.actions.schedule", { defaultValue: "Gestionar horario" })}
                </button>
                <button
                  onClick={() => navigate("/teacher/estudiantes")}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  <Users size={14} />
                  {t("teacher.cursos.actions.students", { defaultValue: "Estudiantes" })}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
