import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource-variable/literata/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
import App from "./App";
import { initializeFontPreferences } from "./lib/fonts";
import "./index.css";

// Load saved appearance preferences
const savedFontSize = localStorage.getItem("encode-font-size");
if (savedFontSize) {
  document.documentElement.style.setProperty("--editor-font-size", `${savedFontSize}px`);
}
initializeFontPreferences();
const savedWidth = localStorage.getItem("encode-content-width");
if (savedWidth) {
  const widths: Record<string, string> = { narrow: "640px", medium: "800px", wide: "100%" };
  document.documentElement.style.setProperty("--editor-max-width", widths[savedWidth] || "800px");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
