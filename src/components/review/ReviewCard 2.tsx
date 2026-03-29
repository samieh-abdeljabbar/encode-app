export function ReviewCard({
  prompt,
  answer,
  revealed,
  sourceType,
  cardType = "basic",
  onReveal,
}: {
  prompt: string;
  answer: string;
  revealed: boolean;
  sourceType: string;
  cardType?: string;
  onReveal: () => void;
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
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">
        {sourceType === "repair" ? "Repair Card" : "Flashcard"}
      </div>

      <div className="rounded-xl border border-border bg-panel p-7">
        {cardType === "cloze" ? (
          <p
            className="text-base leading-relaxed text-text"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: cloze bold highlighting, no user HTML
            dangerouslySetInnerHTML={{
              __html: renderPrompt(prompt, cardType, revealed),
            }}
          />
        ) : (
          <p className="text-base leading-relaxed text-text">{prompt}</p>
        )}
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={onReveal}
          className="mt-4 h-11 w-full rounded-xl border border-border bg-panel-alt text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
        >
          Show Answer
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent-soft/20 p-7">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
            Answer
          </p>
          <p className="text-base leading-relaxed text-text">{answer}</p>
        </div>
      )}
    </div>
  );
}
