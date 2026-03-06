import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe, signOut, isAuthenticated, type AuthUser } from "@/shared/lib/auth";
import { api } from "@/shared/lib/api";
import type { Leccion } from "@/shared/types";

export function useNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(i18n.language || "es");
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [session, setSession] = useState(isAuthenticated());
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Leccion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const suggestionsListRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const user = await getMe();
      setProfile(user);
      setSession(!!user);
    };
    load();
  }, [location.pathname]);

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const isTeacher = profile?.role === "teacher";
  const displayName = profile?.display_name || profile?.email || "";

  const toggleLanguage = useCallback(() => {
    const next = language === "es" ? "en" : "es";
    i18n.changeLanguage(next);
    setLanguage(next);
    localStorage.setItem("language", next);
  }, [language, i18n]);

  const handleSignOut = useCallback(() => {
    signOut();
  }, []);

  // Simple search — query lessons
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // Search across all temas' lecciones — simplified: fetch all and filter client-side
        // A proper search endpoint should be added to the backend
        const res = await api.get<{ data: Leccion[] }>("/lecciones/search?q=" + encodeURIComponent(query));
        setSuggestions(res.data || []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const navigateToSuggestion = useCallback(
    (s: Leccion) => {
      setQuery("");
      setSuggestions([]);
      setSearchOpen(false);
      navigate(`/lesson/${s.id}`);
    },
    [navigate]
  );

  return {
    navigate,
    location,
    language,
    toggleLanguage,
    profile,
    session,
    isAdmin,
    isTeacher,
    displayName,
    handleSignOut,
    query,
    setQuery,
    suggestions,
    activeIndex,
    setActiveIndex,
    searchOpen,
    setSearchOpen,
    searchLoading,
    suggestionsListRef,
    navigateToSuggestion,
  };
}
