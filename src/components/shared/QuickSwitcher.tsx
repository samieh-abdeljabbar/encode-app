import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSubjects, listFiles } from "../../lib/tauri";
import { useVaultStore } from "../../stores/vault";
import type { FileEntry } from "../../lib/types";

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
}

interface FileResult {
  path: string;
  name: string;
  subject: string;
  type: string;
}

let cachedFiles: FileResult[] | null = null;

const TYPE_ICONS: Record<string, { letter: string; tooltip: string }> = {
  chapters: { letter: "C", tooltip: "Chapter" },
  flashcards: { letter: "F", tooltip: "Flashcard" },
  quizzes: { letter: "Q", tooltip: "Quiz" },
  "teach-backs": { letter: "T", tooltip: "Teach-Back" },
  maps: { letter: "M", tooltip: "Map" },
  daily: { letter: "D", tooltip: "Daily" },
};

export default function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const navigate = useNavigate();
  const selectFile = useVaultStore((s) => s.selectFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileResult[]>([]);
  const [filtered, setFiltered] = useState<FileResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const loadFiles = async () => {
    const subjects = await listSubjects();
    const all: FileResult[] = [];
    for (const subj of subjects) {
      for (const ft of ["chapters", "flashcards", "quizzes", "teach-backs", "maps"]) {
        try {
          const entries: FileEntry[] = await listFiles(subj.slug, ft);
          for (const e of entries) {
            all.push({
              path: e.file_path,
              name: e.file_path.split("/").pop()?.replace(".md", "") || "",
              subject: subj.name,
              type: ft,
            });
          }
        } catch {
          // No files of this type
        }
      }
    }
    cachedFiles = all;
    setFiles(all);
    setFiltered(all);
  };

  // Load all files on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIdx(0);
    setTimeout(() => inputRef.current?.focus(), 50);

    if (cachedFiles) {
      setFiles(cachedFiles);
      setFiltered(cachedFiles);
      return;
    }

    loadFiles().catch(() => {
      setFiles([]);
      setFiltered([]);
    });
  }, [open]);

  // Filter on query change
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(files);
      setSelectedIdx(0);
      return;
    }
    const q = query.toLowerCase();
    const matches = files
      .map((file) => ({ file, score: fuzzyScore(file, q) }))
      .filter((entry): entry is { file: FileResult; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name))
      .map((entry) => entry.file);
    setFiltered(matches);
    setSelectedIdx(0);
  }, [query, files]);

  const handleSelect = (file: FileResult) => {
    selectFile(file.path);
    navigate("/vault");
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      handleSelect(filtered[selectedIdx]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative w-[520px] max-h-[60vh] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className="w-full bg-transparent text-text text-base outline-none placeholder:text-text-muted"
          />
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[45vh]">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              {files.length === 0 ? "Loading..." : "No files found"}
            </div>
          ) : (
            filtered.slice(0, 20).map((f, i) => (
              <button
                key={f.path}
                onClick={() => handleSelect(f)}
                onMouseEnter={() => setSelectedIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIdx
                    ? "bg-surface-2"
                    : "hover:bg-surface-2/50"
                }`}
              >
                {/* Type badge */}
                <span
                  title={TYPE_ICONS[f.type]?.tooltip || f.type}
                  className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold shrink-0 ${
                    f.type === "chapters"
                      ? "bg-purple/20 text-purple"
                      : f.type === "flashcards"
                        ? "bg-teal/20 text-teal"
                        : f.type === "quizzes"
                          ? "bg-amber/20 text-amber"
                          : "bg-border text-text-muted"
                  }`}
                >
                  {TYPE_ICONS[f.type]?.letter || "?"}
                </span>

                {/* File name */}
                <span className="flex-1 text-sm text-text truncate">
                  {f.name}
                </span>

                {/* Subject badge */}
                <span className="text-[10px] text-text-muted bg-surface-2 px-2 py-0.5 rounded shrink-0">
                  {f.subject}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex gap-4 text-[10px] text-text-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function fuzzyScore(file: FileResult, query: string): number | null {
  const haystacks = [
    `${file.name} ${file.subject}`.toLowerCase(),
    file.path.toLowerCase(),
    file.type.toLowerCase(),
  ];

  let bestScore: number | null = null;

  for (const haystack of haystacks) {
    const exactIndex = haystack.indexOf(query);
    if (exactIndex !== -1) {
      const score = 1000 - exactIndex * 5 - Math.max(0, haystack.length - query.length);
      bestScore = bestScore === null ? score : Math.max(bestScore, score);
      continue;
    }

    let lastIndex = -1;
    let gapPenalty = 0;
    let matched = true;
    for (const char of query) {
      const nextIndex = haystack.indexOf(char, lastIndex + 1);
      if (nextIndex === -1) {
        matched = false;
        break;
      }
      if (lastIndex !== -1) {
        gapPenalty += nextIndex - lastIndex - 1;
      }
      lastIndex = nextIndex;
    }

    if (matched) {
      const score = 500 - gapPenalty - (lastIndex - query.length);
      bestScore = bestScore === null ? score : Math.max(bestScore, score);
    }
  }

  return bestScore;
}
