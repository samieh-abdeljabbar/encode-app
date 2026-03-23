import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { type EditorState, type Range, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/**
 * Check if the cursor is inside a given range.
 * If it is, we show raw markdown. If not, we show decorations.
 */
function cursorInRange(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const sel = state.selection.main;
  // Check if cursor or selection overlaps with the range
  return sel.from <= to && sel.to >= from;
}

/** Check if cursor is on the same line as the given position */
function cursorOnLine(state: EditorState, pos: number): boolean {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const targetLine = state.doc.lineAt(pos).number;
  return cursorLine === targetLine;
}

/** Horizontal rule widget */
class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.style.border = "none";
    hr.style.borderTop = "1px solid #333";
    hr.style.margin = "24px 0";
    return hr;
  }
}

/**
 * Build decorations for the current editor state.
 * Walks the Lezer markdown syntax tree and applies visual decorations
 * that hide markdown syntax when the cursor is not on that element.
 */
function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decos: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      const { from, to } = node;
      const onCursor = cursorInRange(state, from, to);

      switch (node.name) {
        // Headings: hide the ## markers when cursor is not on the line
        case "ATXHeading1":
        case "ATXHeading2":
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6": {
          if (!cursorOnLine(state, from)) {
            // Find the HeaderMark (the ## part)
            const mark = node.node.getChild("HeaderMark");
            if (mark) {
              // Hide the ## and the space after it
              const hideEnd = Math.min(mark.to + 1, to);
              decos.push(
                Decoration.replace({}).range(mark.from, hideEnd),
              );
            }
          }
          break;
        }

        // Bold: hide ** markers
        case "StrongEmphasis": {
          if (!onCursor) {
            // First ** (opening)
            decos.push(
              Decoration.replace({}).range(from, from + 2),
            );
            // Last ** (closing)
            decos.push(
              Decoration.replace({}).range(to - 2, to),
            );
          }
          break;
        }

        // Italic: hide * markers
        case "Emphasis": {
          if (!onCursor) {
            decos.push(
              Decoration.replace({}).range(from, from + 1),
            );
            decos.push(
              Decoration.replace({}).range(to - 1, to),
            );
          }
          break;
        }

        // Links: style the text, dim the URL
        case "Link": {
          if (!onCursor) {
            // Find [text](url) parts
            const linkMark = node.node.getChildren("LinkMark");
            const urlNode = node.node.getChild("URL");
            // Hide [ and ]( and ) — show just the text as a styled link
            if (linkMark.length >= 2 && urlNode) {
              // Hide opening [
              decos.push(Decoration.replace({}).range(linkMark[0].from, linkMark[0].to));
              // Hide ]( through closing )
              decos.push(Decoration.replace({}).range(linkMark[1].from, to));
              // Style the link text
              const textFrom = linkMark[0].to;
              const textTo = linkMark[1].from;
              decos.push(
                Decoration.mark({
                  class: "cm-link-text",
                }).range(textFrom, textTo),
              );
            }
          }
          break;
        }

        // Horizontal rule: replace with a styled <hr>
        case "HorizontalRule": {
          if (!cursorOnLine(state, from)) {
            decos.push(
              Decoration.replace({
                widget: new HrWidget(),
              }).range(from, to),
            );
          }
          break;
        }

        // Blockquote markers: dim the >
        case "QuoteMark": {
          if (!cursorOnLine(state, from)) {
            decos.push(
              Decoration.mark({
                class: "cm-quote-mark",
              }).range(from, to),
            );
          }
          break;
        }

        // Fenced code: style the fence markers dimly
        case "CodeMark": {
          decos.push(
            Decoration.mark({
              class: "cm-code-mark",
            }).range(from, to),
          );
          break;
        }

        // Code block: add background
        case "FencedCode": {
          const line1 = state.doc.lineAt(from);
          const line2 = state.doc.lineAt(to);
          for (let i = line1.number; i <= line2.number; i++) {
            const line = state.doc.line(i);
            decos.push(
              Decoration.line({
                class: "cm-codeblock-line",
              }).range(line.from),
            );
          }
          break;
        }
      }
    },
  });

  // Sort decorations by position (required by CM6)
  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);

  for (const d of decos) {
    builder.add(d.from, d.to, d.value);
  }

  return builder.finish();
}

/** CM6 ViewPlugin that provides live preview decorations */
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
  {
    decorations: (v) => v.decorations,
  },
);

/** Additional CSS styles for the live preview decorations */
export const livePreviewStyles = EditorView.baseTheme({
  ".cm-link-text": {
    color: "#7F77DD",
    borderBottom: "1px solid rgba(127, 119, 221, 0.3)",
    cursor: "pointer",
  },
  ".cm-quote-mark": {
    color: "#333",
    fontSize: "14px",
  },
  ".cm-code-mark": {
    color: "#333",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
  },
  ".cm-codeblock-line": {
    backgroundColor: "#1a1a1a",
    borderLeft: "2px solid #333",
    paddingLeft: "12px !important",
  },
});
