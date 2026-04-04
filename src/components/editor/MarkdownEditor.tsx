import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { LanguageDescription, bracketMatching } from "@codemirror/language";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { AskAiInlineForm } from "./AskAiInlineForm";
import { FlashcardInlineForm } from "./FlashcardInlineForm";
import { askAiExtension } from "./cm-ask-ai";
import type { AskAiHandler } from "./cm-ask-ai";
import { livePreviewDecorations } from "./cm-decorations";
import { markdownFoldService } from "./cm-fold";
import { imageDropHandler } from "./cm-images";
import { mathRendering } from "./cm-math";
import { slashCommands } from "./cm-slash";
import type { SlashActionHandler } from "./cm-slash";
import { tableKeymap, tableRendering } from "./cm-tables";
import { parchmentTheme } from "./cm-theme";

export function MarkdownEditor({
  value,
  onChange,
  onViewReady,
  subjectId,
  chapterId,
}: {
  value: string;
  onChange: (value: string) => void;
  onViewReady?: (view: EditorView) => void;
  subjectId?: number;
  chapterId?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onViewReadyRef = useRef(onViewReady);
  onChangeRef.current = onChange;
  onViewReadyRef.current = onViewReady;

  const [flashcardForm, setFlashcardForm] = useState<{
    top: number;
    left: number;
    insertPos: number;
  } | null>(null);

  const [askAiForm, setAskAiForm] = useState<{
    top: number;
    left: number;
    selectedText: string;
    insertPos: number;
  } | null>(null);

  const flashcardFormRef = useRef(flashcardForm);
  flashcardFormRef.current = flashcardForm;

  const handleSlashAction: SlashActionHandler = useCallback(
    (action, view, pos) => {
      if (action === "flashcard") {
        const coords = view.coordsAtPos(pos);
        if (coords) {
          setFlashcardForm({
            top: coords.bottom + 4,
            left: coords.left,
            insertPos: pos,
          });
        }
        return;
      }

      if (action === "ask-ai") {
        const coords = view.coordsAtPos(pos);
        const line = view.state.doc.lineAt(pos);
        const selectedText = view.state.sliceDoc(line.from, line.to).trim();
        if (coords && selectedText) {
          setAskAiForm({
            top: coords.bottom + 4,
            left: coords.left,
            selectedText,
            insertPos: pos,
          });
        }
      }
    },
    [],
  );

  const handleAskAi: AskAiHandler = useCallback((selectedText, coords) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    setAskAiForm({
      top: coords.top,
      left: coords.left,
      selectedText,
      insertPos: sel.to,
    });
  }, []);

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
        markdownFoldService,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...tableKeymap,
        ]),
        livePreviewDecorations,
        tableRendering,
        mathRendering,
        slashCommands(handleSlashAction),
        askAiExtension(handleAskAi),
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

  const handleFlashcardCreated = useCallback(
    (prompt: string, answer: string) => {
      const view = viewRef.current;
      const form = flashcardFormRef.current;
      if (view && form) {
        const text = `Q: ${prompt}\nA: ${answer}\n`;
        view.dispatch({
          changes: { from: form.insertPos, insert: text },
          selection: { anchor: form.insertPos + text.length },
        });
        view.focus();
      }
      setFlashcardForm(null);
    },
    [],
  );

  const handleAiInsertCallout = useCallback(
    (markdown: string) => {
      const view = viewRef.current;
      if (!view || !askAiForm) return;
      // Insert callout after the selection
      const insertAt = askAiForm.insertPos;
      const prefix =
        view.state.doc.lineAt(insertAt).to === insertAt ? "\n" : "\n\n";
      view.dispatch({
        changes: { from: insertAt, insert: prefix + markdown },
        selection: { anchor: insertAt + prefix.length + markdown.length },
      });
      view.focus();
      setAskAiForm(null);
    },
    [askAiForm],
  );

  return (
    <>
      <div ref={containerRef} className="h-full overflow-auto" />
      {flashcardForm && subjectId != null && chapterId != null && (
        <FlashcardInlineForm
          position={{ top: flashcardForm.top, left: flashcardForm.left }}
          subjectId={subjectId}
          chapterId={chapterId}
          onCreated={handleFlashcardCreated}
          onCancel={() => setFlashcardForm(null)}
        />
      )}
      {askAiForm && (
        <AskAiInlineForm
          position={{ top: askAiForm.top, left: askAiForm.left }}
          selectedText={askAiForm.selectedText}
          onInsertCallout={handleAiInsertCallout}
          onDismiss={() => setAskAiForm(null)}
        />
      )}
    </>
  );
}
