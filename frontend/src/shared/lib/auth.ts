import { api, setToken, clearToken, isAuthenticated } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  phone: string | null;
  thumbnail_url: string | null;
  requested_role: string | null;
  is_verified: boolean;
  last_access: string | null;
  created_at: string;
}

interface TokenResponse {
  token: string;
  profile: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await api.post<{ data: TokenResponse }>("/auth/login", { email, password });
  setToken(res.data.token);
  window.dispatchEvent(new Event("auth-change"));
  return res.data.profile;
}

interface RegisterResponse {
  message: string;
  user: AuthUser;
}

export async function register(data: {
  email: string;
  password: string;
  display_name: string;
  role?: string;
  phone?: string;
  requested_role?: string;
}): Promise<RegisterResponse> {
  const res = await api.post<{ data: RegisterResponse }>("/auth/register", data);
  return res.data;
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const res = await api.get<{ message: string }>(`/auth/verify?token=${encodeURIComponent(token)}`);
  return res;
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/auth/resend-verification", { email });
  return res;
}

export async function getMe(): Promise<AuthUser | null> {
  if (!isAuthenticated()) return null;
  try {
    const res = await api.get<{ data: AuthUser }>("/auth/me");
    return res.data;
  } catch {
    return null;
  }
}

export async function updateProfile(data: {
  display_name?: string;
  phone?: string;
  thumbnail_url?: string;
}): Promise<AuthUser> {
  const res = await api.put<{ data: AuthUser }>("/auth/profile", data);
  return res.data;
}

export function signOut(): void {
  clearToken();
  window.dispatchEvent(new Event("auth-change"));
  window.location.href = "/login";
}

export { isAuthenticated };
