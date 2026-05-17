import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpenText, Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { API_BASE_URL, isMissingRouteError } from "@/shared/lib/api";
import type { ApiError } from "@/shared/lib/api";
import { listLibroRecursos, type LibroRecursoListItem } from "@/features/resources/services/libroRecursos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "Error inesperado";
}

export default function StudentRecursos() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [compatWarning, setCompatWarning] = useState<string | null>(null);
  const [items, setItems] = useState<LibroRecursoListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
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
        if (me.role !== "student") {
          navigate("/");
          return;
        }
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [navigate]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const load = useCallback(async (targetPage = page) => {
    setLoading(true);
    setCompatWarning(null);
    try {
      const res = await listLibroRecursos({
        q: q.trim() || undefined,
        estado: "completado",
        es_publico: true,
        page: targetPage,
        page_size: pageSize,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      if (isMissingRouteError(err)) {
        setCompatWarning(
          `El backend activo en ${API_BASE_URL} no expone /libro-recursos. ` +
          "Parece una instancia desactualizada. Reinicia el backend actual.",
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
  }, [page, q]);

  useEffect(() => {
    if (checkingAuth) return;
    void load();
  }, [checkingAuth, load]);

  if (checkingAuth) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <section className="rounded-3xl bg-gradient-to-r from-blue-700 via-cyan-700 to-teal-700 text-white p-6 mb-5 shadow-xl">
        <h1 className="text-2xl md:text-3xl font-semibold">Recursos del libro</h1>
        <p className="mt-2 text-cyan-100">Explora recursos analizados y abre su visor con chat MCP estudiantil.</p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setPage(1);
                  void load(1);
                }
              }}
              placeholder="Buscar por titulo"
              className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              void load(1);
            }}
            className="rounded-xl bg-slate-900 text-white px-4 py-2.5 hover:bg-slate-800"
          >
            Buscar
          </button>
        </div>
      </section>

      {compatWarning && (
        <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          <p className="font-semibold">Compatibilidad backend detectada</p>
          <p className="mt-1">{compatWarning}</p>
        </section>
      )}

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No hay recursos disponibles con los filtros actuales.
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
              </div>
              <button
                type="button"
                onClick={() => navigate(`/student/recursos/${item.id}`)}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-700 text-white px-4 py-2.5 hover:from-blue-500 hover:to-cyan-600"
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
