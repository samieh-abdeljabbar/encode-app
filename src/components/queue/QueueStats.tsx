import { BookOpen, CheckCircle2, Repeat, Sparkles } from "lucide-react";
import type { QueueSummary } from "../../lib/tauri";

export function QueueStats({ summary }: { summary: QueueSummary }) {
  const stats = [
    {
      icon: Repeat,
      label: "Review due",
      value: summary.due_cards,
      tone: "text-coral",
      bg: "bg-coral/8",
    },
    {
      icon: BookOpen,
      label: "Active chapters",
      value: summary.chapters_in_progress,
      tone: "text-amber",
      bg: "bg-amber/8",
    },
    {
      icon: CheckCircle2,
      label: "Sections today",
      value: summary.sections_studied_today,
      tone: "text-teal",
      bg: "bg-teal/8",
    },
    {
      icon: Sparkles,
      label: "Quizzes passed",
      value: summary.quizzes_passed,
      tone: "text-accent",
      bg: "bg-accent/8",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="soft-panel flex items-center gap-3 rounded-2xl px-4 py-4"
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${stat.bg}`}
          >
            <stat.icon size={18} className={stat.tone} />
          </div>
          <div>
            <div className="font-mono text-xl tabular-nums tracking-tight text-text">
              {stat.value}
            </div>
            <div className="text-xs text-text-muted">{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
