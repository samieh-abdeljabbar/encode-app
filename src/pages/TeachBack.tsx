import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTeachBackStore } from "../stores/teachback";

export default function TeachBackPage() {
  const navigate = useNavigate();
  const {
    subject,
    topic,
    evaluation,
    loading,
    evaluated,
    saved,
    submitExplanation,
    saveToVault,
    reset,
  } = useTeachBackStore();

  const [text, setText] = useState("");

  if (!topic) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-text-muted mb-4">
            No topic selected. Start a teach-back from the Vault or Reader.
          </p>
          <button
            onClick={() => navigate("/vault")}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
          >
            Go to Vault
          </button>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-teal text-lg font-medium mb-2">
            Teach-back saved!
          </p>
          <p className="text-text-muted text-sm mb-6">
            Your explanation and evaluation are stored in the vault.
          </p>
          <button
            onClick={() => {
              reset();
              navigate("/vault");
            }}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
          >
            Back to Vault
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!text.trim()) return;
    submitExplanation(text.trim());
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              reset();
              navigate("/vault");
            }}
            className="text-sm text-text-muted hover:text-text"
          >
            &larr; Back
          </button>
          <span className="text-sm font-medium">Teach-Back: {topic}</span>
        </div>
        <span className="text-xs text-text-muted">{subject}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-8 py-8">
          {/* Prompt */}
          <div className="mb-6 p-4 bg-surface rounded border border-purple/30">
            <p className="text-xs text-purple font-medium mb-2">
              Feynman Technique
            </p>
            <p
              className="text-base text-text leading-relaxed"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Explain <strong>{topic}</strong> to a new employee at your store
              who has never heard of it. Use simple words and real examples. If
              you get stuck, that&apos;s where your understanding has gaps.
            </p>
          </div>

          {!evaluated ? (
            /* Writing phase */
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Start explaining in your own words..."
                rows={12}
                className="w-full p-4 bg-surface border border-border rounded text-text text-base resize-none focus:outline-none focus:border-purple leading-relaxed"
                style={{ fontFamily: "Georgia, serif" }}
                disabled={loading}
              />
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-text-muted">
                  {text.split(/\s+/).filter(Boolean).length} words
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || loading}
                  className="px-6 py-2 bg-purple text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {loading ? "Evaluating..." : "Submit for Evaluation"}
                </button>
              </div>
            </div>
          ) : (
            /* Evaluation phase */
            <div>
              {/* User's explanation */}
              <div className="p-4 bg-surface rounded border border-border mb-6">
                <p className="text-xs text-text-muted mb-2">
                  Your explanation:
                </p>
                <p
                  className="text-sm text-text leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {text}
                </p>
              </div>

              {/* AI evaluation */}
              {evaluation && (
                <div className="p-4 bg-teal/10 border border-teal rounded mb-6">
                  <p className="text-xs text-teal font-medium mb-2">
                    AI Evaluation
                  </p>
                  <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                    {evaluation}
                  </p>
                </div>
              )}

              {/* Save button */}
              <button
                onClick={saveToVault}
                className="w-full py-3 bg-teal text-white rounded font-medium hover:opacity-90"
              >
                Save &amp; Finish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
