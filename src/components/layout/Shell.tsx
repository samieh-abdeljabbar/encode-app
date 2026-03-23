import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import QuickSwitcher from "../shared/QuickSwitcher";

export default function Shell() {
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd+O — Quick Switcher
    if ((e.metaKey || e.ctrlKey) && e.key === "o") {
      e.preventDefault();
      setSwitcherOpen(true);
    }
    // Cmd+Shift+F — Focus search (vault search input)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
      e.preventDefault();
      const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
      searchInput?.focus();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <QuickSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
    </div>
  );
}
