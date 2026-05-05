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

export type NativeInteractiveActivityType =
  | "quiz"
  | "true_false"
  | "fill_in_the_blank"
  | "matching"
  | "ordering"
  | "hotspot"
  | "drag_and_drop"
  | "interactive_map"
  | "word_search"
  | "crossword"
  | "memory"
  | "simulator"
  | "virtual_lab";

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

export interface NativeDragAndDropCategory {
  id: string;
  label: string;
}

export interface NativeDragAndDropItem {
  id: string;
  label: string;
  targetCategoryId?: string;
}

export interface NativeMapMarker {
  id: string;
  label: string;
  description?: string;
  x?: number;
  y?: number;
  isCorrect?: boolean;
}

export interface NativeInteractiveConfig {
  activityType: NativeInteractiveActivityType;
  questions: NativeInteractiveQuestion[];
  fillBlankText?: string;
  fillBlankWordBank?: string[];
  fillBlankAnswers?: string[];
  hotspots?: NativeInteractiveOption[];
  hotspotImageUrl?: string;
  dragAndDropCategories?: NativeDragAndDropCategory[];
  dragAndDropItems?: NativeDragAndDropItem[];
  mapImageUrl?: string;
  mapMarkers?: NativeMapMarker[];
  wordSearchWords?: string[];
  crosswordClues?: Array<{ id: string; clue: string; answer: string }>;
  memoryPairs?: Array<{ id: string; left: string; right: string }>;
  simulatorVariables?: Array<{ id: string; name: string; value: string }>;
  simulatorInstructions?: string;
  virtualLabAssets?: Array<{ id: string; name: string; url: string }>;
  virtualLabInstructions?: string;
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

function readActivityType(input: Record<string, unknown>): NativeInteractiveActivityType {
  const raw = readString(input, [["activityType"], ["tipo_actividad"], ["native_activity_type"], ["nativeActivityType"], ["interactive_activity_type"]]);
  if (!raw) return "quiz";
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case "quiz":
    case "true_false":
    case "fill_in_the_blank":
    case "matching":
    case "ordering":
    case "hotspot":
    case "drag_and_drop":
    case "interactive_map":
    case "word_search":
    case "crossword":
    case "memory":
    case "simulator":
    case "virtual_lab":
      return normalized as NativeInteractiveActivityType;
    default:
      return "quiz";
  }
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

function parseStringArray(rawInput: unknown): string[] {
  if (!Array.isArray(rawInput)) return [];
  return rawInput
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((word): word is string => Boolean(word));
}

function parseOrderingItems(rawInput: unknown): NativeInteractiveQuestion[] {
  if (!Array.isArray(rawInput)) return [];

  const items = rawInput
    .map((rawItem, idx) => {
      if (typeof rawItem !== "object" || rawItem === null) return null;
      const item = rawItem as Record<string, unknown>;
      const text = String(item.text ?? item.texto ?? item.label ?? item.elemento ?? "").trim();
      if (!text) return null;
      const idRaw = item.id;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `item_${idx + 1}`;
      return { id, text };
    })
    .filter((item): item is { id: string; text: string } => item !== null);

  if (items.length === 0) return [];

  return [{
    id: "q_1",
    prompt: "Ordena los elementos",
    options: items.map((item) => ({
      id: item.id,
      text: item.text,
      isCorrect: true,
    })),
  }];
}

function parseDragAndDropCategories(rawInput: unknown): NativeDragAndDropCategory[] {
  if (!Array.isArray(rawInput)) return [];
  return rawInput
    .map((rawCategory, idx) => {
      if (typeof rawCategory !== "object" || rawCategory === null) return null;
      const category = rawCategory as Record<string, unknown>;
      const label = String(category.label ?? category.etiqueta ?? "").trim();
      if (!label) return null;
      const idRaw = category.id ?? category.category_id ?? `cat_${idx + 1}`;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `cat_${idx + 1}`;
      return { id, label };
    })
    .filter((item): item is NativeDragAndDropCategory => item !== null);
}

function parseDragAndDropItems(rawInput: unknown): NativeDragAndDropItem[] {
  if (!Array.isArray(rawInput)) return [];
  const parsed: Array<NativeDragAndDropItem | null> = rawInput.map((rawItem, idx) => {
    if (typeof rawItem !== "object" || rawItem === null) return null;
    const item = rawItem as Record<string, unknown>;
    const label = String(item.label ?? item.text ?? item.etiqueta ?? "").trim();
    if (!label) return null;
    const idRaw = item.id ?? `item_${idx + 1}`;
    const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `item_${idx + 1}`;
    const targetCategoryId = String(item.targetCategoryId ?? item.category_id ?? item.categoria_id ?? "").trim() || undefined;
    return { id, label, targetCategoryId };
  });
  return parsed.filter((item): item is NativeDragAndDropItem => item !== null);
}

function parseMapMarkers(rawInput: unknown): NativeMapMarker[] {
  if (!Array.isArray(rawInput)) return [];
  const parsed: Array<NativeMapMarker | null> = rawInput.map((rawMarker, idx) => {
    if (typeof rawMarker !== "object" || rawMarker === null) return null;
    const marker = rawMarker as Record<string, unknown>;
    const label = String(marker.label ?? marker.text ?? marker.etiqueta ?? "").trim();
    if (!label) return null;
    const idRaw = marker.id ?? `marker_${idx + 1}`;
    const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `marker_${idx + 1}`;
    const xRaw = marker.x ?? marker.pos_x ?? marker.left;
    const yRaw = marker.y ?? marker.pos_y ?? marker.top;
    const xValue = typeof xRaw === "number" ? xRaw : typeof xRaw === "string" ? Number(xRaw) : undefined;
    const yValue = typeof yRaw === "number" ? yRaw : typeof yRaw === "string" ? Number(yRaw) : undefined;
    const description = String(marker.description ?? marker.descripcion ?? "").trim() || undefined;
    const isCorrect = Boolean(marker.isCorrect ?? marker.correcto ?? marker.correct);
    return {
      id,
      label,
      description,
      x: typeof xValue === "number" && Number.isFinite(xValue) ? Math.min(100, Math.max(0, xValue)) : undefined,
      y: typeof yValue === "number" && Number.isFinite(yValue) ? Math.min(100, Math.max(0, yValue)) : undefined,
      isCorrect,
    };
  });
  return parsed.filter((item): item is NativeMapMarker => item !== null);
}

function parseCrosswordClues(rawInput: unknown): Array<{ id: string; clue: string; answer: string }> {
  if (!Array.isArray(rawInput)) return [];
  return rawInput
    .map((rawClue, idx) => {
      if (typeof rawClue !== "object" || rawClue === null) return null;
      const clue = rawClue as Record<string, unknown>;
      const clueText = String(clue.clue ?? clue.pista ?? clue.text ?? "").trim();
      const answerText = String(clue.answer ?? clue.respuesta ?? "").trim();
      if (!clueText || !answerText) return null;
      const idRaw = clue.id ?? `clue_${idx + 1}`;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `clue_${idx + 1}`;
      return { id, clue: clueText, answer: answerText };
    })
    .filter((item): item is { id: string; clue: string; answer: string } => item !== null);
}

function parseMemoryPairs(rawInput: unknown): Array<{ id: string; left: string; right: string }> {
  if (!Array.isArray(rawInput)) return [];
  return rawInput
    .map((rawPair, idx) => {
      if (typeof rawPair !== "object" || rawPair === null) return null;
      const pair = rawPair as Record<string, unknown>;
      const left = String(pair.left ?? pair.izquierda ?? pair.texto_izquierdo ?? "").trim();
      const right = String(pair.right ?? pair.derecha ?? pair.texto_derecho ?? "").trim();
      if (!left || !right) return null;
      const idRaw = pair.id ?? `pair_${idx + 1}`;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `pair_${idx + 1}`;
      return { id, left, right };
    })
    .filter((item): item is { id: string; left: string; right: string } => item !== null);
}

function parseSimulatorVariables(rawInput: unknown): Array<{ id: string; name: string; value: string }> {
  if (!Array.isArray(rawInput)) return [];
  return rawInput
    .map((rawVar, idx) => {
      if (typeof rawVar !== "object" || rawVar === null) return null;
      const variable = rawVar as Record<string, unknown>;
      const name = String(variable.name ?? variable.nombre ?? variable.var ?? "").trim();
      const value = String(variable.value ?? variable.valor ?? variable.initial_value ?? "").trim();
      if (!name) return null;
      const idRaw = variable.id ?? `var_${idx + 1}`;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `var_${idx + 1}`;
      return { id, name, value };
    })
    .filter((item): item is { id: string; name: string; value: string } => item !== null);
}

function parseVirtualLabAssets(rawInput: unknown): Array<{ id: string; name: string; url: string }> {
  if (!Array.isArray(rawInput)) return [];
  return rawInput
    .map((rawAsset, idx) => {
      if (typeof rawAsset !== "object" || rawAsset === null) return null;
      const asset = rawAsset as Record<string, unknown>;
      const name = String(asset.name ?? asset.nombre ?? asset.label ?? "").trim();
      const url = String(asset.url ?? asset.enlace ?? asset.resource_url ?? "").trim();
      if (!name || !url) return null;
      const idRaw = asset.id ?? `asset_${idx + 1}`;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `asset_${idx + 1}`;
      return { id, name, url };
    })
    .filter((item): item is { id: string; name: string; url: string } => item !== null);
}

export function parseNativeInteractiveConfig(configuracion?: Record<string, unknown> | null): NativeInteractiveConfig {
  const cfg = toObject(configuracion) || {};
  const activityType = readActivityType(cfg);
  const rawQuestions = configuracion?.preguntas ?? configuracion?.questions;
  const rawOrderingItems = configuracion?.ordering_items ?? configuracion?.orderingItems;
  const questions = Array.isArray(rawQuestions)
    ? rawQuestions
      .map((rawQuestion, idx) => {
        if (typeof rawQuestion !== "object" || rawQuestion === null) return null;
        const question = rawQuestion as Record<string, unknown>;
        const prompt = String(question.prompt ?? question.enunciado ?? "").trim();
        if (!prompt) return null;
        const options = parseQuestionOptions(question.opciones ?? question.options);

        if (activityType === "matching") {
          if (options.length < 1) return null;
        } else if (options.length < 2 || !options.some((option) => option.isCorrect)) {
          return null;
        }

        const idRaw = question.id;
        const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : `q_${idx + 1}`;
        return { id, prompt, options };
      })
      .filter((question): question is NativeInteractiveQuestion => question !== null)
    : [];
  const orderingQuestions = parseOrderingItems(rawOrderingItems);
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

  const hotspotImageUrl = readString(cfg, [["hotspot_image_url"], ["hotspotImageUrl"], ["image_url"], ["imagen_url"]]);
  const rawHotspots = cfg["hotspots"] ?? cfg["puntos"];
  const hotspotOptions = Array.isArray(rawHotspots)
    ? parseQuestionOptions(rawHotspots)
    : [];

  const dragCategories = parseDragAndDropCategories(cfg["drag_categories"] ?? cfg["categories"] ?? cfg["categorias"]);
  const dragItems = parseDragAndDropItems(cfg["drag_items"] ?? cfg["items"] ?? cfg["elementos"]);

  const mapImageUrl = readString(cfg, [["map_image_url"], ["mapImageUrl"], ["imagen_url"], ["image_url"]]);
  const mapMarkers = parseMapMarkers(cfg["markers"] ?? cfg["puntos"] ?? cfg["marcadores"]);

  const fillBlankText = readString(cfg, [["fill_blank_text"], ["fillBlankText"], ["texto_con_espacios"], ["texto"]]);
  const fillBlankWordBank = parseStringArray(cfg["word_bank"] ?? cfg["wordBank"] ?? cfg["banco_palabras"] ?? cfg["palabras"]);
  const fillBlankAnswers = parseStringArray(cfg["fill_blank_answers"] ?? cfg["fillBlankAnswers"] ?? cfg["correct_answers"] ?? cfg["correctAnswers"] ?? cfg["answers"]);
  const fillBlankQuestionFallback = fillBlankText && (fillBlankWordBank.length > 0 || fillBlankAnswers.length > 0)
    ? [{
        id: "q_1",
        prompt: fillBlankText,
        options: (fillBlankWordBank.length > 0 ? fillBlankWordBank : fillBlankAnswers).map((text, idx) => ({
          id: `opt_${idx + 1}`,
          text,
          isCorrect: fillBlankAnswers.some((answer) => answer.trim().toLowerCase() === text.trim().toLowerCase()),
        })),
      }]
    : [];

  const wordSearchWords = parseStringArray(cfg["words"] ?? cfg["palabras"] ?? cfg["word_search_words"] ?? cfg["wordSearchWords"]);
  const crosswordClues = parseCrosswordClues(cfg["clues"] ?? cfg["pistas"] ?? cfg["crossword_clues"] ?? cfg["crosswordClues"]);
  const memoryPairs = parseMemoryPairs(cfg["pairs"] ?? cfg["pares"] ?? cfg["memory_pairs"] ?? cfg["memoryPairs"]);
  const simulatorVariables = parseSimulatorVariables(cfg["variables"] ?? cfg["variables_simulator"] ?? cfg["simulatorVariables"]);
  const simulatorInstructions = readString(cfg, [["instructions"], ["instrucciones"], ["simulator_instructions"], ["simulatorInstructions"]]) || undefined;
  const virtualLabAssets = parseVirtualLabAssets(cfg["assets"] ?? cfg["recursos"] ?? cfg["virtual_lab_assets"] ?? cfg["virtualLabAssets"]);
  const virtualLabInstructions = readString(cfg, [["instructions"], ["instrucciones"], ["virtual_lab_instructions"], ["virtualLabInstructions"]]) || undefined;

  const inferredActivityType = fillBlankText && (fillBlankWordBank.length > 0 || fillBlankAnswers.length > 0)
    ? "fill_in_the_blank"
    : activityType;

  const questionsForValidation = questions.length > 0
    ? questions
    : activityType === "ordering" && orderingQuestions.length > 0
      ? orderingQuestions
      : [];

  const isQuestionValid = (question: NativeInteractiveQuestion): boolean => {
    if (inferredActivityType === "fill_in_the_blank") return question.options.length > 0;
    if (inferredActivityType === "matching") return question.options.length >= 1;
    if (inferredActivityType === "ordering") return question.options.length >= 2;
    if (inferredActivityType === "hotspot") return false;
    return question.options.some((option) => option.isCorrect);
  };

  const validatedQuestions = questionsForValidation.filter(isQuestionValid);
  const effectiveQuestions = validatedQuestions.length > 0 ? validatedQuestions : fillBlankQuestionFallback;

  return {
    activityType: inferredActivityType,
    questions: effectiveQuestions,
    fillBlankText: fillBlankText || undefined,
    fillBlankWordBank: fillBlankWordBank.length > 0 ? fillBlankWordBank : undefined,
    fillBlankAnswers: fillBlankAnswers.length > 0 ? fillBlankAnswers : undefined,
    hotspots: hotspotOptions,
    hotspotImageUrl: hotspotImageUrl || undefined,
    dragAndDropCategories: dragCategories,
    dragAndDropItems: dragItems,
    mapImageUrl: mapImageUrl || undefined,
    mapMarkers,
    wordSearchWords: wordSearchWords.length > 0 ? wordSearchWords : undefined,
    crosswordClues: crosswordClues.length > 0 ? crosswordClues : undefined,
    memoryPairs: memoryPairs.length > 0 ? memoryPairs : undefined,
    simulatorVariables: simulatorVariables.length > 0 ? simulatorVariables : undefined,
    simulatorInstructions,
    virtualLabAssets: virtualLabAssets.length > 0 ? virtualLabAssets : undefined,
    virtualLabInstructions,
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
