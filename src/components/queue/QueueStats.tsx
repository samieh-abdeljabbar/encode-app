import { BookOpen, CheckCircle2, Repeat } from "lucide-react";
import type { QueueSummary } from "../../lib/tauri";

export function QueueStats({ summary }: { summary: QueueSummary }) {
  const stats = [
    {
      icon: Repeat,
      label: "Due Cards",
      value: summary.due_cards,
      color: "text-coral",
      bg: "bg-coral/6",
    },
    {
      icon: BookOpen,
      label: "In Progress",
      value: summary.chapters_in_progress,
      color: "text-amber",
      bg: "bg-amber/6",
    },
    {
      icon: CheckCircle2,
      label: "Studied Today",
      value: summary.sections_studied_today,
      color: "text-teal",
      bg: "bg-teal/6",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-3 rounded-xl border border-border bg-panel p-4"
        >
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg}`}
          >
            <stat.icon size={16} className={stat.color} />
          </div>
          <div>
            <div className="font-mono text-xl tabular-nums tracking-tight text-text">
              {stat.value}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {stat.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
