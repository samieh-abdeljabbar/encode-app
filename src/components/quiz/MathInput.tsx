import katex from "katex";
import { useCallback, useMemo, useState } from "react";
import type { MathInputQuestionData } from "../../lib/tauri";

export function MathInput({
  questionData,
  onSubmit,
  disabled,
}: {
  questionData: MathInputQuestionData;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }, [disabled, onSubmit, value]);

  const previewHtml = useMemo(() => {
    const previewValue = value.trim();
    if (!previewValue) return null;
    try {
      return katex.renderToString(previewValue, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return null;
    }
  }, [value]);

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={
          questionData.grader === "numeric"
            ? "Type the numeric result..."
            : "Type an equivalent expression..."
        }
        disabled={disabled}
        className="mb-3 w-full rounded-xl border border-border bg-surface p-3 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none disabled:opacity-50"
      />

      {value.trim().length > 0 && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-surface px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Live preview
          </p>
          {previewHtml ? (
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX renders trusted user input preview
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <p className="text-sm text-text-muted">{value}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            Enter
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
