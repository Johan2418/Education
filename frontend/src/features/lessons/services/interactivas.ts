import { api } from "@/shared/lib/api";
import type { ActividadInteractiva, ActividadInteractivaIntento } from "@/shared/types";

interface ApiData<T> {
  data: T;
}

export interface ActividadInteractivaPayload {
  leccion_id: string;
  titulo: string;
  descripcion?: string | null;
  proveedor: "h5p" | "genially" | "educaplay" | "nativo";
  embed_url: string;
  regla_completitud?: "manual" | "evento" | "puntaje";
  puntaje_maximo?: number;
  intentos_maximos?: number | null;
  configuracion?: Record<string, unknown>;
  activo?: boolean;
}

export interface ActividadInteractivaIntentoPayload {
  completado?: boolean;
  score_obtenido?: number;
  score_normalizado?: number;
  tiempo_dedicado?: number;
  intentos?: number;
  metadata?: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
}

export interface NormalizedInteractiveEvent {
  eventKey: string;
  completado: boolean;
  scoreObtenido?: number;
  scoreNormalizado?: number;
  tiempoDedicado?: number;
  metadata: Record<string, unknown>;
}

export interface NativeInteractiveOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface NativeInteractiveQuestion {
  id: string;
  prompt: string;
  options: NativeInteractiveOption[];
}

export interface NativeInteractiveConfig {
  questions: NativeInteractiveQuestion[];
  scoreThreshold: number;
  isQuickQuiz: boolean;
  timePerQuestionSeconds: number;
  autoSkipOnTimeout: boolean;
}

function toObject(input: unknown): Record<string, unknown> | null {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return null;
}

function parsePayload(input: unknown): Record<string, unknown> | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      return toObject(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return toObject(input);
}

function readNested(input: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = input;
  for (const segment of path) {
    const obj = toObject(cursor);
    if (!obj) return undefined;
    cursor = obj[segment];
  }
  return cursor;
}

function readString(input: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const raw = readNested(input, path);
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return undefined;
}

