import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  Layers,
  Brain,
  GraduationCap,
  BookOpen,
  Settings,
  PanelLeftClose,
  PanelLeft,
  TrendingUp,
} from "lucide-react";

interface RibbonItem {
  icon: React.ReactNode;
  path: string;
  label: string;
}

const TOP_ITEMS: RibbonItem[] = [
  { icon: <LayoutDashboard size={18} />, path: "/", label: "Home" },
  { icon: <FolderOpen size={18} />, path: "/vault", label: "Vault" },
  { icon: <Layers size={18} />, path: "/flashcards", label: "Cards" },
  { icon: <Brain size={18} />, path: "/quiz", label: "Quiz" },
  { icon: <GraduationCap size={18} />, path: "/teach-back", label: "Teach" },
  { icon: <TrendingUp size={18} />, path: "/progress", label: "Progress" },
];

const BOTTOM_ITEMS: RibbonItem[] = [
  { icon: <Settings size={18} />, path: "/settings", label: "Config" },
];

interface RibbonProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Ribbon({ sidebarOpen, onToggleSidebar }: RibbonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const renderItem = (item: RibbonItem) => {
    const isActive = location.pathname === item.path;
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        title={item.label}
        className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-colors ${
          isActive
            ? "bg-purple/15 text-purple"
            : "text-text-muted hover:text-text hover:bg-surface-2"
        }`}
      >
        {item.icon}
        <span className="text-[9px] leading-none">{item.label}</span>
      </button>
    );
  };

  return (
    <div className="w-[56px] h-screen bg-bg border-r border-border flex flex-col items-center py-3 shrink-0 no-select">
      {/* Logo */}
      <div className="w-8 h-8 flex items-center justify-center mb-2">
        <BookOpen size={20} className="text-purple" />
      </div>

      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors mb-2"
      >
        {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
      </button>

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
