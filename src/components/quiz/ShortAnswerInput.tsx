import { useCallback, useState } from "react";

export function ShortAnswerInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
  }, [value, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your answer..."
        rows={4}
        disabled={disabled}
        className="mb-3 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none disabled:opacity-50"
      />
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            Enter
          </kbd>{" "}
          to submit,{" "}
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            Shift+Enter
          </kbd>{" "}
          for newline
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || value.trim().length === 0}
          className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
