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

const TYPE_ICONS: Record<string, string> = {
  chapters: "B",
  flashcards: "F",
  quizzes: "Q",
  "teach-backs": "T",
  maps: "M",
  daily: "D",
};

export default function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const navigate = useNavigate();
  const selectFile = useVaultStore((s) => s.selectFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileResult[]>([]);
  const [filtered, setFiltered] = useState<FileResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Load all files on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIdx(0);
    setTimeout(() => inputRef.current?.focus(), 50);

    (async () => {
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
      setFiles(all);
      setFiltered(all);
    })();
  }, [open]);

  // Filter on query change
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(files);
      setSelectedIdx(0);
      return;
    }
    const q = query.toLowerCase();
    const matches = files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.subject.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q),
    );
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
        className="relative w-[520px] max-h-[60vh] bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b border-[#333]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className="w-full bg-transparent text-[#e5e5e5] text-base outline-none placeholder:text-[#888880]"
          />
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[45vh]">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#888880]">
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
                    ? "bg-[#252525]"
                    : "hover:bg-[#1f1f1f]"
                }`}
              >
                {/* Type badge */}
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold shrink-0 ${
                    f.type === "chapters"
                      ? "bg-[#7F77DD]/20 text-[#7F77DD]"
                      : f.type === "flashcards"
                        ? "bg-[#1D9E75]/20 text-[#1D9E75]"
                        : f.type === "quizzes"
                          ? "bg-[#BA7517]/20 text-[#BA7517]"
                          : "bg-[#333] text-[#888880]"
                  }`}
                >
                  {TYPE_ICONS[f.type] || "?"}
                </span>

                {/* File name */}
                <span className="flex-1 text-sm text-[#e5e5e5] truncate">
                  {f.name}
                </span>

                {/* Subject badge */}
                <span className="text-[10px] text-[#888880] bg-[#252525] px-2 py-0.5 rounded shrink-0">
                  {f.subject}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#333] flex gap-4 text-[10px] text-[#888880]">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
