import "./dev/bootstrap";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import { Launcher } from "./launcher/Launcher";
import { SettingsWindow } from "./settings/Settings";
import "./styles.css";

const label = getCurrentWindow().label;
document.documentElement.dataset.window = label;

// No browser context menu or reload shortcuts in a launcher.
window.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea, .markdown, .detail-text")) e.preventDefault();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r" && label === "settings")) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{label === "settings" ? <SettingsWindow /> : <Launcher />}</React.StrictMode>,
);
