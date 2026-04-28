import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Loader2, Sparkles, CheckCircle2, Save, BookOpenText, ArrowLeft } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extractRawText } from "mammoth";

import { getMe } from "@/shared/lib/auth";
import type {
  ConfirmarLibroRequest,
  EstadoExtraccionLibro,
  EstadoExtraccionJob,
  ExtractLibroRequest,
  LibroExtractJobStatusResponse,
  PdfPaginaMetadata,
  LibroPreguntaInput,
  Trabajo,
  TrabajoPregunta,
} from "@/shared/types/trabajos";
import {
  confirmarLibro,
  extractLibroAsync,
  getLibroExtractJobStatus,
  getLibroEstado,
  getTrabajo,
  revisarLibro,
} from "@/features/trabajos/services/trabajos";

const WIZARD_DRAFT_KEY = "trabajos_libro_wizard_draft";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_POLL_ATTEMPTS = 300;
const POLL_INTERVAL_MS = 1200;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") return msg;
  }
  return "Error inesperado";
}

function parseOptions(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionsToText(opciones: string[] | undefined): string {
  if (!opciones || opciones.length === 0) return "";
  return opciones.join(", ");
}

function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeFileHashSha256(file: File): Promise<string> {
  const raw = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return bytesToHex(digest);
}

function looksLikeCompositeQuestion(texto: string): boolean {
  const t = (texto || "").trim();
  if (!t) return false;
  const markerMatches = t.match(/(?:^|\n|\s)(?:\d{1,2}[.)]|[A-Da-d][.)]|pregunta\s+\d+[:.-])/gi) || [];
  return markerMatches.length >= 2;
}

async function parsePdfToMarkedPayload(
  file: File,
  pageStart?: number,
  pageEnd?: number
): Promise<{
  markedText: string;
  imagenesPorPagina: Record<string, string>;
  imagenesMetadataPorPagina: Record<string, PdfPaginaMetadata>;
}> {
  const start = pageStart && pageStart > 0 ? pageStart : 1;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const end = pageEnd && pageEnd >= start ? Math.min(pageEnd, doc.numPages) : doc.numPages;

  const parts: string[] = [];
  const imagenesPorPagina: Record<string, string> = {};
  const imagenesMetadataPorPagina: Record<string, PdfPaginaMetadata> = {};
  for (let pageNum = start; pageNum <= end; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    parts.push(`[PAGINA ${pageNum}]\n${text}`);

    const viewport = page.getViewport({ scale: 1 });
    if (viewport.width > 0 && viewport.height > 0) {
      const canvas = document.createElement("canvas");
      const targetWidth = 960;
      const scale = Math.min(2, Math.max(0.8, targetWidth / Math.max(1, viewport.width)));
      const renderViewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(renderViewport.width));
      canvas.height = Math.max(1, Math.floor(renderViewport.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        await page.render({ canvas, canvasContext: ctx, viewport: renderViewport }).promise;
        imagenesPorPagina[String(pageNum)] = canvas.toDataURL("image/jpeg", 0.65);

        const textRegions = content.items
          .map((item) => {
            if (!("str" in item)) return null;
            const texto = String(item.str || "").trim();
            if (!texto) return null;

            const unknownItem = item as unknown as {
              transform?: number[];
              width?: number;
              height?: number;
            };
            const transform = unknownItem.transform;
            if (!Array.isArray(transform) || transform.length < 6) return null;

            const t = pdfjsLib.Util.transform(renderViewport.transform, transform);
            const x = Number.isFinite(t[4]) ? t[4] : 0;
            const estimatedWidth = Math.max(
              1,
              Math.abs((unknownItem.width || 0) * scale),
            );
            const estimatedHeight = Math.max(
              8,
              Math.abs(t[3]) || Math.abs((unknownItem.height || 0) * scale),
            );
            const y = Number.isFinite(t[5]) ? t[5] - estimatedHeight : 0;

            return {
              texto,
              x: Math.max(0, Math.min(canvas.width - 1, x)),
              y: Math.max(0, Math.min(canvas.height - 1, y)),
              width: Math.max(1, Math.min(canvas.width, estimatedWidth)),
              height: Math.max(1, Math.min(canvas.height, estimatedHeight)),
            };
          })
          .filter((region): region is NonNullable<typeof region> => !!region);

        if (textRegions.length > 0) {
          imagenesMetadataPorPagina[String(pageNum)] = {
            image_width: canvas.width,
            image_height: canvas.height,
            text_regions: textRegions,
          };
        }
      }
    }
  }

  return {
    markedText: parts.join("\n\n"),
    imagenesPorPagina,
    imagenesMetadataPorPagina,
  };
}

