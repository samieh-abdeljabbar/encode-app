import { MemoryRouter, Routes, Route } from "react-router-dom";
import Shell from "./components/layout/Shell";
import Home from "./pages/Home";
import VaultPage from "./pages/Vault";
import ReaderPage from "./pages/Reader";
import FlashcardsPage from "./pages/Flashcards";
import QuizPage from "./pages/Quiz";
import Settings from "./pages/Settings";

function App() {
  return (
    <MemoryRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        {/* Reader is outside Shell — no sidebar, full-screen reading */}
        <Route path="/reader" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>
  );
}

export default App;
