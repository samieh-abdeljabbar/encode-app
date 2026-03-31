import type { QuizAttemptInfo, QuizQuestion } from "../../lib/tauri";

export function QuizSidebar({
  questions,
  attempts,
  currentIndex,
}: {
  questions: QuizQuestion[];
  attempts: QuizAttemptInfo[];
  currentIndex: number;
}) {
  const getStatus = (idx: number) => {
    const attempt = attempts.find((a) => a.question_index === idx);
    if (!attempt || attempt.result === "unanswered") {
      if (idx === currentIndex) return "current";
      return "upcoming";
    }
    return attempt.result;
  };

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-border-subtle bg-panel px-3 py-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Questions
      </p>
      <div className="flex flex-col gap-1">
        {questions.map((_, idx) => {
          const status = getStatus(idx);
          let className =
            "flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all ";
          let icon = "";

          switch (status) {
            case "correct":
              className += "bg-teal/10 text-teal font-medium";
              icon = "\u2713";
              break;
            case "partial":
              className += "bg-amber/10 text-amber font-medium";
              icon = "~";
              break;
            case "incorrect":
              className += "bg-coral/10 text-coral font-medium";
              icon = "\u2717";
              break;
            case "current":
              className += "bg-accent text-white font-semibold";
              break;
            default:
              className += "text-text-muted";
              break;
          }

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: questions are static during quiz
            <div key={idx} className={className}>
              <span>{idx + 1}</span>
              {icon && <span className="text-sm">{icon}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
