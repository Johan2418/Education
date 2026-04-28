import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe, type AuthUser } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import {
  Loader2, Trash2, Check, X, Search, Pencil,
  UserPlus, ChevronDown, Shield, ShieldCheck, BadgeCheck, Clock, AlertTriangle,
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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_HELP: Record<UserRole, string> = {
  student: "Puede acceder al contenido y completar actividades.",
  teacher: "Puede gestionar materias, lecciones y seguimiento academico.",
  resource_manager: "Puede administrar modelos y recursos compartidos.",
  admin: "Puede operar usuarios, cursos y configuracion administrativa.",
  super_admin: "Control total del sistema y de permisos administrativos.",
};

function roleLabel(role: string): string {
  return role.replace("_", " ");
}

function RoleBadge({ role }: { role: string }) {
  const fallback = { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
  const s = ROLE_STYLES[role] ?? fallback;
  const label = roleLabel(role);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/* ── Modal wrapper ──────────────────────────────────────── */
function Modal({
  open,
  onClose,
  children,
  panelClassName = "max-w-lg",
  closeOnOverlay = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  panelClassName?: string;
  closeOnOverlay?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeOnOverlay ? onClose : undefined}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col ${panelClassName}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

type ConfirmIntent = "danger" | "warning";

type ConfirmDialogState = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  intent: ConfirmIntent;
  action: null | (() => Promise<void>);
};

/* ── Main component ─────────────────────────────────────── */
export default function AdminUsers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [me, setMe] = useState<AuthUser | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{ email: string; password: string; confirmPassword: string; display_name: string; role: UserRole }>({
    email: "",
    password: "",
    confirmPassword: "",
    display_name: "",
    role: "student",
  });
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<{ display_name: string; phone: string; role: UserRole }>({
    display_name: "",
    phone: "",
    role: "student",
  });
  const [saving, setSaving] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "",
    intent: "warning",
    action: null,
  });

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

  const pendingRequests = useMemo(() => users.filter((u) => Boolean(u.requested_role)), [users]);

  const createValidation = useMemo(() => {
    const normalizedEmail = createForm.email.trim().toLowerCase();
    const emailValid = EMAIL_REGEX.test(normalizedEmail);
    const passwordValid = createForm.password.length >= 6;
    const passwordsMatch = createForm.password === createForm.confirmPassword;
    return {
      normalizedEmail,
      emailValid,
      passwordValid,
      passwordsMatch,
      isValid: emailValid && passwordValid && passwordsMatch,
    };
  }, [createForm.email, createForm.password, createForm.confirmPassword]);

  /* ── Filtered list ──────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        (u.display_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchPending = !pendingOnly || Boolean(u.requested_role);
      return matchSearch && matchRole && matchPending;
    });
  }, [users, search, roleFilter, pendingOnly]);

  /* ── Handlers ───────────────────────────────────────── */
  const openConfirmDialog = useCallback((payload: Omit<ConfirmDialogState, "open">) => {
    setConfirmDialog({ ...payload, open: true });
  }, []);

  const closeConfirmDialog = useCallback(() => {
    if (confirmLoading) return;
    setConfirmDialog((prev) => ({ ...prev, open: false, action: null }));
  }, [confirmLoading]);

  const runConfirmedAction = async () => {
    if (!confirmDialog.action) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.action();
      setConfirmDialog((prev) => ({ ...prev, open: false, action: null }));
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleApproveRole = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/approve-role`, {});
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: (u.requested_role || u.role) as UserRole, requested_role: null } : u)));
      toast.success(t("admin.users.success.roleApproved"));
    } catch {
      toast.error(t("admin.users.errors.approveError"));
    }
  };

  const handleRejectRole = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/reject-role`, {});
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, requested_role: null } : u)));
      toast.success(t("admin.users.success.roleRejected"));
    } catch {
      toast.error(t("admin.users.errors.rejectError"));
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success(t("admin.users.success.deleted"));
    } catch {
      toast.error(t("admin.users.errors.deleteError"));
    }
  };

  const requestApproveRole = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user || !user.requested_role) return;
    openConfirmDialog({
      title: "Aprobar solicitud de rol",
      description: `${user.email} solicito el rol ${roleLabel(user.requested_role)}.`,
      confirmLabel: "Aprobar rol",
      intent: "warning",
      action: () => handleApproveRole(userId),
    });
  };

  const requestRejectRole = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    openConfirmDialog({
      title: "Rechazar solicitud de rol",
      description: `Se eliminara la solicitud pendiente de ${user.email}.`,
      confirmLabel: "Rechazar solicitud",
      intent: "warning",
      action: () => handleRejectRole(userId),
    });
  };

  const requestDeleteUser = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    openConfirmDialog({
      title: "Eliminar usuario",
      description: `Esta accion eliminara a ${user.email}. No se puede deshacer.`,
      confirmLabel: "Eliminar usuario",
      intent: "danger",
      action: () => handleDelete(userId),
    });
  };

  /* ── Create user ────────────────────────────────────── */
  const handleCreate = async () => {
    if (!createValidation.normalizedEmail) { toast.error(t("admin.users.errors.emailRequired")); return; }
    if (!createValidation.emailValid) { toast.error("Ingresa un correo valido"); return; }
    if (!createValidation.passwordValid) { toast.error(t("admin.users.errors.passwordMinLength")); return; }
    if (!createValidation.passwordsMatch) { toast.error(t("admin.users.errors.passwordMismatch")); return; }

    setCreating(true);
    try {
      const res = await api.post<{ data: Profile }>("/admin/create-admin", {
        email: createValidation.normalizedEmail,
        password: createForm.password,
        display_name: createForm.display_name || createValidation.normalizedEmail.split("@")[0],
      });
      const newUser = res.data;
      if (newUser?.id) {
        // If role differs from default "admin", update it
        if (createForm.role !== "admin" && createForm.role !== newUser.role) {
          await api.put(`/admin/users/${newUser.id}/role`, { user_id: newUser.id, new_role: createForm.role });
          newUser.role = createForm.role;
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

  const executeSaveEdit = async () => {
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
            ? { ...u, display_name: editForm.display_name || u.display_name, phone: editForm.phone || u.phone, role: editForm.role }
            : u
        )
      );
      toast.success(t("admin.users.success.updated"));
      setEditOpen(false);
      setEditUser(null);
    } catch {
      toast.error(t("admin.users.errors.updateError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    if (editForm.role !== editUser.role) {
      openConfirmDialog({
        title: "Confirmar cambio de rol",
        description: `Vas a cambiar el rol de ${editUser.email} a ${roleLabel(editForm.role)}.`,
        confirmLabel: "Guardar cambios",
        intent: "warning",
        action: executeSaveEdit,
      });
      return;
    }
    await executeSaveEdit();
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

  const pendingCount = pendingRequests.length;

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

      {pendingRequests.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-900">Solicitudes pendientes de rol</p>
              <p className="text-xs text-amber-800 mt-1">Revisa primero estas solicitudes para mantener permisos al dia.</p>
            </div>
            <button
              type="button"
              onClick={() => setPendingOnly((prev) => !prev)}
              className="self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              {pendingOnly ? "Ver todos" : "Ver solo pendientes"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pendingRequests.slice(0, 6).map((u) => (
              <div key={u.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-gray-900 truncate">{u.display_name || u.email}</p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
                <p className="text-xs text-amber-700 mt-1">
                  Solicita: <span className="font-semibold capitalize">{roleLabel(u.requested_role || "")}</span>
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => requestApproveRole(u.id)} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700">
                    Aprobar
                  </button>
                  <button onClick={() => requestRejectRole(u.id)} className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
              <option key={r} value={r} className="capitalize">{roleLabel(r)}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Solo pendientes
        </label>
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
                  <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${u.requested_role ? "bg-amber-50/40" : ""}`}>
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
                            <span className="text-xs text-amber-600 font-medium">{t("admin.users.pendingRole", { role: roleLabel(u.requested_role) })}</span>
                            <button onClick={() => requestApproveRole(u.id)} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded transition" title={t("admin.users.actions.approveRole")}>
                              <Check size={13} />
                            </button>
                            <button onClick={() => requestRejectRole(u.id)} className="p-0.5 text-red-500 hover:bg-red-50 rounded transition" title={t("admin.users.actions.rejectRole")}>
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
                              <button onClick={() => requestDeleteUser(u.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title={t("admin.users.actions.delete")}>
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
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} panelClassName="max-w-2xl">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.users.create.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">Crea la cuenta y define el rol inicial segun el alcance operativo.</p>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.email")} *</label>
            <input
              type="email"
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${
                createForm.email.trim() && !createValidation.emailValid ? "border-red-300" : "border-gray-200"
              }`}
              value={createForm.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
            />
            {createForm.email.trim() && !createValidation.emailValid && (
              <p className="mt-1 text-xs text-red-600">El formato del correo no es valido.</p>
            )}
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
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${
                  createForm.password && !createValidation.passwordValid ? "border-red-300" : "border-gray-200"
                }`}
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">{t("admin.users.form.passwordMinLength")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.confirmPassword")} *</label>
              <input
                type="password"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${
                  createForm.confirmPassword && !createValidation.passwordsMatch ? "border-red-300" : "border-gray-200"
                }`}
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              />
              {createForm.confirmPassword && !createValidation.passwordsMatch && (
                <p className="mt-1 text-xs text-red-600">Las contrasenas no coinciden.</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("admin.users.form.role")}</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 capitalize"
              value={createForm.role}
              onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value as UserRole }))}
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r} className="capitalize">{roleLabel(r)}</option>
              ))}
            </select>
            {createForm.role === "admin" && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <Shield size={12} /> {t("admin.users.warnings.adminRole")}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Resumen del rol</p>
            <p className="text-sm font-medium text-blue-900 mt-1 capitalize">{roleLabel(createForm.role)}</p>
            <p className="text-xs text-blue-800 mt-1">{ROLE_HELP[createForm.role]}</p>
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
            disabled={creating || !createValidation.isValid}
            className="px-5 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            {creating ? t("admin.users.creating") : t("admin.users.create.button")}
          </button>
        </div>
      </Modal>

      {/* ── Edit User Modal ───────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} panelClassName="max-w-2xl">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.users.edit.title")}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{editUser?.email}</p>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
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
              onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value as UserRole }))}
              disabled={editUser?.role === "super_admin"}
            >
              {editUser?.role === "super_admin"
                ? <option value="super_admin" className="capitalize">super admin</option>
                : allowedRoles.map((r) => (
                    <option key={r} value={r} className="capitalize">{roleLabel(r)}</option>
                  ))
              }
            </select>
            {editUser && editForm.role !== editUser.role && editForm.role === "admin" && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <Shield size={12} /> {t("admin.users.warnings.roleChange")}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-600 font-semibold">Impacto del rol</p>
            <p className="text-sm font-medium text-slate-900 mt-1 capitalize">{roleLabel(editForm.role)}</p>
            <p className="text-xs text-slate-700 mt-1">{ROLE_HELP[editForm.role]}</p>
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

      <Modal open={confirmDialog.open} onClose={closeConfirmDialog} panelClassName="max-w-md" closeOnOverlay={!confirmLoading}>
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-full p-2 ${confirmDialog.intent === "danger" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">{confirmDialog.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{confirmDialog.description}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2">
          <button
            onClick={closeConfirmDialog}
            disabled={confirmLoading}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void runConfirmedAction()}
            disabled={confirmLoading}
            className={`px-5 py-2 text-sm text-white rounded-xl transition disabled:opacity-50 inline-flex items-center gap-2 ${
              confirmDialog.intent === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {confirmLoading && <Loader2 size={14} className="animate-spin" />}
            {confirmDialog.confirmLabel}
          </button>
        </div>
      </Modal>
    </div>
  );
}
