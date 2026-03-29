import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  handleKeyDown,
  registerShortcut,
  unregisterShortcut,
} from "../../lib/shortcuts";
import { QuickSwitcher } from "./QuickSwitcher";
import { Ribbon } from "./Ribbon";
import { ShortcutsOverlay } from "./ShortcutsOverlay";

export function Shell() {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const location = useLocation();
  const pageLabel: Record<string, string> = {
    "/": "Queue",
    "/library": "Library",
    "/reader": "Reader",
    "/review": "Review",
    "/settings": "Settings",
  };
  const label = pageLabel[location.pathname] ?? "";

  const toggleSwitcher = useCallback(() => setSwitcherOpen((o) => !o), []);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((o) => !o), []);

  useEffect(() => {
    registerShortcut("o", toggleSwitcher, "Quick Switcher");
    registerShortcut("/", toggleShortcuts, "Keyboard Shortcuts");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unregisterShortcut("o");
      unregisterShortcut("/");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleSwitcher, toggleShortcuts]);

  return (
    <div className="flex h-screen bg-bg">
      <Ribbon />
      <main className="flex flex-1 flex-col overflow-hidden">
        <div
          data-tauri-drag-region
          className="flex h-[52px] shrink-0 items-center border-b border-border-subtle bg-bg px-5"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {label}
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
      <QuickSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
      <ShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
