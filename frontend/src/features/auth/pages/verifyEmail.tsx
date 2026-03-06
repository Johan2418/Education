import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { verifyEmail } from "@/shared/lib/auth";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type Props = { textSizeLarge: boolean; highContrast: boolean };

export default function VerifyEmail({ highContrast = false }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("verify.noToken"));
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus("success");
        setMessage(t("verify.success"));
      })
      .catch(() => {
        setStatus("error");
        setMessage(t("verify.error"));
      });
  }, [token, t]);

  return (
    <div className={`flex items-center justify-center min-h-screen p-4 transition-colors duration-300 ${highContrast ? "bg-black text-white" : "bg-gray-50"}`}>
      <div className={`${highContrast ? "bg-gray-900 border-2 border-white" : "bg-white shadow-2xl"} rounded-2xl w-full max-w-md p-8 text-center space-y-4`}>
        {status === "loading" && (
          <>
            <Loader2 className={`w-16 h-16 mx-auto animate-spin ${highContrast ? "text-yellow-400" : "text-indigo-600"}`} />
            <p className={highContrast ? "text-gray-300" : "text-gray-600"}>{t("verify.loading")}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            <h2 className={`text-2xl font-bold ${highContrast ? "text-yellow-400" : "text-indigo-700"}`}>
              {t("verify.successTitle")}
            </h2>
            <p className={highContrast ? "text-gray-300" : "text-gray-600"}>{message}</p>
            <button
              onClick={() => navigate("/login")}
              className={`w-full font-semibold py-3 rounded-lg transition duration-200 ${highContrast ? "bg-yellow-400 text-black hover:bg-yellow-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
            >
              {t("verify.goToLogin")}
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 mx-auto text-red-500" />
            <h2 className={`text-2xl font-bold ${highContrast ? "text-yellow-400" : "text-red-600"}`}>
              {t("verify.errorTitle")}
            </h2>
            <p className={highContrast ? "text-gray-300" : "text-gray-600"}>{message}</p>
            <button
              onClick={() => navigate("/login")}
              className={`w-full font-semibold py-3 rounded-lg transition duration-200 ${highContrast ? "bg-yellow-400 text-black hover:bg-yellow-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
            >
              {t("verify.goToLogin")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
