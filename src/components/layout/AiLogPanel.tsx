import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AiRunInfo } from "../../lib/tauri";
import { listAiRuns } from "../../lib/tauri";

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function relativeTime(timestamp: string): string {
  const date = new Date(`${timestamp.replace(" ", "T")}Z`);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface AiLogPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AiLogPanel({ open, onClose }: AiLogPanelProps) {
  const [runs, setRuns] = useState<AiRunInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAiRuns();
      setRuns(data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchRuns();
    }
  }, [open, fetchRuns]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />

      {/* Panel */}
      <div className="fixed bottom-0 left-12 top-0 z-50 w-80 border-r border-border bg-panel shadow-xl transition-transform duration-200">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4 pt-8">
          <h2 className="text-sm font-semibold text-text">AI Activity</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div
          className="overflow-y-auto p-3"
          style={{ height: "calc(100% - 3.5rem)" }}
        >
          {loading && runs.length === 0 && (
            <div className="py-12 text-center text-xs text-text-muted/60">
              Loading...
            </div>
          )}

          {!loading && runs.length === 0 && (
            <div className="py-12 text-center text-xs text-text-muted/60">
              No AI calls yet
            </div>
          )}

          <div className="space-y-1.5">
            {runs.map((run) => (
              <div
                key={run.id}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-text">
                    {run.feature}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      run.status === "success"
                        ? "bg-teal/10 text-teal"
                        : "bg-coral/10 text-coral"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="mb-1.5 text-[10px] text-text-muted">
                  {run.provider} / {run.model}
                </div>
                <div className="flex items-center justify-between text-[10px] text-text-muted/60">
                  <span>{formatLatency(run.latency_ms)}</span>
                  <span>{relativeTime(run.created_at)}</span>
                </div>
                {run.error_summary && (
                  <div className="mt-1.5 truncate rounded-md bg-coral/5 px-2 py-1 text-[10px] text-coral">
                    {run.error_summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
