import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useCallback, useEffect, useRef } from "react";
import type { CompleteSnippetQuestionData } from "../../lib/tauri";
import { parchmentTheme } from "../editor/cm-theme";

export function CodeSnippetInput({
  questionData,
  onSubmit,
  disabled,
}: {
  questionData: CompleteSnippetQuestionData;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const handleSubmit = useCallback(() => {
    if (disabled || !viewRef.current) return;
    const value = viewRef.current.state.doc.toString().trim();
    if (!value) return;
    onSubmit(value);
  }, [disabled, onSubmit]);

  useEffect(() => {
    if (!containerRef.current) return;

    const languageExtension =
      questionData.language === "python" ? python() : javascript();

    const state = EditorState.create({
      doc: questionData.starter_code,
      extensions: [
        parchmentTheme,
        history(),
        languageExtension,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.editable.of(!disabled),
        EditorView.domEventHandlers({
          keydown: (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
              return true;
            }
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [
    disabled,
    handleSubmit,
    questionData.language,
    questionData.starter_code,
  ]);

  return (
    <div>
      <div className="mb-3 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-text-muted">
          <span>{questionData.language}</span>
          <span>Replace {questionData.placeholder_token}</span>
        </div>
        <div ref={containerRef} className="max-h-72 overflow-auto px-1 py-1" />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-text-muted">
          Edit the snippet and submit the completed code.
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
