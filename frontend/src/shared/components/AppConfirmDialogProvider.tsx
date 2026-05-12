import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";

type DialogTone = "default" | "danger";
type DialogType = "confirm" | "alert";

type DialogRequest = {
  type: DialogType;
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
  resolve: (value: boolean) => void;
};

type ConfirmOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
};

type ConfirmContextValue = {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  alert: (message: string, options?: Omit<ConfirmOptions, "cancelText">) => Promise<void>;
};

export const AppConfirmDialogContext = createContext<ConfirmContextValue | null>(null);

export default function AppConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [activeDialog, setActiveDialog] = useState<DialogRequest | null>(null);

  const closeWith = useCallback((value: boolean) => {
    setActiveDialog((current) => {
      if (current) current.resolve(value);
      return null;
    });
  }, []);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setActiveDialog({
        type: "confirm",
        message,
        title: options.title,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        tone: options.tone ?? "default",
        resolve,
      });
    });
  }, []);

  const alert = useCallback((message: string, options: Omit<ConfirmOptions, "cancelText"> = {}) => {
    return new Promise<void>((resolve) => {
      setActiveDialog({
        type: "alert",
        message,
        title: options.title,
        confirmText: options.confirmText,
        tone: options.tone ?? "default",
        resolve: () => resolve(),
      });
    });
  }, []);

  const contextValue = useMemo<ConfirmContextValue>(() => ({ confirm, alert }), [confirm, alert]);

  const isDanger = activeDialog?.tone === "danger";
  const confirmLabel = activeDialog?.confirmText || (activeDialog?.type === "confirm" ? "Confirmar" : "Entendido");
  const cancelLabel = activeDialog?.cancelText || "Cancelar";

  return (
    <AppConfirmDialogContext.Provider value={contextValue}>
      {children}

      {activeDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar diálogo"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => closeWith(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start gap-3 px-5 pt-5 pb-3">
              <div className={`mt-0.5 rounded-full p-2 ${isDanger ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"}`}>
                {isDanger ? <XCircle size={18} /> : activeDialog.type === "confirm" ? <AlertTriangle size={18} /> : <Info size={18} />}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-900">
                  {activeDialog.title || (activeDialog.type === "confirm" ? "Confirmación" : "Aviso")}
                </h3>
                <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{activeDialog.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              {activeDialog.type === "confirm" && (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => closeWith(false)}
                >
                  {cancelLabel}
                </button>
              )}
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition ${
                  isDanger ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
                onClick={() => closeWith(true)}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppConfirmDialogContext.Provider>
  );
}

