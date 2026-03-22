interface ProgressBarProps {
  sectionsRevealed: number;
  totalSections: number;
  gatesCompleted: number;
}

export default function ProgressBar({
  sectionsRevealed,
  totalSections,
  gatesCompleted,
}: ProgressBarProps) {
  const consumptionPct = totalSections > 0 ? (sectionsRevealed / totalSections) * 100 : 0;
  const gatable = Math.max(0, totalSections - 1); // section 0 not gated
  const digestionPct = gatable > 0 ? (gatesCompleted / gatable) * 100 : 0;

  // Ratio: consumption vs digestion — green if balanced, amber if skewed, red if very skewed
  const ratio = gatesCompleted > 0 ? sectionsRevealed / gatesCompleted : sectionsRevealed;
  const barColor =
    ratio <= 2 ? "bg-teal" : ratio <= 3 ? "bg-amber" : "bg-coral";

  return (
    <div className="px-6 py-3 border-b border-border bg-surface">
      <div className="flex items-center justify-between text-xs text-text-muted mb-2">
        <span>
          {sectionsRevealed}/{totalSections} sections read
        </span>
        <span>{gatesCompleted} gates completed</span>
      </div>
      <div className="flex gap-2">
        {/* Consumption bar */}
        <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-300`}
            style={{ width: `${consumptionPct}%` }}
          />
        </div>
        {/* Digestion bar */}
        <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple rounded-full transition-all duration-300"
            style={{ width: `${digestionPct}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-text-muted mt-1">
        <span>consumption</span>
        <span>digestion</span>
      </div>
    </div>
  );
}
