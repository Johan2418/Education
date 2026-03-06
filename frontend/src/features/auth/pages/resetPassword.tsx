import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";

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
    <div className={`flex items-center justify-center min-h-screen p-4 ${highContrast ? "bg-black text-white" : "bg-gray-50"}`}>
      <div className={`${highContrast ? "bg-gray-900 border-2 border-white" : "bg-white shadow-2xl"} rounded-2xl w-full max-w-md p-6 sm:p-8`}>
        <h2 className={`text-2xl font-bold text-center mb-4 ${highContrast ? "text-yellow-400" : "text-indigo-700"}`}>
          {t("resetPassword.title")}
        </h2>

        {sent ? (
          <p className="text-center text-green-600">{t("resetPassword.resendSuccess")}</p>
        ) : (
          <div className="space-y-4">
            <p className={`text-sm ${highContrast ? "text-yellow-300" : "text-gray-600"}`}>
              {t("resetPassword.invalidOrExpired")}
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("resetPassword.emailPlaceholder")}
              className={`w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 ${
                highContrast ? "bg-gray-800 text-white border-yellow-400 focus:ring-yellow-400" : "border-gray-300 focus:ring-indigo-500"
              }`}
            />
            <button
              onClick={handleResend}
              className={`w-full font-semibold py-2 rounded-lg transition ${
                highContrast ? "bg-yellow-400 text-black hover:bg-yellow-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {t("resetPassword.resend")}
            </button>
            <div className="text-center">
              <a href="/login" className={`text-sm font-medium hover:underline ${highContrast ? "text-yellow-400" : "text-indigo-600"}`}>
                {t("login.signIn")}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
