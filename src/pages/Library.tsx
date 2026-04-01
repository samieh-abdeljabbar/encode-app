import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  Globe,
  MessageSquare,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

export function Library() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeModal, setActiveModal] = useState<Modal>(null);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [importUrlValue, setImportUrlValue] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    try {
      const data = await listSubjects();
      setSubjects(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadChapters = useCallback(async (subjectId: number) => {
    try {
      const data = await listChapters(subjectId);
      setChapters(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    if (selectedSubject) {
      loadChapters(selectedSubject.id);
    }
  }, [selectedSubject, loadChapters]);

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
      if (selectedSubject?.id === id) {
        setSelectedSubject(null);
        setChapters([]);
      }
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
      setChapters((prev) => [...prev, chapter]);
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
      {/* Subject sidebar */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border-subtle bg-panel">
        <div className="flex items-center justify-between border-b border-border-subtle/60 px-5 py-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
            Subjects
          </h2>
          <button
            type="button"
            onClick={() => setActiveModal("create-subject")}
            aria-label="Create subject"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-accent"
          >
            <Plus size={14} />
          </button>
        </div>

        {activeModal === "create-subject" && (
          <div className="border-b border-border-subtle px-5 py-4">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubject()}
              placeholder="Subject name..."
              autoFocus
              className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
            />
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={handleCreateSubject}
                disabled={loading}
                className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-lg px-3.5 py-1.5 text-xs text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-3 py-3">
          {subjects.map((subject) => {
            const isActive = selectedSubject?.id === subject.id;
            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => setSelectedSubject(subject)}
                className={`mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all ${
                  isActive
                    ? "bg-accent/10 font-medium text-accent shadow-[inset_0_0_0_1px_rgba(45,106,79,0.08)]"
                    : "text-text-muted hover:bg-panel-active hover:text-text"
                }`}
              >
                <BookOpen
                  size={14}
                  className={`shrink-0 ${isActive ? "text-accent" : ""}`}
                />
                <span className="flex-1 truncate">{subject.name}</span>
                <span
                  className={`text-[11px] tabular-nums ${isActive ? "text-accent/60" : "text-text-muted/50"}`}
                >
                  {subject.chapter_count}
                </span>
              </button>
            );
          })}
          {subjects.length === 0 && (
            <div className="px-4 py-14 text-center">
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
                        › {result.section_heading}
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

              {/* Chapter list */}
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => navigate(`/chapter?id=${chapter.id}`)}
                  className="mb-3 flex w-full items-center gap-4 rounded-xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/25 hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/6">
                    <FileText size={15} className="text-accent/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium tracking-tight text-text">
                      {chapter.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2.5 text-xs text-text-muted">
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft/50 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        {chapter.status}
                      </span>
                      {chapter.estimated_minutes && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} />
                          {chapter.estimated_minutes} min
                        </span>
                      )}
                      {chapter.section_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-text-muted/50">
                          {chapter.checked_count}/{chapter.section_count}
                        </span>
                      )}
                    </div>
                  </div>
                  {["ready_for_quiz", "mastering", "stable"].includes(
                    chapter.status,
                  ) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/quiz?chapter=${chapter.id}`);
                      }}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 text-[11px] font-medium text-accent transition-all hover:bg-accent/10"
                    >
                      <ClipboardCheck size={12} />
                      Take Quiz
                    </button>
                  )}
                  {["mastering", "stable"].includes(chapter.status) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/teachback?chapter=${chapter.id}`);
                      }}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-500/5 px-3 text-[11px] font-medium text-purple-400 transition-all hover:bg-purple-500/10"
                    >
                      <MessageSquare size={12} />
                      Teach Back
                    </button>
                  )}
                  <ChevronRight size={14} className="text-text-muted/40" />
                </button>
              ))}

              {chapters.length === 0 && activeModal === null && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/50 py-20 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/6">
                    <FileText size={20} className="text-accent/40" />
                  </div>
                  <p className="text-sm font-medium text-text-muted">
                    No chapters yet
                  </p>
                  <p className="mt-1 text-xs text-text-muted/60">
                    Import a URL or create a chapter to get started
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
                  Choose from the sidebar to view chapters
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
