import { MemoryRouter, Routes, Route } from "react-router-dom";
import Shell from "./components/layout/Shell";
import Home from "./pages/Home";
import VaultPage from "./pages/Vault";
import Settings from "./pages/Settings";

function App() {
  return (
    <MemoryRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

export default App;
