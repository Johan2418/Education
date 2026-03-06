import { Menu, Atom, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavbar } from "@/app/layout/hooks/useNavbar";
import type { Leccion } from "@/shared/types";

export default function Navbar({
  toggleSidebar,
  sidebarOpen,
  highContrast,
}: {
  toggleSidebar: () => void;
  sidebarOpen?: boolean;
  highContrast: boolean;
}) {
  const hook = useNavbar();
  const { t } = useTranslation();

  return (
    <header
      className={`fixed top-0 left-0 w-full border-b shadow-sm z-50 transition-colors duration-300 ${
        highContrast ? "bg-black border-yellow-300 text-yellow-300" : "bg-white border-gray-200 text-blue-700"
      }`}
    >
      <nav className="flex flex-wrap items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleSidebar}
            aria-controls="main-sidebar"
            aria-expanded={!!sidebarOpen}
            className={`p-2 rounded-md transition ${highContrast ? "text-yellow-300 hover:bg-yellow-900" : "text-blue-700 hover:bg-gray-100"}`}
            aria-label={sidebarOpen ? t("sidebarClose") : t("sidebarOpen")}
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <a href="#" className="flex items-center space-x-1" aria-label="Arcanea home">
            <Atom size={22} />
          </a>
          <span
            className={`text-lg sm:text-xl font-semibold cursor-pointer ${highContrast ? "text-yellow-300" : "text-blue-700"}`}
            onClick={() => hook.navigate("/")}
          >
            Plataforma Educativa
          </span>
          <div className="hidden sm:block ml-3 text-sm text-gray-500">
            {hook.location.pathname === "/" && t("nav.home")}
            {hook.location.pathname === "/login" && t("nav.login")}
            {hook.location.pathname === "/register" && t("nav.register")}
            {hook.location.pathname === "/add-content" && t("nav.addContent")}
          </div>
        </div>

        {/* Search */}
        <div className="w-full mt-2 sm:mt-0 sm:w-auto sm:flex-1 sm:flex sm:justify-center">
          <div className="w-full hidden sm:block relative sm:ml-8 md:ml-12 lg:ml-16">
            <input
              type="text"
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
              value={hook.query}
              onChange={(e) => hook.setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (!hook.suggestions.length) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  hook.setActiveIndex((i) => Math.min(i + 1, hook.suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  hook.setActiveIndex((i) => (i <= 0 ? hook.suggestions.length - 1 : i - 1));
                } else if (e.key === "Enter" && hook.activeIndex >= 0 && hook.suggestions[hook.activeIndex]) {
                  hook.navigateToSuggestion(hook.suggestions[hook.activeIndex]!);
                }
              }}
              className={`w-full sm:max-w-md px-4 py-2 text-sm border rounded-full focus:outline-none transition ${
                highContrast ? "bg-black border-yellow-300 text-yellow-300" : "bg-white border-gray-300 text-gray-900"
              }`}
            />
            {hook.searchLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">...</div>}
            {hook.suggestions.length > 0 && (
              <ul ref={hook.suggestionsListRef} role="listbox" className="absolute left-0 right-0 mt-2 bg-white border rounded shadow z-20 max-h-72 overflow-auto">
                {hook.suggestions.map((s: Leccion, idx: number) => (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected={hook.activeIndex === idx}
                    className={`p-2 cursor-pointer ${hook.activeIndex === idx ? "bg-blue-50" : "hover:bg-blue-50"}`}
                    onClick={() => hook.navigateToSuggestion(s)}
                  >
                    <div className="font-medium">{s.titulo}</div>
                    <div className="text-xs text-gray-500">{s.nivel}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sm:hidden flex items-center w-full justify-center">
            <button aria-label="Open search" onClick={() => hook.setSearchOpen(true)} className={`p-2 rounded ${highContrast ? "text-yellow-300" : "text-blue-700"}`}>
              <Search size={20} />
            </button>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2 mt-2 sm:mt-0">
          <div className="hidden sm:flex items-center space-x-4 mr-2">
            <a href="#" className={`text-sm ${hook.location.pathname === "/" ? "font-semibold underline" : ""}`} onClick={() => hook.navigate("/")}>
              {t("nav.home")}
            </a>
            {hook.isTeacher && (
              <a href="#" className={`text-sm ${hook.location.pathname === "/add-content" ? "font-semibold underline" : ""}`} onClick={() => hook.navigate("/add-content")}>
                {t("addContent")}
              </a>
            )}
          </div>

          <button
            onClick={hook.toggleLanguage}
            className={`flex items-center space-x-1 px-3 py-1 border rounded-md transition ${
              highContrast ? "border-yellow-300 text-yellow-300 hover:bg-yellow-900" : "border-gray-300 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span>🌐</span>
            <span className="text-sm font-medium">{hook.language.toUpperCase()}</span>
          </button>

          {hook.session && hook.profile ? (
            <>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  hook.isAdmin ? "bg-indigo-100 text-indigo-800" : hook.isTeacher ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                }`}
              >
                {hook.isAdmin ? t("register.roles.admin") : hook.isTeacher ? t("register.roles.teacher") : t("register.roles.student")}
              </span>
              <span className={`hidden sm:inline-block px-3 py-1 rounded-md text-sm font-medium ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>
                {hook.displayName}
              </span>
              {(hook.isTeacher || hook.isAdmin) && (
                <button
                  className={`hidden sm:inline-flex px-4 py-1.5 text-sm font-medium rounded-md ${
                    highContrast ? "bg-yellow-300 text-black hover:bg-yellow-400" : "bg-green-600 hover:bg-green-700 text-white"
                  }`}
                  onClick={() => hook.navigate("/add-content")}
                >
                  {t("addContent")}
                </button>
              )}
              <button
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                  highContrast ? "bg-yellow-300 text-black hover:bg-yellow-400" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
                onClick={hook.handleSignOut}
                title={t("login.signOut")}
              >
                <span className="hidden sm:inline">{t("login.signOut")}</span>
                <span className="sm:hidden">🚪</span>
              </button>
            </>
          ) : (
            <button
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                highContrast ? "bg-yellow-300 text-black hover:bg-yellow-400" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
              onClick={() => hook.navigate("/login")}
            >
              <span className="hidden sm:inline">{t("login.signIn")}</span>
              <span className="sm:hidden">🔑</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile search overlay */}
      {hook.searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start pt-16 px-4 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => hook.setSearchOpen(false)} />
          <div className={`${highContrast ? "bg-black text-yellow-300" : "bg-white text-gray-900"} z-50 w-full rounded-lg p-4 shadow-lg`}>
            <div className="flex items-center">
              <input
                autoFocus
                type="text"
                value={hook.query}
                onChange={(e) => hook.setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                className={`w-full px-4 py-2 rounded border ${highContrast ? "border-yellow-300 bg-black text-yellow-300" : "border-gray-300 bg-white text-gray-900"}`}
              />
              <button className="ml-2 p-2 rounded" onClick={() => hook.setSearchOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {hook.suggestions.length > 0 && (
              <ul className="mt-3 space-y-2">
                {hook.suggestions.map((s: Leccion) => (
                  <li key={s.id}>
                    <button className="w-full text-left p-2 rounded hover:bg-gray-50" onClick={() => hook.navigateToSuggestion(s)}>
                      <div className="font-medium">{s.titulo}</div>
                      <div className="text-xs text-gray-500">{s.nivel}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
