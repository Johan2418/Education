import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getMe, updateProfile, resendVerification, signOut as apiSignOut } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { Profile } from "@/shared/types";

export interface UseSettingsReturn {
  loading: boolean;
  isLoggedIn: boolean;
  profile: Profile | null;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  thumbnailUrl: string;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setDisplayName: (v: string) => void;
  setPhone: (v: string) => void;
  savingProfile: boolean;
  handleSaveProfile: () => Promise<void>;
  newPassword: string;
  confirmPassword: string;
  setNewPassword: (v: string) => void;
  setConfirmPassword: (v: string) => void;
  savingPassword: boolean;
  handleChangePassword: () => Promise<void>;
  currentLanguage: string;
  handleChangeLanguage: (lang: string) => void;
  requestedRole: string;
  setRequestedRole: (v: string) => void;
  requestingRole: boolean;
  handleRequestRole: () => Promise<void>;
  handleCancelRoleRequest: () => Promise<void>;
  handleResendVerification: () => Promise<void>;
  resendingVerification: boolean;
  handleSignOut: () => Promise<void>;
  t: (key: string, opts?: any) => string;
}

export function useSettings(): UseSettingsReturn {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const initRef = useRef(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [currentLanguage, setCurrentLanguage] = useState(i18n.language || "es");

  const [requestedRole, setRequestedRole] = useState("");
  const [requestingRole, setRequestingRole] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const p = await getMe();
        if (p) {
          setIsLoggedIn(true);
          setProfile(p as unknown as Profile);
          const nameParts = (p.display_name || "").split(" ");
          setFirstName(nameParts[0] || "");
          setLastName(nameParts.slice(1).join(" ") || "");
          setDisplayName(p.display_name || "");
          setPhone(p.phone || "");
          setThumbnailUrl(p.thumbnail_url || "");
          if (p.requested_role) setRequestedRole(p.requested_role);
        }
      } catch {
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!isLoggedIn) return;
    setSavingProfile(true);
    try {
      await updateProfile({
        display_name: `${firstName.trim()} ${lastName.trim()}`.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setProfile((prev) =>
        prev
          ? { ...prev, display_name: `${firstName.trim()} ${lastName.trim()}`.trim(), phone: phone.trim() }
          : prev
      );
      toast.success(t("settingsPage.profile.saveSuccess"));
    } catch {
      toast.error(t("settingsPage.profile.saveError"));
    } finally {
      setSavingProfile(false);
    }
  }, [isLoggedIn, firstName, lastName, displayName, phone, t]);

  const handleChangePassword = useCallback(async () => {
    if (newPassword.length < 6) {
      toast.error(t("settingsPage.security.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("settingsPage.security.passwordMismatch"));
      return;
    }
    setSavingPassword(true);
    try {
      // Go backend doesn't have password change endpoint yet — placeholder
      toast.error(t("settingsPage.security.passwordError"));
    } finally {
      setSavingPassword(false);
    }
  }, [newPassword, confirmPassword, t]);

  const handleChangeLanguage = useCallback(
    (lang: string) => {
      i18n.changeLanguage(lang);
      setCurrentLanguage(lang);
      toast.success(t("settingsPage.language.changeSuccess"));
    },
    [i18n, t]
  );

  const handleRequestRole = useCallback(async () => {
    if (!isLoggedIn || !requestedRole) return;
    if (profile?.requested_role) {
      toast.error(t("settingsPage.roleRequest.alreadyRequested"));
      return;
    }
    setRequestingRole(true);
    try {
      await updateProfile({ display_name: profile?.display_name });
      // Note: role request would need a dedicated endpoint
      setProfile((prev) => (prev ? { ...prev, requested_role: requestedRole } : prev));
      toast.success(t("settingsPage.roleRequest.requestSuccess"));
    } catch {
      toast.error(t("settingsPage.roleRequest.requestError"));
    } finally {
      setRequestingRole(false);
    }
  }, [isLoggedIn, requestedRole, profile, t]);

  const handleCancelRoleRequest = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      await updateProfile({ display_name: profile?.display_name });
      // Note: role request cancellation would need a dedicated endpoint
      setProfile((prev) => (prev ? { ...prev, requested_role: null } : prev));
      setRequestedRole("");
      toast.success(t("settingsPage.roleRequest.cancelSuccess"));
    } catch {
      console.error("[Settings] cancel role request error");
    }
  }, [isLoggedIn, t]);

  const handleResendVerification = useCallback(async () => {
    if (!profile?.email) return;
    setResendingVerification(true);
    try {
      await resendVerification(profile.email);
      toast.success(t("settingsPage.account.verificationSent"));
    } catch {
      toast.error(t("settingsPage.account.verificationError"));
    } finally {
      setResendingVerification(false);
    }
  }, [profile, t]);

  const handleSignOut = useCallback(async () => {
    apiSignOut();
    navigate("/login");
  }, [navigate]);

  return {
    loading,
    isLoggedIn,
    profile,
    firstName,
    lastName,
    displayName,
    phone,
    thumbnailUrl,
    setFirstName,
    setLastName,
    setDisplayName,
    setPhone,
    savingProfile,
    handleSaveProfile,
    newPassword,
    confirmPassword,
    setNewPassword,
    setConfirmPassword,
    savingPassword,
    handleChangePassword,
    currentLanguage,
    handleChangeLanguage,
    requestedRole,
    setRequestedRole,
    requestingRole,
    handleRequestRole,
    handleCancelRoleRequest,
    handleResendVerification,
    resendingVerification,
    handleSignOut,
    t,
  };
}
