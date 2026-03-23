import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Ribbon from "./Ribbon";
import Sidebar from "./Sidebar";
import QuickSwitcher from "../shared/QuickSwitcher";

export default function Shell() {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  // Show sidebar only on vault page
  const showSidebar = location.pathname === "/vault";

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
    // Toggle sidebar
    if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
      e.preventDefault();
      setSidebarOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Ribbon />
      {showSidebar && sidebarOpen && <Sidebar />}
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
