import { useCallback, useState } from "react";

export function CodeOutputInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }, [disabled, onSubmit, value]);

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Type the exact output..."
        rows={4}
        disabled={disabled}
        className="mb-3 w-full resize-none rounded-xl border border-border bg-surface p-3 font-mono text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none disabled:opacity-50"
      />
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            Ctrl+Enter
          </kbd>{" "}
          to submit
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
