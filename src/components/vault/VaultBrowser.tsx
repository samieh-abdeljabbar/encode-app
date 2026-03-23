import { useEffect, useState } from "react";
import { useVaultStore } from "../../stores/vault";
import { writeFile, deleteFile } from "../../lib/tauri";

export default function VaultBrowser() {
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
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);

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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1z"/>
            <path d="M9 1v4h4"/>
          </svg>
        </button>
        <button
          onClick={() => setCreatingSubject(true)}
          title="New subject folder"
          className="p-1.5 text-text-muted hover:text-purple hover:bg-surface-2 rounded transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 3h4l2 2h6v8H2V3z"/>
            <path d="M8 7v4M6 9h4"/>
          </svg>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setExpandedSubject(null)}
          title="Collapse all folders"
          className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6l4-3 4 3M4 10l4 3 4-3"/>
          </svg>
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
            className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 rounded flex items-center justify-between"
          >
            <span
              className={
                expandedSubject === subject.slug
                  ? "text-text"
                  : "text-text-muted"
              }
            >
              {subject.name}
            </span>
            <span className="text-xs text-text-muted">
              {subject.chapter_count}ch
            </span>
          </button>

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
                  const typeIcon = typeFolder === "chapters" ? "B"
                    : typeFolder === "flashcards" ? "F"
                    : typeFolder === "quizzes" ? "Q"
                    : typeFolder === "teach-backs" ? "T"
                    : typeFolder === "maps" ? "M" : "";
                  const typeColor = typeFolder === "chapters" ? "text-purple bg-purple/15"
                    : typeFolder === "flashcards" ? "text-teal bg-teal/15"
                    : typeFolder === "quizzes" ? "text-amber bg-amber/15"
                    : "text-text-muted bg-surface-2";

                  return (
                  <div
                    key={file.file_path}
                    className="group flex items-center"
                  >
                    <button
                      onClick={() => selectFile(file.file_path)}
                      className={`flex-1 text-left px-2 py-1 text-xs rounded truncate flex items-center gap-1.5 ${
                        selectedFile === file.file_path
                          ? "bg-surface-2 text-purple"
                          : "text-text-muted hover:text-text hover:bg-surface-2"
                      }`}
                      title={file.file_path}
                    >
                      {typeIcon && (
                        <span className={`w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold shrink-0 ${typeColor}`}>
                          {typeIcon}
                        </span>
                      )}
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
    </div>
  );
}
