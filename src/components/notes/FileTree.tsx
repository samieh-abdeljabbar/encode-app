import { ChevronRight, Folder, FolderOpen, Plus } from "lucide-react";
import { useCallback, useState } from "react";

interface FileTreeProps {
  folders: string[];
  selectedFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  onCreateFolder: (path: string) => void;
}

export function FileTree({
  folders,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
}: FileTreeProps) {
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const handleCreate = useCallback(() => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    onCreateFolder(trimmed);
    setNewFolderName("");
    setShowNewFolder(false);
  }, [newFolderName, onCreateFolder]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle/60 px-5 py-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
          Folders
        </h2>
        <button
          type="button"
          onClick={() => setShowNewFolder(true)}
          aria-label="New folder"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-accent"
        >
          <Plus size={14} />
        </button>
      </div>

      {showNewFolder && (
        <div className="border-b border-border-subtle px-5 py-3">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setShowNewFolder(false);
            }}
            placeholder="Folder name..."
            autoFocus
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent/90"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowNewFolder(false)}
              className="rounded-lg px-3 py-1 text-xs text-text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-3 py-3">
        {/* All Notes option */}
        <button
          type="button"
          onClick={() => onSelectFolder(null)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all ${
            selectedFolder === null
              ? "bg-accent/10 font-medium text-accent shadow-[inset_0_0_0_1px_rgba(45,106,79,0.08)]"
              : "text-text-muted hover:bg-panel-active hover:text-text"
          }`}
        >
          <FolderOpen
            size={14}
            className={`shrink-0 ${selectedFolder === null ? "text-accent" : ""}`}
          />
          <span className="flex-1 truncate">All Notes</span>
        </button>

        {/* Folder list */}
        {folders.map((folder) => {
          const isActive = selectedFolder === folder;
          return (
            <button
              key={folder}
              type="button"
              onClick={() => onSelectFolder(folder)}
              className={`mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all ${
                isActive
                  ? "bg-accent/10 font-medium text-accent shadow-[inset_0_0_0_1px_rgba(45,106,79,0.08)]"
                  : "text-text-muted hover:bg-panel-active hover:text-text"
              }`}
            >
              <ChevronRight
                size={12}
                className={`shrink-0 transition-transform ${isActive ? "rotate-90 text-accent" : ""}`}
              />
              <Folder
                size={14}
                className={`shrink-0 ${isActive ? "text-accent" : ""}`}
              />
              <span className="flex-1 truncate">{folder}</span>
            </button>
          );
        })}

        {folders.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-text-muted/50">No folders yet</p>
            <p className="mt-1 text-[10px] text-text-muted/40">
              Click + to create one
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
