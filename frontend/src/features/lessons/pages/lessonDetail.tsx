import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { getProgreso, upsertProgreso } from "@/shared/services/progresos";
import { getStudentLessonAccess, getTema, getUnidad } from "@/shared/services/studentProgression";
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
  PruebaCompleta,
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
  parseNativeInteractiveConfig,
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

interface ApiEnvelope<T> {
  data: T;
}

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
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

function buildProtectedPdfUrl(rawUrl: string): string {
  const hashFlags = "toolbar=0&navpanes=0&scrollbar=0&view=FitH";
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    parsed.hash = hashFlags;
    return parsed.toString();
  } catch {
    const joiner = rawUrl.includes("#") ? "&" : "#";
    return `${rawUrl}${joiner}${hashFlags}`;
  }
}

interface CheckpointQuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface CheckpointQuestion {
  seccionId: string;
  pruebaId: string;
  prompt: string;
  options: CheckpointQuestionOption[];
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
  const [localVideoMaxAllowedTime, setLocalVideoMaxAllowedTime] = useState(0);
  const [savingVideoProgress, setSavingVideoProgress] = useState(false);
  const [checkpointQuestion, setCheckpointQuestion] = useState<CheckpointQuestion | null>(null);
  const [checkpointQuestionLoading, setCheckpointQuestionLoading] = useState(false);
  const [checkpointQuestionLoadError, setCheckpointQuestionLoadError] = useState<string | null>(null);
  const [checkpointPromptVisible, setCheckpointPromptVisible] = useState(false);
  const [checkpointSelectedOption, setCheckpointSelectedOption] = useState("");
  const [checkpointSubmitting, setCheckpointSubmitting] = useState(false);
  const [checkpointUnlocked, setCheckpointUnlocked] = useState(false);
  const [nativeAnswers, setNativeAnswers] = useState<Record<string, string>>({});
  const [nativeSubmitting, setNativeSubmitting] = useState(false);
  const [nativeFeedback, setNativeFeedback] = useState<string | null>(null);
  const [nativeQuickQuestionIdx, setNativeQuickQuestionIdx] = useState(0);
  const [nativeQuickRemainingSeconds, setNativeQuickRemainingSeconds] = useState(0);
  const [nativeTimedOutQuestions, setNativeTimedOutQuestions] = useState<Record<string, boolean>>({});
  const [nativeQuickStartedAtMs, setNativeQuickStartedAtMs] = useState<number | null>(null);
  const [savingActividadIntento, setSavingActividadIntento] = useState(false);
  const [lessonAlreadyCompleted, setLessonAlreadyCompleted] = useState(false);
  const [studentAccessDenied, setStudentAccessDenied] = useState(false);
  const [blockedMateriaId, setBlockedMateriaId] = useState<string | null>(null);
  const [returnPath, setReturnPath] = useState("/lessons");
  const [returnLabel, setReturnLabel] = useState(t("common.back", { defaultValue: "Volver" }));

