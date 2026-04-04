import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";

type Phase = "responding" | "self_check" | "result";

export function DigestionGate({
  prompt,
  sectionHeading,
  onSubmit,
  loading,
  aiEnabled,
}: {
  prompt: string;
  sectionHeading: string | null;
  onSubmit: (response: string, rating?: string) => void;
  loading: boolean;
  aiEnabled: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("responding");
  const [response, setResponse] = useState("");
  const [selectedRating, setSelectedRating] = useState<string | null>(null);

  const handleReveal = () => {
    if (response.trim().length < 5) return;
    if (aiEnabled) {
      setPhase("result");
      onSubmit(response);
      return;
    }
    setPhase("self_check");
  };

  const handleRate = (rating: string) => {
    setSelectedRating(rating);
    setPhase("result");
    onSubmit(response, rating);
  };

  return (
    <div className="mx-auto max-w-3xl border-t border-border-subtle px-7 py-6">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
        Comprehension Check
      </p>
      <p className="mb-4 text-sm font-medium text-text">{prompt}</p>

      {phase === "responding" && (
        <>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Type your response..."
            rows={4}
            className="mb-3 w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleReveal}
            disabled={response.trim().length < 5 || loading}
            className="h-10 rounded-xl bg-accent px-5 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
          >
            {loading
              ? "Checking..."
              : aiEnabled
                ? "Check with AI"
                : "Check Yourself"}
          </button>
          <p className="mt-2 text-xs text-text-muted">
            {aiEnabled
              ? "AI will compare your response to the section and judge how closely you captured the idea."
              : "You’ll compare your response against the section and rate how close you were."}
          </p>
        </>
      )}

      {phase === "self_check" && (
        <>
          <div className="mb-4 rounded-xl border border-border-subtle bg-panel p-4 text-sm leading-relaxed text-text-muted">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
              Key idea to check against
            </p>
            Re-read the section above — did your response capture the main point
            {sectionHeading ? ` of "${sectionHeading}"` : ""}?
          </div>
          <p className="mb-3 text-xs text-text-muted">
            How well did you capture it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleRate("correct")}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-teal/30 bg-teal/5 px-4 text-xs font-medium text-teal transition-all hover:bg-teal/10"
            >
              <CheckCircle2 size={14} />
              Got it
            </button>
            <button
              type="button"
              onClick={() => handleRate("partial")}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-amber/30 bg-amber/5 px-4 text-xs font-medium text-amber transition-all hover:bg-amber/10"
            >
              <RefreshCw size={14} />
              Partially
            </button>
            <button
              type="button"
              onClick={() => handleRate("off_track")}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-coral/30 bg-coral/5 px-4 text-xs font-medium text-coral transition-all hover:bg-coral/10"
            >
              <XCircle size={14} />
              Missed it
            </button>
          </div>
        </>
      )}

      {phase === "result" && selectedRating && (
        <div className="flex items-center gap-2 text-sm">
          {selectedRating === "correct" && (
            <span className="text-teal">Nice — you've got it.</span>
          )}
          {selectedRating === "partial" && (
            <span className="text-amber">
              Close — review and try once more.
            </span>
          )}
          {selectedRating === "off_track" && (
            <span className="text-coral">
              A repair card has been created for review later.
            </span>
          )}
        </div>
      )}

      {phase === "result" && aiEnabled && !selectedRating && (
        <div className="text-sm text-text-muted">
          Checking your response against the section...
        </div>
      )}
    </div>
  );
}
