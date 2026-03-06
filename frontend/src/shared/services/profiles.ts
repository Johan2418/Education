import { api } from "@/shared/lib/api";
import type { Profile } from "@/shared/types";

export async function listUsers(): Promise<Profile[]> {
  const res = await api.get<{ data: Profile[] }>("/admin/users");
  return res.data;
}

export async function getUser(id: string): Promise<Profile> {
  const res = await api.get<{ data: Profile }>(`/admin/users/${id}`);
  return res.data;
}

export async function changeRole(id: string, role: string): Promise<void> {
  await api.put(`/admin/users/${id}/role`, { role });
}

export async function approveRole(id: string): Promise<void> {
  await api.post(`/admin/users/${id}/approve-role`);
}

export async function rejectRole(id: string): Promise<void> {
  await api.post(`/admin/users/${id}/reject-role`);
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/admin/users/${id}`);
}

export async function createAdmin(data: {
  email: string;
  password: string;
  display_name: string;
}): Promise<void> {
  await api.post("/admin/create-admin", data);
}
