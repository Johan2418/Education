import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api, { API_BASE_URL, authenticatedFetch } from "@/shared/lib/api";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  Pregunta,
  ProgresoSeccion,
  Respuesta,
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
import NativeActivityRenderer from "@/features/lessons/components/nativeActivities/NativeActivityRenderer";
import NativeActivityMatchingPlayer from "@/features/lessons/components/nativeActivities/NativeActivityMatchingPlayer";
import { getPruebaCompleta } from "@/features/pruebas/services/pruebas";
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

function getNativeActivityTypeLabel(type: string): string {
  switch (type) {
    case "true_false":
      return "Verdadero / Falso";
    case "fill_in_the_blank":
      return "Completar espacios";
    case "matching":
      return "Emparejar";
    case "ordering":
      return "Ordenar";
    case "hotspot":
      return "Hotspot";
    case "drag_and_drop":
      return "Arrastrar y soltar";
    case "interactive_map":
      return "Mapa interactivo";
    case "word_search":
      return "Sopa de letras";
    case "crossword":
      return "Crucigrama";
    case "memory":
      return "Memoria";
    case "simulator":
      return "Simulador";
    case "virtual_lab":
      return "Laboratorio virtual";
    default:
      return "Quiz";
  }
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

async function fetchResourceArrayBuffer(resourceUrl: string): Promise<ArrayBuffer> {
  if (resourceUrl.startsWith("data:")) {
    const [, base64Data] = resourceUrl.split(",", 2);
    if (!base64Data) throw new Error("URL de datos inválida");
    const binaryString = atob(base64Data);
    const buffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      buffer[i] = binaryString.charCodeAt(i);
    }
    return buffer.buffer;
  }

  const response = await authenticatedFetch(resourceUrl);
  if (!response.ok) {
    const message = `Error al descargar el recurso: ${response.status}`;
    throw new Error(message);
  }
  return response.arrayBuffer();
}

function inferResourceExtension(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("data:")) {
    const parts = rawUrl.slice(5).split(";");
    const mimeType = parts[0] ?? "";
    if (mimeType.includes("pdf")) return "pdf";
    if (mimeType.includes("word") || mimeType.includes("msword") || mimeType.includes("officedocument.wordprocessingml.document")) return "docx";
    if (mimeType.includes("powerpoint") || mimeType.includes("presentationml.presentation")) return "pptx";
    return null;
  }

  const path = rawUrl.split("?")[0]?.split("#")[0] ?? "";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ext || null;
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

function extractFileNameFromUrl(rawUrl: string | null | undefined, fallback: string): string {
  if (!rawUrl) return fallback;
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const parts = parsed.pathname
      .split("/")
      .filter((part) => part.length > 0);
    if (parts.length > 0) {
      return parts[parts.length - 1] ?? fallback;
    }
  } catch {
    // ignore invalid URL
  }

  const candidate = (((rawUrl ?? "").split("?")[0] || "")
    .split("#")[0] || "")
    .split("/")
    .filter((part) => part.length > 0)
    .pop();
  return candidate ?? fallback;
}

function wrapText(text: string, maxChars = 90): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > maxChars) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = `${word} `;
    } else {
      currentLine += `${word} `;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines;
}

function extractTextFromPptxSlide(slide: any): string[] {
  if (!slide || typeof slide !== "object") return [];

  const lines: string[] = [];
  const pageElements = Array.isArray(slide.pageElements) ? slide.pageElements : [];

  for (const element of pageElements) {
    if (element.shape) {
      lines.push(...getSlideTextFromPptxShape(element.shape));
    }
    if (element.group?.children) {
      for (const child of element.group.children) {
        if (child.shape) {
          lines.push(...getSlideTextFromPptxShape(child.shape));
        }
      }
    }
  }

  return lines.filter(Boolean);
}

async function waitForVfCanvas(container: HTMLElement, timeout = 4000): Promise<HTMLCanvasElement> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const canvas = container.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      return canvas;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("No se encontró el canvas para renderizar la diapositiva PPTX.");
}

