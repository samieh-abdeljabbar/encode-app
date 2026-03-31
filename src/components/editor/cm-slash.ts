import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

export interface SlashCommand {
  name: string;
  label: string;
  description: string;
  insert: (view: EditorView) => string;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp(): string {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hours}:${mins}`;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "heading",
    label: "Heading 2",
    description: "Large section heading",
    insert: () => "## ",
  },
  {
    name: "heading3",
    label: "Heading 3",
    description: "Medium section heading",
    insert: () => "### ",
  },
  {
    name: "table",
    label: "Table",
    description: "3-column table",
    insert: () =>
      "| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell     | Cell     | Cell     |\n| Cell     | Cell     | Cell     |",
  },
  {
    name: "code",
    label: "Code Block",
    description: "Fenced code block",
    insert: () => "```\n\n```",
  },
  {
    name: "quote",
    label: "Quote",
    description: "Block quote",
    insert: () => "> ",
  },
  {
    name: "divider",
    label: "Divider",
    description: "Horizontal rule",
    insert: () => "---\n",
  },
  {
    name: "bullet",
    label: "Bullet List",
    description: "Unordered list item",
    insert: () => "- ",
  },
  {
    name: "numbered",
    label: "Numbered List",
    description: "Ordered list item",
    insert: () => "1. ",
  },
  {
    name: "todo",
    label: "To-do",
    description: "Checkbox list item",
    insert: () => "- [ ] ",
  },
  {
    name: "callout",
    label: "Callout",
    description: "Note callout block",
    insert: () => "> [!note]\n> ",
  },
  {
    name: "collapse",
    label: "Collapse",
    description: "Collapsible details block",
    insert: () => "<details>\n<summary>Title</summary>\n\n\n</details>",
  },
  {
    name: "flashcard",
    label: "Flashcard",
    description: "Q&A flashcard template",
    insert: () => "Q: \nA: ",
  },
  {
    name: "definition",
    label: "Definition",
    description: "Bold term definition",
    insert: () => "**Term**: ",
  },
  {
    name: "formula",
    label: "Formula",
    description: "Display math block",
    insert: () => "$$\n\n$$",
  },
  {
    name: "image",
    label: "Image",
    description: "Inline image",
    insert: () => "![alt](url)",
  },
  {
    name: "link",
    label: "Link",
    description: "Hyperlink",
    insert: () => "[text](url)",
  },
  {
    name: "date",
    label: "Date",
    description: "Today's date",
    insert: todayDate,
  },
  {
    name: "timestamp",
    label: "Timestamp",
    description: "Current date and time",
    insert: nowTimestamp,
  },
];

// ---------------------------------------------------------------------------
// Menu DOM management
// ---------------------------------------------------------------------------

function createMenuEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "cm-slash-menu";
  el.style.position = "fixed";
  el.style.zIndex = "9999";
  el.style.background = "#ffffff";
  el.style.border = "1px solid #d1d5db";
  el.style.borderRadius = "8px";
  el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
  el.style.minWidth = "240px";
  el.style.maxWidth = "320px";
  el.style.maxHeight = "320px";
  el.style.overflowY = "auto";
  el.style.padding = "4px";
  el.style.fontFamily = "'Inter', system-ui, sans-serif";
  el.style.fontSize = "13px";
  el.style.display = "none";
  return el;
}

function renderMenu(
  el: HTMLDivElement,
  commands: SlashCommand[],
  selectedIndex: number,
): void {
  el.innerHTML = "";

  if (commands.length === 0) {
    const empty = document.createElement("div");
    empty.style.padding = "8px 12px";
    empty.style.color = "#9ca3af";
    empty.textContent = "No commands found";
    el.appendChild(empty);
    return;
  }

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const row = document.createElement("div");
    row.dataset.index = String(i);
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "7px 10px";
    row.style.borderRadius = "6px";
    row.style.cursor = "pointer";
    row.style.background = i === selectedIndex ? "#f3f4f6" : "transparent";
    row.style.color = "#1a1a1a";

    const nameEl = document.createElement("span");
    nameEl.style.fontWeight = "500";
    nameEl.style.minWidth = "80px";
    nameEl.style.color = i === selectedIndex ? "#111827" : "#374151";
    nameEl.textContent = cmd.label;

    const descEl = document.createElement("span");
    descEl.style.color = "#9ca3af";
    descEl.style.fontSize = "12px";
    descEl.style.overflow = "hidden";
    descEl.style.textOverflow = "ellipsis";
    descEl.style.whiteSpace = "nowrap";
    descEl.textContent = cmd.description;

    row.appendChild(nameEl);
    row.appendChild(descEl);
    el.appendChild(row);

    if (i === selectedIndex) {
      row.scrollIntoView({ block: "nearest" });
    }
  }
}

function positionMenu(el: HTMLDivElement, view: EditorView): void {
  const pos = view.state.selection.main.head;
  const coords = view.coordsAtPos(pos);
  if (!coords) return;

  const menuHeight = 320;
  const menuWidth = 240;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = coords.bottom + 4;
  let left = coords.left;

  if (top + menuHeight > vh) {
    top = coords.top - menuHeight - 4;
  }
  if (left + menuWidth > vw) {
    left = vw - menuWidth - 8;
  }
  if (top < 0) {
    top = coords.bottom + 4;
  }

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// ---------------------------------------------------------------------------
// Plugin class
// ---------------------------------------------------------------------------

class SlashMenuPlugin {
  private active = false;
  private filter = "";
  private selectedIndex = 0;
  private anchorPos = 0;
  private filteredCommands: SlashCommand[] = [];
  private menuEl: HTMLDivElement;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.menuEl = createMenuEl();
    document.body.appendChild(this.menuEl);

    this.menuEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const target = (e.target as HTMLElement).closest(
        "[data-index]",
      ) as HTMLElement | null;
      if (!target) return;
      const idx = Number(target.dataset.index);
      const cmd = this.filteredCommands[idx];
      if (cmd) this.insertCommand(cmd);
    });
  }

  private getFiltered(): SlashCommand[] {
    const f = this.filter.toLowerCase();
    if (!f) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) => c.name.startsWith(f) || c.label.toLowerCase().includes(f),
    );
  }

  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.active) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selectedIndex = Math.min(
        this.selectedIndex + 1,
        this.filteredCommands.length - 1,
      );
      this.refreshMenu();
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.refreshMenu();
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const cmd = this.filteredCommands[this.selectedIndex];
      if (cmd) {
        this.insertCommand(cmd);
      } else {
        this.deactivate();
      }
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.deactivate();
      return true;
    }

    return false;
  }

  handleUpdate(_update: ViewUpdate): void {
    const { state } = this.view;
    const sel = state.selection.main;

    if (!sel.empty) {
      this.deactivate();
      return;
    }

    const pos = sel.head;
    const line = state.doc.lineAt(pos);
    const posInLine = pos - line.from;
    const textBeforeCursor = line.text.slice(0, posInLine);

    // Match `/` optionally preceded by only whitespace, followed by lowercase letters
    const slashMatch = /^(\s*)\/([a-z]*)$/.exec(textBeforeCursor);

    if (!this.active) {
      if (slashMatch) {
        this.active = true;
        this.anchorPos = line.from + (slashMatch[1]?.length ?? 0);
        this.filter = slashMatch[2] ?? "";
        this.selectedIndex = 0;
        this.filteredCommands = this.getFiltered();
        this.openMenu();
      }
      return;
    }

    // Already active — verify still on same line with slash pattern
    const anchorLine = state.doc.lineAt(this.anchorPos);
    if (line.number !== anchorLine.number || !slashMatch) {
      this.deactivate();
      return;
    }

    const newFilter = slashMatch[2] ?? "";
    if (newFilter !== this.filter) {
      this.filter = newFilter;
      this.selectedIndex = 0;
      this.filteredCommands = this.getFiltered();
    }

    if (this.filteredCommands.length === 0) {
      this.deactivate();
      return;
    }

    this.refreshMenu();
  }

  private openMenu(): void {
    renderMenu(this.menuEl, this.filteredCommands, this.selectedIndex);
    this.menuEl.style.display = "block";
    // Defer layout read to avoid "Reading editor layout during update" error
    requestAnimationFrame(() => positionMenu(this.menuEl, this.view));
  }

  private refreshMenu(): void {
    renderMenu(this.menuEl, this.filteredCommands, this.selectedIndex);
    // Defer layout read
    requestAnimationFrame(() => positionMenu(this.menuEl, this.view));
  }

  private insertCommand(cmd: SlashCommand): void {
    const cursorPos = this.view.state.selection.main.head;
    const text = cmd.insert(this.view);

    this.view.dispatch({
      changes: {
        from: this.anchorPos,
        to: cursorPos,
        insert: text,
      },
      selection: { anchor: this.anchorPos + text.length },
    });

    this.deactivate();
    this.view.focus();
  }

  deactivate(): void {
    this.active = false;
    this.filter = "";
    this.selectedIndex = 0;
    this.menuEl.style.display = "none";
  }

  destroy(): void {
    this.menuEl.remove();
  }
}

// ---------------------------------------------------------------------------
// Extension export
// ---------------------------------------------------------------------------

// WeakMap to expose plugin instances for the keydown event handler
const pluginInstances = new WeakMap<EditorView, SlashMenuPlugin>();

export function slashCommands(): Extension {
  return ViewPlugin.define(
    (view) => {
      const instance = new SlashMenuPlugin(view);
      pluginInstances.set(view, instance);
      return {
        update(update: ViewUpdate) {
          instance.handleUpdate(update);
        },
        destroy() {
          pluginInstances.delete(view);
          instance.destroy();
        },
      };
    },
    {
      eventHandlers: {
        keydown(event: KeyboardEvent, view: EditorView): boolean {
          const inst = pluginInstances.get(view);
          if (!inst) return false;
          return inst.handleKeydown(event);
        },
      },
    },
  );
}
