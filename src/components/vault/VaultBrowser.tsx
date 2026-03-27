import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FolderPlus, ChevronsDownUp, ChevronRight, ChevronDown, BookOpen, Layers, Brain, Pencil, Trash2, FilePlus, FolderPlus as FolderPlusIcon, Smile } from "lucide-react";
import { useVaultStore } from "../../stores/vault";
import { useQuizStore } from "../../stores/quiz";
import { writeFile, deleteFile, deleteSubject, renameFile, renameDirectory, listFiles, readFile, createDirectory, deleteDirectory } from "../../lib/tauri";
import type { FileEntry } from "../../lib/types";
import { localDateTimeString } from "../../lib/dates";
import ContextMenu from "../shared/ContextMenu";
import { buildTree, type TreeNode } from "../../lib/file-tree";
import CreateSubjectWizard from "./CreateSubjectWizard";

/** Section inside a subject */
interface SubjectSection {
  key: string;
  label: string;
  icon: typeof BookOpen;
  color: string;
  fileType: string;
  files: FileEntry[];
}

const EMOJI_GRID = ["📚", "📖", "🧪", "💡", "🔬", "📊", "🎯", "⚡", "🧠", "📝", "🗂️", "📁", "🏗️", "🔧", "🎨", "🌐", "💻", "🔢", "📐", "🧩"];

