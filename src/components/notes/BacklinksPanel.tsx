import { ArrowLeft, ChevronRight, Link2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBacklinks } from "../../lib/tauri";
import type { BacklinkInfo } from "../../lib/tauri";

interface BacklinksPanelProps {
  noteId: number;
  collapsed: boolean;
  onToggle: () => void;
}

export function BacklinksPanel({
  noteId,
  collapsed,
  onToggle,
}: BacklinksPanelProps) {
  const navigate = useNavigate();
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBacklinks(noteId);
      setBacklinks(data);
    } catch {
      setBacklinks([]);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    load();
  }, [load]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Show backlinks"
        className="flex h-full w-10 shrink-0 items-start border-l border-border-subtle bg-panel pt-14"
      >
        <div className="flex w-10 -rotate-90 translate-y-16 items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-text-muted">
          <Link2 size={12} />
          Linked ({backlinks.length})
        </div>
      </button>
    );
  }

  return (
    <div className="flex w-64 shrink-0 flex-col border-l border-border-subtle bg-panel">
      <div className="flex items-center justify-between border-b border-border-subtle/60 px-4 py-4">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
          <Link2 size={12} />
          Linked Mentions
        </h3>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse backlinks"
          className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-panel-active hover:text-text"
        >
          <ArrowLeft size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3">
        {loading && (
          <p className="px-2 py-4 text-center text-xs text-text-muted/50">
            Loading...
          </p>
        )}

        {!loading && backlinks.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-text-muted/50">
            No linked mentions
          </p>
        )}

        {backlinks.map((bl) => (
          <button
            key={bl.note_id}
            type="button"
            onClick={() => navigate(`/notes/${bl.note_id}`)}
            className="mb-2 w-full rounded-lg border border-border bg-surface p-3 text-left transition-all hover:border-accent/25 hover:shadow-sm"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-text">{bl.title}</span>
              <ChevronRight size={10} className="text-text-muted/40" />
            </div>
            {bl.context && (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-text-muted/70">
                {bl.context}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
