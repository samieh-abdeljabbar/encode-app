import { useEffect, useState } from "react";
import { createCard, listSubjects } from "../../lib/tauri";
import type { Subject } from "../../lib/tauri";

type CardType = "basic" | "cloze" | "reversed";

interface CardFormProps {
  onCreated: () => void;
}

const CARD_TYPES: { value: CardType; label: string; description: string }[] = [
  { value: "basic", label: "Basic", description: "Q → A" },
  { value: "cloze", label: "Cloze", description: "Fill in the blank" },
  { value: "reversed", label: "Reversed", description: "Q → A and A → Q" },
];

export function CardForm({ onCreated }: CardFormProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [cardType, setCardType] = useState<CardType>("basic");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSubjects()
      .then((data) => {
        setSubjects(data);
        if (data.length > 0 && subjectId === null) {
          setSubjectId(data[0].id);
        }
      })
      .catch(() => {});
  }, [subjectId]);

  const handleCreate = async () => {
    if (!subjectId || !prompt.trim() || !answer.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await createCard(subjectId, null, prompt.trim(), answer.trim(), cardType);
      setPrompt("");
      setAnswer("");
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-panel p-6">
      <h3 className="mb-5 text-sm font-semibold text-text">New Card</h3>

      {error && (
        <div className="mb-4 rounded-lg border border-coral/20 bg-coral/5 px-3.5 py-2.5 text-xs text-coral">
          {error}
        </div>
      )}

      {/* Subject */}
      <div className="mb-4">
        <label
          htmlFor="card-form-subject"
          className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-text-muted"
        >
          Subject
        </label>
        <select
          id="card-form-subject"
          value={subjectId ?? ""}
          onChange={(e) => setSubjectId(Number(e.target.value))}
          className="h-11 w-full rounded-xl border border-border bg-panel-alt px-4 text-sm text-text focus:border-accent/40 focus:outline-none"
        >
          {subjects.length === 0 && (
            <option value="" disabled>
              No subjects — create one in Library
            </option>
          )}
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Card type */}
      <div className="mb-4">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-text-muted">
          Type
        </p>
        <div className="flex gap-2">
          {CARD_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setCardType(t.value)}
              className={`flex flex-1 flex-col items-center rounded-xl border px-3 py-2.5 text-center transition-all ${
                cardType === t.value
                  ? "border-accent/40 bg-accent/8 text-accent"
                  : "border-border bg-panel-alt text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              <span className="text-xs font-medium">{t.label}</span>
              <span className="mt-0.5 text-[10px] opacity-70">
                {t.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div className="mb-4">
        <label
          htmlFor="card-form-prompt"
          className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-text-muted"
        >
          Prompt
        </label>
        <textarea
          id="card-form-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            cardType === "cloze"
              ? "Use {{brackets}} for cloze blanks, e.g. The {{mitochondria}} is the powerhouse"
              : "Question or front side..."
          }
          rows={3}
          className="w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
        />
        {cardType === "cloze" && (
          <p className="mt-1.5 text-[11px] text-text-muted/70">
            Wrap blanks in{" "}
            <code className="rounded bg-panel-active px-1 py-0.5 font-mono text-[10px]">
              {"{{brackets}}"}
            </code>
          </p>
        )}
      </div>

      {/* Answer */}
      <div className="mb-5">
        <label
          htmlFor="card-form-answer"
          className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-text-muted"
        >
          Answer
        </label>
        <textarea
          id="card-form-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Answer or back side..."
          rows={3}
          className="w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
        />
        {cardType === "reversed" && (
          <p className="mt-1.5 text-[11px] text-text-muted/70">
            Two cards will be created — one in each direction.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !subjectId || !prompt.trim() || !answer.trim()}
          className="h-11 rounded-xl bg-accent px-5 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Creating..." : "Create Card"}
        </button>
      </div>
    </div>
  );
}
