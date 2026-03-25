import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Table } from "@lezer/markdown";
import { EditorView } from "@codemirror/view";
import { encodeTheme, encodeHighlighting } from "../../lib/cm-theme";
import { livePreviewPlugin, livePreviewStyles, tableDecoField, linkClickHandler } from "../../lib/cm-decorations";
import { slashMenuExtension } from "../../lib/cm-slash-menu";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  onEditorReady?: (view: EditorView) => void;
}

const extensions = [
  markdown({ extensions: [Table] }),
  encodeTheme,
  encodeHighlighting,
  livePreviewPlugin,
  livePreviewStyles,
  tableDecoField,
  linkClickHandler,
  EditorView.lineWrapping,
  ...slashMenuExtension,
];

export default function MarkdownEditor({
  value,
  onChange,
  onBlur,
  autoFocus = true,
  onEditorReady,
}: MarkdownEditorProps) {
  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  return (
    <div className="h-full overflow-auto" onBlur={onBlur}>
      {/* Force text color to match theme */}
      <style>{`
        .cm-editor .cm-content { color: var(--color-text) !important; }
        .cm-editor .cm-line { color: var(--color-text) !important; }
        .cm-editor .cm-content .cm-line span[class=""] { color: var(--color-text) !important; }
        .cm-editor .ͼ5 { color: var(--color-text) !important; }
        .cm-editor .ͼ6 { color: var(--color-text) !important; }
        .cm-editor .ͼ7 { color: var(--color-text) !important; }
        .cm-editor .ͼ1 { color: var(--color-text); }
        .cm-editor { background-color: var(--color-bg) !important; }
        .cm-editor .cm-gutters { background-color: var(--color-bg) !important; border-color: var(--color-border) !important; }
        .cm-editor .cm-activeLineGutter { background-color: var(--color-surface) !important; }
        .cm-editor .cm-activeLine { background-color: var(--color-surface) !important; }
        .cm-editor .cm-cursor { border-color: var(--color-text) !important; }
      `}</style>
      <CodeMirror
        value={value}
        onChange={handleChange}
        onCreateEditor={onEditorReady}
        extensions={extensions}
        autoFocus={autoFocus}
        theme="none"
        editable={true}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false, // we provide our own via slashMenuExtension
          indentOnInput: false,
        }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
