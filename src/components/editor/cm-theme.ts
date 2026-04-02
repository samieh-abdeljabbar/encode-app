import { EditorView } from "@codemirror/view";

export const parchmentTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-bg, #f4f0e8)",
    color: "var(--color-text, #1a1f17)",
    fontSize: "15px",
    fontFamily: "'Inter', system-ui, sans-serif",
    lineHeight: "1.8",
    height: "100%",
  },
  ".cm-scroller": {
    padding: "0 48px",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "32px 0",
    caretColor: "var(--color-accent, #2d6a4f)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--color-accent, #2d6a4f)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--color-accent-soft, #d8e2dc) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(45, 106, 79, 0.03)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-bg, #f4f0e8)",
    border: "none",
    width: "24px",
  },
  ".cm-gutter-lint, .cm-lineNumbers": {
    display: "none",
  },
  ".cm-foldGutter": {
    width: "16px",
  },
  ".cm-foldGutter .cm-gutterElement": {
    padding: "0 2px",
    cursor: "pointer",
    color: "var(--color-text-muted, #6b7265)",
    fontSize: "12px",
  },
  // Markdown heading styles
  ".cm-heading-1": {
    fontSize: "1.8em",
    fontWeight: "700",
    lineHeight: "1.3",
    marginTop: "0.5em",
  },
  ".cm-heading-2": {
    fontSize: "1.4em",
    fontWeight: "600",
    lineHeight: "1.3",
    marginTop: "0.4em",
  },
  ".cm-heading-3": {
    fontSize: "1.15em",
    fontWeight: "600",
    lineHeight: "1.3",
    marginTop: "0.3em",
  },
  // Code
  ".cm-code": {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: "0.9em",
    backgroundColor: "var(--color-panel-alt, #f0ece3)",
    padding: "1px 4px",
    borderRadius: "3px",
  },
  ".cm-fencedCode": {
    backgroundColor: "var(--color-panel-alt, #f0ece3)",
    padding: "12px",
    borderRadius: "8px",
  },
  // Blockquote
  ".cm-blockquote": {
    borderLeft: "3px solid var(--color-accent, #2d6a4f)",
    paddingLeft: "12px",
    color: "var(--color-text-muted, #6b7265)",
  },
  // Links
  ".cm-link": {
    color: "var(--color-accent, #2d6a4f)",
    textDecoration: "underline",
  },
  // Bold/italic
  ".cm-strong": {
    fontWeight: "600",
  },
  ".cm-emphasis": {
    fontStyle: "italic",
  },
  // Table
  ".cm-table": {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: "0.9em",
  },
  // Image
  ".cm-image-widget img": {
    maxWidth: "100%",
    borderRadius: "8px",
    margin: "8px 0",
  },
  // Horizontal rule
  ".cm-hr": {
    borderTop: "1px solid var(--color-border-subtle, #d6d0c3)",
    display: "block",
    margin: "24px 0",
    width: "100%",
  },
  // Hide markdown syntax markers for live-preview feel
  ".cm-formatting-header, .cm-formatting-strong, .cm-formatting-em, .cm-formatting-strikethrough, .cm-formatting-code, .cm-formatting-link, .cm-formatting-image":
    {
      color: "var(--color-text-muted, #6b7265)",
      opacity: "0.3",
      fontSize: "0.85em",
    },
  // Strikethrough
  ".cm-strikethrough": {
    textDecoration: "line-through",
    color: "var(--color-text-muted, #6b7265)",
  },
  // Task checkbox
  ".cm-task-checkbox": {
    cursor: "pointer",
    verticalAlign: "middle",
    width: "16px",
    height: "16px",
    accentColor: "var(--color-accent, #2d6a4f)",
  },
  // Callout blocks
  ".cm-callout": {
    borderLeft: "3px solid",
    paddingLeft: "12px",
    borderRadius: "4px",
    padding: "8px 12px",
    marginBottom: "8px",
  },
  ".cm-callout-note, .cm-callout-info": {
    borderColor: "#4a90d9",
    backgroundColor: "rgba(74, 144, 217, 0.06)",
  },
  ".cm-callout-warning": {
    borderColor: "#d4a32a",
    backgroundColor: "rgba(212, 163, 42, 0.06)",
  },
  ".cm-callout-tip": {
    borderColor: "#2d6a4f",
    backgroundColor: "rgba(45, 106, 79, 0.06)",
  },
  ".cm-callout-example": {
    borderColor: "#7c3aed",
    backgroundColor: "rgba(124, 58, 237, 0.06)",
  },
  ".cm-callout-danger": {
    borderColor: "#b85c3a",
    backgroundColor: "rgba(184, 92, 58, 0.06)",
  },
});
