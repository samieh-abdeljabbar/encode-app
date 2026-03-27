import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EditorView } from "@codemirror/view";
import { undo, redo, indentMore, indentLess } from "@codemirror/commands";
import SlashMenu from "../components/shared/SlashMenu";
import MarkdownEditor from "../components/shared/MarkdownEditor";
import EditorToolbar from "../components/shared/EditorToolbar";
import { useVaultStore } from "../stores/vault";
import { useQuizStore } from "../stores/quiz";
import { useTeachBackStore } from "../stores/teachback";
import { readFile, writeFile, deleteFile } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";
import { hasCompletedSynthesis } from "../lib/synthesis";
import { convertHtmlToMarkdown } from "../lib/cm-paste-handler";
import { MetaChip, PageHeader, PrimaryButton, SecondaryButton } from "../components/ui/primitives";
export default function VaultPage() {
  const navigate = useNavigate();
  const { selectedFile } = useVaultStore();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleInsert = useCallback((text: string) => {
    const view = cmViewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: text } });
    view.focus();
  }, []);

  const handleWrap = useCallback((before: string, after: string) => {
    const view = cmViewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    if (from < to) {
      const selected = view.state.sliceDoc(from, to);
      view.dispatch({ changes: { from, to, insert: before + selected + after } });
    } else {
      view.dispatch({ changes: { from, insert: before + after } });
      view.dispatch({ selection: { anchor: from + before.length } });
    }
    view.focus();
  }, []);

  const handleUndo = useCallback(() => {
    const view = cmViewRef.current;
    if (view) { undo(view); view.focus(); }
  }, []);

  const handleRedo = useCallback(() => {
    const view = cmViewRef.current;
    if (view) { redo(view); view.focus(); }
  }, []);

  const handleIndent = useCallback(() => {
    const view = cmViewRef.current;
    if (view) { indentMore(view); view.focus(); }
  }, []);

  const handleOutdent = useCallback(() => {
    const view = cmViewRef.current;
    if (view) { indentLess(view); view.focus(); }
  }, []);

  const handleClearFormatting = useCallback(() => {
    const view = cmViewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    if (from >= to) return;
    const selected = view.state.sliceDoc(from, to);
    const cleaned = selected
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/==(.+?)==/g, "$1")
      .replace(/`(.+?)`/g, "$1");
    view.dispatch({ changes: { from, to, insert: cleaned } });
    view.focus();
  }, []);

  // Load file content whenever selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      setSourceMode(false);
      return;
    }
    readFile(selectedFile)
      .then((content) => {
        setFileContent(content);
        // Immediately load content into editor (always editable)
        const { content: body } = parseFrontmatter(content);
        setEditContent(body);
        setSourceMode(false);
      })
      .catch(() => setFileContent(null));
  }, [selectedFile]);

  /** Reconstruct full file: original frontmatter + edited content */
  const reconstructFile = useCallback((editedContent: string): string => {
    if (!fileContent) return editedContent;
    const match = fileContent.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
    if (match) return match[1] + editedContent;
    return editedContent;
  }, [fileContent]);

  const handleToggleSource = async () => {
    if (!fileContent || !selectedFile) return;

    // Flush any pending autosave before switching modes
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
      const fullContent = sourceMode ? editContent : reconstructFile(editContent);
      try {
        await writeFile(selectedFile, fullContent);
        setFileContent(fullContent);
      } catch { /* continue with mode switch anyway */ }
    }

    if (sourceMode) {
      const latest = fileContent;
      const { content } = parseFrontmatter(latest);
      setEditContent(content);
      setSourceMode(false);
    } else {
      setEditContent(fileContent);
      setSourceMode(true);
    }
  };

  /** Autosave: debounced write on every content change */
  const autosave = useCallback((content: string) => {
    if (!selectedFile) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const fullContent = sourceMode ? content : reconstructFile(content);
      try {
        await writeFile(selectedFile, fullContent);
        setFileContent(fullContent);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (e) {
        console.error("Autosave failed:", e);
        // Re-sync fileContent from disk to prevent stale reconstructFile on next save
        try {
          const current = await readFile(selectedFile);
          setFileContent(current);
        } catch { /* file may have been deleted */ }
      }
    }, 1000);
  }, [selectedFile, sourceMode, reconstructFile]);

  const handleEditChange = (value: string) => {
    setEditContent(value);
    autosave(value);
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!selectedFile) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteFile(selectedFile);
      const store = useVaultStore.getState();
      // Extract subject slug to refresh file list
      const parts = selectedFile.split("/");
      store.selectFile(null);
      store.loadSubjects();
      if (parts.length >= 2) {
        store.loadFiles(parts[1]);
      }
      setFileContent(null);
      setConfirmDelete(false);
    } catch (e) {
      console.error("Delete failed:", e);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Content area — sidebar is handled by Shell/Sidebar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile && fileContent !== null ? (
          <>
            {(() => {
              const fm = parseFrontmatter(fileContent).frontmatter;
              const props = [
                fm.subject && { label: "Subject", value: fm.subject, variant: "accent" as const },
                fm.topic && { label: "Topic", value: fm.topic, variant: "accent" as const },
                fm.type && { label: "Type", value: fm.type, variant: fm.type === "flashcard" ? "success" as const : "default" as const },
                fm.status && { label: "Status", value: fm.status, variant: fm.status === "digested" ? "success" as const : "default" as const },
                fm.created_at && { label: "Created", value: String(fm.created_at).split("T")[0], variant: "default" as const },
              ].filter(Boolean) as { label: string; value: unknown; variant: "default" | "accent" | "success" }[];

              return (
                <PageHeader
                  title={selectedFile.split("/").pop()?.replace(".md", "")}
                  subtitle={saved ? "Saved" : selectedFile}
                  actions={
                    <>
                      <PrimaryButton onClick={() => navigate("/reader")} className="px-3 py-2 text-xs">Read</PrimaryButton>
                      {selectedFile.includes("/quizzes/") ? (
                        <SecondaryButton
                          onClick={() => {
                            useQuizStore.getState().retakeQuiz(selectedFile);
                            navigate("/quiz");
                          }}
                          className="px-3 py-2 text-xs"
                        >
                          Retake Quiz
                        </SecondaryButton>
                      ) : (
                        <SecondaryButton
                          onClick={() => {
                            if (!fileContent) return;
                            const { content, frontmatter: current } = parseFrontmatter(fileContent);
                            const isChapter = selectedFile.includes("/chapters/");
                            const quizReady = !isChapter || current.status === "digested" || hasCompletedSynthesis(fileContent);
                            if (!quizReady) {
                              navigate("/reader");
                              return;
                            }
                            useQuizStore.getState().generateQuiz(
                              String(current.subject ?? ""),
                              String(current.topic ?? ""),
                              content,
                              undefined,
                              selectedFile,
                            );
                            navigate("/quiz");
                          }}
                          className="px-3 py-2 text-xs"
                        >
                          {selectedFile.includes("/chapters/") && fm.status !== "digested" && !hasCompletedSynthesis(fileContent)
                            ? "Read to Unlock Quiz"
                            : "Quiz"}
                        </SecondaryButton>
                      )}
                      <SecondaryButton
                        onClick={() => {
                          if (!fileContent) return;
                          const current = parseFrontmatter(fileContent).frontmatter;
                          const isChapter = selectedFile.includes("/chapters/");
                          const teachReady = !isChapter || current.status === "digested" || hasCompletedSynthesis(fileContent);
                          if (!teachReady) {
                            navigate("/reader");
                            return;
                          }
                          useTeachBackStore.getState().startTeachBack(current.subject ?? "", current.topic ?? "", selectedFile);
                          navigate("/teach-back");
                        }}
                        className="px-3 py-2 text-xs"
                      >
                        {selectedFile.includes("/chapters/") && fm.status !== "digested" && !hasCompletedSynthesis(fileContent)
                          ? "Read to Unlock Teach"
                          : "Teach"}
                      </SecondaryButton>
                      <SecondaryButton onClick={handleToggleSource} className="px-3 py-2 text-xs">
                        {sourceMode ? "Editor" : "Source"}
                      </SecondaryButton>
                      <button
                        onClick={handleDelete}
                        onBlur={() => setConfirmDelete(false)}
                        className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                          confirmDelete
                            ? "border-coral bg-coral text-white"
                            : "border-border-strong bg-panel-alt text-text-muted hover:border-coral/50 hover:text-coral"
                        }`}
                      >
                        {confirmDelete ? "Confirm Delete" : "Delete"}
                      </button>
                    </>
                  }
                  meta={props.map((p) => (
                    <MetaChip key={p.label} variant={p.variant}>
                      <span className="text-text-muted">{p.label}</span>
                      <span>{String(p.value)}</span>
                    </MetaChip>
                  ))}
                />
              );
            })()}

            {/* Toolbar (CM6 mode only) */}
            {!sourceMode && (
              <EditorToolbar
                onInsert={handleInsert}
                onWrap={handleWrap}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onIndent={handleIndent}
                onOutdent={handleOutdent}
                onClearFormatting={handleClearFormatting}
              />
            )}

            {/* Content area */}
            <div className="flex-1 overflow-y-auto bg-panel">
              {sourceMode ? (
                <>
                  <textarea
                    ref={editorRef}
                    autoFocus
                    value={editContent}
                    onChange={(e) => handleEditChange(e.target.value)}
                    onPaste={(e) => {
                      const html = e.clipboardData.getData("text/html");
                      if (!html) return;
                      e.preventDefault();
                      const md = convertHtmlToMarkdown(html);
                      const ta = e.currentTarget;
                      const before = editContent.slice(0, ta.selectionStart);
                      const after = editContent.slice(ta.selectionEnd);
                      handleEditChange(before + md + after);
                    }}
                    className="app-font-mono w-full h-full bg-panel px-10 py-10 text-text text-sm leading-relaxed resize-none focus:outline-none"
                    spellCheck={false}
                  />
                  <SlashMenu
                    textarea={editorRef.current}
                    value={editContent}
                    onChange={handleEditChange}
                  />
                </>
              ) : (
                <MarkdownEditor
                  value={editContent}
                  onChange={handleEditChange}
                  onEditorReady={(view) => { cmViewRef.current = view; }}
                />
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center gap-4 border-t border-border-subtle bg-panel-alt px-8 py-2 text-[11px] text-text-muted shrink-0">
              {(() => {
                const fm = parseFrontmatter(fileContent).frontmatter;
                const words = parseFrontmatter(fileContent).content.trim().split(/\s+/).length;
                return (
                  <>
                    <span>{words} words</span>
                    {fm.type && <span className="capitalize">{String(fm.type)}</span>}
                    {fm.status && <span className="capitalize">{String(fm.status)}</span>}
                    <span className="flex-1" />
                    <span>{sourceMode ? "Source" : "Editor"}</span>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Select a file to preview</p>
          </div>
        )}
      </div>
      {/* Import dialog */}
      {/* Import dialog moved to Sidebar */}
    </div>
  );
}
