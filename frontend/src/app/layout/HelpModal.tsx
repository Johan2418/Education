import { useTranslation } from "react-i18next";

export default function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  if (!open) return null;

  const shortcuts = [
    { keys: "Ctrl + B", desc: t("shortcut.openSidebar") },
    { keys: "Ctrl + H", desc: t("shortcut.toggleHighContrast") },
    { keys: "Ctrl + / -", desc: t("shortcut.adjustTextSize") },
    { keys: "Ctrl + R", desc: t("shortcut.reload") },
    { keys: "Esc", desc: t("shortcut.closeModal") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{t("addContentHelpTitle")}</h2>
        <h3 className="font-semibold mb-2">{t("shortcuts")}</h3>
        <ul className="space-y-2">
          {shortcuts.map((s, i) => (
            <li key={i} className="flex justify-between text-sm">
              <kbd className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">{s.keys}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="mt-6 w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
}
