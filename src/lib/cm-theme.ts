import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Encode dark theme for CodeMirror 6 */
export const encodeTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0f0f0f",
      color: "#e5e5e5",
      fontFamily: "Georgia, Merriweather, serif",
      fontSize: "16px",
      lineHeight: "1.75",
    },
    ".cm-content": {
      caretColor: "#7F77DD",
      padding: "32px",
      maxWidth: "720px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#7F77DD",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgba(127, 119, 221, 0.2)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.02)",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
  },
  { dark: true },
);

/** Syntax highlighting for markdown in Encode's color palette */
export const encodeHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    // Headings — larger, bold, white
    {
      tag: tags.heading1,
      fontSize: "28px",
      fontWeight: "700",
      color: "#e5e5e5",
      lineHeight: "1.3",
    },
    {
      tag: tags.heading2,
      fontSize: "22px",
      fontWeight: "600",
      color: "#e5e5e5",
      lineHeight: "1.3",
    },
    {
      tag: tags.heading3,
      fontSize: "18px",
      fontWeight: "600",
      color: "#e5e5e5",
    },
    {
      tag: tags.heading4,
      fontSize: "15px",
      fontWeight: "600",
      color: "#888880",
      textTransform: "uppercase" as const,
    },
    {
      tag: tags.heading5,
      fontSize: "14px",
      fontWeight: "600",
      color: "#888880",
    },
    {
      tag: tags.heading6,
      fontSize: "13px",
      fontWeight: "600",
      color: "#888880",
    },
    // Heading markers (##) — dim
    { tag: tags.processingInstruction, color: "#333" },

    // Bold
    { tag: tags.strong, fontWeight: "600", color: "#e5e5e5" },

    // Italic
    { tag: tags.emphasis, fontStyle: "italic", color: "#ccc" },

    // Links
    { tag: tags.link, color: "#7F77DD", textDecoration: "none" },
    { tag: tags.url, color: "#888880", fontSize: "13px" },

    // Inline code
    {
      tag: tags.monospace,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: "13px",
      color: "#D85A30",
      backgroundColor: "#252525",
      borderRadius: "3px",
      padding: "1px 4px",
    },

    // Code block
    {
      tag: tags.content,
      color: "#e5e5e5",
    },

    // Quote / blockquote
    { tag: tags.quote, color: "#888880", fontStyle: "italic" },

    // List markers
    { tag: tags.list, color: "#888880" },

    // Horizontal rule
    { tag: tags.contentSeparator, color: "#333" },

    // HTML tags
    { tag: tags.angleBracket, color: "#888880" },
    { tag: tags.tagName, color: "#D85A30" },

    // Meta (frontmatter markers ---)
    { tag: tags.meta, color: "#333" },

    // Strikethrough
    { tag: tags.strikethrough, textDecoration: "line-through", color: "#888880" },
  ]),
);