function readNumber(input: Record<string, unknown>, paths: string[][]): number | undefined {
  for (const path of paths) {
    const raw = readNested(input, path);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function readBoolean(input: Record<string, unknown>, paths: string[][]): boolean | undefined {
  for (const path of paths) {
    const raw = readNested(input, path);
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "string") {
      const lowered = raw.trim().toLowerCase();
      if (lowered === "true") return true;
      if (lowered === "false") return false;
    }
  }
  return undefined;
}

function fallbackEventKey(provider: string, eventOrigin: string, payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return `${provider}:${eventOrigin}:${json.slice(0, 512)}`;
}

function normalizeScore(score: number | undefined, scaled: number | undefined): number | undefined {
  if (typeof scaled === "number" && Number.isFinite(scaled)) {
    const normalized = Math.max(0, Math.min(100, scaled * 100));
    return normalized;
  }
  if (typeof score === "number" && Number.isFinite(score)) {
    return Math.max(0, Math.min(100, score));
  }
  return undefined;
}

export function normalizeInteractiveProviderEvent(
  provider: "h5p" | "genially" | "educaplay" | "nativo",
  rawPayload: unknown,
  eventOrigin: string,
): NormalizedInteractiveEvent | null {
  const payload = parsePayload(rawPayload);
  if (!payload) return null;

  const statement = toObject(payload.statement) ?? payload;

  const eventType = readString(payload, [["type"], ["event"], ["action"]])
    || readString(statement, [["verb", "id"]]);

  const completedFromVerb = typeof eventType === "string"
    && ["completed", "passed", "finished", "done"].some((token) => eventType.toLowerCase().includes(token));

  const completedFromPayload = readBoolean(payload, [["completed"], ["completado"], ["isCompleted"]]);
  const progressValue = readNumber(payload, [["progress"], ["porcentaje"], ["completion"]]);

  const scoreRaw = readNumber(payload, [["score_obtenido"], ["score"], ["result", "score"], ["result", "score", "raw"]])
    ?? readNumber(statement, [["result", "score", "raw"]]);
  const scoreScaled = readNumber(payload, [["score_normalizado"], ["result", "score", "scaled"]])
    ?? readNumber(statement, [["result", "score", "scaled"]]);

  const scoreNormalizado = normalizeScore(scoreRaw, scoreScaled);
  const tiempoDedicado = readNumber(payload, [["tiempo_dedicado"], ["time_spent"], ["timeSpent"], ["duration_seconds"]]);

  const eventID = readString(payload, [["event_id"], ["eventId"], ["id"]])
    ?? readString(statement, [["id"]]);
  const eventKey = eventID ? `${provider}:${eventID}` : fallbackEventKey(provider, eventOrigin, payload);

  const completado = Boolean(
    completedFromPayload
      || completedFromVerb
      || (typeof progressValue === "number" && progressValue >= 100)
  );

  if (!completado && scoreNormalizado == null && scoreRaw == null && tiempoDedicado == null) {
    return null;
  }

  return {
    eventKey,
    completado,
    scoreObtenido: scoreRaw,
    scoreNormalizado,
    tiempoDedicado,
    metadata: {
      origen: "iframe_postmessage",
      provider,
      event_origin: eventOrigin,
      event_id: eventID,
      event_type: eventType,
    },
  };
}

export function extractInteractiveAllowedOrigins(
  provider?: "h5p" | "genially" | "educaplay" | "nativo",
  configuracion?: Record<string, unknown> | null,
): string[] {
  const defaults: Record<string, string[]> = {
    h5p: ["https://h5p.com", "https://h5p.org"],
    genially: ["https://genial.ly", "https://genially.com"],
    educaplay: ["https://www.educaplay.com", "https://educaplay.com"],
    nativo: [],
  };

  const configured = configuracion?.allowed_origins;
  if (Array.isArray(configured)) {
    const values = configured
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    if (values.length > 0) return values;
  }

  if (provider) {
    return defaults[provider] || [];
  }

  return [];
}

export function isInteractiveOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin.trim()) return false;
  if (allowedOrigins.length === 0) return true;

  const normalizedOrigin = origin.trim().toLowerCase();
  for (const candidate of allowedOrigins) {
    const normalizedCandidate = candidate.trim().toLowerCase();
    if (!normalizedCandidate) continue;
    if (normalizedCandidate === "*" || normalizedCandidate === normalizedOrigin) {
      return true;
    }

    try {
      const originURL = new URL(normalizedOrigin);
      const candidateURL = new URL(normalizedCandidate);
      if (originURL.hostname === candidateURL.hostname) {
        return true;
      }
      if (originURL.hostname.endsWith(`.${candidateURL.hostname}`)) {
        return true;
      }
    } catch {
      // Keep trying other candidates.
    }
  }

  return false;
}

export function resolveInteractiveScoreThreshold(configuracion?: Record<string, unknown> | null): number {
  const raw = configuracion?.score_threshold ?? configuracion?.puntaje_minimo;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return 70;
  return Math.max(0, Math.min(100, value));
}

function parseQuestionOptions(rawOptions: unknown): NativeInteractiveOption[] {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions
    .map((rawOption, idx) => {
      if (typeof rawOption !== "object" || rawOption === null) return null;
      const option = rawOption as Record<string, unknown>;
      const text = String(option.text ?? option.texto ?? "").trim();
      if (!text) return null;
      const idRaw = option.id;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `opt_${idx + 1}`;
      const isCorrect = Boolean(option.isCorrect ?? option.correcta);
      return { id, text, isCorrect };
    })
    .filter((option): option is NativeInteractiveOption => option !== null);
}

