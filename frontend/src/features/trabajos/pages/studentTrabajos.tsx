import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import { listMisTrabajos } from "@/features/trabajos/services/trabajos";
import type { Trabajo } from "@/shared/types/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

export default function StudentTrabajos() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || me.role !== "student") {
          navigate("/login");
          return;
        }

        const data = await listMisTrabajos();
        setTrabajos(data);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trabajos.filter((trabajo) => {
      return (
        trabajo.titulo.toLowerCase().includes(q) ||
        (trabajo.descripcion || "").toLowerCase().includes(q) ||
        trabajo.estado.toLowerCase().includes(q)
      );
    });
  }, [search, trabajos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("student.trabajos.title", { defaultValue: "Mis Trabajos" })}</h1>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("student.trabajos.search", { defaultValue: "Buscar trabajos" })}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <ClipboardList size={40} className="mx-auto mb-2 text-gray-300" />
          {t("student.trabajos.empty", { defaultValue: "No tienes trabajos asignados" })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((trabajo) => (
            <button
              key={trabajo.id}
              className="text-left bg-white rounded-lg shadow p-4 border border-gray-100 hover:border-blue-400 transition"
              onClick={() => navigate(`/student/trabajos/${trabajo.id}`)}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-900">{trabajo.titulo}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${trabajo.estado === "cerrado" ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {trabajo.estado}
                </span>
              </div>
              {trabajo.descripcion && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{trabajo.descripcion}</p>}
              {trabajo.fecha_vencimiento && (
                <p className="text-xs text-gray-500 mt-3">
                  {t("student.trabajos.due", { defaultValue: "Vence" })}: {new Date(trabajo.fecha_vencimiento).toLocaleString()}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
