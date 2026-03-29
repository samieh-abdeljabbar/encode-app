export function ProgressBar({
  current,
  total,
}: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-active">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-text-muted">
        {current}/{total}
      </span>
    </div>
  );
}
