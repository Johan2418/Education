import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
    Loader2, Upload, FileSpreadsheet, ArrowRight, ArrowLeft,
    CheckCircle2, XCircle, AlertCircle, Sparkles, ChevronDown, Users,
} from "lucide-react";
import type { Curso } from "@/shared/types";

/* ── Types ───────────────────────────────────────────────── */
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
interface TeacherBulkImportResponse {
    enrolled: EnrolledStudent[];
    skipped: EnrolledStudent[];
    not_found: EnrolledStudent[];
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
export default function TeacherBulkImport() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>("upload");
    const [curso, setCurso] = useState<Curso | null>(null);
    const [loading, setLoading] = useState(true);

    // Upload
    const [fileName, setFileName] = useState("");
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [dragActive, setDragActive] = useState(false);

    // Mapping
    const [mappings, setMappings] = useState<FieldMapping[]>([]);
    const [mappingLoading, setMappingLoading] = useState(false);

    // Results
    const [results, setResults] = useState<TeacherBulkImportResponse | null>(null);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const me = await getMe();
                if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
                    navigate("/login");
                    return;
                }
                const cursosRes = await api.get<{ data: Curso[] }>("/cursos");
                const cursos = cursosRes.data || [];
                const firstCurso = cursos.length > 0 ? cursos[0] : null;
                if (firstCurso) {
                    setCurso(firstCurso);
                }
            } catch {
                toast.error("Error al cargar datos");
            } finally {
                setLoading(false);
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

    /* ── Import ─────────────────────────────────────────────── */
    const handleImport = async () => {
        if (!curso) return;
        setImporting(true);
        setStep("importing");
        try {
            const res = await api.post<{ data: TeacherBulkImportResponse }>(`/teacher/bulk-import/${curso.id}`, {
                mappings,
                rows,
            });
            setResults(res.data);
            setStep("results");
        } catch (err: any) {
            const msg = err?.response?.data?.error || "Error al importar estudiantes";
            toast.error(msg);
            setStep("preview");
        } finally {
            setImporting(false);
        }
    };

    /* ── Reset ──────────────────────────────────────────────── */
    const reset = () => {
        setStep("upload");
        setFileName("");
        setHeaders([]);
        setRows([]);
        setMappings([]);
        setResults(null);
    };

    const hasNameOrEmail = mappings.some((m) => m.field === "display_name" || m.field === "email");

    /* ── Loading / no course ────────────────────────────────── */
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <Loader2 size={32} className="animate-spin text-blue-600" />
            </div>
        );
    }

    if (!curso) {
        return (
            <div className="max-w-4xl mx-auto p-4">
                <div className="text-center text-gray-500 p-12 bg-white rounded-lg shadow">
                    <Users size={48} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">No tienes un curso asignado</p>
                    <p className="text-sm mt-1">Contacta a un administrador para que te asigne un curso.</p>
                </div>
            </div>
        );
    }

    /* ── Render ─────────────────────────────────────────────── */
    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Importar Estudiantes al Curso</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Curso: <span className="font-medium text-gray-700">{curso.nombre}</span> — Sube un Excel para inscribir estudiantes
                    </p>
                </div>
                <button onClick={() => navigate("/teacher/estudiantes")} className="text-sm text-gray-500 hover:text-gray-700 transition">
                    ← Volver a estudiantes
                </button>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2">
                {(["upload", "mapping", "preview", "results"] as const).map((s, i) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                        <div className={`h-2 rounded-full flex-1 transition-all duration-300 ${step === s ? "bg-blue-500" :
                            (["upload", "mapping", "preview", "importing", "results"].indexOf(step) > i ? "bg-blue-200" : "bg-gray-200")
                            }`} />
                    </div>
                ))}
            </div>

            {/* ── Step: Upload ──────────────────────────────────── */}
            {step === "upload" && (
                <div
                    className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 ${dragActive ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"
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

                    {!hasNameOrEmail && (
                        <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700 text-sm">
                            <AlertCircle size={16} />
                            Mapea al menos una columna como "Nombre" o "Email" para identificar estudiantes
                        </div>
                    )}

                    <div className="px-6 py-4 bg-gray-50 flex justify-between">
                        <button onClick={reset} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                            <ArrowLeft size={14} className="inline mr-1" /> Atrás
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

            {/* ── Step: Preview ─────────────────────────────────── */}
            {step === "preview" && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-900">Vista Previa</h2>
                        <p className="text-sm text-gray-500 mt-1">{rows.length} estudiantes para verificar inscripción</p>
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
                            <Upload size={14} /> Inscribir estudiantes
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step: Importing ───────────────────────────────── */}
            {step === "importing" && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center gap-4">
                    <Loader2 size={40} className="animate-spin text-blue-500" />
                    <p className="text-lg font-semibold text-gray-900">Inscribiendo estudiantes...</p>
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
                                <p className="text-2xl font-bold text-gray-900">{results.enrolled?.length || 0}</p>
                                <p className="text-sm text-gray-500">Inscritos</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-amber-50 rounded-xl">
                                <AlertCircle size={24} className="text-amber-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900">{results.skipped?.length || 0}</p>
                                <p className="text-sm text-gray-500">Ya inscritos</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-red-50 rounded-xl">
                                <XCircle size={24} className="text-red-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900">{results.not_found?.length || 0}</p>
                                <p className="text-sm text-gray-500">No encontrados</p>
                            </div>
                        </div>
                    </div>

                    {/* Enrolled list */}
                    {results.enrolled && results.enrolled.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="font-semibold text-emerald-700">✓ Estudiantes Inscritos</h3>
                            </div>
                            <div className="overflow-x-auto max-h-60">
                                <table className="w-full">
                                    <tbody className="divide-y divide-gray-50">
                                        {results.enrolled.map((s, i) => (
                                            <tr key={i} className="hover:bg-gray-50/50">
                                                <td className="px-5 py-2.5 text-sm font-medium text-gray-900">{s.display_name || "—"}</td>
                                                <td className="px-5 py-2.5 text-sm text-gray-500">{s.email}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Not found list */}
                    {results.not_found && results.not_found.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="font-semibold text-red-700">✗ No encontrados en la plataforma</h3>
                                <p className="text-xs text-gray-500 mt-1">Estos estudiantes deben ser creados primero por un administrador</p>
                            </div>
                            <div className="overflow-x-auto max-h-60">
                                <table className="w-full">
                                    <tbody className="divide-y divide-gray-50">
                                        {results.not_found.map((s, i) => (
                                            <tr key={i} className="hover:bg-gray-50/50">
                                                <td className="px-5 py-2.5 text-sm text-gray-900">{s.display_name || "—"}</td>
                                                <td className="px-5 py-2.5 text-sm text-gray-500">{s.email || "—"}</td>
                                                <td className="px-5 py-2.5 text-sm text-red-500">{s.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Skipped list */}
                    {results.skipped && results.skipped.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="font-semibold text-amber-700">⚠ Ya inscritos / Omitidos</h3>
                            </div>
                            <div className="overflow-x-auto max-h-60">
                                <table className="w-full">
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
                        <button onClick={() => navigate("/teacher/estudiantes")} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                            Ir a mis estudiantes
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
