import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import type { Trabajo, TrabajoPregunta, TrabajoPreguntaInput } from "@/shared/types/trabajos";
import { getTrabajoFormulario, updateTrabajoPreguntas } from "@/features/trabajos/services/trabajos";

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg;
    }
  }
  return "Error inesperado";
}

function isClosedType(tipo: TrabajoPreguntaInput["tipo"]): boolean {
  return tipo === "opcion_multiple" || tipo === "verdadero_falso";
}

function mapPreguntaToInput(pregunta: TrabajoPregunta): TrabajoPreguntaInput {
  return {
    texto: pregunta.texto || "",
    tipo: pregunta.tipo,
    opciones: Array.isArray(pregunta.opciones) ? pregunta.opciones : [],
    respuesta_correcta: pregunta.respuesta_correcta || "",
    puntaje_maximo: pregunta.puntaje_maximo || 1,
    pagina_libro: pregunta.pagina_libro ?? undefined,
    confianza_ia: pregunta.confianza_ia ?? undefined,
    imagen_base64: pregunta.imagen_base64 ?? undefined,
    imagen_fuente: pregunta.imagen_fuente ?? undefined,
    respuesta_esperada_tipo: pregunta.respuesta_esperada_tipo ?? undefined,
    placeholder: pregunta.placeholder ?? undefined,
    orden: pregunta.orden,
  };
}

function createEmptyPregunta(): TrabajoPreguntaInput {
  return {
    texto: "",
    tipo: "respuesta_corta",
    opciones: [],
    respuesta_correcta: "",
    puntaje_maximo: 1,
    respuesta_esperada_tipo: "abierta",
    placeholder: "",
  };
}

