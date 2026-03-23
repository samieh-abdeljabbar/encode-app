import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { encodeTheme, encodeHighlighting } from "../../lib/cm-theme";
import { livePreviewPlugin, livePreviewStyles } from "../../lib/cm-decorations";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
}

const extensions = [
  markdown(),
  encodeTheme,
  encodeHighlighting,
  livePreviewPlugin,
  livePreviewStyles,
  EditorView.lineWrapping,
];

export default function MarkdownEditor({
  value,
  onChange,
  onBlur,
  autoFocus = true,
}: MarkdownEditorProps) {
  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  return (
    <div className="h-full overflow-auto" onBlur={onBlur}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        autoFocus={autoFocus}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false,
          indentOnInput: false,
        }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
