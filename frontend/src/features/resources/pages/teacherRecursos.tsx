import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, BookOpenText, Globe2, Lock, Loader2, ArrowRight, Filter } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { API_BASE_URL, isMissingRouteError } from "@/shared/lib/api";
import type { ApiError } from "@/shared/lib/api";
import {
  listLibroRecursos,
  type EstadoLibroRecurso,
  type LibroRecursoListItem,
} from "@/features/resources/services/libroRecursos";

const ESTADOS: Array<{ value: "" | EstadoLibroRecurso; label: string }> = [
  { value: "", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "procesando", label: "Procesando" },
  { value: "completado", label: "Completado" },
  { value: "error", label: "Error" },
  { value: "archivado", label: "Archivado" },
];

function roleAllowed(role?: string): boolean {
  return ["teacher", "admin", "super_admin", "resource_manager"].includes(role || "");
}

function estadoBadge(estado: EstadoLibroRecurso): string {
  switch (estado) {
    case "completado":
      return "bg-emerald-100 text-emerald-700";
    case "procesando":
      return "bg-sky-100 text-sky-700";
    case "error":
      return "bg-rose-100 text-rose-700";
    case "archivado":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-amber-100 text-amber-700";
  }
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "Error inesperado";
}

interface MateriaContext {
  materiaId: string;
  materiaNombre: string;
  cursoNombre: string;
  anioEscolar: string;
}

function resolveMateriaContext(searchParams: URLSearchParams): MateriaContext | null {
  const materiaId = searchParams.get("materiaId")?.trim();
  if (!materiaId) return null;

  return {
    materiaId,
    materiaNombre: searchParams.get("materiaNombre")?.trim() || "Materia",
    cursoNombre: searchParams.get("cursoNombre")?.trim() || "Curso",
    anioEscolar: searchParams.get("anioEscolar")?.trim() || "",
  };
}

function buildMateriaContextQuery(context: MateriaContext): string {
  const params = new URLSearchParams();
  params.set("materiaId", context.materiaId);
  params.set("materiaNombre", context.materiaNombre);
  params.set("cursoNombre", context.cursoNombre);
  if (context.anioEscolar) {
    params.set("anioEscolar", context.anioEscolar);
  }
  return params.toString();
}

