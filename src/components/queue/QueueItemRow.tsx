import {
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
  Repeat,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { QueueItem } from "../../lib/tauri";

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Repeat; color: string; label: string }
> = {
  due_card: { icon: Repeat, color: "text-coral", label: "Review" },
  repair_card: { icon: Wrench, color: "text-coral", label: "Repair" },
  continue_reading: { icon: BookOpen, color: "text-amber", label: "Continue" },
  synthesis_required: {
    icon: FileText,
    color: "text-teal",
    label: "Synthesis",
  },
  new_chapter: { icon: BookOpen, color: "text-text-muted", label: "New" },
};

export function QueueItemRow({ item }: { item: QueueItem }) {
  const navigate = useNavigate();
  const config = TYPE_CONFIG[item.item_type] ?? TYPE_CONFIG.new_chapter;

  return (
    <button
      type="button"
      onClick={() => navigate(item.target_route)}
      className="flex w-full items-center gap-4 rounded-xl border border-border bg-panel p-4 text-left transition-all hover:border-accent/25 hover:shadow-sm"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel-alt ${config.color}`}
      >
        <config.icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold uppercase tracking-[0.1em] ${config.color}`}
          >
            {config.label}
          </span>
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-text">
          {item.title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
          <span>{item.subtitle}</span>
          <span className="text-text-muted/30">·</span>
          <span>{item.reason}</span>
          {item.estimated_minutes > 0 && (
            <>
              <span className="text-text-muted/30">·</span>
              <span className="inline-flex items-center gap-0.5">
                <Clock size={10} />
                {item.estimated_minutes} min
              </span>
            </>
          )}
        </div>
      </div>
      <ChevronRight size={14} className="shrink-0 text-text-muted/40" />
    </button>
  );
}
