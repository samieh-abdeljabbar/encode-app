import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FilePlus, FolderPlus, ChevronsDownUp, ChevronRight, ChevronDown, FileText, BookOpen, Layers, Brain, Map, Pencil, Trash2 } from "lucide-react";
import { useVaultStore } from "../../stores/vault";
import { useQuizStore } from "../../stores/quiz";
import { writeFile, deleteFile, renameFile } from "../../lib/tauri";
import ContextMenu from "../shared/ContextMenu";

export default function VaultBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    subjects,
    files,
    loading,
    error,
    loadSubjects,
    loadFiles,
    selectFile,
    selectedFile,
    createSubject,
  } = useVaultStore();
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const handleFileClick = (path: string) => {
    selectFile(path);
    if (location.pathname !== "/vault") navigate("/vault");
  };
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; type: "file" | "subject" } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleContextMenu = (e: React.MouseEvent, path: string, type: "file" | "subject") => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, type });
  };

  const handleRename = async () => {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }
    const parts = renamingPath.split("/");
    parts[parts.length - 1] = renameValue.trim() + (renamingPath.endsWith(".md") && !renameValue.endsWith(".md") ? ".md" : "");
    const newPath = parts.join("/");
    try {
      await renameFile(renamingPath, newPath);
      loadSubjects();
      if (expandedSubject) loadFiles(expandedSubject);
    } catch (e) {
      console.error("Rename failed:", e);
    }
    setRenamingPath(null);
    setRenameValue("");
  };

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    if (confirmDeleteFile === null) return;
    const timer = setTimeout(() => setConfirmDeleteFile(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteFile]);

  const handleSubjectClick = (slug: string) => {
    if (expandedSubject === slug) {
      setExpandedSubject(null);
    } else {
      setExpandedSubject(slug);
      loadFiles(slug);
    }
    setCreatingFile(false);
  };

  const handleCreateSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    await createSubject(name);
    setNewSubjectName("");
    setCreatingSubject(false);
  };

  const handleCreateFile = async () => {
    const name = newFileName.trim();
    if (!name || !expandedSubject) return;

    const slug = name.replace(/\s+/g, "-").toLowerCase();
    const subjectName = subjects.find(
      (s) => s.slug === expandedSubject,
    )?.name;
    const now = new Date().toISOString().slice(0, 19);
    const content = `---\nsubject: ${subjectName ?? expandedSubject}\ntopic: ${name}\ntype: chapter\ncreated_at: ${now}\nstatus: unread\n---\n\n# ${name}\n\n`;
    const path = `subjects/${expandedSubject}/chapters/${slug}.md`;

    await writeFile(path, content);
    setNewFileName("");
    setCreatingFile(false);
    loadFiles(expandedSubject);
    selectFile(path);
  };

  const handleDeleteFile = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteFile !== filePath) {
      setConfirmDeleteFile(filePath);
      return;
    }
    setConfirmDeleteFile(null);
    try {
      await deleteFile(filePath);
      if (selectedFile === filePath) {
        selectFile(null);
      }
      if (expandedSubject) {
        loadFiles(expandedSubject);
        loadSubjects();
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  if (error) {
    return <p className="text-coral text-sm">{error}</p>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border mb-1">
        <button
          onClick={() => setCreatingFile(true)}
          title="New note"
          className="p-1.5 text-text-muted hover:text-purple hover:bg-surface-2 rounded transition-colors"
        >
          <FilePlus size={14} />
        </button>
        <button
          onClick={() => setCreatingSubject(true)}
          title="New subject folder"
          className="p-1.5 text-text-muted hover:text-purple hover:bg-surface-2 rounded transition-colors"
        >
          <FolderPlus size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setExpandedSubject(null)}
          title="Collapse all folders"
          className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors"
        >
          <ChevronsDownUp size={14} />
        </button>
      </div>

      {subjects.length === 0 && !loading && !creatingSubject && (
        <p className="text-text-muted text-sm">
          No subjects yet. Create one below.
        </p>
      )}

      {subjects.map((subject) => (
        <div key={subject.slug} className="mb-1">
          <button
            onClick={() => handleSubjectClick(subject.slug)}
            onContextMenu={(e) => handleContextMenu(e, `subjects/${subject.slug}`, "subject")}
            className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2 rounded flex items-center gap-1.5"
          >
            {expandedSubject === subject.slug ? (
              <ChevronDown size={14} className="text-text-muted shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-text-muted shrink-0" />
            )}
            <span
              className={`flex-1 truncate ${
                expandedSubject === subject.slug ? "text-text" : "text-text-muted"
              }`}
            >
              {subject.name}
            </span>
            <span className="text-[10px] text-text-muted shrink-0">
              {subject.chapter_count}
            </span>
          </button>

          {/* Subject actions */}
          {expandedSubject === subject.slug && (
            <div className="ml-6 mb-1 flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useQuizStore.getState().generateSubjectQuiz(subject.slug, subject.name);
                  navigate("/quiz");
                }}
                className="text-[10px] text-amber hover:text-text transition-colors"
              >
                Quiz All
              </button>
            </div>
          )}

          {expandedSubject === subject.slug && (
            <div className="ml-4 border-l border-border pl-2">
              {loading ? (
                <p className="text-xs text-text-muted py-1 px-2">Loading...</p>
              ) : files.length === 0 ? (
                <p className="text-xs text-text-muted py-1 px-2">No files</p>
              ) : (
                files.map((file) => {
                  // Determine file type from path
                  const pathParts = file.file_path.split("/");
                  const typeFolder = pathParts.find((p) =>
                    ["chapters", "flashcards", "quizzes", "teach-backs", "maps"].includes(p)
                  ) || "";
                  const TypeIcon = typeFolder === "chapters" ? BookOpen
                    : typeFolder === "flashcards" ? Layers
                    : typeFolder === "quizzes" ? Brain
                    : typeFolder === "teach-backs" ? FileText
                    : typeFolder === "maps" ? Map : FileText;
                  const typeColor = typeFolder === "chapters" ? "text-purple"
                    : typeFolder === "flashcards" ? "text-teal"
                    : typeFolder === "quizzes" ? "text-amber"
                    : "text-text-muted";

                  return (
                  <div
                    key={file.file_path}
                    className="group flex items-center"
                  >
                    <button
                      onClick={() => handleFileClick(file.file_path)}
                      onContextMenu={(e) => handleContextMenu(e, file.file_path, "file")}
                      className={`flex-1 text-left px-2 py-1 text-xs rounded truncate flex items-center gap-1.5 ${
                        selectedFile === file.file_path
                          ? "bg-surface-2 text-purple"
                          : "text-text-muted hover:text-text hover:bg-surface-2"
                      }`}
                      title={file.file_path}
                    >
                      <TypeIcon size={13} className={`shrink-0 ${typeColor}`} />
                      {file.file_path.split("/").pop()?.replace(".md", "") ??
                        file.file_path}
                    </button>
                    <button
                      onClick={(e) => handleDeleteFile(file.file_path, e)}
                      onBlur={() => setConfirmDeleteFile(null)}
                      className={`px-1 text-xs shrink-0 ${
                        confirmDeleteFile === file.file_path
                          ? "block text-coral"
                          : "hidden group-hover:block text-text-muted hover:text-coral"
                      }`}
                      title={
                        confirmDeleteFile === file.file_path
                          ? "Click again to confirm delete"
                          : "Delete file"
                      }
                    >
                      {confirmDeleteFile === file.file_path ? "?" : "\u00d7"}
                    </button>
                  </div>
                  );
                })
              )}

              {/* Create file */}
              {creatingFile ? (
                <input
                  type="text"
                  autoFocus
                  placeholder="File name..."
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFile();
                    if (e.key === "Escape") {
                      setCreatingFile(false);
                      setNewFileName("");
                    }
                  }}
                  onBlur={() => {
                    setCreatingFile(false);
                    setNewFileName("");
                  }}
                  className="w-full px-2 py-1 mt-1 text-xs bg-surface-2 border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
                />
              ) : (
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => setCreatingFile(true)}
                    className="text-[10px] text-purple hover:text-text transition-colors"
                  >
                    + Chapter
                  </button>
                  <span className="text-[10px] text-border">|</span>
                  <button
                    onClick={() => setCreatingFile(true)}
                    className="text-[10px] text-teal hover:text-text transition-colors"
                  >
                    + Card
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Create subject */}
      {creatingSubject ? (
        <input
          type="text"
          autoFocus
          placeholder="Subject name..."
          value={newSubjectName}
          onChange={(e) => setNewSubjectName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateSubject();
            if (e.key === "Escape") {
              setCreatingSubject(false);
              setNewSubjectName("");
            }
          }}
          onBlur={() => {
            setCreatingSubject(false);
            setNewSubjectName("");
          }}
          className="w-full px-3 py-2 mt-2 text-sm bg-surface-2 border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
        />
      ) : (
        <button
          onClick={() => setCreatingSubject(true)}
          className="w-full text-left px-3 py-2 mt-2 text-sm text-purple hover:text-text transition-colors"
        >
          + New Subject
        </button>
      )}
      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: "Rename",
              icon: <Pencil size={12} />,
              onClick: () => {
                const name = contextMenu.path.split("/").pop()?.replace(".md", "") || "";
                setRenamingPath(contextMenu.path);
                setRenameValue(name);
              },
            },
            ...(contextMenu.type === "file" ? [{
              label: "Open in Reader",
              icon: <BookOpen size={12} />,
              onClick: () => {
                selectFile(contextMenu.path);
                navigate("/reader");
              },
            }] : []),
            { label: "", onClick: () => {}, divider: true },
            {
              label: "Delete",
              icon: <Trash2 size={12} />,
              danger: true,
              onClick: async () => {
                if (contextMenu.type === "file") {
                  await deleteFile(contextMenu.path);
                  loadSubjects();
                  if (expandedSubject) loadFiles(expandedSubject);
                }
              },
            },
          ]}
        />
      )}

      {/* Rename dialog */}
      {renamingPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRenamingPath(null)}>
          <div className="bg-surface border border-border rounded-lg p-4 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-text-muted mb-2">Rename</p>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenamingPath(null); }}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRenamingPath(null)} className="px-3 py-1 text-xs text-text-muted hover:text-text">Cancel</button>
              <button onClick={handleRename} className="px-3 py-1 text-xs bg-purple text-white rounded hover:opacity-90">Rename</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
