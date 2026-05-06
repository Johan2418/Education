import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app/App";
import { isUIVersionOutdated, clearUICache } from "@/shared/config/UI_VERSION";

// Clear outdated UI cache on app startup to prevent loading old UIs
if (isUIVersionOutdated()) {
  clearUICache();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
