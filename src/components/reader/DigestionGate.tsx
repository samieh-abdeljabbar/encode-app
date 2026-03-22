import { useState } from "react";
import type { GatePromptType } from "../../lib/types";

interface DigestionGateProps {
  promptType: GatePromptType;
  prompt: string;
  sectionHeading: string | null;
  onSubmit: (response: string) => void;
}

export default function DigestionGate({
  promptType,
  prompt,
  sectionHeading,
  onSubmit,
}: DigestionGateProps) {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const label =
    promptType.charAt(0).toUpperCase() + promptType.slice(1);

  const handleSubmit = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    onSubmit(response.trim());
    setResponse("");
    setSubmitting(false);
  };

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

      <p className="text-text font-medium">{prompt}</p>

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
          {submitting ? "Saving..." : "Submit & Continue"}
        </button>
      </div>
    </div>
  );
}
