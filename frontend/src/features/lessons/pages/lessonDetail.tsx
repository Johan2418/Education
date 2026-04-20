import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type {
  ActividadInteractiva,
  ActividadInteractivaIntento,
  Foro,
  ForoHilo,
  ForoMensaje,
  Leccion,
  LeccionSeccion,
  LeccionSeccionGatingPDF,
  LeccionVideoProgreso,
  ProgresoSeccion,
} from "@/shared/types";
import {
  createForoHilo,
  createForoMensaje,
  getRecursoDetalle,
  getSeccionGatingPdf,
  listForoHilos,
  listForoMensajes,
  listForosByLeccion,
  listVideoProgreso,
  type RecursoDetalle,
  upsertVideoProgreso,
} from "@/features/lessons/services/recursos360";
import {
  extractInteractiveAllowedOrigins,
  getActividadInteractiva,
  getMiIntentoActividad,
  isInteractiveOriginAllowed,
  normalizeInteractiveProviderEvent,
  resolveInteractiveScoreThreshold,
  upsertIntentoActividad,
} from "@/features/lessons/services/interactivas";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle, MessageSquare, SendHorizontal } from "lucide-react";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

function extractYouTubeVideoId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const input = raw.trim();
  if (!input) return null;

  const directPattern = /^[A-Za-z0-9_-]{11}$/;
  if (directPattern.test(input)) return input;

  try {
    const u = new URL(input);
    if (u.hostname.includes("youtu.be")) {
      const id = (u.pathname.replace(/^\//, "").split("/")[0] || "").trim();
      return directPattern.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && directPattern.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((p) => p === "embed" || p === "shorts");
      const candidate = embedIndex >= 0 ? parts[embedIndex + 1] : undefined;
      if (typeof candidate === "string" && directPattern.test(candidate)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function safeNumber(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export default function LessonDetailPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState("");
  const [lesson, setLesson] = useState<Leccion | null>(null);
  const [secciones, setSecciones] = useState<LeccionSeccion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progSecciones, setProgSecciones] = useState<Record<string, ProgresoSeccion>>({});
  const [videoProgressBySeccion, setVideoProgressBySeccion] = useState<Record<string, LeccionVideoProgreso>>({});

  const [currentRecurso, setCurrentRecurso] = useState<RecursoDetalle | null>(null);
  const [currentGating, setCurrentGating] = useState<LeccionSeccionGatingPDF | null>(null);
  const [currentActividad, setCurrentActividad] = useState<ActividadInteractiva | null>(null);
  const [currentActividadIntento, setCurrentActividadIntento] = useState<ActividadInteractivaIntento | null>(null);

  const [currentForo, setCurrentForo] = useState<Foro | null>(null);
  const [hilos, setHilos] = useState<ForoHilo[]>([]);
  const [selectedHiloId, setSelectedHiloId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<ForoMensaje[]>([]);

  const [nuevoHiloTitulo, setNuevoHiloTitulo] = useState("");
  const [nuevoHiloTexto, setNuevoHiloTexto] = useState("");
  const [nuevoHiloImagenURL, setNuevoHiloImagenURL] = useState("");

  const [nuevoMensajeTexto, setNuevoMensajeTexto] = useState("");
  const [nuevoMensajeImagenURL, setNuevoMensajeImagenURL] = useState("");

  const [videoWatchedDraft, setVideoWatchedDraft] = useState("0");
  const [videoTotalDraft, setVideoTotalDraft] = useState("0");
  const [savingVideoProgress, setSavingVideoProgress] = useState(false);
  const [savingActividadIntento, setSavingActividadIntento] = useState(false);

  const interactiveIframeRef = useRef<HTMLIFrameElement | null>(null);
  const processedInteractiveEventKeysRef = useRef<Set<string>>(new Set());
  const currentActividadIntentoRef = useRef<ActividadInteractivaIntento | null>(null);
  const progresoSeccionesRef = useRef<Record<string, ProgresoSeccion>>({});

  const isEditor = ["teacher", "admin", "super_admin", "resource_manager"].includes(currentRole);

  useEffect(() => {
    currentActividadIntentoRef.current = currentActividadIntento;
  }, [currentActividadIntento]);

  useEffect(() => {
    progresoSeccionesRef.current = progSecciones;
  }, [progSecciones]);

  useEffect(() => {
    if (!lessonId) return;
    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me) { navigate("/login"); return; }
        setCurrentRole(me.role || "");

        const lessonRes = await api.get<{ data: Leccion }>(`/lecciones/${lessonId}`);
        setLesson(lessonRes.data);

        const seccionesRes = await api.get<{ data: LeccionSeccion[] }>(`/lecciones/${lessonId}/secciones`);
        const secs: LeccionSeccion[] = seccionesRes.data || [];
        setSecciones((secs || []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));

        // Fetch progress for sections
        try {
          const progressRes = await api.get<{ data: ProgresoSeccion[] }>(`/lecciones/${lessonId}/progreso-secciones`);
          const ps: ProgresoSeccion[] = progressRes.data || [];
          const map: Record<string, ProgresoSeccion> = {};
          (ps || []).forEach((p) => { map[p.leccion_seccion_id] = p; });
          setProgSecciones(map);
        } catch { /* no progress yet */ }

        try {
          const videoItems = await listVideoProgreso(lessonId);
          const map: Record<string, LeccionVideoProgreso> = {};
          for (const item of videoItems) {
            const prev = map[item.leccion_seccion_id];
            if (!prev || new Date(item.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
              map[item.leccion_seccion_id] = item;
            }
          }
          setVideoProgressBySeccion(map);
        } catch {
          // ignore when no video progress exists yet
        }
      } catch (err) {
        console.error("Error loading lesson", err);
        toast.error(t("lessons.loadError", { defaultValue: "Error al cargar lección" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, navigate, t]);

  const currentSection = secciones[currentIdx];

  useEffect(() => {
    if (!lessonId || !currentSection) return;

    let active = true;
    (async () => {
      setCurrentRecurso(null);
      setCurrentForo(null);
      setHilos([]);
      setSelectedHiloId(null);
      setMensajes([]);
      setCurrentGating(null);
      setCurrentActividad(null);
      setCurrentActividadIntento(null);

      if (currentSection.recurso_id) {
        try {
          const recurso = await getRecursoDetalle(currentSection.recurso_id);
          if (active) setCurrentRecurso(recurso);
        } catch {
          // section might not have a classic recurso bound
        }
      }

      try {
        const gating = await getSeccionGatingPdf(currentSection.id);
        if (active) setCurrentGating(gating);
      } catch {
        // keep null gating if endpoint returns error
      }

      if (currentSection.foro_id) {
        try {
          const foros = await listForosByLeccion(lessonId);
          const foro = foros.find((f) => f.id === currentSection.foro_id) ?? null;
          if (active) setCurrentForo(foro);

          if (foro) {
            const threads = await listForoHilos(foro.id);
            if (!active) return;
            setHilos(threads);

            const firstHilo = threads.at(0);
            if (firstHilo) {
              const initialHiloId = firstHilo.id;
              setSelectedHiloId(initialHiloId);
              const messages = await listForoMensajes(initialHiloId);
              if (active) setMensajes(messages);
            }
          }
        } catch (err) {
          if (active) {
            toast.error(normalizeError(err));
          }
        }
      }

      if (currentSection.actividad_interactiva_id) {
        try {
          const actividad = await getActividadInteractiva(currentSection.actividad_interactiva_id);
          if (active) {
            setCurrentActividad(actividad);
          }

          const intento = await getMiIntentoActividad(currentSection.actividad_interactiva_id);
          if (active) {
            setCurrentActividadIntento(intento);
          }
        } catch (err) {
          if (active) {
            toast.error(normalizeError(err));
          }
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [lessonId, currentSection]);

  const markSectionComplete = async (seccionId: string) => {
    try {
      const response = await api.put<{ data: ProgresoSeccion }>("/progreso-secciones", {
        leccion_seccion_id: seccionId,
        completado: true,
      });
      setProgSecciones((prev) => ({
        ...prev,
        [seccionId]: response.data,
      }));
    } catch {
      toast.error(t("lessons.progressError", { defaultValue: "Error al guardar progreso" }));
    }
  };

  const onSelectHilo = async (hiloId: string) => {
    setSelectedHiloId(hiloId);
    try {
      const items = await listForoMensajes(hiloId);
      setMensajes(items);
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const onCreateHilo = async () => {
    if (!currentForo) return;
    if (!nuevoHiloTitulo.trim()) {
      toast.error("El titulo del hilo es obligatorio");
      return;
    }
    if (!nuevoHiloTexto.trim() && !nuevoHiloImagenURL.trim()) {
      toast.error("Debes ingresar texto o imagen para crear el hilo");
      return;
    }

    try {
      await createForoHilo(currentForo.id, {
        titulo: nuevoHiloTitulo.trim(),
        contenido: nuevoHiloTexto.trim() || undefined,
        imagen_url: nuevoHiloImagenURL.trim() || undefined,
      });
      setNuevoHiloTitulo("");
      setNuevoHiloTexto("");
      setNuevoHiloImagenURL("");

      const threads = await listForoHilos(currentForo.id);
      setHilos(threads);
      const firstHilo = threads.at(0);
      if (firstHilo) {
        await onSelectHilo(firstHilo.id);
      }
      toast.success("Hilo creado");
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const onCreateMensaje = async () => {
    if (!selectedHiloId) return;
    if (!nuevoMensajeTexto.trim() && !nuevoMensajeImagenURL.trim()) {
      toast.error("Debes ingresar texto o imagen para enviar un mensaje");
      return;
    }

    try {
      await createForoMensaje(selectedHiloId, {
        contenido: nuevoMensajeTexto.trim() || undefined,
        imagen_url: nuevoMensajeImagenURL.trim() || undefined,
      });
      setNuevoMensajeTexto("");
      setNuevoMensajeImagenURL("");
      const items = await listForoMensajes(selectedHiloId);
      setMensajes(items);
      toast.success("Mensaje publicado");
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const contentURL = useMemo(() => {
    if (!currentSection) return null;
    if (currentSection.contenido) return currentSection.contenido;
    return currentRecurso?.archivo_url || null;
  }, [currentRecurso, currentSection]);

  const youtubeVideoId = useMemo(() => extractYouTubeVideoId(contentURL), [contentURL]);

  const currentVideoProgress = currentSection ? videoProgressBySeccion[currentSection.id] : undefined;

  useEffect(() => {
    if (!currentSection || !youtubeVideoId) {
      setVideoWatchedDraft("0");
      setVideoTotalDraft("0");
      return;
    }

    const existing = videoProgressBySeccion[currentSection.id];
    setVideoWatchedDraft(String(existing?.watched_seconds ?? 0));
    setVideoTotalDraft(String(existing?.total_seconds ?? 0));
  }, [currentSection, youtubeVideoId, videoProgressBySeccion]);

  const onSaveVideoProgress = async () => {
    if (!currentSection || !youtubeVideoId) return;
    const watched = safeNumber(videoWatchedDraft);
    const total = safeNumber(videoTotalDraft);

    setSavingVideoProgress(true);
    try {
      const payload = {
        leccion_seccion_id: currentSection.id,
        youtube_video_id: youtubeVideoId,
        watched_seconds: watched,
        total_seconds: total > 0 ? total : undefined,
        porcentaje_visto: total > 0 ? Math.min(100, (watched / total) * 100) : undefined,
      };
      const updated = await upsertVideoProgreso(payload);
      setVideoProgressBySeccion((prev) => ({
        ...prev,
        [currentSection.id]: updated,
      }));

      if (!isEditor && updated.completado && !progSecciones[currentSection.id]?.completado) {
        await markSectionComplete(currentSection.id);
      }
      toast.success("Progreso de YouTube guardado");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSavingVideoProgress(false);
    }
  };

  const onRegistrarActividadCompletada = async () => {
    if (!currentSection?.actividad_interactiva_id) return;

    setSavingActividadIntento(true);
    try {
      const intentosPrevios = currentActividadIntento?.intentos ?? 0;
      const intento = await upsertIntentoActividad(currentSection.actividad_interactiva_id, {
        completado: true,
        intentos: intentosPrevios + 1,
        completed_at: new Date().toISOString(),
        metadata: {
          origen: "lesson_detail_manual_completion",
        },
      });
      setCurrentActividadIntento(intento);

      if (!progSecciones[currentSection.id]?.completado) {
        await markSectionComplete(currentSection.id);
      }
      toast.success("Actividad interactiva completada");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSavingActividadIntento(false);
    }
  };

  useEffect(() => {
    if (isEditor || !currentSection?.actividad_interactiva_id || !currentActividad) {
      processedInteractiveEventKeysRef.current.clear();
      return;
    }

    const actividadID = currentSection.actividad_interactiva_id;
    const seccionID = currentSection.id;
    const startedAt = new Date().toISOString();
    const allowedOrigins = extractInteractiveAllowedOrigins(currentActividad.proveedor, currentActividad.configuracion);

    processedInteractiveEventKeysRef.current.clear();
    let active = true;

    const handleInteractiveEvent = (event: MessageEvent) => {
      if (!active) return;

      if (
        interactiveIframeRef.current?.contentWindow
        && event.source
        && event.source !== interactiveIframeRef.current.contentWindow
      ) {
        return;
      }

      if (!isInteractiveOriginAllowed(event.origin || "", allowedOrigins)) {
        return;
      }

      const normalized = normalizeInteractiveProviderEvent(
        currentActividad.proveedor,
        event.data,
        event.origin || "",
      );
      if (!normalized) {
        return;
      }

      if (processedInteractiveEventKeysRef.current.has(normalized.eventKey)) {
        return;
      }
      processedInteractiveEventKeysRef.current.add(normalized.eventKey);

      const previousIntento = currentActividadIntentoRef.current;
      const nextIntentos = (previousIntento?.intentos ?? 0) + 1;
      const scoreThreshold = resolveInteractiveScoreThreshold(currentActividad.configuracion);

      const completedByEventRule = currentActividad.regla_completitud === "evento" && normalized.completado;
      const completedByScoreRule =
        currentActividad.regla_completitud === "puntaje"
        && typeof normalized.scoreNormalizado === "number"
        && normalized.scoreNormalizado >= scoreThreshold;
      const completadoFinal = completedByEventRule || completedByScoreRule;

      const mergedMetadata: Record<string, unknown> = {
        ...(previousIntento?.metadata || {}),
        ...normalized.metadata,
        completion_rule: currentActividad.regla_completitud,
        score_threshold: currentActividad.regla_completitud === "puntaje" ? scoreThreshold : undefined,
        event_key: normalized.eventKey,
      };

      void (async () => {
        try {
          const intento = await upsertIntentoActividad(actividadID, {
            completado: completadoFinal,
            intentos: nextIntentos,
            score_obtenido: normalized.scoreObtenido,
            score_normalizado: normalized.scoreNormalizado,
            tiempo_dedicado: normalized.tiempoDedicado,
            started_at: previousIntento?.started_at || startedAt,
            completed_at: completadoFinal ? new Date().toISOString() : undefined,
            metadata: mergedMetadata,
          });

          if (!active) return;
          currentActividadIntentoRef.current = intento;
          setCurrentActividadIntento(intento);

          if (completadoFinal && !progresoSeccionesRef.current[seccionID]?.completado) {
            await markSectionComplete(seccionID);
          }
        } catch (err) {
          if (active) {
            toast.error(normalizeError(err));
          }
        }
      })();
    };

    window.addEventListener("message", handleInteractiveEvent);
    return () => {
      active = false;
      window.removeEventListener("message", handleInteractiveEvent);
    };
  }, [
    isEditor,
    currentSection?.id,
    currentSection?.actividad_interactiva_id,
    currentActividad,
  ]);

  const gatingSatisfied = useMemo(() => {
    if (!currentGating?.habilitado) return true;
    if (!currentGating.seccion_preguntas_id) return false;

    const preguntasProgress = progSecciones[currentGating.seccion_preguntas_id];
    if (!preguntasProgress?.completado) return false;

    const puntuacion = preguntasProgress.puntuacion ?? 0;
    return puntuacion >= currentGating.puntaje_minimo;
  }, [currentGating, progSecciones]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!lesson) {
    return <div className="text-center py-8 text-gray-500">{t("lessons.notFound", { defaultValue: "Lección no encontrada" })}</div>;
  }
  const isForoSection = !!currentSection && (currentSection.tipo === "foro" || !!currentSection.foro_id);
  const isVideoSection = currentSection?.tipo === "video";
  const isInteractiveSection = currentSection?.tipo === "actividad_interactiva";
  const isPdfResource = !!contentURL && contentURL.toLowerCase().includes(".pdf");

  const currentRequisitos = currentSection?.requisitos || [];
  const blockedByRequisitos = currentRequisitos.some((id) => !progSecciones[id]?.completado);

  const sectionCompleted = !!currentSection && !!progSecciones[currentSection.id]?.completado;

  const youtubeValidated = !youtubeVideoId || !!currentVideoProgress?.completado;
  const interactiveValidated = !isInteractiveSection || !!currentActividadIntento?.completado;

  const canMarkComplete =
    !!currentSection &&
    !isEditor &&
    !sectionCompleted &&
    !blockedByRequisitos &&
    (!isVideoSection || youtubeValidated) &&
    interactiveValidated;

  const nextBlocked =
    !!currentSection &&
    !isEditor &&
    ((currentSection.es_obligatorio !== false && !sectionCompleted) || blockedByRequisitos || !gatingSatisfied);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button onClick={() => navigate(isEditor ? "/teacher/lessons" : "/lessons")} className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; {t("common.back", { defaultValue: "Volver" })}
      </button>

      <h1 className="text-2xl font-bold mb-2">{lesson.titulo}</h1>
      {lesson.nivel && <span className="text-sm text-blue-600 font-medium">{lesson.nivel}</span>}
      {lesson.descripcion && <p className="text-gray-600 mt-2 mb-6">{lesson.descripcion}</p>}

      {secciones.length === 0 ? (
        <p className="text-gray-500">{t("lessons.noSections", { defaultValue: "Esta lección no tiene secciones" })}</p>
      ) : (
        <>
          {/* Section progress indicator */}
          <div className="flex gap-1 mb-6">
            {secciones.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentIdx(idx)}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  progSecciones[s.id]?.completado
                    ? "bg-green-500"
                    : idx === currentIdx
                    ? "bg-blue-500"
                    : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          {/* Current section */}
          {currentSection && (
            <div className="bg-white rounded-lg shadow p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{`${currentSection.tipo} — Sección ${currentIdx + 1}`}</h2>
                {progSecciones[currentSection.id]?.completado && (
                  <CheckCircle size={20} className="text-green-500" />
                )}
              </div>

              {!isEditor && blockedByRequisitos && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Debes completar las secciones previas requeridas antes de avanzar.
                </div>
              )}

              {!isEditor && !gatingSatisfied && currentGating?.habilitado && (
                <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  Para continuar, responde la sección obligatoria y alcanza al menos {currentGating.puntaje_minimo}%.
                </div>
              )}

              {isEditor && (
                <div className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
                  Para configurar publicación, visibilidad y gating de esta sección usa el panel docente dedicado.
                  <div className="mt-2">
                    <button
                      onClick={() => navigate(`/teacher/lessons/${lesson.id}/sections`)}
                      className="rounded-md bg-indigo-700 px-3 py-1.5 text-white hover:bg-indigo-800"
                    >
                      Abrir configuración de secciones
                    </button>
                  </div>
                </div>
              )}

              {currentSection.tipo === "html" && (currentSection.contenido || currentRecurso?.texto_html) && (
                <div
                  className="prose max-w-none mb-4"
                  dangerouslySetInnerHTML={{ __html: currentSection.contenido || currentRecurso?.texto_html || "" }}
                />
              )}

              {currentSection.tipo === "video" && contentURL && (
                <div className="mb-4 space-y-3">
                  {youtubeVideoId ? (
                    <>
                      <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-black">
                        <iframe
                          title="YouTube player"
                          src={`https://www.youtube.com/embed/${youtubeVideoId}`}
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-800 mb-2">Comprobación de visualización YouTube (mínimo 90%)</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                          <label className="text-sm text-slate-700">
                            Segundos vistos
                            <input
                              value={videoWatchedDraft}
                              onChange={(e) => setVideoWatchedDraft(e.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                              inputMode="numeric"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            Duración total
                            <input
                              value={videoTotalDraft}
                              onChange={(e) => setVideoTotalDraft(e.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                              inputMode="numeric"
                            />
                          </label>
                          <div className="text-sm text-slate-700 flex flex-col justify-end">
                            <p>
                              Estado: {currentVideoProgress?.completado ? "Completado" : "Pendiente"}
                            </p>
                            <p>
                              Progreso: {Math.round(currentVideoProgress?.porcentaje_visto || 0)}%
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => void onSaveVideoProgress()}
                          disabled={savingVideoProgress}
                          className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingVideoProgress ? "Guardando..." : "Guardar progreso YouTube"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <video src={contentURL} controls className="w-full rounded" />
                  )}
                </div>
              )}

              {currentSection.tipo === "imagen" && contentURL && (
                <img src={contentURL} alt="" className="w-full rounded mb-4" />
              )}

              {(currentSection.tipo === "texto" || currentSection.tipo === "recurso") && (currentSection.contenido || currentRecurso?.descripcion || contentURL) && (
                <div className="mb-4 space-y-3">
                  {currentSection.contenido && <p className="text-gray-700 whitespace-pre-wrap">{currentSection.contenido}</p>}
                  {!currentSection.contenido && currentRecurso?.descripcion && <p className="text-gray-700 whitespace-pre-wrap">{currentRecurso.descripcion}</p>}
                  {isPdfResource && contentURL && (
                    <iframe
                      src={contentURL}
                      className="w-full h-[540px] rounded border border-slate-200"
                      title="PDF Recurso"
                    />
                  )}
                  {!isPdfResource && contentURL && (
                    <a
                      href={contentURL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Abrir recurso adjunto
                    </a>
                  )}
                </div>
              )}

              {currentSection.tipo === "actividad_interactiva" && (
                <div className="mb-4 space-y-3">
                  {currentActividad ? (
                    <>
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{currentActividad.titulo}</h3>
                        {currentActividad.descripcion && (
                          <p className="text-sm text-slate-600 mt-1">{currentActividad.descripcion}</p>
                        )}
                      </div>

                      <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        <iframe
                          ref={interactiveIframeRef}
                          title={`Actividad interactiva ${currentActividad.proveedor}`}
                          src={currentActividad.embed_url}
                          className="h-full w-full"
                          allow="fullscreen; autoplay"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                          referrerPolicy="strict-origin-when-cross-origin"
                        />
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <p>
                          Estado: {currentActividadIntento?.completado ? "Completada" : "Pendiente"}
                        </p>
                        <p>Intentos registrados: {currentActividadIntento?.intentos ?? 0}</p>
                        {!isEditor && !currentActividadIntento?.completado && (
                          <button
                            onClick={() => void onRegistrarActividadCompletada()}
                            disabled={savingActividadIntento}
                            className="mt-2 px-3 py-2 rounded-md bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50"
                          >
                            {savingActividadIntento ? "Guardando..." : "Marcar actividad como completada"}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Esta sección interactiva no tiene actividad vinculada o no pudo cargarse.
                    </div>
                  )}
                </div>
              )}

              {isForoSection && (
                <div className="mt-4 border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={18} className="text-blue-600" />
                    <h3 className="font-semibold text-slate-900">Foro de la sección</h3>
                  </div>

                  {!currentForo ? (
                    <p className="text-sm text-slate-600">No hay foro disponible para esta sección.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-md border border-slate-200 p-3">
                        <p className="text-sm font-medium mb-2">Crear nuevo hilo</p>
                        <input
                          value={nuevoHiloTitulo}
                          onChange={(e) => setNuevoHiloTitulo(e.target.value)}
                          placeholder="Título del hilo"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 mb-2"
                        />
                        <textarea
                          value={nuevoHiloTexto}
                          onChange={(e) => setNuevoHiloTexto(e.target.value)}
                          placeholder="Texto del hilo"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 mb-2 min-h-[70px]"
                        />
                        <input
                          value={nuevoHiloImagenURL}
                          onChange={(e) => setNuevoHiloImagenURL(e.target.value)}
                          placeholder="URL de imagen (opcional)"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 mb-2"
                        />
                        <button
                          onClick={() => void onCreateHilo()}
                          className="px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                        >
                          Publicar hilo
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-md border border-slate-200 p-3">
                          <p className="text-sm font-medium mb-2">Hilos</p>
                          {hilos.length === 0 ? (
                            <p className="text-sm text-slate-500">Aún no hay hilos.</p>
                          ) : (
                            <div className="space-y-2">
                              {hilos.map((hilo) => (
                                <button
                                  key={hilo.id}
                                  onClick={() => void onSelectHilo(hilo.id)}
                                  className={`w-full text-left rounded-md border px-2 py-2 ${selectedHiloId === hilo.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
                                >
                                  <p className="text-sm font-medium text-slate-900">{hilo.titulo}</p>
                                  {hilo.contenido && <p className="text-xs text-slate-600 line-clamp-2">{hilo.contenido}</p>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-md border border-slate-200 p-3">
                          <p className="text-sm font-medium mb-2">Mensajes</p>
                          {selectedHiloId == null ? (
                            <p className="text-sm text-slate-500">Selecciona un hilo para ver mensajes.</p>
                          ) : (
                            <>
                              <div className="max-h-60 overflow-auto space-y-2 mb-3">
                                {mensajes.length === 0 ? (
                                  <p className="text-sm text-slate-500">Sin mensajes aún.</p>
                                ) : (
                                  mensajes.map((m) => (
                                    <div key={m.id} className="rounded-md bg-slate-50 border border-slate-200 p-2">
                                      {m.contenido && <p className="text-sm text-slate-800">{m.contenido}</p>}
                                      {m.imagen_url && (
                                        <a href={m.imagen_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                                          Ver imagen
                                        </a>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>

                              <textarea
                                value={nuevoMensajeTexto}
                                onChange={(e) => setNuevoMensajeTexto(e.target.value)}
                                placeholder="Escribe tu mensaje"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 mb-2 min-h-[64px]"
                              />
                              <input
                                value={nuevoMensajeImagenURL}
                                onChange={(e) => setNuevoMensajeImagenURL(e.target.value)}
                                placeholder="URL de imagen (opcional)"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 mb-2"
                              />
                              <button
                                onClick={() => void onCreateMensaje()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                              >
                                <SendHorizontal size={14} />
                                Enviar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isEditor && !progSecciones[currentSection.id]?.completado && (
                <button
                  onClick={() => void markSectionComplete(currentSection.id)}
                  disabled={!canMarkComplete}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {canMarkComplete
                    ? t("lessons.markComplete", { defaultValue: "Marcar como completada" })
                    : "Completa requisitos previos o validación de video/actividad"}
                </button>
              )}
            </div>
          )}

          {/* Nav */}
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))}
              disabled={currentIdx === 0}
              className="inline-flex items-center gap-1 px-4 py-2 border rounded-lg disabled:opacity-50"
            >
              <ChevronLeft size={16} /> {t("common.previous", { defaultValue: "Anterior" })}
            </button>
            <button
              onClick={() => setCurrentIdx((p) => Math.min(secciones.length - 1, p + 1))}
              disabled={currentIdx === secciones.length - 1 || nextBlocked}
              className="inline-flex items-center gap-1 px-4 py-2 border rounded-lg disabled:opacity-50"
            >
              {t("common.next", { defaultValue: "Siguiente" })} <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
