import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import { Mail, ArrowLeft, Atom } from "lucide-react";

type Props = { textSizeLarge: boolean; highContrast: boolean };

export default function ResetPassword({ highContrast = false }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    if (!email.trim()) {
      toast.error(t("resetPassword.errors.enterEmail"));
      return;
    }
    // Password reset is not yet implemented in the Go backend.
    // This is a placeholder that shows the UI flow.
    toast.success(t("resetPassword.resendSuccess"));
    setSent(true);
  };

  return (
    <div
      className={`flex items-center justify-center min-h-screen p-4 ${highContrast ? "bg-black text-white" : ""}`}
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

      <div className={`relative animate-scale-in ${
        highContrast ? "bg-gray-900 border-2 border-white" : "bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl"
      } rounded-3xl w-full max-w-md p-8 sm:p-10`}>
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className={`p-3.5 rounded-2xl ${highContrast ? "bg-yellow-400" : "bg-white/15 backdrop-blur-sm shadow-lg"}`}>
            <Atom size={32} className={highContrast ? "text-black" : "text-white"} />
          </div>
        </div>

        <h2 className={`text-2xl font-bold text-center mb-2 ${highContrast ? "text-yellow-400" : "text-white"}`}>
          {t("resetPassword.title")}
        </h2>

        {sent ? (
          <div className="text-center mt-6 animate-fade-in-up">
            <div className={`inline-flex p-4 rounded-2xl mb-4 ${highContrast ? "bg-yellow-900" : "bg-emerald-500/20 backdrop-blur-sm"}`}>
              <Mail size={32} className={highContrast ? "text-yellow-300" : "text-emerald-300"} />
            </div>
            <p className={highContrast ? "text-green-400" : "text-emerald-200"}>{t("resetPassword.resendSuccess")}</p>
          </div>
        ) : (
          <div className="space-y-5 mt-6">
            <p className={`text-sm text-center ${highContrast ? "text-yellow-300" : "text-white/60"}`}>
              {t("resetPassword.invalidOrExpired")}
            </p>
            <div className={`flex items-center border rounded-xl px-4 py-3 transition-all duration-200 ${
              highContrast
                ? "border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-400"
                : "border-white/20 bg-white/10 backdrop-blur-sm focus-within:bg-white/15 focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20"
            }`}>
              <Mail className={`shrink-0 ${highContrast ? "text-yellow-400 mr-3" : "text-white/50 mr-3"}`} size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("resetPassword.emailPlaceholder")}
                className={`w-full bg-transparent outline-none text-sm ${highContrast ? "placeholder-yellow-300/60 text-white" : "placeholder-white/40 text-white"}`}
              />
            </div>
            <div className={`text-xs ${highContrast ? "text-yellow-300/60" : "text-white/40"}`}>
              <p>{t("resetPassword.invalidOrExpired")}</p>
            </div>
            <button
              onClick={handleResend}
              className={`w-full font-semibold py-3.5 rounded-xl transition-all duration-300 text-sm ${
                highContrast ? "bg-yellow-400 text-black hover:bg-yellow-300" : "bg-white text-indigo-700 hover:bg-gray-50 shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]"
              }`}
            >
              {t("resetPassword.resend")}
            </button>
            <div className="text-center">
              <a href="/login" className={`inline-flex items-center gap-1.5 text-sm font-medium hover:underline transition-colors ${highContrast ? "text-yellow-400" : "text-white/70 hover:text-white"}`}>
                <ArrowLeft size={14} />
                {t("login.signIn")}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
