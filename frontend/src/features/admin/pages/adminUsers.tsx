import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { Loader2, Shield, Trash2, Check, X, Search } from "lucide-react";
import type { Profile } from "@/shared/types";

export default function AdminUsers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        const data: Profile[] = await api.get("/admin/users");
        setUsers(data || []);
      } catch {
        toast.error(t("admin.users.loadError", { defaultValue: "Error al cargar usuarios" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole as Profile['role'] } : u)));
      toast.success(t("admin.users.roleChanged", { defaultValue: "Rol actualizado" }));
    } catch {
      toast.error(t("admin.users.roleError", { defaultValue: "Error al cambiar rol" }));
    }
  };

  const handleApproveRole = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/approve-role`, {});
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: (u.requested_role || u.role) as Profile['role'], requested_role: null } : u)));
      toast.success(t("admin.users.approved", { defaultValue: "Solicitud aprobada" }));
    } catch {
      toast.error(t("admin.users.approveError", { defaultValue: "Error al aprobar" }));
    }
  };

  const handleRejectRole = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/reject-role`, {});
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, requested_role: null } : u)));
      toast.success(t("admin.users.rejected", { defaultValue: "Solicitud rechazada" }));
    } catch {
      toast.error(t("admin.users.rejectError", { defaultValue: "Error al rechazar" }));
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm(t("common.confirmDelete", { defaultValue: "¿Estás seguro?" }))) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success(t("admin.users.deleted", { defaultValue: "Usuario eliminado" }));
    } catch {
      toast.error(t("admin.users.deleteError", { defaultValue: "Error al eliminar" }));
    }
  };

  const filtered = users.filter(
    (u) =>
      (u.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.role || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("admin.users.title", { defaultValue: "Gestión de Usuarios" })}</h1>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          placeholder={t("admin.users.searchPlaceholder", { defaultValue: "Buscar usuarios..." })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("admin.users.name", { defaultValue: "Nombre" })}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("admin.users.emailCol", { defaultValue: "Email" })}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("admin.users.roleCol", { defaultValue: "Rol" })}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("admin.users.request", { defaultValue: "Solicitud" })}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">{t("admin.users.actions", { defaultValue: "Acciones" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{u.display_name || "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role || "student"}
                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.requested_role ? (
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600 font-medium capitalize">{u.requested_role}</span>
                      <button onClick={() => handleApproveRole(u.id)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Approve">
                        <Check size={14} />
                      </button>
                      <button onClick={() => handleRejectRole(u.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Reject">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(u.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
