import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type EditorState, type Range, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// Table styling uses line-level decorations (no widget replacement needed)

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
              // Style the link text
              decos.push(Decoration.mark({ class: "cm-link-text" }).range(marks[0].to, marks[1].from));
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

        // Blockquote > markers — dim
        case "QuoteMark": {
          decos.push(Decoration.mark({ class: "cm-quote-mark" }).range(from, to));
          break;
        }

        // Table styling — add background to rows, dim pipes, bold headers
        case "Table": {
          // Style each line of the table
          const startLine = state.doc.lineAt(from);
          const endLine = state.doc.lineAt(Math.min(to, state.doc.length));
          for (let i = startLine.number; i <= endLine.number; i++) {
            const line = state.doc.line(i);
            const lineClass = i === startLine.number ? "cm-table-header-line"
              : i === startLine.number + 1 ? "cm-table-separator-line"
              : "cm-table-row-line";
            decos.push(Decoration.line({ class: lineClass }).range(line.from));
          }
          break;
        }

        case "TableDelimiter": {
          decos.push(Decoration.mark({ class: "cm-table-delim" }).range(from, to));
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
      this.decorations = buildDecorations(view.state);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.state);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const livePreviewStyles = EditorView.baseTheme({
  ".cm-heading-mark": {
    color: "#555",
    fontSize: "0.75em",
  },
  ".cm-emphasis-mark": {
    color: "#555",
  },
  ".cm-link-text": {
    color: "#7F77DD",
    textDecoration: "underline",
    textDecorationColor: "rgba(127, 119, 221, 0.3)",
    cursor: "pointer",
  },
  ".cm-code-mark": {
    color: "#444",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.8em",
  },
  ".cm-codeblock-line": {
    backgroundColor: "#1a1a1a",
    borderLeft: "2px solid #333",
    paddingLeft: "12px !important",
  },
  ".cm-quote-mark": {
    color: "#444",
  },
  ".cm-hr": {
    color: "#333",
    textDecoration: "line-through",
  },
  ".cm-table-delim": {
    color: "#555",
  },
  ".cm-table-header-line": {
    backgroundColor: "#1a1a1a",
    borderBottom: "2px solid #333",
    fontWeight: "600",
  },
  ".cm-table-separator-line": {
    color: "#333 !important",
    fontSize: "0.7em",
    lineHeight: "1.2",
  },
  ".cm-table-row-line": {
    backgroundColor: "rgba(255,255,255,0.015)",
    borderBottom: "1px solid #1f1f1f",
  },
});
