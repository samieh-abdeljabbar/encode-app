import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  LanguageDescription,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { livePreviewDecorations } from "./cm-decorations";
import { markdownFoldService } from "./cm-fold";
import { imageDropHandler } from "./cm-images";
import { mathRendering } from "./cm-math";
import { slashCommands } from "./cm-slash";
import { tableKeymap, tableRendering } from "./cm-tables";
import { parchmentTheme } from "./cm-theme";

export function MarkdownEditor({
  value,
  onChange,
  onViewReady,
}: {
  value: string;
  onChange: (value: string) => void;
  onViewReady?: (view: EditorView) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onViewReadyRef = useRef(onViewReady);
  onChangeRef.current = onChange;
  onViewReadyRef.current = onViewReady;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once — value used only for initial doc
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        parchmentTheme,
        markdown({
          base: markdownLanguage,
          codeLanguages: [
            LanguageDescription.of({
              name: "javascript",
              alias: ["js"],
              load: async () =>
                (await import("@codemirror/lang-javascript")).javascript(),
            }),
            LanguageDescription.of({
              name: "typescript",
              alias: ["ts"],
              load: async () =>
                (await import("@codemirror/lang-javascript")).javascript({
                  typescript: true,
                }),
            }),
            LanguageDescription.of({
              name: "python",
              alias: ["py"],
              load: async () =>
                (await import("@codemirror/lang-python")).python(),
            }),
            LanguageDescription.of({
              name: "html",
              load: async () => (await import("@codemirror/lang-html")).html(),
            }),
            LanguageDescription.of({
              name: "css",
              load: async () => (await import("@codemirror/lang-css")).css(),
            }),
            LanguageDescription.of({
              name: "json",
              load: async () => (await import("@codemirror/lang-json")).json(),
            }),
          ],
        }),
        history(),
        search(),
        highlightSelectionMatches(),
        bracketMatching(),
        foldGutter(),
        markdownFoldService,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
          ...tableKeymap,
        ]),
        livePreviewDecorations,
        tableRendering,
        mathRendering,
        slashCommands(),
        imageDropHandler,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    onViewReadyRef.current?.(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only mount once

  // Sync external value changes (e.g., after save confirmation)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full overflow-auto" />;
}
