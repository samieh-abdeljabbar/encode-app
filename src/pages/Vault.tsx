import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SlashMenu from "../components/shared/SlashMenu";
import MarkdownEditor from "../components/shared/MarkdownEditor";
import { useVaultStore } from "../stores/vault";
import { useQuizStore } from "../stores/quiz";
import { useTeachBackStore } from "../stores/teachback";
import { readFile, writeFile, deleteFile } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";
export default function VaultPage() {
  const navigate = useNavigate();
  const { selectedFile } = useVaultStore();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  const handleToggleSource = () => {
    if (fileContent) {
      if (sourceMode) {
        // Switching from source to editor — parse out frontmatter
        const { content } = parseFrontmatter(fileContent);
        setEditContent(content);
        setSourceMode(false);
      } else {
        // Switching to source — show full raw content
        setEditContent(fileContent);
        setSourceMode(true);
      }
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
            {/* Header bar */}
            <div className="flex items-center justify-between px-8 py-3 border-b border-border shrink-0">
              <h3 className="text-lg font-semibold truncate">
                {selectedFile.split("/").pop()?.replace(".md", "")}
              </h3>
              <div className="flex gap-2 shrink-0 items-center">
                {saved && <span className="text-xs text-teal mr-1">Saved</span>}

                {/* Action buttons */}
                <button
                  onClick={() => navigate("/reader")}
                  className="px-3 py-1 text-xs bg-purple text-white rounded hover:opacity-90 transition-opacity"
                >
                  Read
                </button>
                <button
                  onClick={() => {
                    if (!fileContent) return;
                    const { content } = parseFrontmatter(fileContent);
                    const fm = parseFrontmatter(fileContent).frontmatter;
                    useQuizStore.getState().generateQuiz(fm.subject ?? "", fm.topic ?? "", content);
                    navigate("/quiz");
                  }}
                  className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-text hover:border-purple transition-colors"
                >
                  Quiz
                </button>
                <button
                  onClick={() => {
                    if (!fileContent) return;
                    const fm = parseFrontmatter(fileContent).frontmatter;
                    useTeachBackStore.getState().startTeachBack(fm.subject ?? "", fm.topic ?? "");
                    navigate("/teach-back");
                  }}
                  className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-text hover:border-purple transition-colors"
                >
                  Teach
                </button>

                {/* Divider */}
                <span className="w-px h-4 bg-border" />

                {/* Source toggle */}
                <button
                  onClick={handleToggleSource}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    sourceMode
                      ? "bg-surface-2 text-text border-purple"
                      : "text-text-muted border-border hover:text-text hover:border-purple"
                  }`}
                >
                  {sourceMode ? "Editor" : "Source"}
                </button>

                <button
                  onClick={handleDelete}
                  onBlur={() => setConfirmDelete(false)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    confirmDelete
                      ? "bg-coral text-white"
                      : "text-text-muted border border-border hover:text-coral hover:border-coral"
                  }`}
                >
                  {confirmDelete ? "Confirm?" : "Delete"}
                </button>
              </div>
            </div>

            {/* Properties panel */}
            {(() => {
              const fm = parseFrontmatter(fileContent).frontmatter;
              const props = [
                fm.subject && { label: "Subject", value: fm.subject, color: "purple" },
                fm.topic && { label: "Topic", value: fm.topic, color: "purple" },
                fm.type && { label: "Type", value: fm.type, color: fm.type === "chapter" ? "purple" : fm.type === "flashcard" ? "teal" : "amber" },
                fm.status && { label: "Status", value: fm.status, color: fm.status === "digested" ? "teal" : "text-muted" },
                fm.created_at && { label: "Created", value: String(fm.created_at).split("T")[0], color: "text-muted" },
              ].filter(Boolean) as { label: string; value: unknown; color: string }[];
              if (props.length === 0) return null;
              return (
                <div className="px-8 py-2 border-b border-border bg-surface flex flex-wrap gap-3 shrink-0">
                  {props.map((p) => (
                    <span key={p.label} className="text-xs">
                      <span className="text-text-muted">{p.label}: </span>
                      <span className={`text-${p.color}`}>{String(p.value)}</span>
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Content area */}
            <div className="flex-1 overflow-y-auto">
              {sourceMode ? (
                <>
                  <textarea
                    ref={editorRef}
                    autoFocus
                    value={editContent}
                    onChange={(e) => handleEditChange(e.target.value)}
                    className="w-full h-full p-8 bg-bg text-text text-sm font-mono leading-relaxed resize-none focus:outline-none"
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
                />
              )}
            </div>

            {/* Status bar */}
            <div className="px-8 py-1.5 border-t border-border bg-surface flex items-center gap-4 text-[10px] text-text-muted shrink-0">
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
