import { useTranslation } from "react-i18next";

export default function ChemicalReactions() {
  const { t } = useTranslation();
  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("chemistry.chemicalReactions.title", { defaultValue: "Reacciones Químicas" })}</h1>
      <p className="text-gray-500">{t("chemistry.comingSoon", { defaultValue: "Contenido próximamente..." })}</p>
    </div>
  );
}