export default function TeacherRecursos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const materiaContext = useMemo(() => resolveMateriaContext(searchParams), [searchParams]);
  const materiaContextLabel = useMemo(() => {
    if (!materiaContext) return "";
    const yearSuffix = materiaContext.anioEscolar ? ` (${materiaContext.anioEscolar})` : "";
    return `${materiaContext.materiaNombre} - ${materiaContext.cursoNombre}${yearSuffix}`;
  }, [materiaContext]);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [compatWarning, setCompatWarning] = useState<string | null>(null);
  const [items, setItems] = useState<LibroRecursoListItem[]>([]);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"" | EstadoLibroRecurso>("");
  const [esPublico, setEsPublico] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    (async () => {
      setCheckingAuth(true);
      try {
        const me = await getMe();
        if (!me) {
          navigate("/login");
          return;
        }
        if (!roleAllowed(me.role)) {
          navigate("/");
          return;
        }
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [navigate]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const load = useCallback(async () => {
    setLoading(true);
    setCompatWarning(null);
    try {
      const res = await listLibroRecursos({
        q: q.trim() || undefined,
        estado: estado || undefined,
        es_publico: esPublico === "all" ? undefined : esPublico === "true",
        page,
        page_size: pageSize,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      if (isMissingRouteError(err)) {
        setCompatWarning(
          `El backend activo en ${API_BASE_URL} no expone /libro-recursos. ` +
          "Parece una instancia desactualizada. Cierra procesos previos de go run y reinicia el backend actual.",
        );
      }
      const apiErr = err as ApiError;
      if (apiErr?.status === 400) {
        toast.error(apiErr.message || "No autorizado");
      } else {
        toast.error(normalizeError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [esPublico, estado, page, q]);

  useEffect(() => {
    if (checkingAuth) return;
    void load();
  }, [checkingAuth, load]);

  const onApplyFilters = async () => {
    setPage(1);
    await load();
  };

  if (checkingAuth) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 animate-fade-in-up">
      <section className="relative overflow-hidden rounded-3xl p-6 md:p-8 mb-6 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-700 text-white shadow-xl">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -left-8 -bottom-8 h-40 w-40 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="uppercase tracking-[0.24em] text-xs text-cyan-100/90">Centro de recursos</p>
            <h1 className="text-2xl md:text-3xl font-semibold mt-1">Biblioteca de Libros Reutilizables</h1>
            <p className="text-cyan-100/90 mt-2 text-sm md:text-base">Explora, filtra y abre recursos por página con modo protegido.</p>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-white/15 border border-white/25 text-sm">
            Total catalogo: <span className="font-semibold">{total}</span>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-md border border-slate-100 p-4 md:p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <label className="md:col-span-6">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Buscar</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Titulo del libro"
                className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </label>

          <label className="md:col-span-3">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Estado</span>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as "" | EstadoLibroRecurso)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ESTADOS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Visibilidad</span>
            <select
              value={esPublico}
              onChange={(e) => setEsPublico(e.target.value as "all" | "true" | "false")}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas</option>
              <option value="true">Publicas</option>
              <option value="false">Privadas</option>
            </select>
          </label>

          <button
            onClick={() => void onApplyFilters()}
            className="md:col-span-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2.5 hover:bg-slate-800 transition-colors"
          >
            <Filter className="h-4 w-4" />
            <span className="md:hidden">Filtrar</span>
          </button>
        </div>
      </section>

      {compatWarning && (
        <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          <p className="font-semibold">Compatibilidad backend detectada</p>
          <p className="mt-1">{compatWarning}</p>
        </section>
      )}

      {materiaContext && (
        <section className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
          <p className="text-xs uppercase tracking-[0.2em]">Contexto de materia</p>
          <p className="font-semibold mt-1">{materiaContextLabel}</p>
          <p className="text-sm mt-1">Esta biblioteca sigue siendo global. Usa el acceso rápido para gestionar recursos personales de esta materia.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate(`/teacher/recursos-personales?${buildMateriaContextQuery(materiaContext)}`)}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              Ir a Recursos personales
            </button>
            <button
              type="button"
              onClick={() => navigate("/teacher/materias")}
              className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-sm font-medium hover:bg-indigo-100"
            >
              Volver a Mis materias
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No hay recursos para los filtros seleccionados.
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item, idx) => (
            <article
              key={item.id}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up"
              style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${estadoBadge(item.estado)}`}>{item.estado}</span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  {item.es_publico ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {item.es_publico ? "Publico" : "Privado"}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-slate-900 line-clamp-2 min-h-[3.5rem]">{item.titulo}</h3>
              <p className="text-sm text-slate-600 mt-1 line-clamp-2 min-h-[2.5rem]">{item.descripcion || "Sin descripcion"}</p>

              <div className="mt-4 text-xs text-slate-500 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1"><BookOpenText className="h-3.5 w-3.5" /> Preguntas</span>
                  <span className="font-medium text-slate-700">{item.preguntas_totales}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Paginas</span>
                  <span className="font-medium text-slate-700">{item.paginas_totales || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Idioma</span>
                  <span className="font-medium text-slate-700 uppercase">{item.idioma}</span>
                </div>
              </div>

              <button
                onClick={() => navigate(`/teacher/recursos/${item.id}`)}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 text-white px-4 py-2.5 hover:from-cyan-500 hover:to-blue-600 transition-colors"
              >
                Abrir visor
                <ArrowRight className="h-4 w-4" />
              </button>
            </article>
          ))}
        </section>
      )}

      <section className="mt-6 flex items-center justify-between gap-3">
        <button
          disabled={page <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        <p className="text-sm text-slate-600">Pagina {page} de {totalPages}</p>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente
        </button>
      </section>
    </main>
  );
}
