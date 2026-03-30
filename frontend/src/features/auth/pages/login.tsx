import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, User, Atom } from "lucide-react";
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
      className={`flex items-center justify-center min-h-screen p-4 transition-colors duration-300 ${
        highContrast ? "bg-black text-white" : ""
      }`}
      style={{
        background: highContrast
          ? "black"
          : "linear-gradient(135deg, #312e81 0%, #5b21b6 30%, #4f46e5 60%, #0891b2 100%)",
      }}
    >
      {/* Decorative orbs */}
      {!highContrast && (
        <>
          <div className="fixed top-[-10%] left-[-5%] w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-3xl animate-float pointer-events-none" />
          <div className="fixed bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-3xl animate-float pointer-events-none" style={{ animationDelay: "2s" }} />
          <div className="fixed top-[40%] right-[20%] w-[300px] h-[300px] bg-cyan-400/15 rounded-full blur-3xl animate-float pointer-events-none" style={{ animationDelay: "4s" }} />
        </>
      )}

      <div
        className={`relative animate-scale-in ${
          highContrast
            ? "bg-gray-900 text-white border-2 border-white"
            : "bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl"
        } rounded-3xl w-full max-w-md p-8 sm:p-10`}
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className={`p-3.5 rounded-2xl ${highContrast ? "bg-yellow-400" : "bg-white/15 backdrop-blur-sm shadow-lg"}`}>
            <Atom size={32} className={highContrast ? "text-black" : "text-white"} />
          </div>
        </div>

        <h2 className={`text-3xl font-bold text-center mb-2 ${highContrast ? "text-yellow-400" : "text-white"}`}>
          {t("login.title")}
        </h2>
        <p className={`text-center mb-8 text-sm ${highContrast ? "text-yellow-300" : "text-white/60"}`}>
          Plataforma Educativa
        </p>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email */}
          <div>
            <label htmlFor="login-email" className={`block font-medium text-sm mb-2 ${highContrast ? "text-yellow-300" : "text-white/80"}`}>
              {t("login.email")}
            </label>
            <div className={`flex items-center border rounded-xl px-4 py-3 transition-all duration-200 ${
              highContrast
                ? "border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-400"
                : "border-white/20 bg-white/10 backdrop-blur-sm focus-within:bg-white/15 focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20"
            }`}>
              <User className={`shrink-0 ${highContrast ? "text-yellow-400 mr-3" : "text-white/50 mr-3"}`} size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.emailPlaceholder")}
                className={`w-full bg-transparent outline-none text-sm ${highContrast ? "placeholder-yellow-300/60 text-white" : "placeholder-white/40 text-white"}`}
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
            <label htmlFor="login-password" className={`block font-medium text-sm mb-2 ${highContrast ? "text-yellow-300" : "text-white/80"}`}>
              {t("login.password")}
            </label>
            <div className={`flex items-center border rounded-xl px-4 py-3 transition-all duration-200 ${
              highContrast
                ? "border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-400"
                : "border-white/20 bg-white/10 backdrop-blur-sm focus-within:bg-white/15 focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20"
            }`}>
              <Lock className={`shrink-0 ${highContrast ? "text-yellow-400 mr-3" : "text-white/50 mr-3"}`} size={18} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                className={`w-full bg-transparent outline-none text-sm ${highContrast ? "placeholder-yellow-300/60 text-white" : "placeholder-white/40 text-white"}`}
                id="login-password"
                aria-label={t("login.password")}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className={`shrink-0 ${highContrast ? "text-yellow-400" : "text-white/50 hover:text-white/80"} transition-colors`}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Remember me & Forgot */}
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={`h-4 w-4 rounded border-gray-300 ${highContrast ? "accent-yellow-400" : "accent-indigo-400"}`}
              />
              <span className={`text-sm ${highContrast ? "text-yellow-300" : "text-white/70"}`}>{t("login.rememberMe")}</span>
            </label>
            <a href="/reset-password" className={`text-sm font-medium hover:underline transition-colors ${highContrast ? "text-yellow-400" : "text-white/70 hover:text-white"}`}>
              {t("login.forgotPassword")}
            </a>
          </div>

          {/* Help text */}
          <div className={`text-xs ${highContrast ? "text-yellow-300/60" : "text-white/40"}`}>
            <p>{t("login.help.passwordTips")}</p>
            <p className="mt-1">{t("login.help.shortcuts")}</p>
          </div>

          {/* Error */}
          {error && (
            <div id="login-error" role="alert" className={`text-sm p-3 rounded-xl text-center ${highContrast ? "bg-yellow-900 text-yellow-200" : "bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-200"}`}>
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
                  className={`block mx-auto mt-2 text-sm font-medium underline ${highContrast ? "text-yellow-400" : "text-white/80 hover:text-white"}`}
                >
                  {t("login.resendVerification")}
                </button>
              )}
            </div>
          )}
          {blockedTimer > 0 && (
            <div className={`text-sm mt-2 p-3 rounded-xl text-center ${highContrast ? "text-yellow-300" : "bg-amber-500/20 backdrop-blur-sm border border-amber-400/30 text-amber-200"}`} role="status" aria-live="polite">
              {t("login.errors.blockedTimer", { count: blockedTimer })}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || isBlocked}
            className={`w-full font-semibold py-3.5 rounded-xl transition-all duration-300 text-sm ${
              loading ? "opacity-60 cursor-not-allowed" : ""
            } ${
              highContrast
                ? "bg-yellow-400 text-black hover:bg-yellow-300"
                : "bg-white text-indigo-700 hover:bg-gray-50 shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]"
            }`}
          >
            {loading ? t("login.loading") : t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
