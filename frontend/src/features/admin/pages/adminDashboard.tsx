import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { Users, BookOpen, FileText, Shield, ArrowRight } from "lucide-react";

const cardStyles = [
  { from: "from-indigo-500", to: "to-violet-500" },
  { from: "from-emerald-500", to: "to-teal-500" },
  { from: "from-violet-500", to: "to-purple-500" },
  { from: "from-amber-500", to: "to-orange-500" },
];

export default function AdminDashboard({ highContrast = false }: { highContrast?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, cursos: 0, modelos: 0, recursos: 0 });
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        setDisplayName(me.display_name || "Admin");
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
        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const cards = [
    { label: t("admin.dashboard.users", { defaultValue: "Usuarios" }), count: stats.users, icon: Users, path: "/admin/users" },
    { label: t("admin.dashboard.cursos", { defaultValue: "Cursos" }), count: stats.cursos, icon: BookOpen, path: "/admin/cursos" },
    { label: t("admin.dashboard.modelos", { defaultValue: "Modelos 3D" }), count: stats.modelos, icon: FileText, path: "/admin/modelos" },
    { label: t("admin.dashboard.recursos", { defaultValue: "Recursos" }), count: stats.recursos, icon: Shield, path: "#" },
  ];

  return (
    <div className={`max-w-6xl mx-auto p-4 ${highContrast ? "text-yellow-300" : "text-gray-900"}`}>
      {/* Welcome Banner */}
      <div className={`relative overflow-hidden rounded-2xl p-8 mb-8 shadow-xl animate-fade-in-up ${highContrast ? "bg-black border border-yellow-300 text-yellow-300" : "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 text-white"}`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        <div className="relative">
          <p className={`text-sm font-medium mb-1 ${highContrast ? "text-yellow-200" : "text-white/70"}`}>🛡️ {t("admin.dashboard.adminPanel", { defaultValue: "Panel de Administración" })}</p>
          <h1 className="text-3xl font-bold">{t("admin.dashboard.title", { defaultValue: "Panel de Administración" })}</h1>
          <p className={`text-sm mt-1 ${highContrast ? "text-yellow-200" : "text-white/60"}`}>{t("admin.dashboard.subtitle", { defaultValue: "Gestiona usuarios, cursos y recursos del sistema" })}</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c, idx) => {
          const color = cardStyles[idx % cardStyles.length]!;
          return (
            <button
              key={c.label}
              onClick={() => c.path !== "#" && navigate(c.path)}
              className={`group relative rounded-2xl shadow-md p-6 flex flex-col items-start gap-4 hover:shadow-xl transition-all duration-300 text-left hover:-translate-y-1 active:scale-[0.99] animate-fade-in-up overflow-hidden ${highContrast ? "bg-black border border-yellow-500 hover:bg-yellow-900/20" : "bg-white"} ${c.path === "#" ? "cursor-default" : ""}`}
              style={{ animationDelay: `${(idx + 1) * 100}ms` }}
            >
              {/* Gradient top border */}
              {!highContrast && <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${color.from} ${color.to} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />}

              <div className={`p-3.5 rounded-xl bg-gradient-to-br ${color.from} ${color.to} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <c.icon size={24} className="text-white" />
              </div>
              <div>
                <p className={`text-3xl font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{c.count}</p>
                <p className={`text-sm mt-0.5 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{c.label}</p>
              </div>
              {c.path !== "#" && (
                <ArrowRight size={16} className={`absolute bottom-5 right-5 group-hover:translate-x-1 transition-all duration-200 ${highContrast ? "text-yellow-500" : "text-gray-300 group-hover:text-indigo-500"}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
