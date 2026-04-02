import type { EditorView } from "@codemirror/view";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Globe,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { OutlinePanel } from "../components/editor/OutlinePanel";
import { StatusBar } from "../components/editor/StatusBar";
import {
  createChapter,
  createNote,
  createNoteFolder,
  createSubject,
  deleteSubject,
  importUrl,
  listChapters,
  listNoteFolders,
  listNotes,
  listSubjects,
  loadReaderSession,
  updateChapterContent,
} from "../lib/tauri";
import type { Chapter, NoteInfo, ReaderSession, Subject } from "../lib/tauri";
import { NoteEditor } from "./NoteEditor";

// --- Types ---

type Selection =
  | {
      type: "chapter";
      chapterId: number;
      subjectId: number;
      subjectName: string;
    }
  | { type: "note"; noteId: number }
  | null;

type SidebarModal =
  | "create-subject"
  | "create-chapter"
  | "create-note-folder"
  | "import-url"
  | null;

const STATUS_DOT: Record<string, string> = {
  new: "bg-text-muted/40",
  reading: "bg-blue-400",
  awaiting_synthesis: "bg-amber-400",
  ready_for_quiz: "bg-orange-400",
  mastering: "bg-green-400",
  stable: "bg-teal-400",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  reading: "Reading",
  awaiting_synthesis: "Synthesis",
  ready_for_quiz: "Quiz Ready",
  mastering: "Mastering",
  stable: "Stable",
};

// --- Chapter Editor (inline, not the full ChapterView page) ---

