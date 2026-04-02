import { useCallback, useEffect, useState } from "react";

export function MultipleChoiceInput({
  options,
  onSubmit,
  disabled,
}: {
  options: string[];
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const handleSubmit = useCallback(() => {
    if (selected === null || disabled) return;
    onSubmit(options[selected]);
  }, [selected, disabled, options, onSubmit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable
      )
        return;
      if (disabled) return;

      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= options.length) {
        e.preventDefault();
        setSelected(num - 1);
        return;
      }
      if (e.key === "Enter" && selected !== null) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, options.length, selected, handleSubmit]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2">
        {options.map((option, idx) => {
          const isSelected = selected === idx;
          return (
            <button
              type="button"
              key={option}
              onClick={() => setSelected(idx)}
              disabled={disabled}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                isSelected
                  ? "border-accent bg-accent-soft text-text"
                  : "border-border bg-surface text-text hover:border-border-strong"
              } disabled:opacity-50`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  isSelected
                    ? "border-accent bg-accent text-white"
                    : "border-border-strong text-text-muted"
                }`}
              >
                {idx + 1}
              </span>
              <span className="flex-1">{option}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            1
          </kbd>
          -
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            {options.length}
          </kbd>{" "}
          to select,{" "}
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            Enter
          </kbd>{" "}
          to submit
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || selected === null}
          className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
