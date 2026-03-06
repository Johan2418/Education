import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Newspaper } from "lucide-react";
import { getMe, isAuthenticated, type AuthUser } from "@/shared/lib/auth";
import { api } from "@/shared/lib/api";
import type { Leccion } from "@/shared/types";
import heroImage from "@/img/HeroImage.png";

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
      .get<Leccion[]>("/lecciones/recent?limit=6")
      .then((data) => setRecentLessons(data || []))
      .catch(() => {})
      .finally(() => setLoadingLessons(false));
  }, []);

  return (
    <main
      className={`flex flex-col flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto ${
        highContrast ? "bg-black text-yellow-300" : "bg-gray-50 text-gray-900"
      } ${textSizeLarge ? "text-lg" : "text-sm"}`}
    >
      {/* Hero */}
      <section
        className={`relative flex flex-col justify-center items-center text-center rounded-2xl shadow-md border mb-12 transition-colors min-h-[55vh] sm:min-h-[65vh] md:min-h-[75vh] lg:min-h-[85vh] overflow-hidden ${
          highContrast
            ? "bg-black border-yellow-300 text-yellow-300"
            : "bg-white border-gray-200 text-gray-800"
        }`}
      >
        {/* Background image */}
        <img
          src={heroImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />

        {/* Overlay for contrast */}
        <div
          className={`absolute inset-0 ${
            highContrast ? "bg-black/80" : "bg-white/60"
          }`}
        />

        {/* Content */}
        <div className="relative z-10 px-6 sm:px-12 max-w-3xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4 leading-tight drop-shadow-lg">
            {t("home.heroTitle")}
          </h1>

          <p className="text-base sm:text-lg mb-6 opacity-90">
            {t("home.heroSubtitle")}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
            <button
              onClick={() => navigate(isAuthenticated() ? "/lessons" : "/register")}
              className={`mt-2 px-6 py-3 rounded-full font-semibold text-base transition-all ${
                highContrast
                  ? "bg-yellow-500 text-black hover:bg-yellow-400"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {t("home.heroButton")}
            </button>

            {profile ? (
              <div
                role="status"
                aria-live="polite"
                className={`mt-2 inline-block px-5 py-2 rounded-lg text-sm transition-colors ${
                  highContrast
                    ? "bg-yellow-900 border border-yellow-500 text-yellow-300"
                    : "bg-green-100 border border-green-300 text-green-800"
                }`}
              >
                {t("home.sessionStarted")}
              </div>
            ) : (
              <a
                href="/login"
                className={`mt-2 inline-block px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  highContrast
                    ? "bg-gray-800 border border-yellow-500 text-yellow-300 hover:bg-yellow-900"
                    : "bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200"
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
        className={`rounded-2xl shadow-sm border p-6 transition-colors ${
          highContrast
            ? "bg-black border-yellow-300 text-yellow-300"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start gap-4 mb-4">
          <Newspaper className={highContrast ? "text-yellow-300" : "text-blue-600"} size={24} />
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold">{t("home.recentLessons")}</h2>
            <p className="text-sm text-gray-500 mt-1">{t("home.recentLessonsHelp")}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loadingLessons ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 border rounded-xl animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-full mb-1" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </>
          ) : recentLessons.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500">
              {t("home.noLessonsYet")}
            </div>
          ) : (
            recentLessons.map((lesson) => (
              <article
                key={lesson.id}
                className={`p-4 border rounded-xl transition cursor-pointer ${
                  highContrast
                    ? "border-yellow-500 hover:bg-yellow-900/20"
                    : "hover:bg-gray-50"
                }`}
                onClick={() => navigate(`/lesson/${lesson.id}`)}
              >
                <h3 className="font-medium">{lesson.titulo}</h3>
                <p className={`text-sm mt-1 line-clamp-2 ${highContrast ? "text-yellow-200" : "text-gray-500"}`}>
                  {lesson.descripcion || t("home.noDescription")}
                </p>
                <div className="flex items-center justify-between mt-2">
                  {lesson.nivel && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      highContrast
                        ? "bg-yellow-800 text-yellow-200"
                        : "bg-blue-100 text-blue-700"
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
