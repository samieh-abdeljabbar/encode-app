import { useEffect } from "react";
import type { QuizQuestion } from "../../lib/tauri";

export function SelfRatePanel({
  question,
  userAnswer,
  onRate,
}: {
  question: QuizQuestion;
  userAnswer: string;
  onRate: (rating: string) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      if (e.key === "1") {
        e.preventDefault();
        onRate("correct");
      } else if (e.key === "2") {
        e.preventDefault();
        onRate("partial");
      } else if (e.key === "3") {
        e.preventDefault();
        onRate("incorrect");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onRate]);

  return (
    <div>
      <p className="mb-4 text-sm font-medium text-text">
        Compare your answer with the key points below, then rate yourself:
      </p>

      {/* Your answer */}
      <div className="mb-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Your answer
        </p>
        <p className="rounded-lg bg-surface p-3 text-xs leading-relaxed text-text-muted">
          {userAnswer}
        </p>
      </div>

      {/* Reference answer */}
      <div className="mb-5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Key points
        </p>
        <p className="rounded-lg bg-surface p-3 text-xs leading-relaxed text-text">
          {question.correct_answer}
        </p>
      </div>

      {/* Rating buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onRate("correct")}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-teal/30 bg-teal/5 text-xs font-medium text-teal transition-all hover:bg-teal/10"
        >
          Got it
          <kbd className="rounded border border-teal/20 px-1 text-[10px]">
            1
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => onRate("partial")}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-amber/30 bg-amber/5 text-xs font-medium text-amber transition-all hover:bg-amber/10"
        >
          Partially
          <kbd className="rounded border border-amber/20 px-1 text-[10px]">
            2
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => onRate("incorrect")}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-coral/30 bg-coral/5 text-xs font-medium text-coral transition-all hover:bg-coral/10"
        >
          Missed it
          <kbd className="rounded border border-coral/20 px-1 text-[10px]">
            3
          </kbd>
        </button>
      </div>
    </div>
  );
}
