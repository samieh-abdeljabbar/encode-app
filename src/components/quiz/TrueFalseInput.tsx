import { useCallback, useEffect, useState } from "react";

export function TrueFalseInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<"True" | "False" | null>(null);

  const handleSubmit = useCallback(() => {
    if (selected === null || disabled) return;
    onSubmit(selected);
  }, [selected, disabled, onSubmit]);

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

      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        setSelected("True");
        return;
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSelected("False");
        return;
      }
      if (e.key === "Enter" && selected !== null) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, selected, handleSubmit]);

  return (
    <div>
      <div className="mb-4 flex gap-3">
        <button
          type="button"
          onClick={() => setSelected("True")}
          disabled={disabled}
          className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-all ${
            selected === "True"
              ? "border-accent bg-accent-soft text-accent"
              : "border-border bg-surface text-text hover:border-border-strong"
          } disabled:opacity-50`}
        >
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1.5 py-0.5 text-[10px] text-text-muted">
            T
          </kbd>
          True
        </button>
        <button
          type="button"
          onClick={() => setSelected("False")}
          disabled={disabled}
          className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-all ${
            selected === "False"
              ? "border-accent bg-accent-soft text-accent"
              : "border-border bg-surface text-text hover:border-border-strong"
          } disabled:opacity-50`}
        >
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1.5 py-0.5 text-[10px] text-text-muted">
            F
          </kbd>
          False
        </button>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            T
          </kbd>{" "}
          /{" "}
          <kbd className="rounded border border-border-subtle bg-panel-alt px-1 py-0.5 text-[10px]">
            F
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
