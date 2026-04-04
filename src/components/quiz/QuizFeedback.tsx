import { useEffect } from "react";
import type { QuestionResult, QuizQuestion } from "../../lib/tauri";
import { QuizRichValue } from "./QuizRichValue";

export function QuizFeedback({
  question,
  result,
  userAnswer,
  onNext,
}: {
  question: QuizQuestion;
  result: QuestionResult;
  userAnswer: string;
  onNext: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext]);

  const verdictConfig = {
    correct: {
      bg: "bg-teal/10 border-teal/30",
      text: "text-teal",
      icon: "\u2713",
      label: "Correct",
    },
    partial: {
      bg: "bg-amber/10 border-amber/30",
      text: "text-amber",
      icon: "~",
      label: "Partial",
    },
    incorrect: {
      bg: "bg-coral/10 border-coral/30",
      text: "text-coral",
      icon: "\u2717",
      label: "Incorrect",
    },
  };

  const config =
    verdictConfig[result.verdict as keyof typeof verdictConfig] ??
    verdictConfig.incorrect;

  return (
    <div>
      {/* Verdict banner */}
      <div className={`mb-4 rounded-xl border p-4 ${config.bg}`}>
        <div className="mb-1 flex items-center gap-2">
          <span className={`text-lg ${config.text}`}>{config.icon}</span>
          <span className={`text-sm font-semibold ${config.text}`}>
            {config.label}
          </span>
        </div>
        {result.explanation && (
          <p className="text-xs leading-relaxed text-text">
            {result.explanation}
          </p>
        )}
      </div>

      {/* Your answer */}
      <div className="mb-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Your answer
        </p>
        <QuizRichValue question={question} value={userAnswer} muted />
      </div>

      {/* Correct answer */}
      {result.verdict !== "correct" && (
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Correct answer
          </p>
          <QuizRichValue question={question} value={result.correct_answer} />
        </div>
      )}

      {/* Repair card notice */}
      {result.repair_card_id != null && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border-subtle bg-panel p-3">
          <span className="text-sm text-accent">&#128295;</span>
          <div>
            <p className="text-[11px] font-semibold text-accent">
              Repair card created
            </p>
            <p className="text-[10px] text-text-muted">
              Added to your review queue
            </p>
          </div>
        </div>
      )}

      {/* Next button */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            &rarr;
          </kbd>{" "}
          or{" "}
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            N
          </kbd>{" "}
          for next
        </p>
        <button
          type="button"
          onClick={onNext}
          className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-all hover:bg-accent/90"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
