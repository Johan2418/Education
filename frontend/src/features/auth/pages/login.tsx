import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { login as apiLogin, isAuthenticated, resendVerification } from "@/shared/lib/auth";
import { toast } from "react-hot-toast";
import type { ApiError } from "@/shared/lib/api";

type Props = {
  textSizeLarge: boolean;
  highContrast: boolean;
};

export default function Login({ highContrast = false }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState<boolean>(() => localStorage.getItem("rememberMe") === "true");
  const [error, setError] = useState("");
  const [failedAttempts, setFailedAttempts] = useState<number>(() => Number(localStorage.getItem("loginFailedAttempts") ?? 0));
  const [blockedUntil, setBlockedUntil] = useState<number>(() => Number(localStorage.getItem("loginBlockedUntil") ?? 0));
  const [blockedTimer, setBlockedTimer] = useState<number>(0);
  const isBlocked = Boolean(blockedUntil && blockedUntil > Date.now());
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if ((location.state as Record<string, unknown>)?.justSignedOut) return;
    if (isAuthenticated()) navigate("/");
  }, [navigate, location]);

  // Restore remembered email
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) setEmail(savedEmail);
  }, []);

  // Block countdown
  useEffect(() => {
    if (!blockedUntil || blockedUntil <= Date.now()) {
      setBlockedTimer(0);
      return;
    }
    setBlockedTimer(Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)));
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      setBlockedTimer(secs);
      if (blockedUntil <= Date.now()) {
        clearInterval(interval);
        localStorage.removeItem("loginFailedAttempts");
        localStorage.removeItem("loginBlockedUntil");
        setFailedAttempts(0);
        setBlockedUntil(0);
        setBlockedTimer(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [blockedUntil]);

  const handleLogin = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setError("");
    if (!email || !password) {
      setError(t("login.errors.allFields"));
      return;
    }
    if (blockedUntil && blockedUntil > Date.now()) {
      const secs = Math.ceil((blockedUntil - Date.now()) / 1000);
      setError(t("login.errors.blockedTimer", { count: secs }));
      return;
    }
    setLoading(true);
    try {
      await apiLogin(email, password);

      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberMe");
        localStorage.removeItem("rememberedEmail");
      }

      setFailedAttempts(0);
      localStorage.removeItem("loginFailedAttempts");
      localStorage.removeItem("loginBlockedUntil");
      setBlockedUntil(0);

      try { (window as any).triggerVisualAlert?.({ message: t("login.success") }); } catch { /* */ }
      try { (window as any).speak?.(t("login.success")); } catch { /* */ }
      toast.success(t("login.success"));
      navigate("/");
    } catch (err) {
      const apiErr = err as ApiError;
      // Check if the error is "account not verified"
      if (apiErr.message?.includes("no verificada") || apiErr.message?.includes("not verified")) {
        setUnverified(true);
        setError(t("login.errors.unconfirmed"));
        toast.error(t("login.errors.unconfirmed"));
        setLoading(false);
        return;
      }
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      localStorage.setItem("loginFailedAttempts", String(next));

      const MAX_FAILED = 5;
      const LOCK_SECONDS = 30;
      if (next >= MAX_FAILED) {
        const until = Date.now() + LOCK_SECONDS * 1000;
        setBlockedUntil(until);
        setBlockedTimer(LOCK_SECONDS);
        localStorage.setItem("loginBlockedUntil", String(until));
        setError(t("login.errors.blocked"));
        toast.error(t("login.errors.blocked"));
      } else {
        const msg = apiErr.message || t("login.errors.invalid");
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`flex items-center justify-center min-h-screen bg-cover bg-center p-4 transition-colors duration-300 ${
        highContrast ? "bg-black text-white" : ""
      }`}
      style={{
        backgroundImage: highContrast
          ? "none"
          : "url('https://previews.123rf.com/images/ihor_seamless/ihor_seamless0908/ihor_seamless090800023/5407313-seamlessly-wallpaper-chemistry-formulas-on-white.jpg')",
      }}
    >
      <div
        className={`${
          highContrast
            ? "bg-gray-900 text-white border-2 border-white"
            : "bg-white text-gray-800 shadow-2xl"
        } rounded-2xl w-full max-w-md p-6 sm:p-8`}
      >
        <h2 className={`text-3xl font-bold text-center mb-6 ${highContrast ? "text-yellow-400" : "text-indigo-700"}`}>
          {t("login.title")}
        </h2>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email */}
          <div>
            <label htmlFor="login-email" className={`block font-semibold mb-1 ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>
              {t("login.email")}
            </label>
            <div className={`flex items-center border rounded-lg px-3 py-2 focus-within:ring-2 ${highContrast ? "border-yellow-400 focus-within:ring-yellow-400" : "border-gray-300 focus-within:ring-indigo-500"}`}>
              <User className={highContrast ? "text-yellow-400 mr-2" : "text-gray-500 mr-2"} size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.emailPlaceholder")}
                className={`w-full bg-transparent outline-none ${highContrast ? "placeholder-yellow-300" : ""}`}
                id="login-email"
                aria-label={t("login.email")}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" className={`block font-semibold mb-1 ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>
              {t("login.password")}
            </label>
            <div className={`flex items-center border rounded-lg px-3 py-2 focus-within:ring-2 ${highContrast ? "border-yellow-400 focus-within:ring-yellow-400" : "border-gray-300 focus-within:ring-indigo-500"}`}>
              <Lock className={highContrast ? "text-yellow-400 mr-2" : "text-gray-500 mr-2"} size={20} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                className={`w-full bg-transparent outline-none ${highContrast ? "placeholder-yellow-300" : ""}`}
                id="login-password"
                aria-label={t("login.password")}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className={highContrast ? "text-yellow-400" : "text-gray-500"}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Remember me & Forgot */}
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={`h-4 w-4 rounded border-gray-300 ${highContrast ? "accent-yellow-400" : "accent-indigo-600"}`}
              />
              <span className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-700"}`}>{t("login.rememberMe")}</span>
            </label>
            <a href="/reset-password" className={`text-sm font-medium hover:underline ${highContrast ? "text-yellow-400" : "text-indigo-600"}`}>
              {t("login.forgotPassword")}
            </a>
          </div>

          {/* Register link — disabled, only admins create users
          <div className="flex justify-end">
            <a href="/register" className={`text-sm font-medium hover:underline ${highContrast ? "text-yellow-400" : "text-indigo-600"}`}>
              {t("login.noAccount")}
            </a>
          </div>
          */}

          {/* Help text */}
          <div className="mt-4 text-xs text-gray-500">
            <p>{t("login.help.passwordTips")}</p>
            <p className="mt-1">{t("login.help.shortcuts")}</p>
          </div>

          {/* Error */}
          {error && (
            <div id="login-error" role="alert" className={`text-sm p-2 rounded-md text-center ${highContrast ? "bg-yellow-900 text-yellow-200" : "bg-red-100 text-red-600"}`}>
              {error}
              {unverified && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await resendVerification(email);
                      toast.success(t("login.verificationResent"));
                    } catch { toast.error(t("login.errors.connection")); }
                  }}
                  className={`block mx-auto mt-2 text-sm font-medium underline ${highContrast ? "text-yellow-400" : "text-indigo-600"}`}
                >
                  {t("login.resendVerification")}
                </button>
              )}
            </div>
          )}
          {blockedTimer > 0 && (
            <div className="text-sm text-gray-600 mt-2" role="status" aria-live="polite">
              {t("login.errors.blockedTimer", { count: blockedTimer })}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || isBlocked}
            className={`w-full font-semibold py-3 sm:py-2 rounded-lg transition duration-200 ${loading ? "opacity-60 cursor-not-allowed" : ""} ${highContrast ? "bg-yellow-400 text-black hover:bg-yellow-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
          >
            {loading ? t("login.loading") : t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
