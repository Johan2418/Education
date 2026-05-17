import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./locales/es.json";
import en from "./locales/en.json";

const savedLang = localStorage.getItem("language") || "es";

function humanizeMissingKey(key: string): string {
  const lastSegment = key.split(".").pop() || key;
  const readable = lastSegment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!readable) return key;
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: savedLang,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  parseMissingKeyHandler: (key, defaultValue) => {
    if (typeof defaultValue === "string" && defaultValue.trim() !== "") {
      return defaultValue;
    }
    return humanizeMissingKey(key);
  },
});

export default i18n;
