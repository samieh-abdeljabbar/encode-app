import { useCallback, useEffect, useRef, useState } from "react";

export function FillBlankInput({
  prompt,
  onSubmit,
  disabled,
}: {
  prompt: string;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const parts = prompt.split("____");
  const blankCount = parts.length - 1;
  const [values, setValues] = useState<string[]>(
    Array.from({ length: Math.max(blankCount, 1) }, () => ""),
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = useCallback((index: number, val: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (disabled) return;
    const answer = values.join(", ").trim();
    if (answer.length === 0) return;
    onSubmit(answer);
  }, [disabled, values, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === "Tab" && !e.shiftKey && index < blankCount - 1) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
        return;
      }
      if (e.key === "Tab" && e.shiftKey && index > 0) {
        e.preventDefault();
        inputRefs.current[index - 1]?.focus();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [blankCount, handleSubmit],
  );

  // If there are no blanks in the prompt, fall back to a simple input
  if (blankCount === 0) {
    return (
      <div>
        <input
          type="text"
          value={values[0]}
          onChange={(e) => handleChange(0, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Fill in the blank..."
          disabled={disabled}
          className="mb-3 w-full rounded-xl border border-border bg-surface p-3 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none disabled:opacity-50"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || values[0].trim().length === 0}
            className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-[15px] leading-relaxed text-text">
        {parts.map((part, idx) => (
          <span key={`part-${part.slice(0, 20)}-${idx}`}>
            {part}
            {idx < blankCount && (
              <input
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                value={values[idx]}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                disabled={disabled}
                placeholder="..."
                className="mx-1 inline-block w-32 border-b-2 border-accent bg-transparent px-1 text-center text-sm font-medium text-accent placeholder:text-text-muted/30 focus:outline-none disabled:opacity-50"
              />
            )}
          </span>
        ))}
      </p>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          {blankCount > 1 && (
            <>
              <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
                Tab
              </kbd>{" "}
              between blanks,{" "}
            </>
          )}
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            Enter
          </kbd>{" "}
          to submit
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || values.every((v) => v.trim().length === 0)}
          className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
