import { EditorView } from "@codemirror/view";

export const parchmentTheme = EditorView.theme({
  "&": {
    backgroundColor: "#f4f0e8",
    color: "#1a1f17",
    fontSize: "15px",
    fontFamily: "'Inter', system-ui, sans-serif",
    lineHeight: "1.8",
    height: "100%",
  },
  ".cm-scroller": {
    padding: "0 60px",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "32px 0",
    caretColor: "#2d6a4f",
    maxWidth: "720px",
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
    display: "none",
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
    borderTop: "1px solid #d6d0c3",
    display: "block",
    margin: "24px 0",
    width: "100%",
  },
});