async function parseDocxToMarkedText(file: File, pageStart?: number): Promise<string> {
  const start = pageStart && pageStart > 0 ? pageStart : 1;
  const { value } = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = value.replace(/\r/g, "\n").trim();
  if (!text) return "";

  const chunkSize = 3500;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    const pageNum = start + Math.floor(i / chunkSize);
    const chunk = text.slice(i, i + chunkSize).trim();
    if (!chunk) continue;
    chunks.push(`[PAGINA ${pageNum}]\n${chunk}`);
  }

  return chunks.join("\n\n");
}

async function parseTxtToMarkedText(file: File, pageStart?: number): Promise<string> {
  const start = pageStart && pageStart > 0 ? pageStart : 1;
  const text = (await file.text()).trim();
  if (!text) return "";

  const pages = text.split(/\f+/g).map((s) => s.trim()).filter(Boolean);
  if (pages.length > 1) {
    return pages.map((pageText, idx) => `[PAGINA ${start + idx}]\n${pageText}`).join("\n\n");
  }

  const chunkSize = 3500;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    const pageNum = start + Math.floor(i / chunkSize);
    const chunk = text.slice(i, i + chunkSize).trim();
    if (!chunk) continue;
    chunks.push(`[PAGINA ${pageNum}]\n${chunk}`);
  }

  return chunks.join("\n\n");
}

