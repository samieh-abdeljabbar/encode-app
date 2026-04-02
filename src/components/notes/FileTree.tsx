import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Plus,
} from "lucide-react";
import { useState } from "react";
import type { NoteInfo } from "../../lib/tauri";

interface FileTreeProps {
  folders: string[];
  notes: NoteInfo[];
  selectedNoteId: number | null;
  onSelectNote: (noteId: number) => void;
  onCreateNote: (folder: string | null) => void;
  onCreateFolder: (path: string) => void;
}

export function FileTree({
  folders,
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folders));
  const [newFolderInput, setNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const toggleFolder = (folder: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  // Group notes by folder
  const rootNotes = notes.filter((n) => !n.file_path.includes("/"));
  const folderNotes = (folder: string) =>
    notes.filter(
      (n) =>
        n.file_path.startsWith(`${folder}/`) &&
        !n.file_path.slice(folder.length + 1).includes("/"),
    );

  const handleNewFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setNewFolderInput(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle/60 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
          Notes
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onCreateNote(null)}
            aria-label="New note"
            className="rounded p-1 text-text-muted hover:bg-panel-active hover:text-text"
          >
            <FileText size={12} />
          </button>
          <button
            type="button"
            onClick={() => setNewFolderInput(true)}
            aria-label="New folder"
            className="rounded p-1 text-text-muted hover:bg-panel-active hover:text-text"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1 py-1">
        {/* New folder input */}
        {newFolderInput && (
          <div className="px-2 py-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewFolder();
                if (e.key === "Escape") setNewFolderInput(false);
              }}
              onBlur={handleNewFolder}
              placeholder="Folder name..."
              autoFocus
              className="w-full rounded bg-bg px-2 py-1 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>
        )}

        {/* Root notes (not in any folder) */}
        {rootNotes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => onSelectNote(note.id)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
              selectedNoteId === note.id
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-panel-active hover:text-text"
            }`}
          >
            <FileText size={12} className="shrink-0" />
            <span className="truncate">{note.title}</span>
          </button>
        ))}

        {/* Folders with nested notes */}
        {folders.map((folder) => {
          const isOpen = expanded.has(folder);
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
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <FolderOpen size={12} className="text-amber-400/70" />
                  <span className="truncate">{folder.split("/").pop()}</span>
                  <span className="ml-auto text-[10px] text-text-muted/40">
                    {items.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateNote(folder);
                  }}
                  className="mr-1 rounded p-0.5 text-text-muted/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-text"
                  aria-label={`New note in ${folder}`}
                >
                  <Plus size={11} />
                </button>
              </div>
              {isOpen &&
                items.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onSelectNote(note.id)}
                    className={`flex w-full items-center gap-2 rounded py-1.5 pl-8 pr-2 text-left text-xs transition-colors ${
                      selectedNoteId === note.id
                        ? "bg-accent/10 text-accent"
                        : "text-text-muted hover:bg-panel-active hover:text-text"
                    }`}
                  >
                    <FileText size={11} className="shrink-0" />
                    <span className="truncate">{note.title}</span>
                  </button>
                ))}
            </div>
          );
        })}

        {folders.length === 0 && rootNotes.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-text-muted/50">No notes yet</p>
            <p className="mt-1 text-[10px] text-text-muted/40">
              Click the icons above to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
