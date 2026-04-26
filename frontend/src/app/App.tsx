import Navbar from "@/app/layout/Navbar";
import Footer from "@/app/layout/Footer";
import Sidebar from "@/app/layout/Sidebar";
import { useEffect, useState } from "react";
import MainContent from "@/app/layout/MainContent";
import "@/shared/config/i18n";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "@/features/auth/pages/login";
// import Register from "@/features/auth/pages/register"; // Registration disabled
import ResetPassword from "@/features/auth/pages/resetPassword";
import VerifyEmail from "@/features/auth/pages/verifyEmail";
import VisualAlert from "@/shared/components/VisualAlert";
import { Toaster } from "react-hot-toast";
import SettingsPage from "@/features/settings/pages/settings";
import ContentsPage from "@/features/content/pages/contents";
import ContenidoPage from "@/features/content/pages/contenido";
import TeacherDashboard from "@/features/teacher/pages/teacherDashboard";
import TeacherLessons from "@/features/lessons/pages/teacherLessons";
import TeacherPruebas from "@/features/pruebas/pages/teacherPruebas";
import TeacherPerformance from "@/features/performance/pages/teacherPerformance";
import LessonsPage from "@/features/lessons/pages/lessons";
import LessonDetailPage from "@/features/lessons/pages/lessonDetail";
import TeacherLessonSectionsPage from "@/features/lessons/pages/teacherLessonSections";
import PruebaPage from "@/features/pruebas/pages/prueba";
import AdminUsers from "@/features/admin/pages/adminUsers";
import AdminDashboard from "@/features/admin/pages/adminDashboard";
import AdminModelos from "@/features/admin/pages/adminModelos";
import AdminCursos from "@/features/admin/pages/adminCursos";
import AdminBulkImport from "@/features/admin/pages/adminBulkImport";
import AdminBulkEnroll from "@/features/admin/pages/adminBulkEnroll";
import TeacherEstudiantes from "@/features/teacher/pages/teacherEstudiantes";
import TeacherBulkImport from "@/features/teacher/pages/teacherBulkImport";
import TeacherMisCursos from "@/features/teacher/pages/teacherMisCursos";
import TeacherHorario from "@/features/teacher/pages/teacherHorario";
import TeacherMaterias from "@/features/teacher/pages/teacherMaterias";
import TeacherTrabajos from "@/features/trabajos/pages/teacherTrabajos";
import TeacherTrabajoCalificar from "@/features/trabajos/pages/teacherTrabajoCalificar";
import TeacherTrabajoLibroWizard from "@/features/trabajos/pages/teacherTrabajoLibroWizard";
import TeacherTrabajoReportes from "@/features/trabajos/pages/teacherTrabajoReportes";
import TeacherTrabajosAnalytics from "@/features/trabajos/pages/teacherTrabajosAnalytics";
import TeacherRecursos from "@/features/resources/pages/teacherRecursos";
import TeacherRecursoViewer from "@/features/resources/pages/teacherRecursoViewer";
import TeacherRecursosPersonales from "@/features/resources/pages/teacherRecursosPersonales";
import StudentDashboard from "@/features/student/pages/studentDashboard";
import StudentTrabajos from "@/features/trabajos/pages/studentTrabajos";
import StudentTrabajoDetail from "@/features/trabajos/pages/studentTrabajoDetail";
import Molecules from "@/features/chemistry/pages/molecules";
import Atoms from "@/features/chemistry/pages/atoms";
import PeriodicTable from "@/features/chemistry/pages/periodicTable";
import ChemicalReactions from "@/features/chemistry/pages/chemicalReactions";
import Experiments from "@/features/chemistry/pages/experiments";
import Articles from "@/features/chemistry/pages/articles";

