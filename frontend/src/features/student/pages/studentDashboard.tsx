import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import toast from "react-hot-toast";
import {
  BookOpen,
  Award,
  Clock,
  TrendingUp,
  ArrowRight,
  Sparkles,
  FileText,
  ClipboardCheck,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type {
  MateriaCalificacionEstudianteResponse,
  Progreso,
  TrabajoConEstadoEntrega,
  PruebaConLeccion,
} from "@/shared/types";
import { createStudentGradesStream, getStudentDashboardStats } from "@/features/student/services/dashboard";

export default function StudentDashboard({ highContrast = false }: { highContrast?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [progresos, setProgresos] = useState<Progreso[]>([]);
  const [totalContenidos, setTotalContenidos] = useState(0);
  const [contenidosCompletados, setContenidosCompletados] = useState(0);
  const [totalMaterias, setTotalMaterias] = useState(0);
  const [pendingTrabajos, setPendingTrabajos] = useState(0);
  const [trabajosEntregados, setTrabajosEntregados] = useState(0);
  const [trabajosCalificados, setTrabajosCalificados] = useState(0);
  const [examenesPendientes, setExamenesPendientes] = useState(0);
  const [examenesCompletados, setExamenesCompletados] = useState(0);
  const [materiaCalificaciones, setMateriaCalificaciones] = useState<MateriaCalificacionEstudianteResponse[]>([]);
  const [materiasAprobadas, setMateriasAprobadas] = useState(0);
  const [materiasReprobadas, setMateriasReprobadas] = useState(0);
  const [materiasNoCompletadas, setMateriasNoCompletadas] = useState(0);
  const [assignedPruebas, setAssignedPruebas] = useState<PruebaConLeccion[]>([]);
  const [misTrabajos, setMisTrabajos] = useState<TrabajoConEstadoEntrega[]>([]);
  const [promedioGeneral, setPromedioGeneral] = useState(0);
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async (silent = false) => {
      if (!mounted) return;
      if (!silent) setLoading(true);

      try {
        const me = await getMe();
        if (!me) {
          navigate("/login");
          return;
        }
        if (!mounted) return;

        setProfile(me);
        const stats = await getStudentDashboardStats();
        if (!mounted) return;

        setProgresos(stats.progresos);
        setTotalContenidos(stats.totalContenidos);
        setContenidosCompletados(stats.contenidosCompletados);
        setTotalMaterias(stats.totalMaterias);
        setPendingTrabajos(stats.trabajosPendientes);
        setTrabajosEntregados(stats.trabajosEntregados);
        setTrabajosCalificados(stats.trabajosCalificados);
        setExamenesPendientes(stats.examenesPendientes);
        setExamenesCompletados(stats.examenesCompletados);
        setMateriaCalificaciones(stats.materiaCalificaciones);
        setMateriasAprobadas(stats.materiasAprobadas);
        setMateriasReprobadas(stats.materiasReprobadas);
        setMateriasNoCompletadas(stats.materiasNoCompletadas);
        setAssignedPruebas(stats.examenes);
        setMisTrabajos(stats.trabajos);
        setPromedioGeneral(stats.promedioGeneral);
      } catch (err) {
        console.error("Error loading dashboard", err);
        if (!silent) {
          toast.error(t("dashboard.loadError", { defaultValue: "Error al cargar el panel" }));
        }
      } finally {
        if (!silent && mounted) setLoading(false);
      }
    };

    void loadDashboard();

    const closeStream = createStudentGradesStream({
      onOpen: () => mounted && setStreamConnected(true),
      onError: () => mounted && setStreamConnected(false),
      onGradeEvent: () => {
        void loadDashboard(true);
      },
    });

    const fallbackPoll = window.setInterval(() => {
      void loadDashboard(true);
    }, 60000);

    return () => {
      mounted = false;
      closeStream();
      window.clearInterval(fallbackPoll);
    };
  }, [navigate, t]);

  const pendingContents = Math.max(0, totalContenidos - contenidosCompletados);

  const lastVisited = progresos.reduce((best: Progreso | null, curr) => {
    if (!curr.updated_at) return best;
    if (!best) return curr;
    return new Date(curr.updated_at) > new Date(best.updated_at || "") ? curr : best;
  }, null);

  const statCards = [
    {
      label: t("student.dashboard.cards.completedContents", { defaultValue: "Contenidos completados" }),
      value: contenidosCompletados,
      icon: Award,
      from: "from-emerald-500",
      to: "to-teal-500",
    },
    {
      label: t("student.dashboard.cards.pendingContents", { defaultValue: "Contenidos pendientes" }),
      value: pendingContents,
      icon: Clock,
      from: "from-amber-500",
      to: "to-orange-500",
    },
    {
      label: t("student.dashboard.cards.pendingExams", { defaultValue: "Exámenes pendientes" }),
      value: examenesPendientes,
      icon: FileText,
      from: "from-fuchsia-500",
      to: "to-pink-500",
    },
    {
      label: t("student.dashboard.cards.pendingAssignments", { defaultValue: "Tareas pendientes" }),
      value: pendingTrabajos,
      icon: BookOpen,
      from: "from-sky-500",
      to: "to-cyan-500",
    },
    {
      label: t("student.dashboard.cards.approvedSubjects", { defaultValue: "Materias aprobadas" }),
      value: materiasAprobadas,
      icon: TrendingUp,
      from: "from-green-500",
      to: "to-emerald-500",
    },
  ];

  const materiasChartData = materiaCalificaciones
    .slice()
    .sort((a, b) => b.nota_final - a.nota_final)
    .map((item) => ({
      materia: item.materia_nombre.length > 14 ? `${item.materia_nombre.slice(0, 14)}...` : item.materia_nombre,
      nota: Number(item.nota_final.toFixed(2)),
    }));

  const estadoData = [
    { name: t("student.dashboard.status.approved", { defaultValue: "Aprobadas" }), value: materiasAprobadas, color: "#16a34a" },
    { name: t("student.dashboard.status.failed", { defaultValue: "Reprobadas" }), value: materiasReprobadas, color: "#dc2626" },
    {
      name: t("student.dashboard.status.notCompleted", { defaultValue: "No completadas" }),
      value: materiasNoCompletadas,
      color: "#d97706",
    },
  ];

  const trabajosPreview = useMemo(() => misTrabajos.slice(0, 5), [misTrabajos]);

  return (
    <main className={`max-w-6xl mx-auto p-4 ${highContrast ? "text-yellow-300" : "text-gray-900"}`}>
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className={`relative overflow-hidden rounded-2xl p-8 mb-8 shadow-xl ${highContrast ? "bg-black border border-yellow-300 text-yellow-300" : "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 text-white"}`}>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className={`text-sm font-medium mb-1 ${highContrast ? "text-yellow-200" : "text-white/70"}`}>
                  {t("student.dashboard.welcome", { defaultValue: "Hola" })}
                </p>
                <h1 className="text-3xl font-bold">{profile?.display_name || profile?.first_name || "Estudiante"}</h1>
                <p className={`text-sm mt-1 ${highContrast ? "text-yellow-200" : "text-white/60"}`}>
                  {t("student.dashboard.academicPanel", { defaultValue: "Panel académico de Contenidos, Pruebas y Tareas" })}
                </p>
              </div>
              <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 ${highContrast ? "bg-yellow-900/30 border border-yellow-500" : "bg-white/10 backdrop-blur-sm border border-white/10"}`}>
                <div className="text-center">
                  <p className="text-3xl font-bold">{promedioGeneral.toFixed(2)}</p>
                  <p className={`text-xs ${highContrast ? "text-yellow-200" : "text-white/60"}`}>
                    {t("student.dashboard.generalAverage", { defaultValue: "Promedio general /10" })}
                  </p>
                </div>
                <RefreshCw size={16} className={`${streamConnected ? "opacity-100" : "opacity-60 animate-spin"}`} />
                <div className={`text-[10px] ${highContrast ? "text-yellow-200" : "text-white/70"}`}>
                  {streamConnected
                    ? t("student.dashboard.realtime.active", { defaultValue: "Tiempo real activo" })
                    : t("student.dashboard.realtime.reconnecting", { defaultValue: "Reconectando..." })}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {statCards.map((card) => (
              <div key={card.label} className={`group rounded-2xl shadow-md p-5 flex items-center gap-4 hover:shadow-xl transition-all duration-300 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
                <div className={`p-3 rounded-xl bg-gradient-to-br ${card.from} ${card.to} shadow-lg`}>
                  <card.icon size={22} className="text-white" />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{card.value}</p>
                  <p className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{card.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className={`rounded-2xl shadow-md p-6 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
                <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>
                  <Clock size={18} className={highContrast ? "text-yellow-400" : "text-indigo-500"} />
                  {t("student.dashboard.sections.recentContent", { defaultValue: "Actividad reciente de contenidos" })}
                </h3>
                {lastVisited ? (
                  <div className={`p-5 rounded-xl ${highContrast ? "bg-yellow-900/20 border border-yellow-500" : "bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100"}`}>
                    <div className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                      {t("student.dashboard.lastAccess", { defaultValue: "Último acceso" })}: {new Date(lastVisited.updated_at || "").toLocaleString()}
                    </div>
                    <div className={`text-sm mt-1 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                      {t("student.dashboard.lastScore", { defaultValue: "Último puntaje" })}: <span className={`font-semibold ${highContrast ? "text-yellow-200" : "text-indigo-600"}`}>{lastVisited.puntaje ?? "-"}</span>
                    </div>
                    <button onClick={() => navigate(`/lesson/${lastVisited.leccion_id}`)} className={`group mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium ${highContrast ? "bg-yellow-300 text-black" : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white"}`}>
                      {t("student.dashboard.continueContent", { defaultValue: "Continuar contenido" })}
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                ) : (
                  <div className={`py-4 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                    {t("student.dashboard.noContentStarted", { defaultValue: "Aún no has iniciado contenido." })}
                  </div>
                )}
              </div>
            </div>

            <aside className={`rounded-2xl shadow-md p-6 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
              <h3 className={`font-bold text-lg mb-4 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>
                {t("student.dashboard.sections.quickSummary", { defaultValue: "Resumen rápido" })}
              </h3>
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-3 rounded-xl ${highContrast ? "bg-yellow-900/20" : "bg-gray-50"}`}><span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>{t("student.dashboard.summary.availableContents", { defaultValue: "Contenidos disponibles" })}</span><span className={`font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{totalContenidos}</span></div>
                <div className={`flex items-center justify-between p-3 rounded-xl ${highContrast ? "bg-yellow-900/20" : "bg-gray-50"}`}><span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>{t("student.dashboard.summary.completedExams", { defaultValue: "Exámenes completados" })}</span><span className={`font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{examenesCompletados}</span></div>
                <div className={`flex items-center justify-between p-3 rounded-xl ${highContrast ? "bg-yellow-900/20" : "bg-gray-50"}`}><span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>{t("student.dashboard.summary.submittedAssignments", { defaultValue: "Tareas entregadas" })}</span><span className={`font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{trabajosEntregados}</span></div>
                <div className={`flex items-center justify-between p-3 rounded-xl ${highContrast ? "bg-yellow-900/20" : "bg-gray-50"}`}><span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>{t("student.dashboard.summary.gradedAssignments", { defaultValue: "Tareas calificadas" })}</span><span className={`font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{trabajosCalificados}</span></div>
                <div className={`flex items-center justify-between p-3 rounded-xl ${highContrast ? "bg-yellow-900/20" : "bg-gray-50"}`}><span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>{t("student.dashboard.enrolledSubjects", { defaultValue: "Materias matriculadas" })}</span><span className={`font-bold ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{totalMaterias}</span></div>
              </div>
            </aside>
          </div>

          {(materiaCalificaciones.length > 0 || progresos.length > 0) && (
            <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={`rounded-2xl shadow-md p-6 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
                <h3 className={`font-bold text-lg mb-3 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{t("student.dashboard.sections.performanceBySubject", { defaultValue: "Rendimiento por materia (/10)" })}</h3>
                <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={materiasChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="materia" /><YAxis domain={[0, 10]} /><Tooltip /><Bar dataKey="nota" fill="#2563eb" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
              </div>

              <div className={`rounded-2xl shadow-md p-6 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
                <h3 className={`font-bold text-lg mb-3 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{t("student.dashboard.sections.subjectStatus", { defaultValue: "Estado de materias" })}</h3>
                <div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={estadoData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label>{estadoData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
              </div>
            </section>
          )}

          {materiaCalificaciones.length > 0 && (
            <section className={`mt-8 rounded-2xl shadow-md p-6 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
              <h3 className={`font-bold text-lg mb-4 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{t("student.dashboard.sections.gradesBySubject", { defaultValue: "Calificaciones por materia" })}</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className={highContrast ? "text-yellow-300 border-b border-yellow-700" : "text-slate-700 border-b"}>
                    <tr>
                      <th className="text-left py-2 pr-3">{t("student.dashboard.table.subject", { defaultValue: "Materia" })}</th>
                      <th className="text-left py-2 pr-3">{t("student.dashboard.table.contents", { defaultValue: "Contenidos" })}</th>
                      <th className="text-left py-2 pr-3">{t("student.dashboard.table.exams", { defaultValue: "Exámenes" })}</th>
                      <th className="text-left py-2 pr-3">{t("student.dashboard.table.assignments", { defaultValue: "Tareas" })}</th>
                      <th className="text-left py-2 pr-3">{t("student.dashboard.table.finalGrade", { defaultValue: "Nota final" })}</th>
                      <th className="text-left py-2 pr-3">{t("student.dashboard.table.status", { defaultValue: "Estado" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiaCalificaciones.map((item) => (
                      <tr key={item.materia_id} className={highContrast ? "border-b border-yellow-900/40" : "border-b border-slate-100"}>
                        <td className="py-2 pr-3 font-medium">{item.materia_nombre}</td>
                        <td className="py-2 pr-3">{item.promedio_contenidos_10 != null ? item.promedio_contenidos_10.toFixed(2) : "-"}</td>
                        <td className="py-2 pr-3">{(item.promedio_pruebas_10 ?? item.promedio_lecciones_10) != null ? (item.promedio_pruebas_10 ?? item.promedio_lecciones_10)!.toFixed(2) : "-"}</td>
                        <td className="py-2 pr-3">{item.promedio_trabajos_10 != null ? item.promedio_trabajos_10.toFixed(2) : "-"}</td>
                        <td className="py-2 pr-3">{item.nota_final.toFixed(2)} / {item.puntaje_total.toFixed(2)}</td>
                        <td className="py-2 pr-3">
                          {item.estado_final === "aprobada"
                            ? t("student.dashboard.status.approved", { defaultValue: "Aprobada" })
                            : item.estado_final === "reprobada"
                              ? t("student.dashboard.status.failed", { defaultValue: "Reprobada" })
                              : item.estado_final === "materia_no_completada"
                                ? t("student.dashboard.status.notCompleted", { defaultValue: "Materia no completada" })
                                : t("student.dashboard.status.ungraded", { defaultValue: "Sin calificar" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className={`mt-8 rounded-2xl shadow-md p-6 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
            <h3 className={`font-bold text-lg mb-4 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>
              {t("student.dashboard.sections.assignedExams", { defaultValue: "Exámenes asignados" })}
            </h3>
            {assignedPruebas.length === 0 ? (
              <div className={`py-6 ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                {t("student.dashboard.empty.noAssignedExams", { defaultValue: "No tienes exámenes asignados." })}
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className={highContrast ? "text-yellow-300 border-b border-yellow-700" : "text-slate-700 border-b"}><tr><th className="text-left py-2 pr-3">{t("student.dashboard.examTable.exam", { defaultValue: "Examen" })}</th><th className="text-left py-2 pr-3">{t("student.dashboard.examTable.subject", { defaultValue: "Materia" })}</th><th className="text-left py-2 pr-3">{t("student.dashboard.examTable.action", { defaultValue: "Acción" })}</th></tr></thead>
                  <tbody>
                    {assignedPruebas.map((prueba) => (
                      <tr key={prueba.id} className={highContrast ? "border-b border-yellow-900/40" : "border-b border-slate-100"}>
                        <td className="py-2 pr-3 font-medium">{prueba.titulo}</td>
                        <td className="py-2 pr-3">{prueba.materia_nombre || t("student.dashboard.examTable.noSubject", { defaultValue: "-" })}</td>
                        <td className="py-2 pr-3"><button type="button" onClick={() => navigate(`/prueba/${prueba.id}`)} className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${highContrast ? "bg-yellow-300 text-black" : "bg-indigo-600 text-white"}`}>{t("student.dashboard.examTable.viewExam", { defaultValue: "Ver examen" })}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`mt-8 rounded-2xl shadow-md p-6 ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
            <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}><ClipboardCheck size={18} className={highContrast ? "text-yellow-400" : "text-emerald-600"} />{t("student.dashboard.sections.upcomingAssignments", { defaultValue: "Próximas tareas y entregas" })}</h3>
            {trabajosPreview.length === 0 ? (
              <p className={highContrast ? "text-yellow-300" : "text-gray-500"}>{t("student.dashboard.empty.noAssignments", { defaultValue: "No tienes tareas asignadas." })}</p>
            ) : (
              <div className="space-y-2">
                {trabajosPreview.map((trabajo) => (
                  <div key={trabajo.id} className={`rounded-xl p-3 border ${highContrast ? "border-yellow-700 bg-yellow-900/20" : "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`font-medium ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{trabajo.titulo}</p>
                        <p className={`text-xs ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>
                          {trabajo.fecha_vencimiento
                            ? t("student.dashboard.assignments.dueAt", {
                                defaultValue: "Vence: {{date}}",
                                date: new Date(trabajo.fecha_vencimiento).toLocaleString(),
                              })
                            : t("student.dashboard.assignments.noDueDate", { defaultValue: "Sin fecha de vencimiento" })}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${trabajo.entrega_estado === "calificada" ? "bg-emerald-100 text-emerald-700" : trabajo.entregada ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                        {trabajo.entrega_estado === "calificada"
                          ? t("student.dashboard.assignments.status.graded", { defaultValue: "Calificado" })
                          : trabajo.entregada
                            ? t("student.dashboard.assignments.status.submitted", { defaultValue: "Entregado" })
                            : t("student.dashboard.assignments.status.pending", { defaultValue: "Pendiente" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {progresos.length === 0 && (
            <div className={`mt-8 rounded-2xl shadow-md p-10 text-center ${highContrast ? "bg-black border border-yellow-500" : "bg-white"}`}>
              <div className={`inline-flex p-4 rounded-2xl mb-4 ${highContrast ? "bg-yellow-900/20" : "bg-gradient-to-br from-indigo-100 to-violet-100"}`}><Sparkles size={40} className={highContrast ? "text-yellow-300" : "text-indigo-500"} /></div>
              <h3 className={`text-xl font-bold mb-2 ${highContrast ? "text-yellow-200" : "text-gray-900"}`}>{t("student.dashboard.noFollowedContent", { defaultValue: "No has iniciado contenidos aún" })}</h3>
              <p className={`text-sm mb-6 max-w-md mx-auto ${highContrast ? "text-yellow-300" : "text-gray-500"}`}>{t("student.dashboard.noFollowedContentDesc", { defaultValue: "Explora los contenidos disponibles para comenzar a aprender." })}</p>
              <button onClick={() => navigate("/contents")} className={`group inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold ${highContrast ? "bg-yellow-300 text-black" : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white"}`}>
                {t("student.dashboard.browseContents", { defaultValue: "Explorar contenidos" })}
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
