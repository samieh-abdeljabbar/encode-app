import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Encode theme for CodeMirror 6 — uses CSS variables for theme compatibility */
export const encodeTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      fontFamily: "var(--editor-font-family, Georgia, Merriweather, serif)",
      fontSize: "var(--editor-font-size, 16px)",
      lineHeight: "1.75",
    },
    ".cm-content": {
      caretColor: "var(--color-accent)",
      padding: "40px",
      maxWidth: "var(--editor-max-width, 800px)",
      color: "var(--color-text)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-accent)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--color-accent) 22%, transparent) !important",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--color-panel-active) 72%, transparent)",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-line": {
      padding: "3px 0",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
  },
  { dark: true },
);

/**
 * Syntax highlighting — uses CSS variables so it adapts to themes.
 * Note: HighlightStyle doesn't support var() in color fields,
 * so we use a mix of var() where possible and inherit for the rest.
 */
export const encodeHighlighting = syntaxHighlighting(
  HighlightStyle.define(
    [
      // Default — inherit text color from editor
      { tag: tags.content, color: "inherit" },
      { tag: tags.name, color: "inherit" },

      // Headings — larger, bold, inherit color
      { tag: tags.heading1, fontSize: "28px", fontWeight: "700", color: "inherit" },
      { tag: tags.heading2, fontSize: "22px", fontWeight: "600", color: "inherit" },
      { tag: tags.heading3, fontSize: "18px", fontWeight: "600", color: "inherit" },
      { tag: tags.heading4, fontSize: "15px", fontWeight: "600", color: "inherit" },
      { tag: tags.heading5, fontSize: "14px", fontWeight: "600" },
      { tag: tags.heading6, fontSize: "13px", fontWeight: "600" },

      // Heading markers ## — very dim
      { tag: tags.processingInstruction, color: "var(--color-text-muted)" },

      // Bold + Italic
      { tag: tags.strong, fontWeight: "600", color: "inherit" },
      { tag: tags.emphasis, fontStyle: "italic", color: "inherit" },

      // Links
      { tag: tags.link, color: "var(--color-accent)" },
      { tag: tags.url, fontSize: "13px" },

      // Inline code
      {
        tag: tags.monospace,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: "13px",
        color: "var(--color-coral)",
      },

      // Quote
      { tag: tags.quote, fontStyle: "italic" },

      // List markers
      { tag: tags.list },

      // Separators (---)
      { tag: tags.contentSeparator },

      // HTML
      { tag: tags.tagName, color: "var(--color-coral)" },

      // Meta (frontmatter markers)
      { tag: tags.meta },

      // Strikethrough
      { tag: tags.strikethrough, textDecoration: "line-through" },

      // Markup delimiters
      { tag: tags.punctuation },
    ],
    { themeType: "dark" },
  ),
);
