import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import App from "./App";
import "./index.css";

// Load saved appearance preferences
const savedFontSize = localStorage.getItem("encode-font-size");
if (savedFontSize) {
  document.documentElement.style.setProperty("--editor-font-size", `${savedFontSize}px`);
}
const savedFontFamily = localStorage.getItem("encode-font-family");
if (savedFontFamily) {
  const families: Record<string, string> = {
    inter: "'Inter', system-ui, sans-serif",
    georgia: "Georgia, Merriweather, serif",
    system: "system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', monospace",
  };
  document.documentElement.style.setProperty("--editor-font-family", families[savedFontFamily] || families.georgia);
}
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
