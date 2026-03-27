import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { type EditorState, type Range, RangeSetBuilder, StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/** Parse markdown table text into rows of cells */
function parseTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] =>
    line.split("|").slice(1, -1).map((c) => c.trim());

  const headers = parseRow(lines[0]);
  // Skip separator line (lines[1])
  const rows = lines.slice(2).map(parseRow);
  return { headers, rows };
}

/** Widget that renders a markdown table as an actual HTML table */
class TableWidget extends WidgetType {
  constructor(private readonly tableText: string) {
    super();
  }

  eq(other: TableWidget): boolean {
    return this.tableText === other.tableText;
  }

  toDOM(): HTMLElement {
    const { headers, rows } = parseTable(this.tableText);
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-widget";

    const table = document.createElement("table");
    // Header
    if (headers.length > 0) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      for (const h of headers) {
        const th = document.createElement("th");
        th.textContent = h;
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    // Body
    if (rows.length > 0) {
      const tbody = document.createElement("tbody");
      for (const row of rows) {
        const tr = document.createElement("tr");
        for (let i = 0; i < headers.length; i++) {
          const td = document.createElement("td");
          td.textContent = row[i] ?? "";
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }
    wrapper.appendChild(table);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Widget that renders a checkbox for task list items */
class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly pos: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = `cm-checkbox ${this.checked ? "cm-checkbox-checked" : "cm-checkbox-unchecked"}`;
    span.setAttribute("data-pos", String(this.pos));
    if (this.checked) {
      span.textContent = "\u2713";
    }
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Check if the cursor's line overlaps with a position */
function cursorOnLine(state: EditorState, pos: number): boolean {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const targetLine = state.doc.lineAt(Math.min(pos, state.doc.length)).number;
  return cursorLine === targetLine;
}

/** Check if cursor selection overlaps a range */
function cursorInRange(state: EditorState, from: number, to: number): boolean {
  const { from: sf, to: st } = state.selection.main;
  return sf < to && st > from;
}

/**
 * Obsidian-style live preview: hide markdown syntax when the cursor
 * is NOT on that line. Show it when the cursor enters.
 *
 * Uses Decoration.replace({ inclusive: false }) which allows the cursor
 * to move into the hidden range (making it visible again on next update).
 */
function buildDecorations(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      const { from, to } = node;

      switch (node.name) {
        // Hide ## heading markers when cursor is not on the line
        case "HeaderMark": {
          if (!cursorOnLine(state, from)) {
            // Hide the # and the space after it
            const end = Math.min(to + 1, state.doc.lineAt(from).to);
            if (end > from) {
              decos.push(
                Decoration.replace({ inclusive: false }).range(from, end),
              );
            }
          } else {
            // Cursor is on the line — dim the marker instead of hiding
            decos.push(
              Decoration.mark({ class: "cm-heading-mark" }).range(from, to),
            );
          }
          break;
        }

        // Hide ** bold markers when cursor is not in the range
        case "StrongEmphasis": {
          if (!cursorInRange(state, from, to) && to - from > 4) {
            // Hide opening **
            decos.push(Decoration.replace({ inclusive: false }).range(from, from + 2));
            // Hide closing **
            decos.push(Decoration.replace({ inclusive: false }).range(to - 2, to));
          }
          break;
        }

        // Hide * italic markers when cursor is not in the range
        case "Emphasis": {
          if (!cursorInRange(state, from, to) && to - from > 2) {
            decos.push(Decoration.replace({ inclusive: false }).range(from, from + 1));
            decos.push(Decoration.replace({ inclusive: false }).range(to - 1, to));
          }
          break;
        }

        // Dim emphasis markers when cursor IS in the range
        case "EmphasisMark": {
          if (cursorInRange(state, node.node.parent?.from ?? from, node.node.parent?.to ?? to)) {
            decos.push(Decoration.mark({ class: "cm-emphasis-mark" }).range(from, to));
          }
          break;
        }

        // Links: hide [text](url) syntax, show just text as link
        case "Link": {
          if (!cursorInRange(state, from, to)) {
            const marks = node.node.getChildren("LinkMark");
            const url = node.node.getChild("URL");
            if (marks.length >= 2 && url) {
              // Hide opening [
              decos.push(Decoration.replace({ inclusive: false }).range(marks[0].from, marks[0].to));
              // Hide ]( through )
              decos.push(Decoration.replace({ inclusive: false }).range(marks[1].from, to));
              // Style the link text with the URL stored as data attribute
              const href = state.sliceDoc(url.from, url.to);
              decos.push(Decoration.mark({
                class: "cm-link-text",
                attributes: { "data-href": href },
              }).range(marks[0].to, marks[1].from));
            }
          }
          break;
        }

        // Code fences — dim the markers, add background to block
        case "CodeMark": {
          decos.push(Decoration.mark({ class: "cm-code-mark" }).range(from, to));
          break;
        }

        case "FencedCode": {
          const line1 = state.doc.lineAt(from);
          const line2 = state.doc.lineAt(Math.min(to, state.doc.length));
          for (let i = line1.number; i <= line2.number; i++) {
            const line = state.doc.line(i);
            decos.push(Decoration.line({ class: "cm-codeblock-line" }).range(line.from));
          }
          break;
        }

        // Blockquote — left border + background, only on lines starting with >
        case "Blockquote": {
          const bqStart = state.doc.lineAt(from);
          const bqEnd = state.doc.lineAt(Math.min(to, state.doc.length));
          for (let i = bqStart.number; i <= bqEnd.number; i++) {
            const line = state.doc.line(i);
            if (line.text.trimStart().startsWith(">")) {
              decos.push(Decoration.line({ class: "cm-blockquote-line" }).range(line.from));
            }
          }
          break;
        }

        case "QuoteMark": {
          if (!cursorOnLine(state, from)) {
            decos.push(Decoration.replace({ inclusive: false }).range(from, Math.min(to + 1, state.doc.lineAt(from).to)));
          } else {
            decos.push(Decoration.mark({ class: "cm-quote-mark" }).range(from, to));
          }
          break;
        }

        // List items — style bullet/number markers
        case "ListMark": {
          if (!cursorOnLine(state, from)) {
            decos.push(Decoration.mark({ class: "cm-list-mark" }).range(from, to));
          } else {
            decos.push(Decoration.mark({ class: "cm-list-mark-active" }).range(from, to));
          }
          break;
        }

        // BulletList/OrderedList: no line decoration — just let ListMark handle markers

        // Table decorations handled by tableDecoField (block decos need StateField)
        case "Table":
          return false; // Skip — handled separately

        // Strikethrough: hide ~~ markers when cursor is not in range
        case "Strikethrough": {
          if (!cursorInRange(state, from, to) && to - from > 4) {
            decos.push(Decoration.replace({ inclusive: false }).range(from, from + 2));
            decos.push(Decoration.replace({ inclusive: false }).range(to - 2, to));
            decos.push(Decoration.mark({ class: "cm-strikethrough-text" }).range(from + 2, to - 2));
          }
          break;
        }

        case "StrikethroughMark": {
          if (cursorInRange(state, node.node.parent?.from ?? from, node.node.parent?.to ?? to)) {
            decos.push(Decoration.mark({ class: "cm-strikethrough-mark" }).range(from, to));
          }
          break;
        }

        // Checkbox task markers: replace [ ]/[x] with styled widget
        case "TaskMarker": {
          const markerText = state.sliceDoc(from, to);
          const checked = /\[x\]/i.test(markerText);
          if (!cursorOnLine(state, from)) {
            decos.push(
              Decoration.replace({
                widget: new CheckboxWidget(checked, from),
                inclusive: false,
              }).range(from, to),
            );
          } else {
            decos.push(Decoration.mark({ class: "cm-task-marker" }).range(from, to));
          }
          break;
        }

        // Horizontal rule
        case "HorizontalRule": {
          if (!cursorOnLine(state, from)) {
            decos.push(Decoration.mark({ class: "cm-hr" }).range(from, to));
          }
          break;
        }
      }
    },
  });

  // Sort by from position, then by startSide
  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);

  const builder = new RangeSetBuilder<Decoration>();
  for (const d of decos) {
    builder.add(d.from, d.to, d.value);
  }
  return builder.finish();
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      try {
        this.decorations = buildDecorations(view.state);
      } catch {
        this.decorations = Decoration.none;
      }
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        try {
          this.decorations = buildDecorations(update.state);
        } catch {
          this.decorations = Decoration.none;
        }
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Build table decorations — block widgets need a StateField, not a ViewPlugin */
function buildTableDecorations(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;

      const { from, to } = node;
      const startLine = state.doc.lineAt(from);
      const endLine = state.doc.lineAt(Math.min(to, state.doc.length));

      if (!cursorInRange(state, startLine.from, endLine.to)) {
        const tableText = state.sliceDoc(from, to);
        decos.push(
          Decoration.replace({
            widget: new TableWidget(tableText),
            block: true,
          }).range(startLine.from, endLine.to),
        );
      } else {
        // Cursor inside — line-level styling
        for (let i = startLine.number; i <= endLine.number; i++) {
          const line = state.doc.line(i);
          const lineClass = i === startLine.number ? "cm-table-header-line"
            : i === startLine.number + 1 ? "cm-table-separator-line"
            : "cm-table-row-line";
          decos.push(Decoration.line({ class: lineClass }).range(line.from));
        }
      }

      return false; // Skip child nodes
    },
  });

  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const d of decos) {
    builder.add(d.from, d.to, d.value);
  }
  return builder.finish();
}

