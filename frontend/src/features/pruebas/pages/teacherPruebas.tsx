import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import { calificarResultado, listResultadosByPrueba } from "@/features/pruebas/services/pruebas";
import type { Prueba, Curso, Materia, MisCursoDocente, ResultadoPrueba } from "@/shared/types";
import { Plus, Pencil, Trash2, Search, Loader2, X, ClipboardCheck, Clock3, Eye, CheckCircle2 } from "lucide-react";
import { useAppConfirm } from "@/shared/hooks/useAppConfirm";

interface PruebaConLeccion extends Prueba {
  leccion_titulo?: string;
}

interface ApiEnvelope<T> { data: T }
const unwrap = <T,>(payload: T | ApiEnvelope<T>): T => (typeof payload === "object" && payload !== null && "data" in payload) ? (payload as ApiEnvelope<T>).data : payload as T;

type QuestionType = "opcion_multiple" | "verdadero_falso" | "respuesta_corta";
type Option = { text: string; correct: boolean };
type QuestionDraft = { text: string; type: QuestionType; options: Option[] };
type StudentLite = { id: string; display_name?: string | null; email?: string | null };

const createQuestion = (type: QuestionType = "opcion_multiple"): QuestionDraft => ({
  text: "",
  type,
  options: type === "verdadero_falso"
    ? [{ text: "Verdadero", correct: true }, { text: "Falso", correct: false }]
    : type === "opcion_multiple"
    ? [{ text: "", correct: true }, { text: "", correct: false }]
    : [],
});

function examStatus(p: PruebaConLeccion): { label: string; tone: string } {
  const now = Date.now();
  const pubAt = p.fecha_publicacion ? new Date(p.fecha_publicacion).getTime() : null;
  const actAt = p.fecha_activacion ? new Date(p.fecha_activacion).getTime() : null;
  if (pubAt && pubAt > now) return { label: "Próximo a publicarse", tone: "amber" };
  if (p.activa === false) return { label: "Publicado (inactivo)", tone: "slate" };
  if (actAt && actAt > now) return { label: "Publicado (pendiente de activación)", tone: "indigo" };
  return { label: "Publicado y activo", tone: "emerald" };
}

