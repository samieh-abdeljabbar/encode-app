import { FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileTree } from "../components/notes/FileTree";
import {
  createNote,
  createNoteFolder,
  listNoteFolders,
  listNotes,
} from "../lib/tauri";
import type { NoteInfo } from "../lib/tauri";
import { NoteEditor } from "./NoteEditor";

export function Notes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get("id")
    ? Number(searchParams.get("id"))
    : null;

  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [folders, setFolders] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [n, f] = await Promise.all([listNotes(), listNoteFolders()]);
      setNotes(n);
      setFolders(f);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectNote = (noteId: number) => {
    navigate(`/notes?id=${noteId}`);
  };

  const handleCreateNote = async (folder: string | null) => {
    try {
      const note = await createNote("Untitled", folder, null, "");
      await loadData();
      navigate(`/notes?id=${note.id}`);
    } catch {
      /* silent */
    }
  };

  const handleCreateFolder = async (path: string) => {
    try {
      await createNoteFolder(path);
      await loadData();
    } catch {
      /* silent */
    }
  };

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div className="w-56 shrink-0 border-r border-border-subtle bg-panel">
        <FileTree
          folders={folders}
          notes={notes}
          selectedNoteId={selectedId}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
        />
      </div>

      {/* Main area: editor or empty state */}
      <div className="flex-1 overflow-hidden">
        {selectedId ? (
          <NoteEditor
            key={selectedId}
            noteId={selectedId}
            onNoteChanged={loadData}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/6">
                <FileText size={20} className="text-accent/40" />
              </div>
              <p className="text-sm text-text-muted">
                Select a note or create a new one
              </p>
              <p className="mt-1 text-xs text-text-muted/50">
                Use the sidebar to browse your notes
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
