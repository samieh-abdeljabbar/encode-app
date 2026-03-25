import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FolderPlus, ChevronsDownUp, ChevronRight, ChevronDown, BookOpen, Layers, Brain, Pencil, Trash2 } from "lucide-react";
import { useVaultStore } from "../../stores/vault";
import { useQuizStore } from "../../stores/quiz";
import { writeFile, deleteFile, deleteSubject, renameFile, listFiles } from "../../lib/tauri";
import type { FileEntry } from "../../lib/types";
import ContextMenu from "../shared/ContextMenu";

/** Section inside a subject (Chapters, Flashcards, Quizzes) */
interface SubjectSection {
  key: string;
  label: string;
  icon: typeof BookOpen;
  color: string;
  fileType: string;
  files: FileEntry[];
}

export default function VaultBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    subjects,
    loading,
    error,
    loadSubjects,
    selectFile,
    selectedFile,
    createSubject,
  } = useVaultStore();

  // Multi-expand: Set of expanded subject slugs
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(() => new Set());
  // Per-subject section files
  const [subjectSections, setSubjectSections] = useState<globalThis.Map<string, SubjectSection[]>>(() => new globalThis.Map());
  // Collapsed sections within subjects (e.g. "d426-data-management:flashcards")
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());

  const handleFileClick = (path: string) => {
    selectFile(path);
    if (location.pathname !== "/vault") navigate("/vault");
  };

  const [creatingSubject, setCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [creatingFileIn, setCreatingFileIn] = useState<string | null>(null); // "slug:chapters"
  const [newFileName, setNewFileName] = useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);
  const [confirmDeleteSubject, setConfirmDeleteSubject] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; type: "file" | "subject"; slug?: string } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleContextMenu = (e: React.MouseEvent, path: string, type: "file" | "subject", slug?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, type, slug });
  };

  const handleRename = async () => {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }
    const parts = renamingPath.split("/");
    parts[parts.length - 1] = renameValue.trim() + (renamingPath.endsWith(".md") && !renameValue.endsWith(".md") ? ".md" : "");
    const newPath = parts.join("/");
    try {
      await renameFile(renamingPath, newPath);
      loadSubjects();
      // Reload sections for affected subjects
      for (const slug of expandedSubjects) {
        loadSections(slug);
      }
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

  useEffect(() => {
    if (confirmDeleteSubject === null) return;
    const timer = setTimeout(() => setConfirmDeleteSubject(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteSubject]);

  const loadSections = async (slug: string) => {
    const sections: SubjectSection[] = [
      { key: "chapters", label: "Chapters", icon: BookOpen, color: "text-purple", fileType: "chapters", files: [] },
      { key: "flashcards", label: "Flashcards", icon: Layers, color: "text-teal", fileType: "flashcards", files: [] },
      { key: "quizzes", label: "Quizzes", icon: Brain, color: "text-amber", fileType: "quizzes", files: [] },
    ];

    for (const section of sections) {
      try {
        section.files = await listFiles(slug, section.fileType);
      } catch { /* no files */ }
    }

    setSubjectSections((prev) => new globalThis.Map(prev).set(slug, sections));
  };

  const handleSubjectClick = (slug: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
        loadSections(slug);
      }
      return next;
    });
  };

  const handleCreateSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    await createSubject(name);
    setNewSubjectName("");
    setCreatingSubject(false);
  };

  const handleCreateFile = async (slug: string, fileType: string) => {
    const name = newFileName.trim();
    if (!name) return;

    const fileSlug = name.replace(/\s+/g, "-").toLowerCase();
    const subjectName = subjects.find((s) => s.slug === slug)?.name;
    const now = new Date().toISOString().slice(0, 19);

    const type = fileType === "flashcards" ? "flashcard" : fileType === "quizzes" ? "quiz" : "chapter";
    const content = `---\nsubject: ${subjectName ?? slug}\ntopic: ${name}\ntype: ${type}\ncreated_at: ${now}\nstatus: unread\n---\n\n# ${name}\n\n`;
    const path = `subjects/${slug}/${fileType}/${fileSlug}.md`;

    await writeFile(path, content);
    setNewFileName("");
    setCreatingFileIn(null);
    loadSections(slug);
    selectFile(path);
  };

  const handleDeleteFile = async (filePath: string, slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteFile !== filePath) {
      setConfirmDeleteFile(filePath);
      return;
    }
    setConfirmDeleteFile(null);
    try {
      await deleteFile(filePath);
      if (selectedFile === filePath) selectFile(null);
      loadSections(slug);
      loadSubjects();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleDeleteSubject = async (slug: string) => {
    if (confirmDeleteSubject !== slug) {
      setConfirmDeleteSubject(slug);
      return;
    }
    setConfirmDeleteSubject(null);
    try {
      await deleteSubject(slug);
      setExpandedSubjects((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
      selectFile(null);
      loadSubjects();
    } catch (err) {
      console.error("Delete subject failed:", err);
    }
  };

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (error) {
    return <p className="text-coral text-sm">{error}</p>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border mb-1">
        <button onClick={() => setCreatingSubject(true)} title="New subject folder"
          className="p-1.5 text-text-muted hover:text-purple hover:bg-surface-2 rounded transition-colors">
          <FolderPlus size={14} />
        </button>
        <div className="flex-1" />
        <button onClick={() => setExpandedSubjects(new Set())} title="Collapse all folders"
          className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors">
          <ChevronsDownUp size={14} />
        </button>
      </div>

      {subjects.length === 0 && !loading && !creatingSubject && (
        <p className="text-text-muted text-sm px-2">No subjects yet. Create one below.</p>
      )}

      {subjects.map((subject) => {
        const isExpanded = expandedSubjects.has(subject.slug);
        const sections = subjectSections.get(subject.slug) || [];

        return (
          <div key={subject.slug} className="mb-0.5">
            {/* Subject header */}
            <button
              onClick={() => handleSubjectClick(subject.slug)}
              onContextMenu={(e) => handleContextMenu(e, `subjects/${subject.slug}`, "subject", subject.slug)}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2 rounded flex items-center gap-1.5 group"
            >
              {isExpanded ? (
                <ChevronDown size={14} className="text-text-muted shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-text-muted shrink-0" />
              )}
              <span className={`flex-1 truncate ${isExpanded ? "text-text" : "text-text-muted"}`}>
                {subject.name}
              </span>
              <span className="text-[10px] text-text-muted shrink-0">{subject.chapter_count}</span>
            </button>

            {/* Expanded subject content */}
            {isExpanded && (
              <div className="ml-4 border-l border-border pl-1">
                {/* Quick actions */}
                <div className="flex items-center gap-2 px-2 py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      useQuizStore.getState().prepareSubjectQuiz(subject.slug, subject.name);
                      navigate("/quiz");
                    }}
                    className="text-[10px] text-amber hover:text-text transition-colors"
                  >
                    Quiz All
                  </button>
                  <button
                    onClick={() => handleDeleteSubject(subject.slug)}
                    className={`text-[10px] transition-colors ${
                      confirmDeleteSubject === subject.slug
                        ? "text-coral font-medium"
                        : "text-text-muted hover:text-coral"
                    }`}
                  >
                    {confirmDeleteSubject === subject.slug ? "Confirm Delete?" : "Delete Subject"}
                  </button>
                </div>

                {/* Sections: Chapters, Flashcards, Quizzes */}
                {sections.map((section) => {
                  const sectionKey = `${subject.slug}:${section.key}`;
                  const isCollapsed = collapsedSections.has(sectionKey);
                  const SectionIcon = section.icon;

                  return (
                    <div key={section.key} className="mb-0.5">
                      {/* Section header */}
                      <button
                        onClick={() => toggleSection(sectionKey)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-surface-2 rounded transition-colors"
                      >
                        {isCollapsed ? <ChevronRight size={11} className="text-text-muted" /> : <ChevronDown size={11} className="text-text-muted" />}
                        <SectionIcon size={12} className={section.color} />
                        <span className="text-text-muted">{section.label}</span>
                        <span className="text-[10px] text-text-muted ml-auto">{section.files.length}</span>
                      </button>

                      {/* Section files */}
                      {!isCollapsed && (
                        <div className="ml-4">
                          {section.files.length === 0 && (
                            <p className="text-[10px] text-text-muted px-2 py-0.5">Empty</p>
                          )}
                          {section.files.map((file) => (
                            <div key={file.file_path} className="group flex items-center">
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
                                {file.file_path.split("/").pop()?.replace(".md", "")}
                              </button>
                              <button
                                onClick={(e) => handleDeleteFile(file.file_path, subject.slug, e)}
                                onBlur={() => setConfirmDeleteFile(null)}
                                className={`px-1 text-xs shrink-0 ${
                                  confirmDeleteFile === file.file_path
                                    ? "block text-coral"
                                    : "hidden group-hover:block text-text-muted hover:text-coral"
                                }`}
                                title={confirmDeleteFile === file.file_path ? "Click again to confirm" : "Delete"}
                              >
                                {confirmDeleteFile === file.file_path ? "?" : "\u00d7"}
                              </button>
                            </div>
                          ))}

                          {/* Create file in section */}
                          {creatingFileIn === sectionKey ? (
                            <input
                              type="text" autoFocus placeholder={`New ${section.label.toLowerCase().slice(0, -1)}...`}
                              value={newFileName}
                              onChange={(e) => setNewFileName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateFile(subject.slug, section.fileType);
                                if (e.key === "Escape") { setCreatingFileIn(null); setNewFileName(""); }
                              }}
                              onBlur={() => { setCreatingFileIn(null); setNewFileName(""); }}
                              className="w-full px-2 py-1 mt-0.5 text-xs bg-surface-2 border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
                            />
                          ) : (
                            section.key === "chapters" && (
                              <button
                                onClick={() => setCreatingFileIn(sectionKey)}
                                className={`text-[10px] px-2 py-0.5 ${section.color} hover:text-text transition-colors`}
                              >
                                + {section.label.slice(0, -1)}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Create subject */}
      {creatingSubject ? (
        <input
          type="text" autoFocus placeholder="Subject name..."
          value={newSubjectName}
          onChange={(e) => setNewSubjectName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateSubject();
            if (e.key === "Escape") { setCreatingSubject(false); setNewSubjectName(""); }
          }}
          onBlur={() => { setCreatingSubject(false); setNewSubjectName(""); }}
          className="w-full px-3 py-2 mt-2 text-sm bg-surface-2 border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
        />
      ) : (
        <button onClick={() => setCreatingSubject(true)}
          className="w-full text-left px-3 py-2 mt-2 text-sm text-purple hover:text-text transition-colors">
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
              label: contextMenu.type === "subject" ? "Delete Subject" : "Delete",
              icon: <Trash2 size={12} />,
              danger: true,
              onClick: async () => {
                if (contextMenu.type === "subject" && contextMenu.slug) {
                  await deleteSubject(contextMenu.slug);
                  loadSubjects();
                } else if (contextMenu.type === "file") {
                  await deleteFile(contextMenu.path);
                  loadSubjects();
                  for (const slug of expandedSubjects) {
                    loadSections(slug);
                  }
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
            <input autoFocus type="text" value={renameValue}
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