function App() {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" ? window.innerWidth >= 1024 : true;
    } catch {
      return true;
    }
  });
  const [textSizeLarge, setTextSizeLarge] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("textSizeLarge") || "false"); } catch { return false; }
  });
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("highContrast") || "false"); } catch { return false; }
  });
  const [visualAlertsEnabled, setVisualAlertsEnabled] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("visualAlertsEnabled") || "false"); } catch { return false; }
  });
  const [voiceReadingEnabled, setVoiceReadingEnabled] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("voiceReadingEnabled") || "false"); } catch { return false; }
  });
  const [alert, setAlert] = useState<{ message: string; highlightSelector?: string } | null>(null);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (e.ctrlKey && e.key.toLowerCase() === "b") { e.preventDefault(); setSidebarOpen((p) => !p); }
      if (e.ctrlKey && e.key.toLowerCase() === "h") { e.preventDefault(); setHighContrast((p) => !p); }
      if (e.ctrlKey && (e.key === "+" || e.key === "=")) { e.preventDefault(); setTextSizeLarge(true); }
      if (e.ctrlKey && e.key === "-") { e.preventDefault(); setTextSizeLarge(false); }
      if (e.ctrlKey && e.key.toLowerCase() === "r") { e.preventDefault(); window.location.reload(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Speech helper
  useEffect(() => {
    (window as any).speak = (text: string) => {
      if (!voiceReadingEnabled) return;
      try {
        const utter = new SpeechSynthesisUtterance(String(text));
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch { /* */ }
    };
  }, [voiceReadingEnabled]);

  // Visual alert trigger
  useEffect(() => {
    (window as any).triggerVisualAlert = (input: any) => {
      if (!visualAlertsEnabled) return;
      try {
        if (!input) return;
        const payload = typeof input === "string" ? { message: input } : input;
        setAlert(payload);
      } catch { /* */ }
    };
  }, [visualAlertsEnabled]);

  // Persist toggles
  useEffect(() => { try { localStorage.setItem("visualAlertsEnabled", JSON.stringify(visualAlertsEnabled)); } catch { /* */ } }, [visualAlertsEnabled]);
  useEffect(() => { try { localStorage.setItem("voiceReadingEnabled", JSON.stringify(voiceReadingEnabled)); } catch { /* */ } }, [voiceReadingEnabled]);
  useEffect(() => { try { localStorage.setItem("textSizeLarge", JSON.stringify(textSizeLarge)); } catch { /* */ } }, [textSizeLarge]);
  useEffect(() => { try { localStorage.setItem("highContrast", JSON.stringify(highContrast)); } catch { /* */ } }, [highContrast]);

  return (
    <BrowserRouter>
      <div className={`flex flex-col min-h-screen transition-colors duration-300 ${highContrast ? "bg-black text-yellow-300" : "bg-gray-50 text-gray-900"}`}>
        <Navbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} sidebarOpen={sidebarOpen} highContrast={highContrast} />

        <div className="flex flex-1 relative">
          <Sidebar
            open={sidebarOpen}
            textSizeLarge={textSizeLarge}
            setTextSizeLarge={setTextSizeLarge}
            highContrast={highContrast}
            setHighContrast={setHighContrast}
            setSidebarOpen={setSidebarOpen}
            visualAlertsEnabled={visualAlertsEnabled}
            voiceReadingEnabled={voiceReadingEnabled}
            setVisualAlertsEnabled={setVisualAlertsEnabled}
            setVoiceReadingEnabled={setVoiceReadingEnabled}
          />

          <main className={`flex-1 p-6 pt-[64px] transition-all duration-300 ${sidebarOpen ? "lg:ml-64" : "lg:ml-0"} ${highContrast ? "bg-black text-yellow-300" : "bg-gradient-to-br from-gray-50 via-indigo-50/30 to-gray-50 text-gray-900"}`}>
            <Routes>
              <Route path="/" element={<MainContent textSizeLarge={textSizeLarge} highContrast={highContrast} />} />
              <Route path="/login" element={<Login textSizeLarge={textSizeLarge} highContrast={highContrast} />} />
              {/* Registration disabled — only admins create users */}
              <Route path="/register" element={<Login textSizeLarge={textSizeLarge} highContrast={highContrast} />} />
              <Route path="/verify" element={<VerifyEmail textSizeLarge={textSizeLarge} highContrast={highContrast} />} />
              <Route path="/reset-password" element={<ResetPassword textSizeLarge={textSizeLarge} highContrast={highContrast} />} />
              <Route path="/add-content" element={<Navigate to="/teacher/materias" replace />} />
              <Route path="/contents" element={<ContentsPage highContrast={highContrast} />} />
              <Route path="/contents/:materiaId" element={<ContenidoPage />} />
              <Route path="/lessons" element={<LessonsPage highContrast={highContrast} />} />
              <Route path="/lesson/:lessonId" element={<LessonDetailPage />} />
              <Route path="/lesson/:lessonId/prueba/:pruebaId" element={<PruebaPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/teacher" element={<TeacherDashboard highContrast={highContrast} />} />
              <Route path="/teacher/lessons" element={<TeacherLessons />} />
              <Route path="/teacher/lessons/:lessonId/sections" element={<TeacherLessonSectionsPage />} />
              <Route path="/teacher/materias" element={<TeacherMaterias />} />
              <Route path="/teacher/contents" element={<Navigate to="/teacher/materias" replace />} />
              <Route path="/teacher/pruebas" element={<TeacherPruebas />} />
              <Route path="/teacher/trabajos" element={<TeacherTrabajos />} />
              <Route path="/teacher/trabajos/:trabajoId/calificar" element={<TeacherTrabajoCalificar />} />
              <Route path="/teacher/trabajos/:trabajoId/libro" element={<TeacherTrabajoLibroWizard />} />
              <Route path="/teacher/trabajos/:trabajoId/reportes" element={<TeacherTrabajoReportes />} />
              <Route path="/teacher/trabajos/analytics" element={<TeacherTrabajosAnalytics />} />
              <Route path="/teacher/recursos" element={<TeacherRecursos />} />
              <Route path="/teacher/recursos-personales" element={<TeacherRecursosPersonales />} />
              <Route path="/teacher/recursos/:recursoId" element={<TeacherRecursoViewer />} />
              <Route path="/teacher/performance" element={<TeacherPerformance />} />
              <Route path="/teacher/cursos" element={<TeacherMisCursos />} />
              <Route path="/teacher/horario" element={<TeacherHorario />} />
              <Route path="/teacher/estudiantes" element={<TeacherEstudiantes />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/dashboard" element={<AdminDashboard highContrast={highContrast} />} />
              <Route path="/admin/modelos" element={<AdminModelos />} />
              <Route path="/admin/cursos" element={<AdminCursos />} />
              <Route path="/admin/bulk-import" element={<AdminBulkImport />} />
              <Route path="/admin/bulk-enroll" element={<AdminBulkEnroll />} />
              <Route path="/teacher/bulk-import" element={<TeacherBulkImport />} />
              <Route path="/student/dashboard" element={<StudentDashboard highContrast={highContrast} />} />
              <Route path="/student/trabajos" element={<StudentTrabajos />} />
              <Route path="/student/trabajos/:trabajoId" element={<StudentTrabajoDetail />} />
              <Route path="/molecules" element={<Molecules />} />
              <Route path="/atoms" element={<Atoms />} />
              <Route path="/periodic-table" element={<PeriodicTable />} />
              <Route path="/chemical-reactions" element={<ChemicalReactions />} />
              <Route path="/experiments" element={<Experiments />} />
              <Route path="/articles" element={<Articles />} />
            </Routes>
            <Toaster />
            {!!alert && <VisualAlert message={alert.message} highlightSelector={alert.highlightSelector} onDone={() => setAlert(null)} />}
          </main>
        </div>

        <Footer highContrast={highContrast} />
      </div>
    </BrowserRouter>
  );
}

export default App;
