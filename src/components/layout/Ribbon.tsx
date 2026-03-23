import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  Layers,
  Brain,
  GraduationCap,
  BookOpen,
  Settings,
} from "lucide-react";

interface RibbonItem {
  icon: React.ReactNode;
  path: string;
  label: string;
}

const TOP_ITEMS: RibbonItem[] = [
  { icon: <LayoutDashboard size={18} />, path: "/", label: "Dashboard" },
  { icon: <FolderOpen size={18} />, path: "/vault", label: "Vault" },
  { icon: <Layers size={18} />, path: "/flashcards", label: "Flashcards" },
  { icon: <Brain size={18} />, path: "/quiz", label: "Quiz" },
  { icon: <GraduationCap size={18} />, path: "/teach-back", label: "Teach Back" },
];

const BOTTOM_ITEMS: RibbonItem[] = [
  { icon: <Settings size={18} />, path: "/settings", label: "Settings" },
];

export default function Ribbon() {
  const navigate = useNavigate();
  const location = useLocation();

  const renderItem = (item: RibbonItem) => {
    const isActive = location.pathname === item.path;
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        title={item.label}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
          isActive
            ? "bg-purple/15 text-purple"
            : "text-text-muted hover:text-text hover:bg-surface-2"
        }`}
      >
        {item.icon}
      </button>
    );
  };

  return (
    <div className="w-[48px] h-screen bg-[#0a0a0a] border-r border-border flex flex-col items-center py-3 shrink-0 no-select">
      {/* Logo */}
      <div className="w-8 h-8 flex items-center justify-center mb-4">
        <BookOpen size={20} className="text-purple" />
      </div>

      {/* Nav icons */}
      <div className="flex-1 flex flex-col items-center gap-1">
        {TOP_ITEMS.map(renderItem)}
      </div>

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-1">
        {BOTTOM_ITEMS.map(renderItem)}
      </div>
    </div>
  );
}
