import { useState } from "react";
import { Bold, Italic, Heading2, Code, Link, Table, List, Quote } from "lucide-react";

interface EditorToolbarProps {
  onInsert: (text: string) => void;
  onWrap: (before: string, after: string) => void;
}

function TablePicker({ onSelect, onClose }: { onSelect: (rows: number, cols: number) => void; onClose: () => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  return (
    <div
      className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded-lg p-3 shadow-2xl z-50"
      onMouseLeave={() => setHover(null)}
    >
      <p className="text-[10px] text-text-muted mb-2">
        {hover ? `${hover.r} × ${hover.c} table` : "Select table size"}
      </p>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <button
              key={`${r}-${c}`}
              onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
              onClick={() => { onSelect(r + 1, c + 1); onClose(); }}
              className={`w-4 h-4 rounded-sm border transition-colors ${
                hover && r < hover.r && c < hover.c
                  ? "bg-purple/40 border-purple/60"
                  : "bg-surface-2 border-border hover:border-purple/30"
              }`}
            />
          )),
        )}
      </div>
    </div>
  );
}

function generateTable(rows: number, cols: number): string {
  const header = "| " + Array.from({ length: cols }, (_, i) => `Column ${i + 1}`).join(" | ") + " |";
  const separator = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  const dataRows = Array.from({ length: rows }, () =>
    "| " + Array.from({ length: cols }, () => "     ").join(" | ") + " |",
  );
  return [header, separator, ...dataRows].join("\n") + "\n";
}

export default function EditorToolbar({ onInsert, onWrap }: EditorToolbarProps) {
  const [showTablePicker, setShowTablePicker] = useState(false);

  const btn = (icon: React.ReactNode, title: string, onClick: () => void) => (
    <button
      key={title}
      onClick={onClick}
      title={title}
      className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border bg-surface shrink-0">
      {btn(<Heading2 size={15} />, "Heading", () => onInsert("\n## "))}
      {btn(<Bold size={15} />, "Bold", () => onWrap("**", "**"))}
      {btn(<Italic size={15} />, "Italic", () => onWrap("*", "*"))}
      {btn(<Code size={15} />, "Code block", () => onInsert("\n```\n\n```\n"))}
      {btn(<Link size={15} />, "Link", () => onInsert("[text](url)"))}
      {btn(<List size={15} />, "List", () => onInsert("\n- "))}
      {btn(<Quote size={15} />, "Blockquote", () => onInsert("\n> "))}

      {/* Table with picker */}
      <div className="relative">
        <button
          onClick={() => setShowTablePicker(!showTablePicker)}
          title="Insert table"
          className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors"
        >
          <Table size={15} />
        </button>
        {showTablePicker && (
          <TablePicker
            onSelect={(rows, cols) => onInsert("\n" + generateTable(rows, cols))}
            onClose={() => setShowTablePicker(false)}
          />
        )}
      </div>
    </div>
  );
}
