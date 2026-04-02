import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createChapter,
  createSubject,
  deleteSubject,
  importUrl,
  listChapters,
  listSubjects,
  searchContent,
} from "../lib/tauri";
import type { Chapter, SearchResult, Subject } from "../lib/tauri";

type Modal = "create-subject" | "import-url" | "create-chapter" | null;

const STATUS_DOT: Record<string, string> = {
  new: "bg-text-muted/40",
  reading: "bg-blue-400",
  awaiting_synthesis: "bg-amber-400",
  ready_for_quiz: "bg-orange-400",
  mastering: "bg-green-400",
  stable: "bg-teal-400",
};

export function Library() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    null,
  );
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [chaptersMap, setChaptersMap] = useState<Record<number, Chapter[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeModal, setActiveModal] = useState<Modal>(null);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [importUrlValue, setImportUrlValue] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which subjects have had chapters loaded
  const loadedSubjects = useRef<Set<number>>(new Set());

  const selectedSubject =
    subjects.find((s) => s.id === selectedSubjectId) ?? null;
  const chapters = selectedSubjectId
    ? (chaptersMap[selectedSubjectId] ?? [])
    : [];

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

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  // When a subject is expanded, load its chapters
  useEffect(() => {
    for (const id of expanded) {
      loadChaptersForSubject(id);
    }
  }, [expanded, loadChaptersForSubject]);

  const toggleExpand = (subjectId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
    setSelectedSubjectId(subjectId);
  };

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchContent(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  }, []);

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const subject = await createSubject(newSubjectName);
      setSubjects((prev) => [...prev, subject]);
      setNewSubjectName("");
      setActiveModal(null);
      // Auto-expand the new subject
      setExpanded((prev) => new Set(prev).add(subject.id));
      setSelectedSubjectId(subject.id);
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
      if (selectedSubjectId === id) {
        setSelectedSubjectId(null);
      }
      setExpanded((prev) => {
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

  const handleImport = async () => {
    if (!importUrlValue.trim() || !selectedSubject) return;
    setLoading(true);
    setError(null);
    try {
      const chapter = await importUrl(importUrlValue, selectedSubject.id);
      setChaptersMap((prev) => ({
        ...prev,
        [selectedSubject.id]: [...(prev[selectedSubject.id] ?? []), chapter],
      }));
      setImportUrlValue("");
      setActiveModal(null);
      await loadSubjects();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChapter = async () => {
    if (!newChapterTitle.trim() || !selectedSubject) return;
    setLoading(true);
    setError(null);
    try {
      const chapter = await createChapter(
        selectedSubject.id,
        newChapterTitle,
        "",
      );
      setNewChapterTitle("");
      setActiveModal(null);
      navigate(`/chapter?id=${chapter.id}&edit=true`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const isSearchActive = searchQuery.trim().length >= 2;

  return (
    <div className="flex h-full">
      {/* Sidebar: subject tree with nested chapters */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border-subtle bg-panel">
        <div className="flex items-center justify-between border-b border-border-subtle/60 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Library
          </span>
          <button
            type="button"
            onClick={() => setActiveModal("create-subject")}
            aria-label="Create subject"
            className="rounded p-1 text-text-muted hover:bg-panel-active hover:text-accent"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Inline create-subject input */}
        {activeModal === "create-subject" && (
          <div className="border-b border-border-subtle px-3 py-2">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSubject();
                if (e.key === "Escape") setActiveModal(null);
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
                onClick={() => setActiveModal(null)}
                className="rounded px-2.5 py-1 text-[10px] text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-1 py-1">
          {subjects.map((subject) => {
            const isOpen = expanded.has(subject.id);
            const isSelected = selectedSubjectId === subject.id;
            const subjectChapters = chaptersMap[subject.id] ?? [];
            return (
              <div key={subject.id}>
                {/* Subject row */}
                <div className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleExpand(subject.id)}
                    className={`flex flex-1 items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? "bg-accent/10 font-medium text-accent"
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
                      className={`shrink-0 ${isSelected ? "text-accent" : "text-accent/50"}`}
                    />
                    <span className="flex-1 truncate text-left">
                      {subject.name}
                    </span>
                    <span
                      className={`text-[10px] tabular-nums ${isSelected ? "text-accent/60" : "text-text-muted/40"}`}
                    >
                      {subject.chapter_count}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSubjectId(subject.id);
                      if (!expanded.has(subject.id)) {
                        setExpanded((prev) => new Set(prev).add(subject.id));
                      }
                      setActiveModal("create-chapter");
                    }}
                    className="mr-1 rounded p-0.5 text-text-muted/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
                    aria-label={`New chapter in ${subject.name}`}
                  >
                    <Plus size={11} />
                  </button>
                </div>

                {/* Nested chapters */}
                {isOpen &&
                  subjectChapters.map((chapter) => (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => navigate(`/chapter?id=${chapter.id}`)}
                      className="flex w-full items-center gap-2 rounded py-1.5 pl-8 pr-2 text-left text-xs text-text-muted transition-colors hover:bg-panel-active hover:text-text"
                    >
                      <FileText size={11} className="shrink-0" />
                      <span className="flex-1 truncate">{chapter.title}</span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[chapter.status] ?? "bg-text-muted/30"}`}
                        title={chapter.status}
                      />
                    </button>
                  ))}

                {isOpen && subjectChapters.length === 0 && (
                  <div className="py-2 pl-8 pr-2 text-[10px] text-text-muted/40">
                    No chapters
                  </div>
                )}
              </div>
            );
          })}

          {subjects.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-text-muted/50">No subjects yet</p>
              <p className="mt-1 text-[10px] text-text-muted/40">
                Click + to create one
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Search bar */}
        <div className="shrink-0 border-b border-border-subtle/60 px-7 py-4">
          <div className="relative max-w-3xl">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/40"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search all content..."
              className="h-11 w-full rounded-2xl border border-border bg-panel px-4 pl-10 text-sm text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {error && (
            <div className="mx-7 mt-5 rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 text-coral/50 hover:text-coral"
              >
                dismiss
              </button>
            </div>
          )}

          {/* Search results */}
          {isSearchActive ? (
            <div className="px-7 py-7">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                Results ({searchResults.length})
              </h3>
              {searchResults.map((result, i) => (
                <button
                  key={`${result.chapter_id}-${result.section_heading ?? i}`}
                  type="button"
                  onClick={() => navigate(`/chapter?id=${result.chapter_id}`)}
                  className="mb-3 w-full rounded-xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/30 hover:shadow-sm"
                >
                  <div className="text-sm font-medium text-text">
                    {result.chapter_title}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {result.subject_name}
                    {result.section_heading && (
                      <span className="text-text-muted/50">
                        {" "}
                        &rsaquo; {result.section_heading}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-2 text-xs leading-relaxed text-text-muted/80"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: FTS5 snippet with <mark> tags
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                </button>
              ))}
              {searchResults.length === 0 && (
                <p className="py-10 text-center text-sm text-text-muted">
                  No results found
                </p>
              )}
            </div>
          ) : selectedSubject ? (
            <div className="px-7 py-7">
              {/* Subject header */}
              <div className="mb-7 flex items-start justify-between gap-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-text">
                    {selectedSubject.name}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {chapters.length} chapter
                    {chapters.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal("import-url")}
                    className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
                  >
                    <Globe size={13} />
                    Import URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal("create-chapter")}
                    className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90 hover:shadow-md"
                  >
                    <Plus size={13} />
                    New Chapter
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubject(selectedSubject.id)}
                    aria-label="Delete subject"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-coral/8 hover:text-coral"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Import URL form */}
              {activeModal === "import-url" && (
                <div className="mb-6 rounded-xl border border-border bg-panel p-6">
                  <h3 className="mb-4 text-sm font-medium text-text">
                    Import from URL
                  </h3>
                  <input
                    type="url"
                    value={importUrlValue}
                    onChange={(e) => setImportUrlValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleImport()}
                    placeholder="https://..."
                    autoFocus
                    className="h-11 w-full rounded-xl border border-border bg-panel-alt px-4 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={loading}
                      className="h-10 rounded-xl bg-accent px-4 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      {loading ? "Importing..." : "Import"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="h-10 rounded-xl px-4 text-xs text-text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* New chapter form */}
              {activeModal === "create-chapter" && (
                <div className="mb-6 rounded-xl border border-border bg-panel p-6">
                  <h3 className="mb-4 text-sm font-medium text-text">
                    New Chapter
                  </h3>
                  <input
                    type="text"
                    value={newChapterTitle}
                    onChange={(e) => setNewChapterTitle(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreateChapter()
                    }
                    placeholder="Chapter title..."
                    autoFocus
                    className="h-11 w-full rounded-xl border border-border bg-panel-alt px-4 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateChapter}
                      disabled={loading}
                      className="h-10 rounded-xl bg-accent px-4 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      {loading ? "Creating..." : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="h-10 rounded-xl px-4 text-xs text-text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {chapters.length === 0 && activeModal === null && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/50 py-16 text-center">
                  <p className="text-sm text-text-muted">
                    No chapters yet — import a URL or create one above
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full px-7 py-10">
              <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-accent/6">
                  <BookOpen size={24} className="text-accent/40" />
                </div>
                <p className="text-base font-medium text-text-muted">
                  Select a subject
                </p>
                <p className="mt-2 text-sm text-text-muted/50">
                  Expand a subject in the sidebar to browse chapters
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
