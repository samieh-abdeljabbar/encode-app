export function ReviewCard({
  prompt,
  answer,
  revealed,
  sourceType,
  cardType = "basic",
  onReveal,
  onStudyHelp,
}: {
  prompt: string;
  answer: string;
  revealed: boolean;
  sourceType: string;
  cardType?: string;
  onReveal: () => void;
  onStudyHelp?: () => void;
}) {
  const renderPrompt = (text: string, type: string, isRevealed: boolean) => {
    if (type !== "cloze") return text;
    if (!isRevealed) {
      return text.replace(/\{\{([^}]+)\}\}/g, "_____");
    }
    return text.replace(
      /\{\{([^}]+)\}\}/g,
      (_, match) => `<strong>${match}</strong>`,
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">
        {sourceType === "repair" ? "Repair Card" : "Flashcard"}
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(250,246,239,0.92))] shadow-[0_20px_40px_rgba(76,58,47,0.06)]">
        <div className="border-b border-border-subtle/70 px-7 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-panel px-3 py-1 text-[11px] font-medium text-text-muted">
              {revealed ? "Answer side" : "Question side"}
            </span>
            <span className="text-[11px] text-text-muted/70">
              {cardType === "cloze" ? "Fill in the blank" : "Tap into recall"}
            </span>
          </div>
        </div>

        <div className="px-7 py-8">
          {cardType === "cloze" ? (
            <p
              className="text-lg leading-relaxed text-text"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: cloze bold highlighting, no user HTML
              dangerouslySetInnerHTML={{
                __html: renderPrompt(prompt, cardType, revealed),
              }}
            />
          ) : (
            <p className="text-lg leading-relaxed text-text">{prompt}</p>
          )}
        </div>
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={onReveal}
          className="mt-4 h-12 w-full rounded-2xl border border-border bg-panel-alt text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
        >
          Show Answer
        </button>
      ) : (
        <>
          <div className="mt-4 rounded-[24px] border border-accent/20 bg-accent-soft/25 p-7">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
              Answer
            </p>
            <p className="text-base leading-relaxed text-text">{answer}</p>
          </div>
          {onStudyHelp ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onStudyHelp}
                className="rounded-2xl border border-border bg-panel px-4 py-2 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
              >
                Help me remember this
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
