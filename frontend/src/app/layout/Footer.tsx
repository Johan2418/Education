import { useTranslation } from "react-i18next";

export default function Footer({ highContrast }: { highContrast: boolean }) {
  const { t } = useTranslation();

  return (
    <footer
      className={`border-t py-6 px-4 transition-colors duration-300 ${
        highContrast ? "bg-black border-yellow-300 text-yellow-300" : "bg-gray-100 border-gray-200 text-gray-600"
      }`}
    >
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        {/* Brand */}
        <div>
          <h3 className="font-bold mb-2">{t("footer.brand")}</h3>
          <p>
            <strong>{t("footer.addressLabel")}</strong> {t("footer.address")}
          </p>
          <p>
            <strong>{t("footer.authorLabel")}</strong> {t("footer.author")}
          </p>
          <p>
            <strong>{t("footer.foundationLabel")}</strong> {t("footer.foundation")}
          </p>
        </div>

        {/* Support */}
        <div>
          <h3 className="font-bold mb-2">{t("footer.support")}</h3>
          <p>{t("footer.helpCenter")}</p>
          <p>{t("footer.contactEmail")}</p>
          <p>{t("footer.callUs")}</p>
        </div>

        {/* Policies */}
        <div>
          <h3 className="font-bold mb-2">{t("footer.policies")}</h3>
          <p>{t("footer.privacyPolicy")}</p>
          <p>{t("footer.termsOfUse")}</p>
          <p>{t("footer.accessibility")}</p>
        </div>
      </div>

      <div className="text-center text-xs mt-6 opacity-70">
        &copy; {new Date().getFullYear()} {t("footer.brand")}. {t("footer.rightsReserved")}.
      </div>
    </footer>
  );
}