function statusBadgeClass(estado: EstadoExtraccionLibro | undefined): string {
  switch (estado) {
    case "aprobado":
      return "bg-emerald-100 text-emerald-700";
    case "en_revision":
    case "completado":
      return "bg-amber-100 text-amber-700";
    case "extrayendo":
      return "bg-sky-100 text-sky-700";
    case "cancelado":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function TeacherTrabajoLibroWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();
  const storageKey = useMemo(() => `${WIZARD_DRAFT_KEY}:${trabajoId}`, [trabajoId]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [extraccionEstado, setExtraccionEstado] = useState<EstadoExtraccionLibro | undefined>(undefined);
  const [preguntas, setPreguntas] = useState<LibroPreguntaInput[]>([]);

  const [extractReq, setExtractReq] = useState<ExtractLibroRequest>({
    contenido: "",
    idioma: "es",
    pagina_inicio: 1,
    max_preguntas: 10,
  });

  const [notasRevision, setNotasRevision] = useState("");
  const [aprobarRevision, setAprobarRevision] = useState(false);

  const [confirmReq, setConfirmReq] = useState<ConfirmarLibroRequest>({
    publicar: false,
    notas_finales: "",
  });
  const [selectedFileName, setSelectedFileName] = useState("");
  const [imagenesPorPagina, setImagenesPorPagina] = useState<Record<string, string>>({});
  const [imagenesMetadataPorPagina, setImagenesMetadataPorPagina] = useState<Record<string, PdfPaginaMetadata>>({});
  const [jobStatus, setJobStatus] = useState<{
    estado: EstadoExtraccionJob;
    progress: number;
    message: string;
    duration_ms?: number;
    error_type?: string;
    error_message?: string;
  } | null>(null);

  const questionTypes = useMemo(() => ([
    { value: "opcion_multiple", label: t("teacher.trabajos.libro.questionTypes.opcion_multiple", { defaultValue: "Opcion multiple" }) },
    { value: "verdadero_falso", label: t("teacher.trabajos.libro.questionTypes.verdadero_falso", { defaultValue: "Verdadero/Falso" }) },
    { value: "respuesta_corta", label: t("teacher.trabajos.libro.questionTypes.respuesta_corta", { defaultValue: "Respuesta corta" }) },
    { value: "completar", label: t("teacher.trabajos.libro.questionTypes.completar", { defaultValue: "Completar" }) },
  ] as const), [t]);

  const activeStep = useMemo(() => {
    if (extraccionEstado === "aprobado") return 3;
    if (extraccionEstado === "en_revision" || extraccionEstado === "completado") return 2;
    return 1;
  }, [extraccionEstado]);

  const preguntasAgrupadas = useMemo(() => {
    const sorted = [...preguntas].sort((a, b) => {
      const pageA = a.pagina_libro ?? 0;
      const pageB = b.pagina_libro ?? 0;
      if (pageA !== pageB) return pageA - pageB;
      return a.orden - b.orden;
    });

    const groups = new Map<number, LibroPreguntaInput[]>();
    for (const item of sorted) {
      const key = item.pagina_libro ?? 0;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(item);
    }
    return Array.from(groups.entries());
  }, [preguntas]);

  const onUploadFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("teacher.trabajos.libro.error.maxSize", { defaultValue: "Archivo demasiado grande (max 50MB)" }));
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "txt"].includes(extension)) {
      toast.error(t("teacher.trabajos.libro.error.unsupportedType", { defaultValue: "Formato no soportado. Usa PDF, DOCX o TXT." }));
      return;
    }

    setBusy(true);
    try {
      let markedText = "";
      if (extension === "pdf") {
        const parsed = await parsePdfToMarkedPayload(file, extractReq.pagina_inicio, extractReq.pagina_fin);
        markedText = parsed.markedText;
        setImagenesPorPagina(parsed.imagenesPorPagina);
        setImagenesMetadataPorPagina(parsed.imagenesMetadataPorPagina);
      } else if (extension === "docx") {
        markedText = await parseDocxToMarkedText(file, extractReq.pagina_inicio);
        setImagenesPorPagina({});
        setImagenesMetadataPorPagina({});
      } else {
        markedText = await parseTxtToMarkedText(file, extractReq.pagina_inicio);
        setImagenesPorPagina({});
        setImagenesMetadataPorPagina({});
      }

      if (!markedText || markedText.trim().length < 30) {
        toast.error(t("teacher.trabajos.libro.error.minContent", { defaultValue: "Ingresa contenido del libro (minimo 30 caracteres)" }));
        return;
      }

      let hashArchivo: string | undefined;
      try {
        hashArchivo = await computeFileHashSha256(file);
      } catch {
        hashArchivo = undefined;
      }

      setSelectedFileName(file.name);
      setExtractReq((prev) => ({
        ...prev,
        contenido: markedText,
        archivo_url: file.name,
        hash_archivo: hashArchivo,
      }));
      toast.success(t("teacher.trabajos.libro.fileReady", { defaultValue: "Archivo procesado y listo para extracción" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const hydrate = useCallback(async () => {
    const [trabajoData, estado] = await Promise.all([getTrabajo(trabajoId), getLibroEstado(trabajoId)]);
    setTrabajo(trabajoData);
    setExtraccionEstado(estado.extraccion?.estado);
    setNotasRevision(estado.extraccion?.notas_revision || "");

    setPreguntas(
      (estado.preguntas || []).map((p: TrabajoPregunta, index) => ({
        id: p.id,
        texto: p.texto,
        tipo: p.tipo,
        opciones: p.opciones || [],
        pagina_libro: p.pagina_libro ?? undefined,
        confianza_ia: p.confianza_ia ?? undefined,
          imagen_base64: p.imagen_base64 ?? undefined,
          imagen_fuente: p.imagen_fuente ?? undefined,
          respuesta_esperada_tipo: p.respuesta_esperada_tipo ?? undefined,
          placeholder: p.placeholder ?? undefined,
        orden: p.orden || index + 1,
      }))
    );

    // Restore local draft after API hydration to avoid data loss in case of reload.
    const rawDraft = localStorage.getItem(storageKey);
    if (rawDraft) {
      try {
        const parsed = JSON.parse(rawDraft) as {
          extractReq?: ExtractLibroRequest;
          notasRevision?: string;
          aprobarRevision?: boolean;
          confirmReq?: ConfirmarLibroRequest;
          preguntas?: LibroPreguntaInput[];
        };
        if (parsed.extractReq) setExtractReq(parsed.extractReq);
        if (typeof parsed.notasRevision === "string") setNotasRevision(parsed.notasRevision);
        if (typeof parsed.aprobarRevision === "boolean") setAprobarRevision(parsed.aprobarRevision);
        if (parsed.confirmReq) setConfirmReq(parsed.confirmReq);
        if (parsed.preguntas && parsed.preguntas.length > 0) setPreguntas(parsed.preguntas);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey, trabajoId]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        if (!trabajoId) {
          toast.error(t("teacher.trabajos.noTrabajo", { defaultValue: "Trabajo no encontrado" }));
          navigate("/teacher/trabajos");
          return;
        }

        await hydrate();
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrate, navigate, t, trabajoId]);

  useEffect(() => {
    if (!trabajoId || loading) return;
    localStorage.setItem(storageKey, JSON.stringify({
      extractReq,
      notasRevision,
      aprobarRevision,
      confirmReq,
      preguntas,
    }));
  }, [aprobarRevision, confirmReq, extractReq, loading, notasRevision, preguntas, storageKey, trabajoId]);

  const onExtract = async () => {
    if ((extractReq.pagina_fin ?? 0) > 0 && (extractReq.pagina_inicio ?? 1) > (extractReq.pagina_fin ?? 0)) {
      toast.error(t("teacher.trabajos.libro.error.pageRange", { defaultValue: "Rango de paginas invalido" }));
      return;
    }

    if (!extractReq.contenido || extractReq.contenido.trim().length < 30) {
      toast.error(t("teacher.trabajos.libro.error.minContent", { defaultValue: "Ingresa contenido del libro (minimo 30 caracteres)" }));
      return;
    }

    setBusy(true);
    setJobStatus(null);
    try {
      const start = await extractLibroAsync(trabajoId, {
        ...extractReq,
        contenido: extractReq.contenido.trim(),
        imagenes_por_pagina: Object.keys(imagenesPorPagina).length > 0 ? imagenesPorPagina : undefined,
        imagenes_metadata_por_pagina: Object.keys(imagenesMetadataPorPagina).length > 0 ? imagenesMetadataPorPagina : undefined,
      });

      setJobStatus({ estado: start.estado, progress: start.progress, message: start.message });

      let finished = false;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const status = await getLibroExtractJobStatus(trabajoId, start.job_id);
        setJobStatus(buildJobStatusCard(status));

        if (status.estado === "error") {
          const fallbackMsg = status.error_message || status.error || status.message || "Error en job de extraccion";
          const fullMsg = status.error_type ? `${fallbackMsg} (${status.error_type})` : fallbackMsg;
          throw new Error(fullMsg);
        }

        if (status.estado === "completado") {
          finished = true;
          const result = status.result;
          if (!result) {
            throw new Error("El job finalizo sin resultado");
          }
          setExtraccionEstado(result.extraccion.estado);
          setPreguntas(
            (result.preguntas || []).map((p, index) => ({
              id: p.id,
              texto: p.texto,
              tipo: p.tipo,
              opciones: p.opciones || [],
              pagina_libro: p.pagina_libro ?? undefined,
              confianza_ia: p.confianza_ia ?? undefined,
              imagen_base64: p.imagen_base64 ?? undefined,
              imagen_fuente: p.imagen_fuente ?? undefined,
              respuesta_esperada_tipo: p.respuesta_esperada_tipo ?? undefined,
              placeholder: p.placeholder ?? undefined,
              orden: p.orden || index + 1,
            }))
          );
          break;
        }
      }

      if (!finished) {
        throw new Error("La extraccion sigue en proceso. Intenta nuevamente en unos segundos.");
      }

      toast.success(t("teacher.trabajos.libro.extractDone", { defaultValue: "Extraccion completada" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const onGuardarRevision = async () => {
    const sanitized = preguntas
      .map((p, index) => ({
        ...p,
        texto: p.texto.trim(),
        orden: p.orden > 0 ? p.orden : index + 1,
      }))
      .filter((p) => p.texto.length > 0);

    if (sanitized.length === 0) {
      toast.error(t("teacher.trabajos.libro.error.minQuestion", { defaultValue: "Debes conservar al menos una pregunta" }));
      return;
    }

    setBusy(true);
    try {
      const res = await revisarLibro(trabajoId, {
        preguntas: sanitized,
        notas_revision: notasRevision || undefined,
        aprobar: aprobarRevision,
      });
      setExtraccionEstado(res.extraccion?.estado);
      setPreguntas(
        (res.preguntas || []).map((p, index) => ({
          id: p.id,
          texto: p.texto,
          tipo: p.tipo,
          opciones: p.opciones || [],
          pagina_libro: p.pagina_libro ?? undefined,
          confianza_ia: p.confianza_ia ?? undefined,
          imagen_base64: p.imagen_base64 ?? undefined,
          imagen_fuente: p.imagen_fuente ?? undefined,
          respuesta_esperada_tipo: p.respuesta_esperada_tipo ?? undefined,
          placeholder: p.placeholder ?? undefined,
          orden: p.orden || index + 1,
        }))
      );
      toast.success(aprobarRevision
        ? t("teacher.trabajos.libro.reviewApproved", { defaultValue: "Revision aprobada" })
        : t("teacher.trabajos.libro.reviewSaved", { defaultValue: "Revision guardada" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmar = async () => {
    const shouldContinue = window.confirm(t("teacher.trabajos.libro.confirmPrompt", {
      defaultValue: confirmReq.publicar
        ? "¿Confirmar extracción y publicar trabajo?"
        : "¿Confirmar extracción?"
    }));
    if (!shouldContinue) return;

    setBusy(true);
    try {
      const res = await confirmarLibro(trabajoId, confirmReq);
      setTrabajo(res.trabajo);
      setExtraccionEstado(res.extraccion.estado);
      localStorage.removeItem(storageKey);
      toast.success(confirmReq.publicar
        ? t("teacher.trabajos.libro.confirmPublished", { defaultValue: "Confirmado y publicado" })
        : t("teacher.trabajos.libro.confirmed", { defaultValue: "Confirmado correctamente" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const updatePregunta = (index: number, patch: Partial<LibroPreguntaInput>) => {
    setPreguntas((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const clearPreguntaImage = (index: number) => {
    updatePregunta(index, {
      imagen_base64: undefined,
      imagen_fuente: undefined,
      imagen_manual_override: true,
    });
  };

  const attachPreguntaImageFromPage = (index: number) => {
    const pregunta = preguntas[index];
    if (!pregunta) return;
    const page = pregunta.pagina_libro;
    if (!page) return;
    const image = imagenesPorPagina[String(page)];
    if (!image) return;
    updatePregunta(index, {
      imagen_base64: image,
      imagen_fuente: "pdf_pagina",
      imagen_manual_override: true,
    });
  };

  const addPregunta = () => {
    setPreguntas((prev) => [
      ...prev,
      {
        texto: "",
        tipo: "respuesta_corta",
        opciones: [],
        orden: prev.length + 1,
      },
    ]);
  };

  const removePregunta = (index: number) => {
    setPreguntas((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, orden: i + 1 })));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button
            onClick={() => navigate("/teacher/trabajos")}
            className="text-sm text-blue-700 inline-flex items-center gap-1 hover:underline"
          >
            <ArrowLeft size={14} />
            {t("common.back", { defaultValue: "Volver" })}
          </button>
          <h1 className="text-2xl font-bold mt-1">{t("teacher.trabajos.libro.title", { defaultValue: "Wizard de Extraccion desde Libro" })}</h1>
          <p className="text-sm text-gray-600">{trabajo?.titulo || t("teacher.trabajos.title", { defaultValue: "Trabajos" })}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(extraccionEstado)}`}>
          {t("teacher.trabajos.libro.status", { defaultValue: "Estado" })}: {extraccionEstado || t("teacher.trabajos.libro.statusNone", { defaultValue: "sin extraccion" })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className={`rounded-lg border p-3 ${activeStep === 1 ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
          <div className="font-semibold">{t("teacher.trabajos.libro.step1", { defaultValue: "1. Extraccion" })}</div>
          <div className="text-gray-600">{t("teacher.trabajos.libro.step1Desc", { defaultValue: "Fuente y parametros" })}</div>
        </div>
        <div className={`rounded-lg border p-3 ${activeStep === 2 ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
          <div className="font-semibold">{t("teacher.trabajos.libro.step2", { defaultValue: "2. Revision" })}</div>
          <div className="text-gray-600">{t("teacher.trabajos.libro.step2Desc", { defaultValue: "Editar y aprobar preguntas" })}</div>
        </div>
        <div className={`rounded-lg border p-3 ${activeStep === 3 ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
          <div className="font-semibold">{t("teacher.trabajos.libro.step3", { defaultValue: "3. Confirmacion" })}</div>
          <div className="text-gray-600">{t("teacher.trabajos.libro.step3Desc", { defaultValue: "Confirmar y publicar" })}</div>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <BookOpenText size={16} />
          {t("teacher.trabajos.libro.extractTitle", { defaultValue: "Paso 1: Extraer preguntas" })}
        </h2>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm">
            {t("teacher.trabajos.libro.uploadFile", { defaultValue: "Subir archivo (PDF, DOCX, TXT)" })}
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void onUploadFile(file);
                }
              }}
            />
            {selectedFileName && (
              <p className="mt-1 text-xs text-emerald-700">
                {t("teacher.trabajos.libro.fileSelected", { defaultValue: "Archivo seleccionado" })}: {selectedFileName}
              </p>
            )}
          </label>
          <label className="text-sm">
            {t("teacher.trabajos.libro.fileUrl", { defaultValue: "URL del archivo (opcional)" })}
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={extractReq.archivo_url || ""}
              onChange={(e) => setExtractReq((prev) => ({ ...prev, archivo_url: e.target.value || undefined }))}
            />
          </label>
          <label className="text-sm">
            {t("teacher.trabajos.libro.language", { defaultValue: "Idioma" })}
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={extractReq.idioma || "es"}
              onChange={(e) => setExtractReq((prev) => ({ ...prev, idioma: e.target.value || "es" }))}
            />
          </label>
          <label className="text-sm">
            {t("teacher.trabajos.libro.pageStart", { defaultValue: "Pagina inicio" })}
            <input
              type="number"
              min={1}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={extractReq.pagina_inicio || 1}
              onChange={(e) => setExtractReq((prev) => ({ ...prev, pagina_inicio: Number(e.target.value || 1) }))}
            />
          </label>
          <label className="text-sm">
            {t("teacher.trabajos.libro.maxQuestions", { defaultValue: "Maximo de preguntas" })}
            <input
              type="number"
              min={1}
              max={30}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={extractReq.max_preguntas || 10}
              onChange={(e) => setExtractReq((prev) => ({ ...prev, max_preguntas: Number(e.target.value || 10) }))}
            />
          </label>
          <label className="text-sm">
            {t("teacher.trabajos.libro.pageEnd", { defaultValue: "Pagina fin (opcional)" })}
            <input
              type="number"
              min={1}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={extractReq.pagina_fin || ""}
              onChange={(e) => setExtractReq((prev) => ({
                ...prev,
                pagina_fin: e.target.value ? Number(e.target.value) : undefined,
              }))}
            />
          </label>
        </div>

        <label className="text-sm block">
          {t("teacher.trabajos.libro.content", { defaultValue: "Contenido del libro" })}
          <textarea
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[180px]"
            value={extractReq.contenido}
            onChange={(e) => setExtractReq((prev) => ({ ...prev, contenido: e.target.value }))}
            placeholder={t("teacher.trabajos.libro.contentPlaceholder", { defaultValue: "Pega aqui el texto del libro a analizar por IA" })}
          />
        </label>

        <button
          onClick={onExtract}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          {t("teacher.trabajos.libro.extractAction", { defaultValue: "Ejecutar extraccion IA" })}
        </button>

        {jobStatus && (
          <div className="mt-2 border border-blue-200 bg-blue-50 rounded-lg p-3">
            <div className="flex items-center justify-between text-xs text-blue-800 mb-1">
              <span>{jobStatus.message || "Procesando"}</span>
              <span>{jobStatus.progress}%</span>
            </div>
            <div className="w-full h-2 bg-white rounded overflow-hidden border border-blue-200">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, jobStatus.progress))}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-blue-900 flex items-center justify-between gap-3 flex-wrap">
              <span>
                {t("teacher.trabajos.libro.totalDuration", { defaultValue: "Duracion total" })}: {Math.max(0, Math.round((jobStatus.duration_ms ?? 0) / 1000))}s
              </span>
              {jobStatus.error_type && (
                <span className="text-rose-700">
                  {t("teacher.trabajos.libro.errorType", { defaultValue: "Tipo" })}: {jobStatus.error_type}
                </span>
              )}
            </div>
            {jobStatus.error_message && (
              <p className="mt-1 text-xs text-rose-700">
                {jobStatus.error_message}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t("teacher.trabajos.libro.reviewTitle", { defaultValue: "Paso 2: Revisar preguntas" })} ({preguntas.length})</h2>
          <button
            onClick={addPregunta}
            className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm"
          >
            {t("teacher.trabajos.libro.addQuestion", { defaultValue: "Agregar pregunta" })}
          </button>
        </div>

        {preguntas.length === 0 ? (
          <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4">
            {t("teacher.trabajos.libro.noQuestions", { defaultValue: "Aun no hay preguntas. Ejecuta la extraccion primero." })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="font-medium mb-2">{t("teacher.trabajos.libro.groupedByPage", { defaultValue: "Preguntas agrupadas por pagina" })}</p>
              <div className="flex flex-wrap gap-2">
                {preguntasAgrupadas.map(([page, items]) => (
                  <span key={page} className="inline-flex items-center px-2 py-1 rounded bg-white border border-gray-300 text-xs">
                    {page > 0
                      ? t("teacher.trabajos.libro.pageGroup", { defaultValue: "Pagina {{page}} - Ejercicios ({{count}})", page, count: items.length })
                      : t("teacher.trabajos.libro.pageUnknown", { defaultValue: "Sin pagina ({{count}})", count: items.length })}
                  </span>
                ))}
              </div>
            </div>
            {preguntas.map((pregunta, index) => (
              <div key={`${pregunta.id || "new"}-${index}`} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-gray-500">{t("teacher.trabajos.libro.question", { defaultValue: "Pregunta" })} #{index + 1}</div>
                  <button onClick={() => removePregunta(index)} className="text-xs text-rose-600 hover:underline">
                    {t("common.delete", { defaultValue: "Eliminar" })}
                  </button>
                </div>

                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
                  rows={2}
                  value={pregunta.texto}
                  onChange={(e) => updatePregunta(index, { texto: e.target.value })}
                />
                {pregunta.imagen_base64 && (
                  <div className="mb-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <img
                      src={pregunta.imagen_base64}
                      alt={t("teacher.trabajos.libro.questionImage", { defaultValue: "Imagen asociada a la pregunta" })}
                      className="w-full max-h-56 object-contain rounded border border-gray-200 bg-white"
                      loading="lazy"
                    />
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => clearPreguntaImage(index)}
                        className="px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                      >
                        {t("teacher.trabajos.libro.removeImage", { defaultValue: "Quitar imagen" })}
                      </button>
                      <span className="text-xs text-gray-500">
                        {t("teacher.trabajos.libro.imageSource", { defaultValue: "Fuente" })}: {pregunta.imagen_fuente || "-"}
                      </span>
                    </div>
                  </div>
                )}
                {!pregunta.imagen_base64 && pregunta.pagina_libro && imagenesPorPagina[String(pregunta.pagina_libro)] && (
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => attachPreguntaImageFromPage(index)}
                      className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      {t("teacher.trabajos.libro.attachPageImage", { defaultValue: "Adjuntar imagen de la pagina" })}
                    </button>
                  </div>
                )}
                {looksLikeCompositeQuestion(pregunta.texto) && (
                  <p className="text-xs text-amber-700 mb-2">
                    {t("teacher.trabajos.libro.compositeWarning", { defaultValue: "Parece contener varias preguntas. Sepáralas para guardarlas como items individuales." })}
                  </p>
                )}

                <div className="grid md:grid-cols-4 gap-2 text-sm">
                  <label>
                    {t("teacher.trabajos.libro.type", { defaultValue: "Tipo" })}
                    <select
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                      value={pregunta.tipo}
                      onChange={(e) => updatePregunta(index, { tipo: e.target.value as LibroPreguntaInput["tipo"] })}
                    >
                      {questionTypes.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    {t("teacher.trabajos.libro.order", { defaultValue: "Orden" })}
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                      value={pregunta.orden}
                      onChange={(e) => updatePregunta(index, { orden: Number(e.target.value || index + 1) })}
                    />
                  </label>

                  <label>
                    {t("teacher.trabajos.libro.page", { defaultValue: "Pagina" })}
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                      value={pregunta.pagina_libro || ""}
                      onChange={(e) => updatePregunta(index, { pagina_libro: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </label>

                  <label>
                    {t("teacher.trabajos.libro.confidence", { defaultValue: "Confianza IA" })}
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                      value={pregunta.confianza_ia ?? ""}
                      onChange={(e) => updatePregunta(index, { confianza_ia: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </label>
                </div>

                <label className="text-sm block mt-2">
                  {t("teacher.trabajos.libro.options", { defaultValue: "Opciones (separadas por coma)" })}
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={optionsToText(pregunta.opciones)}
                    onChange={(e) => updatePregunta(index, { opciones: parseOptions(e.target.value) })}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        <label className="text-sm block">
          {t("teacher.trabajos.libro.reviewNotes", { defaultValue: "Notas de revision" })}
          <textarea
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            rows={2}
            value={notasRevision}
            onChange={(e) => setNotasRevision(e.target.value)}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={aprobarRevision} onChange={(e) => setAprobarRevision(e.target.checked)} />
          {t("teacher.trabajos.libro.markApproved", { defaultValue: "Marcar revision como aprobada" })}
        </label>

        <button
          onClick={onGuardarRevision}
          disabled={busy || preguntas.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {t("teacher.trabajos.libro.saveReview", { defaultValue: "Guardar revision" })}
        </button>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="font-semibold">{t("teacher.trabajos.libro.confirmTitle", { defaultValue: "Paso 3: Confirmar extraccion" })}</h2>

        <label className="text-sm block">
          {t("teacher.trabajos.libro.finalNotes", { defaultValue: "Notas finales" })}
          <textarea
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            rows={2}
            value={confirmReq.notas_finales || ""}
            onChange={(e) => setConfirmReq((prev) => ({ ...prev, notas_finales: e.target.value }))}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmReq.publicar}
            onChange={(e) => setConfirmReq((prev) => ({ ...prev, publicar: e.target.checked }))}
          />
          {t("teacher.trabajos.libro.publishOnConfirm", { defaultValue: "Publicar trabajo al confirmar" })}
        </label>

        <button
          onClick={onConfirmar}
          disabled={busy || extraccionEstado !== "aprobado"}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
          {t("teacher.trabajos.libro.confirmAction", { defaultValue: "Confirmar extraccion" })}
        </button>

        {extraccionEstado !== "aprobado" && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            {t("teacher.trabajos.libro.mustApprove", { defaultValue: "Debes aprobar la revision antes de confirmar." })}
          </p>
        )}
      </section>
    </div>
  );
}

function buildJobStatusCard(status: LibroExtractJobStatusResponse) {
  return {
    estado: status.estado,
    progress: status.progress,
    message: status.message,
    duration_ms: status.duration_ms,
    error_type: status.error_type,
    error_message: status.error_message ?? status.error,
  };
}
