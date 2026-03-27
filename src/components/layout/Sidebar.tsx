import { Search, Link } from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useVaultStore } from "../../stores/vault";
import VaultBrowser from "../vault/VaultBrowser";
import ImportDialog from "../vault/ImportDialog";
import PomodoroTimer from "./PomodoroTimer";
import TrackingSection from "./TrackingSection";

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
    <div className="w-[272px] h-screen bg-panel border-r border-border-subtle flex flex-col shrink-0 no-select">
      {/* Search + Import */}
      <div className="border-b border-border-subtle px-4 py-4">
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Workspace</p>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative rounded-xl border border-border-subtle bg-panel-alt px-3 py-2.5 shadow-[var(--shadow-panel)]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search vault..."
            value={searchQuery}
            onChange={handleSearch}
            data-search-input
            className="w-full bg-transparent pl-6 pr-1 text-sm text-text placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowImport(true)}
          title="Import URL"
          className="inline-flex items-center gap-1 rounded-xl border border-accent bg-accent px-3 py-2.5 text-xs font-medium text-white shadow-[var(--shadow-panel)] transition-all hover:translate-y-[-1px] hover:opacity-95"
        >
          <Link size={12} />
          <span>URL</span>
        </button>
        </div>
      </div>

      {/* File browser or search results */}
      <div className="flex-1 overflow-y-auto py-2">
        {searchQuery.trim() ? (
          <div className="px-3">
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                Results ({searchResults.length})
              </span>
              <button
                onClick={clearSearch}
                className="text-[10px] text-text-muted hover:text-text"
              >
                Clear
              </button>
            </div>
            {searchResults.length === 0 ? (
              <p className="text-xs text-text-muted px-2 py-4 text-center">No results found</p>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.file_path}
                  onClick={() => {
                    handleSelectFile(r.file_path);
                    clearSearch();
                  }}
                  className="mb-1.5 w-full rounded-xl border border-transparent bg-panel-alt px-3 py-3 text-left text-xs shadow-[var(--shadow-panel)] transition-colors hover:border-border-strong hover:bg-panel-active"
                >
                  <p className="truncate text-sm font-medium text-text">{r.topic || r.file_path.split("/").pop()}</p>
                  <p className="truncate text-[11px] text-text-muted">{r.subject}</p>
                </button>
              ))
            )}
          </div>
        ) : (
          <VaultBrowser />
        )}
      </div>

      {/* Study Time Tracking */}
      <TrackingSection />

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
