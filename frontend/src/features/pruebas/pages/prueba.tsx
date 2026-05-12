import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { getStudentLessonAccess } from "@/shared/services/studentProgression";
import toast from "react-hot-toast";
import type { Leccion, LeccionSeccion, PruebaCompleta, Pregunta, Respuesta } from "@/shared/types";
import { Loader2 } from "lucide-react";

interface ApiEnvelope<T> {
  data: T;
}

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

export default function PruebaPage() {
  const { pruebaId, lessonId } = useParams<{ pruebaId: string; lessonId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [prueba, setPrueba] = useState<PruebaCompleta | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [scoreVisible, setScoreVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [studentAccessDenied, setStudentAccessDenied] = useState(false);
  const [blockedMateriaId, setBlockedMateriaId] = useState<string | null>(null);

  useEffect(() => {
    if (!pruebaId) return;
    (async () => {
      setLoading(true);
      setStudentAccessDenied(false);
      setBlockedMateriaId(null);
      try {
        const me = await getMe();
        if (!me) { navigate("/login"); return; }

        if (me.role === "student" && lessonId) {
          const lessonRes = await api.get<Leccion | ApiEnvelope<Leccion>>(`/lecciones/${lessonId}`);
          const lesson = unwrapApiData(lessonRes);
          const lessonAccess = await getStudentLessonAccess(lesson);
          if (!lessonAccess.allowed) {
            setStudentAccessDenied(true);
            setBlockedMateriaId(lessonAccess.materiaId);
            return;
          }
        }

        const pruebaRes = await api.get<PruebaCompleta | ApiEnvelope<PruebaCompleta>>(`/pruebas/${pruebaId}/completa`);
        setPrueba(unwrapApiData(pruebaRes));
      } catch (err) {
        console.error("Error loading prueba", err);
        toast.error(t("pruebas.loadError", { defaultValue: "Error al cargar la prueba" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, pruebaId, navigate, t]);

  const handleSelect = (preguntaId: string, value: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [preguntaId]: value }));
  };

  const handleSubmit = async () => {
    if (!prueba) return;
    setSubmitting(true);
    try {
      const payload = await api.post<any>("/resultados", {
        prueba_id: pruebaId,
        respuestas: answers,
      });
      const resultado = unwrapApiData(payload);
      const pct = typeof resultado?.puntaje_obtenido === "number" ? resultado.puntaje_obtenido : null;

      if (lessonId && pruebaId) {
        try {
          const seccionesRes = await api.get<LeccionSeccion[] | ApiEnvelope<LeccionSeccion[]>>(`/lecciones/${lessonId}/secciones`);
          const secciones = unwrapApiData(seccionesRes) || [];
          const quizSection = secciones.find((section) => section.prueba_id === pruebaId);
          if (quizSection) {
            await api.put("/progreso-secciones", {
              leccion_seccion_id: quizSection.id,
              completado: (pct ?? 0) >= (prueba.puntaje_minimo ?? 0),
              puntuacion: pct ?? 0,
              intentos: 1,
            });
          }
        } catch {
          // fallback: keep quiz result even if section progress fails.
        }
      }

      setScore(pct);
      setScoreVisible(resultado?.mostrar_puntaje_estudiante !== false && pct !== null);
      setSubmitted(true);
      toast.success(t("pruebas.submitted", { defaultValue: "Prueba enviada" }));
    } catch (err) {
      console.error("Error submitting prueba", err);
      toast.error(t("pruebas.submitError", { defaultValue: "Error al enviar la prueba" }));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (studentAccessDenied) {
    const returnPath = blockedMateriaId ? `/contents/${blockedMateriaId}` : "/contents";
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Esta prueba está bloqueada por el orden de avance configurado por tu docente.
        </div>
        <button
          onClick={() => navigate(returnPath)}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Volver a la materia
        </button>
      </div>
    );
  }

  if (!prueba) {
    return <div className="text-center py-8 text-gray-500">{t("pruebas.notFound", { defaultValue: "Prueba no encontrada" })}</div>;
  }

  const preguntas: (Pregunta & { respuestas?: Respuesta[] })[] = prueba.preguntas || [];
  const activacionPendiente = !!prueba.fecha_activacion && new Date(prueba.fecha_activacion).getTime() > Date.now();
  const estaActiva = prueba.activa !== false && !activacionPendiente;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <button onClick={() => navigate(-1)} className="text-blue-600 hover:underline mb-4 inline-block">
        &larr; {t("common.back", { defaultValue: "Volver" })}
      </button>

      <h1 className="text-2xl font-bold mb-2">{prueba.titulo}</h1>
      {prueba.descripcion && <p className="text-gray-600 mb-6">{prueba.descripcion}</p>}

      {activacionPendiente && <div className="mb-6 rounded-lg bg-amber-50 p-4 text-amber-800">Este examen se activará en {new Date(prueba.fecha_activacion as string).toLocaleString()}.</div>}
      {submitted && (
        <div className={`mb-6 p-4 rounded-lg ${scoreVisible && (score ?? 0) >= (prueba.puntaje_minimo ?? 0) ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-700"}`}>
          <p className="font-semibold">
            {scoreVisible && score !== null
              ? `${t("pruebas.score", { defaultValue: "Puntaje" })}: ${score}%`
              : "Examen enviado. Tu resultado será publicado por el docente según la configuración."}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {preguntas.map((preg, idx) => {
          const selectedId = answers[preg.id];
          const isOpenQuestion = preg.tipo === "respuesta_corta" || preg.tipo === "completar";

          return (
            <div key={preg.id} className="bg-white rounded-lg shadow p-5">
              <h3 className="font-medium mb-3">{idx + 1}. {preg.texto}</h3>
              {isOpenQuestion ? (
                <textarea
                  value={selectedId || ""}
                  onChange={(e) => handleSelect(preg.id, e.target.value)}
                  disabled={submitted || !estaActiva}
                  className="w-full rounded-lg border border-gray-300 p-3"
                  rows={4}
                  placeholder="Escribe tu respuesta..."
                />
              ) : (
                <div className="space-y-2">
                  {(preg.respuestas || []).map((r) => {
                    const isSelected = selectedId === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => handleSelect(preg.id, r.id)}
                        disabled={submitted || !estaActiva}
                        className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-2 ${
                          isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                        } disabled:cursor-default`}
                      >
                        <span>{r.texto}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted && preguntas.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!estaActiva || submitting || Object.keys(answers).length < preguntas.length}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {t("pruebas.submit", { defaultValue: "Enviar respuestas" })}
          </button>
        </div>
      )}
    </div>
  );
}