/** Emoji Picker popup */
function EmojiPicker({ x, y, onSelect, onClose }: { x: number; y: number; onSelect: (emoji: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute bg-surface border border-border rounded-lg p-2 shadow-2xl"
        style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 160) }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] text-text-muted mb-1 px-1">Pick an icon</p>
        <div className="grid grid-cols-5 gap-1">
          {EMOJI_GRID.map((emoji) => (
            <button key={emoji} onClick={() => onSelect(emoji)}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-2 text-sm transition-colors">
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function VaultBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const { subjects, loading, error, loadSubjects, selectFile, selectedFile } = useVaultStore();

  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(() => new Set());
  const [subjectSections, setSubjectSections] = useState<globalThis.Map<string, SubjectSection[]>>(() => new globalThis.Map());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [folderIcons, setFolderIcons] = useState<Record<string, Record<string, string>>>({});

  const [creatingSubject, setCreatingSubject] = useState(false);
  // newSubjectName removed — wizard handles subject creation
  const [creatingIn, setCreatingIn] = useState<{ path: string; type: "file" | "folder" } | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);
  const [confirmDeleteSubject, setConfirmDeleteSubject] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; path: string;
    type: "file" | "subject" | "folder" | "section";
    slug?: string; sectionKey?: string;
  } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [emojiPicker, setEmojiPicker] = useState<{ x: number; y: number; folderPath: string; slug: string } | null>(null);

  const handleFileClick = (path: string) => {
    selectFile(path);
    if (location.pathname !== "/vault") navigate("/vault");
  };

  useEffect(() => { loadSubjects(); }, [loadSubjects]);

  useEffect(() => {
    if (confirmDeleteFile === null) return;
    const t = setTimeout(() => setConfirmDeleteFile(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteFile]);

  useEffect(() => {
    if (confirmDeleteSubject === null) return;
    const t = setTimeout(() => setConfirmDeleteSubject(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteSubject]);

  const loadSections = useCallback(async (slug: string) => {
    const sections: SubjectSection[] = [
      { key: "chapters", label: "Chapters", icon: BookOpen, color: "text-purple", fileType: "chapters", files: [] },
      { key: "flashcards", label: "Flashcards", icon: Layers, color: "text-teal", fileType: "flashcards", files: [] },
      { key: "quizzes", label: "Quizzes", icon: Brain, color: "text-amber", fileType: "quizzes", files: [] },
    ];
    for (const section of sections) {
      try { section.files = await listFiles(slug, section.fileType); } catch { /* */ }
    }
    setSubjectSections((prev) => new globalThis.Map(prev).set(slug, sections));

    // Load folder icons
    try {
      const raw = await readFile(`subjects/${slug}/.folder-icons.json`);
      const icons = JSON.parse(raw) as Record<string, string>;
      setFolderIcons((prev) => ({ ...prev, [slug]: icons }));
    } catch {
      // No icons file yet
    }
  }, []);

  const saveFolderIcon = async (slug: string, folderKey: string, emoji: string | null) => {
    const current = { ...(folderIcons[slug] || {}) };
    if (emoji) current[folderKey] = emoji;
    else delete current[folderKey];
    setFolderIcons((prev) => ({ ...prev, [slug]: current }));
    await writeFile(`subjects/${slug}/.folder-icons.json`, JSON.stringify(current, null, 2));
  };

  const handleSubjectClick = (slug: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else { next.add(slug); loadSections(slug); }
      return next;
    });
  };

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  // Subject creation is now handled by CreateSubjectWizard

  const handleCreateItem = async () => {
    if (!creatingIn || !newItemName.trim()) { setCreatingIn(null); return; }
    const name = newItemName.trim();
    if (creatingIn.type === "folder") {
      const folderSlug = name.replace(/\s+/g, "-").toLowerCase();
      await createDirectory(`${creatingIn.path}/${folderSlug}`);
    } else {
      const fileSlug = name.replace(/\s+/g, "-").toLowerCase();
      const path = `${creatingIn.path}/${fileSlug}.md`;
      // Detect subject and type from path
      const parts = creatingIn.path.split("/");
      const slug = parts[1] || "";
      const subjectName = subjects.find((s) => s.slug === slug)?.name || slug;
      const sectionType = parts[2] || "chapters";
      const type = sectionType === "flashcards" ? "flashcard" : sectionType === "quizzes" ? "quiz" : "chapter";
      const now = localDateTimeString();
      const content = `---\nsubject: ${subjectName}\ntopic: ${name}\ntype: ${type}\ncreated_at: ${now}\nstatus: unread\n---\n\n# ${name}\n\n`;
      await writeFile(path, content);
      selectFile(path);
    }
    setNewItemName(""); setCreatingIn(null);
    // Reload affected subject
    const slug = creatingIn.path.split("/")[1];
    if (slug) loadSections(slug);
    loadSubjects();
  };

  const handleDeleteFile = async (filePath: string, slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteFile !== filePath) { setConfirmDeleteFile(filePath); return; }
    setConfirmDeleteFile(null);
    try {
      await deleteFile(filePath);
      if (selectedFile === filePath) selectFile(null);
      loadSections(slug); loadSubjects();
    } catch { /* */ }
  };

  const handleDeleteSubject = async (slug: string) => {
    if (confirmDeleteSubject !== slug) { setConfirmDeleteSubject(slug); return; }
    setConfirmDeleteSubject(null);
    try {
      await deleteSubject(slug);
      setExpandedSubjects((prev) => { const n = new Set(prev); n.delete(slug); return n; });
      selectFile(null); loadSubjects();
    } catch { /* */ }
  };

  const handleRename = async () => {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }
    const parts = renamingPath.split("/");
    const isDir = !renamingPath.endsWith(".md");
    parts[parts.length - 1] = renameValue.trim() + (!isDir && !renameValue.endsWith(".md") ? ".md" : "");
    const newPath = parts.join("/");
    try {
      if (isDir) await renameDirectory(renamingPath, newPath);
      else await renameFile(renamingPath, newPath);
      loadSubjects();
      for (const slug of expandedSubjects) loadSections(slug);
    } catch { /* */ }
    setRenamingPath(null); setRenameValue("");
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, type: "file" | "subject" | "folder" | "section", slug?: string, sectionKey?: string) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, type, slug, sectionKey });
  };

  // Build context menu items based on type
  const contextMenuItems = () => {
    if (!contextMenu) return [];
    const cm = contextMenu;
    const slug = cm.slug || cm.path.split("/")[1] || "";

    if (cm.type === "section") {
      return [
        { label: "New File", icon: <FilePlus size={12} />, onClick: () => setCreatingIn({ path: cm.path, type: "file" }) },
        { label: "New Folder", icon: <FolderPlusIcon size={12} />, onClick: () => setCreatingIn({ path: cm.path, type: "folder" }) },
      ];
    }

    if (cm.type === "folder") {
      return [
        { label: "New File", icon: <FilePlus size={12} />, onClick: () => setCreatingIn({ path: cm.path, type: "file" }) },
        { label: "New Subfolder", icon: <FolderPlusIcon size={12} />, onClick: () => setCreatingIn({ path: cm.path, type: "folder" }) },
        { label: "", onClick: () => {}, divider: true },
        { label: "Set Icon", icon: <Smile size={12} />, onClick: () => setEmojiPicker({ x: cm.x, y: cm.y, folderPath: cm.path, slug }) },
        { label: "Rename", icon: <Pencil size={12} />, onClick: () => {
          setRenamingPath(cm.path);
          setRenameValue(cm.path.split("/").pop() || "");
        }},
        { label: "", onClick: () => {}, divider: true },
        { label: "Delete Folder", icon: <Trash2 size={12} />, danger: true, onClick: async () => {
          try { await deleteDirectory(cm.path); loadSections(slug); loadSubjects(); } catch { /* */ }
        }},
      ];
    }

    if (cm.type === "file") {
      return [
        { label: "Open in Reader", icon: <BookOpen size={12} />, onClick: () => { selectFile(cm.path); navigate("/reader"); } },
        { label: "Rename", icon: <Pencil size={12} />, onClick: () => {
          setRenamingPath(cm.path);
          setRenameValue(cm.path.split("/").pop()?.replace(".md", "") || "");
        }},
        { label: "", onClick: () => {}, divider: true },
        { label: "Delete", icon: <Trash2 size={12} />, danger: true, onClick: async () => {
          await deleteFile(cm.path); loadSubjects();
          for (const s of expandedSubjects) loadSections(s);
        }},
      ];
    }

    // subject
    return [
      { label: "Rename", icon: <Pencil size={12} />, onClick: () => {
        setRenamingPath(cm.path);
        setRenameValue(cm.path.split("/").pop() || "");
      }},
      { label: "", onClick: () => {}, divider: true },
      { label: "Delete Subject", icon: <Trash2 size={12} />, danger: true, onClick: async () => {
        if (cm.slug) { await deleteSubject(cm.slug); loadSubjects(); }
      }},
    ];
  };

  // ─── Recursive tree renderer ────────────────────────────
  const renderTree = (nodes: TreeNode[], slug: string, depth: number) => {
    return nodes.map((node) => {
      if (node.isFolder) {
        const isOpen = expandedFolders.has(node.path);
        return (
          <div key={node.path}>
            <button
              onClick={() => toggleFolder(node.path)}
              onContextMenu={(e) => handleContextMenu(e, node.path, "folder", slug)}
              className="w-full flex items-center gap-1 px-2 py-1 text-xs hover:bg-surface-2 rounded transition-colors group"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {isOpen ? <ChevronDown size={10} className="text-text-muted shrink-0" /> : <ChevronRight size={10} className="text-text-muted shrink-0" />}
              <span className="shrink-0">{node.icon || "📁"}</span>
              <span className="text-text-muted truncate">{node.name}</span>
              <span className="text-[9px] text-text-muted/50 ml-auto shrink-0">{node.children.length}</span>
            </button>
            {isOpen && node.children.length > 0 && renderTree(node.children, slug, depth + 1)}
            {isOpen && creatingIn?.path === node.path && (
              <div style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                <input
                  type="text" autoFocus
                  placeholder={creatingIn.type === "folder" ? "Folder name..." : "File name..."}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateItem(); if (e.key === "Escape") { setCreatingIn(null); setNewItemName(""); } }}
                  onBlur={() => { setCreatingIn(null); setNewItemName(""); }}
                  className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
                />
              </div>
            )}
          </div>
        );
      }

      // File node
      return (
        <div key={node.path} className="group flex items-center" style={{ paddingLeft: `${depth * 12}px` }}>
          <button
            onClick={() => handleFileClick(node.path)}
            onContextMenu={(e) => handleContextMenu(e, node.path, "file", slug)}
            className={`flex-1 truncate rounded px-2 py-1 text-left text-xs ${
              selectedFile === node.path ? "bg-panel-active text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
            }`}
            title={node.path}
          >
            {node.name}
          </button>
          <button
            onClick={(e) => handleDeleteFile(node.path, slug, e)}
            className={`shrink-0 rounded p-1 transition-colors ${
              confirmDeleteFile === node.path ? "block bg-coral/10 text-coral" : "hidden text-text-muted/70 group-hover:block hover:text-coral"
            }`}
            title={confirmDeleteFile === node.path ? "Click again to confirm" : "Delete"}
          >
            <Trash2 size={11} />
          </button>
        </div>
      );
    });
  };

  if (error) return <p className="text-coral text-sm">{error}</p>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border mb-1">
        <button onClick={() => setCreatingSubject(true)} title="New subject"
          className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text">
          <FolderPlus size={14} />
        </button>
        <div className="flex-1" />
        <button onClick={() => setExpandedSubjects(new Set())} title="Collapse all"
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
        const icons = folderIcons[subject.slug] || {};

        return (
          <div key={subject.slug} className="mb-0.5">
            <button
              onClick={() => handleSubjectClick(subject.slug)}
              onContextMenu={(e) => handleContextMenu(e, `subjects/${subject.slug}`, "subject", subject.slug)}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2 rounded flex items-center gap-1.5 group"
            >
              {isExpanded ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />}
              <span className={`flex-1 truncate ${isExpanded ? "text-text" : "text-text-muted"}`}>{subject.name}</span>
              <span className="text-[10px] text-text-muted shrink-0">{subject.chapter_count}</span>
            </button>

            {isExpanded && (
              <div className="ml-4 border-l border-border pl-1">
                <div className="flex items-center gap-2 px-2 py-1">
                  <button onClick={(e) => { e.stopPropagation(); useQuizStore.getState().prepareSubjectQuiz(subject.slug, subject.name); navigate("/quiz"); }}
                    className="text-[10px] text-text-muted transition-colors hover:text-text">Quiz All</button>
                  <button onClick={() => handleDeleteSubject(subject.slug)}
                    className={`text-[10px] transition-colors ${confirmDeleteSubject === subject.slug ? "text-coral font-medium animate-pulse" : "text-text-muted hover:text-coral"}`}>
                    {confirmDeleteSubject === subject.slug ? "Are you sure? Click to delete" : "Delete Subject"}
                  </button>
                </div>

                {sections.map((section) => {
                  const sectionKey = `${subject.slug}:${section.key}`;
                  const isCollapsed = collapsedSections.has(sectionKey);
                  const SectionIcon = section.icon;
                  const basePath = `subjects/${subject.slug}/${section.fileType}`;
                  const tree = buildTree(section.files, basePath, icons);

                  return (
                    <div key={section.key} className="mb-0.5">
                      <button
                        onClick={() => toggleSection(sectionKey)}
                        onContextMenu={(e) => handleContextMenu(e, basePath, "section", subject.slug, sectionKey)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-surface-2 rounded transition-colors"
                      >
                        {isCollapsed ? <ChevronRight size={11} className="text-text-muted" /> : <ChevronDown size={11} className="text-text-muted" />}
                        <SectionIcon size={12} className={section.color} />
                        <span className="text-text-muted/90">{section.label}</span>
                        <span className="text-[10px] text-text-muted ml-auto">{section.files.length}</span>
                      </button>

                      {!isCollapsed && (
                        <div className="ml-4">
                          {tree.length === 0 && !creatingIn && (
                            <p className="text-[10px] text-text-muted/50 italic px-2 py-0.5">No files yet</p>
                          )}
                          {renderTree(tree, subject.slug, 0)}

                          {/* Create at section root */}
                          {creatingIn?.path === basePath && (
                            <input
                              type="text" autoFocus
                              placeholder={creatingIn.type === "folder" ? "Folder name..." : "File name..."}
                              value={newItemName}
                              onChange={(e) => setNewItemName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleCreateItem(); if (e.key === "Escape") { setCreatingIn(null); setNewItemName(""); } }}
                              onBlur={() => { setCreatingIn(null); setNewItemName(""); }}
                              className="w-full px-2 py-1 mt-0.5 text-xs bg-surface-2 border border-border rounded text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
                            />
                          )}

                          {/* Quick add buttons */}
                          {!creatingIn && section.key === "chapters" && (
                            <div className="flex gap-2 px-2 py-0.5">
                              <button onClick={() => setCreatingIn({ path: basePath, type: "file" })}
                                className="text-[10px] text-text-muted transition-colors hover:text-text">+ Chapter</button>
                              <button onClick={() => setCreatingIn({ path: basePath, type: "folder" })}
                                className="text-[10px] text-text-muted hover:text-text transition-colors">+ Folder</button>
                            </div>
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
      <button onClick={() => setCreatingSubject(true)} className="w-full text-left px-3 py-2 mt-2 text-sm text-purple hover:text-text transition-colors">
        + New Subject
      </button>

      {/* Subject creation wizard */}
      <CreateSubjectWizard
        open={creatingSubject}
        onClose={() => setCreatingSubject(false)}
        onCreated={(slug) => {
          setCreatingSubject(false);
          loadSubjects();
          handleSubjectClick(slug);
        }}
      />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={contextMenuItems()} />
      )}

      {/* Emoji picker */}
      {emojiPicker && (
        <EmojiPicker
          x={emojiPicker.x} y={emojiPicker.y}
          onSelect={async (emoji) => {
            const folderKey = emojiPicker.folderPath.replace(new RegExp(`^subjects/[^/]+/`), "");
            await saveFolderIcon(emojiPicker.slug, folderKey, emoji);
            loadSections(emojiPicker.slug);
            setEmojiPicker(null);
          }}
          onClose={() => setEmojiPicker(null)}
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
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple" />
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
