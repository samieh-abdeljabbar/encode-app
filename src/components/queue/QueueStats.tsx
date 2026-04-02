import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Layers,
  Repeat,
  Trophy,
} from "lucide-react";
import type { QueueSummary } from "../../lib/tauri";

export function QueueStats({ summary }: { summary: QueueSummary }) {
  const topStats = [
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

  const bottomStats = [
    {
      icon: Trophy,
      label: "Chapters Done",
      value: summary.chapters_completed,
      color: "text-accent",
      bg: "bg-accent/6",
    },
    {
      icon: Layers,
      label: "Total Cards",
      value: summary.total_cards,
      color: "text-text-muted",
      bg: "bg-panel-alt",
    },
    {
      icon: ClipboardCheck,
      label: "Quizzes Passed",
      value: summary.quizzes_passed,
      color: "text-teal",
      bg: "bg-teal/6",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4">
        {topStats.map((stat) => (
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
      <div className="grid grid-cols-3 gap-4">
        {bottomStats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-xl border border-border-subtle bg-panel/60 p-3"
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${stat.bg}`}
            >
              <stat.icon size={13} className={stat.color} />
            </div>
            <div>
              <div className="font-mono text-base tabular-nums tracking-tight text-text">
                {stat.value}
              </div>
              <div className="text-[9px] font-medium uppercase tracking-wide text-text-muted">
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
