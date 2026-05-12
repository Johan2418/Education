import { useContext } from "react";
import { AppConfirmDialogContext } from "@/shared/components/AppConfirmDialogProvider";

export function useAppConfirm() {
  const context = useContext(AppConfirmDialogContext);
  if (!context) {
    throw new Error("useAppConfirm must be used within AppConfirmDialogProvider");
  }
  return context;
}

