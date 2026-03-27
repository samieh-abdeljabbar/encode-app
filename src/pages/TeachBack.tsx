import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTeachBackStore } from "../stores/teachback";
import { EmptyState, InputShell, MetaChip, PageHeader, Panel, PrimaryButton, SecondaryButton } from "../components/ui/primitives";

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
      <div className="flex h-full items-center justify-center px-4">
        <EmptyState
          title="No topic selected"
          description="Start a teach-back from the Vault or Reader."
          action={<SecondaryButton onClick={() => navigate("/vault")}>Go to Vault</SecondaryButton>}
        />
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <EmptyState
          title="Teach-back saved"
          description="Your explanation and evaluation are stored in the vault."
          action={
            <SecondaryButton
              onClick={() => {
                reset();
                navigate("/vault");
              }}
            >
              Back to Vault
            </SecondaryButton>
          }
        />
      </div>
    );
  }

  const handleSubmit = () => {
    if (!text.trim()) return;
    submitExplanation(text.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Teach-Back: ${topic}`}
        subtitle="Explain the concept in plain language, then use the evaluation to find the gaps."
        meta={
          <>
            {subject && <MetaChip>{subject}</MetaChip>}
            <MetaChip variant="accent">Feynman technique</MetaChip>
          </>
        }
        actions={
          <SecondaryButton
            onClick={() => {
              reset();
              navigate("/vault");
            }}
          >
            Back
          </SecondaryButton>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Panel
            className="mb-6"
            title={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Feynman Technique</span>}
            variant="alt"
          >
            <p
              className="text-base text-text leading-relaxed"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Explain <strong>{topic}</strong> to a new employee at your store
              who has never heard of it. Use simple words and real examples. If
              you get stuck, that&apos;s where your understanding has gaps.
            </p>
          </Panel>

          {!evaluated ? (
            <Panel title="Your Explanation">
              <InputShell className="px-0 py-0">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Start explaining in your own words..."
                  rows={12}
                  className="input-reset w-full resize-none bg-transparent px-4 py-4 text-base leading-relaxed text-text"
                  style={{ fontFamily: "Georgia, serif" }}
                  disabled={loading}
                />
              </InputShell>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  {text.split(/\s+/).filter(Boolean).length} words
                </span>
                <PrimaryButton
                  onClick={handleSubmit}
                  disabled={!text.trim() || loading}
                >
                  {loading ? "Evaluating..." : "Submit for Evaluation"}
                </PrimaryButton>
              </div>
            </Panel>
          ) : (
            <div className="space-y-6">
              <Panel title="Your Explanation">
                <p
                  className="text-sm text-text leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {text}
                </p>
              </Panel>

              {evaluation && (
                <Panel
                  variant="active"
                  className="border-teal/30"
                  title={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-teal">AI Evaluation</span>}
                >
                  <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                    {evaluation}
                  </p>
                </Panel>
              )}

              <PrimaryButton onClick={saveToVault} className="w-full border-teal bg-teal py-3">
                Save &amp; Finish
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