export default function TeacherTrabajoPreguntas() {
  const navigate = useNavigate();
  const { trabajoId = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [preguntas, setPreguntas] = useState<TrabajoPreguntaInput[]>([]);

  const totalPuntaje = useMemo(
    () => preguntas.reduce((acc, pregunta) => acc + Number(pregunta.puntaje_maximo || 0), 0),
    [preguntas]
  );

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

        const payload = await getTrabajoFormulario(trabajoId);
        setTrabajo(payload.trabajo);
        const initial = (payload.preguntas || []).map(mapPreguntaToInput);
        setPreguntas(initial.length > 0 ? initial : [createEmptyPregunta()]);
      } catch (err) {
        toast.error(normalizeError(err));
        navigate("/teacher/trabajos");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, trabajoId]);

  const handleChange = (index: number, patch: Partial<TrabajoPreguntaInput>) => {
    setPreguntas((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const handleChangeTipo = (index: number, tipo: TrabajoPreguntaInput["tipo"]) => {
    setPreguntas((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (tipo === "verdadero_falso") {
          return {
            ...item,
            tipo,
            opciones: ["Verdadero", "Falso"],
            respuesta_esperada_tipo: "opciones",
          };
        }
        if (tipo === "opcion_multiple") {
          return {
            ...item,
            tipo,
            opciones: item.opciones && item.opciones.length >= 2 ? item.opciones : ["Opción 1", "Opción 2"],
            respuesta_esperada_tipo: "opciones",
          };
        }
        return {
          ...item,
          tipo,
          opciones: [],
          respuesta_correcta: "",
          respuesta_esperada_tipo: "abierta",
        };
      })
    );
  };

  const handleGuardar = async () => {
    if (!trabajoId) return;

    const normalized = preguntas.map((pregunta, index) => {
      const tipo = pregunta.tipo;
      const texto = (pregunta.texto || "").trim();
      const puntaje = Number(pregunta.puntaje_maximo || 1);
      const opciones = (pregunta.opciones || []).map((opt) => opt.trim()).filter(Boolean);
      const respuestaCorrecta = (pregunta.respuesta_correcta || "").trim();

      if (!texto) {
        throw new Error(`La pregunta ${index + 1} no tiene texto`);
      }
      if (!Number.isFinite(puntaje) || puntaje <= 0) {
        throw new Error(`La pregunta ${index + 1} debe tener puntaje mayor a 0`);
      }
      if (tipo === "opcion_multiple" && opciones.length < 2) {
        throw new Error(`La pregunta ${index + 1} debe tener al menos 2 opciones`);
      }
      if (tipo === "verdadero_falso" && opciones.length === 0) {
        opciones.push("Verdadero", "Falso");
      }
      if (isClosedType(tipo) && !respuestaCorrecta) {
        throw new Error(`La pregunta ${index + 1} requiere respuesta correcta`);
      }

      return {
        ...pregunta,
        texto,
        puntaje_maximo: puntaje,
        opciones,
        respuesta_correcta: isClosedType(tipo) ? respuestaCorrecta : undefined,
        respuesta_esperada_tipo: isClosedType(tipo) ? "opciones" : "abierta",
        orden: index + 1,
      } as TrabajoPreguntaInput;
    });

    setSaving(true);
    try {
      const updated = await updateTrabajoPreguntas(trabajoId, { preguntas: normalized });
      setPreguntas(updated.map(mapPreguntaToInput));
      toast.success("Preguntas actualizadas");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={30} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <button type="button" className="text-sm text-blue-600" onClick={() => navigate("/teacher/trabajos")}>
        Volver
      </button>

      <div className="bg-white rounded-lg shadow p-4">
        <h1 className="text-2xl font-bold">Banco de preguntas</h1>
        <p className="text-sm text-gray-500 mt-1">{trabajo?.titulo}</p>
        <p className="text-sm text-gray-500">Puntaje total configurado: {totalPuntaje.toFixed(2)}</p>
      </div>

      <div className="space-y-3">
        {preguntas.map((pregunta, index) => (
          <div key={`pregunta-${index}`} className="bg-white rounded-lg shadow p-4 space-y-3 border border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Pregunta {index + 1}</h2>
              <button
                type="button"
                onClick={() => setPreguntas((prev) => prev.filter((_, idx) => idx !== index))}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </div>

            <label className="text-sm block">
              Enunciado
              <textarea
                rows={2}
                className="mt-1 w-full border rounded px-3 py-2"
                value={pregunta.texto}
                onChange={(e) => handleChange(index, { texto: e.target.value })}
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm block">
                Tipo
                <select
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={pregunta.tipo}
                  onChange={(e) => handleChangeTipo(index, e.target.value as TrabajoPreguntaInput["tipo"])}
                >
                  <option value="opcion_multiple">Opción múltiple</option>
                  <option value="verdadero_falso">Verdadero/Falso</option>
                  <option value="respuesta_corta">Respuesta corta</option>
                  <option value="completar">Completar</option>
                </select>
              </label>

              <label className="text-sm block">
                Puntaje máximo
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={pregunta.puntaje_maximo ?? 1}
                  onChange={(e) => handleChange(index, { puntaje_maximo: Number(e.target.value || 1) })}
                />
              </label>

              <label className="text-sm block">
                Placeholder
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={pregunta.placeholder || ""}
                  onChange={(e) => handleChange(index, { placeholder: e.target.value })}
                />
              </label>
            </div>

            {pregunta.tipo === "opcion_multiple" && (
              <label className="text-sm block">
                Opciones (separadas por coma)
                <input
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={(pregunta.opciones || []).join(", ")}
                  onChange={(e) =>
                    handleChange(index, {
                      opciones: e.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            )}

            {pregunta.tipo === "verdadero_falso" && (
              <p className="text-sm text-gray-500">Opciones fijas: Verdadero, Falso</p>
            )}

            {isClosedType(pregunta.tipo) && (
              <label className="text-sm block">
                Respuesta correcta
                {pregunta.tipo === "verdadero_falso" ? (
                  <select
                    className="mt-1 w-full border rounded px-3 py-2"
                    value={pregunta.respuesta_correcta || ""}
                    onChange={(e) => handleChange(index, { respuesta_correcta: e.target.value })}
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="Verdadero">Verdadero</option>
                    <option value="Falso">Falso</option>
                  </select>
                ) : (
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    value={pregunta.respuesta_correcta || ""}
                    onChange={(e) => handleChange(index, { respuesta_correcta: e.target.value })}
                    placeholder="Ejemplo: opción exacta, índice (1), letra (a)"
                  />
                )}
              </label>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPreguntas((prev) => [...prev, createEmptyPregunta()])}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-slate-700 text-white hover:bg-slate-800"
        >
          <Plus size={14} />
          Agregar pregunta
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleGuardar()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Guardando..." : "Guardar banco de preguntas"}
        </button>
      </div>
    </div>
  );
}
