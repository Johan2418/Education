import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/shared/lib/api";
import { getMe } from "@/shared/lib/auth";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Loader2, Upload, FileSpreadsheet, ArrowRight, ArrowLeft,
  CheckCircle2, XCircle, AlertCircle, Sparkles, ChevronDown, Users,
} from "lucide-react";
import type { Curso } from "@/shared/types";

interface FieldMapping {
  header: string;
  field: string;
}

interface EnrolledStudent {
  display_name: string;
  email: string;
  status: string;
  reason?: string;
}

interface BulkEnrollResponse {
  enrolled: EnrolledStudent[];
  skipped: EnrolledStudent[];
  not_found: EnrolledStudent[];
  total: number;
}

const FIELD_OPTIONS = [
  { value: "display_name", label: "Nombre completo" },
  { value: "email", label: "Email" },
  { value: "cedula", label: "Cedula / DNI" },
  { value: "phone", label: "Telefono" },
  { value: "ignore", label: "Ignorar" },
];

type Step = "upload" | "mapping" | "preview" | "importing" | "results";

export default function AdminBulkEnroll() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(true);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [selectedCursoId, setSelectedCursoId] = useState("");

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);

  const [results, setResults] = useState<BulkEnrollResponse | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }

        const cursosRes = await api.get<{ data: Curso[] }>("/cursos");
        const cursosData = cursosRes.data || [];
        setCursos(cursosData);
        if (cursosData.length > 0) {
          setSelectedCursoId(cursosData[0]?.id || "");
        }
      } catch {
        toast.error("Error al cargar cursos");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

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
          toast.error("El archivo esta vacio");
          return;
        }

        const firstRow = json[0];
        if (!firstRow) {
          toast.error("El archivo esta vacio");
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
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const requestMapping = async (hdrs: string[]) => {
    setMappingLoading(true);
    try {
      const res = await api.post<{ data: { mappings: FieldMapping[] } }>("/teacher/bulk-import/map-columns", { headers: hdrs });
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

  const handleImport = async () => {
    if (!selectedCursoId) {
      toast.error("Selecciona un curso para inscribir");
      return;
    }

    setImporting(true);
    setStep("importing");

    try {
      const res = await api.post<{ data: BulkEnrollResponse }>(`/teacher/bulk-import/${selectedCursoId}`, {
        mappings,
        rows,
      });
      setResults(
        res.data
          ? {
              ...res.data,
              enrolled: res.data.enrolled || [],
              skipped: res.data.skipped || [],
              not_found: res.data.not_found || [],
            }
          : null
      );
      setStep("results");
    } catch (err: any) {
      const msg = err?.message || "Error al inscribir estudiantes";
      toast.error(msg);
      setStep("preview");
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMappings([]);
    setResults(null);
  };

  const hasNameOrEmail = mappings.some((m) => m.field === "display_name" || m.field === "email");
  const selectedCurso = cursos.find((c) => c.id === selectedCursoId) || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (cursos.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center text-gray-500 p-12 bg-white rounded-lg shadow">
          <Users size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">No hay cursos creados</p>
          <p className="text-sm mt-1">Crea un curso primero para poder inscribir estudiantes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inscripcion Masiva de Estudiantes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Curso: <span className="font-medium text-gray-700">{selectedCurso?.nombre || "Selecciona un curso"}</span>
          </p>
        </div>
        <button onClick={() => navigate("/admin/cursos")} className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← Volver a cursos
        </button>
      </div>

      <div className="max-w-lg">
        <label className="block text-sm font-medium text-gray-700 mb-2">Curso de destino</label>
        <div className="relative">
          <select
            value={selectedCursoId}
            onChange={(e) => setSelectedCursoId(e.target.value)}
            className="appearance-none w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
          >
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

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
              <p className="text-lg font-semibold text-gray-900">Arrastra tu archivo Excel aqui</p>
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
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">Ej: {rows[0]?.[m.header] || "—"}</p>
                </div>
                <ArrowRight size={16} className="text-gray-300 shrink-0" />
                <div className="relative w-48">
                  <select
                    value={m.field}
                    onChange={(e) => updateMapping(i, e.target.value)}
                    className="appearance-none w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
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

          {!hasNameOrEmail && (
            <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700 text-sm">
              <AlertCircle size={16} />
              Mapea al menos una columna como Nombre completo o Email
            </div>
          )}

          <div className="px-6 py-4 bg-gray-50 flex justify-between">
            <button onClick={reset} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              <ArrowLeft size={14} className="inline mr-1" /> Atras
            </button>
            <button
              onClick={() => setStep("preview")}
              disabled={!hasNameOrEmail}
              className="px-5 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
            >
              Vista previa <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Vista Previa</h2>
            <p className="text-sm text-gray-500 mt-1">{rows.length} estudiantes listos para inscribir en {selectedCurso?.nombre}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  {headers.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {headers.map((h) => <td key={h} className="px-4 py-3 text-gray-700">{r[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 10 && (
            <p className="px-6 py-3 text-xs text-gray-500 border-t border-gray-100">Mostrando 10 de {rows.length} filas</p>
          )}

          <div className="px-6 py-4 bg-gray-50 flex justify-between">
            <button onClick={() => setStep("mapping")} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              <ArrowLeft size={14} className="inline mr-1" /> Volver
            </button>
            <button
              onClick={handleImport}
              disabled={importing || !selectedCursoId}
              className="px-5 py-2 text-sm text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 inline-flex items-center gap-2"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Inscribir masivamente
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Loader2 size={32} className="animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Inscribiendo estudiantes en el curso...</p>
          <p className="text-sm text-gray-500 mt-1">Esto puede tardar unos segundos</p>
        </div>
      )}

      {step === "results" && results && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{results.total}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-sm text-emerald-700">Inscritos</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{results.enrolled.length}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-sm text-amber-700">Omitidos</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{results.skipped.length}</p>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
              <p className="text-sm text-rose-700">No encontrados</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">{results.not_found.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Detalle de resultados</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {results.enrolled.map((s, i) => (
                <div key={`e-${i}`} className="px-6 py-3 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.display_name || s.email}</p>
                    <p className="text-xs text-gray-500">{s.email}</p>
                  </div>
                </div>
              ))}
              {results.skipped.map((s, i) => (
                <div key={`s-${i}`} className="px-6 py-3 flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.display_name || s.email}</p>
                    <p className="text-xs text-amber-700">{s.reason || "Omitido"}</p>
                  </div>
                </div>
              ))}
              {results.not_found.map((s, i) => (
                <div key={`n-${i}`} className="px-6 py-3 flex items-start gap-3">
                  <XCircle size={18} className="text-rose-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.display_name || s.email}</p>
                    <p className="text-xs text-rose-700">{s.reason || "No encontrado"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={reset} className="px-5 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition">
              Nueva importacion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
