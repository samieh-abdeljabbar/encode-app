import { useCallback, useEffect, useState } from "react";
import type { StepOrderQuestionData } from "../../lib/tauri";

type StepOrderItem = {
  id: string;
  text: string;
};

function buildStepOrderItems(items: string[]): StepOrderItem[] {
  return items.map((item, index) => ({
    id: `${index}-${item}`,
    text: item,
  }));
}

export function StepOrderInput({
  questionData,
  onSubmit,
  disabled,
}: {
  questionData: StepOrderQuestionData;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const [items, setItems] = useState<StepOrderItem[]>(() =>
    buildStepOrderItems(questionData.items),
  );

  useEffect(() => {
    setItems(buildStepOrderItems(questionData.items));
  }, [questionData.items]);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (disabled) return;
    onSubmit(JSON.stringify(items.map((item) => item.text)));
  }, [disabled, items, onSubmit]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-alt text-[11px] font-semibold text-text-muted">
              {index + 1}
            </span>
            <div className="flex-1 text-sm text-text">{item.text}</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => moveItem(index, -1)}
                disabled={disabled || index === 0}
                className="rounded-lg border border-border-subtle px-2 py-1 text-xs text-text-muted disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, 1)}
                disabled={disabled || index === items.length - 1}
                className="rounded-lg border border-border-subtle px-2 py-1 text-xs text-text-muted disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          Use the arrows to reorder the steps, then submit.
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