export function parseNativeInteractiveConfig(configuracion?: Record<string, unknown> | null): NativeInteractiveConfig {
  const rawQuestions = configuracion?.preguntas ?? configuracion?.questions;
  const questions = Array.isArray(rawQuestions)
    ? rawQuestions
      .map((rawQuestion, idx) => {
        if (typeof rawQuestion !== "object" || rawQuestion === null) return null;
        const question = rawQuestion as Record<string, unknown>;
        const prompt = String(question.prompt ?? question.enunciado ?? "").trim();
        if (!prompt) return null;
        const options = parseQuestionOptions(question.opciones ?? question.options);
        if (options.length < 2 || !options.some((option) => option.isCorrect)) return null;
        const idRaw = question.id;
        const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `q_${idx + 1}`;
        return { id, prompt, options };
      })
      .filter((question): question is NativeInteractiveQuestion => question !== null)
    : [];

  const cfg = toObject(configuracion) || {};
  const quickQuizEnabled = readBoolean(cfg, [
    ["modo_quiz_veloz"],
    ["quick_quiz"],
    ["is_quick_quiz"],
    ["quick_quiz_mode"],
  ]) ?? false;
  const rawTimePerQuestion = readNumber(cfg, [
    ["tiempo_por_pregunta_segundos"],
    ["time_per_question_seconds"],
    ["timePerQuestionSeconds"],
    ["quiz_time_limit_seconds"],
  ]);
  const timePerQuestionSeconds = Math.max(1, Math.round(rawTimePerQuestion ?? 15));
  const autoSkipOnTimeout = readBoolean(cfg, [
    ["auto_saltar_timeout"],
    ["auto_skip_on_timeout"],
    ["skip_on_timeout"],
    ["auto_next_on_timeout"],
  ]) ?? true;

  return {
    questions,
    scoreThreshold: resolveInteractiveScoreThreshold(configuracion),
    isQuickQuiz: quickQuizEnabled,
    timePerQuestionSeconds,
    autoSkipOnTimeout,
  };
}

export async function listActividadesInteractivasByLeccion(leccionId: string): Promise<ActividadInteractiva[]> {
  const res = await api.get<ApiData<ActividadInteractiva[]>>(`/lecciones/${leccionId}/actividades-interactivas`);
  return res.data;
}

export async function getActividadInteractiva(actividadId: string): Promise<ActividadInteractiva> {
  const res = await api.get<ApiData<ActividadInteractiva>>(`/actividades-interactivas/${actividadId}`);
  return res.data;
}

export async function createActividadInteractiva(payload: ActividadInteractivaPayload): Promise<ActividadInteractiva> {
  const res = await api.post<ApiData<ActividadInteractiva>>(`/actividades-interactivas`, payload);
  return res.data;
}

export async function updateActividadInteractiva(
  actividadId: string,
  payload: Partial<ActividadInteractivaPayload>,
): Promise<ActividadInteractiva> {
  const res = await api.put<ApiData<ActividadInteractiva>>(`/actividades-interactivas/${actividadId}`, payload);
  return res.data;
}

export async function deleteActividadInteractiva(actividadId: string): Promise<void> {
  await api.delete<ApiData<{ message: string }>>(`/actividades-interactivas/${actividadId}`);
}

export async function getMiIntentoActividad(actividadId: string): Promise<ActividadInteractivaIntento | null> {
  try {
    const res = await api.get<ApiData<ActividadInteractivaIntento>>(`/actividades-interactivas/${actividadId}/intento`);
    return res.data;
  } catch (err) {
    if (typeof err === "object" && err !== null && "status" in err && (err as { status?: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function upsertIntentoActividad(
  actividadId: string,
  payload: ActividadInteractivaIntentoPayload,
): Promise<ActividadInteractivaIntento> {
  const res = await api.put<ApiData<ActividadInteractivaIntento>>(`/actividades-interactivas/${actividadId}/intento`, payload);
  return res.data;
}

export async function listIntentosByActividad(actividadId: string): Promise<ActividadInteractivaIntento[]> {
  const res = await api.get<ApiData<ActividadInteractivaIntento[]>>(`/actividades-interactivas/${actividadId}/intentos`);
  return res.data;
}
