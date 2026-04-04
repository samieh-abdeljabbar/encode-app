import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  Repeat,
  RotateCcw,
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
  quiz_available: {
    icon: ClipboardCheck,
    color: "text-accent",
    label: "Quiz",
  },
  quiz_retake: { icon: RotateCcw, color: "text-amber", label: "Retake" },
  teachback_available: {
    icon: FileText,
    color: "text-purple-400",
    label: "Teach-back",
  },
};

export function QueueItemRow({
  item,
  featured = false,
}: {
  item: QueueItem;
  featured?: boolean;
}) {
  const navigate = useNavigate();
  const config = TYPE_CONFIG[item.item_type] ?? TYPE_CONFIG.new_chapter;

  return (
    <button
      type="button"
      onClick={() => navigate(item.target_route)}
      className={`group w-full text-left transition-all ${
        featured
          ? "soft-panel rounded-[28px] border border-accent/18 p-6 hover:-translate-y-0.5 hover:border-accent/30"
          : "soft-panel rounded-2xl p-4 hover:-translate-y-0.5 hover:border-accent/20"
      }`}
    >
      <div className={`flex items-start gap-4 ${featured ? "md:gap-5" : ""}`}>
        <div
          className={`flex shrink-0 items-center justify-center rounded-2xl bg-panel-alt ${config.color} ${
            featured ? "h-12 w-12" : "h-10 w-10"
          }`}
        >
          <config.icon size={featured ? 20 : 18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.color} ${
                featured ? "bg-white/60" : "bg-panel-alt"
              }`}
            >
              {config.label}
            </span>
            {item.estimated_minutes > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-panel-alt px-2.5 py-1 text-[11px] text-text-muted">
                <Clock size={11} />
                {item.estimated_minutes} min
              </span>
            )}
          </div>

          <div
            className={`mt-3 text-text ${
              featured
                ? "serif-heading text-2xl font-semibold leading-tight"
                : "text-base font-semibold leading-snug"
            }`}
          >
            {item.title}
          </div>
          <div className="mt-1 text-sm text-text-muted">{item.subtitle}</div>

          <div
            className={`mt-4 rounded-2xl border border-border-subtle bg-panel/65 px-4 py-3 ${
              featured ? "" : "text-sm"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Why now
            </div>
            <div className="mt-1.5 text-sm leading-relaxed text-text">
              {item.reason}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-medium text-accent">
              {featured ? "Start this next" : "Open task"}
            </span>
            <ChevronRight
              size={18}
              className="shrink-0 text-text-muted/50 transition-transform group-hover:translate-x-0.5"
            />
          </div>
        </div>
      </div>
    </button>
  );
}
