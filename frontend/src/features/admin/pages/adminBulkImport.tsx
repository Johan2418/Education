import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe, type AuthUser } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import type { Curso } from "@/shared/types";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Loader2, Upload, FileSpreadsheet, ArrowRight, ArrowLeft,
  Download, CheckCircle2, XCircle, AlertCircle, Sparkles, ChevronDown,
} from "lucide-react";

/* ── Types ───────────────────────────────────────────────── */
interface FieldMapping {
  header: string;
  field: string;
}
interface CreatedStudent {
  display_name: string;
  email: string;
  password: string;
  cedula?: string;
  status: string;
  reason?: string;
  email_auto_adjusted?: boolean;
  enrolled_to_course?: boolean;
  enrollment_reason?: string;
}
interface AdminBulkImportResponse {
  created: CreatedStudent[];
  skipped: CreatedStudent[];
  total: number;
}

const FIELD_OPTIONS = [
  { value: "display_name", label: "Nombre completo" },
  { value: "email", label: "Email" },
  { value: "cedula", label: "Cédula / DNI" },
  { value: "phone", label: "Teléfono" },
  { value: "ignore", label: "Ignorar" },
];

type Step = "upload" | "mapping" | "preview" | "importing" | "results";

/* ── Main component ─────────────────────────────────────── */
export default function AdminBulkImport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setMe] = useState<AuthUser | null>(null);
  const [step, setStep] = useState<Step>("upload");

  // Upload
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Optional course assignment for created students
  const [availableCursos, setAvailableCursos] = useState<Curso[]>([]);
  const [selectedCursoId, setSelectedCursoId] = useState("");

  // Mapping
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);

  // Results
  const [results, setResults] = useState<AdminBulkImportResponse | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getMe();
      if (!user || !["admin", "super_admin"].includes(user.role || "")) {
        navigate("/login");
        return;
      }
      setMe(user);

      try {
        const cursosRes = await api.get<{ data: Curso[] }>("/cursos");
        const cursos = cursosRes.data || [];
        setAvailableCursos(cursos);
      } catch {
        setAvailableCursos([]);
      }
    })();
  }, [navigate]);

  /* ── File handling ──────────────────────────────────────── */
  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          toast.error("El archivo no tiene hojas");
          return;
        }
        const ws = wb.Sheets[sheetName];
        if (!ws) {
          toast.error("No se pudo leer la hoja del archivo");
          return;
        }
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

        if (json.length === 0) {
          toast.error("El archivo está vacío");
          return;
        }

        const firstRow = json[0];
        if (!firstRow) {
          toast.error("El archivo está vacío");
          return;
        }

        const hdrs = Object.keys(firstRow);
        setFileName(file.name);
        setHeaders(hdrs);
        setRows(json);
        setStep("mapping");
        requestMapping(hdrs);
      } catch {
        toast.error("Error al leer el archivo Excel");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  /* ── AI Column Mapping ──────────────────────────────────── */
  const requestMapping = async (hdrs: string[]) => {
    setMappingLoading(true);
    try {
      const res = await api.post<{ data: { mappings: FieldMapping[] } }>("/admin/bulk-import/map-columns", { headers: hdrs });
      setMappings(res.data?.mappings || hdrs.map((h) => ({ header: h, field: "ignore" })));
    } catch {
      setMappings(hdrs.map((h) => ({ header: h, field: "ignore" })));
      toast.error("Error al mapear columnas con IA, revisa manualmente");
    } finally {
      setMappingLoading(false);
    }
  };

  const updateMapping = (index: number, field: string) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, field } : m)));
  };

  /* ── Import ─────────────────────────────────────────────── */
  const handleImport = async () => {
    setImporting(true);
    setStep("importing");
    try {
      if (selectedCursoId) {
        const selectedCourse = availableCursos.find((c) => c.id === selectedCursoId);
        if (!selectedCourse) {
          toast.error("El curso seleccionado no existe");
          setStep("preview");
          return;
        }
      }

      const res = await api.post<{ data: AdminBulkImportResponse }>("/admin/bulk-import", {
        mappings,
        rows,
        curso_id: selectedCursoId || null,
      });
      setResults(res.data);
      setStep("results");
    } catch (err: any) {
      const msg = err?.message || "Error al importar estudiantes";
      toast.error(msg);
      setStep("preview");
    } finally {
      setImporting(false);
    }
  };

  /* ── Download Credentials Excel ─────────────────────────── */
  const downloadCredentials = () => {
    if (!results) return;
    const data = results.created.map((s) => ({
      Nombre: s.display_name,
      Email: s.email,
      Contraseña: s.password,
      Cédula: s.cedula || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Credenciales");
    XLSX.writeFile(wb, "credenciales_estudiantes.xlsx");
  };

  /* ── Reset ──────────────────────────────────────────────── */
  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMappings([]);
    setSelectedCursoId("");
    setResults(null);
  };

  /* ── Has display_name mapped ────────────────────────────── */
  const hasNameMapped = mappings.some((m) => m.field === "display_name");

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importación Masiva de Estudiantes</h1>
          <p className="text-sm text-gray-500 mt-1">Sube un Excel con la lista de estudiantes para crear sus cuentas</p>
        </div>
        <button onClick={() => navigate("/admin/users")} className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Volver a usuarios
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {(["upload", "mapping", "preview", "results"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`h-2 rounded-full flex-1 transition-all duration-300 ${
              step === s ? "bg-blue-500" :
              (["upload", "mapping", "preview", "importing", "results"].indexOf(step) > i ? "bg-blue-200" : "bg-gray-200")
            }`} />
          </div>
        ))}
      </div>

      {/* ── Step: Upload ──────────────────────────────────── */}
      {step === "upload" && (
        <div
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-blue-50 rounded-2xl">
              <Upload size={32} className="text-blue-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">Arrastra tu archivo Excel aquí</p>
              <p className="text-sm text-gray-500 mt-1">o haz clic para seleccionar un archivo .xlsx / .xls</p>
            </div>
            <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition shadow-sm">
              <FileSpreadsheet size={16} />
              Seleccionar archivo
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} />
            </label>
          </div>
        </div>
      )}

      {/* ── Step: Mapping ─────────────────────────────────── */}
      {step === "mapping" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" />
                Mapeo de Columnas (IA)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Archivo: <span className="font-medium text-gray-700">{fileName}</span> — {rows.length} filas
              </p>
            </div>
            {mappingLoading && <Loader2 size={20} className="animate-spin text-blue-500" />}
          </div>

          <div className="px-6 py-5 space-y-3">
            {mappings.map((m, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{m.header}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                    Ej: {rows[0]?.[m.header] || "—"}
                  </p>
                </div>
                <ArrowRight size={16} className="text-gray-300 shrink-0" />
                <div className="relative w-48">
                  <select
                    value={m.field}
                    onChange={(e) => updateMapping(i, e.target.value)}
                    className="appearance-none w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition cursor-pointer"
                  >
                    {FIELD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            ))}
          </div>

          {!hasNameMapped && (
            <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700 text-sm">
              <AlertCircle size={16} />
              Asegúrate de mapear al menos una columna como "Nombre completo"
            </div>
          )}

          <div className="px-6 py-4 bg-gray-50 flex justify-between">
            <button onClick={reset} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              <ArrowLeft size={14} className="inline mr-1" /> Atrás
            </button>
            <button
              onClick={() => setStep("preview")}
              disabled={!hasNameMapped}
              className="px-5 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
            >
              Vista previa <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Preview ─────────────────────────────────── */}
      {step === "preview" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Vista Previa</h2>
            <p className="text-sm text-gray-500 mt-1">{rows.length} estudiantes listos para importar</p>

            <div className="mt-4 max-w-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Curso para inscribir a los creados (opcional)
              </label>

              {availableCursos.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Aun no hay cursos para asignar estudiantes
                </p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedCursoId}
                    onChange={(e) => setSelectedCursoId(e.target.value)}
                    className="appearance-none w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition cursor-pointer"
                  >
                    <option value="">No asignar curso ahora</option>
                    {availableCursos.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.teacher_id}>
                        {c.nombre}{!c.teacher_id ? " (sin profesor asignado)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                  {mappings.filter((m) => m.field !== "ignore").map((m) => (
                    <th key={m.header} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {FIELD_OPTIONS.find((o) => o.value === m.field)?.label || m.field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-5 py-2.5 text-sm text-gray-400">{i + 1}</td>
                    {mappings.filter((m) => m.field !== "ignore").map((m) => (
                      <td key={m.header} className="px-5 py-2.5 text-sm text-gray-700">{row[m.header] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && (
            <div className="px-6 py-3 text-center text-xs text-gray-400 border-t border-gray-100">
              Mostrando 50 de {rows.length} filas
            </div>
          )}

          <div className="px-6 py-4 bg-gray-50 flex justify-between">
            <button onClick={() => setStep("mapping")} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              <ArrowLeft size={14} className="inline mr-1" /> Atrás
            </button>
            <button
              onClick={handleImport}
              className="px-5 py-2 text-sm text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition inline-flex items-center gap-2"
            >
              <Upload size={14} /> Importar {rows.length} estudiantes
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Importing ───────────────────────────────── */}
      {step === "importing" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-blue-500" />
          <p className="text-lg font-semibold text-gray-900">Importando estudiantes...</p>
          <p className="text-sm text-gray-500">Esto puede tomar unos segundos</p>
        </div>
      )}

      {/* ── Step: Results ─────────────────────────────────── */}
      {step === "results" && results && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl">
                <CheckCircle2 size={24} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{results.created?.length || 0}</p>
                <p className="text-sm text-gray-500">Creados</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-xl">
                <AlertCircle size={24} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{results.skipped?.length || 0}</p>
                <p className="text-sm text-gray-500">Omitidos</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <FileSpreadsheet size={24} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{results.total}</p>
                <p className="text-sm text-gray-500">Total</p>
              </div>
            </div>
          </div>

          {/* Created students table */}
          {results.created && results.created.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Estudiantes Creados</h3>
                <button
                  onClick={downloadCredentials}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 transition"
                >
                  <Download size={14} /> Descargar Credenciales
                </button>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Tipo Email</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Contraseña</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Cédula</th>
                      {selectedCursoId && <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Curso</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {results.created.map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-5 py-2.5 text-sm font-medium text-gray-900">{s.display_name || "—"}</td>
                        <td className="px-5 py-2.5 text-sm text-gray-500">{s.email}</td>
                        <td className="px-5 py-2.5 text-sm text-gray-500">{s.email_auto_adjusted ? "Autoajustado" : "Original"}</td>
                        <td className="px-5 py-2.5 text-sm font-mono text-emerald-600 bg-emerald-50/50">{s.password}</td>
                        <td className="px-5 py-2.5 text-sm text-gray-500">{s.cedula || "—"}</td>
                        {selectedCursoId && (
                          <td className={`px-5 py-2.5 text-sm ${s.enrolled_to_course ? "text-emerald-600" : "text-amber-600"}`}>
                            {s.enrollment_reason || (s.enrolled_to_course ? "Inscrito" : "No inscrito")}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Skipped students */}
          {results.skipped && results.skipped.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Estudiantes Omitidos</h3>
              </div>
              <div className="overflow-x-auto max-h-60">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Razón</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {results.skipped.map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-5 py-2.5 text-sm text-gray-900">{s.display_name || "—"}</td>
                        <td className="px-5 py-2.5 text-sm text-gray-500">{s.email || "—"}</td>
                        <td className="px-5 py-2.5 text-sm text-amber-600">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <button onClick={() => navigate("/admin/users")} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              Ir a usuarios
            </button>
            <button onClick={reset} className="px-5 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition">
              Nueva importación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
