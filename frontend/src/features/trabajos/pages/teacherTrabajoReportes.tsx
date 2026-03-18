import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, ArrowLeft, Download, FileSpreadsheet, BarChart3, ClipboardList, CheckCircle2, AlertTriangle, BellRing, Activity } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import type { EntregaConCalificacion, LibroObservabilityResponse, Trabajo, TrabajoNotificacionesResponse, TrabajoReporte } from "@/shared/types/trabajos";
import { exportEntregasCSV, exportEntregasXLSX, getLibroObservabilidad, getTrabajo, getTrabajoNotificaciones, getTrabajoReporte, listEntregasByTrabajo } from "@/features/trabajos/services/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

export default function TeacherTrabajoReportes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [reporte, setReporte] = useState<TrabajoReporte | null>(null);
  const [notificaciones, setNotificaciones] = useState<TrabajoNotificacionesResponse | null>(null);
  const [observabilidad, setObservabilidad] = useState<LibroObservabilityResponse | null>(null);
  const [entregas, setEntregas] = useState<EntregaConCalificacion[]>([]);

  const ultimasCinco = useMemo(() => entregas.slice(0, 5), [entregas]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        if (!trabajoId) {
          navigate("/teacher/trabajos");
          return;
        }

        const [trabajoData, reporteData, entregasData, notificacionesData, observabilidadData] = await Promise.all([
          getTrabajo(trabajoId),
          getTrabajoReporte(trabajoId),
          listEntregasByTrabajo(trabajoId, { limit: 20, offset: 0 }),
          getTrabajoNotificaciones(trabajoId),
          getLibroObservabilidad(trabajoId),
        ]);

        setTrabajo(trabajoData);
        setReporte(reporteData);
        setEntregas(entregasData);
        setNotificaciones(notificacionesData);
        setObservabilidad(observabilidadData);
      } catch (err) {
        toast.error(normalizeError(err));
        navigate("/teacher/trabajos");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, trabajoId]);

  const onExportCSV = async () => {
    if (!trabajoId) return;

    setDownloadingCsv(true);
    try {
      await exportEntregasCSV(trabajoId);
      toast.success(t("teacher.trabajos.reportes.exportDone", { defaultValue: "CSV exportado correctamente" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setDownloadingCsv(false);
    }
  };

  const onExportXLSX = async () => {
    if (!trabajoId) return;

    setDownloadingXlsx(true);
    try {
      await exportEntregasXLSX(trabajoId);
      toast.success(t("teacher.trabajos.reportes.exportXlsxDone", { defaultValue: "XLSX exportado correctamente" }));
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setDownloadingXlsx(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <button
            className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
            onClick={() => navigate("/teacher/trabajos")}
          >
            <ArrowLeft size={14} />
            {t("common.back", { defaultValue: "Volver" })}
          </button>
          <h1 className="text-2xl font-bold mt-1 inline-flex items-center gap-2">
            <BarChart3 size={22} />
            {t("teacher.trabajos.reportes.title", { defaultValue: "Reporte del trabajo" })}
          </h1>
          <p className="text-sm text-gray-600">{trabajo?.titulo || t("teacher.trabajos.title", { defaultValue: "Trabajos" })}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportCSV}
            disabled={downloadingCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {downloadingCsv ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {t("teacher.trabajos.reportes.exportCsv", { defaultValue: "Exportar CSV" })}
          </button>
          <button
            onClick={onExportXLSX}
            disabled={downloadingXlsx}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {downloadingXlsx ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            {t("teacher.trabajos.reportes.exportXlsx", { defaultValue: "Exportar XLSX" })}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.reportes.totalDeliveries", { defaultValue: "Total entregas" })}</p>
          <p className="text-2xl font-bold mt-1">{reporte?.total_entregas ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.reportes.graded", { defaultValue: "Calificadas" })}</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700">{reporte?.total_calificadas ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.reportes.pending", { defaultValue: "Pendientes" })}</p>
          <p className="text-2xl font-bold mt-1 text-amber-700">{reporte?.total_pendientes ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">{t("teacher.trabajos.reportes.average", { defaultValue: "Promedio" })}</p>
          <p className="text-2xl font-bold mt-1">{reporte?.promedio_puntaje != null ? `${reporte.promedio_puntaje.toFixed(1)}/100` : "-"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
            <BellRing size={16} />
            {t("teacher.trabajos.reportes.notifications", { defaultValue: "Notificaciones" })}
          </h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-gray-600">{t("teacher.trabajos.reportes.publishedEvents", { defaultValue: "Trabajo publicado" })}: </span>
              <strong>{notificaciones?.events?.trabajo_publicado?.sent ?? 0}</strong>
            </p>
            <p>
              <span className="text-gray-600">{t("teacher.trabajos.reportes.receivedEvents", { defaultValue: "Entrega recibida" })}: </span>
              <strong>{notificaciones?.events?.entrega_recibida?.sent ?? 0}</strong>
            </p>
            <p>
              <span className="text-gray-600">{t("teacher.trabajos.reportes.gradedEvents", { defaultValue: "Entrega calificada" })}: </span>
              <strong>{notificaciones?.events?.entrega_calificada?.sent ?? 0}</strong>
            </p>
            <p className="text-rose-700">
              <span className="text-gray-600">{t("teacher.trabajos.reportes.failedEvents", { defaultValue: "Fallidas" })}: </span>
              <strong>
                {(notificaciones?.events?.trabajo_publicado?.failed ?? 0) +
                  (notificaciones?.events?.entrega_recibida?.failed ?? 0) +
                  (notificaciones?.events?.entrega_calificada?.failed ?? 0)}
              </strong>
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
            <Activity size={16} />
            {t("teacher.trabajos.reportes.observability", { defaultValue: "Observabilidad IA" })}
          </h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-gray-600">{t("teacher.trabajos.reportes.extractCalls", { defaultValue: "Extracciones" })}: </span>
              <strong>{observabilidad?.extract_total ?? 0}</strong>
            </p>
            <p>
              <span className="text-gray-600">{t("teacher.trabajos.reportes.fallbackCalls", { defaultValue: "Fallbacks" })}: </span>
              <strong>{observabilidad?.fallback_total ?? 0}</strong>
            </p>
            <p>
              <span className="text-gray-600">{t("teacher.trabajos.reportes.avgLatency", { defaultValue: "Latencia promedio" })}: </span>
              <strong>{(observabilidad?.average_latency_ms ?? 0).toFixed(1)} ms</strong>
            </p>
            <p>
              <span className="text-gray-600">{t("teacher.trabajos.reportes.lastDuration", { defaultValue: "Ultima duracion total" })}: </span>
              <strong>{Math.max(0, Math.round((observabilidad?.last_duration_ms ?? 0) / 1000))} s</strong>
            </p>
            <p className="text-rose-700">
              <span className="text-gray-600">{t("teacher.trabajos.reportes.errors", { defaultValue: "Errores" })}: </span>
              <strong>{observabilidad?.error_total ?? 0}</strong>
            </p>
            {!!observabilidad?.last_error_type && (
              <p className="text-rose-700">
                <span className="text-gray-600">{t("teacher.trabajos.reportes.lastErrorType", { defaultValue: "Ultimo tipo de error" })}: </span>
                <strong>{observabilidad.last_error_type}</strong>
              </p>
            )}
            {observabilidad?.error_by_type && Object.keys(observabilidad.error_by_type).length > 0 && (
              <div className="pt-1">
                <p className="text-gray-600 mb-1">{t("teacher.trabajos.reportes.errorsByType", { defaultValue: "Errores por tipo" })}:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(observabilidad.error_by_type).map(([type, count]) => (
                    <span key={type} className="inline-flex items-center px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 text-xs">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
          <ClipboardList size={16} />
          {t("teacher.trabajos.reportes.latest", { defaultValue: "Ultimas entregas" })}
        </h2>

        {ultimasCinco.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">{t("teacher.trabajos.reportes.noDeliveries", { defaultValue: "No hay entregas registradas para este trabajo." })}</div>
        ) : (
          <div className="space-y-2">
            {ultimasCinco.map((item) => (
              <div key={item.entrega.id} className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{item.estudiante_nombre || item.entrega.estudiante_id}</p>
                  <p className="text-xs text-gray-500">{item.estudiante_email || t("teacher.trabajos.reportes.noEmail", { defaultValue: "Sin correo" })}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(item.entrega.submitted_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  {item.calificacion ? (
                    <>
                      <p className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={12} /> {t("teacher.trabajos.gradedTag", { defaultValue: "Calificada" })}
                      </p>
                      <p className="font-semibold mt-1">{item.calificacion.puntaje}/100</p>
                    </>
                  ) : (
                    <p className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                      <AlertTriangle size={12} /> {t("teacher.trabajos.pendingTag", { defaultValue: "Pendiente" })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