function ChapterEditor({
  chapterId,
  subjectId,
  subjectName,
}: {
  chapterId: number;
  subjectId: number;
  subjectName: string;
}) {
  const navigate = useNavigate();

  const [session, setSession] = useState<ReaderSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const handleNavigateLine = useCallback((line: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    const lineInfo = view.state.doc.line(
      Math.max(1, Math.min(line, view.state.doc.lines)),
    );
    view.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  const load = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await loadReaderSession(chapterId);
      setSession(data);
      const md = data.sections
        .map((s) => {
          const heading = s.heading ? `## ${s.heading}\n\n` : "";
          return heading + s.body_markdown;
        })
        .join("\n\n");
      setEditorContent(md);
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleEditorChange = (value: string) => {
    setEditorContent(value);
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateChapterContent(chapterId, value);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("idle");
      }
    }, 2000);
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-coral">{error}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">{subjectName}</p>
            <h1
              className="text-base font-semibold tracking-tight text-text"
              style={{ wordBreak: "break-word", lineHeight: "1.4" }}
            >
              {session.chapter.title}
            </h1>
          </div>

          {/* Status badge */}
          <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-text-muted">
            <span
              className={`h-2 w-2 rounded-full ${STATUS_DOT[session.chapter.status] ?? "bg-text-muted/30"}`}
            />
            {STATUS_LABEL[session.chapter.status] ?? session.chapter.status}
          </span>

          {saveStatus !== "idle" && (
            <span className="text-[10px] text-text-muted">
              {saveStatus === "saving" ? "Saving..." : "Saved"}
            </span>
          )}

          <OutlinePanel
            content={editorContent}
            onNavigate={handleNavigateLine}
          />

          <button
            type="button"
            onClick={() => navigate(`/reader?chapter=${chapterId}`)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90"
          >
            <BookOpen size={13} />
            Study
          </button>
          <button
            type="button"
            onClick={() => navigate(`/quiz?chapter=${chapterId}`)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-4 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
          >
            <ClipboardCheck size={13} />
            Quiz
          </button>
          <button
            type="button"
            onClick={() => navigate(`/teachback?chapter=${chapterId}`)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-4 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
          >
            <MessageSquare size={13} />
            Teach
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <MarkdownEditor
          value={editorContent}
          onChange={handleEditorChange}
          onViewReady={(view) => {
            editorViewRef.current = view;
            setEditorView(view);
          }}
          subjectId={subjectId}
          chapterId={chapterId}
        />
      </div>

      {/* Status bar */}
      <StatusBar view={editorView} />
    </div>
  );
}

// --- Main Workspace Page ---

export function Workspace() {
  // Selection
  const [selection, setSelection] = useState<Selection>(null);

  // Study data
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chaptersMap, setChaptersMap] = useState<Record<number, Chapter[]>>({});
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(
    new Set(),
  );

  // Notes data
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [noteFolders, setNoteFolders] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  // Sidebar modals
  const [sidebarModal, setSidebarModal] = useState<SidebarModal>(null);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [importUrlValue, setImportUrlValue] = useState("");
  const [modalSubjectId, setModalSubjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plus dropdown
  const [plusDropdownOpen, setPlusDropdownOpen] = useState(false);
  const plusDropdownRef = useRef<HTMLDivElement>(null);

  // Track loaded subjects for chapters
  const loadedSubjects = useRef<Set<number>>(new Set());

  // --- Data Loading ---

  const loadSubjects = useCallback(async () => {
    try {
      const data = await listSubjects();
      setSubjects(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadChaptersForSubject = useCallback(
    async (subjectId: number, force = false) => {
      if (!force && loadedSubjects.current.has(subjectId)) return;
      try {
        const data = await listChapters(subjectId);
        loadedSubjects.current.add(subjectId);
        setChaptersMap((prev) => ({ ...prev, [subjectId]: data }));
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const loadNotes = useCallback(async () => {
    try {
      const [n, f] = await Promise.all([listNotes(), listNoteFolders()]);
      setNotes(n);
      setNoteFolders(f);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    loadSubjects();
    loadNotes();
  }, [loadSubjects, loadNotes]);

  // Load chapters when subjects are expanded
  useEffect(() => {
    for (const id of expandedSubjects) {
      loadChaptersForSubject(id);
    }
  }, [expandedSubjects, loadChaptersForSubject]);

  // Close plus dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        plusDropdownRef.current &&
        !plusDropdownRef.current.contains(e.target as Node)
      ) {
        setPlusDropdownOpen(false);
      }
    };
    if (plusDropdownOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [plusDropdownOpen]);

  // --- Study Handlers ---

  const toggleSubject = (subjectId: number) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const subject = await createSubject(newSubjectName);
      setSubjects((prev) => [...prev, subject]);
      setNewSubjectName("");
      setSidebarModal(null);
      setExpandedSubjects((prev) => new Set(prev).add(subject.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubject = async (id: number) => {
    try {
      await deleteSubject(id);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      if (selection?.type === "chapter" && selection.subjectId === id) {
        setSelection(null);
      }
      setExpandedSubjects((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setChaptersMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      loadedSubjects.current.delete(id);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCreateChapter = async () => {
    if (!newChapterTitle.trim() || !modalSubjectId) return;
    setLoading(true);
    setError(null);
    try {
      const chapter = await createChapter(modalSubjectId, newChapterTitle, "");
      setNewChapterTitle("");
      setSidebarModal(null);
      // Reload chapters for the subject
      await loadChaptersForSubject(modalSubjectId, true);
      // Select the new chapter
      const subject = subjects.find((s) => s.id === modalSubjectId);
      setSelection({
        type: "chapter",
        chapterId: chapter.id,
        subjectId: modalSubjectId,
        subjectName: subject?.name ?? "",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleImportUrl = async () => {
    if (!importUrlValue.trim() || !modalSubjectId) return;
    setLoading(true);
    setError(null);
    try {
      const chapter = await importUrl(importUrlValue, modalSubjectId);
      setImportUrlValue("");
      setSidebarModal(null);
      await loadChaptersForSubject(modalSubjectId, true);
      await loadSubjects();
      const subject = subjects.find((s) => s.id === modalSubjectId);
      setSelection({
        type: "chapter",
        chapterId: chapter.id,
        subjectId: modalSubjectId,
        subjectName: subject?.name ?? "",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // --- Notes Handlers ---

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleCreateNote = async (folder: string | null) => {
    try {
      const note = await createNote("Untitled", folder, null, "");
      await loadNotes();
      setSelection({ type: "note", noteId: note.id });
    } catch {
      /* silent */
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createNoteFolder(newFolderName.trim());
      await loadNotes();
      setNewFolderName("");
      setSidebarModal(null);
      setExpandedFolders((prev) => new Set(prev).add(newFolderName.trim()));
    } catch {
      /* silent */
    }
  };

  // Group notes by folder
  const rootNotes = notes.filter((n) => !n.file_path.includes("/"));
  const folderNotes = (folder: string) =>
    notes.filter(
      (n) =>
        n.file_path.startsWith(`${folder}/`) &&
        !n.file_path.slice(folder.length + 1).includes("/"),
    );

  // --- Render ---

  return (
    <div className="flex h-full">
      {/* ========== SIDEBAR ========== */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border-subtle bg-panel">
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-border-subtle/60 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Workspace
          </span>
          <div className="relative" ref={plusDropdownRef}>
            <button
              type="button"
              onClick={() => setPlusDropdownOpen((v) => !v)}
              aria-label="Create new"
              className="rounded p-1 text-text-muted hover:bg-panel-active hover:text-accent"
            >
              <Plus size={12} />
            </button>
            {plusDropdownOpen && (
              <div className="absolute right-0 top-7 z-50 w-44 rounded-lg border border-border bg-panel py-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setPlusDropdownOpen(false);
                    setSidebarModal("create-subject");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-muted hover:bg-panel-active hover:text-text"
                >
                  <BookOpen size={12} className="text-green-400" />
                  New Study Subject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusDropdownOpen(false);
                    setSidebarModal("create-note-folder");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-muted hover:bg-panel-active hover:text-text"
                >
                  <FolderOpen size={12} className="text-purple-400" />
                  New Note Folder
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* ===== STUDY SECTION ===== */}
          <div className="px-1 pt-2">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-green-400">
                <BookOpen size={10} />
                Study
              </span>
              <button
                type="button"
                onClick={() => setSidebarModal("create-subject")}
                aria-label="New subject"
                className="rounded p-0.5 text-text-muted/40 hover:text-green-400"
              >
                <Plus size={11} />
              </button>
            </div>

            {/* Create subject inline input */}
            {sidebarModal === "create-subject" && (
              <div className="px-2 py-1">
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubject();
                    if (e.key === "Escape") setSidebarModal(null);
                  }}
                  placeholder="Subject name..."
                  autoFocus
                  className="w-full rounded bg-bg px-2 py-1.5 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-green-400/30"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleCreateSubject}
                    disabled={loading}
                    className="rounded bg-green-500 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-green-500/90 disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarModal(null)}
                    className="rounded px-2.5 py-1 text-[10px] text-text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Subject list */}
            {subjects.map((subject) => {
              const isOpen = expandedSubjects.has(subject.id);
              const subjectChapters = chaptersMap[subject.id] ?? [];
              const isSelectedSubject =
                selection?.type === "chapter" &&
                selection.subjectId === subject.id;

              return (
                <div key={subject.id}>
                  {/* Subject row */}
                  <div className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleSubject(subject.id)}
                      className={`flex flex-1 items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${
                        isSelectedSubject
                          ? "bg-green-400/10 font-medium text-green-400"
                          : "text-text-muted hover:bg-panel-active hover:text-text"
                      }`}
                    >
                      {isOpen ? (
                        <ChevronDown size={12} className="shrink-0" />
                      ) : (
                        <ChevronRight size={12} className="shrink-0" />
                      )}
                      <BookOpen
                        size={12}
                        className={`shrink-0 ${isSelectedSubject ? "text-green-400" : "text-green-400/50"}`}
                      />
                      <span
                        className="flex-1 text-left"
                        style={{
                          wordBreak: "break-word",
                          lineHeight: "1.4",
                        }}
                      >
                        {subject.name}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] tabular-nums ${isSelectedSubject ? "text-green-400/60" : "text-text-muted/40"}`}
                      >
                        {subject.chapter_count}
                      </span>
                    </button>
                    <div className="mr-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalSubjectId(subject.id);
                          if (!expandedSubjects.has(subject.id)) {
                            setExpandedSubjects((prev) =>
                              new Set(prev).add(subject.id),
                            );
                          }
                          setSidebarModal("create-chapter");
                        }}
                        className="rounded p-0.5 text-text-muted/30 hover:text-green-400"
                        aria-label={`New chapter in ${subject.name}`}
                        title="New chapter"
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalSubjectId(subject.id);
                          if (!expandedSubjects.has(subject.id)) {
                            setExpandedSubjects((prev) =>
                              new Set(prev).add(subject.id),
                            );
                          }
                          setSidebarModal("import-url");
                        }}
                        className="rounded p-0.5 text-text-muted/30 hover:text-green-400"
                        aria-label={`Import URL to ${subject.name}`}
                        title="Import URL"
                      >
                        <Globe size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSubject(subject.id);
                        }}
                        className="rounded p-0.5 text-text-muted/30 hover:text-coral"
                        aria-label={`Delete ${subject.name}`}
                        title="Delete subject"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Create chapter inline input */}
                  {isOpen &&
                    sidebarModal === "create-chapter" &&
                    modalSubjectId === subject.id && (
                      <div className="py-1 pl-6 pr-2">
                        <input
                          type="text"
                          value={newChapterTitle}
                          onChange={(e) => setNewChapterTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateChapter();
                            if (e.key === "Escape") setSidebarModal(null);
                          }}
                          placeholder="Chapter title..."
                          autoFocus
                          className="w-full rounded bg-bg px-2 py-1 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-green-400/30"
                        />
                      </div>
                    )}

                  {/* Import URL inline input */}
                  {isOpen &&
                    sidebarModal === "import-url" &&
                    modalSubjectId === subject.id && (
                      <div className="py-1 pl-6 pr-2">
                        <input
                          type="url"
                          value={importUrlValue}
                          onChange={(e) => setImportUrlValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleImportUrl();
                            if (e.key === "Escape") setSidebarModal(null);
                          }}
                          placeholder="https://..."
                          autoFocus
                          className="w-full rounded bg-bg px-2 py-1 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-green-400/30"
                        />
                        {loading && (
                          <p className="mt-1 text-[10px] text-text-muted/60">
                            Importing...
                          </p>
                        )}
                      </div>
                    )}

                  {/* Nested chapters */}
                  {isOpen &&
                    subjectChapters.map((chapter) => {
                      const isChapterSelected =
                        selection?.type === "chapter" &&
                        selection.chapterId === chapter.id;
                      return (
                        <button
                          key={chapter.id}
                          type="button"
                          onClick={() =>
                            setSelection({
                              type: "chapter",
                              chapterId: chapter.id,
                              subjectId: subject.id,
                              subjectName: subject.name,
                            })
                          }
                          className={`flex w-full items-center gap-2 rounded py-1.5 pl-8 pr-2 text-left text-xs transition-colors ${
                            isChapterSelected
                              ? "bg-accent/10 font-medium text-accent"
                              : "text-text-muted hover:bg-panel-active hover:text-text"
                          }`}
                        >
                          <FileText size={11} className="shrink-0" />
                          <span
                            className="flex-1"
                            style={{
                              wordBreak: "break-word",
                              lineHeight: "1.4",
                            }}
                          >
                            {chapter.title}
                          </span>
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[chapter.status] ?? "bg-text-muted/30"}`}
                            title={chapter.status}
                          />
                        </button>
                      );
                    })}

                  {isOpen && subjectChapters.length === 0 && (
                    <div className="py-2 pl-8 pr-2 text-[10px] text-text-muted/40">
                      No chapters
                    </div>
                  )}
                </div>
              );
            })}

            {subjects.length === 0 && sidebarModal !== "create-subject" && (
              <div className="px-4 py-6 text-center">
                <p className="text-[10px] text-text-muted/40">
                  No subjects yet
                </p>
              </div>
            )}
          </div>

          {/* ===== DIVIDER ===== */}
          <div className="mx-3 my-2 border-t border-border-subtle/60" />

          {/* ===== NOTES SECTION ===== */}
          <div className="px-1 pb-2">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-purple-400">
                <FolderOpen size={10} />
                Notes
              </span>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => handleCreateNote(null)}
                  aria-label="New note"
                  className="rounded p-0.5 text-text-muted/40 hover:text-purple-400"
                  title="New note"
                >
                  <FileText size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarModal("create-note-folder")}
                  aria-label="New folder"
                  className="rounded p-0.5 text-text-muted/40 hover:text-purple-400"
                  title="New folder"
                >
                  <Plus size={11} />
                </button>
              </div>
            </div>

            {/* Create folder inline input */}
            {sidebarModal === "create-note-folder" && (
              <div className="px-2 py-1">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                    if (e.key === "Escape") setSidebarModal(null);
                  }}
                  placeholder="Folder name..."
                  autoFocus
                  className="w-full rounded bg-bg px-2 py-1.5 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
                />
              </div>
            )}

            {/* Root notes (no folder) */}
            {rootNotes.map((note) => {
              const isNoteSelected =
                selection?.type === "note" && selection.noteId === note.id;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() =>
                    setSelection({ type: "note", noteId: note.id })
                  }
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                    isNoteSelected
                      ? "bg-purple-400/10 text-purple-400"
                      : "text-text-muted hover:bg-panel-active hover:text-text"
                  }`}
                >
                  <FileText size={12} className="shrink-0" />
                  <span
                    className="flex-1"
                    style={{ wordBreak: "break-word", lineHeight: "1.4" }}
                  >
                    {note.title}
                  </span>
                </button>
              );
            })}

            {/* Folders with nested notes */}
            {noteFolders.map((folder) => {
              const isOpen = expandedFolders.has(folder);
              const items = folderNotes(folder);
              return (
                <div key={folder}>
                  <div className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder)}
                      className="flex flex-1 items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-text-muted hover:bg-panel-active hover:text-text"
                    >
                      {isOpen ? (
                        <ChevronDown size={12} className="shrink-0" />
                      ) : (
                        <ChevronRight size={12} className="shrink-0" />
                      )}
                      <FolderOpen
                        size={12}
                        className="shrink-0 text-purple-400/70"
                      />
                      <span
                        className="flex-1 text-left"
                        style={{
                          wordBreak: "break-word",
                          lineHeight: "1.4",
                        }}
                      >
                        {folder.split("/").pop()}
                      </span>
                      <span className="shrink-0 text-[10px] text-text-muted/40">
                        {items.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateNote(folder);
                      }}
                      className="mr-1 rounded p-0.5 text-text-muted/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-purple-400"
                      aria-label={`New note in ${folder}`}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  {isOpen &&
                    items.map((note) => {
                      const isNoteSelected =
                        selection?.type === "note" &&
                        selection.noteId === note.id;
                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() =>
                            setSelection({ type: "note", noteId: note.id })
                          }
                          className={`flex w-full items-center gap-2 rounded py-1.5 pl-8 pr-2 text-left text-xs transition-colors ${
                            isNoteSelected
                              ? "bg-purple-400/10 text-purple-400"
                              : "text-text-muted hover:bg-panel-active hover:text-text"
                          }`}
                        >
                          <FileText size={11} className="shrink-0" />
                          <span
                            className="flex-1"
                            style={{
                              wordBreak: "break-word",
                              lineHeight: "1.4",
                            }}
                          >
                            {note.title}
                          </span>
                        </button>
                      );
                    })}
                </div>
              );
            })}

            {noteFolders.length === 0 &&
              rootNotes.length === 0 &&
              sidebarModal !== "create-note-folder" && (
                <div className="px-4 py-6 text-center">
                  <p className="text-[10px] text-text-muted/40">No notes yet</p>
                </div>
              )}
          </div>
        </div>

        {/* Error toast at bottom of sidebar */}
        {error && (
          <div className="border-t border-coral/20 bg-coral/5 px-3 py-2">
            <p className="text-[10px] text-coral">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-0.5 text-[10px] text-coral/50 hover:text-coral"
            >
              dismiss
            </button>
          </div>
        )}
      </div>

      {/* ========== MAIN CONTENT AREA ========== */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selection?.type === "chapter" ? (
          <ChapterEditor
            key={selection.chapterId}
            chapterId={selection.chapterId}
            subjectId={selection.subjectId}
            subjectName={selection.subjectName}
          />
        ) : selection?.type === "note" ? (
          <NoteEditor
            key={selection.noteId}
            noteId={selection.noteId}
            onNoteChanged={loadNotes}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/6">
                <FolderOpen size={22} className="text-accent/40" />
              </div>
              <p className="text-sm font-medium text-text-muted">
                Select a file from the sidebar
              </p>
              <p className="mt-1 text-xs text-text-muted/50">
                Open a study chapter or note to begin
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
