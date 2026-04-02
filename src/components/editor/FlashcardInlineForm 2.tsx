import { useCallback, useEffect, useRef, useState } from "react";
import { createCard } from "../../lib/tauri";

export function FlashcardInlineForm({
  position,
  subjectId,
  chapterId,
  onCreated,
  onCancel,
}: {
  position: { top: number; left: number };
  subjectId: number;
  chapterId: number;
  onCreated: (prompt: string, answer: string) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [cardType, setCardType] = useState("basic");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const handleCreate = useCallback(async () => {
    if (!prompt.trim() || !answer.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createCard(
        subjectId,
        chapterId,
        prompt.trim(),
        answer.trim(),
        cardType,
      );
      onCreated(prompt.trim(), answer.trim());
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  }, [prompt, answer, cardType, subjectId, chapterId, creating, onCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate],
  );

  // Adjust position to stay within viewport
  const top = Math.min(position.top, window.innerHeight - 320);
  const left = Math.min(position.left, window.innerWidth - 300);

  return (
    <div
      ref={formRef}
      className="fixed z-50 w-72 rounded-xl border border-border bg-panel p-4 shadow-xl"
      style={{ top, left }}
      onKeyDown={handleKeyDown}
    >
      <p className="mb-3 text-xs font-semibold text-text">Create Flashcard</p>

      <div className="mb-2">
        <textarea
          ref={promptRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Question / front"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
        />
      </div>

      <div className="mb-2">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Answer / back"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
        />
      </div>

      <div className="mb-3">
        <select
          value={cardType}
          onChange={(e) => setCardType(e.target.value)}
          className="h-8 w-full appearance-none rounded-lg border border-border bg-surface px-3 text-xs text-text focus:border-accent/40 focus:outline-none"
        >
          <option value="basic">Basic</option>
          <option value="cloze">Cloze</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>

      {error && <p className="mb-2 text-[10px] text-coral">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-text-muted hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !prompt.trim() || !answer.trim()}
          className="h-7 rounded-lg bg-accent px-3 text-[11px] font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </div>

      <p className="mt-2 text-[10px] text-text-muted/50 text-center">
        Ctrl+Enter to create
      </p>
    </div>
  );
}
