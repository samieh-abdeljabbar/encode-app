import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Ribbon from "./Ribbon";
import Sidebar from "./Sidebar";
import QuickSwitcher from "../shared/QuickSwitcher";
import ShortcutsOverlay from "../shared/ShortcutsOverlay";
import { useAppStore } from "../../stores/app";
import PomodoroRuntime from "./PomodoroRuntime";

export default function Shell() {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const config = useAppStore((s) => s.config);
  const loadConfig = useAppStore((s) => s.loadConfig);

  // Sidebar only shows on vault page, controlled by toggle
  const onVault = location.pathname === "/vault";
  const showSidebar = onVault && sidebarOpen;

  useEffect(() => {
    if (!config) {
      loadConfig();
    }
  }, [config, loadConfig]);

  // Auto-open sidebar when navigating to Vault
  useEffect(() => {
    if (onVault) setSidebarOpen(true);
  }, [onVault]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "o") {
      e.preventDefault();
      setSwitcherOpen(true);
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
      e.preventDefault();
      const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
      searchInput?.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
      e.preventDefault();
      setSidebarOpen((v) => !v);
    }
    // Zoom: Cmd+= / Cmd+- / Cmd+0
    if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      const cur = parseInt(localStorage.getItem("encode-font-size") || "16");
      const next = Math.min(24, cur + 1);
      document.documentElement.style.setProperty("--editor-font-size", `${next}px`);
      localStorage.setItem("encode-font-size", String(next));
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "-") {
      e.preventDefault();
      const cur = parseInt(localStorage.getItem("encode-font-size") || "16");
      const next = Math.max(10, cur - 1);
      document.documentElement.style.setProperty("--editor-font-size", `${next}px`);
      localStorage.setItem("encode-font-size", String(next));
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "0") {
      e.preventDefault();
      document.documentElement.style.setProperty("--editor-font-size", "16px");
      localStorage.setItem("encode-font-size", "16");
    }
    if (e.key === "?" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      setShortcutsOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Ribbon
        sidebarOpen={sidebarOpen}
        sidebarVisible={showSidebar}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      {showSidebar && <Sidebar />}
      <main className="app-main-surface relative flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <QuickSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
      <ShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <PomodoroRuntime />
    </div>
  );
}
