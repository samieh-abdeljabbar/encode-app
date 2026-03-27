import { listen } from "@tauri-apps/api/event";
import { ChevronRight, Cpu } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../stores/app";
import type { AiActivityEntry } from "../../lib/types";
import { getAiActivity } from "../../lib/tauri";

function providerLabel(provider: string | undefined): string {
  switch (provider) {
    case "ollama":
      return "Ollama";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "openai":
      return "OpenAI";
    case "deepseek":
      return "DeepSeek";
    case "cli":
      return "CLI Agent";
    default:
      return "Off";
  }
}

function featureLabel(feature: string): string {
  return feature
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRelativeTime(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function statusClasses(status: string): string {
  switch (status) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "failure":
      return "border-coral/40 bg-coral/10 text-coral";
    default:
      return "border-amber/30 bg-amber/10 text-amber";
  }
}

export default function AiActivityButton() {
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<AiActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const config = useAppStore((s) => s.config);
  const loadConfig = useAppStore((s) => s.loadConfig);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    const entries = await getAiActivity();
    setActivity(entries);
    setLoading(false);
  }, []);

  const activityCountLabel = useMemo(() => {
    if (activity.length === 0) return null;
    return activity.length > 9 ? "9+" : String(activity.length);
  }, [activity.length]);

  useEffect(() => {
    if (!config) {
      void loadConfig();
    }
  }, [config, loadConfig]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (!open) return;

    void loadActivity();
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, loadActivity]);

  useEffect(() => {
    let disposed = false;
    const unlistenPromise = listen("ai-activity-updated", () => {
      if (!disposed) {
        void loadActivity();
      }
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [loadActivity]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={`AI Activity (${providerLabel(config?.ai_provider)})`}
        className={`relative w-full flex flex-col items-center justify-center gap-0.5 rounded-xl border px-0 py-2 transition-all ${
          open
            ? "border-accent/30 bg-accent-soft text-text shadow-[var(--shadow-panel)]"
            : "border-transparent bg-transparent text-text-muted hover:border-border-strong hover:bg-panel-active hover:text-text"
        }`}
      >
        <Cpu size={18} />
        <span className="text-[9px] leading-none">AI</span>
        {activityCountLabel && (
          <span className="absolute -right-1 top-0 rounded-full bg-accent px-1 py-0.5 text-[9px] leading-none text-white shadow-[var(--shadow-panel)]">
            {activityCountLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-0 left-full z-50 ml-3 w-[420px] rounded-2xl border border-border-strong bg-panel p-3 shadow-[var(--shadow-overlay)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-text">Recent AI Activity</p>
              <p className="text-[11px] text-text-muted">{providerLabel(config?.ai_provider)} active</p>
            </div>
            <button
              type="button"
              onClick={() => void loadActivity()}
              className="text-[11px] text-text-muted transition-colors hover:text-text"
            >
              Refresh
            </button>
          </div>

          {loading && activity.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-panel-alt px-3 py-6 text-center text-sm text-text-muted">
              Loading activity...
            </div>
          ) : activity.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-panel-alt px-3 py-6 text-center text-sm text-text-muted">
              No AI activity yet.
            </div>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {activity.map((entry) => {
                const duration = formatDuration(entry.duration_ms);
                return (
                  <div key={`${entry.request_id}-${entry.status}`} className="rounded-xl border border-border-subtle bg-panel-alt p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">{featureLabel(entry.feature)}</p>
                        <p className="truncate text-[11px] text-text-muted">
                          {providerLabel(entry.provider)} · <span className="app-font-mono">{entry.model_or_command}</span>
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClasses(entry.status)}`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
                      <span>{formatRelativeTime(entry.started_at)}</span>
                      {duration && <span>· {duration}</span>}
                    </div>
                    {entry.error && (
                      <p className="mt-2 rounded-lg border border-coral/20 bg-coral/5 px-2.5 py-2 text-[11px] text-coral">
                        {entry.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="pointer-events-none absolute left-0 top-1/2 -translate-x-2 -translate-y-1/2 text-border-strong">
            <ChevronRight size={16} />
          </div>
        </div>
      )}
    </div>
  );
}
