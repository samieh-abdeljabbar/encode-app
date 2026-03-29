import { BookOpen } from "lucide-react";
import { useState } from "react";

export function SynthesisPanel({
  chapterTitle,
  onSubmit,
  loading,
}: {
  chapterTitle: string;
  onSubmit: (text: string) => void;
  loading: boolean;
}) {
  const [text, setText] = useState("");

  return (
    <div className="mx-auto max-w-3xl px-7 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <BookOpen size={18} className="text-accent" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-text">
            Chapter Synthesis
          </h2>
          <p className="text-xs text-text-muted">
            Summarize what you learned from "{chapterTitle}"
          </p>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a brief synthesis of the key ideas from this chapter..."
        rows={8}
        className="mb-4 w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onSubmit(text)}
        disabled={loading || text.trim().length < 20}
        className="h-11 w-full rounded-xl bg-accent text-sm font-medium text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
      >
        {loading ? "Submitting..." : "Complete Chapter"}
      </button>
    </div>
  );
}
