import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { updateCard } from "../../lib/tauri";
import type { CardInfo } from "../../lib/tauri";

interface CardRowProps {
  card: CardInfo;
  onUpdated: () => void;
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  basic: {
    label: "basic",
    className: "bg-accent/8 text-accent border border-accent/20",
  },
  cloze: {
    label: "cloze",
    className: "bg-amber/8 text-amber border border-amber/20",
  },
  reversed: {
    label: "reversed",
    className: "bg-teal/8 text-teal border border-teal/20",
  },
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: {
    label: "active",
    className: "bg-accent/6 text-accent/70",
  },
  suspended: {
    label: "suspended",
    className: "bg-panel-active text-text-muted",
  },
  buried: {
    label: "buried",
    className: "bg-coral/6 text-coral/70",
  },
};

function formatNextReview(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 7) return `in ${diffDays}d`;
  if (diffDays < 30) return `in ${Math.round(diffDays / 7)}w`;
  return `in ${Math.round(diffDays / 30)}mo`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}…`;
}

export function CardRow({ card, onUpdated }: CardRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editPrompt, setEditPrompt] = useState(card.prompt);
  const [editAnswer, setEditAnswer] = useState(card.answer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeStyle = TYPE_STYLES[card.card_type] ?? TYPE_STYLES.basic;
  const statusStyle = STATUS_STYLES[card.status] ?? STATUS_STYLES.active;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateCard(card.id, editPrompt.trim(), editAnswer.trim());
      onUpdated();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = card.status === "suspended" ? "active" : "suspended";
    setSaving(true);
    setError(null);
    try {
      await updateCard(card.id, undefined, undefined, newStatus);
      onUpdated();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-panel transition-all">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <span className="mt-0.5 shrink-0 text-text-muted/40">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <span className="flex-1 truncate text-sm text-text">
          {truncate(card.prompt, 80)}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${typeStyle.className}`}
          >
            {typeStyle.label}
          </span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${statusStyle.className}`}
          >
            {statusStyle.label}
          </span>
          <span className="min-w-[52px] text-right text-[11px] tabular-nums text-text-muted/60">
            {formatNextReview(card.next_review)}
          </span>
        </div>
      </button>

      {/* Expanded area */}
      {expanded && (
        <div className="border-t border-border-subtle px-5 pb-5 pt-4">
          {error && (
            <div className="mb-3 rounded-lg border border-coral/20 bg-coral/5 px-3 py-2 text-xs text-coral">
              {error}
            </div>
          )}

          <div className="mb-3">
            <label
              htmlFor={`card-prompt-${card.id}`}
              className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-text-muted"
            >
              Prompt
            </label>
            <textarea
              id={`card-prompt-${card.id}`}
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text focus:border-accent/40 focus:outline-none"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor={`card-answer-${card.id}`}
              className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-text-muted"
            >
              Answer
            </label>
            <textarea
              id={`card-answer-${card.id}`}
              value={editAnswer}
              onChange={(e) => setEditAnswer(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text focus:border-accent/40 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-10 rounded-xl bg-accent px-4 text-xs font-medium text-white transition-all hover:bg-accent/90 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={saving}
              className={`h-10 rounded-xl border px-4 text-xs font-medium transition-all disabled:opacity-40 ${
                card.status === "suspended"
                  ? "border-accent/30 bg-accent/5 text-accent hover:bg-accent/10"
                  : "border-border text-text-muted hover:border-coral/30 hover:bg-coral/5 hover:text-coral"
              }`}
            >
              {card.status === "suspended" ? "Activate" : "Suspend"}
            </button>

            <button
              type="button"
              onClick={async () => {
                if (!saving) {
                  setSaving(true);
                  try {
                    await updateCard(card.id, undefined, undefined, "buried");
                    onUpdated();
                  } catch {
                    // error handled by parent refresh
                  } finally {
                    setSaving(false);
                  }
                }
              }}
              disabled={saving}
              className="h-10 rounded-xl border border-border px-4 text-xs font-medium text-text-muted transition-all hover:border-coral/30 hover:bg-coral/5 hover:text-coral disabled:opacity-40"
            >
              Delete
            </button>

            <div className="ml-auto flex items-center gap-3 text-[11px] text-text-muted/60">
              {card.reps !== null && (
                <span>
                  {card.reps} rep{card.reps !== 1 ? "s" : ""}
                </span>
              )}
              {card.stability !== null && (
                <span>stability {card.stability.toFixed(1)}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
