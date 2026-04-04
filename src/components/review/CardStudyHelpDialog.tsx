import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateCardStudyHelp, saveCardStudyHelpNote } from "../../lib/tauri";
import type { CardStudyHelp, StudyHelpNoteResult } from "../../lib/tauri";

export function CardStudyHelpDialog({
  cardId,
  onClose,
}: {
  cardId: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [help, setHelp] = useState<CardStudyHelp | null>(null);
  const [saveResult, setSaveResult] = useState<StudyHelpNoteResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setHelp(null);
    setSaveResult(null);

    generateCardStudyHelp(cardId)
      .then((result) => {
        if (cancelled) return;
        setHelp(result);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const handleSave = async () => {
    if (!help || saving) return;
    setSaving(true);
    setError(null);

    try {
      const result = await saveCardStudyHelpNote(cardId, help.note_markdown);
      setSaveResult(result);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(43,32,24,0.22)] px-5">
      <div className="w-full max-w-lg rounded-[28px] border border-border-subtle bg-panel p-6 shadow-[0_24px_64px_rgba(43,32,24,0.22)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Study Help
            </p>
            <h3 className="mt-1 text-lg font-semibold text-text">
              Help me remember this
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-2 py-1 text-xs text-text-muted transition-colors hover:text-text"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm text-text-muted">Generating study help…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-coral/20 bg-coral/5 px-4 py-4">
            <p className="text-sm font-medium text-coral">{error}</p>
          </div>
        ) : help ? (
          <>
            <div className="space-y-4">
              <div className="rounded-2xl border border-border-subtle bg-surface px-4 py-4">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Explanation
                </p>
                <p className="text-sm leading-relaxed text-text">
                  {help.explanation}
                </p>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-surface px-4 py-4">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Mnemonic
                </p>
                <p className="text-sm leading-relaxed text-text">
                  {help.mnemonic}
                </p>
              </div>

              {saveResult && (
                <div className="rounded-2xl border border-teal/20 bg-teal/5 px-4 py-4">
                  <p className="text-sm font-medium text-teal">
                    Saved to {saveResult.title}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Added to your dedicated study-help note.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              {saveResult ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/workspace?note=${saveResult.note_id}`);
                  }}
                  className="h-10 rounded-2xl bg-accent px-4 text-sm font-medium text-white transition-all hover:bg-accent/90"
                >
                  Open Note
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-10 rounded-2xl bg-accent px-4 text-sm font-medium text-white transition-all hover:bg-accent/90 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save to Study Help Note"}
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-2xl border border-border px-4 text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-text"
              >
                Dismiss
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
