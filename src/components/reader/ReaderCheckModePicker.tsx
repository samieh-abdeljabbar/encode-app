import { Bot, CheckCircle2, Sparkles, UserRound, X } from "lucide-react";
import { useEffect } from "react";

export type ReaderCheckMode = "ai" | "self";

export function ReaderCheckModePicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: ReaderCheckMode) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/10 px-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <dialog
        open
        aria-label="Choose reader check mode"
        className="w-full max-w-lg rounded-3xl border border-border bg-panel p-0 shadow-xl shadow-text/5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Reader Mode
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-text">
                How do you want to check this chapter?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Pick a mode before the comprehension checks begin. You can
                switch later from the reader header.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-panel-alt hover:text-text"
              aria-label="Close reader mode chooser"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelect("self")}
            className="rounded-2xl border border-border bg-panel-alt/60 p-5 text-left transition-all hover:border-accent/25 hover:bg-panel-active"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-panel">
              <UserRound size={18} className="text-text" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text">
                Self check
              </span>
              <CheckCircle2 size={14} className="text-teal" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Use the built-in prompt, answer in your own words, then judge how
              close you were.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onSelect("ai")}
            className="rounded-2xl border border-accent/20 bg-accent/5 p-5 text-left transition-all hover:border-accent/40 hover:bg-accent/8"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
              <Bot size={18} className="text-accent" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text">AI check</span>
              <Sparkles size={14} className="text-accent" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              AI writes the question for this section and checks your response
              against the reading.
            </p>
          </button>
        </div>
      </dialog>
    </div>
  );
}