export const tableDecoField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(decos, tr) {
    if (tr.docChanged || tr.selection) {
      return buildTableDecorations(tr.state);
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Cmd+Click (Mac) / Ctrl+Click opens links in browser */
export const linkClickHandler = EditorView.domEventHandlers({
  click(event: MouseEvent, _view: EditorView) {
    if (!(event.metaKey || event.ctrlKey)) return false;

    const target = event.target as HTMLElement;
    const href = target.closest("[data-href]")?.getAttribute("data-href");
    if (!href) return false;

    event.preventDefault();
    import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
      openUrl(href);
    }).catch(() => {
      window.open(href, "_blank");
    });
    return true;
  },
});

/** Click on a checkbox widget toggles [ ] <-> [x] in the document */
export const checkboxClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("cm-checkbox")) return false;

    const posAttr = target.getAttribute("data-pos");
    if (!posAttr) return false;

    const pos = parseInt(posAttr);
    const line = view.state.doc.lineAt(pos);
    const match = line.text.match(/\[([ xX])\]/);
    if (match && match.index != null) {
      const bracketPos = line.from + match.index + 1;
      const newChar = match[1] === " " ? "x" : " ";
      view.dispatch({ changes: { from: bracketPos, to: bracketPos + 1, insert: newChar } });
    }
    event.preventDefault();
    return true;
  },
});

