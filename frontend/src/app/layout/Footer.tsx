import { useTranslation } from "react-i18next";
import { Mail, Phone, HelpCircle, Shield, FileText, BookOpen } from "lucide-react";

export default function Footer({ highContrast }: { highContrast: boolean }) {
  const { t } = useTranslation();

  return (
    <footer
      className={`relative border-t py-10 px-4 transition-colors duration-300 ${
        highContrast
          ? "bg-black border-yellow-300 text-yellow-300"
          : "bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-transparent text-gray-300"
      }`}
    >
      {/* Top gradient accent line */}
      {!highContrast && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-60" />
      )}

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
        {/* Brand */}
        <div>
          <h3 className={`font-bold text-base mb-3 ${highContrast ? "text-yellow-300" : "text-white"}`}>
            {t("footer.brand")}
          </h3>
          <div className="space-y-2">
            <p className="flex items-start gap-2">
              <BookOpen size={14} className="mt-0.5 shrink-0 text-indigo-400" />
              <span><strong className={highContrast ? "" : "text-white/80"}>{t("footer.addressLabel")}</strong> {t("footer.address")}</span>
            </p>
            <p className="flex items-start gap-2">
              <Shield size={14} className="mt-0.5 shrink-0 text-violet-400" />
              <span><strong className={highContrast ? "" : "text-white/80"}>{t("footer.authorLabel")}</strong> {t("footer.author")}</span>
            </p>
            <p className="flex items-start gap-2">
              <FileText size={14} className="mt-0.5 shrink-0 text-cyan-400" />
              <span><strong className={highContrast ? "" : "text-white/80"}>{t("footer.foundationLabel")}</strong> {t("footer.foundation")}</span>
            </p>
          </div>
        </div>

        {/* Support */}
        <div>
          <h3 className={`font-bold text-base mb-3 ${highContrast ? "text-yellow-300" : "text-white"}`}>
            {t("footer.support")}
          </h3>
          <div className="space-y-2">
            <p className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer">
              <HelpCircle size={14} className="shrink-0 text-indigo-400" />
              {t("footer.helpCenter")}
            </p>
            <p className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer">
              <Mail size={14} className="shrink-0 text-violet-400" />
              {t("footer.contactEmail")}
            </p>
            <p className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer">
              <Phone size={14} className="shrink-0 text-cyan-400" />
              {t("footer.callUs")}
            </p>
          </div>
        </div>

        {/* Policies */}
        <div>
          <h3 className={`font-bold text-base mb-3 ${highContrast ? "text-yellow-300" : "text-white"}`}>
            {t("footer.policies")}
          </h3>
          <div className="space-y-2">
            <p className="hover:text-white transition-colors cursor-pointer">{t("footer.privacyPolicy")}</p>
            <p className="hover:text-white transition-colors cursor-pointer">{t("footer.termsOfUse")}</p>
            <p className="hover:text-white transition-colors cursor-pointer">{t("footer.accessibility")}</p>
          </div>
        </div>
      </div>

      <div className={`text-center text-xs mt-8 pt-6 border-t ${highContrast ? "border-yellow-300/30" : "border-white/10"}`}>
        <span className="opacity-60">
          &copy; {new Date().getFullYear()} {t("footer.brand")}. {t("footer.rightsReserved")}.
        </span>
      </div>
    </footer>
  );
}
