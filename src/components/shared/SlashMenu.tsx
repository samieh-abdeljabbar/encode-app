import { useEffect, useRef, useState } from "react";

interface SlashMenuItem {
  command: string;
  label: string;
  template: string;
}

const SLASH_ITEMS: SlashMenuItem[] = [
  {
    command: "table",
    label: "Table",
    template: "| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n",
  },
  {
    command: "heading",
    label: "Heading",
    template: "## ",
  },
  {
    command: "code",
    label: "Code Block",
    template: "```\n\n```\n",
  },
  {
    command: "mermaid",
    label: "Mermaid Diagram",
    template: "```mermaid\ngraph TD\n    A[Start] --> B[Process]\n    B --> C[End]\n```\n",
  },
  {
    command: "card",
    label: "Flashcard",
    template: "> [!card] id: fc-\n> **Q:** \n> **A:** \n> **Bloom:** 2\n> **Ease:** 2.50\n> **Interval:** 0\n> **Next:** \n> **Last:**\n",
  },
  {
    command: "synthesis",
    label: "Chapter Synthesis",
    template: "## Synthesis\n\n**Prompt:** Connect the key ideas from this chapter.\n**Response:** \n**AI Evaluation:** \n",
  },
  {
    command: "callout",
    label: "Callout (Note)",
    template: "> [!note] Title\n> Content here.\n",
  },
  {
    command: "warning",
    label: "Callout (Warning)",
    template: "> [!warning] Title\n> Content here.\n",
  },
  {
    command: "tip",
    label: "Callout (Tip)",
    template: "> [!tip] Title\n> Content here.\n",
  },
  { command: "link", label: "Link", template: "[text](url)" },
  { command: "image", label: "Image", template: "![alt text](url)" },
  { command: "divider", label: "Divider", template: "\n---\n" },
  { command: "checkbox", label: "Checkbox", template: "- [ ] " },
  { command: "numbered-list", label: "Numbered List", template: "1. " },
  { command: "quote", label: "Blockquote", template: "> " },
  { command: "embed", label: "Linked Note", template: "![[filename]]" },
];

interface SlashMenuProps {
  textarea: HTMLTextAreaElement | null;
  value: string;
  onChange: (newValue: string) => void;
}

export default function SlashMenu({ textarea, onChange }: SlashMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? SLASH_ITEMS.filter((item) =>
        item.command.includes(query.toLowerCase()) ||
        item.label.toLowerCase().includes(query.toLowerCase()),
      )
    : SLASH_ITEMS;

  useEffect(() => {
    if (!textarea) return;

    const handleInput = () => {
      const pos = textarea.selectionStart;
      const textBefore = textarea.value.slice(0, pos);
      const lineStart = textBefore.lastIndexOf("\n") + 1;
      const currentLine = textBefore.slice(lineStart);

      const slashMatch = currentLine.match(/^\/(\w*)$/);
      if (slashMatch) {
        setQuery(slashMatch[1]);
        setOpen(true);
        setSelectedIdx(0);

        // Position the menu
        const rect = textarea.getBoundingClientRect();
        const lineNum = textBefore.split("\n").length;
        const lineHeight = 20;
        setPosition({
          top: rect.top + lineNum * lineHeight + 4,
          left: rect.left + 32,
        });
      } else {
        setOpen(false);
      }
    };

    textarea.addEventListener("input", handleInput);
    return () => textarea.removeEventListener("input", handleInput);
  }, [textarea]);

  useEffect(() => {
    if (!open || !textarea) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        setSelectedIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[selectedIdx]) {
          e.preventDefault();
          insertTemplate(filtered[selectedIdx]);
        }
      }
    };

    textarea.addEventListener("keydown", handleKeyDown);
    return () => textarea.removeEventListener("keydown", handleKeyDown);
  }, [open, filtered, selectedIdx, textarea]);

  const insertTemplate = (item: SlashMenuItem) => {
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const textBefore = textarea.value.slice(0, pos);
    const lineStart = textBefore.lastIndexOf("\n") + 1;
    const after = textarea.value.slice(pos);

    const newValue = textarea.value.slice(0, lineStart) + item.template + after;
    onChange(newValue);
    setOpen(false);

    // Set cursor position after template insertion
    requestAnimationFrame(() => {
      const cursorPos = lineStart + item.template.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
      textarea.focus();
    });
  };

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-56 bg-surface border border-border rounded-lg shadow-2xl overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((item, i) => (
        <button
          key={item.command}
          onMouseDown={(e) => {
            e.preventDefault();
            insertTemplate(item);
          }}
          onMouseEnter={() => setSelectedIdx(i)}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
            i === selectedIdx
              ? "bg-surface-2 text-text"
              : "text-text-muted hover:bg-surface-2/50"
          }`}
        >
          <span className="app-font-mono text-purple text-xs">/{item.command}</span>
          <span className="text-xs">{item.label}</span>
        </button>
      ))}
      <div className="border-t border-border px-3 py-2 text-[10px] text-text-muted">
        Source mode template inserts
      </div>
    </div>
  );
}
