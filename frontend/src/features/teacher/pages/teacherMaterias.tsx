import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, Link2, Loader2, Paperclip, Plus, Search } from "lucide-react";
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

function buildMateriaContextQuery(item: MisCursoDocente): string {
  const params = new URLSearchParams();
  params.set("materiaId", item.materia_id);
  params.set("materiaNombre", item.materia_nombre);
  params.set("cursoNombre", item.curso_nombre);
  params.set("anioEscolar", item.anio_escolar);
  return params.toString();
}

export default function TeacherMaterias() {
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

  const openRecursosPersonales = (item: MisCursoDocente) => {
    navigate(`/teacher/recursos-personales?${buildMateriaContextQuery(item)}`);
  };

  const openRecursosGlobales = (item: MisCursoDocente) => {
    navigate(`/teacher/recursos?${buildMateriaContextQuery(item)}`);
  };

  const openVistaTemas = (item: MisCursoDocente) => {
    navigate(`/contents/${item.materia_id}`);
  };

  const openCrearContenido = (item: MisCursoDocente) => {
    navigate(`/contents/${item.materia_id}?openCreate=1`);
  };

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
        <h1 className="text-2xl font-bold">{t("teacher.subjects.title", { defaultValue: "Mis materias" })}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("teacher.subjects.subtitle", { defaultValue: "Gestiona recursos por materia para construir la vista de temas para estudiantes." })}
        </p>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("teacher.subjects.search", { defaultValue: "Buscar por materia, curso o ano..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 p-10 bg-white rounded-lg shadow">
          <BookOpen size={42} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">
            {t("teacher.subjects.empty", { defaultValue: "No hay materias asignadas" })}
          </p>
          <p className="text-sm mt-1">
            {t("teacher.subjects.emptyHint", { defaultValue: "Solicita a administracion la asignacion por materia." })}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const metricItems = [
              {
                key: "students",
                label: t("teacher.cursos.metrics.students", { defaultValue: "Estudiantes" }),
                value: item.total_estudiantes,
              },
              {
                key: "lessons",
                label: t("teacher.cursos.metrics.lessons", { defaultValue: "Lecciones" }),
                value: item.total_lecciones,
              },
              {
                key: "tasks",
                label: t("teacher.cursos.metrics.tasks", { defaultValue: "Trabajos" }),
                value: item.total_trabajos,
              },
            ];

            return (
              <article
                key={item.asignacion_id}
                className="bg-white rounded-xl shadow p-4 border border-gray-100 hover:border-blue-300 hover:shadow-lg transition"
              >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h2 className="font-semibold text-gray-900">{item.materia_nombre}</h2>
                  <p className="text-sm text-gray-500">{item.curso_nombre}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                  {item.anio_escolar}
                </span>
              </div>

              <p className="text-xs text-slate-500 mt-1">
                {t("teacher.subjects.resourceHubHint", {
                  defaultValue: "Define recursos para preparar temas de clase y experiencia del estudiante.",
                })}
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {metricItems.map((metric) => (
                  <div key={`${item.asignacion_id}-${metric.key}`} className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-2 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{metric.label}</p>
                    <p className="text-sm font-semibold text-slate-800">{metric.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => openRecursosPersonales(item)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 transition"
                >
                  <Paperclip size={15} />
                  {t("teacher.subjects.actions.personalResources", { defaultValue: "Recursos personales" })}
                </button>

                <button
                  type="button"
                  onClick={() => openCrearContenido(item)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 text-white px-3 py-2 text-sm font-medium hover:bg-violet-700 transition"
                >
                  <Plus size={15} />
                  {t("teacher.subjects.actions.createContent", { defaultValue: "Crear contenido" })}
                </button>

                <button
                  type="button"
                  onClick={() => openRecursosGlobales(item)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700 transition"
                >
                  <Link2 size={15} />
                  {t("teacher.subjects.actions.globalResources", { defaultValue: "Recursos" })}
                </button>

                <button
                  type="button"
                  onClick={() => openVistaTemas(item)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 text-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-50 transition"
                >
                  <BookOpen size={15} />
                  {t("teacher.subjects.actions.viewTopics", { defaultValue: "Vista temas" })}
                  <ChevronRight size={14} />
                </button>
              </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
