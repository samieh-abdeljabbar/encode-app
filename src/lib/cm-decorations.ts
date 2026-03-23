import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type EditorState, type Range, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/**
 * Build decorations that style markdown elements without blocking editing.
 * Uses only Decoration.mark() — never Decoration.replace() — so the
 * cursor can always enter and edit any part of the document.
 */
function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decos: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      const { from, to } = node;

      switch (node.name) {
        // Heading markers (##) — dim them
        case "HeaderMark": {
          decos.push(
            Decoration.mark({ class: "cm-heading-mark" }).range(from, to),
          );
          break;
        }

        // Emphasis markers (* or _) — dim them
        case "EmphasisMark": {
          decos.push(
            Decoration.mark({ class: "cm-emphasis-mark" }).range(from, to),
          );
          break;
        }

        // Links — style the URL part dimly
        case "URL": {
          decos.push(
            Decoration.mark({ class: "cm-url" }).range(from, to),
          );
          break;
        }

        // Link markers [ ] ( ) — dim them
        case "LinkMark": {
          decos.push(
            Decoration.mark({ class: "cm-link-mark" }).range(from, to),
          );
          break;
        }

        // Code fence markers (```) — dim them
        case "CodeMark": {
          decos.push(
            Decoration.mark({ class: "cm-code-mark" }).range(from, to),
          );
          break;
        }

        // Fenced code block lines — add background
        case "FencedCode": {
          const line1 = state.doc.lineAt(from);
          const line2 = state.doc.lineAt(to);
          for (let i = line1.number; i <= line2.number; i++) {
            const line = state.doc.line(i);
            decos.push(
              Decoration.line({ class: "cm-codeblock-line" }).range(line.from),
            );
          }
          break;
        }

        // Blockquote markers (>) — dim them
        case "QuoteMark": {
          decos.push(
            Decoration.mark({ class: "cm-quote-mark" }).range(from, to),
          );
          break;
        }

        // Horizontal rule — style the whole line
        case "HorizontalRule": {
          decos.push(
            Decoration.mark({ class: "cm-hr" }).range(from, to),
          );
          break;
        }
      }
    },
  });

  // Sort by position (required by CM6)
  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  for (const d of decos) {
    builder.add(d.from, d.to, d.value);
  }
  return builder.finish();
}

/** CM6 ViewPlugin for markdown styling */
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

/** Styles for the markdown decorations */
export const livePreviewStyles = EditorView.baseTheme({
  ".cm-heading-mark": {
    color: "#444",
    fontSize: "0.7em",
  },
  ".cm-emphasis-mark": {
    color: "#555",
  },
  ".cm-url": {
    color: "#666",
    fontSize: "0.85em",
  },
  ".cm-link-mark": {
    color: "#555",
  },
  ".cm-code-mark": {
    color: "#444",
    fontFamily: "'JetBrains Mono', monospace",
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
  },
});
