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
import AiActivityButton from "./AiActivityButton";
import { usePomodoroStore } from "../../stores/pomodoro";

function formatCompactTimer(totalSecs: number): string {
  const safe = Math.max(0, totalSecs);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

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
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}

export default function Ribbon({ sidebarOpen, sidebarVisible, onToggleSidebar }: RibbonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const timerStatus = usePomodoroStore((s) => s.status);
  const timerPhase = usePomodoroStore((s) => s.phase);
  const timerRemaining = usePomodoroStore((s) => s.remainingSecs);
  const showTimerIndicator = !sidebarVisible && timerStatus === "running";
  const timerTone =
    timerPhase === "study" ? "bg-accent" : timerPhase === "break" ? "bg-teal" : "bg-amber";

  const renderItem = (item: RibbonItem) => {
    const isActive = location.pathname === item.path;
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        title={item.label}
        className={`relative w-full flex flex-col items-center justify-center gap-0.5 rounded-xl border px-0 py-2 transition-all ${
          isActive
            ? "border-accent/30 bg-accent-soft text-text shadow-[var(--shadow-panel)]"
            : "border-transparent text-text-muted hover:border-border-strong hover:bg-panel-active hover:text-text"
        }`}
      >
        {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}
        {item.icon}
        <span className="text-[9px] leading-none">{item.label}</span>
      </button>
    );
  };

  return (
    <div className="w-[56px] h-screen bg-panel border-r border-border-subtle flex flex-col items-center py-4 px-2 shrink-0 no-select shadow-[var(--shadow-panel)]">
      {/* Logo */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent-soft text-accent">
        <BookOpen size={20} />
      </div>

      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-text-muted transition-colors hover:border-border-strong hover:bg-panel-active hover:text-text"
      >
        {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
      </button>

      {/* Nav icons */}
      <div className="flex-1 flex flex-col items-center gap-1.5">
        {TOP_ITEMS.map(renderItem)}
      </div>

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-1.5 pt-3">
        {showTimerIndicator && (
          <div className="flex w-full flex-col items-center gap-1 rounded-xl border border-border-subtle bg-panel-alt px-1.5 py-2 text-[9px] text-text shadow-[var(--shadow-panel)]">
            <span className={`h-1.5 w-1.5 rounded-full ${timerTone}`} />
            <span className="font-mono tabular-nums">{formatCompactTimer(timerRemaining)}</span>
          </div>
        )}
        <AiActivityButton />
        {BOTTOM_ITEMS.map(renderItem)}
      </div>
    </div>
  );
}
