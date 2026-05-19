export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").trim() || "http://localhost:9082";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface ApiRequestOptions {
  timeoutMs?: number;
  retryOnAbort?: number;
  retryDelayMs?: number;
}

const STORAGE_KEYS = {
  accessToken: "access_token",
  refreshToken: "refresh_token",
  accessExpiresAt: "access_expires_at",
  legacyToken: "token",
} as const;

export interface ApiError {
  status: number;
  message: string;
}

type StorageKind = "local" | "session";

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
}

interface RefreshResponseData {
  token?: string;
  access_token?: string;
  refresh_token?: string;
  access_expires_at?: string;
}

let refreshPromise: Promise<boolean> | null = null;

function getStorage(kind: StorageKind): Storage {
  return kind === "local" ? localStorage : sessionStorage;
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadPart = parts[1];
    if (!payloadPart) return null;
    const payload = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(normalized);
    return JSON.parse(decoded) as { exp?: number };
  } catch {
    return null;
  }
}

function isJwtExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}

function readTokensFrom(storage: Storage): SessionTokens | null {
  const accessToken = storage.getItem(STORAGE_KEYS.accessToken);
  const refreshToken = storage.getItem(STORAGE_KEYS.refreshToken);
  const accessExpiresAt = storage.getItem(STORAGE_KEYS.accessExpiresAt);
  if (!accessToken || !refreshToken || !accessExpiresAt) return null;
  return { accessToken, refreshToken, accessExpiresAt };
}

function readSessionTokens(): SessionTokens | null {
  return readTokensFrom(localStorage) ?? readTokensFrom(sessionStorage);
}

function readLegacyToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.legacyToken);
}

function clearStorageTokens(storage: Storage): void {
  storage.removeItem(STORAGE_KEYS.accessToken);
  storage.removeItem(STORAGE_KEYS.refreshToken);
  storage.removeItem(STORAGE_KEYS.accessExpiresAt);
}

function setStorageTokens(storage: Storage, tokens: SessionTokens): void {
  storage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
  storage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
  storage.setItem(STORAGE_KEYS.accessExpiresAt, tokens.accessExpiresAt);
}

function shouldPersistSession(): boolean {
  return localStorage.getItem(STORAGE_KEYS.refreshToken) !== null;
}

export function setSession(tokens: SessionTokens, rememberMe: boolean): void {
  clearStorageTokens(localStorage);
  clearStorageTokens(sessionStorage);
  localStorage.removeItem(STORAGE_KEYS.legacyToken);
  setStorageTokens(getStorage(rememberMe ? "local" : "session"), tokens);
}

export function setSessionFromAuthResponse(data: RefreshResponseData, rememberMe: boolean): void {
  const accessToken = data.access_token ?? data.token ?? "";
  const refreshToken = data.refresh_token ?? "";
  const accessExpiresAt = data.access_expires_at ?? "";
  if (!accessToken || !refreshToken || !accessExpiresAt) {
    throw new Error("Respuesta de autenticacion incompleta");
  }
  setSession({ accessToken, refreshToken, accessExpiresAt }, rememberMe);
}

export function clearSession(): void {
  clearStorageTokens(localStorage);
  clearStorageTokens(sessionStorage);
  localStorage.removeItem(STORAGE_KEYS.legacyToken);
}

export function getAccessToken(): string | null {
  const session = readSessionTokens();
  if (session?.accessToken) return session.accessToken;
  return readLegacyToken();
}

function getRefreshToken(): string | null {
  const session = readSessionTokens();
  return session?.refreshToken ?? null;
}

export function getAuthorizationHeader(): string | null {
  const token = getAccessToken();
  return token ? `Bearer ${token}` : null;
}

async function parseApiError(res: Response): Promise<ApiError> {
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body.error ?? body.message ?? message;
  } catch {
    // ignore
  }
  return { status: res.status, message };
}

async function refreshSessionTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return false;
    }

    const payload = await res.json() as { data?: RefreshResponseData };
    const data = payload.data ?? {};
    setSessionFromAuthResponse(data, shouldPersistSession());
    window.dispatchEvent(new Event("auth-change"));
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ensureRefreshed(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshSessionTokens().finally(() => {
      refreshPromise = null;
    });
  }
  const ok = await refreshPromise;
  if (!ok) {
    clearSession();
    window.dispatchEvent(new Event("auth-change"));
  }
  return ok;
}

function withAuthHeaders(headers: HeadersInit = {}): Headers {
  const merged = new Headers(headers);
  const authHeader = getAuthorizationHeader();
  if (authHeader) merged.set("Authorization", authHeader);
  return merged;
}

function isAbortLikeError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const maybe = err as { name?: unknown; message?: unknown };
  if (typeof maybe.name === "string" && maybe.name === "AbortError") return true;
  if (typeof maybe.message === "string" && maybe.message.toLowerCase().includes("aborted")) return true;
  return false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function doFetch(
  path: string,
  options: RequestInit = {},
  retryOn401 = true,
  requestOptions?: ApiRequestOptions,
  abortAttempt: number = 0,
): Promise<Response> {
  const targetUrl = /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`;
  const timeoutMs = Math.max(1_000, requestOptions?.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const retryOnAbort = Math.max(0, requestOptions?.retryOnAbort ?? 0);
  const retryDelayMs = Math.max(100, requestOptions?.retryDelayMs ?? 450);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      ...options,
      headers: withAuthHeaders(options.headers),
      signal: controller.signal,
    });

    if (res.status === 401 && retryOn401 && getRefreshToken()) {
      const refreshed = await ensureRefreshed();
      if (refreshed) {
        return doFetch(path, options, false, requestOptions, abortAttempt);
      }
    }

    return res;
  } catch (err) {
    if (isAbortLikeError(err) && abortAttempt < retryOnAbort) {
      console.warn("[api] request timeout, retrying", {
        path: targetUrl,
        attempt: abortAttempt + 1,
        maxRetries: retryOnAbort,
        timeoutMs,
      });
      await wait(retryDelayMs * (abortAttempt + 1));
      return doFetch(path, options, retryOn401, requestOptions, abortAttempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request<T>(path: string, options: RequestInit = {}, requestOptions?: ApiRequestOptions): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await doFetch(path, { ...options, headers }, true, requestOptions);

  if (!res.ok) {
    throw await parseApiError(res);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export async function authenticatedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return doFetch(path, options, true);
}

export function isAuthenticated(): boolean {
  const token = getAccessToken();
  if (!token) return false;

  if (!isJwtExpired(token)) return true;

  // Legacy token might still be valid server-side if no exp present in payload.
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;

  clearSession();
  return false;
}

export const api = {
  get: <T>(path: string, requestOptions?: ApiRequestOptions) => request<T>(path, {}, requestOptions),
  post: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, requestOptions),
  put: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, requestOptions),
  patch: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, requestOptions),
  delete: <T>(path: string, requestOptions?: ApiRequestOptions) => request<T>(path, { method: "DELETE" }, requestOptions),
};

export function isMissingRouteError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const maybe = err as { status?: unknown; message?: unknown };
  if (typeof maybe.status !== "number" || maybe.status !== 404) return false;
  if (typeof maybe.message !== "string") return false;
  return maybe.message.toLowerCase().includes("404 page not found");
}

export default api;
