import { EditorView } from "@codemirror/view";

export const parchmentTheme = EditorView.theme({
  "&": {
    backgroundColor: "#faf8f3",
    color: "#1a1f17",
    fontSize: "14px",
    fontFamily: "'Inter', system-ui, sans-serif",
    lineHeight: "1.7",
  },
  ".cm-content": {
    padding: "24px 0",
    caretColor: "#2d6a4f",
  },
  ".cm-cursor": {
    borderLeftColor: "#2d6a4f",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#d8e2dc !important",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(45, 106, 79, 0.03)",
  },
  ".cm-gutters": {
    backgroundColor: "#faf8f3",
    color: "#6b7265",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(45, 106, 79, 0.05)",
    color: "#1a1f17",
  },
  // Markdown heading styles
  ".cm-heading-1": {
    fontSize: "1.5em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  ".cm-heading-2": {
    fontSize: "1.25em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  ".cm-heading-3": {
    fontSize: "1.1em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  // Code
  ".cm-code": {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: "0.9em",
    backgroundColor: "#f0ece3",
    padding: "1px 4px",
    borderRadius: "3px",
  },
  ".cm-fencedCode": {
    backgroundColor: "#f0ece3",
    padding: "12px",
    borderRadius: "8px",
  },
  // Blockquote
  ".cm-blockquote": {
    borderLeft: "3px solid #2d6a4f",
    paddingLeft: "12px",
    color: "#6b7265",
  },
  // Links
  ".cm-link": {
    color: "#2d6a4f",
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
    borderTop: "1px solid #c8c1b0",
    display: "block",
    margin: "16px 0",
  },
});
