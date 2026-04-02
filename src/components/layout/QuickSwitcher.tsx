import { BookOpen, FileText, Search, StickyNote } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listChapters, listNotes, listSubjects } from "../../lib/tauri";

interface SwitcherItem {
  type: "subject" | "chapter" | "note";
  id: number;
  name: string;
  subjectName?: string;
  path: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function QuickSwitcher({ open, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SwitcherItem[]>([]);
  const [filtered, setFiltered] = useState<SwitcherItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 50);

    (async () => {
      try {
        const subjects = await listSubjects();
        const all: SwitcherItem[] = subjects.map((s) => ({
          type: "subject" as const,
          id: s.id,
          name: s.name,
          path: "/library",
        }));

        const chapterLists = await Promise.all(
          subjects.map((s) => listChapters(s.id)),
        );
        for (let i = 0; i < subjects.length; i++) {
          for (const ch of chapterLists[i]) {
            all.push({
              type: "chapter",
              id: ch.id,
              name: ch.title,
              subjectName: subjects[i].name,
              path: `/reader?chapter=${ch.id}`,
            });
          }
        }

        // Load notes
        try {
          const notes = await listNotes();
          for (const note of notes) {
            all.push({
              type: "note",
              id: note.id,
              name: note.title,
              subjectName: note.subject_name ?? undefined,
              path: `/notes?id=${note.id}`,
            });
          }
        } catch {
          // Notes might not be available yet
        }

        setItems(all);
        setFiltered(all);
      } catch {
        // Silent — switcher is a convenience feature
      }
    })();

    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(items);
    } else {
      const q = query.toLowerCase();
      setFiltered(
        items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            (item.subjectName?.toLowerCase().includes(q) ?? false),
        ),
      );
    }
    setSelectedIndex(0);
  }, [query, items]);

  const handleSelect = useCallback(
    (item: SwitcherItem) => {
      navigate(item.path);
      onClose();
    },
    [navigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    },
    [filtered, selectedIndex, handleSelect, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-text/10 pt-[18vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <dialog
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-panel shadow-xl shadow-text/5"
        onClick={(e) => e.stopPropagation()}
        aria-label="Quick Switcher"
        open
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <Search size={15} className="text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search subjects, chapters, and notes..."
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted/60 focus:outline-none"
          />
          <kbd className="rounded-md border border-border-subtle bg-panel-alt px-1.5 py-0.5 text-[10px] text-text-muted">
            esc
          </kbd>
        </div>
        <div className="max-h-72 overflow-auto p-2">
          {filtered.map((item, i) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => handleSelect(item)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                i === selectedIndex
                  ? "bg-accent/8 text-text"
                  : "text-text-muted hover:bg-panel-alt"
              }`}
            >
              {item.type === "subject" ? (
                <BookOpen size={14} className="shrink-0 text-accent/60" />
              ) : item.type === "note" ? (
                <StickyNote size={14} className="shrink-0 text-purple-400/60" />
              ) : (
                <FileText size={14} className="shrink-0" />
              )}
              <span className="flex-1 truncate">{item.name}</span>
              {item.subjectName && (
                <span className="text-xs text-text-muted/60">
                  {item.subjectName}
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-text-muted">
              No results found
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}
