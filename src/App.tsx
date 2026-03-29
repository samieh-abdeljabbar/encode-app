import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { ChapterView } from "./pages/ChapterView";
import { Library } from "./pages/Library";
import { Reader } from "./pages/Reader";
import { Settings } from "./pages/Settings";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-text-muted">{name}</p>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MemoryRouter initialEntries={["/library"]}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Placeholder name="Queue" />} />
            <Route path="/library" element={<Library />} />
            <Route path="/chapter" element={<ChapterView />} />
            <Route path="/reader" element={<Reader />} />
            <Route path="/review" element={<Placeholder name="Review" />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ErrorBoundary>
  );
}
