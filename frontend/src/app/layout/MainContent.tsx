import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Newspaper, ArrowRight, Sparkles } from "lucide-react";
import { getMe, isAuthenticated, type AuthUser } from "@/shared/lib/auth";
import { api } from "@/shared/lib/api";
import type { Leccion } from "@/shared/types";
import heroImage from "@/img/HeroImage.png";

type RecentLessonsResponse = Leccion[] | { data?: Leccion[] | null };

export default function MainContent({
  textSizeLarge,
  highContrast,
}: {
  textSizeLarge: boolean;
  highContrast: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [recentLessons, setRecentLessons] = useState<Leccion[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);

  useEffect(() => {
    getMe().then(setProfile);
  }, []);

  useEffect(() => {
    setLoadingLessons(true);
    if (!isAuthenticated()) {
      setLoadingLessons(false);
      return;
    }
    api
      .get<RecentLessonsResponse>("/lecciones/recent?limit=6")
      .then((response) => {
        const lessons = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : [];
        setRecentLessons(lessons);
      })
      .catch(() => {})
      .finally(() => setLoadingLessons(false));
  }, []);

  return (
    <main
      className={`flex flex-col flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto ${
        highContrast ? "bg-black text-yellow-300" : "bg-gradient-to-br from-gray-50 via-indigo-50/30 to-gray-50 text-gray-900"
      } ${textSizeLarge ? "text-lg" : "text-sm"}`}
    >
      {/* Hero */}
      <section
        className={`relative flex flex-col justify-center items-center text-center rounded-3xl shadow-xl border mb-12 transition-colors min-h-[55vh] sm:min-h-[65vh] md:min-h-[75vh] lg:min-h-[85vh] overflow-hidden ${
          highContrast
            ? "bg-black border-yellow-300 text-yellow-300"
            : "bg-white border-gray-100 text-white"
        }`}
      >
        {/* Background image */}
        <img
          src={heroImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Gradient overlay */}
        <div
          className={`absolute inset-0 ${
            highContrast
              ? "bg-black/80"
              : "bg-gradient-to-br from-indigo-900/80 via-violet-900/70 to-cyan-900/60"
          }`}
        />

        {/* Decorative elements */}
        {!highContrast && (
          <>
            <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl animate-float" />
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-violet-500/15 rounded-full blur-3xl animate-float" style={{ animationDelay: "3s" }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
          </>
        )}

        {/* Content */}
        <div className="relative z-10 px-6 sm:px-12 max-w-3xl animate-fade-in-up">
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6 ${
            highContrast ? "bg-yellow-900 text-yellow-300" : "bg-white/15 backdrop-blur-sm border border-white/20 text-white/90"
          }`}>
            <Sparkles size={14} />
            <span>{t("home.heroSubtitle")}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
            {t("home.heroTitle")}
          </h1>

          <p className={`text-base sm:text-lg mb-8 ${highContrast ? "" : "text-white/80"} max-w-xl mx-auto`}>
            {t("home.heroSubtitle")}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <button
              onClick={() => navigate(isAuthenticated() ? "/lessons" : "/register")}
              className={`group flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-base transition-all duration-300 ${
                highContrast
                  ? "bg-yellow-500 text-black hover:bg-yellow-400"
                  : "bg-white text-indigo-700 hover:bg-gray-50 shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
              }`}
            >
              {t("home.heroButton")}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>

            {profile ? (
              <div
                role="status"
                aria-live="polite"
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm transition-colors ${
                  highContrast
                    ? "bg-yellow-900 border border-yellow-500 text-yellow-300"
                    : "bg-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 text-emerald-200"
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {t("home.sessionStarted")}
              </div>
            ) : (
              <a
                href="/login"
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  highContrast
                    ? "bg-gray-800 border border-yellow-500 text-yellow-300 hover:bg-yellow-900"
                    : "bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20"
                }`}
              >
                {t("home.registerOrLogin")}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Recent Lessons */}
      <section
        className={`rounded-2xl border p-6 transition-colors ${
          highContrast
            ? "bg-black border-yellow-300 text-yellow-300"
            : "bg-white border-gray-100 shadow-lg"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start gap-4 mb-6">
          <div className={`p-3 rounded-xl ${highContrast ? "" : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg"}`}>
            <Newspaper className={highContrast ? "text-yellow-300" : "text-white"} size={24} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold">{t("home.recentLessons")}</h2>
            <p className={`text-sm mt-1 ${highContrast ? "" : "text-gray-500"}`}>{t("home.recentLessonsHelp")}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loadingLessons ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 border border-gray-100 rounded-2xl">
                  <div className="h-4 rounded-full w-3/4 mb-3 animate-shimmer" />
                  <div className="h-3 rounded-full w-full mb-2 animate-shimmer" />
                  <div className="h-3 rounded-full w-2/3 animate-shimmer" />
                </div>
              ))}
            </>
          ) : recentLessons.length === 0 ? (
            <div className={`col-span-full text-center py-12 ${highContrast ? "" : "text-gray-400"}`}>
              <Newspaper size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t("home.noLessonsYet")}</p>
            </div>
          ) : (
            recentLessons.map((lesson, index) => (
              <article
                key={lesson.id}
                className={`relative p-5 border rounded-2xl transition-all duration-300 cursor-pointer group animate-fade-in-up ${
                  highContrast
                    ? "border-yellow-500 hover:bg-yellow-900/20"
                    : "border-gray-100 hover:border-indigo-200 hover:shadow-lg hover:-translate-y-1 bg-white"
                }`}
                style={{ animationDelay: `${index * 75}ms` }}
                onClick={() => navigate(`/lesson/${lesson.id}`)}
              >
                {/* Gradient top accent */}
                {!highContrast && (
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                )}
                <h3 className={`font-semibold mb-1 ${highContrast ? "" : "group-hover:text-indigo-700 transition-colors"}`}>{lesson.titulo}</h3>
                <p className={`text-sm mt-1 line-clamp-2 ${highContrast ? "text-yellow-200" : "text-gray-500"}`}>
                  {lesson.descripcion || t("home.noDescription")}
                </p>
                <div className="flex items-center justify-between mt-3">
                  {lesson.nivel && (
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                      highContrast
                        ? "bg-yellow-800 text-yellow-200"
                        : "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 border border-indigo-100"
                    }`}>
                      {lesson.nivel}
                    </span>
                  )}
                  <p className={`text-xs ${highContrast ? "text-yellow-400" : "text-gray-400"}`}>
                    {new Date(lesson.created_at).toLocaleDateString()}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
