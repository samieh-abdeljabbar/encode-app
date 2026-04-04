import { useCallback, useEffect, useState } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { PathwayGenerationProvider } from "./components/layout/PathwayGenerationProvider";
import { Shell } from "./components/layout/Shell";
import { ThemeProvider } from "./components/layout/ThemeProvider";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { sanitizeRestorableRoute } from "./lib/routes";
import { getConfig, getLastSurface } from "./lib/tauri";
import { Cards } from "./pages/Cards";
import { ChapterView } from "./pages/ChapterView";
import { Graph } from "./pages/Graph";
import { Notes } from "./pages/Notes";
import { Onboarding } from "./pages/Onboarding";
import { Pathway } from "./pages/Pathway";
import { Progress } from "./pages/Progress";
import { Queue } from "./pages/Queue";
import { Quiz } from "./pages/Quiz";
import { Quizzes } from "./pages/Quizzes";
import { Reader } from "./pages/Reader";
import { Review } from "./pages/Review";
import { Settings } from "./pages/Settings";
import { Teachback } from "./pages/Teachback";
import { Workspace } from "./pages/Workspace";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

function AppContent() {
  const [bootState, setBootState] = useState<{
    initialRoute: string;
    showOnboarding: boolean;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const config = await getConfig();
        if (!config.onboarding_completed) {
          setBootState({ initialRoute: "/", showOnboarding: true });
          return;
        }
        const lastSurface = await getLastSurface();
        setBootState({
          initialRoute: sanitizeRestorableRoute(lastSurface),
          showOnboarding: false,
        });
      } catch {
        setBootState({ initialRoute: "/", showOnboarding: true });
      }
    })();
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setBootState({ initialRoute: "/", showOnboarding: false });
  }, []);

  // Loading state
  if (bootState === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  if (bootState.showOnboarding) {
    return (
      <MemoryRouter>
        <Routes>
          <Route
            path="*"
            element={<Onboarding onComplete={handleOnboardingComplete} />}
          />
        </Routes>
      </MemoryRouter>
    );
  }

  return (
    <MemoryRouter initialEntries={[bootState.initialRoute]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Queue />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route
            path="/library"
            element={<Navigate to="/workspace" replace />}
          />
          <Route path="/chapter" element={<ChapterView />} />
          <Route path="/reader" element={<Reader />} />
          <Route path="/review" element={<Review />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/quizzes" element={<Quizzes />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/teachback" element={<Teachback />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/pathway" element={<Pathway />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PathwayGenerationProvider>
          <AppContent />
        </PathwayGenerationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
