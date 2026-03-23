import { useLocation, useNavigate } from "react-router-dom";
import type { Route } from "../../lib/types";

interface NavItem {
  route: Route;
  label: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { route: "home", label: "Dashboard", path: "/" },
  { route: "vault", label: "Vault", path: "/vault" },
  { route: "flashcards", label: "Flashcards", path: "/flashcards" },
  { route: "quiz", label: "Quiz", path: "/quiz" },
  { route: "settings", label: "Settings", path: "/settings" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="w-[220px] h-screen bg-surface border-r border-border flex flex-col no-select shrink-0">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-purple tracking-tight">
          Encode
        </h1>
      </div>

      <div className="flex-1 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.route}
              onClick={() => navigate(item.path)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-surface-2 text-text border-r-2 border-purple"
                  : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-border text-xs text-text-muted">
        v0.1.0
      </div>
    </nav>
  );
}
