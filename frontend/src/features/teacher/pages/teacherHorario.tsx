import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock3, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { getMe } from "@/shared/lib/auth";
import type { DocenteMateriaHorario, DocenteMateriaHorarioRequest, MisCursoDocente } from "@/shared/types";
import {
  createHorarioAsignacion,
  deleteHorarioAsignacion,
  listHorariosDocente,
  listMisCursosDocente,
  updateHorarioAsignacion,
} from "@/features/teacher/services/docencia";

const DAY_OPTIONS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miercoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sabado" },
  { value: 7, label: "Domingo" },
];

function normalizeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") return msg;
  }
  return "Error inesperado";
}

function toInputTime(value: string): string {
  const raw = (value || "").trim();
  if (raw.length >= 5) return raw.slice(0, 5);
  return raw;
}

type FormState = {
  asignacion_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  aula: string;
};

const INITIAL_FORM: FormState = {
  asignacion_id: "",
  dia_semana: 1,
  hora_inicio: "08:00",
  hora_fin: "09:00",
  aula: "",
};

export default function TeacherHorario() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MisCursoDocente[]>([]);
  const [horarios, setHorarios] = useState<DocenteMateriaHorario[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const selectedAsignacionFromQuery = searchParams.get("asignacion") || "";

  const loadData = async () => {
    const [misCursos, misHorarios] = await Promise.all([
      listMisCursosDocente(),
      listHorariosDocente(),
    ]);
    setItems(misCursos || []);
    setHorarios(misHorarios || []);

    if (!form.asignacion_id) {
      const preferred = (selectedAsignacionFromQuery || "").trim();
      const selected = preferred && (misCursos || []).some((x) => x.asignacion_id === preferred)
        ? preferred
        : (misCursos || [])[0]?.asignacion_id || "";
      setForm((prev) => ({ ...prev, asignacion_id: selected }));
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const me = await getMe();
        if (!me || !["teacher", "admin", "super_admin"].includes(me.role || "")) {
          navigate("/login");
          return;
        }
        await loadData();
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const selectedAsignacion = useMemo(() => {
    return items.find((x) => x.asignacion_id === form.asignacion_id) || null;
  }, [items, form.asignacion_id]);

  const horariosAsignacion = useMemo(() => {
    return horarios
      .filter((h) => h.asignacion_id === form.asignacion_id)
      .sort((a, b) => {
        if (a.dia_semana !== b.dia_semana) return a.dia_semana - b.dia_semana;
        return a.hora_inicio.localeCompare(b.hora_inicio);
      });
  }, [horarios, form.asignacion_id]);

  const onSubmit = async () => {
    if (!form.asignacion_id) {
      toast.error(t("teacher.horario.validation.assignment", { defaultValue: "Selecciona una materia" }));
      return;
    }
    if (!form.hora_inicio || !form.hora_fin) {
      toast.error(t("teacher.horario.validation.hours", { defaultValue: "Completa hora inicio y fin" }));
      return;
    }

    const payload: DocenteMateriaHorarioRequest = {
      dia_semana: form.dia_semana,
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
      aula: form.aula.trim() || undefined,
      activo: true,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateHorarioAsignacion(editingId, payload);
        toast.success(t("teacher.horario.updated", { defaultValue: "Horario actualizado" }));
      } else {
        await createHorarioAsignacion(form.asignacion_id, payload);
        toast.success(t("teacher.horario.created", { defaultValue: "Horario agregado" }));
      }

      setEditingId(null);
      setForm((prev) => ({ ...INITIAL_FORM, asignacion_id: prev.asignacion_id || form.asignacion_id }));
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (item: DocenteMateriaHorario) => {
    setEditingId(item.id);
    setForm({
      asignacion_id: item.asignacion_id,
      dia_semana: item.dia_semana,
      hora_inicio: toInputTime(item.hora_inicio),
      hora_fin: toInputTime(item.hora_fin),
      aula: item.aula || "",
    });
  };

  const onDelete = async (id: string) => {
    if (!confirm(t("teacher.horario.confirmDelete", { defaultValue: "Eliminar horario?" }))) return;
    try {
      await deleteHorarioAsignacion(id);
      setHorarios((prev) => prev.filter((x) => x.id !== id));
      toast.success(t("teacher.horario.deleted", { defaultValue: "Horario eliminado" }));
      if (editingId === id) {
        setEditingId(null);
        setForm((prev) => ({ ...INITIAL_FORM, asignacion_id: prev.asignacion_id }));
      }
    } catch (err) {
      toast.error(normalizeError(err));
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
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("teacher.horario.title", { defaultValue: "Mi horario" })}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("teacher.horario.subtitle", { defaultValue: "Gestion semanal por materia asignada" })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-white rounded-xl shadow border border-gray-100 p-4 lg:col-span-1">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <CalendarDays size={16} />
            {editingId
              ? t("teacher.horario.edit", { defaultValue: "Editar bloque" })
              : t("teacher.horario.add", { defaultValue: "Agregar bloque" })}
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.horario.fields.subject", { defaultValue: "Materia" })}</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.asignacion_id}
                onChange={(e) => setForm((prev) => ({ ...prev, asignacion_id: e.target.value }))}
              >
                <option value="">{t("teacher.horario.fields.select", { defaultValue: "Seleccionar" })}</option>
                {items.map((item) => (
                  <option key={item.asignacion_id} value={item.asignacion_id}>
                    {item.materia_nombre} - {item.curso_nombre} ({item.anio_escolar})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.horario.fields.day", { defaultValue: "Dia" })}</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.dia_semana}
                onChange={(e) => setForm((prev) => ({ ...prev, dia_semana: Number(e.target.value) }))}
              >
                {DAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">{t("teacher.horario.fields.start", { defaultValue: "Inicio" })}</label>
                <input
                  type="time"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={form.hora_inicio}
                  onChange={(e) => setForm((prev) => ({ ...prev, hora_inicio: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("teacher.horario.fields.end", { defaultValue: "Fin" })}</label>
                <input
                  type="time"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={form.hora_fin}
                  onChange={(e) => setForm((prev) => ({ ...prev, hora_fin: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("teacher.horario.fields.classroom", { defaultValue: "Aula (opcional)" })}</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.aula}
                onChange={(e) => setForm((prev) => ({ ...prev, aula: e.target.value }))}
                placeholder={t("teacher.horario.fields.classroomPlaceholder", { defaultValue: "Ej: Laboratorio 2" })}
              />
            </div>
          </div>

          {selectedAsignacion && (
            <p className="mt-3 text-xs text-gray-500">
              {selectedAsignacion.materia_nombre} - {selectedAsignacion.curso_nombre} ({selectedAsignacion.anio_escolar})
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={onSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {editingId
                ? t("teacher.horario.actions.update", { defaultValue: "Actualizar" })
                : t("teacher.horario.actions.create", { defaultValue: "Agregar" })}
            </button>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setForm((prev) => ({ ...INITIAL_FORM, asignacion_id: prev.asignacion_id }));
                }}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {t("teacher.horario.actions.cancel", { defaultValue: "Cancelar" })}
              </button>
            )}
          </div>
        </section>

        <section className="bg-white rounded-xl shadow border border-gray-100 p-4 lg:col-span-2">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Clock3 size={16} />
            {t("teacher.horario.table.title", { defaultValue: "Bloques cargados" })}
          </h2>

          {horariosAsignacion.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              {t("teacher.horario.table.empty", { defaultValue: "No hay horarios para esta materia." })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{t("teacher.horario.table.day", { defaultValue: "Dia" })}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{t("teacher.horario.table.time", { defaultValue: "Horario" })}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{t("teacher.horario.table.classroom", { defaultValue: "Aula" })}</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">{t("teacher.horario.table.actions", { defaultValue: "Acciones" })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {horariosAsignacion.map((row) => {
                    const day = DAY_OPTIONS.find((d) => d.value === row.dia_semana)?.label || String(row.dia_semana);
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm font-medium">{day}</td>
                        <td className="px-3 py-2 text-sm">{toInputTime(row.hora_inicio)} - {toInputTime(row.hora_fin)}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{row.aula || "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => onEdit(row)}
                              className="p-2 rounded text-blue-600 hover:bg-blue-50"
                              title={t("teacher.horario.actions.edit", { defaultValue: "Editar" })}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => onDelete(row.id)}
                              className="p-2 rounded text-red-600 hover:bg-red-50"
                              title={t("teacher.horario.actions.delete", { defaultValue: "Eliminar" })}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
