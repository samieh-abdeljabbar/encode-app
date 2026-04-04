import { useNavigate } from "react-router-dom";
import type { QuizSummary } from "../../lib/tauri";

export function QuizComplete({
  summary,
  chapterTitle,
}: {
  summary: QuizSummary;
  chapterTitle: string;
}) {
  const navigate = useNavigate();
  const pct = Math.round(summary.score * 100);
  const passed = summary.score >= 0.8;

  const scoreColor = passed ? "text-teal" : "text-coral";
  const scoreBg = passed ? "bg-teal/10" : "bg-coral/10";

  return (
    <div className="flex h-full items-center justify-center px-7 py-7">
      <div className="w-full max-w-md text-center">
        {/* Score */}
        <div
          className={`mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl ${scoreBg}`}
        >
          <span className={`text-3xl font-bold ${scoreColor}`}>{pct}%</span>
        </div>

        <h2 className="mb-1 text-lg font-semibold text-text">{chapterTitle}</h2>
        <p className="mb-6 text-xs text-text-muted">Quiz Complete</p>

        {/* Stats grid */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-bold text-text">{summary.total}</p>
            <p className="text-[10px] text-text-muted">Total</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-bold text-teal">{summary.correct}</p>
            <p className="text-[10px] text-text-muted">Correct</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-bold text-amber">{summary.partial}</p>
            <p className="text-[10px] text-text-muted">Partial</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-bold text-coral">{summary.incorrect}</p>
            <p className="text-[10px] text-text-muted">Incorrect</p>
          </div>
        </div>

        {/* Notices */}
        {summary.repair_cards_created > 0 && (
          <div className="mb-3 rounded-xl border border-border-subtle bg-panel px-4 py-3 text-left">
            <p className="text-xs font-medium text-accent">
              {summary.repair_cards_created} repair card
              {summary.repair_cards_created !== 1 ? "s" : ""} created
            </p>
            <p className="text-[10px] text-text-muted">
              Added to your review queue
            </p>
          </div>
        )}

        {passed && (
          <div className="mb-3 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3 text-left">
            <p className="text-xs font-medium text-teal">
              Chapter advancing to mastering
            </p>
            <p className="text-[10px] text-text-muted">
              Keep reviewing to reach stable
            </p>
          </div>
        )}

        {summary.retest_scheduled && (
          <div className="mb-3 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-left">
            <p className="text-xs font-medium text-amber">
              Retest available in 48 hours
            </p>
            <p className="text-[10px] text-text-muted">
              Review your repair cards before retaking
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="h-9 rounded-xl border border-border bg-panel px-5 text-xs font-medium text-text transition-all hover:bg-panel-active"
          >
            Back to Library
          </button>
          <button
            type="button"
            onClick={() => navigate("/cards")}
            className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-all hover:bg-accent/90"
          >
            View Cards
          </button>
        </div>
      </div>
    </div>
  );
}
