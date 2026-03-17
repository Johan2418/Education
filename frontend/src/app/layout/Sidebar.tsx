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
  Plus,
  FileSpreadsheet,
  X,
  LayoutDashboard,
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

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          role="presentation"
          onClick={() => setSidebarOpen?.(false)}
        />
      )}

      <aside
        id="main-sidebar"
        className={`fixed top-[64px] left-0 w-64 transform transition-transform duration-300 ease-in-out z-40 
        ${open ? "translate-x-0" : "-translate-x-full"}
        ${highContrast ? "bg-black text-yellow-300" : "bg-blue-900 text-white"}
        h-[calc(100vh-64px)] overflow-y-auto shadow-lg`}
        aria-label={hook.t("sidebarLabel")}
        aria-hidden={!open}
        role="dialog"
        aria-modal={open}
        ref={hook.sidebarRef}
      >
        <nav className={`flex flex-col p-4 space-y-2 ${textSizeLarge ? "text-lg" : "text-sm"}`}>
          <div className="lg:hidden flex justify-end mb-4">
            <button aria-label={hook.t("close")} onClick={() => setSidebarOpen?.(false)}>
              <X size={20} />
            </button>
          </div>

          {/* Learn */}
          <button
            onClick={() => hook.toggleMenu("aprende")}
            className="flex items-center justify-between w-full p-2 rounded hover:bg-blue-800 transition"
          >
            <div className="flex items-center space-x-2">
              <BookOpenText size={18} /> <span>{hook.t("learn")}</span>
            </div>
            {hook.openMenus.aprende ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {hook.openMenus.aprende && (
            <div className="ml-6 mt-1 flex flex-col space-y-1">
              <button onClick={() => hook.navigate("/contents?type=molecule")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <Atom size={16} /> <span>{hook.t("molecules")}</span>
              </button>
              <button onClick={() => hook.navigate("/contents?type=atom")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <FlaskRound size={16} /> <span>{hook.t("atoms")}</span>
              </button>
              <button onClick={() => hook.navigate("/contents?type=periodic-table")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <FlaskConical size={16} /> <span>{hook.t("periodicTable")}</span>
              </button>
              <button onClick={() => hook.navigate("/lessons")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} /> <span>{hook.t("lessons.title")}</span>
              </button>
              <button onClick={() => hook.navigate("/contents?type=chemical-reaction")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <FlaskConical size={16} /> <span>{hook.t("chemicalReactions")}</span>
              </button>
              <button onClick={() => hook.navigate("/contents?type=article")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} /> <span>{hook.t("article")}</span>
              </button>
            </div>
          )}

          <button onClick={() => hook.navigate("/contents")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
            <BookOpenText size={18} /> <span>{hook.t("contents.title")}</span>
          </button>
          <button onClick={() => hook.navigate("/contents?type=experiment")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
            <FlaskConical size={16} /> <span>{hook.t("experiments")}</span>
          </button>

          {/* Accessibility */}
          <button
            onClick={() => hook.toggleMenu("accesibilidad")}
            className="flex items-center justify-between w-full p-2 rounded hover:bg-blue-800 transition"
          >
            <div className="flex items-center space-x-2">
              <PersonStanding size={16} /> <span>{hook.t("accessibility")}</span>
            </div>
            {hook.openMenus.accesibilidad ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {hook.openMenus.accesibilidad && (
            <div className="ml-6 mt-1 flex flex-col space-y-1">
              <button aria-pressed={visualAlertsEnabled} onClick={hook.toggleVisualAlerts} className="flex items-center justify-between w-full p-2 rounded hover:bg-blue-800 transition text-left">
                <div className="flex items-center space-x-2"><Eye size={16} /> <span>{hook.t("visualAlerts")}</span></div>
                <div className={`w-2 h-2 rounded-full ${visualAlertsEnabled ? "bg-emerald-400" : "bg-gray-500"}`} />
              </button>
              <button aria-pressed={voiceReadingEnabled} onClick={hook.toggleVoiceReading} className="flex items-center justify-between w-full p-2 rounded hover:bg-blue-800 transition text-left">
                <div className="flex items-center space-x-2"><Volume2 size={16} /> <span>{hook.t("voiceReading")}</span></div>
                <div className={`w-2 h-2 rounded-full ${voiceReadingEnabled ? "bg-emerald-400" : "bg-gray-500"}`} />
              </button>
              <button aria-pressed={textSizeLarge} onClick={hook.toggleTextSize} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <Type size={16} /> <span>{hook.t("textSize")}</span>
                <div className={`w-2 h-2 rounded-full ${textSizeLarge ? "bg-emerald-400" : "bg-gray-500"}`} />
              </button>
              <button aria-pressed={highContrast} onClick={hook.toggleHighContrast} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <Contrast size={16} /> <span>{hook.t("highContrast")}</span>
                <div className={`w-2 h-2 rounded-full ${highContrast ? "bg-emerald-400" : "bg-gray-500"}`} />
              </button>
            </div>
          )}

          <button onClick={() => hook.navigate("/settings")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
            <Settings size={18} /> <span>{hook.t("settings")}</span>
          </button>

          {/* Teacher/Admin items */}
          {hook.profile && (isTeacher || isAdmin) && (
            <>
              <button onClick={() => hook.navigate("/add-content")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <Plus size={16} /> <span>{hook.t("addContent")}</span>
              </button>
              <button onClick={() => hook.navigate("/teacher/contents")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} />
                <span>{isAdmin ? hook.t("teacher.contents.titleAll") : hook.t("teacher.myContents")}</span>
              </button>
              <button onClick={() => hook.navigate("/teacher/pruebas")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} />
                <span>{isAdmin ? hook.t("teacher.pruebas.titleAll") : hook.t("teacher.pruebas.title")}</span>
              </button>
              <button onClick={() => hook.navigate("/teacher/trabajos")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} />
                <span>{hook.t("teacher.trabajos.title", { defaultValue: "Trabajos" })}</span>
              </button>
              <button onClick={() => hook.navigate("/teacher/trabajos/analytics")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <LayoutDashboard size={16} />
                <span>{hook.t("teacher.trabajos.analytics.nav", { defaultValue: "Analytics v2" })}</span>
              </button>
              <button onClick={() => hook.navigate("/teacher/performance")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} />
                <span>{isAdmin ? hook.t("teacher.performance.titleAll") : hook.t("teacher.performance.title")}</span>
              </button>
              <button onClick={() => hook.navigate("/teacher/estudiantes")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} />
                <span>{hook.t("teacher.estudiantes.title", { defaultValue: "Mis Estudiantes" })}</span>
              </button>
              {!isAdmin && (
                <button onClick={() => hook.navigate("/teacher/bulk-import")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                  <FileSpreadsheet size={16} />
                  <span>Importar Estudiantes</span>
                </button>
              )}
            </>
          )}

          {/* Admin only */}
          {hook.profile && isAdmin && (
            <>
              <button onClick={() => hook.navigate("/admin/dashboard")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <LayoutDashboard size={16} /> <span>{hook.t("admin.dashboard.title")}</span>
              </button>
              <button onClick={() => hook.navigate("/admin/users")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <PersonStanding size={16} /> <span>{hook.t("admin.users.title")}</span>
              </button>
              <button onClick={() => hook.navigate("/admin/cursos")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} /> <span>{hook.t("admin.cursos.title", { defaultValue: "Cursos" })}</span>
              </button>
              <button onClick={() => hook.navigate("/admin/bulk-import")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <FileSpreadsheet size={16} /> <span>Crear Cuentas (Masivo)</span>
              </button>
              <button onClick={() => hook.navigate("/admin/bulk-enroll")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <FileSpreadsheet size={16} /> <span>Inscribir Estudiantes (Masivo)</span>
              </button>
            </>
          )}

          {/* Student dashboard */}
          {hook.profile?.role === "student" && (
            <>
              <button onClick={() => hook.navigate("/student/dashboard")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <LayoutDashboard size={16} /> <span>Dashboard</span>
              </button>
              <button onClick={() => hook.navigate("/student/trabajos")} className="flex items-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-left">
                <BookOpenText size={16} /> <span>{hook.t("student.trabajos.title", { defaultValue: "Mis Trabajos" })}</span>
              </button>
            </>
          )}
        </nav>

        <div className="mt-auto p-4 border-t pt-3">
          <button
            onClick={() => hook.setHelpOpen(true)}
            className="w-full flex items-center justify-center space-x-2 p-2 rounded hover:bg-blue-800 transition text-sm"
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