/** Widget that renders a flashcard as a styled Q/A card */
class FlashcardWidget extends WidgetType {
  constructor(
    private readonly question: string,
    private readonly answer: string,
    private readonly cardId: string,
  ) {
    super();
  }

  eq(other: FlashcardWidget): boolean {
    return this.cardId === other.cardId && this.question === other.question && this.answer === other.answer;
  }

  toDOM(): HTMLElement {
    const card = document.createElement("div");
    card.className = "cm-fc-card";

    const q = document.createElement("div");
    q.className = "cm-fc-q";
    const qLabel = document.createElement("span");
    qLabel.className = "cm-fc-label cm-fc-label-q";
    qLabel.textContent = "Q";
    q.appendChild(qLabel);
    q.appendChild(document.createTextNode(" " + this.question));

    const a = document.createElement("div");
    a.className = "cm-fc-a";
    const aLabel = document.createElement("span");
    aLabel.className = "cm-fc-label cm-fc-label-a";
    aLabel.textContent = "A";
    a.appendChild(aLabel);
    a.appendChild(document.createTextNode(" " + this.answer));

    card.appendChild(q);
    card.appendChild(a);
    return card;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Build flashcard decorations — block widgets need a StateField */
function buildFlashcardDecorations(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const doc = state.doc;

  let i = 1;
  while (i <= doc.lines) {
    const line = doc.line(i);
    const cardMatch = line.text.match(/^>\s*\[!card\]\s*id:\s*(.+)/);
    if (!cardMatch) { i++; continue; }

    const cardId = cardMatch[1].trim();
    const blockStart = i;
    let question = "";
    let answer = "";
    i++;

    // Collect continuation lines
    while (i <= doc.lines) {
      const next = doc.line(i);
      if (!next.text.trimStart().startsWith(">")) break;
      const content = next.text.replace(/^>\s*/, "");
      const qMatch = content.match(/\*\*Q:\*\*\s*(.*)/);
      const aMatch = content.match(/\*\*A:\*\*\s*(.*)/);
      if (qMatch) question = qMatch[1];
      if (aMatch) answer = aMatch[1];
      i++;
    }

    const blockEnd = i - 1;
    const startLine = doc.line(blockStart);
    const endLine = doc.line(blockEnd);

    if (question && !cursorInRange(state, startLine.from, endLine.to)) {
      decos.push(
        Decoration.replace({
          widget: new FlashcardWidget(question, answer, cardId),
          block: true,
        }).range(startLine.from, endLine.to),
      );
    }
  }

  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const d of decos) {
    builder.add(d.from, d.to, d.value);
  }
  return builder.finish();
}

export const flashcardDecoField = StateField.define<DecorationSet>({
  create(state) {
    return buildFlashcardDecorations(state);
  },
  update(decos, tr) {
    if (tr.docChanged || tr.selection) {
      return buildFlashcardDecorations(tr.state);
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const livePreviewStyles = EditorView.baseTheme({
  ".cm-heading-mark": {
    color: "var(--color-text-muted)",
    fontSize: "0.75em",
  },
  ".cm-emphasis-mark": {
    color: "var(--color-text-muted)",
  },
  ".cm-link-text": {
    color: "var(--color-accent)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--color-accent) 35%, transparent)",
    cursor: "pointer",
  },
  ".cm-code-mark": {
    color: "var(--color-text-muted)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.8em",
  },
  ".cm-codeblock-line": {
    backgroundColor: "color-mix(in srgb, var(--color-panel-alt) 78%, transparent)",
    borderLeft: "2px solid var(--color-border-strong)",
    paddingLeft: "12px !important",
  },
  ".cm-quote-mark": {
    color: "var(--color-text-muted)",
    fontSize: "0.8em",
  },
  ".cm-blockquote-line": {
    borderLeft: "3px solid var(--color-border-strong)",
    paddingLeft: "14px !important",
    backgroundColor: "color-mix(in srgb, var(--color-panel-alt) 68%, transparent)",
  },
  ".cm-list-mark": {
    color: "var(--color-accent)",
    fontWeight: "700",
  },
  ".cm-list-mark-active": {
    color: "var(--color-text-muted)",
  },
  ".cm-hr": {
    color: "var(--color-border)",
    textDecoration: "line-through",
  },
  ".cm-table-delim": {
    color: "var(--color-text-muted)",
  },
  ".cm-table-header-line": {
    backgroundColor: "var(--color-panel-alt)",
    borderBottom: "1px solid var(--color-border-strong)",
    fontWeight: "600",
  },
  ".cm-table-separator-line": {
    color: "var(--color-border) !important",
    fontSize: "0.7em",
    lineHeight: "1.2",
  },
  ".cm-table-row-line": {
    backgroundColor: "color-mix(in srgb, var(--color-panel) 82%, transparent)",
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  ".cm-table-widget": {
    padding: "8px 0",
  },
  ".cm-table-widget table": {
    borderCollapse: "collapse",
    width: "auto",
    minWidth: "40%",
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
  },
  ".cm-table-widget th": {
    backgroundColor: "var(--color-panel-alt)",
    color: "var(--color-text)",
    fontWeight: "600",
    padding: "8px 16px",
    borderBottom: "1px solid var(--color-border-strong)",
    textAlign: "left",
  },
  ".cm-table-widget td": {
    padding: "7px 16px",
    borderBottom: "1px solid var(--color-border-subtle)",
    color: "var(--color-text)",
  },
  ".cm-table-widget tbody tr:hover": {
    backgroundColor: "color-mix(in srgb, var(--color-panel-active) 76%, transparent)",
  },
  // Strikethrough
  ".cm-strikethrough-text": {
    textDecoration: "line-through",
    color: "var(--color-text-muted)",
  },
  ".cm-strikethrough-mark": {
    color: "var(--color-text-muted)",
    fontSize: "0.8em",
  },
  // Checkboxes
  ".cm-checkbox": {
    display: "inline-block",
    width: "16px",
    height: "16px",
    lineHeight: "16px",
    textAlign: "center" as const,
    borderRadius: "3px",
    cursor: "pointer",
    verticalAlign: "middle",
    marginRight: "4px",
    fontSize: "12px",
    userSelect: "none" as const,
  },
  ".cm-checkbox-unchecked": {
    border: "2px solid var(--color-text-muted)",
  },
  ".cm-checkbox-checked": {
    backgroundColor: "var(--color-accent)",
    border: "2px solid var(--color-accent)",
    color: "white",
    fontWeight: "700",
  },
  ".cm-task-marker": {
    color: "var(--color-text-muted)",
    fontFamily: "var(--font-mono)",
  },
  // Flashcards
  ".cm-fc-card": {
    background: "var(--color-panel-alt)",
    border: "1px solid var(--color-border-subtle)",
    borderLeft: "3px solid var(--color-accent)",
    borderRadius: "12px",
    padding: "16px 18px",
    margin: "4px 0",
  },
  ".cm-fc-q": {
    fontSize: "15px",
    color: "var(--color-text)",
    marginBottom: "8px",
  },
  ".cm-fc-a": {
    fontSize: "14px",
    color: "var(--color-text-muted)",
  },
  ".cm-fc-label": {
    display: "inline-block",
    width: "20px",
    height: "20px",
    lineHeight: "20px",
    textAlign: "center" as const,
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "700",
    fontFamily: "var(--font-mono)",
    color: "white",
    marginRight: "8px",
    verticalAlign: "middle",
  },
  ".cm-fc-label-q": {
    backgroundColor: "var(--color-accent)",
  },
  ".cm-fc-label-a": {
    backgroundColor: "var(--color-teal)",
  },
});
