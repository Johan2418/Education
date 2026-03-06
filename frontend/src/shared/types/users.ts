// Matches Go backend auth/model.go Profile
export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  phone: string | null;
  thumbnail_url: string | null;
  requested_role: string | null;
  is_verified: boolean;
  last_access: string | null;
  created_at: string;
}

export type UserRole = "student" | "teacher" | "resource_manager" | "admin" | "super_admin";

export interface UserFilters {
  role?: UserRole;
  search?: string;
}
