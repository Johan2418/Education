export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8082";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface ApiError {
  status: number;
  message: string;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string): void {
  localStorage.setItem("token", token);
}

export function clearToken(): void {
  localStorage.removeItem("token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Wrap fetch with explicit timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.error ?? body.message ?? message;
      } catch { /* ignore */ }
      const err: ApiError = { status: res.status, message };
      throw err;
    }

    if (res.status === 204) return undefined as unknown as T;

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function isMissingRouteError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const maybe = err as { status?: unknown; message?: unknown };
  if (typeof maybe.status !== "number" || maybe.status !== 404) return false;
  if (typeof maybe.message !== "string") return false;
  return maybe.message.toLowerCase().includes("404 page not found");
}

export default api;
