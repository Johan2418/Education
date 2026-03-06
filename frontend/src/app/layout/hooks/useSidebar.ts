import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMe, type AuthUser } from "@/shared/lib/auth";

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

export function useSidebar(opts: UseSidebarOptions) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [profile, setProfile] = useState<AuthUser | null>(null);

  useEffect(() => {
    getMe().then(setProfile);
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
    toggleTextSize,
    toggleHighContrast,
    toggleVisualAlerts,
    toggleVoiceReading,
  };
}
