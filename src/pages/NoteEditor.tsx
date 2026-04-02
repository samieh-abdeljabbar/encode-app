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
import { Check, Pencil, Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parchmentTheme } from "../components/editor/cm-theme";
import { wikilinkExtension } from "../components/editor/cm-wikilink";
import { BacklinksPanel } from "../components/notes/BacklinksPanel";
import {
  deleteNote,
  getNote,
  getNoteTitles,
  renameNote,
  updateNote,
} from "../lib/tauri";
import type { NoteDetail } from "../lib/tauri";

interface NoteEditorProps {
  noteId: number;
  onNoteChanged?: () => void;
}

export function NoteEditor({ noteId, onNoteChanged }: NoteEditorProps) {
  const navigate = useNavigate();

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [backlinksPanelCollapsed, setBacklinksPanelCollapsed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  // Load note
  const loadNote = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNote(noteId);
      setNote(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    loadNote();
  }, [loadNote]);

  // Auto-save debounce
  const debouncedSave = useCallback(
    (content: string) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await updateNote(noteIdRef.current, content);
          onNoteChanged?.();
        } catch {
          // Silently fail - next save will retry
        } finally {
          setSaving(false);
        }
      }, 1000);
    },
    [onNoteChanged],
  );

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Track initial content to avoid re-creating editor
  const initialContentRef = useRef<string | null>(null);

  // Set initial content when note first loads
  useEffect(() => {
    if (note && initialContentRef.current === null) {
      initialContentRef.current = note.content;
    }
  }, [note]);

  // Initialize CodeMirror ONCE when initial content is ready
  useEffect(() => {
    if (!containerRef.current || initialContentRef.current === null) return;
    if (viewRef.current) return;

    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        parchmentTheme,
        wikilinkExtension(() => getNoteTitles()),
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
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            debouncedSave(update.state.doc.toString());
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

    return () => {
      view.destroy();
      viewRef.current = null;
      initialContentRef.current = null;
    };
  }, [note, debouncedSave]);

  const handleRename = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || !note || trimmed === note.info.title) {
      setEditingTitle(false);
      return;
    }
    try {
      const updated = await renameNote(noteId, trimmed);
      setNote((prev) => (prev ? { ...prev, info: updated } : prev));
      onNoteChanged?.();
    } catch (e) {
      setError(String(e));
    }
    setEditingTitle(false);
  };

  const handleDelete = async () => {
    try {
      await deleteNote(noteId);
      onNoteChanged?.();
      navigate("/notes");
    } catch (e) {
      setError(String(e));
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading note...</p>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-coral">{error ?? "Note not found"}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main editor area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-border-subtle/60 px-7 py-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  onBlur={handleRename}
                  autoFocus
                  className="h-9 w-full rounded-lg border border-accent/30 bg-surface px-3 text-base font-semibold text-text focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTitleDraft(note.info.title);
                    setEditingTitle(true);
                  }}
                  className="group flex items-center gap-2 text-left"
                >
                  <h1 className="truncate text-base font-semibold tracking-tight text-text">
                    {note.info.title}
                  </h1>
                  <Pencil
                    size={12}
                    className="shrink-0 text-text-muted/0 transition-colors group-hover:text-text-muted/60"
                  />
                </button>
              )}

              {/* Tags */}
              {note.info.tags.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5">
                  <Tag size={10} className="text-text-muted/40" />
                  {note.info.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-accent-soft/40 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Save indicator */}
            {saving && (
              <span className="text-[11px] text-text-muted/60">Saving...</span>
            )}
            {!saving && note && (
              <span className="flex items-center gap-1 text-[11px] text-teal/60">
                <Check size={10} />
                Saved
              </span>
            )}

            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete note"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-coral/8 hover:text-coral"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div ref={containerRef} className="flex-1 overflow-auto" />
      </div>

      {/* Backlinks panel */}
      <BacklinksPanel
        noteId={noteId}
        collapsed={backlinksPanelCollapsed}
        onToggle={() => setBacklinksPanelCollapsed((v) => !v)}
      />
    </div>
  );
}
