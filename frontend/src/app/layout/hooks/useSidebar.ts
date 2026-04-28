import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe, type AuthUser } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { listMisMateriasEstudiante } from "@/shared/services/studentAcademic";
import type { Curso, Materia, MisCursoDocente } from "@/shared/types";

interface UseSidebarOptions {
  open: boolean;
  setSidebarOpen?: (val: boolean) => void;
  textSizeLarge: boolean;
  setTextSizeLarge: (val: boolean) => void;
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
  visualAlertsEnabled: boolean;
  voiceReadingEnabled: boolean;
  setVisualAlertsEnabled: (val: boolean) => void;
  setVoiceReadingEnabled: (val: boolean) => void;
}

type TeacherLearnMateria = {
  asignacion_id: string;
  materia_id: string;
  materia_nombre: string;
  curso_nombre: string;
  anio_escolar: string;
};

type AdminLearnCurso = {
  id: string;
  nombre: string;
  total_materias: number;
  materias: {
    id: string;
    nombre: string;
    anio_escolar?: string;
  }[];
};

function unwrapList<T>(value: T[] | { data?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { data?: T[] }).data)) {
    return (value as { data?: T[] }).data ?? [];
  }
  return [];
}

export function useSidebar(opts: UseSidebarOptions) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [studentMaterias, setStudentMaterias] = useState<Materia[]>([]);
  const [teacherMaterias, setTeacherMaterias] = useState<TeacherLearnMateria[]>([]);
  const [adminCursos, setAdminCursos] = useState<AdminLearnCurso[]>([]);

  useEffect(() => {
    let active = true;

    const loadTeacherMaterias = async () => {
      try {
        const response = await api.get<MisCursoDocente[] | { data?: MisCursoDocente[] }>("/teacher/mis-cursos");
        const items = unwrapList(response)
          .map((item) => ({
            asignacion_id: item.asignacion_id,
            materia_id: item.materia_id,
            materia_nombre: item.materia_nombre,
            curso_nombre: item.curso_nombre,
            anio_escolar: item.anio_escolar,
          }))
          .sort((a, b) => {
            const aCourse = a.curso_nombre.toLowerCase();
            const bCourse = b.curso_nombre.toLowerCase();
            if (aCourse !== bCourse) return aCourse.localeCompare(bCourse);
            return a.materia_nombre.toLowerCase().localeCompare(b.materia_nombre.toLowerCase());
          });
        if (active) setTeacherMaterias(items);
      } catch {
        if (active) setTeacherMaterias([]);
      }
    };

    const loadAdminCursos = async () => {
      try {
        const cursosResponse = await api.get<Curso[] | { data?: Curso[] }>("/cursos");
        const cursos = unwrapList(cursosResponse);

        const cursosWithMaterias = await Promise.all(
          cursos.map(async (curso) => {
            try {
              const materiasResponse = await api.get<Materia[] | { data?: Materia[] }>(`/cursos/${curso.id}/materias`);
              const materias = unwrapList(materiasResponse);
              const sortedMaterias = [...materias].sort((a, b) => {
                const nameCompare = a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase());
                if (nameCompare !== 0) return nameCompare;
                return (a.anio_escolar || "").localeCompare(b.anio_escolar || "");
              });
              return {
                id: curso.id,
                nombre: curso.nombre,
                total_materias: materias.length,
                materias: sortedMaterias.map((materia) => ({
                  id: materia.id,
                  nombre: materia.nombre,
                  anio_escolar: materia.anio_escolar || undefined,
                })),
              };
            } catch {
              return {
                id: curso.id,
                nombre: curso.nombre,
                total_materias: 0,
                materias: [],
              };
            }
          }),
        );

        cursosWithMaterias.sort((a, b) => a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase()));
        if (active) setAdminCursos(cursosWithMaterias);
      } catch {
        if (active) setAdminCursos([]);
      }
    };

    const loadProfile = async () => {
      const me = await getMe();
      if (!active) return;

      setProfile(me);
      setStudentMaterias([]);
      setTeacherMaterias([]);
      setAdminCursos([]);

      if (me?.role === "student") {
        try {
          const materias = await listMisMateriasEstudiante();
          if (active) setStudentMaterias(materias);
        } catch {
          if (active) setStudentMaterias([]);
        }
        return;
      }

      if (me?.role === "teacher") {
        await loadTeacherMaterias();
        return;
      }

      if (me?.role === "admin" || me?.role === "super_admin") {
        await loadAdminCursos();
      }
    };

    void loadProfile();
    const onAuthChange = () => { void loadProfile(); };
    window.addEventListener("auth-change", onAuthChange);
    return () => {
      active = false;
      window.removeEventListener("auth-change", onAuthChange);
    };
  }, []);

  const toggleMenu = useCallback((key: string) => {
    setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleTextSize = useCallback(() => {
    opts.setTextSizeLarge(!opts.textSizeLarge);
    try { (window as any).triggerVisualAlert?.({ message: t("accessibility.textSizeToggled") }); } catch { /* */ }
    try { (window as any).speak?.(t("accessibility.textSizeToggled")); } catch { /* */ }
  }, [opts, t]);

  const toggleHighContrast = useCallback(() => {
    opts.setHighContrast(!opts.highContrast);
    try { (window as any).triggerVisualAlert?.({ message: t("accessibility.highContrastToggled") }); } catch { /* */ }
    try { (window as any).speak?.(t("accessibility.highContrastToggled")); } catch { /* */ }
  }, [opts, t]);

  const toggleVisualAlerts = useCallback(() => {
    opts.setVisualAlertsEnabled(!opts.visualAlertsEnabled);
    try { (window as any).speak?.(t("accessibility.visualAlertsToggled")); } catch { /* */ }
  }, [opts, t]);

  const toggleVoiceReading = useCallback(() => {
    opts.setVoiceReadingEnabled(!opts.voiceReadingEnabled);
    try { (window as any).triggerVisualAlert?.({ message: t("accessibility.voiceReadingToggled") }); } catch { /* */ }
  }, [opts, t]);

  return {
    navigate,
    t,
    sidebarRef,
    openMenus,
    toggleMenu,
    helpOpen,
    setHelpOpen,
    profile,
    studentMaterias,
    teacherMaterias,
    adminCursos,
    toggleTextSize,
    toggleHighContrast,
    toggleVisualAlerts,
    toggleVoiceReading,
  };
}
