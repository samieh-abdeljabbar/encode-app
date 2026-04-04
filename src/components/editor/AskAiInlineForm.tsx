import { useCallback, useEffect, useRef, useState } from "react";
import { askInlineQuestion } from "../../lib/tauri";

type Phase = "asking" | "loading" | "answer";

export function AskAiInlineForm({
  position,
  selectedText,
  onInsertCallout,
  onDismiss,
}: {
  position: { top: number; left: number };
  selectedText: string;
  onInsertCallout: (markdown: string) => void;
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onDismiss]);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setPhase("loading");
    setError(null);
    try {
      const result = await askInlineQuestion(selectedText, q);
      setAnswer(result);
      setPhase("answer");
    } catch (e) {
      setError(String(e));
      setPhase("asking");
    }
  }, [question, selectedText]);

  const handleKeepAsNote = useCallback(() => {
    const callout = `> [!study-help] ${question.trim()}\n> ${answer.replace(/\n/g, "\n> ")}\n`;
    onInsertCallout(callout);
  }, [question, answer, onInsertCallout]);

  const top = Math.min(position.top, window.innerHeight - 360);
  const left = Math.min(
    Math.max(position.left - 140, 8),
    window.innerWidth - 320,
  );

  return (
    <div
      ref={formRef}
      className="fixed z-50 w-80 rounded-xl border border-border bg-panel shadow-xl"
      style={{ top, left }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="text-accent shrink-0"
          role="img"
          aria-label="AI sparkle"
        >
          <path
            d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
            fill="currentColor"
          />
        </svg>
        <span className="text-xs font-semibold text-text">Study Help</span>
      </div>

      <div className="p-4">
        {/* Question input */}
        {phase === "asking" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask for a clearer explanation, example, or memory hook..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
            />
            {error && <p className="mt-2 text-[10px] text-coral">{error}</p>}
            <p className="mt-2 text-[10px] text-text-muted/50">
              Press Enter to ask
            </p>
          </form>
        )}

        {/* Loading */}
        {phase === "loading" && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-[11px] text-text-muted">Thinking...</p>
          </div>
        )}

        {/* Answer */}
        {phase === "answer" && (
          <div>
            <p className="mb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Q: {question}
            </p>
            <div className="mb-3 max-h-40 overflow-y-auto rounded-lg bg-surface p-3 text-xs leading-relaxed text-text">
              {answer}
            </div>

            {error && <p className="mb-2 text-[10px] text-coral">{error}</p>}

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={handleKeepAsNote}
                className="h-7 rounded-lg bg-accent/10 px-2.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/20"
              >
                Insert in Note
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="h-7 rounded-lg px-2.5 text-[10px] text-text-muted transition-colors hover:text-text"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
