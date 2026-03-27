import { useState } from "react";
import {
  Bold, Italic, Heading1, Heading2, Heading3, Code, Link, Table,
  List, ListOrdered, Quote, Strikethrough, Highlighter,
  CheckSquare, Minus, Undo2, Redo2, IndentIncrease, IndentDecrease,
  RemoveFormatting,
} from "lucide-react";
import { ToolbarButton } from "../ui/primitives";

interface EditorToolbarProps {
  onInsert: (text: string) => void;
  onWrap: (before: string, after: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onIndent?: () => void;
  onOutdent?: () => void;
  onClearFormatting?: () => void;
}

function TablePicker({ onSelect, onClose }: { onSelect: (rows: number, cols: number) => void; onClose: () => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  return (
    <div
      className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg p-3 shadow-2xl z-50"
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

export default function EditorToolbar({
  onInsert, onWrap, onUndo, onRedo, onIndent, onOutdent, onClearFormatting,
}: EditorToolbarProps) {
  const [showTablePicker, setShowTablePicker] = useState(false);
  const sz = 14;

  const btn = (icon: React.ReactNode, title: string, onClick: () => void, disabled = false) => (
    <ToolbarButton
      key={title}
      icon={icon}
      label={title}
      onClick={onClick}
      disabled={disabled}
    />
  );

  const sep = <div className="mx-1 h-5 w-px shrink-0 bg-border-subtle" />;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle bg-panel px-5 py-3 shrink-0">
      {/* Undo / Redo */}
      {btn(<Undo2 size={sz} />, "Undo (⌘Z)", () => onUndo?.(), !onUndo)}
      {btn(<Redo2 size={sz} />, "Redo (⌘⇧Z)", () => onRedo?.(), !onRedo)}
      {sep}

      {/* Headings */}
      {btn(<Heading1 size={sz} />, "Heading 1", () => onInsert("\n# "))}
      {btn(<Heading2 size={sz} />, "Heading 2", () => onInsert("\n## "))}
      {btn(<Heading3 size={sz} />, "Heading 3", () => onInsert("\n### "))}
      {sep}

      {/* Inline formatting */}
      {btn(<Bold size={sz} />, "Bold", () => onWrap("**", "**"))}
      {btn(<Italic size={sz} />, "Italic", () => onWrap("*", "*"))}
      {btn(<Strikethrough size={sz} />, "Strikethrough", () => onWrap("~~", "~~"))}
      {btn(<Highlighter size={sz} />, "Highlight", () => onWrap("==", "=="))}
      {sep}

      {/* Blocks */}
      {btn(<Code size={sz} />, "Code block", () => onInsert("\n```\n\n```\n"))}
      {btn(<Link size={sz} />, "Link", () => onInsert("[text](url)"))}
      {btn(<Quote size={sz} />, "Blockquote", () => onInsert("\n> "))}
      {sep}

      {/* Lists */}
      {btn(<List size={sz} />, "Bullet list", () => onInsert("\n- "))}
      {btn(<ListOrdered size={sz} />, "Numbered list", () => onInsert("\n1. "))}
      {btn(<CheckSquare size={sz} />, "Checkbox", () => onInsert("\n- [ ] "))}
      {sep}

      {/* Table */}
      <div className="relative">
        <button
          onClick={() => setShowTablePicker(!showTablePicker)}
          title="Insert table"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-text-muted transition-colors hover:border-border-strong hover:bg-panel-active hover:text-text"
        >
          <Table size={sz} />
        </button>
        {showTablePicker && (
          <TablePicker
            onSelect={(rows, cols) => onInsert("\n" + generateTable(rows, cols))}
            onClose={() => setShowTablePicker(false)}
          />
        )}
      </div>

      {/* Misc */}
      {btn(<Minus size={sz} />, "Horizontal rule", () => onInsert("\n---\n"))}
      {sep}

      {/* Indent / Outdent */}
      {btn(<IndentIncrease size={sz} />, "Indent", () => onIndent?.(), !onIndent)}
      {btn(<IndentDecrease size={sz} />, "Outdent", () => onOutdent?.(), !onOutdent)}
      {btn(<RemoveFormatting size={sz} />, "Clear formatting", () => onClearFormatting?.(), !onClearFormatting)}
    </div>
  );
}
