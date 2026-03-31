import { List } from "lucide-react";
import { useState } from "react";

interface HeadingEntry {
  level: number;
  text: string;
  line: number;
}

export function OutlinePanel({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate: (line: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const headings: HeadingEntry[] = content
    .split("\n")
    .map((text, i) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(text);
      if (!match) return null;
      return { level: match[1].length, text: match[2], line: i + 1 };
    })
    .filter((h): h is HeadingEntry => h !== null);

  if (headings.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
        title="Outline"
      >
        <List size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-border bg-panel p-3 shadow-xl">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Outline
          </p>
          <div className="max-h-64 overflow-auto">
            {headings.map((h) => (
              <button
                key={`${h.line}-${h.text}`}
                type="button"
                onClick={() => {
                  onNavigate(h.line);
                  setOpen(false);
                }}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-text-muted transition-colors hover:bg-panel-active hover:text-text"
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
              >
                {h.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
