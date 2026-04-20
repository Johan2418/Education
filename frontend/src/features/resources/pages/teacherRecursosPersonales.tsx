import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Loader2,
  Plus,
  Search,
  Link2,
  Code2,
  FileText,
  Pencil,
  Trash2,
  Paperclip,
} from "lucide-react";

import { getMe } from "@/shared/lib/auth";
import {
  attachRecursoPersonalToMateria,
  attachRecursoPersonalToSeccion,
  attachRecursoPersonalToTrabajo,
  createRecursoPersonal,
  deleteRecursoPersonal,
  detachRecursoPersonalFromMateria,
  detachRecursoPersonalFromSeccion,
  detachRecursoPersonalFromTrabajo,
  listMateriaRecursosPersonales,
  listRecursosPersonales,
  listSeccionRecursosPersonales,
  listTrabajoRecursosPersonales,
  type RecursoPersonal,
  type RecursoPersonalPayload,
  type RecursoPersonalTipo,
  updateRecursoPersonal,
} from "@/features/resources/services/personalRecursos";

type ScopeType = "materia" | "seccion" | "trabajo";

interface ScopeContext {
  type: ScopeType;
  id: string;
  label: string;
}

interface RecursoPersonalFormState {
  titulo: string;
  descripcion: string;
  tipo: RecursoPersonalTipo;
  url: string;
  html_contenido: string;
  texto_contenido: string;
  tags: string;
  activo: boolean;
}

const TIPO_OPTIONS: Array<{ value: RecursoPersonalTipo; label: string }> = [
  { value: "presentacion", label: "Presentación" },
  { value: "documento", label: "Documento" },
  { value: "video_url", label: "Video URL" },
  { value: "enlace", label: "Enlace externo" },
  { value: "html_embed", label: "HTML embebido" },
  { value: "texto", label: "Texto" },
];

function roleAllowed(role?: string): boolean {
  return ["teacher", "admin", "super_admin"].includes(role || "");
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "Error inesperado";
}

function emptyFormState(): RecursoPersonalFormState {
  return {
    titulo: "",
    descripcion: "",
    tipo: "documento",
    url: "",
    html_contenido: "",
    texto_contenido: "",
    tags: "",
    activo: true,
  };
}

function toFormState(item: RecursoPersonal): RecursoPersonalFormState {
  return {
    titulo: item.titulo,
    descripcion: item.descripcion || "",
    tipo: item.tipo,
    url: item.url || "",
    html_contenido: item.html_contenido || "",
    texto_contenido: item.texto_contenido || "",
    tags: (item.tags || []).join(", "),
    activo: item.activo,
  };
}

function resolveScope(searchParams: URLSearchParams): ScopeContext | null {
  const materiaId = searchParams.get("materiaId")?.trim();
  if (materiaId) {
    return { type: "materia", id: materiaId, label: `Materia ${materiaId.slice(0, 8)}...` };
  }

  const seccionId = searchParams.get("seccionId")?.trim();
  if (seccionId) {
    return { type: "seccion", id: seccionId, label: `Sección ${seccionId.slice(0, 8)}...` };
  }

  const trabajoId = searchParams.get("trabajoId")?.trim();
  if (trabajoId) {
    return { type: "trabajo", id: trabajoId, label: `Trabajo ${trabajoId.slice(0, 8)}...` };
  }

  return null;
}