  const interactiveIframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const processedInteractiveEventKeysRef = useRef<Set<string>>(new Set());
  const currentActividadIntentoRef = useRef<ActividadInteractivaIntento | null>(null);
  const progresoSeccionesRef = useRef<Record<string, ProgresoSeccion>>({});
  const lessonProgressSyncingRef = useRef(false);

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
      setStudentAccessDenied(false);
      setBlockedMateriaId(null);
      try {
        const me = await getMe();
        if (!me) { navigate("/login"); return; }
        setCurrentRole(me.role || "");
        setReturnPath(me.role && ["teacher", "admin", "super_admin", "resource_manager"].includes(me.role) ? "/teacher/lessons" : "/lessons");
        setReturnLabel(t("common.back", { defaultValue: "Volver" }));

        const lessonRes = await api.get<{ data: Leccion }>(`/lecciones/${lessonId}`);
        setLesson(lessonRes.data);

        if (me.role === "student") {
          try {
            const topic = await getTema(lessonRes.data.tema_id);
            if (topic) {
              const unidad = await getUnidad(topic.unidad_id);
              if (unidad?.materia_id) {
                const query = new URLSearchParams({ topicId: topic.id });
                setReturnPath(`/contents/${unidad.materia_id}?${query.toString()}`);
                setReturnLabel(topic.nombre ? `Volver a ${topic.nombre}` : t("common.back", { defaultValue: "Volver" }));
              }
            }
          } catch {
            // leave fallback path in place if topic lookup fails
          }
          const lessonAccess = await getStudentLessonAccess(lessonRes.data);
          if (!lessonAccess.allowed) {
            setStudentAccessDenied(true);
            setBlockedMateriaId(lessonAccess.materiaId);
            return;
          }

          const lessonProgress = await getProgreso(lessonId);
          setLessonAlreadyCompleted(!!lessonProgress?.completado);
        } else {
          setLessonAlreadyCompleted(false);
        }

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
  const contentURL = useMemo(() => {
    if (!currentSection) return null;
    if (currentSection.contenido) return currentSection.contenido;
    return currentRecurso?.archivo_url || null;
  }, [currentRecurso, currentSection]);

  const youtubeVideoId = useMemo(() => extractYouTubeVideoId(contentURL), [contentURL]);
  const currentVideoProgress = currentSection ? videoProgressBySeccion[currentSection.id] : undefined;
  const videoProgressPercent = useMemo(() => {
    const watched = safeNumber(videoWatchedDraft);
    const total = safeNumber(videoTotalDraft);
    return total > 0 ? Math.min(100, Math.max(0, Math.round((watched / total) * 100))) : 0;
  }, [videoWatchedDraft, videoTotalDraft]);
  const showVideoProgress = useMemo(() => safeNumber(videoTotalDraft) > 0, [videoTotalDraft]);

  const currentSectionRef = useRef<LeccionSeccion | null>(null);
  const currentGatingRef = useRef<LeccionSeccionGatingPDF | null>(null);
  const checkpointQuestionRef = useRef<CheckpointQuestion | null>(null);
  const checkpointUnlockedRef = useRef(false);
  const checkpointPromptVisibleRef = useRef(false);
  const youtubePlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const lastYoutubeTimeRef = useRef<number>(0);
  const lastYoutubePollAtRef = useRef<number>(Date.now());
  const youtubeTimeMonitorRef = useRef<number | null>(null);
  const maxAllowedYoutubeTimeRef = useRef<number>(0);
  const currentVideoProgressRef = useRef<LeccionVideoProgreso | undefined>(undefined);
  const [youtubeApiReady, setYoutubeApiReady] = useState(false);
  const [youtubeApiLoadFailed, setYoutubeApiLoadFailed] = useState(false);
  const [youtubeApiTimeoutExpired, setYoutubeApiTimeoutExpired] = useState(false);
  const [youtubePlayerCreationFailed, setYoutubePlayerCreationFailed] = useState(false);

  useEffect(() => {
    currentSectionRef.current = currentSection ?? null;
    currentGatingRef.current = currentGating;
    checkpointQuestionRef.current = checkpointQuestion;
    checkpointUnlockedRef.current = checkpointUnlocked;
    checkpointPromptVisibleRef.current = checkpointPromptVisible;
  }, [currentSection, currentGating, checkpointQuestion, checkpointUnlocked, checkpointPromptVisible]);

  useEffect(() => {
    currentVideoProgressRef.current = currentVideoProgress;
  }, [currentVideoProgress]);

  useEffect(() => {
    if (!youtubeVideoId) {
      maxAllowedYoutubeTimeRef.current = 0;
      return;
    }
    maxAllowedYoutubeTimeRef.current = currentVideoProgress?.watched_seconds ?? 0;
  }, [youtubeVideoId, currentVideoProgress?.watched_seconds]);

  useEffect(() => {
    if (!youtubeVideoId) {
      setYoutubeApiReady(false);
      setYoutubeApiLoadFailed(false);
      setYoutubeApiTimeoutExpired(false);
      setYoutubePlayerCreationFailed(false);
      return;
    }

    if ((window as any).YT?.Player) {
      setYoutubeApiReady(true);
      return;
    }

    const handleYoutubeApiReady = () => setYoutubeApiReady(true);
    const existingScript = document.getElementById("youtube-iframe-api-script");
    if (existingScript) {
      (window as any).onYouTubeIframeAPIReady = handleYoutubeApiReady;
    } else {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api-script";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => setYoutubeApiLoadFailed(true);
      document.body.appendChild(script);
      (window as any).onYouTubeIframeAPIReady = handleYoutubeApiReady;
    }

    const readyPoll = window.setInterval(() => {
      if ((window as any).YT?.Player) {
        setYoutubeApiReady(true);
        window.clearInterval(readyPoll);
      }
    }, 250);

    return () => {
      (window as any).onYouTubeIframeAPIReady = undefined;
      window.clearInterval(readyPoll);
    };
  }, [youtubeVideoId]);

  useEffect(() => {
    if (!youtubeVideoId || youtubeApiReady) return;
    const timeoutId = window.setTimeout(() => {
      setYoutubeApiTimeoutExpired(true);
    }, 8000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [youtubeVideoId, youtubeApiReady]);

  useEffect(() => {
    if (!youtubeApiReady) return;
    setYoutubeApiTimeoutExpired(false);
    setYoutubeApiLoadFailed(false);
  }, [youtubeApiReady]);

  const stopYoutubeTimeMonitor = () => {
    if (youtubeTimeMonitorRef.current !== null) {
      window.clearInterval(youtubeTimeMonitorRef.current);
      youtubeTimeMonitorRef.current = null;
    }
  };

  // YouTube uses a polling monitor to detect current playback time and
  // enforce checkpoint blocking when the user seeks ahead. This differs from
  // local video, which relies on the native onTimeUpdate event and a max
  // allowed time state.
  const startYoutubeTimeMonitor = () => {
    if (!youtubePlayerRef.current || youtubeTimeMonitorRef.current !== null) return;

    lastYoutubePollAtRef.current = Date.now();
    youtubeTimeMonitorRef.current = window.setInterval(() => {
      const currentSection = currentSectionRef.current;
      const currentGating = currentGatingRef.current;
      const checkpointQuestion = checkpointQuestionRef.current;
      const checkpointUnlocked = checkpointUnlockedRef.current;
      const checkpointPromptVisible = checkpointPromptVisibleRef.current;
      if (!youtubePlayerRef.current || !currentSection || !currentGating?.habilitado) return;
      const checkpointSeconds = currentGating.checkpoint_segundos;
      if (checkpointSeconds == null || checkpointSeconds <= 0) return;

      const currentTime = youtubePlayerRef.current.getCurrentTime?.();
      if (typeof currentTime !== "number" || Number.isNaN(currentTime)) return;

      const previousMax = maxAllowedYoutubeTimeRef.current;
      const lastTime = lastYoutubeTimeRef.current;
      const now = Date.now();
      const elapsedSeconds = Math.min(Math.max((now - lastYoutubePollAtRef.current) / 1000, 0), 5);
      const naturalThreshold = Math.max(1.5, elapsedSeconds + 0.75);
      const forwardJump = currentTime - lastTime;
      const hasForwardSeek = forwardJump > naturalThreshold;

      if (hasForwardSeek) {
        youtubePlayerRef.current.seekTo(previousMax, true);
        youtubePlayerRef.current.pauseVideo?.();
        toast("No puedes adelantar el video. Continúa viendo para desbloquear más contenido.", { duration: 3000 });
        lastYoutubeTimeRef.current = previousMax;
        lastYoutubePollAtRef.current = now;
        return;
      }

      if (currentTime > previousMax) {
        maxAllowedYoutubeTimeRef.current = currentTime;
      }
      lastYoutubeTimeRef.current = currentTime;
      lastYoutubePollAtRef.current = now;

      const duration = youtubePlayerRef.current.getDuration?.();
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        setVideoTotalDraft(String(Math.floor(duration)));
      }
      setVideoWatchedDraft(String(Math.floor(currentTime)));

      if (!checkpointUnlocked && currentTime >= checkpointSeconds && !checkpointPromptVisible) {
        maxAllowedYoutubeTimeRef.current = Math.max(maxAllowedYoutubeTimeRef.current, checkpointSeconds);
        youtubePlayerRef.current.pauseVideo?.();
        setCheckpointPromptVisible(true);
      }
    }, 500);
  };

  const handleYouTubeStateChange = (event: any) => {
    const playerState = (window as any).YT?.PlayerState;
    const playingState = playerState?.PLAYING ?? 1;
    const pausedState = playerState?.PAUSED ?? 2;
    const endedState = playerState?.ENDED ?? 0;

    if (event.data === playingState) {
      startYoutubeTimeMonitor();
    } else if (event.data === pausedState || event.data === endedState) {
      stopYoutubeTimeMonitor();
    }
  };

  const handleYouTubeAutoplayBlocked = () => {
    console.info("YouTube autoplay blocked by browser. User interaction required.");
    toast(
      "El navegador bloqueó la reproducción automática. Haz clic en el video para reproducirlo.",
      { duration: 5000 }
    );
  };

  const handleYouTubeError = (error: any) => {
    const errorCodes: Record<number, string> = {
      2: "URL del video inválida",
      5: "No se puede reproducir en HTML5",
      100: "Video no encontrado o eliminado",
      101: "El propietario no permite embebido",
      150: "El propietario no permite embebido",
      153: "Falta información de origen",
    };
    const message = errorCodes[error.data] || `Error desconocido (código: ${error.data})`;
    console.error("YouTube player error:", error.data, message);
    setYoutubePlayerCreationFailed(true);
    if (error.data === 101 || error.data === 150) {
      toast.error("Este video no permite ser embebido. Intenta ver el video directamente en YouTube.");
    } else {
      toast.error(`Error del reproductor: ${message}`);
    }
  };

  const isEmbeddedYouTubeSection = Boolean(youtubeVideoId);
  const isVideoSection = currentSection?.tipo === "video" || isEmbeddedYouTubeSection;
  const shouldRenderVideoSection = Boolean(contentURL && (currentSection?.tipo === "video" || (currentSection?.tipo === "recurso" && isEmbeddedYouTubeSection)));

  const hasCheckpointConfig = Boolean(
    isVideoSection
    && currentGating?.habilitado
    && currentGating?.checkpoint_segundos != null
    && currentGating?.checkpoint_segundos > 0
  );

  // Usar la API de iframe de YouTube para controlar playback y checkpoint

  useEffect(() => {
    if (!youtubeVideoId || !youtubeApiReady || !youtubePlayerContainerRef.current) return;
    const YT = (window as any).YT;
    if (!YT?.Player) return;

    maxAllowedYoutubeTimeRef.current = 0;
    try {
      youtubePlayerRef.current = new YT.Player(youtubePlayerContainerRef.current, {
        videoId: youtubeVideoId,
        playerVars: {
          controls: 1,
          disablekb: 1,
          enablejsapi: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: (event: any) => {
            const progress = currentVideoProgressRef.current;
            if (typeof progress?.watched_seconds === "number" && progress.watched_seconds > 0) {
              const safeTime = Math.max(0, progress.watched_seconds);
              try {
                event.target.seekTo(safeTime, true);
              } catch {
                // ignore seek errors during initialization
              }
              maxAllowedYoutubeTimeRef.current = safeTime;
              setVideoWatchedDraft(String(Math.floor(safeTime)));
            }

            const duration = event.target.getDuration?.();
            if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
              setVideoTotalDraft(String(Math.floor(duration)));
            }

            startYoutubeTimeMonitor();
            setYoutubePlayerCreationFailed(false);
          },
          onStateChange: handleYouTubeStateChange,
          onError: (error: any) => {
            handleYouTubeError(error);
            setYoutubePlayerCreationFailed(true);
          },
          onAutoplayBlocked: handleYouTubeAutoplayBlocked,
        },
      });
    } catch (error) {
      console.error("YouTube player creation failed", error);
      setYoutubePlayerCreationFailed(true);
      youtubePlayerRef.current = null;
    }

    return () => {
      stopYoutubeTimeMonitor();
      if (youtubePlayerRef.current?.destroy) {
        youtubePlayerRef.current.destroy();
      }
      youtubePlayerRef.current = null;
    };
  }, [youtubeVideoId, youtubeApiReady]);

  useEffect(() => {
    if (!youtubePlayerRef.current || checkpointPromptVisible) return;
    const YT = (window as any).YT;
    if (YT?.Player && youtubePlayerRef.current.getPlayerState?.() === YT.PlayerState.PLAYING) {
      startYoutubeTimeMonitor();
    }
  }, [checkpointPromptVisible, youtubeApiReady]);

  useEffect(() => {
    if (!youtubeVideoId) return;
    const onBeforeUnload = () => stopYoutubeTimeMonitor();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [youtubeVideoId]);

  const onSelectHilo = async (hiloId: string) => {
    setSelectedHiloId(hiloId);
    try {
      const items = await listForoMensajes(hiloId);
      setMensajes(items);
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

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
      const updatedMap = {
        ...progresoSeccionesRef.current,
        [seccionId]: response.data,
      };
      setProgSecciones(updatedMap);
      await syncLessonProgressIfCompleted(updatedMap);
    } catch {
      toast.error(t("lessons.progressError", { defaultValue: "Error al guardar progreso" }));
    }
  };

  const syncLessonProgressIfCompleted = async (progressMap: Record<string, ProgresoSeccion>) => {
    if (isEditor || !lesson || lessonAlreadyCompleted || lessonProgressSyncingRef.current) return;
    const hasQuizSection = secciones.some((section) => section.tipo === "prueba" || !!section.prueba_id);
    if (hasQuizSection) return;

    const requiredSections = secciones.filter((section) => section.es_obligatorio !== false);
    if (requiredSections.length === 0) return;

    const completedAllRequired = requiredSections.every((section) => !!progressMap[section.id]?.completado);
    if (!completedAllRequired) return;

    const numericScores = requiredSections
      .map((section) => progressMap[section.id]?.puntuacion)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const lessonScore = numericScores.length > 0
      ? Math.round(numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length)
      : 100;

    lessonProgressSyncingRef.current = true;
    try {
      await upsertProgreso({
        leccion_id: lesson.id,
        completado: true,
        puntaje: lessonScore,
      });
      setLessonAlreadyCompleted(true);
    } catch {
      // no-op: section progress is still valid even when lesson aggregation fails.
    } finally {
      lessonProgressSyncingRef.current = false;
    }
  };

  useEffect(() => {
    void syncLessonProgressIfCompleted(progSecciones);
  }, [progSecciones, secciones, lessonAlreadyCompleted]);

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
  const nativeConfig = useMemo(
    () => (currentActividad?.proveedor === "nativo" ? parseNativeInteractiveConfig(currentActividad.configuracion) : null),
    [currentActividad]
  );
  const isNativeQuickQuizMode = Boolean(nativeConfig?.isQuickQuiz && nativeConfig.questions.length > 0);
  const currentNativeQuickQuestion = isNativeQuickQuizMode
    ? (nativeConfig?.questions[nativeQuickQuestionIdx] ?? null)
    : null;
  const nativeAnsweredCount = nativeConfig
    ? nativeConfig.questions.filter((question) => Boolean(nativeAnswers[question.id])).length
    : 0;
  const nativeTimedOutCount = nativeConfig
    ? nativeConfig.questions.filter((question) => nativeTimedOutQuestions[question.id]).length
    : 0;

  useEffect(() => {
    if (!currentSection) return;
    
    if (youtubeVideoId) {
      const existing = videoProgressBySeccion[currentSection.id];
      setVideoWatchedDraft(String(existing?.watched_seconds ?? 0));
      setVideoTotalDraft(String(existing?.total_seconds ?? 0));
    } else {
      // Video local - inicializar desde progreso guardado
      const existing = videoProgressBySeccion[currentSection.id];
      const watchedSeconds = existing?.watched_seconds ?? 0;
      setVideoWatchedDraft(String(watchedSeconds));
      setVideoTotalDraft(String(existing?.total_seconds ?? 0));
      setLocalVideoMaxAllowedTime(watchedSeconds);
    }
  }, [currentSection, youtubeVideoId, videoProgressBySeccion]);

  const onLocalVideoLoadedMetadata = () => {
    const player = videoElementRef.current;
    if (!player) return;

    // Local video initializes playback from saved progress and ensures
    // the duration is known for the progress UI. The checkpoint flow is
    // enforced by onTimeUpdate and localVideoMaxAllowedTime.
    if (typeof player.duration === "number" && Number.isFinite(player.duration) && player.duration > 0) {
      setVideoTotalDraft(String(Math.floor(player.duration)));
    }

    const startingTime = localVideoMaxAllowedTime;
    if (startingTime > 0 && startingTime < player.duration) {
      player.currentTime = startingTime;
      setVideoWatchedDraft(String(Math.floor(startingTime)));
    }
  };

  const onSaveVideoProgress = async () => {
    if (!currentSection) return;
    
    const watched = safeNumber(videoWatchedDraft);
    const total = safeNumber(videoTotalDraft);

    setSavingVideoProgress(true);
    try {
      const payload: {
        leccion_seccion_id: string;
        watched_seconds: number;
        total_seconds?: number;
        porcentaje_visto?: number;
        youtube_video_id?: string;
      } = {
        leccion_seccion_id: currentSection.id,
        watched_seconds: watched,
        total_seconds: total > 0 ? total : undefined,
        porcentaje_visto: total > 0 ? Math.min(100, (watched / total) * 100) : undefined,
      };
      
      // Solo agregar youtube_video_id si es un video de YouTube
      if (youtubeVideoId) {
        payload.youtube_video_id = youtubeVideoId;
      }
      
      const updated = await upsertVideoProgreso(payload);
      setVideoProgressBySeccion((prev) => ({
        ...prev,
        [currentSection.id]: updated,
      }));

      // Actualizar el máximo tiempo permitido si el usuario guardó más progreso
      if (!youtubeVideoId && watched > localVideoMaxAllowedTime) {
        setLocalVideoMaxAllowedTime(watched);
      }

      if (!isEditor && updated.completado && !progSecciones[currentSection.id]?.completado) {
        await markSectionComplete(currentSection.id);
      }
      toast.success(youtubeVideoId ? "Progreso de YouTube guardado" : "Progreso de video guardado");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSavingVideoProgress(false);
    }
  };

  useEffect(() => {
    setNativeAnswers({});
    setNativeFeedback(null);
    setNativeQuickQuestionIdx(0);
    setNativeQuickRemainingSeconds(0);
    setNativeTimedOutQuestions({});
    setNativeQuickStartedAtMs(null);
  }, [currentSection?.id, currentActividad?.id]);

  useEffect(() => {
    if (!isNativeQuickQuizMode || !nativeConfig) {
      setNativeQuickRemainingSeconds(0);
      setNativeQuickStartedAtMs(null);
      return;
    }
    setNativeQuickQuestionIdx(0);
    setNativeQuickRemainingSeconds(nativeConfig.timePerQuestionSeconds);
    setNativeQuickStartedAtMs(Date.now());
  }, [isNativeQuickQuizMode, nativeConfig, currentSection?.id, currentActividad?.id]);

  useEffect(() => {
    if (!isNativeQuickQuizMode || !nativeConfig) return;
    setNativeQuickRemainingSeconds(nativeConfig.timePerQuestionSeconds);
  }, [isNativeQuickQuizMode, nativeConfig, nativeQuickQuestionIdx]);

  useEffect(() => {
    setCheckpointQuestion(null);
    setCheckpointPromptVisible(false);
    setCheckpointSelectedOption("");

    if (!isVideoSection || !currentGating?.habilitado || !currentGating.seccion_preguntas_id) {
      setCheckpointUnlocked(false);
      return;
    }

    const requiredSectionId = currentGating.seccion_preguntas_id;
    const minScore = currentGating.puntaje_minimo ?? 0;
    const relatedProgress = progSecciones[requiredSectionId];
    const alreadyUnlocked = !!relatedProgress?.completado && (relatedProgress.puntuacion ?? 0) >= minScore;
    setCheckpointUnlocked(alreadyUnlocked);
    if (alreadyUnlocked) return;

    const checkpointSeconds = currentGating.checkpoint_segundos;
    if (checkpointSeconds == null || checkpointSeconds <= 0) return;

    const questionSection = secciones.find((section) => section.id === requiredSectionId);
    if (!questionSection?.prueba_id) {
      setCheckpointQuestionLoadError("No se encontró la prueba configurada para el checkpoint.");
      setCheckpointQuestionLoading(false);
      return;
    }
    const pruebaId = questionSection.prueba_id;

    let active = true;
    setCheckpointQuestionLoading(true);
    setCheckpointQuestionLoadError(null);
    void (async () => {
      try {
        const pruebaResponse = await api.get<PruebaCompleta | ApiEnvelope<PruebaCompleta>>(
          `/pruebas/${pruebaId}/completa`
        );
        const prueba = unwrapApiData(pruebaResponse);
        const firstQuestion = prueba?.preguntas?.[0];
        const options = (firstQuestion?.respuestas || [])
          .map((respuesta) => ({
            id: respuesta.id,
            text: respuesta.texto,
            isCorrect: Boolean(respuesta.es_correcta),
          }))
          .filter((option) => option.text.trim() !== "");

        if (!active) return;
        if (!firstQuestion) {
          setCheckpointQuestionLoadError("No se encontró la pregunta del checkpoint.");
          return;
        }
        if (options.length < 2 || !options.some((option) => option.isCorrect)) {
          setCheckpointQuestionLoadError("La pregunta del checkpoint no tiene opciones válidas.");
          return;
        }

        setCheckpointQuestion({
          seccionId: questionSection.id,
          pruebaId,
          prompt: firstQuestion.texto,
          options,
        });
      } catch (error) {
        setCheckpointQuestionLoadError(normalizeError(error));
      } finally {
        if (active) {
          setCheckpointQuestionLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [
    currentSection?.id,
    currentSection?.tipo,
    currentGating?.habilitado,
    currentGating?.seccion_preguntas_id,
    currentGating?.checkpoint_segundos,
    currentGating?.puntaje_minimo,
    secciones,
    progSecciones,
  ]);

  const onVideoTimeUpdate = () => {
    if (isEditor || currentSection?.tipo !== "video" || youtubeVideoId) return;
    
    const player = videoElementRef.current;
    if (!player) return;

    const currentTime = player.currentTime;
    const duration = player.duration;
    
    // Actualizar progreso de video y rastrear máximo tiempo visto
    if (isFinite(currentTime) && isFinite(duration) && duration > 0) {
      setVideoWatchedDraft(String(Math.floor(currentTime)));
      setVideoTotalDraft(String(Math.floor(duration)));
      
      // Actualizar el máximo tiempo permitido basado en lo visto
      if (currentTime > localVideoMaxAllowedTime) {
        setLocalVideoMaxAllowedTime(currentTime);
      }
    }

    // Verificar si el usuario intenta adelantar más allá del máximo permitido
    if (localVideoMaxAllowedTime > 0 && currentTime > localVideoMaxAllowedTime + 1) {
      // El usuario está tratando de adelantar - lo llevamos de vuelta
      player.currentTime = localVideoMaxAllowedTime;
      toast("No puedes adelantar el video. Continúa viendo para desbloquear más contenido.", { duration: 3000 });
      return;
    }

    // Verificar checkpoint
    if (!currentGating?.habilitado || !checkpointQuestion || checkpointUnlocked || checkpointPromptVisible) return;

    const checkpointSeconds = currentGating.checkpoint_segundos;
    if (checkpointSeconds == null || checkpointSeconds <= 0) return;

    if (player.currentTime >= checkpointSeconds) {
      player.pause();
      setCheckpointPromptVisible(true);
    }
  };

  const onSubmitCheckpointQuestion = async () => {
    if (!currentGating?.seccion_preguntas_id || !checkpointQuestion || !checkpointSelectedOption) return;

    const selected = checkpointQuestion.options.find((option) => option.id === checkpointSelectedOption);
    if (!selected) return;

    const score = selected.isCorrect ? 100 : 0;
    const passScore = currentGating.puntaje_minimo ?? 0;
    const passed = score >= passScore;
    const currentIntentos = progSecciones[checkpointQuestion.seccionId]?.intentos ?? 0;

    setCheckpointSubmitting(true);
    try {
      const response = await api.put<{ data: ProgresoSeccion }>("/progreso-secciones", {
        leccion_seccion_id: checkpointQuestion.seccionId,
        completado: passed,
        puntuacion: score,
        intentos: currentIntentos + 1,
      });
      const updated = response.data;
      const merged = {
        ...progresoSeccionesRef.current,
        [checkpointQuestion.seccionId]: updated,
      };
      setProgSecciones(merged);
      await syncLessonProgressIfCompleted(merged);

      if (passed) {
        setCheckpointUnlocked(true);
        setCheckpointPromptVisible(false);
        setCheckpointSelectedOption("");

        try {
          if (youtubePlayerRef.current?.playVideo) {
            youtubePlayerRef.current.playVideo();
          } else {
            await videoElementRef.current?.play();
          }
        } catch {
          // no-op
        }

        toast.success("Checkpoint de video superado. Puedes continuar.");
      } else {
        toast.error("Respuesta incorrecta. Intenta nuevamente para desbloquear el video.");
      }
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setCheckpointSubmitting(false);
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

  const onSubmitNativeActividad = async (options?: {
    allowPartial?: boolean;
    source?: "native_manual_submit" | "quick_auto_timeout" | "quick_manual_finish" | "quick_auto_answer";
  }) => {
    if (!currentSection?.actividad_interactiva_id || !nativeConfig || nativeConfig.questions.length === 0) return;

    const allowPartial = options?.allowPartial ?? false;
    const unansweredQuestionIds = nativeConfig.questions
      .filter((question) => !nativeAnswers[question.id])
      .map((question) => question.id);
    if (!allowPartial && unansweredQuestionIds.length > 0) {
      toast.error("Responde todas las preguntas para enviar la actividad nativa.");
      return;
    }

    const timedOutQuestionIds = nativeConfig.questions
      .filter((question) => nativeTimedOutQuestions[question.id])
      .map((question) => question.id);
    const correctAnswers = nativeConfig.questions.reduce((total, question) => {
      const selectedId = nativeAnswers[question.id];
      const selectedOption = question.options.find((option) => option.id === selectedId);
      return total + (selectedOption?.isCorrect ? 1 : 0);
    }, 0);
    const scoreNormalizado = Math.round((correctAnswers / nativeConfig.questions.length) * 100);

    const completedByRule = currentActividad?.regla_completitud === "puntaje"
      ? scoreNormalizado >= nativeConfig.scoreThreshold
      : true;
    const elapsedSeconds = nativeQuickStartedAtMs != null
      ? Math.max(1, Math.round((Date.now() - nativeQuickStartedAtMs) / 1000))
      : undefined;

    setNativeSubmitting(true);
    try {
      const previousIntentos = currentActividadIntento?.intentos ?? 0;
      const intento = await upsertIntentoActividad(currentSection.actividad_interactiva_id, {
        completado: completedByRule,
        intentos: previousIntentos + 1,
        score_obtenido: correctAnswers,
        score_normalizado: scoreNormalizado,
        tiempo_dedicado: elapsedSeconds,
        completed_at: completedByRule ? new Date().toISOString() : undefined,
        metadata: {
          origen: options?.source ?? "native_manual_submit",
          native_mode: isNativeQuickQuizMode ? "quick_quiz" : "standard_quiz",
          total_questions: nativeConfig.questions.length,
          answered_questions: nativeConfig.questions.length - unansweredQuestionIds.length,
          unanswered_questions: unansweredQuestionIds.length,
          unanswered_question_ids: unansweredQuestionIds,
          timed_out_questions: timedOutQuestionIds.length,
          timed_out_question_ids: timedOutQuestionIds,
          score_threshold: nativeConfig.scoreThreshold,
          quick_quiz_enabled: isNativeQuickQuizMode,
          time_per_question_seconds: isNativeQuickQuizMode ? nativeConfig.timePerQuestionSeconds : undefined,
          auto_skip_on_timeout: isNativeQuickQuizMode ? nativeConfig.autoSkipOnTimeout : undefined,
        },
      });
      setCurrentActividadIntento(intento);

      if (completedByRule && !progSecciones[currentSection.id]?.completado) {
        await markSectionComplete(currentSection.id);
      }

      if (completedByRule) {
        if (unansweredQuestionIds.length > 0) {
          setNativeFeedback(`Completada con ${scoreNormalizado}%. Quedaron ${unansweredQuestionIds.length} pregunta(s) sin responder.`);
        } else {
          setNativeFeedback(`Completada con ${scoreNormalizado}%.`);
        }
      } else {
        setNativeFeedback(`Obtuviste ${scoreNormalizado}%. Debes alcanzar ${nativeConfig.scoreThreshold}% para completar.`);
      }
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setNativeSubmitting(false);
    }
  };

  const onAdvanceNativeQuickQuestion = (reason: "timeout" | "manual_skip") => {
    if (!isNativeQuickQuizMode || !nativeConfig || nativeSubmitting) return;
    const isLastQuestion = nativeQuickQuestionIdx >= nativeConfig.questions.length - 1;
    if (isLastQuestion) {
      void onSubmitNativeActividad({
        allowPartial: true,
        source: reason === "timeout" ? "quick_auto_timeout" : "quick_manual_finish",
      });
      return;
    }
    setNativeQuickRemainingSeconds(nativeConfig.timePerQuestionSeconds);
    setNativeQuickQuestionIdx((prev) => Math.min(prev + 1, nativeConfig.questions.length - 1));
  };

  const onSelectNativeAnswer = (questionId: string, optionId: string) => {
    setNativeAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    if (!isNativeQuickQuizMode || !nativeConfig || nativeSubmitting) return;
    if (questionId !== currentNativeQuickQuestion?.id) return;

    const isLastQuestion = nativeQuickQuestionIdx >= nativeConfig.questions.length - 1;
    if (isLastQuestion) {
      void onSubmitNativeActividad({
        allowPartial: true,
        source: "quick_auto_answer",
      });
      return;
    }
    setNativeQuickRemainingSeconds(nativeConfig.timePerQuestionSeconds);
    setNativeQuickQuestionIdx((prev) => Math.min(prev + 1, nativeConfig.questions.length - 1));
  };

  useEffect(() => {
    if (!isNativeQuickQuizMode || isEditor || nativeSubmitting || !currentNativeQuickQuestion) return;
    if (nativeQuickRemainingSeconds <= 0) return;
    const timeoutId = window.setTimeout(() => {
      setNativeQuickRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isNativeQuickQuizMode,
    isEditor,
    nativeSubmitting,
    currentNativeQuickQuestion?.id,
    nativeQuickRemainingSeconds,
  ]);

  useEffect(() => {
    if (!isNativeQuickQuizMode || isEditor || nativeSubmitting || !nativeConfig || !currentNativeQuickQuestion) return;
    if (nativeQuickRemainingSeconds > 0) return;

    const questionId = currentNativeQuickQuestion.id;
    if (nativeTimedOutQuestions[questionId]) return;

    setNativeTimedOutQuestions((prev) => ({ ...prev, [questionId]: true }));
    toast("Tiempo agotado: se anulo esta pregunta y se avanzo a la siguiente.");
    if (nativeConfig.autoSkipOnTimeout) {
      onAdvanceNativeQuickQuestion("timeout");
    }
  }, [
    isNativeQuickQuizMode,
    isEditor,
    nativeSubmitting,
    nativeConfig,
    currentNativeQuickQuestion,
    nativeQuickRemainingSeconds,
    nativeTimedOutQuestions,
  ]);

  useEffect(() => {
    if (
      isEditor
      || !currentSection?.actividad_interactiva_id
      || !currentActividad
      || currentActividad.proveedor === "nativo"
    ) {
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

  const isPdfResource = !!contentURL && contentURL.toLowerCase().includes(".pdf");
  const protectedPdfURL = useMemo(
    () => (isPdfResource && contentURL ? buildProtectedPdfUrl(contentURL) : null),
    [contentURL, isPdfResource],
  );

  useEffect(() => {
    if (!isPdfResource) return;

    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      toast("Visor PDF protegido: accion bloqueada");
    };
    const preventCopyCut = (event: ClipboardEvent) => {
      event.preventDefault();
      toast("Visor PDF protegido: accion bloqueada");
    };
    const preventKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const printScreenPressed = key === "printscreen";
      const blocked =
        (event.ctrlKey && key === "s") ||
        (event.ctrlKey && key === "p") ||
        (event.metaKey && key === "s") ||
        (event.metaKey && key === "p") ||
        printScreenPressed;
      if (!blocked) return;
      event.preventDefault();
      if (printScreenPressed && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText("");
      }
      toast("Visor PDF protegido: accion bloqueada");
    };

    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("copy", preventCopyCut);
    document.addEventListener("cut", preventCopyCut);
    document.addEventListener("keydown", preventKeys);

    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("copy", preventCopyCut);
      document.removeEventListener("cut", preventCopyCut);
      document.removeEventListener("keydown", preventKeys);
    };
  }, [isPdfResource]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (studentAccessDenied) {
    const returnPath = blockedMateriaId ? `/contents/${blockedMateriaId}` : "/contents";
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Esta lección está bloqueada por el orden de avance configurado por tu docente.
        </div>
        <button
          onClick={() => navigate(returnPath)}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Volver a la materia
        </button>
      </div>
    );
  }

  if (!lesson) {
    return <div className="text-center py-8 text-gray-500">{t("lessons.notFound", { defaultValue: "Lección no encontrada" })}</div>;
  }
  const isForoSection = !!currentSection && (currentSection.tipo === "foro" || !!currentSection.foro_id);
  const isQuizSection = currentSection?.tipo === "prueba";
  const isInteractiveSection = currentSection?.tipo === "actividad_interactiva";
  const currentRequisitos = currentSection?.requisitos || [];
  const blockedByRequisitos = currentRequisitos.some((id) => !progSecciones[id]?.completado);

  const sectionCompleted = !!currentSection && !!progSecciones[currentSection.id]?.completado;

  const youtubeValidated = !youtubeVideoId || !!currentVideoProgress?.completado;
  const interactiveValidated = !isInteractiveSection || !!currentActividadIntento?.completado;

  const canMarkComplete =
    !!currentSection &&
    !isEditor &&
    !isQuizSection &&
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
      <button
        onClick={() => navigate(returnPath)}
        className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <ChevronLeft size={16} />
        {returnLabel}
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

              {shouldRenderVideoSection && (
                <div className="mb-4 space-y-3">
                  <div className="relative">
                    {youtubeVideoId ? (
                      <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-black">
                        <div ref={youtubePlayerContainerRef} className="h-full w-full" />

                        {!youtubeApiReady && !youtubeApiLoadFailed && !youtubeApiTimeoutExpired && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-white">
                            Cargando reproductor de YouTube...
                          </div>
                        )}

                        {(youtubeApiLoadFailed || youtubeApiTimeoutExpired || youtubePlayerCreationFailed) && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-4 text-center text-sm text-white">
                            <p>No se pudo cargar el video embebido de YouTube.</p>
                            <p>Recarga la página o abre el video directo en YouTube.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <video
                        ref={videoElementRef}
                        src={contentURL || undefined}
                        controls
                        onLoadedMetadata={onLocalVideoLoadedMetadata}
                        onTimeUpdate={onVideoTimeUpdate}
                        className="w-full rounded"
                      />
                    )}

                    {checkpointPromptVisible && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4">
                        <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
                          {/* This modal is shared for both YouTube and local video checkpoints */}
                          <p className="text-sm font-semibold text-slate-700 mb-2">
                            Checkpoint del video (segundo {currentGating?.checkpoint_segundos}): responde para continuar
                          </p>
                          {checkpointQuestion ? (
                            <>
                              <p className="text-base text-slate-900 mb-4">{checkpointQuestion.prompt}</p>
                              <div className="space-y-3 mb-4">
                                {checkpointQuestion.options.map((option) => (
                                  <label key={option.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition hover:border-indigo-500">
                                    <input
                                      type="radio"
                                      name={`checkpoint-${checkpointQuestion.seccionId}`}
                                      checked={checkpointSelectedOption === option.id}
                                      onChange={() => setCheckpointSelectedOption(option.id)}
                                    />
                                    <span>{option.text}</span>
                                  </label>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => void onSubmitCheckpointQuestion()}
                                disabled={checkpointSubmitting || !checkpointSelectedOption}
                                className="inline-flex items-center justify-center rounded-full bg-indigo-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {checkpointSubmitting ? "Validando..." : "Enviar respuesta y continuar"}
                              </button>
                            </>
                          ) : checkpointQuestionLoading ? (
                            <div className="text-sm text-slate-700">Cargando pregunta del checkpoint...</div>
                          ) : checkpointQuestionLoadError ? (
                            <div className="text-sm text-rose-700">{checkpointQuestionLoadError}</div>
                          ) : (
                            <div className="text-sm text-slate-700">Cargando pregunta del checkpoint...</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditor && hasCheckpointConfig && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Este video tiene un checkpoint en el segundo {currentGating?.checkpoint_segundos}. Responde la pregunta para continuar viendo.
                    </div>
                  )}

                  {showVideoProgress && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-medium text-slate-800 mb-3">Progreso de visualización</p>
                      <div className="w-full overflow-hidden rounded-full bg-slate-200 h-3 mb-3">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{ width: `${videoProgressPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-700 mb-3">
                        <span>{videoProgressPercent}% completado</span>
                        <span>{safeNumber(videoWatchedDraft)} / {safeNumber(videoTotalDraft)} seg</span>
                      </div>
                      <button
                        onClick={() => void onSaveVideoProgress()}
                        disabled={savingVideoProgress}
                        className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingVideoProgress ? "Guardando..." : "Guardar progreso de video"}
                      </button>
                    </div>
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
                      src={protectedPdfURL || contentURL}
                      className="w-full h-[540px] rounded border border-slate-200"
                      title="PDF Recurso"
                      sandbox="allow-scripts allow-same-origin"
                      referrerPolicy="strict-origin-when-cross-origin"
                      onContextMenu={(event) => event.preventDefault()}
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

                      {currentActividad.proveedor === "nativo" && nativeConfig ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-4">
                          {nativeConfig.questions.length === 0 ? (
                            <p className="text-sm text-amber-800">La actividad nativa no tiene preguntas validas configuradas.</p>
                          ) : (
                            <>
                              {isNativeQuickQuizMode ? (
                                <>
                                  <div className="rounded-md border border-emerald-300 bg-white p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                      Quiz veloz activo
                                    </p>
                                    <p className="mt-1 text-sm text-emerald-900">
                                      Pregunta {Math.min(nativeQuickQuestionIdx + 1, nativeConfig.questions.length)} de {nativeConfig.questions.length}
                                      {" | "}Respondidas: {nativeAnsweredCount}
                                      {" | "}Timeout: {nativeTimedOutCount}
                                    </p>
                                    <p className={`mt-1 text-sm font-semibold ${nativeQuickRemainingSeconds <= 5 ? "text-rose-700" : "text-emerald-800"}`}>
                                      Tiempo restante: {nativeQuickRemainingSeconds}s
                                    </p>
                                    <p className="mt-1 text-xs text-emerald-700">
                                      Auto-salto por timeout: {nativeConfig.autoSkipOnTimeout ? "si" : "no"}
                                    </p>
                                  </div>

                                  {currentNativeQuickQuestion && (
                                    <div key={currentNativeQuickQuestion.id} className="rounded-md border border-emerald-200 bg-white p-3">
                                      <p className="text-sm font-medium text-emerald-900 mb-2">
                                        {nativeQuickQuestionIdx + 1}. {currentNativeQuickQuestion.prompt}
                                      </p>
                                      <div className="space-y-2">
                                        {currentNativeQuickQuestion.options.map((option) => (
                                          <label key={option.id} className="flex items-center gap-2 text-sm text-emerald-900">
                                            <input
                                              type="radio"
                                              name={`native-${currentNativeQuickQuestion.id}`}
                                              checked={nativeAnswers[currentNativeQuickQuestion.id] === option.id}
                                              onChange={() => onSelectNativeAnswer(currentNativeQuickQuestion.id, option.id)}
                                            />
                                            {option.text}
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {!isEditor && (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onAdvanceNativeQuickQuestion("manual_skip")}
                                        disabled={nativeSubmitting}
                                        className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                      >
                                        Saltar pregunta
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void onSubmitNativeActividad({ allowPartial: true, source: "quick_manual_finish" })}
                                        disabled={nativeSubmitting}
                                        className="rounded-md bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:opacity-50"
                                      >
                                        {nativeSubmitting ? "Enviando..." : "Finalizar quiz veloz"}
                                      </button>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  {nativeConfig.questions.map((question, index) => (
                                    <div key={question.id} className="rounded-md border border-emerald-200 bg-white p-3">
                                      <p className="text-sm font-medium text-emerald-900 mb-2">{index + 1}. {question.prompt}</p>
                                      <div className="space-y-2">
                                        {question.options.map((option) => (
                                          <label key={option.id} className="flex items-center gap-2 text-sm text-emerald-900">
                                            <input
                                              type="radio"
                                              name={`native-${question.id}`}
                                              checked={nativeAnswers[question.id] === option.id}
                                              onChange={() => onSelectNativeAnswer(question.id, option.id)}
                                            />
                                            {option.text}
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  ))}

                                  {!isEditor && (
                                    <button
                                      type="button"
                                      onClick={() => void onSubmitNativeActividad()}
                                      disabled={nativeSubmitting}
                                      className="rounded-md bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:opacity-50"
                                    >
                                      {nativeSubmitting ? "Enviando..." : "Enviar actividad nativa"}
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
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
                      )}

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <p>
                          Estado: {currentActividadIntento?.completado ? "Completada" : "Pendiente"}
                        </p>
                        <p>Intentos registrados: {currentActividadIntento?.intentos ?? 0}</p>
                        {nativeFeedback && <p className="mt-2 text-sm text-emerald-800">{nativeFeedback}</p>}
                        {!isEditor && !currentActividadIntento?.completado && currentActividad.proveedor !== "nativo" && (
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
                      Esta seccion interactiva no tiene actividad vinculada o no pudo cargarse.
                    </div>
                  )}
                </div>
              )}

              {isQuizSection && (
                <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                  {currentSection.prueba_id ? (
                    <>
                      <p className="text-sm text-indigo-900 mb-2">
                        Completa y aprueba esta prueba para desbloquear la siguiente sección.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate(`/lesson/${lesson.id}/prueba/${currentSection.prueba_id}`)}
                        className="rounded-md bg-indigo-700 px-3 py-2 text-white hover:bg-indigo-800"
                      >
                        Abrir prueba
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-amber-800">
                      Esta sección de prueba no tiene evaluación vinculada.
                    </p>
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

              {!isEditor && !isQuizSection && !progSecciones[currentSection.id]?.completado && (
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