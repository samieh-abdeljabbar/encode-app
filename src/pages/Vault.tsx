import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { useNavigate } from "react-router-dom";
import VaultBrowser from "../components/vault/VaultBrowser";
import ImportDialog from "../components/vault/ImportDialog";
import MarkdownRenderer from "../components/shared/MarkdownRenderer";
import SlashMenu from "../components/shared/SlashMenu";
import { useVaultStore } from "../stores/vault";
import { useQuizStore } from "../stores/quiz";
import { useTeachBackStore } from "../stores/teachback";
import { readFile, writeFile, deleteFile } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";

export default function VaultPage() {
  const navigate = useNavigate();
  const { searchQuery, searchResults, search, clearSearch, selectedFile } =
    useVaultStore();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "edit" | "source">("preview");
  const [editContent, setEditContent] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const editing = mode === "edit" || mode === "source";

  // Load file content whenever selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      setMode("preview");
      return;
    }
    readFile(selectedFile)
      .then((content) => {
        setFileContent(content);
        setMode("preview");
      })
      .catch(() => setFileContent(null));
  }, [selectedFile]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    if (query) {
      search(query);
    } else {
      clearSearch();
    }
  };

  const handleFileSelect = (path: string) => {
    useVaultStore.getState().selectFile(path);
  };

  /** Reconstruct full file: original frontmatter + edited content */
  const reconstructFile = useCallback((editedContent: string): string => {
    if (!fileContent) return editedContent;
    const match = fileContent.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
    if (match) return match[1] + editedContent;
    return editedContent;
  }, [fileContent]);

  const handleStartEdit = () => {
    if (fileContent) {
      const { content } = parseFrontmatter(fileContent);
      setEditContent(content);
      setMode("edit");
    }
  };

  const handleStartSource = () => {
    if (fileContent) {
      setEditContent(fileContent);
      setMode("source");
    }
  };

  const handleDone = () => {
    setMode("preview");
  };

  /** Autosave: debounced write on every content change */
  const autosave = useCallback((content: string) => {
    if (!selectedFile) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const fullContent = mode === "source" ? content : reconstructFile(content);
      try {
        await writeFile(selectedFile, fullContent);
        setFileContent(fullContent);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (e) {
        console.error("Autosave failed:", e);
      }
    }, 1000);
  }, [selectedFile, mode, reconstructFile]);

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
      {/* Left: browser + search */}
      <div className="w-[280px] border-r border-border p-4 overflow-y-auto shrink-0">
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Search vault..."
            value={searchQuery}
            onChange={handleSearch}
            className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
          />
          <button
            onClick={() => setShowImport(true)}
            title="Import from URL"
            className="px-3 py-2 bg-purple text-white rounded text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            +URL
          </button>
        </div>

        {searchQuery && searchResults.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-text-muted mb-2">
              {searchResults.length} results
            </p>
            {searchResults.map((r) => (
              <button
                key={r.file_path}
                onClick={() => handleFileSelect(r.file_path)}
                className="w-full text-left p-2 bg-surface rounded hover:bg-surface-2 text-xs"
              >
                <div className="text-text truncate">
                  {r.topic || r.file_path}
                </div>
                <div
                  className="text-text-muted mt-1"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.excerpt, { ALLOWED_TAGS: ["mark"] }) }}
                />
              </button>
            ))}
          </div>
        ) : (
          <VaultBrowser />
        )}
      </div>

      {/* Right: file preview / editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile && fileContent !== null ? (
          <>
            {/* Header bar */}
            <div className="flex items-center justify-between px-8 py-3 border-b border-border shrink-0">
              <h3 className="text-lg font-semibold truncate">
                {selectedFile.split("/").pop()?.replace(".md", "")}
              </h3>
              <div className="flex gap-2 shrink-0 items-center">
                {saved && <span className="text-xs text-teal">Saved</span>}
                {editing ? (
                  <>
                    <button
                      onClick={handleDone}
                      className="px-3 py-1 text-xs bg-teal text-white rounded hover:opacity-90 transition-opacity"
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <>
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
                        useQuizStore.getState().generateQuiz(
                          fm.subject ?? "", fm.topic ?? "", content,
                        );
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
                        useTeachBackStore.getState().startTeachBack(
                          fm.subject ?? "", fm.topic ?? "",
                        );
                        navigate("/teach-back");
                      }}
                      className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-text hover:border-purple transition-colors"
                    >
                      Teach
                    </button>
                    <button
                      onClick={handleStartEdit}
                      className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-text hover:border-purple transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleStartSource}
                      className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-text hover:border-purple transition-colors"
                    >
                      Source
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
                  </>
                )}
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
              {mode === "source" ? (
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
              ) : mode === "edit" ? (
                <>
                  <textarea
                    ref={editorRef}
                    autoFocus
                    value={editContent}
                    onChange={(e) => handleEditChange(e.target.value)}
                    className="w-full h-full p-8 bg-bg text-text text-base resize-none focus:outline-none"
                    style={{ fontFamily: "Georgia, Merriweather, serif", lineHeight: "1.75" }}
                    spellCheck={false}
                  />
                  <SlashMenu
                    textarea={editorRef.current}
                    value={editContent}
                    onChange={handleEditChange}
                  />
                </>
              ) : (
                <div
                  className="p-8 min-h-full"
                >
                  <MarkdownRenderer
                    content={parseFrontmatter(fileContent).content}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Select a file to preview</p>
          </div>
        )}
      </div>
      {/* Import dialog */}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={(filePath) => {
            setShowImport(false);
            const store = useVaultStore.getState();
            store.selectFile(filePath);
            store.loadSubjects();
            // Extract subject slug from path to refresh file list
            const parts = filePath.split("/");
            if (parts.length >= 2) {
              store.loadFiles(parts[1]); // subjects/{slug}/...
            }
          }}
        />
      )}
    </div>
  );
}