function parseTags(rawTags: string): string[] {
  return rawTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function requiresURL(tipo: RecursoPersonalTipo): boolean {
  return tipo === "presentacion" || tipo === "documento" || tipo === "video_url" || tipo === "enlace";
}

function requiresHTML(tipo: RecursoPersonalTipo): boolean {
  return tipo === "html_embed";
}

function requiresTexto(tipo: RecursoPersonalTipo): boolean {
  return tipo === "texto";
}

export default function TeacherRecursosPersonales() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingAttachmentId, setSyncingAttachmentId] = useState<string | null>(null);

  const [items, setItems] = useState<RecursoPersonal[]>([]);
  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"all" | RecursoPersonalTipo>("all");
  const [activoFilter, setActivoFilter] = useState<"all" | "true" | "false">("all");

  const [showForm, setShowForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [form, setForm] = useState<RecursoPersonalFormState>(emptyFormState());

  const scope = useMemo(() => resolveScope(searchParams), [searchParams]);

  const loadRecursos = useCallback(async () => {
    setLoading(true);
    try {
      const recursos = await listRecursosPersonales({
        q: q.trim() || undefined,
        tipo: tipoFilter === "all" ? undefined : tipoFilter,
        activo: activoFilter === "all" ? undefined : activoFilter === "true",
      });
      setItems(recursos);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }, [activoFilter, q, tipoFilter]);

  const loadScopeAttachments = useCallback(async () => {
    if (!scope) {
      setAttachedIds(new Set());
      return;
    }

    try {
      let scopedItems: RecursoPersonal[] = [];
      if (scope.type === "materia") {
        scopedItems = await listMateriaRecursosPersonales(scope.id);
      } else if (scope.type === "seccion") {
        scopedItems = await listSeccionRecursosPersonales(scope.id);
      } else {
        scopedItems = await listTrabajoRecursosPersonales(scope.id);
      }

      setAttachedIds(new Set(scopedItems.map((item) => item.id)));
    } catch (err) {
      toast.error(normalizeError(err));
    }
  }, [scope]);

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

  useEffect(() => {
    if (checkingAuth) return;
    void loadRecursos();
  }, [checkingAuth, loadRecursos]);

  useEffect(() => {
    if (checkingAuth) return;
    void loadScopeAttachments();
  }, [checkingAuth, loadScopeAttachments]);

  const onOpenCreate = () => {
    setEditingItemId(null);
    setForm(emptyFormState());
    setShowForm(true);
  };

  const onOpenEdit = (item: RecursoPersonal) => {
    setEditingItemId(item.id);
    setForm(toFormState(item));
    setShowForm(true);
  };

  const onDelete = async (item: RecursoPersonal) => {
    const confirmed = window.confirm(`¿Eliminar el recurso "${item.titulo}"?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteRecursoPersonal(item.id);
      toast.success("Recurso personal eliminado");
      await loadRecursos();
      await loadScopeAttachments();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const onSubmitForm = async () => {
    const titulo = form.titulo.trim();
    if (!titulo) {
      toast.error("El título es obligatorio");
      return;
    }

    if (requiresURL(form.tipo) && !form.url.trim()) {
      toast.error("La URL es obligatoria para este tipo");
      return;
    }

    if (requiresHTML(form.tipo) && !form.html_contenido.trim()) {
      toast.error("El HTML embebido es obligatorio para este tipo");
      return;
    }

    if (requiresTexto(form.tipo) && !form.texto_contenido.trim()) {
      toast.error("El contenido de texto es obligatorio para este tipo");
      return;
    }

    const payload: RecursoPersonalPayload = {
      titulo,
      descripcion: form.descripcion.trim() || null,
      tipo: form.tipo,
      url: null,
      html_contenido: null,
      texto_contenido: null,
      tags: parseTags(form.tags),
      activo: form.activo,
    };

    if (requiresURL(form.tipo)) {
      payload.url = form.url.trim() || null;
    }
    if (requiresHTML(form.tipo)) {
      payload.html_contenido = form.html_contenido.trim() || null;
    }
    if (requiresTexto(form.tipo)) {
      payload.texto_contenido = form.texto_contenido.trim() || null;
    }

    setSaving(true);
    try {
      if (editingItemId) {
        await updateRecursoPersonal(editingItemId, payload);
        toast.success("Recurso personal actualizado");
      } else {
        await createRecursoPersonal(payload);
        toast.success("Recurso personal creado");
      }
      setShowForm(false);
      setEditingItemId(null);
      setForm(emptyFormState());
      await loadRecursos();
      await loadScopeAttachments();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const onToggleAttach = async (item: RecursoPersonal) => {
    if (!scope) return;

    setSyncingAttachmentId(item.id);
    try {
      const isAttached = attachedIds.has(item.id);

      if (scope.type === "materia") {
        if (isAttached) {
          await detachRecursoPersonalFromMateria(scope.id, item.id);
        } else {
          await attachRecursoPersonalToMateria(scope.id, item.id);
        }
      } else if (scope.type === "seccion") {
        if (isAttached) {
          await detachRecursoPersonalFromSeccion(scope.id, item.id);
        } else {
          await attachRecursoPersonalToSeccion(scope.id, item.id);
        }
      } else {
        if (isAttached) {
          await detachRecursoPersonalFromTrabajo(scope.id, item.id);
        } else {
          await attachRecursoPersonalToTrabajo(scope.id, item.id);
        }
      }

      toast.success(isAttached ? "Recurso desacoplado" : "Recurso acoplado");
      await loadScopeAttachments();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSyncingAttachmentId(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <section className="rounded-3xl p-6 md:p-8 mb-6 bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="uppercase tracking-[0.24em] text-xs text-emerald-100">Biblioteca docente</p>
            <h1 className="text-2xl md:text-3xl font-semibold mt-1">Recursos Personales</h1>
            <p className="text-emerald-100 mt-2 text-sm md:text-base">
              Gestiona tus recursos privados y acóplalos a materias, secciones o trabajos.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/teacher/lessons")}
              className="px-3 py-2 rounded-lg bg-white/15 border border-white/25 text-sm hover:bg-white/20"
            >
              Ir a lecciones
            </button>
            <button
              onClick={onOpenCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900/80 text-white rounded-lg hover:bg-slate-900"
            >
              <Plus size={16} /> Nuevo recurso
            </button>
          </div>
        </div>
      </section>

      {scope && (
        <section className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
          <p className="text-xs uppercase tracking-[0.2em]">Contexto de acople</p>
          <p className="font-semibold mt-1">{scope.label}</p>
          <p className="text-sm mt-1">Puedes acoplar o desacoplar recursos personales directamente desde esta pantalla.</p>
        </section>
      )}

      <section className="bg-white rounded-2xl shadow-md border border-slate-100 p-4 md:p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <label className="md:col-span-5">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Buscar</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Título o descripción"
                className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </label>

          <label className="md:col-span-3">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Tipo</span>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value as "all" | RecursoPersonalTipo)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todos</option>
              {TIPO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Estado</span>
            <select
              value={activoFilter}
              onChange={(e) => setActivoFilter(e.target.value as "all" | "true" | "false")}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </label>

          <button
            onClick={() => void loadRecursos()}
            className="md:col-span-2 rounded-xl bg-slate-900 text-white px-4 py-2.5 hover:bg-slate-800"
          >
            Aplicar filtros
          </button>
        </div>
      </section>

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No hay recursos personales para los filtros seleccionados.
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const isAttached = scope ? attachedIds.has(item.id) : false;
            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    {TIPO_OPTIONS.find((opt) => opt.value === item.tipo)?.label || item.tipo}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-full ${item.activo ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"}`}>
                    {item.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-slate-900 line-clamp-2 min-h-[3.5rem]">{item.titulo}</h3>
                <p className="text-sm text-slate-600 mt-1 min-h-[2.5rem] line-clamp-2">{item.descripcion || "Sin descripción"}</p>

                {item.url && (
                  <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
                    <Link2 size={14} /> Abrir URL
                  </a>
                )}

                {item.html_contenido && (
                  <p className="mt-2 text-xs text-slate-500 inline-flex items-center gap-1"><Code2 size={13} /> HTML embebido configurado</p>
                )}

                {item.texto_contenido && (
                  <p className="mt-2 text-xs text-slate-500 inline-flex items-center gap-1"><FileText size={13} /> Texto propio configurado</p>
                )}

                {!!item.tags?.length && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {scope && (
                    <button
                      onClick={() => void onToggleAttach(item)}
                      disabled={syncingAttachmentId === item.id}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded text-white disabled:opacity-50 ${
                        isAttached ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      <Paperclip size={14} />
                      {isAttached ? "Desacoplar" : "Acoplar"}
                    </button>
                  )}

                  <button
                    onClick={() => onOpenEdit(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Pencil size={14} /> Editar
                  </button>

                  <button
                    onClick={() => void onDelete(item)}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-lg font-semibold">{editingItemId ? "Editar recurso personal" : "Crear recurso personal"}</h2>
              <p className="text-sm text-slate-500 mt-1">Soporta presentación, documento, video URL, enlace, HTML embebido y texto.</p>
            </div>

            <div className="p-5 space-y-3">
              <label className="text-sm block">
                Título
                <input
                  value={form.titulo}
                  onChange={(e) => setForm((prev) => ({ ...prev, titulo: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm block">
                Descripción
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 min-h-[72px]"
                />
              </label>

              <label className="text-sm block">
                Tipo
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value as RecursoPersonalTipo }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  {TIPO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              {requiresURL(form.tipo) && (
                <label className="text-sm block">
                  URL
                  <input
                    value={form.url}
                    onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
              )}

              {requiresHTML(form.tipo) && (
                <label className="text-sm block">
                  HTML embebido
                  <textarea
                    value={form.html_contenido}
                    onChange={(e) => setForm((prev) => ({ ...prev, html_contenido: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 min-h-[120px] font-mono text-xs"
                  />
                </label>
              )}

              {requiresTexto(form.tipo) && (
                <label className="text-sm block">
                  Texto
                  <textarea
                    value={form.texto_contenido}
                    onChange={(e) => setForm((prev) => ({ ...prev, texto_contenido: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 min-h-[120px]"
                  />
                </label>
              )}

              <label className="text-sm block">
                Tags (separadas por coma)
                <input
                  value={form.tags}
                  onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                />
                Recurso activo
              </label>
            </div>

            <div className="px-5 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void onSubmitForm()}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : editingItemId ? "Actualizar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
