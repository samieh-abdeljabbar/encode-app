import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Encode dark theme for CodeMirror 6 */
export const encodeTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0f0f0f",
      fontFamily: "Georgia, Merriweather, serif",
      fontSize: "16px",
      lineHeight: "1.75",
    },
    ".cm-content": {
      caretColor: "#7F77DD",
      padding: "32px",
      maxWidth: "720px",
      color: "#e5e5e5",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#7F77DD",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgba(127, 119, 221, 0.2) !important",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.02)",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-line": {
      padding: "2px 0",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
  },
  { dark: true },
);

/**
 * Syntax highlighting that makes markdown look like rendered output.
 * Default text is bright (#e5e5e5). Only syntax markers and specific
 * elements get different colors.
 */
export const encodeHighlighting = syntaxHighlighting(
  HighlightStyle.define(
    [
      // Default — all text is bright
      { tag: tags.content, color: "#e5e5e5" },
      { tag: tags.name, color: "#e5e5e5" },

      // Headings — larger, bold
      { tag: tags.heading1, fontSize: "28px", fontWeight: "700", color: "#e5e5e5" },
      { tag: tags.heading2, fontSize: "22px", fontWeight: "600", color: "#e5e5e5" },
      { tag: tags.heading3, fontSize: "18px", fontWeight: "600", color: "#e5e5e5" },
      { tag: tags.heading4, fontSize: "15px", fontWeight: "600", color: "#e5e5e5" },
      { tag: tags.heading5, fontSize: "14px", fontWeight: "600", color: "#888880" },
      { tag: tags.heading6, fontSize: "13px", fontWeight: "600", color: "#888880" },

      // Heading markers ## — very dim (only visible when cursor is on line)
      { tag: tags.processingInstruction, color: "#444" },

      // Bold + Italic
      { tag: tags.strong, fontWeight: "600", color: "#e5e5e5" },
      { tag: tags.emphasis, fontStyle: "italic", color: "#e5e5e5" },

      // Links
      { tag: tags.link, color: "#7F77DD" },
      { tag: tags.url, color: "#666", fontSize: "13px" },

      // Inline code
      {
        tag: tags.monospace,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: "13px",
        color: "#D85A30",
      },

      // Quote
      { tag: tags.quote, color: "#aaa", fontStyle: "italic" },

      // List markers
      { tag: tags.list, color: "#888880" },

      // Separators (---)
      { tag: tags.contentSeparator, color: "#444" },

      // HTML
      { tag: tags.angleBracket, color: "#888880" },
      { tag: tags.tagName, color: "#D85A30" },

      // Meta (frontmatter markers)
      { tag: tags.meta, color: "#444" },

      // Strikethrough
      { tag: tags.strikethrough, textDecoration: "line-through", color: "#888880" },

      // Markup delimiters (**, *, [, ], etc.) — dim when visible
      { tag: tags.punctuation, color: "#555" },
    ],
    // This fallback ensures ANY token not explicitly styled gets bright text
    { themeType: "dark" },
  ),
);
