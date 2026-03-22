import { useEffect, useState } from "react";
import VaultBrowser from "../components/vault/VaultBrowser";
import MarkdownRenderer from "../components/shared/MarkdownRenderer";
import { useVaultStore } from "../stores/vault";
import { readFile, writeFile } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";

export default function VaultPage() {
  const { searchQuery, searchResults, search, clearSearch, selectedFile } =
    useVaultStore();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Load file content whenever selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      setEditing(false);
      return;
    }
    readFile(selectedFile)
      .then((content) => {
        setFileContent(content);
        setEditing(false);
      })
      .catch(() => setFileContent(null));
  }, [selectedFile]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    if (query) {
      search(query);
    } else {
      clearSearch();
    }
  };

  const handleFileSelect = (path: string) => {
    useVaultStore.getState().selectFile(path);
  };

  const handleEdit = () => {
    if (fileContent) {
      setEditContent(fileContent);
      setEditing(true);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditContent("");
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await writeFile(selectedFile, editContent);
      setFileContent(editContent);
      setEditing(false);
    } catch (e) {
      console.error("Save failed:", e);
    }
    setSaving(false);
  };

  return (
    <div className="flex h-full">
      {/* Left: browser + search */}
      <div className="w-[280px] border-r border-border p-4 overflow-y-auto shrink-0">
        <input
          type="text"
          placeholder="Search vault..."
          value={searchQuery}
          onChange={handleSearch}
          className="w-full px-3 py-2 mb-4 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
        />

        {searchQuery && searchResults.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-text-muted mb-2">
              {searchResults.length} results
            </p>
            {searchResults.map((r) => (
              <button
                key={r.file_path}
                onClick={() => handleFileSelect(r.file_path)}
                className="w-full text-left p-2 bg-surface rounded hover:bg-surface-2 text-xs"
              >
                <div className="text-text truncate">
                  {r.topic || r.file_path}
                </div>
                <div
                  className="text-text-muted mt-1"
                  dangerouslySetInnerHTML={{ __html: r.excerpt }}
                />
              </button>
            ))}
          </div>
        ) : (
          <VaultBrowser />
        )}
      </div>

      {/* Right: file preview / editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile && fileContent !== null ? (
          <>
            {/* Header bar */}
            <div className="flex items-center justify-between px-8 py-3 border-b border-border shrink-0">
              <h3 className="text-lg font-semibold truncate">
                {selectedFile.split("/").pop()?.replace(".md", "")}
              </h3>
              <div className="flex gap-2 shrink-0">
                {editing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-text hover:border-text-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-3 py-1 text-xs bg-teal text-white rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEdit}
                    className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-text hover:border-purple transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Content area — click to edit */}
            <div className="flex-1 overflow-y-auto">
              {editing ? (
                <textarea
                  autoFocus
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full p-8 bg-bg text-text text-sm font-mono leading-relaxed resize-none focus:outline-none"
                  spellCheck={false}
                />
              ) : (
                <div
                  onClick={handleEdit}
                  className="p-8 cursor-text min-h-full"
                >
                  <MarkdownRenderer
                    content={parseFrontmatter(fileContent).content}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Select a file to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}
