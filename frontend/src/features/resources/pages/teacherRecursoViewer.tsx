import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, ChevronLeft, ChevronRight, Loader2, MessageSquare, Plus, Send, Shield } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { API_BASE_URL, isMissingRouteError } from "@/shared/lib/api";
import type { ApiError } from "@/shared/lib/api";
import {
  createLibroChatSesion,
  getLibroChatReporte,
  getLibroRecursoDetalle,
  getLibroRecursoPagina,
  listLibroChatMensajes,
  listLibroChatSesiones,
  sendLibroChatMensaje,
  type LibroChatMessage,
  type LibroChatReportResponse,
  type LibroChatSession,
  type MCPToolCall,
  type LibroRecursoDetailResponse,
  type LibroRecursoPaginaResponse,
} from "@/features/resources/services/libroRecursos";

function roleAllowed(role?: string): boolean {
  return ["teacher", "admin", "super_admin", "resource_manager"].includes(role || "");
}

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "Error inesperado";
}

function formatDateTime(input?: string): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function inferSessionTitle(seed: string): string {
  const clean = seed.trim().replace(/\s+/g, " ");
  if (!clean) return "Nueva sesion";
  return clean.length > 54 ? `${clean.slice(0, 54)}...` : clean;
}

function extractToolCalls(metadata?: Record<string, unknown>): MCPToolCall[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => typeof item === "object" && item !== null) as MCPToolCall[];
}