async function createPdfFromPptxPresentation(pptxBlob: Blob): Promise<{ pdfBytes: Uint8Array; slideCount: number }> {
  const parserModule = await import("pptx-parser");
  const parse = parserModule.default ?? parserModule;
  const vfRenderer = parserModule.vf;
  if (typeof vfRenderer !== "function") {
    throw new Error("No se encontró el renderer VF para PPTX.");
  }

  const pptJson = await parse(pptxBlob, { flattenGroup: true });
  const slideCount = Array.isArray(pptJson?.slides) ? pptJson.slides.length : 0;
  if (slideCount === 0) {
    throw new Error("No se encontraron diapositivas en la presentación.");
  }

  const width = pptJson.pageSize?.width?.value ?? 1024;
  const height = pptJson.pageSize?.height?.value ?? 768;
  const vfJson = await vfRenderer(pptJson, { width, height });
  const tmpJsonUrl = URL.createObjectURL(new Blob([JSON.stringify(vfJson)], { type: "application/json" }));

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.opacity = "0";
  document.body.appendChild(container);

  try {
    const launcher = await import("@vf.js/launcher");
    const createVF = launcher.createVF;
    if (typeof createVF !== "function") {
      throw new Error("No se pudo cargar @vf.js/launcher para renderizar PPTX.");
    }

    return await new Promise<{ pdfBytes: Uint8Array; slideCount: number }>((resolve, reject) => {
      let player: any = null;
      let currentSlideIndex = 0;
      const images: string[] = [];
      let disposed = false;

      const cleanup = () => {
        if (!disposed) {
          disposed = true;
          if (player?.dispose) {
            try {
              player.dispose(true);
            } catch {
              // ignore
            }
          }
          URL.revokeObjectURL(tmpJsonUrl);
          if (container.parentElement) {
            container.parentElement.removeChild(container);
          }
        }
      };

      const captureSlide = async () => {
        try {
          const canvas = await waitForVfCanvas(container);
          const imageDataUrl = canvas.toDataURL("image/png");
          images.push(imageDataUrl);

          if (images.length >= slideCount) {
            const pdfDoc = await PDFDocument.create();
            for (const imageUrl of images) {
              const pngImage = await pdfDoc.embedPng(imageUrl);
              const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
              page.drawImage(pngImage, {
                x: 0,
                y: 0,
                width: pngImage.width,
                height: pngImage.height,
              });
            }
            const pdfBytes = await pdfDoc.save();
            cleanup();
            resolve({ pdfBytes, slideCount });
            return;
          }

          currentSlideIndex += 1;
          player.switchToSceneIndex(currentSlideIndex);
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      const config = {
        version: "2.0.12",
        container,
        width,
        height,
        resolution: window.devicePixelRatio || 1,
        platform: { from: "debug", role: 1 },
        usePlayer: true,
        forceCanvas: true,
        debugEengineJson: "https://vf-cdn.yunkc.cn/vf/v2.0.12.json",
        debugVFPath: "https://vf-cdn.yunkc.cn/vf/",
        debug: false,
      };

      createVF(config, (createdPlayer: any) => {
        player = createdPlayer;
        player.onError = (err: any) => {
          cleanup();
          reject(err);
        };
        player.onDispose = () => {
          cleanup();
        };
        player.onSceneCreate = () => {
          void captureSlide();
        };
        player.play(tmpJsonUrl);
      });
    });
  } finally {
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  }
}

function getSlideTextFromPptxShape(shape: any): string[] {
  if (!shape || typeof shape !== "object") return [];
  const paragraphs = shape.text?.paragraphs ?? shape.text?.textSpans ?? [];
  if (!Array.isArray(paragraphs)) return [];
  return paragraphs
    .map((paragraph: any) => {
      const spans = paragraph?.textSpans ?? [paragraph];
      if (!Array.isArray(spans)) return "";
      return spans
        .map((span: any) => span?.textRun?.content ?? span?.content ?? "")
        .filter(Boolean)
        .join("");
    })
    .filter(Boolean);
}

function renderPptxElement(element: any, index: number): any {
  if (!element || typeof element !== "object") {
    return <div key={index} className="text-sm text-slate-600">Contenido de diapositiva no disponible</div>;
  }

  if (element.image?.contentUrl) {
    return (
      <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Imagen</div>
        <img
          src={element.image.contentUrl}
          alt={element.name || `Diapositiva ${index + 1} imagen`}
          className="w-full rounded-md border border-slate-200 object-contain"
        />
      </div>
    );
  }

  if (element.shape) {
    const lines = getSlideTextFromPptxShape(element.shape);
    if (lines.length > 0) {
      return (
        <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Texto</div>
          <div className="space-y-2 text-sm text-slate-700">
            {lines.map((line, lineIndex) => (
              <p key={lineIndex} className="leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Forma</div>
        <div>{element.shape.shapeType || element.shape.name || "Elemento de forma"}</div>
      </div>
    );
  }

  if (element.group?.children) {
    return (
      <div key={index} className="space-y-3">
        {element.group.children.map((child: any, childIndex: number) => renderPptxElement(child, childIndex))}
      </div>
    );
  }

  return (
    <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Elemento desconocido</div>
      <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(element, null, 2)}</pre>
    </div>
  );
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

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
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfPagesSeen, setPdfPagesSeen] = useState<Set<number>>(new Set());
  const [pptxPdfUrl, setPptxPdfUrl] = useState<string | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxLoadError, setDocxLoadError] = useState<string | null>(null);
  const [docxScrollComplete, setDocxScrollComplete] = useState(false);
  const [docxHasInteracted, setDocxHasInteracted] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageQuestion, setImageQuestion] = useState<(Pregunta & { respuestas: Respuesta[] }) | null>(null);
  const [imageQuestionLoading, setImageQuestionLoading] = useState(false);
  const [imageQuestionLoadError, setImageQuestionLoadError] = useState<string | null>(null);
  const [imageQuestionSelectedOption, setImageQuestionSelectedOption] = useState<string>("");
  const [imageQuestionAnswered, setImageQuestionAnswered] = useState(false);
  const [imageQuestionCorrect, setImageQuestionCorrect] = useState<boolean | null>(null);
  const [showImageQuestionModal, setShowImageQuestionModal] = useState(false);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [pptxLoadError, setPptxLoadError] = useState<string | null>(null);
  const [pptxSlides, setPptxSlides] = useState<any[]>([]);
  const [pptxSlideCount, setPptxSlideCount] = useState(0);
  const [pptxCurrentSlideIndex, setPptxCurrentSlideIndex] = useState(0);
  const [pptxSlidesViewed, setPptxSlidesViewed] = useState<Set<number>>(new Set());
  const docxViewerRef = useRef<HTMLDivElement | null>(null);
  const [nativeAnswers, setNativeAnswers] = useState<Record<string, string>>({});
  const [nativeOrderingState, setNativeOrderingState] = useState<Record<string, string[]>>({});
  const [nativeOrderingDragOverId, setNativeOrderingDragOverId] = useState<string | null>(null);
  const [nativeSubmitting, setNativeSubmitting] = useState(false);
  const [nativeFeedback, setNativeFeedback] = useState<string | null>(null);
  const [nativeScore, setNativeScore] = useState<number | null>(null);
  const [nativeQuickQuestionIdx, setNativeQuickQuestionIdx] = useState(0);
  const [nativeQuickRemainingSeconds, setNativeQuickRemainingSeconds] = useState(0);
  const [nativeTimedOutQuestions, setNativeTimedOutQuestions] = useState<Record<string, boolean>>({});
  const nativeQuickStartedAtMsRef = useRef<number | null>(null);
  const nativeQuickTimerReadyRef = useRef(false);
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
  const videoSectionAlreadyCompleted = Boolean(currentVideoProgress?.completado);
  const videoProgressPercent = useMemo(() => {
    const watched = safeNumber(videoWatchedDraft);
    const total = safeNumber(videoTotalDraft);
    if (total <= 0) return 0;
    const effectiveTotal = Math.max(1, total - 2);
    const effectiveWatched = Math.min(watched, effectiveTotal);
    return Math.min(100, Math.max(0, Math.round((effectiveWatched / effectiveTotal) * 100)));
  }, [videoWatchedDraft, videoTotalDraft]);
  const showVideoProgress = useMemo(() => safeNumber(videoTotalDraft) > 0, [videoTotalDraft]);

  useEffect(() => {
    setImageLoaded(false);
  }, [currentSection?.id, contentURL]);

  const currentSectionRef = useRef<LeccionSeccion | null>(null);
  const currentGatingRef = useRef<LeccionSeccionGatingPDF | null>(null);
  const checkpointQuestionRef = useRef<CheckpointQuestion | null>(null);
  const checkpointUnlockedRef = useRef(false);
  const checkpointPromptVisibleRef = useRef(false);
  const checkpointAttemptedRef = useRef(false);
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

  const checkpointAnswered = useMemo(() => {
    if (!currentGating?.habilitado || !currentGating.seccion_preguntas_id) return false;
    const progress = progSecciones[currentGating.seccion_preguntas_id];
    return progress != null;
  }, [currentGating, progSecciones]);

  useEffect(() => {
    currentSectionRef.current = currentSection ?? null;
    currentGatingRef.current = currentGating;
    checkpointQuestionRef.current = checkpointQuestion;
    checkpointUnlockedRef.current = checkpointUnlocked;
    checkpointPromptVisibleRef.current = checkpointPromptVisible;
  }, [currentSection, currentGating, checkpointQuestion, checkpointUnlocked, checkpointPromptVisible]);

  useEffect(() => {
    if (checkpointAnswered) {
      checkpointAttemptedRef.current = true;
    }
    if (checkpointAnswered && checkpointPromptVisible) {
      setCheckpointPromptVisible(false);
      setCheckpointQuestionLoading(false);
      setCheckpointQuestionLoadError(null);
    }
  }, [checkpointAnswered, checkpointPromptVisible]);

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

      const videoCompleted = Boolean(currentVideoProgressRef.current?.completado);
      if (hasForwardSeek && !videoCompleted) {
        youtubePlayerRef.current.seekTo(previousMax, true);
        youtubePlayerRef.current.pauseVideo?.();
        toast("No puedes adelantar el video. Continúa viendo para desbloquear más contenido.", { duration: 3000 });
        lastYoutubeTimeRef.current = previousMax;
        lastYoutubePollAtRef.current = now;
        return;
      }

      if (!videoCompleted && currentTime > previousMax) {
        maxAllowedYoutubeTimeRef.current = currentTime;
      }
      lastYoutubeTimeRef.current = currentTime;
      lastYoutubePollAtRef.current = now;

      const duration = youtubePlayerRef.current.getDuration?.();
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        setVideoTotalDraft(String(Math.floor(duration)));
      }
      setVideoWatchedDraft(String(Math.floor(currentTime)));

      if (!checkpointUnlocked && !checkpointAnswered && !checkpointAttemptedRef.current && !videoCompleted && currentTime >= checkpointSeconds && !checkpointPromptVisible) {
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

    setYoutubeApiLoadFailed(false);
    setYoutubeApiTimeoutExpired(false);
    setYoutubePlayerCreationFailed(false);

    if (youtubePlayerRef.current?.destroy) {
      youtubePlayerRef.current.destroy();
    }
    youtubePlayerRef.current = null;
    if (youtubePlayerContainerRef.current) {
      youtubePlayerContainerRef.current.innerHTML = "";
    }

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

    const checkpointQuizId = currentGating?.habilitado ? currentGating.seccion_preguntas_id : undefined;
    const requiredSections = secciones.filter((section) =>
      section.es_obligatorio !== false && section.id !== checkpointQuizId,
    );
    if (requiredSections.length === 0) return;

    const completedAllRequired = requiredSections.every((section) => !!progressMap[section.id]?.completado);
    if (!completedAllRequired) return;

    const numericScores = requiredSections
      .map((section) => progressMap[section.id]?.puntuacion)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const lessonScore = numericScores.length > 0
      ? Math.round(numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length)
      : null;

    lessonProgressSyncingRef.current = true;
    try {
      await upsertProgreso({
        leccion_id: lesson.id,
        completado: true,
        puntaje: lessonScore ?? undefined,
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
  const isNativeQuickQuizMode = Boolean(nativeConfig?.activityType === "quiz" && nativeConfig?.isQuickQuiz && nativeConfig.questions.length > 0);
  const isNativeDragAndDropMode = nativeConfig?.activityType === "drag_and_drop";
  const isNativeInteractiveMapMode = nativeConfig?.activityType === "interactive_map";
  const isNativeHotspotMode = nativeConfig?.activityType === "hotspot";
  const isNativeFillInTheBlankMode = nativeConfig?.activityType === "fill_in_the_blank";
  const currentNativeQuickQuestion = isNativeQuickQuizMode
    ? (nativeConfig?.questions[nativeQuickQuestionIdx] ?? null)
    : null;
  const currentNativeOrderingQuestion = nativeConfig?.activityType === "ordering"
    ? nativeConfig.questions[0] ?? null
    : null;
  const currentNativeHotspotOptions = nativeConfig?.hotspots ?? [];
  const nativeHotspotImageUrl = nativeConfig?.hotspotImageUrl ?? null;
  const nativeActivityHasContent = Boolean(
    (nativeConfig?.questions.length ?? 0) > 0
    || isNativeHotspotMode
    || isNativeDragAndDropMode
    || isNativeInteractiveMapMode
    || isNativeFillInTheBlankMode
  );
  const nativeAnsweredCount = nativeConfig
    ? (isNativeFillInTheBlankMode
      ? Object.keys(nativeAnswers).filter((key) => key.startsWith(`${nativeConfig.questions[0]?.id}:`)).length
      : nativeConfig.questions.filter((question) => Boolean(nativeAnswers[question.id])).length)
    : 0;
  const nativeTimedOutCount = nativeConfig
    ? (isNativeFillInTheBlankMode ? 0 : nativeConfig.questions.filter((question) => nativeTimedOutQuestions[question.id]).length)
    : 0;
  const nativeOrderingIds = currentNativeOrderingQuestion
    ? nativeOrderingState[currentNativeOrderingQuestion.id] ?? currentNativeOrderingQuestion.options.map((option) => option.id)
    : [];

  useEffect(() => {
    setNativeAnswers({});
    setNativeTimedOutQuestions({});
    setNativeQuickQuestionIdx(0);
    setNativeFeedback(null);
    if (currentNativeOrderingQuestion) {
      setNativeOrderingState((prev) => ({
        ...prev,
        [currentNativeOrderingQuestion.id]: currentNativeOrderingQuestion.options.map((option) => option.id),
      }));
    }
    setNativeQuickRemainingSeconds(nativeConfig?.timePerQuestionSeconds ?? 0);
  }, [nativeConfig?.activityType, currentNativeOrderingQuestion?.id, currentActividad?.id, currentSection?.id]);

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
    setNativeScore(null);
    setNativeQuickQuestionIdx(0);
    setNativeQuickRemainingSeconds(0);
    setNativeTimedOutQuestions({});
    nativeQuickStartedAtMsRef.current = null;
    nativeQuickTimerReadyRef.current = false;
  }, [currentSection?.id, currentActividad?.id]);

  useEffect(() => {
    if (!currentSection || !currentActividadIntento?.completado || currentSection.tipo !== "actividad_interactiva" || isEditor) {
      return;
    }
    if (progSecciones[currentSection.id]?.completado) return;

    void markSectionComplete(currentSection.id);
  }, [currentSection, currentActividadIntento?.completado, isEditor, progSecciones, markSectionComplete]);

  useEffect(() => {
    if (!isNativeQuickQuizMode || !nativeConfig) {
      setNativeQuickRemainingSeconds(0);
      nativeQuickStartedAtMsRef.current = null;
      nativeQuickTimerReadyRef.current = false;
      return;
    }
    setNativeQuickQuestionIdx(0);
    setNativeQuickRemainingSeconds(nativeConfig.timePerQuestionSeconds);
    nativeQuickStartedAtMsRef.current = Date.now();
    nativeQuickTimerReadyRef.current = false;
  }, [isNativeQuickQuizMode, nativeConfig, currentSection?.id, currentActividad?.id]);

  useEffect(() => {
    if (!isNativeQuickQuizMode || !nativeConfig) return;
    setNativeQuickRemainingSeconds(nativeConfig.timePerQuestionSeconds);
  }, [isNativeQuickQuizMode, nativeConfig, nativeQuickQuestionIdx]);

  useEffect(() => {
    if (!isNativeQuickQuizMode || !nativeConfig) {
      nativeQuickTimerReadyRef.current = false;
      return;
    }

    if (nativeQuickStartedAtMsRef.current != null && nativeQuickRemainingSeconds === nativeConfig.timePerQuestionSeconds) {
      nativeQuickTimerReadyRef.current = true;
    }
  }, [isNativeQuickQuizMode, nativeConfig, nativeQuickRemainingSeconds, currentNativeQuickQuestion?.id]);

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

    const alreadyAnswered = relatedProgress != null;
    if (alreadyAnswered) {
      setCheckpointQuestionLoading(false);
      setCheckpointQuestionLoadError(null);
      setCheckpointPromptVisible(false);
      setCheckpointQuestion(null);
      return;
    }

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
    if (!currentGating?.habilitado || !checkpointQuestion || checkpointUnlocked || checkpointPromptVisible || checkpointAnswered || checkpointAttemptedRef.current || videoSectionAlreadyCompleted) return;

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

      checkpointAttemptedRef.current = true;
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

        toast.error("Respuesta incorrecta. El video continuará para que sigas con el contenido.");
      }

      if (
        currentSection?.tipo === "video" &&
        videoProgressPercent >= 100 &&
        !progSecciones[currentSection.id]?.completado
      ) {
        await markSectionComplete(currentSection.id);
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
    if (!currentSection?.actividad_interactiva_id || !nativeConfig) return;
    if (nativeSubmitting) return;
    const hasNativeInteraction = isNativeHotspotMode || isNativeDragAndDropMode || isNativeInteractiveMapMode || isNativeFillInTheBlankMode;
    // Para ordering, solo validar que existan elementos a ordenar
    if (nativeConfig.activityType === "ordering") {
      if (!nativeConfig.questions || nativeConfig.questions.length === 0 || !nativeConfig.questions[0] || !nativeConfig.questions[0].options || nativeConfig.questions[0].options.length === 0) {
        toast.error("La actividad de ordenar requiere al menos un elemento para ordenar.");
        return;
      }
    } else {
      if (nativeConfig.questions.length === 0 && !hasNativeInteraction) return;
    }

    const allowPartial = options?.allowPartial ?? false;
    const fillBlankText = nativeConfig.fillBlankText || nativeConfig.questions[0]?.prompt || "";
    const fillBlankMatches = isNativeFillInTheBlankMode ? fillBlankText.match(/___+/g) || [] : [];
    const fillInBlankKeys = isNativeFillInTheBlankMode
      ? Array.from({ length: fillBlankMatches.length }, (_, index) => `${nativeConfig.questions[0]?.id ?? "fill_blank_1"}:${index}`)
      : [];
    let unansweredQuestionIds: string[] = [];
    if (nativeConfig.activityType === "ordering") {
      // No requiere validación de preguntas respondidas
      unansweredQuestionIds = [];
    } else {
      unansweredQuestionIds = isNativeHotspotMode
        ? (nativeAnswers.hotspot ? [] : ["hotspot_selection"])
        : isNativeDragAndDropMode
          ? (nativeConfig.dragAndDropItems ?? []).filter((item) => !nativeAnswers[item.id]).map((item) => item.id)
          : isNativeInteractiveMapMode
            ? (nativeAnswers["map_selection"] ? [] : ["map_selection"])
            : isNativeFillInTheBlankMode
              ? fillInBlankKeys.filter((key) => !nativeAnswers[key])
              : nativeConfig.questions
                .filter((question) => !nativeAnswers[question.id])
                .map((question) => question.id);
      if (!allowPartial && unansweredQuestionIds.length > 0) {
        toast.error("Responde todas las preguntas para enviar la actividad nativa.");
        return;
      }
    }

    const timedOutQuestionIds = isNativeHotspotMode || isNativeDragAndDropMode || isNativeInteractiveMapMode || isNativeFillInTheBlankMode
      ? []
      : nativeConfig.questions
        .filter((question) => nativeTimedOutQuestions[question.id])
        .map((question) => question.id);

    let correctAnswers = 0;
    let scoringItems = isNativeHotspotMode ? 1 : isNativeFillInTheBlankMode ? fillInBlankKeys.length : nativeConfig.questions.length;
    if (nativeConfig.activityType === "fill_in_the_blank") {
      const fillBlankQuestion = nativeConfig.questions[0] ?? { id: "fill_blank_1", prompt: "", options: [] };
      const fillBlankAnswers = nativeConfig.fillBlankAnswers ?? [];
      const bankItems = (nativeConfig.fillBlankWordBank?.filter((word) => word.trim()) ?? fillBlankQuestion.options.map((option) => option.text.trim()).filter((text) => text))
        .map((text, index) => ({ id: `${fillBlankQuestion.id}_word_${index}`, text }));
      const expectedAnswers = fillBlankAnswers.length >= fillInBlankKeys.length
        ? fillBlankAnswers
        : fillBlankQuestion.options.map((option) => option.text.trim()).filter((text) => text);

      correctAnswers = fillInBlankKeys.reduce((total, key) => {
        const blankIndex = Number(key.split(":")[1] ?? -1);
        const expectedText = expectedAnswers[blankIndex]?.trim().toLowerCase() || "";
        if (!expectedText) return total;
        const selectedId = nativeAnswers[key] || "";
        const selectedText = bankItems.find((item) => item.id === selectedId)?.text || selectedId;
        return selectedText.trim().toLowerCase() === expectedText ? total + 1 : total;
      }, 0);
    } else if (nativeConfig.activityType === "ordering" && currentNativeOrderingQuestion) {
      scoringItems = currentNativeOrderingQuestion.options.length;
      const orderingIds = nativeOrderingState[currentNativeOrderingQuestion.id] ?? currentNativeOrderingQuestion.options.map((option) => option.id);
      const correctOrder = currentNativeOrderingQuestion.options.map((option) => option.id);
      correctAnswers = orderingIds.reduce((total, optionId, index) => (
        optionId === correctOrder[index] ? total + 1 : total
      ), 0);
    } else if (nativeConfig.activityType === "drag_and_drop") {
      scoringItems = nativeConfig.dragAndDropItems?.length ?? 0;
      correctAnswers = (nativeConfig.dragAndDropItems ?? []).reduce((total, item) => {
        const selectedCategory = nativeAnswers[item.id];
        return total + (selectedCategory && selectedCategory === item.targetCategoryId ? 1 : 0);
      }, 0);
    } else if (nativeConfig.activityType === "interactive_map") {
      scoringItems = 1;
      const selectedId = nativeAnswers["map_selection"];
      const selectedMarker = nativeConfig.mapMarkers?.find((marker) => marker.id === selectedId);
      correctAnswers = selectedMarker?.isCorrect ? 1 : 0;
    } else if (isNativeHotspotMode) {
      const selectedId = nativeAnswers.hotspot;
      const selectedOption = currentNativeHotspotOptions.find((option) => option.id === selectedId);
      correctAnswers = selectedOption?.isCorrect ? 1 : 0;
    } else {
      correctAnswers = nativeConfig.questions.reduce((total, question) => {
        const selectedId = nativeAnswers[question.id];
        const selectedOption = question.options.find((option) => option.id === selectedId);
        return total + (selectedOption?.isCorrect ? 1 : 0);
      }, 0);
    }
    if (nativeSubmitting) return;

    const scoreNormalizado = Math.round((correctAnswers / Math.max(1, scoringItems)) * 100);

    const completedByRule = currentActividad?.regla_completitud === "puntaje"
      ? scoreNormalizado >= nativeConfig.scoreThreshold
      : true;
    const elapsedSeconds = nativeQuickStartedAtMsRef.current != null
      ? Math.max(1, Math.round((Date.now() - nativeQuickStartedAtMsRef.current) / 1000))
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
          native_activity_type: nativeConfig.activityType,
          native_mode: isNativeQuickQuizMode ? "quick_quiz" : "standard_quiz",
          total_questions: scoringItems,
          answered_questions: scoringItems - unansweredQuestionIds.length,
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
      setNativeScore(scoreNormalizado);

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
    nativeQuickStartedAtMsRef.current = Date.now();
    nativeQuickTimerReadyRef.current = false;
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
    nativeQuickTimerReadyRef.current = false;
    setNativeQuickRemainingSeconds(nativeConfig.timePerQuestionSeconds);
    setNativeQuickQuestionIdx((prev) => Math.min(prev + 1, nativeConfig.questions.length - 1));
    nativeQuickStartedAtMsRef.current = Date.now();
  };

  useEffect(() => {
    if (!isNativeQuickQuizMode || isEditor || nativeSubmitting || !currentNativeQuickQuestion || !nativeConfig) return;
    if (nativeQuickStartedAtMsRef.current == null) return;

    const updateRemainingSeconds = () => {
      const elapsedSeconds = Math.floor((Date.now() - nativeQuickStartedAtMsRef.current!) / 1000);
      const remaining = Math.max(0, nativeConfig.timePerQuestionSeconds - elapsedSeconds);
      setNativeQuickRemainingSeconds(remaining);
    };

    updateRemainingSeconds();
    const intervalId = window.setInterval(updateRemainingSeconds, 250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    isNativeQuickQuizMode,
    isEditor,
    nativeSubmitting,
    currentNativeQuickQuestion?.id,
    nativeConfig?.timePerQuestionSeconds,
  ]);

  useEffect(() => {
    if (!isNativeQuickQuizMode || isEditor || nativeSubmitting || !nativeConfig || !currentNativeQuickQuestion) return;
    if (!nativeQuickTimerReadyRef.current) return;
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
      || currentActividad.proveedor !== "nativo"
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

  const checkpointAttempted = useMemo(() => {
    if (!currentGating?.habilitado || !currentGating.seccion_preguntas_id) return false;
    return progSecciones[currentGating.seccion_preguntas_id] != null;
  }, [currentGating, progSecciones]);

  const checkpointSectionId = currentGating?.seccion_preguntas_id;
  const visibleSections = useMemo(() => {
    if (!checkpointAttempted || !checkpointSectionId) return secciones;
    return secciones.filter((section) => section.id !== checkpointSectionId);
  }, [secciones, checkpointAttempted, checkpointSectionId]);
  const sectionIndexById = useMemo(
    () => Object.fromEntries(secciones.map((section, idx) => [section.id, idx])),
    [secciones],
  );
  const lessonCompletionPercent = useMemo(() => {
    const total = visibleSections.length;
    if (total === 0) return 0;
    const completed = visibleSections.filter((section) => Boolean(progSecciones[section.id]?.completado)).length;
    return Math.round((completed / total) * 100);
  }, [visibleSections, progSecciones]);

  const resourceExtension = inferResourceExtension(contentURL) || "";
  const isPdfResource = resourceExtension === "pdf";
  const isDocxResource = ["docx", "doc"].includes(resourceExtension);
  const isPptxResource = ["ppt", "pptx"].includes(resourceExtension);
  const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "tiff", "tif", "ico"];
  const isImageResource = imageExtensions.includes(resourceExtension) || currentRecurso?.tipo === "imagen";
  const isImageViewable = isImageResource && Boolean(contentURL);
  const pdfViewerUrl = isPdfResource ? contentURL : isPptxResource ? pptxPdfUrl : null;
  const isPdfViewable = Boolean(pdfViewerUrl);
  const protectedPdfURL = useMemo(
    () => (isPdfResource && contentURL ? buildProtectedPdfUrl(contentURL) : null),
    [contentURL, isPdfResource],
  );

  const documentReadTrackingRequired = isPdfResource || isDocxResource || isPptxResource;
  const pdfReadComplete = isPdfViewable && pdfPageCount > 0 && pdfPagesSeen.size >= pdfPageCount;
  const docxReadComplete = isDocxResource && docxScrollComplete;
  const pptxReadComplete = isPptxResource && pdfReadComplete;
  const documentReadComplete = isPdfResource
    ? pdfReadComplete
    : isDocxResource
    ? docxReadComplete
    : isPptxResource
    ? pptxReadComplete
    : true;
  const documentReadTrackingFailed =
    (isPdfResource && Boolean(pdfLoadError)) ||
    (isDocxResource && Boolean(docxLoadError)) ||
    (isPptxResource && Boolean(pptxLoadError));
  const documentReadyToComplete = !documentReadTrackingRequired || documentReadComplete || documentReadTrackingFailed;

  const imageSectionValidated = (currentSection?.tipo === "imagen" || (currentSection?.tipo === "recurso" && isImageViewable)) && Boolean(contentURL) && imageLoaded;
  const imageQuestionSection = useMemo(() => {
    if (!currentSection || !isImageViewable) return null;
    if (currentSection.prueba_id) return currentSection;
    const currentIndex = sectionIndexById[currentSection.id];
    if (currentIndex == null) return null;
    const nextSection = secciones[currentIndex + 1];
    if (!nextSection) return null;
    if (nextSection.tipo === "prueba" && nextSection.prueba_id) return nextSection;
    return null;
  }, [currentSection, isImageViewable, sectionIndexById, secciones]);
  const imageQuestionAvailable = Boolean(imageQuestionSection?.prueba_id);
  const imageQuestionRequired = imageQuestionAvailable && isImageViewable;
  const imageQuestionPending = imageQuestionAvailable && !imageQuestionAnswered;

  const gatingSatisfied = useMemo(() => {
    if (!currentGating?.habilitado) return true;

    if (imageSectionValidated) {
      return true;
    }

    if (currentSection?.tipo === "actividad_interactiva" && currentActividadIntento?.completado) {
      return true;
    }

    if (currentSection?.tipo === "recurso" && documentReadyToComplete) {
      return true;
    }

    if (!currentGating.seccion_preguntas_id) return false;

    if (currentGating.checkpoint_segundos != null && currentGating.checkpoint_segundos > 0) {
      return checkpointAttempted || videoSectionAlreadyCompleted;
    }

    const preguntasProgress = progSecciones[currentGating.seccion_preguntas_id];
    if (!preguntasProgress?.completado) return false;

    const puntuacion = preguntasProgress.puntuacion ?? 0;
    return puntuacion >= currentGating.puntaje_minimo;
  }, [currentGating, progSecciones, checkpointAttempted, videoSectionAlreadyCompleted, currentSection?.tipo, documentReadComplete, currentActividadIntento?.completado]);

  const getNextSectionIndex = useCallback((currentIndex: number) => {
    let nextIndex = currentIndex + 1;
    while (nextIndex < secciones.length) {
      const nextSection = secciones[nextIndex];
      if (!nextSection) break;
      if (checkpointAttempted && checkpointSectionId && nextSection.id === checkpointSectionId) {
        nextIndex += 1;
        continue;
      }
      if (
        currentSection?.tipo === "actividad_interactiva" &&
        currentSection.actividad_interactiva_id &&
        nextSection.actividad_interactiva_id === currentSection.actividad_interactiva_id
      ) {
        nextIndex += 1;
        continue;
      }
      return nextIndex;
    }
    return currentIndex;
  }, [checkpointAttempted, checkpointSectionId, secciones, currentSection?.tipo, currentSection?.actividad_interactiva_id]);

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

  useEffect(() => {
    if (!pdfViewerUrl) {
      setPdfDoc(null);
      setPdfPageCount(0);
      setPdfCurrentPage(1);
      setPdfPagesSeen(new Set());
      setPdfLoading(false);
      setPdfLoadError(null);
      return;
    }

    let active = true;
    setPdfLoading(true);
    setPdfLoadError(null);
    setPdfDoc(null);
    setPdfPageCount(0);
    setPdfCurrentPage(1);
    setPdfPagesSeen(new Set());

    void (async () => {
      try {
        const raw = await fetchResourceArrayBuffer(pdfViewerUrl);
        const pdf = await pdfjsLib.getDocument({ data: raw }).promise;
        if (!active) return;
        setPdfDoc(pdf);
        setPdfPageCount(pdf.numPages);
        setPdfCurrentPage(1);
        if (isPptxResource) {
          setPptxSlideCount(pdf.numPages);
        }
      } catch (err) {
        if (active) {
          setPdfLoadError(normalizeError(err));
        }
      } finally {
        if (active) {
          setPdfLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [pdfViewerUrl]);

  useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) return;
    let active = true;

    void (async () => {
      try {
        const page = await pdfDoc.getPage(pdfCurrentPage);
        if (!active || !pdfCanvasRef.current) return;

        const viewport = page.getViewport({ scale: 1.3 });
        const canvas = pdfCanvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
        if (!active) return;
        setPdfPagesSeen((prev) => new Set([...prev, pdfCurrentPage]));
      } catch (err) {
        console.error("Error rendering PDF page:", err);
      }
    })();

    return () => {
      active = false;
    };
  }, [pdfDoc, pdfCurrentPage]);

  useEffect(() => {
    if (!contentURL || !isDocxResource) {
      setDocxHtml(null);
      setDocxLoading(false);
      setDocxLoadError(null);
      setDocxScrollComplete(false);
      setDocxHasInteracted(false);
      setPptxLoadError(null);
      return;
    }

    let active = true;
    setDocxLoading(true);
    setDocxLoadError(null);
    setDocxHtml(null);
    setDocxScrollComplete(false);
    setDocxHasInteracted(false);

    void (async () => {
      try {
        const raw = await fetchResourceArrayBuffer(contentURL);
        const result = await mammoth.convertToHtml({ arrayBuffer: raw });
        if (!active) return;
        setDocxHtml(result.value);
      } catch (err) {
        if (active) {
          setDocxLoadError(normalizeError(err));
        }
      } finally {
        if (active) {
          setDocxLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [contentURL, isDocxResource]);

  useEffect(() => {
    setImageQuestion(null);
    setImageQuestionLoadError(null);
    setImageQuestionSelectedOption("");
    setImageQuestionAnswered(false);
    setImageQuestionCorrect(null);

    const targetQuestionSection = imageQuestionSection;
    if (!targetQuestionSection || !targetQuestionSection.prueba_id || !isImageViewable) {
      setImageQuestionLoading(false);
      return;
    }

    let active = true;
    setImageQuestionLoading(true);
    setImageQuestionLoadError(null);

    void getPruebaCompleta(targetQuestionSection.prueba_id)
      .then((response) => {
        if (!active) return;
        const prueba = unwrapApiData(response);
        const firstQuestion = prueba?.preguntas?.[0];
        if (!firstQuestion || !Array.isArray(firstQuestion.respuestas) || firstQuestion.respuestas.length === 0) {
          setImageQuestionLoadError("No se encontró la pregunta de imagen o no tiene opciones disponibles.");
          setImageQuestion(null);
          return;
        }
        setImageQuestion(firstQuestion);
      })
      .catch((error) => {
        if (!active) return;
        setImageQuestionLoadError(normalizeError(error));
      })
      .finally(() => {
        if (active) {
          setImageQuestionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentSection?.tipo, currentSection?.prueba_id, contentURL, imageQuestionSection]);

  useEffect(() => {
    setPptxLoadError(null);
  }, [contentURL, isPptxResource]);

  useEffect(() => {
    if (!contentURL || !isPptxResource) {
      setPptxLoading(false);
      setPptxLoadError(null);
      setPptxSlides([]);
      setPptxSlideCount(0);
      setPptxCurrentSlideIndex(0);
      setPptxSlidesViewed(new Set());
      setPptxPdfUrl(null);
      return;
    }

    let active = true;
    let pdfObjectUrl: string | null = null;
    setPptxLoading(true);
    setPptxLoadError(null);
    setPptxSlides([]);
    setPptxSlideCount(0);
    setPptxCurrentSlideIndex(0);
    setPptxSlidesViewed(new Set());
    setPptxPdfUrl(null);
    setPdfLoadError(null);

    void (async () => {
      try {
        const raw = await fetchResourceArrayBuffer(contentURL);
        const convertResponse = await authenticatedFetch("/recursos/pptx-to-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
          body: raw,
        });

        if (!convertResponse.ok) {
          const errorText = await convertResponse.text();
          throw new Error(`Error al convertir PPTX: ${convertResponse.status} ${errorText}`);
        }

        const pdfBytes = new Uint8Array(await convertResponse.arrayBuffer());
        if (!active) return;

        const pdfArrayBuffer = pdfBytes.buffer;
        pdfObjectUrl = URL.createObjectURL(new Blob([pdfArrayBuffer], { type: "application/pdf" }));
        setPptxPdfUrl(pdfObjectUrl);
        setPptxSlideCount(0);
        setPptxSlidesViewed(new Set([0]));
      } catch (err) {
        if (active) {
          const message = normalizeError(err);
          setPptxLoadError(message);
          setPdfLoadError(message);
        }
      } finally {
        if (active) {
          setPptxLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      if (pdfObjectUrl) {
        URL.revokeObjectURL(pdfObjectUrl);
      }
    };
  }, [contentURL, isPptxResource]);

  useEffect(() => {
    if (!isPptxResource || pptxSlideCount <= 0) return;
    setPptxSlidesViewed((prev) => new Set(prev).add(pptxCurrentSlideIndex));
  }, [isPptxResource, pptxCurrentSlideIndex, pptxSlideCount]);

  useEffect(() => {
    const container = docxViewerRef.current;
    if (!container || !docxHtml) return;

    const checkScroll = () => {
      const totalHeight = container.scrollHeight;
      const visibleHeight = container.clientHeight;
      const isComplete = container.scrollTop + visibleHeight >= totalHeight - 16;
      const isScrollable = totalHeight > visibleHeight + 16;
      setDocxScrollComplete(isComplete && (docxHasInteracted || !isScrollable));
    };

    const onInteraction = () => {
      if (!docxHasInteracted) {
        setDocxHasInteracted(true);
      }
      checkScroll();
    };

    checkScroll();
    container.addEventListener("scroll", onInteraction, { passive: true });
    container.addEventListener("pointerdown", onInteraction);

    return () => {
      container.removeEventListener("scroll", onInteraction);
      container.removeEventListener("pointerdown", onInteraction);
    };
  }, [docxHtml, docxHasInteracted]);

  const handleSubmitImageQuestion = async () => {
    if (!imageQuestion || !imageQuestionSelectedOption || imageQuestionAnswered) return;
    const selected = imageQuestion.respuestas.find((option) => option.id === imageQuestionSelectedOption);
    const isCorrect = Boolean(selected?.es_correcta);
    setImageQuestionAnswered(true);
    setImageQuestionCorrect(isCorrect);

    if (isEditor) return;

    const sectionsToComplete = new Set<string>();
    if (currentSection && !progSecciones[currentSection.id]?.completado) {
      sectionsToComplete.add(currentSection.id);
    }
    if (imageQuestionSection && imageQuestionSection.id !== currentSection?.id && !progSecciones[imageQuestionSection.id]?.completado) {
      sectionsToComplete.add(imageQuestionSection.id);
    }

    for (const sectionId of sectionsToComplete) {
      try {
        await markSectionComplete(sectionId);
      } catch {
        // markSectionComplete already handles errors with toast
      }
    }
  };

  const handleNextClick = useCallback(async () => {
    if (!isEditor && currentSection && !progSecciones[currentSection.id]?.completado) {
      if (currentSection.tipo === "recurso" && isImageViewable && imageQuestionAvailable && imageQuestionAnswered && imageLoaded) {
        await markSectionComplete(currentSection.id);
      } else if (currentSection.tipo === "recurso" && documentReadyToComplete) {
        await markSectionComplete(currentSection.id);
      } else if (currentSection.tipo === "imagen" && imageLoaded) {
        await markSectionComplete(currentSection.id);
      } else if (currentSection.tipo === "actividad_interactiva" && !!currentActividadIntento?.completado) {
        await markSectionComplete(currentSection.id);
      }
    }

    if (currentSection?.tipo === "actividad_interactiva") {
      if (!progSecciones[currentSection.id]?.completado && !!currentActividadIntento?.completado) {
        await markSectionComplete(currentSection.id);
      }

      if (!isEditor && lesson && !lessonAlreadyCompleted && !!currentActividadIntento?.completado) {
        try {
          await upsertProgreso({
            leccion_id: lesson.id,
            completado: true,
            puntaje: nativeScore ?? undefined,
          });
          setLessonAlreadyCompleted(true);
        } catch {
          // no-op; sección ya quedó marcada y el usuario puede continuar.
        }
      }

      navigate(returnPath);
      return;
    }

    const nextIndex = getNextSectionIndex(currentIdx);
    if (nextIndex === currentIdx) {
      navigate(returnPath);
    } else {
      setCurrentIdx(nextIndex);
    }
  }, [currentIdx, currentSection, documentReadyToComplete, getNextSectionIndex, imageLoaded, imageQuestionAvailable, imageQuestionAnswered, isImageViewable, isEditor, markSectionComplete, navigate, progSecciones, returnPath, currentActividadIntento?.completado]);

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

  const sectionCompleted = !!currentSection && (
    !!progSecciones[currentSection.id]?.completado ||
    (isVideoSection && checkpointAttempted && videoProgressPercent >= 100) ||
    (currentSection.tipo === "actividad_interactiva" && !!currentActividadIntento?.completado)
  );

  const youtubeValidated = !youtubeVideoId || !!currentVideoProgress?.completado;
  const interactiveValidated = !isInteractiveSection || !!currentActividadIntento?.completado;

  const canMarkComplete =
    !!currentSection &&
    !isEditor &&
    !isQuizSection &&
    !sectionCompleted &&
    !blockedByRequisitos &&
    (!isVideoSection || youtubeValidated) &&
    interactiveValidated &&
    documentReadyToComplete &&
    (!imageQuestionRequired || imageQuestionAnswered);

  const resourceValidationIncomplete = currentSection?.tipo === "recurso" && !documentReadyToComplete;
  const imageValidationIncomplete = currentSection?.tipo === "imagen" && !imageLoaded;

  const nextBlocked =
    !!currentSection &&
    !isEditor &&
    ((currentSection.es_obligatorio !== false && !sectionCompleted) || blockedByRequisitos || !gatingSatisfied || resourceValidationIncomplete || imageValidationIncomplete || imageQuestionPending);

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
          {/* Current section */}
          {currentSection && (
            <div className="bg-white rounded-lg shadow p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {currentSection.tipo === "actividad_interactiva"
                    ? currentActividad?.titulo || "Actividad interactiva"
                    : `${currentSection.tipo} — Sección ${currentIdx + 1}`}
                </h2>
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


              {(currentSection.tipo === "texto" || currentSection.tipo === "recurso" || currentSection.tipo === "imagen") && (currentSection.contenido || currentRecurso?.descripcion || contentURL) && (
                <div className="mb-4 space-y-3">
                  {isImageViewable && (
                    <div className="mb-4 rounded-3xl border border-slate-200 bg-white shadow-sm p-4">
                      <img
                        src={contentURL || undefined}
                        alt="Contenido de imagen"
                        className="w-full rounded-2xl mb-4"
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageLoaded(false)}
                      />

                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className={imageLoaded ? "inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800" : "inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"}>
                          {imageLoaded ? "✅ Imagen cargada" : "Cargando imagen..."}
                        </span>
                        {currentSection.prueba_id && (
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium ${imageQuestionAnswered ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {imageQuestionAnswered ? "Pregunta respondida" : "Responde la pregunta para continuar"}
                          </span>
                        )}
                      </div>

                      {imageQuestionAvailable ? (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                          <div className="mb-3 text-sm font-semibold text-slate-900">Pregunta</div>

                          {imageQuestionLoading ? (
                            <div className="text-sm text-slate-600">Cargando pregunta...</div>
                          ) : imageQuestionLoadError ? (
                            <div className="text-sm text-rose-700">{imageQuestionLoadError}</div>
                          ) : imageQuestion ? (
                            <>
                              <p className="text-sm text-slate-700 mb-4">Toca el botón para responder la pregunta asociada a esta imagen.</p>
                              <button
                                type="button"
                                onClick={() => setShowImageQuestionModal(true)}
                                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                              >
                                {imageQuestionAnswered ? "Ver pregunta respondida" : "Responder pregunta"}
                              </button>
                              {imageQuestionAnswered && imageQuestionCorrect != null && (
                                <div className={`mt-3 rounded-2xl px-3 py-2 text-sm ${imageQuestionCorrect ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                                  {imageQuestionCorrect ? "Respuesta correcta. Ya puedes avanzar." : "Respuesta incorrecta. El botón siguiente ya está habilitado."}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-sm text-slate-600">No hay pregunta disponible para este contenido.</div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          Este recurso solo muestra la imagen. Avanza una vez que la hayas revisado.
                        </div>
                      )}

                      {showImageQuestionModal && imageQuestion && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="text-lg font-semibold text-slate-900">Pregunta de la imagen</h3>
                                <p className="mt-1 text-sm text-slate-600">Responde la pregunta para habilitar el botón siguiente.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowImageQuestionModal(false)}
                                className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
                              >
                                Cerrar
                              </button>
                            </div>

                            <div className="mt-6">
                              <p className="text-base text-slate-900 mb-4">{imageQuestion.texto}</p>
                              <div className="space-y-3 mb-4">
                                {imageQuestion.respuestas.map((option) => (
                                  <label
                                    key={option.id}
                                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-slate-900 transition ${imageQuestionSelectedOption === option.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"}`}
                                  >
                                    <input
                                      type="radio"
                                      name={`imagen-pregunta-modal-${currentSection.id}`}
                                      checked={imageQuestionSelectedOption === option.id}
                                      onChange={() => setImageQuestionSelectedOption(option.id)}
                                      className="h-4 w-4 text-indigo-600"
                                    />
                                    <span>{option.texto}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                  type="button"
                                  onClick={() => setShowImageQuestionModal(false)}
                                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                >
                                  Volver
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await handleSubmitImageQuestion();
                                    setShowImageQuestionModal(false);
                                  }}
                                  disabled={!imageQuestionSelectedOption || imageQuestionAnswered}
                                  className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {imageQuestionAnswered ? "Respuesta enviada" : "Enviar respuesta"}
                                </button>
                              </div>
                              {imageQuestionAnswered && imageQuestionCorrect != null && (
                                <div className={`mt-4 rounded-2xl px-3 py-2 text-sm ${imageQuestionCorrect ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                                  {imageQuestionCorrect ? "Respuesta correcta. Ya puedes avanzar." : "Respuesta incorrecta. El botón siguiente ya está habilitado."}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {currentSection.contenido && !currentSection.prueba_id && <p className="text-gray-700 whitespace-pre-wrap">{currentSection.contenido}</p>}
                  {!currentSection.contenido && currentRecurso?.descripcion && !currentSection.prueba_id && <p className="text-gray-700 whitespace-pre-wrap">{currentRecurso.descripcion}</p>}
                  {isPdfViewable && pdfViewerUrl && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {isPptxResource ? "Visor PDF de presentación" : "Visor PDF nativo"}
                          </p>
                          <p className="text-xs text-slate-600">Navega por todas las páginas para registrar la lectura completa.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPdfCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={pdfCurrentPage <= 1 || pdfLoading}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 disabled:opacity-50"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfCurrentPage((p) => Math.min(pdfPageCount, p + 1))}
                            disabled={pdfCurrentPage >= pdfPageCount || pdfLoading}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 disabled:opacity-50"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>

                      {pdfLoading ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-600">Cargando PDF...</div>
                      ) : pdfLoadError ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{pdfLoadError}</div>
                      ) : (
                        <>
                          <div className="overflow-auto rounded border border-slate-200 bg-white">
                            <canvas ref={pdfCanvasRef} className="w-full" />
                          </div>
                          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
                            <span>Página {pdfCurrentPage} de {pdfPageCount}</span>
                            <span>Vistas {pdfPagesSeen.size}/{pdfPageCount} páginas</span>
                            <span className={pdfReadComplete ? "text-emerald-700" : "text-slate-600"}>
                              {pdfReadComplete ? "Lectura completa" : "Continúa navegando por todas las páginas"}
                            </span>
                          </div>
                          {pdfReadComplete && (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
                              <span>✅ Documento leído</span>
                              <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs text-emerald-900">Siguiente habilitado</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {isPptxResource && !pdfViewerUrl && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      {pptxLoading ? (
                        <p className="text-sm text-slate-600">Convirtiendo la presentación PPTX a PDF...</p>
                      ) : pptxLoadError ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                          {pptxLoadError}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600">Preparando la vista previa de la presentación...</p>
                      )}
                    </div>
                  )}
                  {isPptxResource && contentURL && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Descarga original</p>
                          <p className="text-xs text-slate-600">La presentación PPTX original se conserva para descargarla como archivo de diapositivas.</p>
                        </div>
                        <a
                          href={contentURL}
                          download={extractFileNameFromUrl(contentURL, "presentacion.pptx")}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Descargar PPTX
                        </a>
                      </div>
                      {pptxSlideCount > 0 && (
                        <p className="text-xs text-slate-500">Diapositivas detectadas: {pptxSlideCount}</p>
                      )}
                    </div>
                  )}
                  {isDocxResource && contentURL && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Visor Word nativo</p>
                          <p className="text-xs text-slate-600">Desplázate hasta el final para registrar que leíste el documento.</p>
                        </div>
                        <span className={docxReadComplete ? "text-emerald-700 text-sm" : "text-slate-600 text-sm"}>
                          {docxReadComplete ? "Lectura completa" : "Desplázate hasta el final"}
                        </span>
                      </div>

                      {docxLoading ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-600">Cargando Word...</div>
                      ) : docxLoadError ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{docxLoadError}</div>
                      ) : (
                        <>
                          <div ref={docxViewerRef} className="prose max-w-none h-[540px] overflow-y-auto rounded border border-slate-200 bg-white p-4 text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: docxHtml || "" }} />
                          {docxReadComplete && (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
                              <span>✅ Documento leído</span>
                              <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs text-emerald-900">Siguiente habilitado</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {!isPdfResource && !isDocxResource && !isPptxResource && contentURL && (
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
                          <div className="rounded-md border border-emerald-200 bg-white p-3 text-sm text-emerald-900">
                            Tipo de actividad nativa: <span className="font-semibold">{getNativeActivityTypeLabel(nativeConfig.activityType)}</span>
                          </div>
                          {currentActividadIntento?.completado ? (
                            <div className="rounded-lg border border-emerald-200 bg-white p-4 text-slate-900">
                              <p className="text-sm font-semibold text-emerald-900">Actividad completada</p>
                              {nativeScore != null && (
                                <p className="mt-2 text-sm text-slate-700">Puntaje: {nativeScore}%</p>
                              )}
                              <p className="mt-3 text-sm text-slate-600">La actividad nativa ya fue completada y no puede volver a realizarse. Usa el botón siguiente para continuar con el siguiente contenido.</p>
                            </div>
                          ) : !nativeActivityHasContent ? (
                            <p className="text-sm text-amber-800">La actividad nativa no tiene configuración válida para mostrarse.</p>
                          ) : (
                            <>
                              {(isNativeDragAndDropMode || isNativeInteractiveMapMode || isNativeFillInTheBlankMode) ? (
                                <NativeActivityRenderer
                                  config={nativeConfig}
                                  answers={nativeAnswers}
                                  setAnswers={setNativeAnswers}
                                  submitting={nativeSubmitting}
                                  onSubmit={() => void onSubmitNativeActividad()}
                                  isEditor={isEditor}
                                />
                              ) : nativeConfig.activityType === "ordering" && currentNativeOrderingQuestion ? (
                                <div className="space-y-4">
                                  <div className="rounded-md border border-emerald-300 bg-white p-3">
                                    <p className="text-sm font-semibold text-emerald-900">Ordena los elementos en el orden correcto</p>
                                    <p className="mt-1 text-sm text-slate-600">Arrastra las flechas para cambiar el orden y luego envía la actividad.</p>
                                  </div>
                                  <div className="space-y-2">
                                    {nativeOrderingIds.map((optionId, index) => {
                                      const option = currentNativeOrderingQuestion.options.find((item) => item.id === optionId);
                                      if (!option) return null;
                                      const isDragOver = nativeOrderingDragOverId === optionId;
                                      return (
                                        <div
                                          key={optionId}
                                          draggable={!nativeSubmitting}
                                          onDragStart={(event) => {
                                            event.dataTransfer.setData("text/plain", optionId);
                                            event.dataTransfer.effectAllowed = "move";
                                          }}
                                          onDragOver={(event) => {
                                            event.preventDefault();
                                            setNativeOrderingDragOverId(optionId);
                                            event.dataTransfer.dropEffect = "move";
                                          }}
                                          onDragLeave={() => setNativeOrderingDragOverId(null)}
                                          onDrop={(event) => {
                                            event.preventDefault();
                                            const draggedId = event.dataTransfer.getData("text/plain");
                                            setNativeOrderingDragOverId(null);
                                            if (!draggedId || draggedId === optionId) return;
                                            setNativeOrderingState((prev) => {
                                              const current = prev[currentNativeOrderingQuestion.id] ?? nativeOrderingIds;
                                              const next = [...current];
                                              const fromIndex = next.indexOf(draggedId);
                                              const toIndex = next.indexOf(optionId);
                                              if (fromIndex === -1 || toIndex === -1) return prev;
                                              next.splice(fromIndex, 1);
                                              next.splice(toIndex, 0, draggedId);
                                              return { ...prev, [currentNativeOrderingQuestion.id]: next };
                                            });
                                          }}
                                          onDragEnd={() => setNativeOrderingDragOverId(null)}
                                          className={`flex items-center justify-between gap-3 rounded-md border p-3 ${isDragOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}
                                        >
                                          <span className="text-sm text-slate-800">{index + 1}. {option.text}</span>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              disabled={index === 0 || nativeSubmitting}
                                              onClick={() => {
                                                setNativeOrderingState((prev) => {
                                                  const current = prev[currentNativeOrderingQuestion.id] ?? nativeOrderingIds;
                                                  const next = [...current];
                                                  const above = next[index - 1];
                                                  const currentItem = next[index];
                                                  if (!above || !currentItem) return prev;
                                                  next[index - 1] = currentItem;
                                                  next[index] = above;
                                                  return { ...prev, [currentNativeOrderingQuestion.id]: next };
                                                });
                                              }}
                                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            >⬆</button>
                                            <button
                                              type="button"
                                              disabled={index === nativeOrderingIds.length - 1 || nativeSubmitting}
                                              onClick={() => {
                                                setNativeOrderingState((prev) => {
                                                  const current = prev[currentNativeOrderingQuestion.id] ?? nativeOrderingIds;
                                                  const next = [...current];
                                                  const currentItem = next[index];
                                                  const below = next[index + 1];
                                                  if (!currentItem || !below) return prev;
                                                  next[index] = below;
                                                  next[index + 1] = currentItem;
                                                  return { ...prev, [currentNativeOrderingQuestion.id]: next };
                                                });
                                              }}
                                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            >⬇</button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

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
                                </div>
) : nativeConfig.activityType === "true_false" ? (
                                <div className="space-y-4">
                                  {nativeConfig.questions.map((question, index) => (
                                    <div key={question.id} className="rounded-md border border-emerald-200 bg-white p-3">
                                      <p className="text-sm font-medium text-emerald-900 mb-3">{index + 1}. {question.prompt}</p>
                                      <div className="flex flex-col gap-2">
                                        {question.options.length > 0 ? question.options.map((option) => (
                                          <label key={option.id} className="inline-flex items-center gap-2 text-sm text-emerald-900">
                                            <input
                                              type="radio"
                                              name={`native-${question.id}`}
                                              checked={nativeAnswers[question.id] === option.id}
                                              onChange={() => setNativeAnswers((prev) => ({ ...prev, [question.id]: option.id }))}
                                            />
                                            {option.text}
                                          </label>
                                        )) : (
                                          <>
                                            {[["true", "Verdadero"], ["false", "Falso"]].map(([value, label]) => (
                                              <label key={value} className="inline-flex items-center gap-2 text-sm text-emerald-900">
                                                <input
                                                  type="radio"
                                                  name={`native-${question.id}`}
                                                  checked={nativeAnswers[question.id] === value}
                                                  onChange={() => setNativeAnswers((prev) => ({ ...prev, [question.id]: String(value) }))}
                                                />
                                                {label}
                                              </label>
                                            ))}
                                          </>
                                        )}
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
                                </div>
                              ) : nativeConfig.activityType === "matching" ? (
                                <NativeActivityMatchingPlayer
                                  config={nativeConfig}
                                  answers={nativeAnswers}
                                  setAnswers={setNativeAnswers}
                                  submitting={nativeSubmitting}
                                  onSubmit={() => void onSubmitNativeActividad()}
                                  isEditor={isEditor}
                                />
                              ) : nativeConfig.activityType === "hotspot" ? (
                                <div className="space-y-4">
                                  <div className="rounded-md border border-emerald-300 bg-white p-3">
                                    <p className="text-sm font-semibold text-emerald-900">Hotspot</p>
                                    <p className="mt-1 text-sm text-slate-600">Selecciona el punto correcto en la imagen.</p>
                                  </div>
                                  {nativeHotspotImageUrl ? (
                                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                      <img src={nativeHotspotImageUrl} alt="Hotspot" className="w-full object-contain" />
                                    </div>
                                  ) : (
                                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                      No se ha configurado imagen para esta actividad Hotspot.
                                    </div>
                                  )}

                                  {currentNativeHotspotOptions.length > 0 ? (
                                    <div className="space-y-2">
                                      {currentNativeHotspotOptions.map((hotspot) => (
                                        <label key={hotspot.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
                                          <input
                                            type="radio"
                                            name="native-hotspot"
                                            checked={nativeAnswers.hotspot === hotspot.id}
                                            onChange={() => setNativeAnswers((prev) => ({ ...prev, hotspot: hotspot.id }))}
                                          />
                                          <span>{hotspot.text || `Punto ${hotspot.id}`}</span>
                                        </label>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                      No hay puntos hotspot configurados para esta actividad.
                                    </div>
                                  )}

                                  {!isEditor && (
                                    <button
                                      type="button"
                                      onClick={() => void onSubmitNativeActividad()}
                                      disabled={nativeSubmitting || currentNativeHotspotOptions.length === 0}
                                      className="rounded-md bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:opacity-50"
                                    >
                                      {nativeSubmitting ? "Enviando..." : "Enviar actividad nativa"}
                                    </button>
                                  )}
                                </div>
                              ) : isNativeQuickQuizMode ? (
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
                      ) : ["h5p", "genially", "educaplay"].includes(currentActividad.proveedor) ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-full bg-red-100 p-2">
                              <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0-10a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="font-semibold text-red-900">Actividad Deprecated</h4>
                              <p className="mt-1 text-sm text-red-800">
                                Esta actividad usa el proveedor "{currentActividad.proveedor}" que ha sido deprecado.
                              </p>
                              <p className="mt-2 text-sm text-red-700">
                                Los proveedores H5P, Genially y Educaplay ya no son soportados. Por favor, contacta al docente para que reemplace esta actividad con una versión nativa.
                              </p>
                              {!isEditor && !currentActividadIntento?.completado && (
                                <button
                                  onClick={() => void onRegistrarActividadCompletada()}
                                  disabled={savingActividadIntento}
                                  className="mt-3 px-3 py-2 rounded-md bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 text-sm"
                                >
                                  {savingActividadIntento ? "Guardando..." : "Marcar como completada (sin evaluar)"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-full bg-yellow-100 p-2">
                              <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0-10a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="font-semibold text-yellow-900">Proveedor No Soportado</h4>
                              <p className="mt-1 text-sm text-yellow-800">
                                El proveedor "{currentActividad.proveedor}" no es válido o no está configurado correctamente.
                              </p>
                              <p className="mt-2 text-sm text-yellow-700">
                                Solo se soportan actividades nativas. Por favor, contacta al administrador.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <p>
                          Estado: {currentActividadIntento?.completado ? "Completada" : "Pendiente"}
                        </p>
                        <p>Intentos registrados: {currentActividadIntento?.intentos ?? 0}</p>
                        {nativeScore != null && (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900">
                            Puntaje: {nativeScore}%
                          </div>
                        )}
                        {nativeFeedback && <p className="mt-2 text-sm text-emerald-800">{nativeFeedback}</p>}
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
              onClick={() => void handleNextClick()}
              disabled={nextBlocked}
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