function badgeClasses(tone: string): string {
  if (tone === "emerald") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "indigo") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function TeacherPruebas() {
  const navigate = useNavigate();
  const { confirm } = useAppConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pruebas, setPruebas] = useState<PruebaConLeccion[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<PruebaConLeccion | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([createQuestion()]);
  const [reviewExam, setReviewExam] = useState<PruebaConLeccion | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [resultados, setResultados] = useState<ResultadoPrueba[]>([]);
  const [students, setStudents] = useState<Record<string, StudentLite>>({});
  const [grading, setGrading] = useState<Record<string, { score: string; feedback: string; publish: boolean }>>({});
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    materia_id: "",
    puntaje_minimo: 60,
    activa: true,
    fecha_publicacion: "",
    fecha_activacion: "",
    mostrar_resultado_inmediato: true,
    requiere_revision_docente: false,
  });
  const hasShortAnswerQuestion = useMemo(() => questions.some((q) => q.type === "respuesta_corta"), [questions]);

  const loadData = async () => {
    let teacherAssignments: MisCursoDocente[] = [];
    try {
      teacherAssignments = unwrap(await api.get<MisCursoDocente[] | ApiEnvelope<MisCursoDocente[]>>("/teacher/mis-cursos")) || [];
    } catch {
      teacherAssignments = [];
    }
    const allMaterias: Materia[] = [];
    const allPruebas: PruebaConLeccion[] = [];
    if (teacherAssignments.length > 0) {
      const seenMateria = new Set<string>();
      const teacherMaterias = teacherAssignments
        .filter((a) => {
          const id = (a.materia_id || "").trim();
          if (!id || seenMateria.has(id)) return false;
          seenMateria.add(id);
          return true;
        })
        .map((a) => ({ id: a.materia_id, nombre: a.materia_nombre } as Materia));
      allMaterias.push(...teacherMaterias);
      for (const m of teacherMaterias) {
        try {
          const ps = unwrap(await api.get<Prueba[] | ApiEnvelope<Prueba[]>>(`/materias/${m.id}/pruebas`)) || [];
          allPruebas.push(...ps.map((p) => ({ ...p, leccion_titulo: m.nombre })));
        } catch {}
      }
    } else {
      const cursos = unwrap(await api.get<Curso[] | ApiEnvelope<Curso[]>>("/cursos")) || [];
      for (const c of cursos) {
        let mats: Materia[] = [];
        try {
          mats = unwrap(await api.get<Materia[] | ApiEnvelope<Materia[]>>(`/cursos/${c.id}/materias`)) || [];
        } catch {
          mats = [];
        }
        allMaterias.push(...mats);
        for (const m of mats) {
          try {
            const ps = unwrap(await api.get<Prueba[] | ApiEnvelope<Prueba[]>>(`/materias/${m.id}/pruebas`)) || [];
            allPruebas.push(...ps.map((p) => ({ ...p, leccion_titulo: m.nombre })));
          } catch {}
        }
      }
    }
    setMaterias(allMaterias);
    setPruebas(allPruebas);
  };

  const loadStudents = async () => {
    try {
      const rows = unwrap(await api.get<StudentLite[] | ApiEnvelope<StudentLite[]>>("/students")) || [];
      const map: Record<string, StudentLite> = {};
      for (const s of rows) map[s.id] = s;
      setStudents(map);
    } catch {
      setStudents({});
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        await Promise.all([loadData(), loadStudents()]);
      } catch {
        toast.error("Error al cargar examenes");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const filtered = useMemo(() => pruebas.filter((p) => (p.titulo || "").toLowerCase().includes(search.toLowerCase()) || (p.leccion_titulo || "").toLowerCase().includes(search.toLowerCase())), [pruebas, search]);
  const stats = useMemo(() => {
    const total = pruebas.length;
    const active = pruebas.filter((p) => examStatus(p).tone === "emerald").length;
    const scheduled = pruebas.filter((p) => examStatus(p).tone === "amber" || examStatus(p).tone === "indigo").length;
    const manual = pruebas.filter((p) => p.requiere_revision_docente === true).length;
    return { total, active, scheduled, manual };
  }, [pruebas]);

  const handleDelete = async (id: string) => {
    if (!await confirm("Estas seguro?", { tone: "danger" })) return;
    try {
      await api.delete(`/pruebas/${id}`);
      setPruebas((prev) => prev.filter((p) => p.id !== id));
      toast.success("Examen eliminado");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ titulo: "", descripcion: "", materia_id: "", puntaje_minimo: 60, activa: true, fecha_publicacion: "", fecha_activacion: "", mostrar_resultado_inmediato: true, requiere_revision_docente: false });
    setQuestions([createQuestion()]);
    setOpenForm(true);
  };

  const openEdit = (item: PruebaConLeccion) => {
    setEditing(item);
    setForm({
      titulo: item.titulo || "",
      descripcion: item.descripcion || "",
      materia_id: item.materia_id || "",
      puntaje_minimo: item.puntaje_minimo || 60,
      activa: item.activa !== false,
      fecha_publicacion: item.fecha_publicacion ? item.fecha_publicacion.slice(0, 16) : "",
      fecha_activacion: item.fecha_activacion ? item.fecha_activacion.slice(0, 16) : "",
      mostrar_resultado_inmediato: item.mostrar_resultado_inmediato !== false,
      requiere_revision_docente: item.requiere_revision_docente === true,
    });
    setQuestions([createQuestion()]);
    setOpenForm(true);
  };

  const openReview = async (exam: PruebaConLeccion) => {
    setReviewExam(exam);
    setReviewOpen(true);
    setReviewLoading(true);
    try {
      const rows = await listResultadosByPrueba(exam.id);
      setResultados(rows || []);
      const initial: Record<string, { score: string; feedback: string; publish: boolean }> = {};
      for (const r of rows || []) {
        initial[r.id] = { score: String(r.puntaje_obtenido ?? ""), feedback: r.feedback_docente || "", publish: r.mostrar_puntaje_estudiante !== false };
      }
      setGrading(initial);
    } catch {
      toast.error("No se pudieron cargar las entregas");
      setResultados([]);
      setGrading({});
    } finally {
      setReviewLoading(false);
    }
  };

  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => setQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  const updateOption = (qIdx: number, oIdx: number, patch: Partial<Option>) => setQuestions((prev) => prev.map((q, i) => i !== qIdx ? q : ({ ...q, options: q.options.map((o, j) => j === oIdx ? { ...o, ...patch } : o) })));
  const setCorrectOption = (qIdx: number, oIdx: number) => setQuestions((prev) => prev.map((q, i) => i !== qIdx ? q : ({ ...q, options: q.options.map((o, j) => ({ ...o, correct: j === oIdx })) })));
  const addOption = (qIdx: number) => setQuestions((prev) => prev.map((q, i) => i === qIdx ? ({ ...q, options: [...q.options, { text: "", correct: false }] }) : q));
  const removeOption = (qIdx: number, oIdx: number) => setQuestions((prev) => prev.map((q, i) => {
    if (i !== qIdx) return q;
    const options = q.options.filter((_, j) => j !== oIdx);
    if (!options.some((o) => o.correct) && options[0]) options[0].correct = true;
    return { ...q, options };
  }));

  const validateQuestions = (): string | null => {
    if (questions.length === 0) return "Agrega al menos una pregunta";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q) continue;
      if (!q.text.trim()) return `La pregunta ${i + 1} no tiene enunciado`;
      if (q.type === "opcion_multiple" || q.type === "verdadero_falso") {
        const validOptions = q.options.filter((o) => o.text.trim());
        if (validOptions.length < 2) return `La pregunta ${i + 1} requiere al menos 2 opciones`;
        if (!validOptions.some((o) => o.correct)) return `La pregunta ${i + 1} necesita una respuesta correcta`;
      }
    }
    return null;
  };

  const saveExam = async () => {
    if (!form.titulo.trim() || !form.materia_id) return void toast.error("Titulo y materia son obligatorios");
    if (!form.activa && !form.fecha_activacion) return void toast.error("Si el examen está inactivo, debes definir fecha de activación");
    const qError = validateQuestions();
    if (qError) return void toast.error(qError);
    setSaving(true);
    try {
      const payload = {
        materia_id: form.materia_id,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        puntaje_minimo: form.puntaje_minimo,
        activa: form.activa,
        fecha_publicacion: form.fecha_publicacion ? new Date(form.fecha_publicacion).toISOString() : null,
        fecha_activacion: form.fecha_activacion ? new Date(form.fecha_activacion).toISOString() : null,
        mostrar_resultado_inmediato: hasShortAnswerQuestion ? false : form.mostrar_resultado_inmediato,
        requiere_revision_docente: hasShortAnswerQuestion ? true : form.requiere_revision_docente,
      };
      let examId = editing?.id;
      if (editing) await api.put(`/pruebas/${editing.id}`, payload);
      else examId = (unwrap(await api.post<Prueba | ApiEnvelope<Prueba>>("/pruebas", payload))).id;
      if (!examId) throw new Error("No se pudo crear el examen");
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q) continue;
        const createdQ = unwrap(await api.post<{ id: string } | ApiEnvelope<{ id: string }>>("/preguntas", { prueba_id: examId, texto: q.text.trim(), tipo: q.type, orden: i, puntaje_maximo: 1 }));
        if (q.type === "opcion_multiple" || q.type === "verdadero_falso") {
          const opts = q.options.filter((o) => o.text.trim());
          for (let j = 0; j < opts.length; j++) {
            const opt = opts[j];
            if (!opt) continue;
            await api.post("/respuestas", { pregunta_id: createdQ.id, texto: opt.text.trim(), es_correcta: !!opt.correct, orden: j });
          }
        }
      }
      await loadData();
      toast.success(editing ? "Examen actualizado" : "Examen creado");
      setOpenForm(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar el examen");
    } finally {
      setSaving(false);
    }
  };

  const saveGrade = async (resultado: ResultadoPrueba) => {
    const state = grading[resultado.id];
    if (!state || !reviewExam) return;
    const score = Number(state.score);
    if (Number.isNaN(score) || score < 0 || score > 100) return void toast.error("Ingresa un puntaje válido entre 0 y 100");
    try {
      const updated = await calificarResultado(resultado.id, {
        puntaje_obtenido: score,
        aprobado: score >= (reviewExam.puntaje_minimo ?? 0),
        feedback_docente: state.feedback || undefined,
        mostrar_puntaje_estudiante: state.publish,
      });
      setResultados((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      toast.success("Calificación guardada");
    } catch {
      toast.error("No se pudo guardar la calificación");
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 size={32} className="animate-spin text-blue-600" /></div>;

  return (
    <div className="mx-auto max-w-7xl p-4">
      <section className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-3xl font-bold text-slate-900">Gestión de Exámenes</h1><p className="mt-1 text-sm text-slate-600">Crea, programa, publica y revisa entregas de tus estudiantes.</p></div>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700"><Plus size={16} /> Nuevo examen</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Total</p><p className="text-xl font-semibold">{stats.total}</p></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Activos</p><p className="text-xl font-semibold text-emerald-700">{stats.active}</p></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Programados</p><p className="text-xl font-semibold text-amber-700">{stats.scheduled}</p></div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3"><p className="text-xs text-indigo-700">Revisión manual</p><p className="text-xl font-semibold text-indigo-700">{stats.manual}</p></div>
        </div>
      </section>
      <div className="relative mb-4"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-4" placeholder="Buscar exámenes por título o materia..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {filtered.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">No hay exámenes</div> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const status = examStatus(p);
            return (
              <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className="mb-3 flex items-start justify-between gap-2"><h3 className="line-clamp-2 text-lg font-semibold text-slate-900">{p.titulo}</h3><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClasses(status.tone)}`}>{status.label}</span></div>
                <p className="text-sm text-slate-600">Materia: <span className="font-medium text-slate-800">{p.leccion_titulo || "Sin materia"}</span></p>
                <p className="mt-1 text-xs text-slate-500">Mínimo aprobatorio: {p.puntaje_minimo ?? 0}%</p>
                <p className="mt-1 text-xs text-slate-500">Revisión: {p.requiere_revision_docente ? "Manual" : "Automática"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => openReview(p)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"><ClipboardCheck size={14} /> Entregas</button>
                  <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"><Pencil size={14} /> Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"><Trash2 size={14} /> Eliminar</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {reviewOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4"><div><h3 className="text-xl font-bold text-slate-900">Entregas del examen</h3><p className="text-sm text-slate-600">{reviewExam?.titulo}</p></div><button onClick={() => setReviewOpen(false)} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X size={20} /></button></div><div className="p-5">{reviewLoading ? <div className="flex min-h-[180px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div> : resultados.length === 0 ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">Aún no hay entregas para este examen.</div> : <div className="space-y-4">{resultados.map((r) => { const s = students[r.usuario_id]; const identity = s?.display_name || s?.email || r.usuario_id; const g = grading[r.id] || { score: String(r.puntaje_obtenido ?? ""), feedback: "", publish: r.mostrar_puntaje_estudiante !== false }; const approved = Number(g.score || 0) >= (reviewExam?.puntaje_minimo ?? 0); const isManualExam = reviewExam?.requiere_revision_docente === true; return <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{identity}</p><p className="text-xs text-slate-500">Entrega: {r.completed_at ? new Date(r.completed_at).toLocaleString() : "sin fecha"}</p></div><div className="flex items-center gap-2 text-xs"><span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1">Actual: {r.puntaje_obtenido.toFixed(2)}%</span>{r.calificado_por_docente ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">Calificado</span> : <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Pendiente</span>}</div></div><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><label className="text-sm">Puntaje (%)<input type="number" min={0} max={100} value={g.score} onChange={(e) => setGrading((prev) => ({ ...prev, [r.id]: { ...g, score: e.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm md:col-span-2">Feedback docente<input value={g.feedback} onChange={(e) => setGrading((prev) => ({ ...prev, [r.id]: { ...g, feedback: e.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Observaciones para el estudiante" /></label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3 text-xs text-slate-600"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${approved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}><CheckCircle2 className="h-3.5 w-3.5" />{approved ? "Aprobado" : "Reprobado"}</span><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={g.publish} onChange={(e) => setGrading((prev) => ({ ...prev, [r.id]: { ...g, publish: e.target.checked } }))} />Mostrar puntaje al estudiante</label></div><button onClick={() => saveGrade(r)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><Eye className="h-4 w-4" />{isManualExam ? "Calificar" : "Actualizar"}</button></div></div>; })}</div>}</div></div></div>}
      {openForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-6 py-5">
              <div><h2 className="text-2xl font-bold text-slate-900">{editing ? "Editar examen" : "Crear examen"}</h2><p className="mt-1 text-sm text-slate-600">Este examen se vinculará a una materia, no a una lección.</p></div>
              <button onClick={() => setOpenForm(false)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"><X size={20} /></button>
            </div>
            <div className="space-y-5 p-6">
              <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Información general</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Título del examen</span><input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" placeholder="Ej: Examen Unidad 1" value={form.titulo} onChange={(e) => setForm((s) => ({ ...s, titulo: e.target.value }))} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Materia</span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={form.materia_id} onChange={(e) => setForm((s) => ({ ...s, materia_id: e.target.value }))}><option value="">Selecciona materia</option>{materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
                </div>
                <label className="mt-4 block space-y-1.5"><span className="text-xs font-medium text-slate-600">Descripción (opcional)</span><textarea className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" rows={3} placeholder="Describe el examen..." value={form.descripcion} onChange={(e) => setForm((s) => ({ ...s, descripcion: e.target.value }))} /></label>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Publicación y evaluación</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Fecha de publicación</span><input type="datetime-local" className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={form.fecha_publicacion} onChange={(e) => setForm((s) => ({ ...s, fecha_publicacion: e.target.value }))} /><span className="block text-[11px] text-slate-500">Desde cuándo se muestra en la lista de exámenes.</span></label>
                  <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Fecha de activación</span><input type="datetime-local" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 disabled:bg-slate-100 disabled:text-slate-400" value={form.fecha_activacion} onChange={(e) => setForm((s) => ({ ...s, fecha_activacion: e.target.value }))} disabled={form.activa} /><span className="block text-[11px] text-slate-500">Desde cuándo el estudiante puede resolverlo.</span></label>
                  <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Puntaje mínimo (%)</span><input type="number" min={0} max={100} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={form.puntaje_minimo} onChange={(e) => setForm((s) => ({ ...s, puntaje_minimo: Number(e.target.value) }))} /></label>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><input type="checkbox" checked={form.activa} onChange={(e) => setForm((s) => ({ ...s, activa: e.target.checked, fecha_activacion: e.target.checked ? "" : s.fecha_activacion }))} />Activo</label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><input type="checkbox" checked={form.mostrar_resultado_inmediato} disabled={hasShortAnswerQuestion} onChange={(e) => setForm((s) => ({ ...s, mostrar_resultado_inmediato: e.target.checked, requiere_revision_docente: e.target.checked ? false : s.requiere_revision_docente }))} />Mostrar puntaje inmediato</label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><input type="checkbox" checked={hasShortAnswerQuestion ? true : form.requiere_revision_docente} disabled={hasShortAnswerQuestion} onChange={(e) => setForm((s) => ({ ...s, requiere_revision_docente: e.target.checked, mostrar_resultado_inmediato: e.target.checked ? false : s.mostrar_resultado_inmediato }))} />Requiere revisión docente</label>
                </div>
                {!form.activa && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />El examen está desactivado. Programa la fecha de activación.</div>}
                {hasShortAnswerQuestion && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Hay al menos una pregunta de <strong>respuesta corta</strong>: se exige revisión docente y se desactiva el puntaje inmediato.</div>}
              </section>
              <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-800">Preguntas</h3><button type="button" onClick={() => setQuestions((prev) => [...prev, createQuestion()])} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50">+ Agregar pregunta</button></div>
                <div className="space-y-3">{questions.map((q, qIdx) => <div key={qIdx} className="rounded-lg border border-indigo-200 bg-white p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-700">Pregunta {qIdx + 1}</span><button type="button" onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qIdx))} className="text-xs text-red-600">Eliminar</button></div><input className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Escribe el enunciado" value={q.text} onChange={(e) => updateQuestion(qIdx, { text: e.target.value })} /><select className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2" value={q.type} onChange={(e) => { const nextType = e.target.value as QuestionType; updateQuestion(qIdx, { type: nextType, options: nextType === "verdadero_falso" ? [{ text: "Verdadero", correct: true }, { text: "Falso", correct: false }] : nextType === "opcion_multiple" ? [{ text: "", correct: true }, { text: "", correct: false }] : [] }); }}><option value="opcion_multiple">Opción múltiple</option><option value="verdadero_falso">Verdadero / Falso</option><option value="respuesta_corta">Respuesta corta</option></select>{(q.type === "opcion_multiple" || q.type === "verdadero_falso") && <div className="space-y-2">{q.options.map((opt, oIdx) => <div key={oIdx} className="flex items-center gap-2"><input type="radio" name={`q-${qIdx}-correct`} checked={!!opt.correct} onChange={() => setCorrectOption(qIdx, oIdx)} /><input className="flex-1 rounded-lg border border-slate-300 px-3 py-2" placeholder={`Opción ${oIdx + 1}`} value={opt.text} onChange={(e) => updateOption(qIdx, oIdx, { text: e.target.value })} disabled={q.type === "verdadero_falso"} />{q.type !== "verdadero_falso" && <button type="button" onClick={() => removeOption(qIdx, oIdx)} className="text-xs text-red-600">Quitar</button>}</div>)}{q.type !== "verdadero_falso" && <button type="button" onClick={() => addOption(qIdx)} className="text-xs font-medium text-indigo-700">+ Agregar opción</button>}</div>}</div>)}</div>
              </section>
            </div>
            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4"><button onClick={() => setOpenForm(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Cancelar</button><button onClick={saveExam} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Guardando..." : "Guardar examen"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