export default function TeacherRecursoViewer() {
  const navigate = useNavigate();
  const { recursoId = "" } = useParams();
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [compatWarning, setCompatWarning] = useState<string | null>(null);
  const [detail, setDetail] = useState<LibroRecursoDetailResponse | null>(null);
  const [pageData, setPageData] = useState<LibroRecursoPaginaResponse | null>(null);
  const [page, setPage] = useState(1);

  const [chatSessions, setChatSessions] = useState<LibroChatSession[]>([]);
  const [chatMessages, setChatMessages] = useState<LibroChatMessage[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [chatLoadingSessions, setChatLoadingSessions] = useState(false);
  const [chatLoadingMessages, setChatLoadingMessages] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatReport, setChatReport] = useState<LibroChatReportResponse | null>(null);

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

  const load = useCallback(async (targetPage: number) => {
    if (!recursoId) return;
    setLoading(true);
    setCompatWarning(null);
    try {
      const [d, p] = await Promise.all([
        getLibroRecursoDetalle(recursoId),
        getLibroRecursoPagina(recursoId, targetPage),
      ]);
      setDetail(d);
      setPageData(p);
      setPage(targetPage);
    } catch (err) {
      if (isMissingRouteError(err)) {
        setCompatWarning(
          `El backend activo en ${API_BASE_URL} no expone los endpoints de recursos/chat. ` +
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
  }, [recursoId]);

  useEffect(() => {
    if (checkingAuth || !recursoId) return;
    void load(1);
  }, [checkingAuth, recursoId, load]);

  const loadChatMessages = useCallback(async (sessionId: string) => {
    if (!recursoId || !sessionId) return;
    setChatLoadingMessages(true);
    try {
      const messages = await listLibroChatMensajes(recursoId, sessionId, { limit: 120 });
      setChatMessages(messages);
      setSelectedSessionId(sessionId);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setChatLoadingMessages(false);
    }
  }, [recursoId]);

  const loadChatSessions = useCallback(async (preferredSessionId?: string) => {
    if (!recursoId) return;
    setChatLoadingSessions(true);
    try {
      const sessionsRes = await listLibroChatSesiones(recursoId, { limit: 25, offset: 0 });
      const items = sessionsRes.items || [];
      setChatSessions(items);

      const selected = preferredSessionId || selectedSessionId;
      const fallback = items[0]?.id;
      const nextSessionId = selected && items.some((it) => it.id === selected) ? selected : fallback;
      if (nextSessionId) {
        await loadChatMessages(nextSessionId);
      } else {
        setSelectedSessionId(null);
        setChatMessages([]);
      }
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setChatLoadingSessions(false);
    }
  }, [loadChatMessages, recursoId, selectedSessionId]);

  const loadChatReport = useCallback(async () => {
    if (!recursoId) return;
    try {
      const report = await getLibroChatReporte(recursoId, 5);
      setChatReport(report);
    } catch {
      // Keep viewer usable even if report endpoint is temporarily unavailable.
      setChatReport(null);
    }
  }, [recursoId]);

  useEffect(() => {
    if (checkingAuth || !recursoId) return;
    void loadChatSessions();
  }, [checkingAuth, recursoId, loadChatSessions]);

  useEffect(() => {
    if (checkingAuth || !recursoId) return;
    void loadChatReport();
  }, [checkingAuth, recursoId, loadChatReport]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatSending]);

  const createChatSession = async (titleSeed?: string): Promise<string | null> => {
    if (!recursoId) return null;
    try {
      const created = await createLibroChatSesion(recursoId, {
        titulo: titleSeed ? inferSessionTitle(titleSeed) : "Nueva sesion",
      });
      setSelectedSessionId(created.id);
      await loadChatSessions(created.id);
      return created.id;
    } catch (err) {
      toast.error(normalizeError(err));
      return null;
    }
  };

  const handleSendChat = async () => {
    const message = chatInput.trim();
    if (!message || !recursoId) return;

    setChatSending(true);
    try {
      let sessionId = selectedSessionId;
      if (!sessionId) {
        sessionId = await createChatSession(message);
      }
      if (!sessionId) {
        setChatSending(false);
        return;
      }

      await sendLibroChatMensaje(recursoId, sessionId, { mensaje: message });
      setChatInput("");

      const [messages, sessionsRes] = await Promise.all([
        listLibroChatMensajes(recursoId, sessionId, { limit: 120 }),
        listLibroChatSesiones(recursoId, { limit: 25, offset: 0 }),
      ]);
      setChatMessages(messages);
      setChatSessions(sessionsRes.items || []);
      setSelectedSessionId(sessionId);
      await loadChatReport();
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.status === 400) {
        toast.error(apiErr.message || "No se pudo enviar el mensaje");
      } else {
        toast.error(normalizeError(err));
      }
    } finally {
      setChatSending(false);
    }
  };

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      toast("Menu contextual deshabilitado en modo protegido");
    };
    const preventClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      toast("Accion deshabilitada en modo protegido");
    };
    const preventSelection = (e: Event) => {
      e.preventDefault();
    };
    const preventKeys = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const printScreenPressed = key === "printscreen";
      const blocked =
        (e.ctrlKey && key === "s") ||
        (e.ctrlKey && key === "p") ||
        (e.metaKey && key === "s") ||
        (e.metaKey && key === "p") ||
        (e.ctrlKey && e.shiftKey && ["i", "j", "c", "s"].includes(key)) ||
        (e.metaKey && e.altKey && ["i", "j", "c"].includes(key)) ||
        printScreenPressed;
      if (blocked || printScreenPressed) {
        e.preventDefault();
        if (printScreenPressed && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText("");
        }
        toast("Accion deshabilitada en modo protegido");
      }
    };

    const onBeforePrint = () => {
      toast("Impresion deshabilitada en modo protegido");
    };

    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("copy", preventClipboard);
    document.addEventListener("cut", preventClipboard);
    document.addEventListener("selectstart", preventSelection);
    document.addEventListener("dragstart", preventSelection);
    document.addEventListener("keydown", preventKeys);
    window.addEventListener("beforeprint", onBeforePrint);

    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("copy", preventClipboard);
      document.removeEventListener("cut", preventClipboard);
      document.removeEventListener("selectstart", preventSelection);
      document.removeEventListener("dragstart", preventSelection);
      document.removeEventListener("keydown", preventKeys);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, []);

  const avgLatencyLabel = useMemo(() => {
    if (!chatReport) return "-";
    if (!Number.isFinite(chatReport.latencia_promedio_ms)) return "-";
    return `${Math.round(chatReport.latencia_promedio_ms)} ms`;
  }, [chatReport]);

  const totalPaginas = useMemo(() => pageData?.total_paginas || detail?.paginas_totales || 1, [pageData, detail]);
  const controls = pageData?.controles;

  if (checkingAuth || loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!detail || !pageData) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate("/teacher/recursos")}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        {compatWarning ? (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
            <p className="font-semibold">Compatibilidad backend detectada</p>
            <p className="mt-1 text-sm">{compatWarning}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
            No se pudo cargar el recurso.
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 animate-fade-in-up">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate("/teacher/recursos")}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a recursos
        </button>
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-3 py-1 text-xs">
          <Shield className="h-3.5 w-3.5" /> Modo protegido
        </span>
      </div>

      <section className="rounded-3xl bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 text-white p-6 shadow-xl mb-5">
        <h1 className="text-2xl md:text-3xl font-semibold">{detail.titulo}</h1>
        <p className="text-cyan-100/90 mt-2 text-sm">{detail.descripcion || "Sin descripcion"}</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-cyan-100/75">Estado</p>
            <p className="font-medium uppercase">{detail.estado}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-cyan-100/75">Idioma</p>
            <p className="font-medium uppercase">{detail.idioma}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-cyan-100/75">Paginas</p>
            <p className="font-medium">{detail.paginas_totales || pageData.total_paginas}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-cyan-100/75">Preguntas</p>
            <p className="font-medium">{detail.preguntas_totales}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Pagina {pageData.pagina}</h2>
            <p className="text-xs text-slate-500">
              Controles activos:
              {controls?.disable_download ? " sin descarga" : " descarga permitida"},
              {controls?.disable_print ? " sin impresion" : " impresion permitida"},
              {controls?.disable_context_menu ? " sin menu contextual" : " menu contextual permitido"}
            </p>
          </div>

          <div className="relative min-h-[280px] p-5 bg-[radial-gradient(circle_at_top_right,_#ecfeff_0%,_#eff6ff_45%,_#f8fafc_100%)] select-none">
            {pageData.watermark.enabled && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10 text-slate-700 text-2xl md:text-4xl font-bold rotate-[-16deg]">
                  {pageData.watermark.text}
                </div>
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_52px,rgba(15,23,42,0.06)_52px,rgba(15,23,42,0.06)_53px)]" />
              </>
            )}

            <div className="relative z-10 space-y-3">
              {pageData.imagen_base64 ? (
                <figure className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                  <img src={pageData.imagen_base64} alt={`Pagina ${pageData.pagina}`} className="w-full rounded-lg" />
                </figure>
              ) : null}

              {pageData.contenido?.trim() ? (
                <article className="rounded-xl bg-white/90 border border-slate-200 p-4 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Contenido de la pagina</h3>
                  <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{pageData.contenido}</p>
                </article>
              ) : null}

              {pageData.preguntas.length === 0 ? (
                !pageData.contenido?.trim() && !pageData.imagen_base64 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 bg-white/80">
                    No hay contenido ni preguntas registradas para esta pagina.
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500 bg-white/80">
                    Esta pagina no tiene preguntas registradas, pero el contenido del libro si esta disponible.
                  </div>
                )
              ) : (
                pageData.preguntas.map((pregunta, idx) => (
                  <article key={pregunta.id} className="rounded-xl bg-white/85 border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700 uppercase">{pregunta.tipo}</span>
                      <span className="text-xs text-slate-500">#{idx + 1}</span>
                    </div>
                    <p className="text-slate-900 font-medium">{pregunta.texto}</p>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
            <button
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>

            <p className="text-sm text-slate-600">Pagina {page} de {Math.max(1, totalPaginas)}</p>

            <button
              disabled={page >= totalPaginas}
              onClick={() => void load(page + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <aside className="xl:col-span-1 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px] max-h-[78vh]">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Asistente MCP</p>
                <h2 className="text-sm font-semibold text-slate-900 mt-1 inline-flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-700" /> Chat del recurso
                </h2>
              </div>
              <button
                onClick={() => void createChatSession(`Consulta ${detail.titulo}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs hover:bg-slate-100"
                title="Crear nueva sesion"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva
              </button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {chatLoadingSessions ? (
                <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando sesiones...
                </span>
              ) : chatSessions.length === 0 ? (
                <span className="text-xs text-slate-500">Sin sesiones aun</span>
              ) : (
                chatSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => void loadChatMessages(session.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap ${
                      selectedSessionId === session.id
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    title={session.titulo || "Sesion"}
                  >
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {session.titulo || "Sesion"}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Vistas recurso</p>
                <p className="text-sm font-semibold text-slate-900">{chatReport?.vistas_recurso_total ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Usuarios unicos</p>
                <p className="text-sm font-semibold text-slate-900">{chatReport?.usuarios_vistas_total ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Sesiones</p>
                <p className="text-sm font-semibold text-slate-900">{chatReport?.sesiones_total ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Mensajes</p>
                <p className="text-sm font-semibold text-slate-900">{chatReport?.mensajes_total ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Fallback</p>
                <p className="text-sm font-semibold text-amber-700">{chatReport?.fallback_total ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Latencia prom.</p>
                <p className="text-sm font-semibold text-blue-700">{avgLatencyLabel}</p>
              </div>
            </div>

            {chatReport && chatReport.top_tools.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chatReport.top_tools.slice(0, 3).map((tool) => (
                  <span key={tool.name} className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px]">
                    {tool.name} ({tool.usage_count})
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#ffffff_50%)]">
            {chatLoadingMessages ? (
              <div className="h-full min-h-[220px] flex items-center justify-center text-slate-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando conversacion...
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="h-full min-h-[220px] flex items-center justify-center text-center">
                <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-slate-500 text-sm">
                  {selectedSessionId ? "Escribe tu primera consulta sobre este recurso." : "Crea una sesion para iniciar el chat."}
                </div>
              </div>
            ) : (
              chatMessages.map((message) => {
                const isUser = message.role === "user";
                const toolCalls = extractToolCalls(message.metadata);
                return (
                  <article key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[92%] rounded-2xl px-3 py-2 shadow-sm border ${
                        isUser
                          ? "bg-blue-600 text-white border-blue-500"
                          : "bg-white text-slate-900 border-slate-200"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <div className={`mt-2 text-[11px] ${isUser ? "text-blue-100" : "text-slate-500"}`}>
                        {formatDateTime(message.created_at)}
                      </div>
                      {!isUser && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          {message.model && <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">modelo {message.model}</span>}
                          {typeof message.latency_ms === "number" && (
                            <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{message.latency_ms} ms</span>
                          )}
                          {message.used_fallback && <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">fallback</span>}
                          {toolCalls.length > 0 && (
                            <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">tools {toolCalls.length}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            className="border-t border-slate-200 p-3 bg-white"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChat();
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Pregunta sobre contenidos, preguntas o paginas del libro..."
                rows={2}
                className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={chatSending || !chatInput.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 text-white h-10 w-10 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Enviar"
              >
                {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
