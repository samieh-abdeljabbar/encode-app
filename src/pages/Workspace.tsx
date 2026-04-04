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
import { useNavigate, useSearchParams } from "react-router-dom";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { OutlinePanel } from "../components/editor/OutlinePanel";
import { StatusBar } from "../components/editor/StatusBar";
import {
  createChapter,
  createNote,
  createNoteFolder,
  createSubject,
  deleteNote,
  deleteNoteFolder,
  deleteSubject,
  importUrl,
  listChapters,
  listNoteFolders,
  listNotes,
  listSubjects,
  loadReaderSession,
  moveChapter,
  moveNote,
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
      chapterTitle: string;
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

type ChapterMarkdownSource = ReaderSession & {
  markdown?: string;
  content?: string;
  raw_markdown?: string;
  canonical_markdown?: string;
  chapter?: ReaderSession["chapter"] & {
    markdown?: string;
    content?: string;
    raw_markdown?: string;
    canonical_markdown?: string;
  };
};

function buildChapterMarkdown(data: ChapterMarkdownSource): string {
  const candidates = [
    data.markdown,
    data.content,
    data.raw_markdown,
    data.canonical_markdown,
    data.chapter?.markdown,
    data.chapter?.content,
    data.chapter?.raw_markdown,
    data.chapter?.canonical_markdown,
  ];
  const canonical = candidates.find((value) => value !== undefined);
  if (canonical !== undefined) {
    return canonical;
  }

  return data.sections
    .map((s) => {
      const heading = s.heading ? `## ${s.heading}\n\n` : "";
      return heading + s.body_markdown;
    })
    .join("\n\n");
}

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
  const pendingContentRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
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
      const data = (await loadReaderSession(
        chapterId,
      )) as ChapterMarkdownSource;
      setSession(data);
      setEditorContent(buildChapterMarkdown(data));
      pendingContentRef.current = null;
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const saveContent = useCallback(
    async (content: string) => {
      if (mountedRef.current) {
        setSaveStatus("saving");
      }
      try {
        await updateChapterContent(chapterId, content);
        if (pendingContentRef.current === content) {
          pendingContentRef.current = null;
        }
        if (mountedRef.current) {
          setSaveStatus("saved");
        }
      } catch {
        if (mountedRef.current) {
          setSaveStatus("idle");
        }
      }
    },
    [chapterId],
  );

  const flushPendingSave = useCallback(() => {
    const pending = pendingContentRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pending == null) return;
    void saveContent(pending);
  }, [saveContent]);

  useEffect(() => {
    const handleBlur = () => {
      flushPendingSave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave();
      }
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const handleEditorChange = (value: string) => {
    setEditorContent(value);
    setSaveStatus("saving");
    pendingContentRef.current = value;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveContent(value);
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedNoteId = searchParams.get("note")
    ? Number(searchParams.get("note"))
    : null;
  const requestedChapterId = searchParams.get("chapter")
    ? Number(searchParams.get("chapter"))
    : null;

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

  // Drag state (React state instead of dataTransfer for Tauri webview compatibility)
  const dragRef = useRef<{
    type: "chapter" | "note";
    id: number;
    sourceSubjectId?: number;
    sourceFolder?: string;
  } | null>(null);

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

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "subject" | "chapter" | "note-folder" | "note";
    id: number | string;
    extra?: { subjectId?: number; subjectName?: string };
  } | null>(null);

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

  useEffect(() => {
    if (requestedNoteId == null) return;
    if (!notes.some((note) => note.id === requestedNoteId)) return;
    setSelection((current) =>
      current?.type === "note" && current.noteId === requestedNoteId
        ? current
        : { type: "note", noteId: requestedNoteId },
    );
  }, [requestedNoteId, notes]);

  useEffect(() => {
    if (requestedChapterId == null || subjects.length === 0) return;
    for (const subject of subjects) {
      void loadChaptersForSubject(subject.id);
    }
  }, [requestedChapterId, subjects, loadChaptersForSubject]);

  useEffect(() => {
    if (requestedChapterId == null) return;
    for (const subject of subjects) {
      const chapter = (chaptersMap[subject.id] ?? []).find(
        (item) => item.id === requestedChapterId,
      );
      if (!chapter) continue;
      setExpandedSubjects((prev) => new Set(prev).add(subject.id));
      setSelection((current) =>
        current?.type === "chapter" && current.chapterId === chapter.id
          ? current
          : {
              type: "chapter",
              chapterId: chapter.id,
              subjectId: subject.id,
              subjectName: subject.name,
              chapterTitle: chapter.title,
            },
      );
      break;
    }
  }, [requestedChapterId, subjects, chaptersMap]);

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

  // Close context menu on click anywhere
  useEffect(() => {
    const close = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", close);
      return () => window.removeEventListener("click", close);
    }
  }, [contextMenu]);

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
        chapterTitle: chapter.title,
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
        chapterTitle: chapter.title,
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

  const handleCreateNote = async (
    folder: string | null,
    seed?: {
      title?: string;
      content?: string;
      subjectId?: number | null;
      chapterId?: number | null;
    },
  ) => {
    try {
      const note = await createNote(
        seed?.title ?? "Untitled",
        folder,
        seed?.subjectId ?? null,
        seed?.chapterId ?? null,
        seed?.content ?? "",
      );
      await loadNotes();
      navigate(`/workspace?note=${note.id}`);
    } catch (e) {
      setError(String(e));
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

  const handleDeleteFolder = async (folder: string) => {
    try {
      await deleteNoteFolder(folder);
      await loadNotes();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleMoveNote = async (
    noteId: number,
    targetFolder: string | null,
  ) => {
    try {
      await moveNote(noteId, targetFolder);
      await loadNotes();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await deleteNote(noteId);
      if (selection?.type === "note" && selection.noteId === noteId) {
        setSelection(null);
      }
      await loadNotes();
    } catch (e) {
      setError(String(e));
    }
  };

  const selectedNoteInfo =
    selection?.type === "note"
      ? (notes.find((note) => note.id === selection.noteId) ?? null)
      : null;

  const activeSubjectId =
    selection?.type === "chapter"
      ? selection.subjectId
      : (selectedNoteInfo?.subject_id ?? null);

  const activeSubjectName =
    selection?.type === "chapter"
      ? selection.subjectName
      : (selectedNoteInfo?.subject_name ?? null);

  const activeChapterId =
    selection?.type === "chapter"
      ? selection.chapterId
      : (selectedNoteInfo?.chapter_id ?? null);

  const activeChapterTitle =
    selection?.type === "chapter"
      ? selection.chapterTitle
      : (selectedNoteInfo?.chapter_title ?? null);

  const visibleNotes = activeSubjectId
    ? notes.filter((note) => note.subject_id === activeSubjectId)
    : notes;

  const notePanelTitle = activeSubjectName
    ? `Notes for ${activeSubjectName}`
    : "Subject Notes";

  const notePanelDescription = activeChapterTitle
    ? `Capture highlights, questions, and imported material for ${activeChapterTitle}.`
    : activeSubjectName
      ? `Capture highlights, questions, and imported material for ${activeSubjectName}.`
      : "Select a subject or chapter to focus notes around what you are studying.";

  const noteCreationSeed =
    activeSubjectId == null
      ? undefined
      : {
          subjectId: activeSubjectId,
          chapterId: activeChapterId,
        };

  // Group notes by folder
  const rootNotes = visibleNotes.filter((n) => !n.file_path.includes("/"));
  const folderNotes = (folder: string) =>
    visibleNotes.filter(
      (n) =>
        n.file_path.startsWith(`${folder}/`) &&
        !n.file_path.slice(folder.length + 1).includes("/"),
    );
  const visibleFolders = noteFolders.filter(
    (folder) => folderNotes(folder).length > 0,
  );

  // --- Render ---

  return (
    <div className="flex h-full bg-[linear-gradient(180deg,rgba(250,248,243,0.6),rgba(244,240,232,0))]">
      {/* ========== SIDEBAR ========== */}
      <div className="soft-panel m-4 mr-0 flex w-80 shrink-0 flex-col overflow-hidden rounded-[28px]">
        {/* Sidebar header */}
        <div className="border-b border-border-subtle/60 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-kicker">Library</div>
              <h1 className="serif-heading mt-2 text-2xl font-semibold text-text">
                Keep everything in one place.
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Subjects, chapters, imports, and notes stay together so it is
                easier to pick up exactly where you left off.
              </p>
            </div>
            <div className="relative" ref={plusDropdownRef}>
              <button
                type="button"
                onClick={() => setPlusDropdownOpen((v) => !v)}
                aria-label="Create new"
                className="rounded-2xl border border-border bg-panel px-3 py-2 text-sm font-medium text-text-muted hover:border-accent/25 hover:text-accent"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Plus size={14} />
                  New
                </span>
              </button>
              {plusDropdownOpen && (
                <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-border bg-panel py-2 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setPlusDropdownOpen(false);
                      setSidebarModal("create-subject");
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-muted hover:bg-panel-active hover:text-text"
                  >
                    <BookOpen size={12} className="text-accent" />
                    New Study Subject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlusDropdownOpen(false);
                      setSidebarModal("create-note-folder");
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-muted hover:bg-panel-active hover:text-text"
                  >
                    <FolderOpen size={12} className="text-purple-400" />
                    New Note Folder
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 py-3">
          {/* ===== STUDY SECTION ===== */}
          <div className="rounded-2xl border border-border-subtle bg-panel/60 px-2 py-3">
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-accent">
                <BookOpen size={10} />
                Study Subjects
              </span>
              <button
                type="button"
                onClick={() => setSidebarModal("create-subject")}
                aria-label="New subject"
                className="rounded-xl p-1 text-text-muted/40 hover:bg-panel-active hover:text-accent"
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
                  className="w-full rounded bg-bg px-2 py-1.5 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleCreateSubject}
                    disabled={loading}
                    className="rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
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
                  {/* Subject row — drop target for chapters */}
                  <div
                    className={`group my-1 flex items-center rounded-[22px] px-1 py-1 transition-colors ${
                      isSelectedSubject
                        ? "bg-accent/10 shadow-[inset_0_0_0_1px_rgba(45,106,79,0.08)]"
                        : "hover:bg-accent/[0.06]"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.outline =
                        "2px solid var(--color-accent, #2d6a4f)";
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.outline = "none";
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.style.outline = "none";
                      const drag = dragRef.current;
                      dragRef.current = null;
                      if (
                        drag?.type === "chapter" &&
                        drag.sourceSubjectId != null &&
                        drag.sourceSubjectId !== subject.id
                      ) {
                        await moveChapter(drag.id, subject.id);
                        loadChaptersForSubject(drag.sourceSubjectId, true);
                        loadChaptersForSubject(subject.id, true);
                        loadSubjects();
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        type: "subject",
                        id: subject.id,
                      });
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSubject(subject.id)}
                      onDragOver={(e) => e.preventDefault()}
                      className={`flex flex-1 items-center gap-2 rounded-[18px] px-3 py-2 text-xs transition-colors ${
                        isSelectedSubject
                          ? "font-medium text-accent"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      {isOpen ? (
                        <ChevronDown size={12} className="shrink-0" />
                      ) : (
                        <ChevronRight size={12} className="shrink-0" />
                      )}
                      <BookOpen
                        size={12}
                        className={`shrink-0 ${isSelectedSubject ? "text-accent" : "text-accent/50"}`}
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
                        className={`shrink-0 text-[10px] tabular-nums ${isSelectedSubject ? "text-accent/60" : "text-text-muted/40"}`}
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
                        className="rounded-xl p-1 text-text-muted/30 hover:bg-panel hover:text-accent"
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
                        className="rounded-xl p-1 text-text-muted/30 hover:bg-panel hover:text-accent"
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
                        className="rounded-xl p-1 text-text-muted/30 hover:bg-panel hover:text-coral"
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
                          className="w-full rounded bg-bg px-2 py-1 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
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
                          className="w-full rounded bg-bg px-2 py-1 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
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
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", "drag");
                            e.dataTransfer.effectAllowed = "move";
                            dragRef.current = {
                              type: "chapter",
                              id: chapter.id,
                              sourceSubjectId: subject.id,
                            };
                          }}
                          onClick={() =>
                            setSelection({
                              type: "chapter",
                              chapterId: chapter.id,
                              subjectId: subject.id,
                              subjectName: subject.name,
                              chapterTitle: chapter.title,
                            })
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              type: "chapter",
                              id: chapter.id,
                              extra: {
                                subjectId: subject.id,
                                subjectName: subject.name,
                              },
                            });
                          }}
                          className={`flex w-full items-center gap-2 rounded py-1.5 pl-8 pr-2 text-left text-xs transition-colors cursor-grab active:cursor-grabbing select-none ${
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
          <div className="my-3" />

          {/* ===== NOTES SECTION ===== */}
          <div className="rounded-2xl border border-border-subtle bg-panel/60 px-2 py-3">
            <div
              className="flex items-center justify-between px-3 pb-2"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.outline = "2px solid #a78bfa";
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.outline = "none";
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.currentTarget.style.outline = "none";
                const drag = dragRef.current;
                dragRef.current = null;
                if (drag?.type === "note" && drag.sourceFolder !== "") {
                  await handleMoveNote(drag.id, null);
                }
              }}
            >
              <div>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-purple-400">
                  <FolderOpen size={10} />
                  {notePanelTitle}
                </span>
                <p className="mt-1 text-[11px] leading-relaxed text-text-muted/70">
                  {notePanelDescription}
                </p>
              </div>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => handleCreateNote(null, noteCreationSeed)}
                  aria-label="New note"
                  className="rounded-xl p-1 text-text-muted/40 hover:bg-panel-active hover:text-purple-400"
                  title="New note"
                >
                  <FileText size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarModal("create-note-folder")}
                  aria-label="New folder"
                  className="rounded-xl p-1 text-text-muted/40 hover:bg-panel-active hover:text-purple-400"
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
                <div
                  key={note.id}
                  className={`my-1 rounded-[20px] px-1 py-1 transition-colors ${
                    isNoteSelected
                      ? "bg-purple-400/10 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.10)]"
                      : "hover:bg-purple-400/[0.05]"
                  }`}
                >
                  <button
                    type="button"
                    draggable="true"
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", "drag");
                      e.dataTransfer.effectAllowed = "move";
                      dragRef.current = {
                        type: "note",
                        id: note.id,
                        sourceFolder: "",
                      };
                    }}
                    onClick={() => navigate(`/workspace?note=${note.id}`)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        type: "note",
                        id: note.id,
                      });
                    }}
                    className={`flex w-full items-center gap-2 rounded-[16px] px-3 py-2 text-left text-xs transition-colors cursor-grab active:cursor-grabbing select-none ${
                      isNoteSelected
                        ? "text-purple-400"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    <FileText size={12} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block"
                        style={{ wordBreak: "break-word", lineHeight: "1.4" }}
                      >
                        {note.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-text-muted/50">
                        {note.chapter_title ?? note.subject_name ?? "Note"}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}

            {/* Folders with nested notes */}
            {visibleFolders.map((folder) => {
              const isOpen = expandedFolders.has(folder);
              const items = folderNotes(folder);
              return (
                <div key={folder}>
                  <div
                    className="group flex items-center"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.outline = "2px solid #a78bfa";
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.outline = "none";
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.style.outline = "none";
                      const drag = dragRef.current;
                      dragRef.current = null;
                      if (
                        drag?.type === "note" &&
                        drag.sourceFolder !== folder
                      ) {
                        await handleMoveNote(drag.id, folder);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        type: "note-folder",
                        id: folder,
                      });
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder)}
                      onDragOver={(e) => e.preventDefault()}
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
                    <div className="mr-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateNote(folder, noteCreationSeed);
                        }}
                        className="rounded p-0.5 text-text-muted/30 hover:text-purple-400"
                        aria-label={`New note in ${folder}`}
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder);
                        }}
                        className="rounded p-0.5 text-text-muted/30 hover:text-coral"
                        aria-label={`Delete ${folder}`}
                        title="Delete folder"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  {isOpen &&
                    items.map((note) => {
                      const isNoteSelected =
                        selection?.type === "note" &&
                        selection.noteId === note.id;
                      return (
                        <div
                          key={note.id}
                          className={`my-1 rounded-[20px] py-1 pl-5 pr-1 transition-colors ${
                            isNoteSelected
                              ? "bg-purple-400/10 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.10)]"
                              : "hover:bg-purple-400/[0.05]"
                          }`}
                        >
                          <button
                            type="button"
                            draggable="true"
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", "drag");
                              e.dataTransfer.effectAllowed = "move";
                              dragRef.current = {
                                type: "note",
                                id: note.id,
                                sourceFolder: folder,
                              };
                            }}
                            onClick={() =>
                              navigate(`/workspace?note=${note.id}`)
                            }
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                type: "note",
                                id: note.id,
                              });
                            }}
                            className={`flex w-full items-center gap-2 rounded-[16px] px-3 py-2 text-left text-xs transition-colors cursor-grab active:cursor-grabbing select-none ${
                              isNoteSelected
                                ? "text-purple-400"
                                : "text-text-muted hover:text-text"
                            }`}
                          >
                            <FileText size={11} className="mt-0.5 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span
                                className="block"
                                style={{
                                  wordBreak: "break-word",
                                  lineHeight: "1.4",
                                }}
                              >
                                {note.title}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-text-muted/50">
                                {note.chapter_title ??
                                  note.subject_name ??
                                  "Note"}
                              </span>
                            </span>
                          </button>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {visibleFolders.length === 0 &&
              rootNotes.length === 0 &&
              sidebarModal !== "create-note-folder" && (
                <div className="px-4 py-6 text-center">
                  <p className="text-[10px] text-text-muted/40">
                    {activeSubjectName
                      ? `No notes for ${activeSubjectName} yet`
                      : "No subject notes yet"}
                  </p>
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
            onNavigateToNote={(noteId) =>
              setSelection({ type: "note", noteId })
            }
            onDeleteNote={() => {
              setSelection(null);
            }}
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

      {/* ========== CONTEXT MENU ========== */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-panel py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === "subject" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  setModalSubjectId(contextMenu.id as number);
                  if (!expandedSubjects.has(contextMenu.id as number)) {
                    setExpandedSubjects((prev) =>
                      new Set(prev).add(contextMenu.id as number),
                    );
                  }
                  setSidebarModal("create-chapter");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-panel-active"
              >
                <Plus size={12} />
                New Chapter
              </button>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  setModalSubjectId(contextMenu.id as number);
                  if (!expandedSubjects.has(contextMenu.id as number)) {
                    setExpandedSubjects((prev) =>
                      new Set(prev).add(contextMenu.id as number),
                    );
                  }
                  setSidebarModal("import-url");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-panel-active"
              >
                <Globe size={12} />
                Import URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  handleDeleteSubject(contextMenu.id as number);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-coral hover:bg-coral/5"
              >
                <Trash2 size={12} />
                Delete Subject
              </button>
            </>
          )}
          {contextMenu.type === "chapter" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  navigate(`/reader?chapter=${contextMenu.id}`);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-panel-active"
              >
                <BookOpen size={12} />
                Start Study
              </button>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  navigate(`/quiz?chapter=${contextMenu.id}`);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-panel-active"
              >
                <ClipboardCheck size={12} />
                Take Quiz
              </button>
            </>
          )}
          {contextMenu.type === "note-folder" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  handleCreateNote(contextMenu.id as string);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-panel-active"
              >
                <FileText size={12} />
                New Note
              </button>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  handleDeleteFolder(contextMenu.id as string);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-coral hover:bg-coral/5"
              >
                <Trash2 size={12} />
                Delete Folder
              </button>
            </>
          )}
          {contextMenu.type === "note" && (
            <>
              {/* Move to folder submenu */}
              {noteFolders.length > 0 && (
                <div className="border-b border-border-subtle pb-1 mb-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted/50">
                    Move to
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setContextMenu(null);
                      await handleMoveNote(contextMenu.id as number, null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-panel-active"
                  >
                    <FolderOpen size={12} className="text-text-muted/50" />
                    Root (no folder)
                  </button>
                  {noteFolders.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={async () => {
                        setContextMenu(null);
                        await handleMoveNote(contextMenu.id as number, f);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-panel-active"
                    >
                      <FolderOpen size={12} className="text-purple-400/60" />
                      {f}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  handleDeleteNote(contextMenu.id as number);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-coral hover:bg-coral/5"
              >
                <Trash2 size={12} />
                Delete Note
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
