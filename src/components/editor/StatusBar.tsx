import type { EditorView } from "@codemirror/view";
import { useEffect, useState } from "react";

interface StatusInfo {
  words: number;
  chars: number;
  line: number;
  col: number;
}

export function StatusBar({ view }: { view: EditorView | null }) {
  const [info, setInfo] = useState<StatusInfo>({
    words: 0,
    chars: 0,
    line: 1,
    col: 1,
  });

  useEffect(() => {
    if (!view) return;

    const update = () => {
      const doc = view.state.doc.toString();
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.head);
      setInfo({
        words: doc.trim() ? doc.trim().split(/\s+/).length : 0,
        chars: doc.length,
        line: line.number,
        col: sel.head - line.from + 1,
      });
    };

    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [view]);

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border-subtle bg-bg px-5 py-1.5 text-[11px] text-text-muted">
      <div className="flex gap-4">
        <span>{info.words} words</span>
        <span>{info.chars} characters</span>
      </div>
      <span>
        Ln {info.line}, Col {info.col}
      </span>
    </div>
  );
}
