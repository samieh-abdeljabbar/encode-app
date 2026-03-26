import { useState } from "react";
import type { GatePromptType } from "../../lib/types";

interface DigestionGateProps {
  prompt: string;
  promptType: GatePromptType;
  sectionHeading: string | null;
  onSubmit: (response: string) => Promise<void>;
  generating?: boolean;
  // Multi-question props
  currentPhase: number;       // 0-indexed
  totalQuestions: number;      // 2 or 3
  lastFeedback?: string | null;
  lastMastery?: number | null;
  skipped?: boolean;
}

export default function DigestionGate({
  prompt,
  promptType,
  sectionHeading,
  onSubmit,
  generating = false,
  currentPhase,
  totalQuestions,
  lastFeedback,
  lastMastery,
  skipped = false,
}: DigestionGateProps) {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const label = promptType.charAt(0).toUpperCase() + promptType.slice(1);

  const handleSubmit = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(response.trim());
      setResponse("");
    } catch {
      // Error handled by store
    } finally {
      setSubmitting(false);
    }
  };

  if (skipped) {
    return (
      <div className="border-t-2 border-teal bg-surface rounded-t-lg p-6 text-center space-y-2">
        <p className="text-teal font-medium">Excellent understanding</p>
        <p className="text-sm text-text-muted">Remaining questions skipped — moving to next section.</p>
      </div>
    );
  }

  return (
    <div className="border-t-2 border-purple bg-surface rounded-t-lg p-6 space-y-4">
      {/* Progress dots */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {Array.from({ length: totalQuestions }, (_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < currentPhase
                  ? "bg-teal"
                  : i === currentPhase
                    ? "bg-purple animate-pulse"
                    : "bg-border"
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-purple px-2 py-0.5 bg-purple/10 rounded">
          Q{currentPhase + 1} of {totalQuestions} — {label}
        </span>
        {sectionHeading && (
          <span className="text-xs text-text-muted truncate">
            after: {sectionHeading}
          </span>
        )}
      </div>

      {/* Previous question feedback */}
      {currentPhase > 0 && lastFeedback && (
        <div className="p-3 bg-surface-2 border border-border rounded text-sm text-text">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-text-muted">Previous answer</span>
            {lastMastery != null && (
              <span className={`text-[10px] font-medium ${
                (lastMastery ?? 0) >= 3 ? "text-teal" : (lastMastery ?? 0) >= 2 ? "text-amber" : "text-coral"
              }`}>
                {(lastMastery ?? 0) >= 3 ? "Solid" : (lastMastery ?? 0) >= 2 ? "Partial" : "Needs work"}
              </span>
            )}
          </div>
          <p>{lastFeedback}</p>
        </div>
      )}

      {/* Current question */}
      {generating ? (
        <p className="text-text-muted text-sm animate-pulse">Reading section and generating questions...</p>
      ) : (
        <p className="text-text font-medium">{prompt}</p>
      )}

      <textarea
        autoFocus
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Type your answer..."
        rows={4}
        className="w-full px-4 py-3 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Cmd+Enter to submit</span>
        <button
          onClick={handleSubmit}
          disabled={!response.trim() || submitting || generating}
          className="px-6 py-2 bg-purple text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? "Evaluating..." : currentPhase + 1 >= totalQuestions ? "Submit & Continue" : "Submit"}
        </button>
      </div>
    </div>
  );
}
