import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// ---------------------------------------------------------------------------
// Widget types
// ---------------------------------------------------------------------------

class ImageWidget extends WidgetType {
  constructor(
    private readonly url: string,
    private readonly alt: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-image-widget";

    const img = document.createElement("img");
    img.src = this.url;
    img.alt = this.alt;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.style.display = "block";
    img.style.margin = "8px 0";

    wrap.appendChild(img);
    return wrap;
  }

  eq(other: ImageWidget): boolean {
    return this.url === other.url && this.alt === other.alt;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-hr";
    return hr;
  }

  eq(): boolean {
    return true;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = "\u2022";
    span.style.marginRight = "4px";
    return span;
  }

  eq(): boolean {
    return true;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cursor intersection check
// ---------------------------------------------------------------------------

/** Check if the cursor is on the same line as the given range */
function cursorOnLine(state: EditorState, from: number, to: number): boolean {
  const nodeLineStart = state.doc.lineAt(from).number;
  const nodeLineEnd = state.doc.lineAt(to).number;

  return state.selection.ranges.some((r) => {
    const cursorLine = state.doc.lineAt(r.head).number;
    return cursorLine >= nodeLineStart && cursorLine <= nodeLineEnd;
  });
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

/** Heading level to CSS class mapping */
const HEADING_CLASSES: Record<string, string> = {
  ATXHeading1: "cm-heading-1",
  ATXHeading2: "cm-heading-2",
  ATXHeading3: "cm-heading-3",
  ATXHeading4: "cm-heading-3",
  ATXHeading5: "cm-heading-3",
  ATXHeading6: "cm-heading-3",
};

function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(state);

  // Collect decorations unsorted, then sort before adding to builder
  const decorations: { from: number; to: number; decoration: Decoration }[] =
    [];

  function addDeco(from: number, to: number, decoration: Decoration): void {
    decorations.push({ from, to, decoration });
  }

  tree.iterate({
    enter(node) {
      const { name, from, to } = node;

      // Skip decorating lines where the cursor sits (live-preview toggle)
      if (cursorOnLine(state, from, to)) {
        return;
      }

      // --- Headings ---
      const headingClass = HEADING_CLASSES[name];
      if (headingClass) {
        // Apply heading style to the full heading range
        addDeco(from, to, Decoration.mark({ class: headingClass }));

        // Hide the heading mark (e.g. "## ")
        // Walk children to find HeaderMark nodes
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === "HeaderMark") {
              // Hide the mark and the trailing space
              const markEnd = Math.min(cursor.to + 1, to);
              addDeco(cursor.from, markEnd, Decoration.replace({}));
            }
          } while (cursor.nextSibling());
        }
        return;
      }

      // --- Bold (StrongEmphasis) ---
      if (name === "StrongEmphasis") {
        addDeco(from, to, Decoration.mark({ class: "cm-strong" }));

        // Hide the ** markers (EmphasisMark children)
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === "EmphasisMark") {
              addDeco(cursor.from, cursor.to, Decoration.replace({}));
            }
          } while (cursor.nextSibling());
        }
        return;
      }

      // --- Italic (Emphasis) ---
      if (name === "Emphasis") {
        addDeco(from, to, Decoration.mark({ class: "cm-emphasis" }));

        // Hide the * markers
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === "EmphasisMark") {
              addDeco(cursor.from, cursor.to, Decoration.replace({}));
            }
          } while (cursor.nextSibling());
        }
        return;
      }

      // --- Inline code ---
      if (name === "InlineCode") {
        addDeco(from, to, Decoration.mark({ class: "cm-code" }));

        // Hide backtick markers
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === "CodeMark") {
              addDeco(cursor.from, cursor.to, Decoration.replace({}));
            }
          } while (cursor.nextSibling());
        }
        return;
      }

      // --- Fenced code blocks ---
      if (name === "FencedCode") {
        addDeco(from, to, Decoration.mark({ class: "cm-fencedCode" }));
        return;
      }

      // --- Blockquote ---
      if (name === "Blockquote") {
        addDeco(from, to, Decoration.mark({ class: "cm-blockquote" }));
        return;
      }

      // --- Horizontal rule ---
      if (name === "HorizontalRule") {
        addDeco(
          from,
          to,
          Decoration.replace({
            widget: new HorizontalRuleWidget(),
          }),
        );
        return;
      }

      // --- Links: [text](url) -> show "text" as a link ---
      if (name === "Link") {
        const linkNode = node.node;
        let urlValue = "";
        let textFrom = from;
        let textTo = to;

        // Find URL and LinkMark children
        const linkMarkPositions: { from: number; to: number }[] = [];
        const cursor = linkNode.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === "URL") {
              urlValue = state.doc.sliceString(cursor.from, cursor.to);
            }
            if (cursor.name === "LinkMark") {
              linkMarkPositions.push({
                from: cursor.from,
                to: cursor.to,
              });
            }
          } while (cursor.nextSibling());
        }

        if (urlValue && linkMarkPositions.length >= 3) {
          // [text](url) has LinkMarks: [, ](, )
          // First LinkMark is "[" -> hide it
          const openBracket = linkMarkPositions[0];
          addDeco(openBracket.from, openBracket.to, Decoration.replace({}));

          // Second LinkMark is "](" -> from this to the end of the URL+closing paren
          const closingStart = linkMarkPositions[1];
          const closingEnd = linkMarkPositions[linkMarkPositions.length - 1];
          addDeco(closingStart.from, closingEnd.to, Decoration.replace({}));

          // Calculate text range (between first and second LinkMark)
          textFrom = openBracket.to;
          textTo = closingStart.from;

          // Style the visible text as a link
          addDeco(
            textFrom,
            textTo,
            Decoration.mark({
              class: "cm-link",
              attributes: {
                title: urlValue,
              },
            }),
          );
        }
        return;
      }

      // --- Images: ![alt](url) -> render <img> ---
      if (name === "Image") {
        const imageNode = node.node;
        let urlValue = "";
        let altText = "";

        // Extract URL and alt text from the image syntax
        const cursor = imageNode.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === "URL") {
              urlValue = state.doc.sliceString(cursor.from, cursor.to);
            }
          } while (cursor.nextSibling());
        }

        // Alt text is typically between the first and second LinkMark
        // ![alt](url) - get alt from the content between ! and ]
        const fullText = state.doc.sliceString(from, to);
        const altMatch = /^!\[([^\]]*)\]/.exec(fullText);
        if (altMatch) {
          altText = altMatch[1];
        }

        if (urlValue) {
          addDeco(
            from,
            to,
            Decoration.replace({
              widget: new ImageWidget(urlValue, altText),
            }),
          );
        }
        return;
      }

      // --- Bullet list markers ---
      if (name === "ListMark") {
        const markText = state.doc.sliceString(from, to);
        if (markText === "-" || markText === "*" || markText === "+") {
          addDeco(
            from,
            to,
            Decoration.replace({
              widget: new BulletWidget(),
            }),
          );
        }
      }
    },
  });

  // Sort decorations by position (required by RangeSetBuilder)
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

  for (const { from, to, decoration } of decorations) {
    builder.add(from, to, decoration);
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// ViewPlugin
// ---------------------------------------------------------------------------

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.state);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const livePreviewDecorations = livePreviewPlugin;
