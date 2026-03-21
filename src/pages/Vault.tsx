import { useState } from "react";
import VaultBrowser from "../components/vault/VaultBrowser";
import { useVaultStore } from "../stores/vault";
import { readFile } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";

export default function VaultPage() {
  const { searchQuery, searchResults, search, clearSearch, selectedFile } =
    useVaultStore();
  const [fileContent, setFileContent] = useState<string | null>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    if (query) {
      search(query);
    } else {
      clearSearch();
    }
  };

  const handleFileSelect = async (path: string) => {
    useVaultStore.getState().selectFile(path);
    try {
      const content = await readFile(path);
      setFileContent(content);
    } catch {
      setFileContent(null);
    }
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

      {/* Right: file preview */}
      <div className="flex-1 p-8 overflow-y-auto">
        {selectedFile && fileContent ? (
          <div>
            <h3 className="text-lg font-semibold mb-4">
              {selectedFile.split("/").pop()?.replace(".md", "")}
            </h3>
            <pre className="text-sm text-text-muted whitespace-pre-wrap font-serif leading-relaxed">
              {parseFrontmatter(fileContent).content}
            </pre>
          </div>
        ) : (
          <p className="text-text-muted">Select a file to preview</p>
        )}
      </div>
    </div>
  );
}
