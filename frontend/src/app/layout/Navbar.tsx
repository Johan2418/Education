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
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        highContrast
          ? "bg-black border-b border-yellow-300 text-yellow-300"
          : "bg-white/70 backdrop-blur-xl border-b border-white/20 text-gray-800 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
      }`}
    >
      {/* Gradient accent line */}
      {!highContrast && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-60" />
      )}

      <nav className="flex flex-wrap items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleSidebar}
            aria-controls="main-sidebar"
            aria-expanded={!!sidebarOpen}
            className={`p-2 rounded-xl transition-all duration-200 ${
              highContrast
                ? "text-yellow-300 hover:bg-yellow-900"
                : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
            }`}
            aria-label={sidebarOpen ? t("sidebarClose") : t("sidebarOpen")}
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <a href="#" className="flex items-center space-x-1" aria-label="Arcanea home">
            <div className={`p-1.5 rounded-lg ${highContrast ? "" : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md"}`}>
              <Atom size={20} />
            </div>
          </a>
          <span
            className={`text-lg sm:text-xl font-bold cursor-pointer tracking-tight ${
              highContrast ? "text-yellow-300" : "bg-gradient-to-r from-indigo-700 via-violet-600 to-indigo-800 bg-clip-text text-transparent"
            }`}
            onClick={() => hook.navigate("/")}
          >
            Plataforma Educativa
          </span>
          <div className="hidden sm:block ml-3 text-sm text-gray-400 font-medium">
            {hook.location.pathname === "/" && t("nav.home")}
            {hook.location.pathname === "/login" && t("nav.login")}
            {hook.location.pathname === "/register" && t("nav.register")}
          </div>
        </div>

        {/* Search */}
        <div className="w-full mt-2 sm:mt-0 sm:w-auto sm:flex-1 sm:flex sm:justify-center">
          <div className="w-full hidden sm:block relative sm:ml-8 md:ml-12 lg:ml-16">
            <div className={`relative group`}>
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
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
                className={`w-full sm:max-w-md pl-10 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none transition-all duration-200 ${
                  highContrast
                    ? "bg-black border-yellow-300 text-yellow-300"
                    : "bg-gray-50/80 border-gray-200 text-gray-900 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:shadow-lg"
                }`}
              />
            </div>
            {hook.searchLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">...</div>}
            {hook.suggestions.length > 0 && (
              <ul ref={hook.suggestionsListRef} role="listbox" className="absolute left-0 right-0 mt-2 bg-white/95 backdrop-blur-lg border border-gray-100 rounded-xl shadow-xl z-20 max-h-72 overflow-auto">
                {hook.suggestions.map((s: Leccion, idx: number) => (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected={hook.activeIndex === idx}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      hook.activeIndex === idx ? "bg-indigo-50 border-l-2 border-indigo-500" : "hover:bg-gray-50 border-l-2 border-transparent"
                    }`}
                    onClick={() => hook.navigateToSuggestion(s)}
                  >
                    <div className="font-medium text-gray-900">{s.titulo}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.nivel}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sm:hidden flex items-center w-full justify-center">
            <button aria-label="Open search" onClick={() => hook.setSearchOpen(true)} className={`p-2 rounded-xl ${highContrast ? "text-yellow-300" : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"}`}>
              <Search size={20} />
            </button>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2 mt-2 sm:mt-0">
          <div className="hidden sm:flex items-center space-x-4 mr-2">
            <a href="#" className={`text-sm font-medium transition-colors hover:text-indigo-600 ${hook.location.pathname === "/" ? "text-indigo-600 font-semibold" : "text-gray-600"}`} onClick={() => hook.navigate("/")}>
              {t("nav.home")}
            </a>
          </div>

          <button
            onClick={hook.toggleLanguage}
            className={`flex items-center space-x-1.5 px-3 py-1.5 border rounded-xl transition-all duration-200 ${
              highContrast
                ? "border-yellow-300 text-yellow-300 hover:bg-yellow-900"
                : "border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
            }`}
          >
            <span>🌐</span>
            <span className="text-sm font-semibold">{hook.language.toUpperCase()}</span>
          </button>

          {hook.session && hook.profile ? (
            <>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  hook.isAdmin
                    ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm"
                    : hook.isTeacher
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm"
                    : "bg-gradient-to-r from-gray-500 to-slate-500 text-white shadow-sm"
                }`}
              >
                {hook.isAdmin ? t("register.roles.admin") : hook.isTeacher ? t("register.roles.teacher") : t("register.roles.student")}
              </span>
              <span className={`hidden sm:inline-block px-3 py-1 rounded-lg text-sm font-medium ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>
                {hook.displayName}
              </span>
              <button
                className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                  highContrast
                    ? "bg-yellow-300 text-black hover:bg-yellow-400"
                    : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 shadow-md hover:shadow-lg active:scale-[0.98]"
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
              className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                highContrast
                  ? "bg-yellow-300 text-black hover:bg-yellow-400"
                  : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 shadow-md hover:shadow-lg active:scale-[0.98]"
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => hook.setSearchOpen(false)} />
          <div className={`${highContrast ? "bg-black text-yellow-300" : "bg-white/95 backdrop-blur-xl text-gray-900"} z-50 w-full rounded-2xl p-5 shadow-2xl animate-scale-in`}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={hook.query}
                  onChange={(e) => hook.setQuery(e.target.value)}
                  placeholder={t("search.placeholder")}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                    highContrast ? "border-yellow-300 bg-black text-yellow-300" : "border-gray-200 bg-gray-50 text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  }`}
                />
              </div>
              <button className="p-2.5 rounded-xl hover:bg-gray-100 transition-colors" onClick={() => hook.setSearchOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {hook.suggestions.length > 0 && (
              <ul className="mt-3 space-y-1">
                {hook.suggestions.map((s: Leccion) => (
                  <li key={s.id}>
                    <button className="w-full text-left p-3 rounded-xl hover:bg-indigo-50 transition-colors" onClick={() => hook.navigateToSuggestion(s)}>
                      <div className="font-medium">{s.titulo}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.nivel}</div>
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
