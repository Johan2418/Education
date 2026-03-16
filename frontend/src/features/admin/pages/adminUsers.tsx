import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe, type AuthUser } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import {
  Loader2, Trash2, Check, X, Search, Plus, Pencil,
  UserPlus, ChevronDown, Shield, ShieldCheck, BadgeCheck, Clock,
} from "lucide-react";
import type { Profile, UserRole } from "@/shared/types";

/* ── Role colours & labels ──────────────────────────────── */
const ROLE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  student:          { bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-500" },
  teacher:          { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  resource_manager: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  admin:            { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500" },
  super_admin:      { bg: "bg-rose-50",   text: "text-rose-700",   dot: "bg-rose-500" },
};

const ROLES: UserRole[] = ["student", "teacher", "resource_manager", "admin", "super_admin"];
const ASSIGNABLE_ROLES: UserRole[] = ["student", "teacher", "resource_manager", "admin"];

function RoleBadge({ role }: { role: string }) {
  const fallback = { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
  const s = ROLE_STYLES[role] ?? fallback;
  const label = role.replace("_", " ");
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/* ── Modal wrapper ──────────────────────────────────────── */
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */
export default function AdminUsers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [me, setMe] = useState<AuthUser | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", confirmPassword: "", display_name: "", role: "student" as string });
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", phone: "", role: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const user = await getMe();
        if (!user || !["admin", "super_admin"].includes(user.role || "")) {
          navigate("/login");
          return;
        }
        setMe(user);
        const res = await api.get<{ data: Profile[] }>("/admin/users");
        setUsers(res.data || []);
      } catch {
        toast.error(t("admin.users.errors.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  /* ── Allowed roles for current caller ─────────────── */
  const allowedRoles = useMemo(() => {
    if (me?.role === "super_admin") return ASSIGNABLE_ROLES;
    return ASSIGNABLE_ROLES.filter((r) => r !== "admin");
  }, [me]);

  /* ── Filtered list ──────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        (u.display_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  /* ── Handlers ───────────────────────────────────────── */
  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { user_id: userId, new_role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole as UserRole } : u)));
      toast.success(t("admin.users.success.updated"));
    } catch {
      toast.error(t("admin.users.errors.updateError"));
    }
  };

  const handleApproveRole = async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user && !confirm(t("admin.users.confirmApproveRole", { email: user.email, role: user.requested_role }))) return;
    try {
      await api.post(`/admin/users/${userId}/approve-role`, {});
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: (u.requested_role || u.role) as UserRole, requested_role: null } : u)));
      toast.success(t("admin.users.success.roleApproved"));
    } catch {
      toast.error(t("admin.users.errors.approveError"));
    }
  };

  const handleRejectRole = async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user && !confirm(t("admin.users.confirmRejectRole", { email: user.email }))) return;
    try {
      await api.post(`/admin/users/${userId}/reject-role`, {});
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, requested_role: null } : u)));
      toast.success(t("admin.users.success.roleRejected"));
    } catch {
      toast.error(t("admin.users.errors.rejectError"));
    }
  };

  const handleDelete = async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!confirm(t("admin.users.confirmDelete", { email: user?.email ?? "" }))) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success(t("admin.users.success.deleted"));
    } catch {
      toast.error(t("admin.users.errors.deleteError"));
    }
  };

  /* ── Create user ────────────────────────────────────── */
  const handleCreate = async () => {
    if (!createForm.email) { toast.error(t("admin.users.errors.emailRequired")); return; }
    if (!createForm.password || createForm.password.length < 6) { toast.error(t("admin.users.errors.passwordMinLength")); return; }
    if (createForm.password !== createForm.confirmPassword) { toast.error(t("admin.users.errors.passwordMismatch")); return; }

    setCreating(true);
    try {
      const res = await api.post<{ data: Profile }>("/admin/create-admin", {
        email: createForm.email,
        password: createForm.password,
        display_name: createForm.display_name || createForm.email.split("@")[0],
      });
      const newUser = res.data;
      if (newUser?.id) {
        // If role differs from default "admin", update it
        if (createForm.role !== "admin" && createForm.role !== (newUser.role as string)) {
          await api.put(`/admin/users/${newUser.id}/role`, { user_id: newUser.id, new_role: createForm.role });
          newUser.role = createForm.role as UserRole;
        }
        setUsers((prev) => [newUser, ...prev]);
      }
      toast.success(t("admin.users.success.created"));
      setCreateOpen(false);
      setCreateForm({ email: "", password: "", confirmPassword: "", display_name: "", role: "student" });
    } catch {
      toast.error(t("admin.users.errors.createError"));
    } finally {
      setCreating(false);
    }
  };

  /* ── Edit user ──────────────────────────────────────── */
  const openEdit = (u: Profile) => {
    setEditUser(u);
    setEditForm({ display_name: u.display_name || "", phone: u.phone || "", role: u.role });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      // Change role if different
      if (editForm.role !== editUser.role) {
        await api.put(`/admin/users/${editUser.id}/role`, { user_id: editUser.id, new_role: editForm.role });
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUser.id
            ? { ...u, display_name: editForm.display_name || u.display_name, phone: editForm.phone || u.phone, role: editForm.role as UserRole }
            : u
        )
      );
      toast.success(t("admin.users.success.updated"));
      setEditOpen(false);
    } catch {
      toast.error(t("admin.users.errors.updateError"));
    } finally {
      setSaving(false);
    }
  };

  /* ── Loading ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">{t("admin.users.loading")}</p>
        </div>
      </div>
    );
  }

  const pendingCount = users.filter((u) => u.requested_role).length;

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.users.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("admin.users.description")}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition shadow-sm"
        >
          <UserPlus size={18} />
          {t("admin.users.create.button")}
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Shield size={18} className="text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              <p className="text-xs text-gray-500">{t("admin.users.table.users", { defaultValue: "Usuarios" })}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg"><BadgeCheck size={18} className="text-emerald-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.filter((u) => u.is_verified).length}</p>
              <p className="text-xs text-gray-500">{t("admin.users.status.verified")}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg"><Clock size={18} className="text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
              <p className="text-xs text-gray-500">{t("admin.users.filters.pendingRequests")}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-50 rounded-lg"><ShieldCheck size={18} className="text-violet-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.filter((u) => u.role === "admin" || u.role === "super_admin").length}</p>
              <p className="text-xs text-gray-500">Admins</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            placeholder={t("admin.users.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition cursor-pointer"
          >
            <option value="all">{t("admin.users.filters.allRoles")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r} className="capitalize">{r.replace("_", " ")}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("admin.users.table.name")}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("admin.users.table.email")}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("admin.users.table.role")}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("admin.users.table.status")}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("admin.users.table.createdAt")}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("admin.users.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">{t("admin.users.table.noUsers")}</td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Name + avatar */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                          {(u.display_name || u.email || "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{u.display_name || "—"}</span>
                      </div>
                    </td>
                    {/* Email */}
                    <td className="px-5 py-3.5 text-sm text-gray-500">{u.email}</td>
                    {/* Role badge */}
                    <td className="px-5 py-3.5">
                      <RoleBadge role={u.role} />
                    </td>
                    {/* Status + pending request */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.is_verified ? "text-emerald-600" : "text-gray-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_verified ? "bg-emerald-400" : "bg-gray-300"}`} />
                          {u.is_verified ? t("admin.users.status.verified") : t("admin.users.filters.notVerified")}
                        </span>
                        {u.requested_role && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-amber-600 font-medium">{t("admin.users.pendingRole", { role: u.requested_role.replace("_", " ") })}</span>
                            <button onClick={() => handleApproveRole(u.id)} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded transition" title={t("admin.users.actions.approveRole")}>
                              <Check size={13} />
                            </button>
                            <button onClick={() => handleRejectRole(u.id)} className="p-0.5 text-red-500 hover:bg-red-50 rounded transition" title={t("admin.users.actions.rejectRole")}>
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Date */}
                    <td className="px-5 py-3.5 text-sm text-gray-400">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {/* Hide edit/delete for super_admin unless caller is super_admin */}
                        {(u.role !== "super_admin" || me?.role === "super_admin") && (
                          <>
                            <button onClick={() => openEdit(u)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title={t("admin.users.actions.edit")}>
                              <Pencil size={15} />
                            </button>
                            {/* Prevent admin from deleting other admins */}
                            {(u.role !== "admin" || me?.role === "super_admin") && u.id !== me?.id && (
                              <button onClick={() => handleDelete(u.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title={t("admin.users.actions.delete")}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
          {t("admin.users.table.showing")} <span className="font-medium text-gray-600">{filtered.length}</span> {t("admin.users.table.of")} <span className="font-medium text-gray-600">{users.length}</span> {t("admin.users.table.users")}
        </div>
      </div>

      {/* ── Create User Modal ─────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.users.create.title")}</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.email")} *</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={createForm.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.displayName")}</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={createForm.display_name}
              onChange={(e) => setCreateForm((p) => ({ ...p, display_name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.password")} *</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">{t("admin.users.form.passwordMinLength")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.confirmPassword")} *</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.role")}</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 capitalize"
              value={createForm.role}
              onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r} className="capitalize">{r.replace("_", " ")}</option>
              ))}
            </select>
            {createForm.role === "admin" && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <Shield size={12} /> {t("admin.users.warnings.adminRole")}
              </p>
            )}
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2">
          <button
            onClick={() => setCreateOpen(false)}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            {t("admin.users.cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            {creating ? t("admin.users.creating") : t("admin.users.create.button")}
          </button>
        </div>
      </Modal>

      {/* ── Edit User Modal ───────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.users.edit.title")}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{editUser?.email}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.displayName")}</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={editForm.display_name}
              onChange={(e) => setEditForm((p) => ({ ...p, display_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.phone")}</label>
            <input
              type="tel"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={editForm.phone}
              onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.role")}</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 capitalize"
              value={editForm.role}
              onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
              disabled={editUser?.role === "super_admin"}
            >
              {editUser?.role === "super_admin"
                ? <option value="super_admin" className="capitalize">super admin</option>
                : allowedRoles.map((r) => (
                    <option key={r} value={r} className="capitalize">{r.replace("_", " ")}</option>
                  ))
              }
            </select>
            {editUser && editForm.role !== editUser.role && editForm.role === "admin" && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <Shield size={12} /> {t("admin.users.warnings.roleChange")}
              </p>
            )}
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2">
          <button
            onClick={() => setEditOpen(false)}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            {t("admin.users.cancel")}
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={saving}
            className="px-5 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? t("admin.users.saving") : t("admin.users.save")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
