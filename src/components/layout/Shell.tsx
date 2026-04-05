import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  getPageDescription,
  getPageLabel,
  isRestorableRoute,
} from "../../lib/routes";
import {
  handleKeyDown,
  registerShortcut,
  unregisterShortcut,
} from "../../lib/shortcuts";
import { setLastSurface } from "../../lib/tauri";
import { useUpdaterStore } from "../../lib/updater";
import { QuickSwitcher } from "./QuickSwitcher";
import { Ribbon } from "./Ribbon";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { UpdatePrompt } from "./UpdatePrompt";

export function Shell() {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const checkForUpdates = useUpdaterStore((s) => s.checkForUpdates);

  const location = useLocation();
  const label = getPageLabel(location.pathname);
  const description = getPageDescription(location.pathname);

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

  useEffect(() => {
    const route = `${location.pathname}${location.search}`;
    if (!isRestorableRoute(route)) return;
    setLastSurface(route).catch(() => {});
  }, [location.pathname, location.search]);

  useEffect(() => {
    checkForUpdates().catch(() => {});
  }, [checkForUpdates]);

  return (
    <div className="flex h-screen bg-bg text-text">
      <Ribbon />
      <main className="flex flex-1 flex-col overflow-hidden">
        <div data-tauri-drag-region className="h-5 shrink-0">
          <span className="sr-only">Drag window</span>
        </div>
        <div className="shrink-0 border-b border-border-subtle/70 bg-panel/60 px-8 py-5 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-end justify-between gap-6">
            <div>
              <div className="section-kicker">{label}</div>
              {description && (
                <p className="mt-1 text-sm text-text-muted">{description}</p>
              )}
            </div>
            <div className="hidden rounded-full border border-border-subtle bg-panel px-3 py-1.5 text-xs text-text-muted lg:block">
              Quick Switcher: <span className="font-medium text-text">O</span>
            </div>
          </div>
        </div>
        <div className="page-fade-in flex-1 overflow-auto">
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
      <UpdatePrompt />
    </div>
  );
}
