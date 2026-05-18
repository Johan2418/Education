import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarClock, CheckCircle2, Clock3, FileCheck2, Loader2 } from "lucide-react";
import { getMe } from "@/shared/lib/auth";
import { listMisPruebasEstudiante, listMisResultados } from "@/features/pruebas/services/pruebas";
import type { PruebaConLeccion, ResultadoPrueba } from "@/shared/types";

type ResultadoByPrueba = Record<string, ResultadoPrueba | null>;

function examVisibilityStatus(exam: PruebaConLeccion): "activo" | "programado" | "inactivo" {
  if (exam.activa === false) return "inactivo";
  if (exam.fecha_activacion && new Date(exam.fecha_activacion).getTime() > Date.now()) return "programado";
  return "activo";
}

function statusMeta(status: "activo" | "programado" | "inactivo", t: (k: string) => string) {
  if (status === "activo") {
    return {
      label: t("student.exams.status.active"),
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: CheckCircle2,
    };
  }
  if (status === "programado") {
    return {
      label: t("student.exams.status.scheduled"),
      className: "bg-amber-50 text-amber-700 border-amber-200",
      icon: Clock3,
    };
  }
  return {
    label: t("student.exams.status.inactive"),
    className: "bg-slate-100 text-slate-700 border-slate-200",
    icon: CalendarClock,
  };
}

export default function StudentExamenesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [examenes, setExamenes] = useState<PruebaConLeccion[]>([]);
  const [resultados, setResultados] = useState<ResultadoByPrueba>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!cancelled) setLoading(true);
      try {
        const me = await getMe();
        if (!me || me.role !== "student") {
          navigate("/login");
          return;
        }

        const items = (await listMisPruebasEstudiante()) || [];

        if (cancelled) return;
        setExamenes(items);

        const settled = await Promise.all(items.map(async (item) => {
          try {
            const rows = await listMisResultados(item.id);
            const latest = (rows || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
            return [item.id, latest] as const;
          } catch {
            return [item.id, null] as const;
          }
        }));

        if (cancelled) return;
        const next: ResultadoByPrueba = {};
        for (const [id, value] of settled) next[id] = value;
        setResultados(next);
      } catch (err) {
        console.warn("student/examenes: error no bloqueante", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const ordered = useMemo(
    () => [...examenes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [examenes]
  );

  const summary = useMemo(() => {
    const total = ordered.length;
    const active = ordered.filter((e) => examVisibilityStatus(e) === "activo").length;
    const pending = ordered.filter((e) => examVisibilityStatus(e) === "programado").length;
    const solved = ordered.filter((e) => !!resultados[e.id]).length;
    return { total, active, pending, solved };
  }, [ordered, resultados]);

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-5 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">{t("student.exams.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("student.exams.subtitle")}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{t("student.exams.summary.published")}</p><p className="text-xl font-semibold">{summary.total}</p></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">{t("student.exams.summary.active")}</p><p className="text-xl font-semibold text-emerald-700">{summary.active}</p></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">{t("student.exams.summary.scheduled")}</p><p className="text-xl font-semibold text-amber-700">{summary.pending}</p></div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3"><p className="text-xs text-indigo-700">{t("student.exams.summary.solved")}</p><p className="text-xl font-semibold text-indigo-700">{summary.solved}</p></div>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">{t("student.exams.empty")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((exam) => {
            const status = examVisibilityStatus(exam);
            const meta = statusMeta(status, t as (k: string) => string);
            const StatusIcon = meta.icon;
            const resultado = resultados[exam.id];
            const canShowScore = !!resultado && resultado.mostrar_puntaje_estudiante !== false;
            const canResolve = status === "activo";

            return (
              <div key={exam.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 text-lg font-semibold text-slate-900">{exam.titulo}</h2>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                </div>

                <p className="text-sm text-slate-600">{t("student.exams.subject")}: <span className="font-medium text-slate-800">{exam.materia_nombre || t("student.exams.noSubject")}</span></p>

                {exam.fecha_activacion ? (
                  <p className="mt-2 text-xs text-slate-500">{t("student.exams.activation")}: {new Date(exam.fecha_activacion).toLocaleString()}</p>
                ) : null}

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm">
                  {resultado ? (
                    canShowScore
                      ? t("student.exams.resultScore", { score: resultado.puntaje_obtenido.toFixed(2) })
                      : t("student.exams.resultPending")
                  ) : (
                    <span className="text-amber-700">{t("student.exams.unsolved")}</span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{t("student.exams.minimum")}: {exam.puntaje_minimo ?? 0}%</span>
                  <button
                    onClick={() => navigate(`/prueba/${exam.id}`)}
                    disabled={!canResolve}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileCheck2 className="h-4 w-4" />
                    {resultado ? t("student.exams.review") : t("student.exams.solve")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
