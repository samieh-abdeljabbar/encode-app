import { useEffect, useState } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Shell from "./components/layout/Shell";
import { applyTheme, getCurrentTheme } from "./lib/themes";
import Home from "./pages/Home";
import VaultPage from "./pages/Vault";
import ReaderPage from "./pages/Reader";
import FlashcardsPage from "./pages/Flashcards";
import QuizPage from "./pages/Quiz";
import TeachBackPage from "./pages/TeachBack";
import Settings from "./pages/Settings";

function UpdateBanner() {
  const [status, setStatus] = useState<"idle" | "available" | "downloading" | "ready">("idle");
  const [version, setVersion] = useState("");

  useEffect(() => {
    // Check for updates on launch (skip in dev)
    if (window.location.hostname === "localhost") return;

    import("@tauri-apps/plugin-updater").then(async ({ check }) => {
      try {
        const update = await check();
        if (update) {
          setVersion(update.version);
          setStatus("available");
        }
      } catch {
        // No update or offline — silently ignore
      }
    }).catch(() => {});
  }, []);

  const handleUpdate = async () => {
    setStatus("downloading");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        setStatus("ready");
        // Relaunch after a brief delay
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch {
      setStatus("available"); // Reset on error
    }
  };

  if (status === "idle") return null;

  return (
    <div className="bg-purple/10 border-b border-purple/30 px-4 py-2 flex items-center justify-between shrink-0">
      <p className="text-xs text-text">
        {status === "available" && `Update v${version} available`}
        {status === "downloading" && "Downloading update..."}
        {status === "ready" && "Update installed — restarting..."}
      </p>
      {status === "available" && (
        <button
          onClick={handleUpdate}
          className="text-xs px-3 py-1 bg-purple text-white rounded hover:opacity-90"
        >
          Update Now
        </button>
      )}
      {status === "downloading" && (
        <span className="text-xs text-purple animate-pulse">Installing...</span>
      )}
    </div>
  );
}

function App() {
  useEffect(() => {
    applyTheme(getCurrentTheme());
  }, []);

  return (
    <MemoryRouter>
      <UpdateBanner />
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/teach-back" element={<TeachBackPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        {/* Reader is outside Shell — no sidebar, full-screen reading */}
        <Route path="/reader" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>
  );
}

export default App;
