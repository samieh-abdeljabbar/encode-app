import { useState } from "react";
import type { GatePromptType } from "../../lib/types";

interface DigestionGateProps {
  promptType: GatePromptType;
  prompt: string;
  sectionHeading: string | null;
  onSubmit: (response: string) => Promise<void>;
  // Follow-up props
  followUpMode?: boolean;
  followUpQuestion?: string | null;
  feedbackText?: string | null;
  mastery?: number | null;
  onSubmitFollowUp?: (response: string) => Promise<void>;
  generating?: boolean;
}

export default function DigestionGate({
  promptType,
  prompt,
  sectionHeading,
  onSubmit,
  followUpMode = false,
  followUpQuestion,
  feedbackText,
  mastery,
  onSubmitFollowUp,
  generating = false,
}: DigestionGateProps) {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const label =
    promptType.charAt(0).toUpperCase() + promptType.slice(1);

  const handleSubmit = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    try {
      if (followUpMode && onSubmitFollowUp) {
        await onSubmitFollowUp(response.trim());
      } else {
        await onSubmit(response.trim());
      }
      setResponse("");
    } catch {
      // Error handled by store
    } finally {
      setSubmitting(false);
    }
  };

  // Follow-up mode: show feedback + follow-up question
  if (followUpMode && followUpQuestion) {
    return (
      <div className="border-t-2 border-amber bg-surface rounded-t-lg p-6 space-y-4">
        {/* AI feedback from initial response */}
        {feedbackText && (
          <div className="p-3 bg-amber/5 border border-amber/20 rounded text-sm text-text">
            <p className="text-[10px] font-medium text-amber mb-1">AI Feedback</p>
            <p>{feedbackText}</p>
          </div>
        )}

        {/* Follow-up prompt */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-amber px-2 py-0.5 bg-amber/10 rounded">
            Dig Deeper
          </span>
          {mastery !== null && (
            <span className="text-[10px] text-text-muted">
              Mastery: {mastery === 1 ? "Needs work" : mastery === 2 ? "Getting there" : "Solid"}
            </span>
          )}
        </div>

        <p className="text-text font-medium">{followUpQuestion}</p>

        <textarea
          autoFocus
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Answer the follow-up question..."
          rows={4}
          className="w-full px-4 py-3 bg-surface-2 border border-amber/30 rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-amber resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Cmd+Enter to submit</span>
          <button
            onClick={handleSubmit}
            disabled={!response.trim() || submitting}
            className="px-6 py-2 bg-amber text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Saving..." : "Submit & Continue"}
          </button>
        </div>
      </div>
    );
  }

  // Normal gate mode
  return (
    <div className="border-t-2 border-purple bg-surface rounded-t-lg p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-purple px-2 py-0.5 bg-purple/10 rounded">
          {label}
        </span>
        {sectionHeading && (
          <span className="text-xs text-text-muted truncate">
            after: {sectionHeading}
          </span>
        )}
      </div>

      {generating ? (
        <p className="text-text-muted text-sm animate-pulse">Generating question from section content...</p>
      ) : (
        <p className="text-text font-medium">{prompt}</p>
      )}

      <textarea
        autoFocus
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Type your response..."
        rows={4}
        className="w-full px-4 py-3 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
          }
        }}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          Cmd+Enter to submit
        </span>
        <button
          onClick={handleSubmit}
          disabled={!response.trim() || submitting}
          className="px-6 py-2 bg-purple text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? "Evaluating..." : "Submit & Continue"}
        </button>
      </div>
    </div>
  );
}
