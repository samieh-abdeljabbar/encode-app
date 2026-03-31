import { type Extension, RangeSet, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

// ---------------------------------------------------------------------------
// Column Widget — renders :::columns-N blocks as side-by-side columns
// ---------------------------------------------------------------------------

class ColumnsWidget extends WidgetType {
  constructor(
    private readonly columns: string[],
    private readonly count: number,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-columns-widget";
    container.style.display = "grid";
    container.style.gridTemplateColumns = `repeat(${this.count}, 1fr)`;
    container.style.gap = "16px";
    container.style.margin = "12px 0";
    container.style.padding = "12px";
    container.style.borderRadius = "8px";
    container.style.border = "1px solid var(--color-border-subtle, #d6d0c3)";
    container.style.backgroundColor = "var(--color-panel, #faf8f3)";

    for (const col of this.columns) {
      const colDiv = document.createElement("div");
      colDiv.style.padding = "8px";
      colDiv.style.minHeight = "40px";

      // Simple markdown rendering for column content
      const lines = col.trim().split("\n");
      for (const line of lines) {
        const p = document.createElement("p");
        p.style.margin = "0 0 4px 0";
        p.style.fontSize = "14px";
        p.style.lineHeight = "1.6";
        p.style.color = "var(--color-text, #1a1f17)";

        // Basic inline formatting
        let html = line
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(
            /`(.+?)`/g,
            '<code style="background:var(--color-panel-alt,#f0ece3);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>',
          );

        if (line.startsWith("# ")) {
          p.style.fontSize = "1.3em";
          p.style.fontWeight = "700";
          html = html.slice(2);
        } else if (line.startsWith("## ")) {
          p.style.fontSize = "1.15em";
          p.style.fontWeight = "600";
          html = html.slice(3);
        }

        // biome-ignore lint/security/noDangerouslySetInnerHtml: user's own content
        p.innerHTML = html || "&nbsp;";
        colDiv.appendChild(p);
      }

      container.appendChild(colDiv);
    }

    return container;
  }

  eq(other: ColumnsWidget): boolean {
    return (
      this.count === other.count &&
      this.columns.join("|||") === other.columns.join("|||")
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// StateField for column block decorations
// ---------------------------------------------------------------------------

const COLUMNS_REGEX = /^:::columns-(\d+)\n([\s\S]*?)\n:::$/gm;

function buildColumnDecorations(
  state: import("@codemirror/state").EditorState,
): RangeSet<Decoration> {
  const decorations: import("@codemirror/state").Range<Decoration>[] = [];
  const doc = state.doc.toString();
  const cursor = state.selection.main;

  for (const match of doc.matchAll(COLUMNS_REGEX)) {
    const from = match.index;
    const to = from + match[0].length;

    // Skip if cursor is inside
    if (cursor.from >= from && cursor.to <= to) continue;

    const count = Number.parseInt(match[1], 10);
    const content = match[2];
    const columns = content.split(/\n---\n/).map((c) => c.trim());

    decorations.push(
      Decoration.replace({
        widget: new ColumnsWidget(columns, count),
        block: true,
      }).range(from, to),
    );
  }

  return RangeSet.of(decorations.sort((a, b) => a.from - b.from));
}

const columnDecorationField = StateField.define<RangeSet<Decoration>>({
  create(state) {
    return buildColumnDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) {
      return buildColumnDecorations(tr.state);
    }
    return value.map(tr.changes);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

export const columnRendering: Extension = columnDecorationField;
