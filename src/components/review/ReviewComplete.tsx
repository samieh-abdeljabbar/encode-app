import { CheckCircle2 } from "lucide-react";

export function ReviewComplete({
  stats,
}: {
  stats: {
    reviewed: number;
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-teal/10">
          <CheckCircle2 size={28} className="text-teal" />
        </div>
        <p className="mb-2 text-lg font-semibold text-text">All caught up!</p>
        <p className="mb-6 text-sm text-text-muted">
          {stats.reviewed > 0
            ? `Reviewed ${stats.reviewed} card${stats.reviewed !== 1 ? "s" : ""}`
            : "No cards due for review"}
        </p>
        {stats.reviewed > 0 && (
          <div className="flex justify-center gap-4 text-xs">
            {stats.again > 0 && (
              <span className="text-coral">Again: {stats.again}</span>
            )}
            {stats.hard > 0 && (
              <span className="text-amber">Hard: {stats.hard}</span>
            )}
            {stats.good > 0 && (
              <span className="text-teal">Good: {stats.good}</span>
            )}
            {stats.easy > 0 && (
              <span className="text-accent">Easy: {stats.easy}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
