import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Repeat,
  Settings,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { path: "/", icon: LayoutDashboard, label: "Queue" },
  { path: "/library", icon: BookOpen, label: "Library" },
  { path: "/review", icon: Repeat, label: "Review" },
] as const;

const SETTINGS_ITEM = {
  path: "/settings",
  icon: Settings,
  label: "Settings",
} as const;

type NavItem = (typeof NAV_ITEMS)[number] | typeof SETTINGS_ITEM;

export function Ribbon() {
  const navigate = useNavigate();
  const location = useLocation();

  const renderNavButton = (item: NavItem, key?: string) => {
    const isActive = location.pathname === item.path;
    return (
      <button
        key={key ?? item.path}
        type="button"
        onClick={() => navigate(item.path)}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 ${
          isActive
            ? "bg-accent text-white shadow-sm"
            : "text-text-muted hover:bg-panel-active hover:text-text"
        }`}
      >
        <item.icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
        <span className="pointer-events-none absolute left-full ml-2 hidden rounded-md bg-text px-2 py-1 text-[11px] font-medium text-panel shadow-lg group-hover:block">
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center border-r border-border-subtle bg-panel px-1 pb-3 pt-10">
      <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
        <GraduationCap size={16} className="text-accent" />
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => renderNavButton(item))}
      </div>

      <div className="mt-auto">{renderNavButton(SETTINGS_ITEM)}</div>
    </nav>
  );
}
