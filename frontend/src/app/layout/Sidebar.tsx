import { type FC } from "react";
import {
  Settings,
  BookOpenText,
  PersonStanding,
  FlaskConical,
  ChevronRight,
  ChevronDown,
  Atom,
  FlaskRound,
  Eye,
  Volume2,
  Type,
  Contrast,
  FileSpreadsheet,
  X,
  LayoutDashboard,
  Library,
  CalendarDays,
} from "lucide-react";
import HelpModal from "./HelpModal";
import { useSidebar } from "@/app/layout/hooks/useSidebar";

interface SidebarProps {
  open: boolean;
  textSizeLarge: boolean;
  setTextSizeLarge: (val: boolean) => void;
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
  setSidebarOpen?: (val: boolean) => void;
  visualAlertsEnabled?: boolean;
  voiceReadingEnabled?: boolean;
  setVisualAlertsEnabled?: (val: boolean) => void;
  setVoiceReadingEnabled?: (val: boolean) => void;
}

const SidebarItem = ({
  onClick,
  icon: Icon,
  label,
  iconSize = 18,
  isActive = false,
}: {
  onClick: () => void;
  icon: any;
  label: string;
  iconSize?: number;
  isActive?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-3 w-full p-2.5 rounded-xl transition-all duration-200 text-left group
      ${isActive
        ? "bg-white/15 text-white border-l-[3px] border-indigo-400 pl-3"
        : "text-white/70 hover:bg-white/10 hover:text-white border-l-[3px] border-transparent hover:border-white/30 pl-3"
      }`}
  >
    <Icon size={iconSize} className={`shrink-0 transition-colors ${isActive ? "text-indigo-300" : "text-white/50 group-hover:text-white/80"}`} />
    <span className="truncate">{label}</span>
  </button>
);

const SectionLabel = ({ label }: { label: string }) => (
  <div className="px-3 pt-4 pb-1">
    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</span>
  </div>
);

const Sidebar: FC<SidebarProps> = ({
  open,
  textSizeLarge,
  setTextSizeLarge,
  highContrast,
  setHighContrast,
  setSidebarOpen,
  visualAlertsEnabled = false,
  voiceReadingEnabled = false,
  setVisualAlertsEnabled = () => {},
  setVoiceReadingEnabled = () => {},
}) => {
  const hook = useSidebar({
    open,
    setSidebarOpen,
    textSizeLarge,
    setTextSizeLarge,
    highContrast,
    setHighContrast,
    visualAlertsEnabled,
    voiceReadingEnabled,
    setVisualAlertsEnabled,
    setVoiceReadingEnabled,
  });

  const isAdmin = hook.profile?.role === "admin" || hook.profile?.role === "super_admin";
  const isTeacher = hook.profile?.role === "teacher";
  const isTeacherOrAdmin = isTeacher || isAdmin;
  const contentRoute = (type?: string) => {
    if (isTeacherOrAdmin) return "/teacher/materias";
    return type ? `/contents?type=${type}` : "/contents";
  };

  const ToggleRow = ({
    icon: Icon,
    label,
    active,
    onClick,
  }: {
    icon: any;
    label: string;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      aria-pressed={active}
      onClick={onClick}
      className="flex items-center justify-between w-full p-2.5 rounded-xl hover:bg-white/10 transition-all duration-200 text-left text-white/70 hover:text-white group pl-3 border-l-[3px] border-transparent"
    >
      <div className="flex items-center space-x-3">
        <Icon size={16} className="text-white/50 group-hover:text-white/80 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`w-8 h-4 rounded-full transition-all duration-300 flex items-center ${active ? "bg-emerald-400 justify-end" : "bg-white/20 justify-start"}`}>
        <div className={`w-3 h-3 rounded-full mx-0.5 transition-all ${active ? "bg-white shadow-sm" : "bg-white/60"}`} />
      </div>
    </button>
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          role="presentation"
          onClick={() => setSidebarOpen?.(false)}
        />
      )}

      <aside
        id="main-sidebar"
        className={`fixed top-[64px] left-0 w-64 transform transition-transform duration-300 ease-in-out z-40 
        ${open ? "translate-x-0" : "-translate-x-full"}
        ${highContrast ? "bg-black text-yellow-300" : "bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-white"}
        h-[calc(100vh-64px)] overflow-y-auto`}
        style={!highContrast ? { boxShadow: "4px 0 24px rgba(0, 0, 0, 0.15)" } : undefined}
        aria-label={hook.t("sidebarLabel")}
        aria-hidden={!open}
        role="dialog"
        aria-modal={open}
        ref={hook.sidebarRef}
      >
        <nav className={`flex flex-col p-3 space-y-0.5 ${textSizeLarge ? "text-base" : "text-sm"}`}>
          <div className="lg:hidden flex justify-end mb-3">
            <button 
              aria-label={hook.t("close")} 
              onClick={() => setSidebarOpen?.(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Learn Section */}
          <SectionLabel label={hook.t("learn")} />
          <button
            onClick={() => hook.toggleMenu("aprende")}
            className="flex items-center justify-between w-full p-2.5 rounded-xl hover:bg-white/10 transition-all duration-200 text-white/80 hover:text-white group pl-3 border-l-[3px] border-transparent"
          >
            <div className="flex items-center space-x-3">
              <BookOpenText size={18} className="text-indigo-400" />
              <span className="font-medium">{hook.t("learn")}</span>
            </div>
            {hook.openMenus.aprende ? <ChevronDown size={16} className="text-white/40" /> : <ChevronRight size={16} className="text-white/40" />}
          </button>

          {hook.openMenus.aprende && (
            <div className="ml-3 mt-0.5 flex flex-col space-y-0.5 animate-fade-in">
              <SidebarItem onClick={() => hook.navigate(contentRoute("molecule"))} icon={Atom} label={hook.t("molecules")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate(contentRoute("atom"))} icon={FlaskRound} label={hook.t("atoms")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate(contentRoute("periodic-table"))} icon={FlaskConical} label={hook.t("periodicTable")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/lessons")} icon={BookOpenText} label={hook.t("lessons.title")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate(contentRoute("chemical-reaction"))} icon={FlaskConical} label={hook.t("chemicalReactions")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate(contentRoute("article"))} icon={BookOpenText} label={hook.t("article")} iconSize={16} />
            </div>
          )}

          <SidebarItem
            onClick={() => hook.navigate(contentRoute())}
            icon={BookOpenText}
            label={isTeacherOrAdmin ? hook.t("teacher.subjects.navTitle", { defaultValue: "Mis materias" }) : hook.t("contents.title")}
          />
          <SidebarItem onClick={() => hook.navigate(contentRoute("experiment"))} icon={FlaskConical} label={hook.t("experiments")} iconSize={16} />

          {/* Accessibility */}
          <SectionLabel label={hook.t("accessibility")} />
          <button
            onClick={() => hook.toggleMenu("accesibilidad")}
            className="flex items-center justify-between w-full p-2.5 rounded-xl hover:bg-white/10 transition-all duration-200 text-white/80 hover:text-white group pl-3 border-l-[3px] border-transparent"
          >
            <div className="flex items-center space-x-3">
              <PersonStanding size={16} className="text-violet-400" />
              <span className="font-medium">{hook.t("accessibility")}</span>
            </div>
            {hook.openMenus.accesibilidad ? <ChevronDown size={16} className="text-white/40" /> : <ChevronRight size={16} className="text-white/40" />}
          </button>

          {hook.openMenus.accesibilidad && (
            <div className="ml-3 mt-0.5 flex flex-col space-y-0.5 animate-fade-in">
              <ToggleRow icon={Eye} label={hook.t("visualAlerts")} active={visualAlertsEnabled} onClick={hook.toggleVisualAlerts} />
              <ToggleRow icon={Volume2} label={hook.t("voiceReading")} active={voiceReadingEnabled} onClick={hook.toggleVoiceReading} />
              <ToggleRow icon={Type} label={hook.t("textSize")} active={textSizeLarge} onClick={hook.toggleTextSize} />
              <ToggleRow icon={Contrast} label={hook.t("highContrast")} active={highContrast} onClick={hook.toggleHighContrast} />
            </div>
          )}

          <SidebarItem onClick={() => hook.navigate("/settings")} icon={Settings} label={hook.t("settings")} />

          {/* Teacher/Admin items */}
          {hook.profile && (isTeacher || isAdmin) && (
            <>
              <SectionLabel label={isAdmin ? "Admin / Docente" : "Docente"} />
              <SidebarItem
                onClick={() => hook.navigate("/teacher/materias")}
                icon={BookOpenText}
                label={hook.t("teacher.subjects.navTitle", { defaultValue: "Mis materias" })}
                iconSize={16}
              />
              <SidebarItem onClick={() => hook.navigate("/teacher/pruebas")} icon={BookOpenText} label={isAdmin ? hook.t("teacher.pruebas.titleAll") : hook.t("teacher.pruebas.title")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/trabajos")} icon={BookOpenText} label={hook.t("teacher.trabajos.title", { defaultValue: "Trabajos" })} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/trabajos/analytics")} icon={LayoutDashboard} label={hook.t("teacher.trabajos.analytics.nav", { defaultValue: "Analytics v2" })} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/recursos")} icon={Library} label={hook.t("teacher.recursos.title", { defaultValue: "Recursos" })} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/recursos-personales")} icon={Library} label={hook.t("teacher.recursos.personal.title", { defaultValue: "Recursos personales" })} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/performance")} icon={BookOpenText} label={isAdmin ? hook.t("teacher.performance.titleAll") : hook.t("teacher.performance.title")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/cursos")} icon={BookOpenText} label={hook.t("teacher.cursos.title", { defaultValue: "Mis cursos" })} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/horario")} icon={CalendarDays} label={hook.t("teacher.horario.title", { defaultValue: "Mi horario" })} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/teacher/estudiantes")} icon={BookOpenText} label={hook.t("teacher.estudiantes.title", { defaultValue: "Mis Estudiantes" })} iconSize={16} />
              {!isAdmin && (
                <SidebarItem onClick={() => hook.navigate("/teacher/bulk-import")} icon={FileSpreadsheet} label="Importar Estudiantes" iconSize={16} />
              )}
            </>
          )}

          {/* Admin only */}
          {hook.profile && isAdmin && (
            <>
              <SectionLabel label="Administración" />
              <SidebarItem onClick={() => hook.navigate("/admin/dashboard")} icon={LayoutDashboard} label={hook.t("admin.dashboard.title")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/admin/users")} icon={PersonStanding} label={hook.t("admin.users.title")} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/admin/cursos")} icon={BookOpenText} label={hook.t("admin.cursos.title", { defaultValue: "Cursos" })} iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/admin/bulk-import")} icon={FileSpreadsheet} label="Crear Cuentas (Masivo)" iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/admin/bulk-enroll")} icon={FileSpreadsheet} label="Inscribir Estudiantes (Masivo)" iconSize={16} />
            </>
          )}

          {/* Student dashboard */}
          {hook.profile?.role === "student" && (
            <>
              <SectionLabel label="Estudiante" />
              <SidebarItem onClick={() => hook.navigate("/student/dashboard")} icon={LayoutDashboard} label="Dashboard" iconSize={16} />
              <SidebarItem onClick={() => hook.navigate("/student/trabajos")} icon={BookOpenText} label={hook.t("student.trabajos.title", { defaultValue: "Mis Trabajos" })} iconSize={16} />
            </>
          )}
        </nav>

        <div className="mt-auto p-4 border-t border-white/10 pt-3">
          <button
            onClick={() => hook.setHelpOpen(true)}
            className="w-full flex items-center justify-center space-x-2 p-2.5 rounded-xl hover:bg-white/10 transition-all duration-200 text-sm text-white/60 hover:text-white"
            aria-label={hook.t("help")}
          >
            <span>❔</span>
            <span>{hook.t("help")}</span>
          </button>
        </div>
      </aside>
      <HelpModal open={hook.helpOpen} onClose={() => hook.setHelpOpen(false)} />
    </>
  );
};

export default Sidebar;
