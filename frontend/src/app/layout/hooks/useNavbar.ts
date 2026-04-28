import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe, signOut, isAuthenticated, type AuthUser } from "@/shared/lib/auth";
import { api } from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { Leccion, RecentContentItem } from "@/shared/types";

type RecentContentResponse = RecentContentItem[] | { data?: RecentContentItem[] | null };
const STUDENT_NOTIFICATIONS_LIMIT = 12;
const STUDENT_NOTIFICATIONS_POLL_MS = 15_000;

function unwrapRecentContentList(value: RecentContentResponse): RecentContentItem[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function isNewerDate(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left) return false;
  if (!right) return true;
  const leftTs = Date.parse(left);
  const rightTs = Date.parse(right);
  if (Number.isNaN(leftTs) || Number.isNaN(rightTs)) return false;
  return leftTs > rightTs;
}

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
  const [recentNotifications, setRecentNotifications] = useState<RecentContentItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const notificationsPanelRef = useRef<HTMLDivElement | null>(null);
  const latestKnownNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const user = await getMe();
      setProfile(user);
      setSession(!!user);
    };
    load();
    const onAuthChange = () => { load(); };
    window.addEventListener("auth-change", onAuthChange);
    return () => window.removeEventListener("auth-change", onAuthChange);
  }, [location.pathname]);

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const isTeacher = profile?.role === "teacher";
  const isStudent = profile?.role === "student";
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

  const getStudentSeenKey = useCallback(() => {
    const userId = profile?.id?.trim();
    if (!userId) return "";
    return `student_recent_content_seen_at:${userId}`;
  }, [profile?.id]);

  const getRecentContentPath = useCallback(
    (item: RecentContentItem): string => {
      if (item.tipo === "leccion") {
        const lessonId = item.leccion_id || item.id;
        return `/lesson/${lessonId}`;
      }
      if (item.tipo === "trabajo") {
        const trabajoId = item.trabajo_id || item.id;
        return isStudent ? `/student/trabajos/${trabajoId}` : "/teacher/trabajos";
      }
      if (item.tipo === "recurso") {
        if (isStudent && item.leccion_id) {
          return `/lesson/${item.leccion_id}`;
        }
        const recursoId = item.recurso_id || item.id;
        return `/teacher/recursos/${recursoId}`;
      }
      return "/";
    },
    [isStudent]
  );

  const markNotificationsAsRead = useCallback((items?: RecentContentItem[]) => {
    const key = getStudentSeenKey();
    if (!key) return;
    const source = items ?? recentNotifications;
    const latestCreatedAt = source[0]?.created_at;
    if (latestCreatedAt) {
      localStorage.setItem(key, latestCreatedAt);
    }
    setUnreadNotifications(0);
  }, [getStudentSeenKey, recentNotifications]);

  const fetchStudentNotifications = useCallback(async (initial = false) => {
    if (!session || !isStudent) return;

    try {
      if (initial) setNotificationsLoading(true);

      const response = await api.get<RecentContentResponse>(`/contenido/recent?limit=${STUDENT_NOTIFICATIONS_LIMIT}`);
      const items = unwrapRecentContentList(response);
      setRecentNotifications(items);

      const storageKey = getStudentSeenKey();
      if (!storageKey) return;

      const latestCreatedAt = items[0]?.created_at ?? null;
      const seenAt = localStorage.getItem(storageKey);

      if (!seenAt) {
        if (latestCreatedAt) {
          localStorage.setItem(storageKey, latestCreatedAt);
        }
        latestKnownNotificationRef.current = latestCreatedAt;
        setUnreadNotifications(0);
        return;
      }

      const unread = items.filter((item) => isNewerDate(item.created_at, seenAt)).length;
      setUnreadNotifications(unread);

      if (!initial && latestKnownNotificationRef.current && isNewerDate(latestCreatedAt, latestKnownNotificationRef.current)) {
        const newSinceLastPoll = items.filter((item) => isNewerDate(item.created_at, latestKnownNotificationRef.current)).length;
        if (newSinceLastPoll > 0) {
          toast.success(
            `${newSinceLastPoll} ${newSinceLastPoll === 1 ? "nueva notificación" : "nuevas notificaciones"} de contenido`
          );
        }
      }

      if (latestCreatedAt) {
        latestKnownNotificationRef.current = latestCreatedAt;
      }
    } catch {
      if (initial) {
        setRecentNotifications([]);
        setUnreadNotifications(0);
      }
    } finally {
      if (initial) setNotificationsLoading(false);
    }
  }, [getStudentSeenKey, isStudent, session]);

  useEffect(() => {
    if (!session || !isStudent) {
      setRecentNotifications([]);
      setUnreadNotifications(0);
      setNotificationsOpen(false);
      latestKnownNotificationRef.current = null;
      return;
    }

    fetchStudentNotifications(true);
    const interval = setInterval(() => {
      fetchStudentNotifications(false);
    }, STUDENT_NOTIFICATIONS_POLL_MS);

    return () => clearInterval(interval);
  }, [fetchStudentNotifications, isStudent, session]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!notificationsPanelRef.current) return;
      if (notificationsPanelRef.current.contains(event.target as Node)) return;
      setNotificationsOpen(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [notificationsOpen]);

  const toggleNotificationsPanel = useCallback(() => {
    setNotificationsOpen((prev) => {
      const next = !prev;
      if (next) {
        markNotificationsAsRead();
      }
      return next;
    });
  }, [markNotificationsAsRead]);

  const handleNotificationClick = useCallback((item: RecentContentItem) => {
    const path = getRecentContentPath(item);
    setNotificationsOpen(false);
    markNotificationsAsRead();
    navigate(path);
  }, [getRecentContentPath, markNotificationsAsRead, navigate]);

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
    isStudent,
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
    recentNotifications,
    unreadNotifications,
    notificationsOpen,
    notificationsLoading,
    notificationsPanelRef,
    toggleNotificationsPanel,
    markNotificationsAsRead,
    handleNotificationClick,
  };
}
