import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import App from "./App";
import "./index.css";

// Load saved font size preference
const savedFontSize = localStorage.getItem("encode-font-size");
if (savedFontSize) {
  document.documentElement.style.setProperty("--editor-font-size", `${savedFontSize}px`);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
