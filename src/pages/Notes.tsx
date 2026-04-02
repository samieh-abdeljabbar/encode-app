import {
  ArrowUpDown,
  Calendar,
  FileText,
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileTree } from "../components/notes/FileTree";
import {
  createNote,
  createNoteFolder,
  listNoteFolders,
  listNotes,
  searchNotes,
} from "../lib/tauri";
import type { NoteInfo, NoteSearchResult } from "../lib/tauri";

type Modal = "create-note" | null;
type SortField = "name" | "modified";

export function Notes() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteSearchResult[]>([]);
  const [sortBy, setSortBy] = useState<SortField>("modified");
  const [activeModal, setActiveModal] = useState<Modal>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newFolder, setNewFolder] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const data = await listNoteFolders();
      setFolders(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadNotes = useCallback(async (folder: string | null) => {
    try {
      const data = await listNotes(folder ?? undefined);
      setNotes(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    loadNotes(selectedFolder);
  }, [selectedFolder, loadNotes]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchNotes(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  }, []);

  const handleCreateNote = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const note = await createNote(trimmed, newFolder || null, null, "");
      setNewTitle("");
      setNewFolder("");
      setActiveModal(null);
      navigate(`/notes/${note.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = useCallback(
    async (path: string) => {
      try {
        await createNoteFolder(path);
        await loadFolders();
      } catch (e) {
        setError(String(e));
      }
    },
    [loadFolders],
  );

  const sortedNotes = [...notes].sort((a, b) => {
    if (sortBy === "name") return a.title.localeCompare(b.title);
    return (
      new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
    );
  });

  const isSearchActive = searchQuery.trim().length >= 2;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex h-full">
      {/* Folder sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-panel">
        <FileTree
          folders={folders}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          onCreateFolder={handleCreateFolder}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header bar */}
        <div className="shrink-0 border-b border-border-subtle/60 px-7 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xl">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/40"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search notes..."
                className="h-11 w-full rounded-2xl border border-border bg-panel px-4 pl-10 text-sm text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setSortBy((s) => (s === "name" ? "modified" : "name"))
              }
              aria-label={`Sort by ${sortBy === "name" ? "modified" : "name"}`}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
            >
              <ArrowUpDown size={13} />
              {sortBy === "name" ? "Name" : "Modified"}
            </button>
            <button
              type="button"
              onClick={() => setActiveModal("create-note")}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90 hover:shadow-md"
            >
              <Plus size={13} />
              New Note
            </button>
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

          {/* Create note modal */}
          {activeModal === "create-note" && (
            <div className="mx-7 mt-5 rounded-xl border border-border bg-panel p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-text">New Note</h3>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="text-text-muted hover:text-text"
                >
                  <X size={14} />
                </button>
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateNote()}
                placeholder="Note title..."
                autoFocus
                className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
              />
              <select
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                className="mt-3 h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-text focus:border-accent/40 focus:outline-none"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateNote}
                  disabled={loading}
                  className="rounded-xl bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="rounded-xl px-4 py-2 text-xs text-text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isSearchActive ? (
            <div className="px-7 py-7">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                Results ({searchResults.length})
              </h3>
              {searchResults.map((result) => (
                <button
                  key={result.note_id}
                  type="button"
                  onClick={() => navigate(`/notes/${result.note_id}`)}
                  className="mb-3 w-full rounded-xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/30 hover:shadow-sm"
                >
                  <div className="text-sm font-medium text-text">
                    {result.title}
                  </div>
                  <div className="mt-1 text-xs text-text-muted/60">
                    {result.file_path}
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
          ) : (
            <div className="px-7 py-7">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                {selectedFolder
                  ? `${selectedFolder} (${sortedNotes.length})`
                  : `All Notes (${sortedNotes.length})`}
              </h3>

              {sortedNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => navigate(`/notes/${note.id}`)}
                  className="mb-3 flex w-full items-center gap-4 rounded-xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/25 hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/6">
                    <FileText size={15} className="text-accent/70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium tracking-tight text-text">
                      {note.title}
                    </div>
                    <div className="mt-1 flex items-center gap-2.5 text-xs text-text-muted">
                      {note.subject_name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft/50 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          {note.subject_name}
                        </span>
                      )}
                      {note.tags.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Tag size={10} className="text-text-muted/50" />
                          {note.tags.slice(0, 3).join(", ")}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-text-muted/50">
                        <Calendar size={10} />
                        {formatDate(note.modified_at)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {sortedNotes.length === 0 && activeModal === null && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/50 py-20 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/6">
                    <FileText size={20} className="text-accent/40" />
                  </div>
                  <p className="text-sm font-medium text-text-muted">
                    No notes yet
                  </p>
                  <p className="mt-1 text-xs text-text-muted/60">
                    Create your first note to get started
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
