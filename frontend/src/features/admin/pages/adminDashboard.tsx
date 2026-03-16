import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { Users, BookOpen, FileText, Shield, Loader2 } from "lucide-react";

export default function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, cursos: 0, modelos: 0, recursos: 0 });

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        const [usersRes, cursosRes, modelosRes, recursosRes] = await Promise.all([
          api.get<{ data: any[] }>("/admin/users").catch(() => ({ data: [] })),
          api.get<{ data: any[] }>("/cursos").catch(() => ({ data: [] })),
          api.get<{ data: any[] }>("/modelos").catch(() => ({ data: [] })),
          api.get<{ data: any[] }>("/recursos").catch(() => ({ data: [] })),
        ]);
        setStats({
          users: usersRes.data?.length ?? 0,
          cursos: cursosRes.data?.length ?? 0,
          modelos: modelosRes.data?.length ?? 0,
          recursos: recursosRes.data?.length ?? 0,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  const cards = [
    { label: t("admin.dashboard.users", { defaultValue: "Usuarios" }), count: stats.users, icon: Users, color: "blue", path: "/admin/users" },
    { label: t("admin.dashboard.cursos", { defaultValue: "Cursos" }), count: stats.cursos, icon: BookOpen, color: "green", path: "/admin/cursos" },
    { label: t("admin.dashboard.modelos", { defaultValue: "Modelos 3D" }), count: stats.modelos, icon: FileText, color: "purple", path: "/admin/modelos" },
    { label: t("admin.dashboard.recursos", { defaultValue: "Recursos" }), count: stats.recursos, icon: Shield, color: "amber", path: "#" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">{t("admin.dashboard.title", { defaultValue: "Panel de Administración" })}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => c.path !== "#" && navigate(c.path)}
            className="bg-white rounded-lg shadow p-5 flex items-center gap-4 hover:shadow-md transition-shadow text-left"
          >
            <div className={`p-3 rounded-lg bg-${c.color}-100`}>
              <c.icon size={24} className={`text-${c.color}-600`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{c.count}</p>
              <p className="text-sm text-gray-500">{c.label}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
