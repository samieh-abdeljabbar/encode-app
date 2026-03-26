import { Search, Link } from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useVaultStore } from "../../stores/vault";
import VaultBrowser from "../vault/VaultBrowser";
import ImportDialog from "../vault/ImportDialog";
import PomodoroTimer from "./PomodoroTimer";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { searchQuery, searchResults, search, clearSearch } = useVaultStore();
  const store = useVaultStore();
  const [showImport, setShowImport] = useState(false);

  /** Select a file and navigate to vault if not already there */
  const handleSelectFile = (path: string) => {
    store.selectFile(path);
    if (location.pathname !== "/vault") {
      navigate("/vault");
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    if (query) {
      search(query);
    } else {
      clearSearch();
    }
  };

  return (
    <div className="w-[260px] h-screen bg-surface border-r border-border flex flex-col shrink-0 no-select">
      {/* Search + Import */}
      <div className="p-3 border-b border-border flex gap-2">
        <div className="flex-1 relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search vault..."
            value={searchQuery}
            onChange={handleSearch}
            data-search-input
            className="w-full pl-8 pr-3 py-1.5 bg-surface-2 border border-border rounded text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
          />
        </div>
        <button
          onClick={() => setShowImport(true)}
          title="Import URL"
          className="px-2 py-1.5 bg-purple text-white rounded text-xs hover:opacity-90 flex items-center gap-1"
        >
          <Link size={12} />
          <span>URL</span>
        </button>
      </div>

      {/* File browser or search results */}
      <div className="flex-1 overflow-y-auto py-1">
        {searchResults.length > 0 ? (
          <div className="px-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                Results
              </span>
              <button
                onClick={clearSearch}
                className="text-[10px] text-text-muted hover:text-text"
              >
                Clear
              </button>
            </div>
            {searchResults.map((r) => (
              <button
                key={r.file_path}
                onClick={() => {
                  handleSelectFile(r.file_path);
                  clearSearch();
                }}
                className="w-full text-left px-2 py-2 text-xs rounded hover:bg-surface-2 transition-colors"
              >
                <p className="text-text truncate">{r.topic || r.file_path.split("/").pop()}</p>
                <p className="text-text-muted text-[10px] truncate">{r.subject}</p>
              </button>
            ))}
          </div>
        ) : (
          <VaultBrowser />
        )}
      </div>

      {/* Pomodoro Timer */}
      <PomodoroTimer />

      {/* Import dialog */}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={(filePath) => {
            setShowImport(false);
            store.selectFile(filePath);
            store.loadSubjects();
            const parts = filePath.split("/");
            if (parts.length >= 2) {
              store.loadFiles(parts[1]);
            }
          }}
        />
      )}
    </div>
  );
}
