import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AiRunInfo, AiStatus } from "../../lib/tauri";
import { checkAiStatus, listAiRuns } from "../../lib/tauri";

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

type RunFilter = "all" | "issues" | "reader" | "quiz" | "teachback";
type FeatureCategory = "reader" | "quiz" | "teachback" | "other";

interface FeatureMeta {
  label: string;
  category: FeatureCategory;
}

interface GroupedRun {
  key: string;
  label: string;
  category: FeatureCategory;
  provider: string;
  model: string;
  count: number;
  avgLatency: number;
  latestCreatedAt: string;
}

const FILTERS: { value: RunFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issues", label: "Issues" },
  { value: "reader", label: "Reader" },
  { value: "quiz", label: "Quiz" },
  { value: "teachback", label: "Teachback" },
];

const FEATURE_LABELS: Record<string, FeatureMeta> = {
  "reader.section_check": { label: "Reader check", category: "reader" },
  "reader.synthesis_eval": {
    label: "Synthesis review",
    category: "reader",
  },
  "reader.repair_card": { label: "Repair card", category: "reader" },
  "reader.generate_prompt": { label: "Reader help", category: "reader" },
  "quiz.generate": { label: "Quiz generation", category: "quiz" },
  "quiz.evaluate": { label: "Quiz grading", category: "quiz" },
  "teachback.evaluate": {
    label: "Teachback review",
    category: "teachback",
  },
  "teachback.generate_prompt": {
    label: "Teachback help",
    category: "teachback",
  },
  "pathway.outline": { label: "Pathway outline", category: "other" },
  "pathway.chapter": { label: "Pathway chapter", category: "other" },
};

function prettifyFeature(feature: string): FeatureMeta {
  const normalized = feature
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .join(" ");
  const label = normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { label, category: "other" };
}

function featureMeta(feature: string): FeatureMeta {
  return FEATURE_LABELS[feature] ?? prettifyFeature(feature);
}

function matchesFilter(run: AiRunInfo, filter: RunFilter): boolean {
  if (filter === "all") return true;
  if (filter === "issues") return run.status !== "success";
  return featureMeta(run.feature).category === filter;
}

function groupSuccessfulRuns(runs: AiRunInfo[]): GroupedRun[] {
  const groups = new Map<string, GroupedRun>();

  for (const run of runs) {
    if (run.status !== "success") continue;
    const meta = featureMeta(run.feature);
    const key = `${run.feature}:${run.provider}:${run.model}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      existing.avgLatency =
        (existing.avgLatency * (existing.count - 1) + run.latency_ms) /
        existing.count;
      if (run.created_at > existing.latestCreatedAt) {
        existing.latestCreatedAt = run.created_at;
      }
      continue;
    }

    groups.set(key, {
      key,
      label: meta.label,
      category: meta.category,
      provider: run.provider,
      model: run.model,
      count: 1,
      avgLatency: run.latency_ms,
      latestCreatedAt: run.created_at,
    });
  }

  return [...groups.values()].sort((a, b) =>
    b.latestCreatedAt.localeCompare(a.latestCreatedAt),
  );
}

function averageSuccessLatency(runs: AiRunInfo[]): number | null {
  const successes = runs.filter((run) => run.status === "success");
  if (successes.length === 0) return null;
  const total = successes.reduce((sum, run) => sum + run.latency_ms, 0);
  return total / successes.length;
}

function toneForStatus(
  aiStatus: AiStatus | null,
  failureCount: number,
): {
  label: string;
  description: string;
  chipClass: string;
  icon: typeof CheckCircle2;
} {
  if (!aiStatus) {
    return {
      label: "Checking status",
      description: "Looking up your current provider and recent runs.",
      chipClass: "bg-panel-alt text-text-muted",
      icon: Sparkles,
    };
  }

  if (aiStatus.provider === "none") {
    return {
      label: "AI is turned off",
      description:
        "The app will use deterministic fallbacks until you enable a provider.",
      chipClass: "bg-panel-alt text-text-muted",
      icon: Bot,
    };
  }

  if (!aiStatus.configured || !aiStatus.has_api_key) {
    return {
      label: "Setup needed",
      description:
        "Your provider is selected, but it is not fully configured yet.",
      chipClass: "bg-amber/10 text-amber",
      icon: TriangleAlert,
    };
  }

  if (failureCount > 0) {
    return {
      label: "Needs attention",
      description:
        "AI is available, but some recent runs failed and may need a quick check.",
      chipClass: "bg-amber/10 text-amber",
      icon: TriangleAlert,
    };
  }

  return {
    label: "Working normally",
    description: "Study help is available and recent runs look healthy.",
    chipClass: "bg-teal/10 text-teal",
    icon: CheckCircle2,
  };
}

interface AiLogPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AiLogPanel({ open, onClose }: AiLogPanelProps) {
  const [runs, setRuns] = useState<AiRunInfo[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<RunFilter>("all");

  const fetchPanelData = useCallback(async () => {
    setLoading(true);
    try {
      const [status, data] = await Promise.all([checkAiStatus(), listAiRuns()]);
      setAiStatus(status);
      setRuns(data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setFilter("all");
      fetchPanelData();
    }
  }, [open, fetchPanelData]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const successCount = runs.filter((run) => run.status === "success").length;
  const failureRuns = runs.filter((run) => run.status !== "success");
  const failureCount = failureRuns.length;
  const avgLatency = averageSuccessLatency(runs);
  const lastUsed = runs[0]?.created_at ?? null;
  const statusTone = toneForStatus(aiStatus, failureCount);
  const StatusIcon = statusTone.icon;

  const filteredRuns = runs.filter((run) => matchesFilter(run, filter));
  const filteredFailures = filteredRuns.filter(
    (run) => run.status !== "success",
  );
  const groupedSuccesses = groupSuccessfulRuns(filteredRuns).slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-text/10 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <dialog
        className="my-4 mr-4 flex h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[30px] border border-border bg-panel shadow-2xl shadow-text/10 open:block"
        onClick={(event) => event.stopPropagation()}
        aria-label="AI Status"
        open
      >
        <div className="border-b border-border-subtle/70 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-text">
                AI Status
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                See whether study help is available and what happened recently.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-text-muted transition-colors hover:bg-panel-alt hover:text-text"
              aria-label="Close AI status"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <section className="rounded-[26px] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(248,243,236,0.92))] p-5 shadow-[0_18px_35px_rgba(76,58,47,0.05)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="section-kicker">Status</div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-medium ${statusTone.chipClass}`}
                >
                  {statusTone.label}
                </span>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-panel-alt text-text-muted">
                  <StatusIcon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {aiStatus?.provider === "none"
                      ? "No provider selected"
                      : aiStatus?.provider
                        ? `${aiStatus.provider} is active`
                        : "Checking provider"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">
                    {statusTone.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-panel-alt px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    Recent success
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-text">
                    {successCount}
                    <span className="ml-1 text-sm font-normal text-text-muted">
                      / {runs.length || 0}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl bg-panel-alt px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    Recent failures
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-text">
                    {failureCount}
                  </div>
                </div>
                <div className="rounded-2xl bg-panel-alt px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    Average latency
                  </div>
                  <div className="mt-1 text-xl font-semibold text-text">
                    {avgLatency == null ? "—" : formatLatency(avgLatency)}
                  </div>
                </div>
                <div className="rounded-2xl bg-panel-alt px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    Last used
                  </div>
                  <div className="mt-1 text-xl font-semibold text-text">
                    {lastUsed ? relativeTime(lastUsed) : "Not yet"}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">Needs Attention</div>
                  <p className="mt-1 text-sm text-text-muted">
                    Problems are pinned here so they are easy to scan.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {aiStatus &&
                  aiStatus.provider !== "none" &&
                  (!aiStatus.configured || !aiStatus.has_api_key) && (
                    <div className="rounded-2xl border border-amber/20 bg-amber/5 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <TriangleAlert
                          size={16}
                          className="mt-0.5 text-amber"
                        />
                        <div>
                          <p className="text-sm font-medium text-text">
                            Finish AI setup
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-text-muted">
                            A provider is selected, but it is not fully ready
                            yet. Study features will fall back when possible.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {filteredFailures.slice(0, 4).map((run) => {
                  const meta = featureMeta(run.feature);
                  return (
                    <div
                      key={run.id}
                      className="rounded-2xl border border-coral/15 bg-coral/5 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text">
                            {meta.label}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            {run.provider} / {run.model} •{" "}
                            {relativeTime(run.created_at)}
                          </p>
                        </div>
                        <span className="rounded-full bg-coral/10 px-2.5 py-1 text-[10px] font-medium text-coral">
                          {run.status}
                        </span>
                      </div>
                      {run.error_summary && (
                        <p className="mt-2 text-xs leading-relaxed text-coral/90">
                          {run.error_summary}
                        </p>
                      )}
                    </div>
                  );
                })}

                {filteredFailures.length === 0 &&
                  (!aiStatus ||
                    aiStatus.provider === "none" ||
                    (aiStatus.configured && aiStatus.has_api_key)) && (
                    <div className="rounded-2xl border border-border-subtle bg-panel-alt/70 px-4 py-4 text-sm text-text-muted">
                      No recent problems to worry about.
                    </div>
                  )}
              </div>
            </section>

            <section>
              <div className="mb-3">
                <div className="section-kicker">Recent Activity</div>
                <p className="mt-1 text-sm text-text-muted">
                  Grouped recent runs so repeated study-help calls do not flood
                  the panel.
                </p>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {FILTERS.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setFilter(entry.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      filter === entry.value
                        ? "bg-accent text-white"
                        : "bg-panel-alt text-text-muted hover:bg-panel-active hover:text-text"
                    }`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {loading && runs.length === 0 && (
                <div className="rounded-2xl border border-border-subtle bg-panel-alt/70 px-4 py-8 text-center text-sm text-text-muted">
                  Loading recent AI runs…
                </div>
              )}

              {!loading && filteredRuns.length === 0 && (
                <div className="rounded-2xl border border-border-subtle bg-panel-alt/70 px-4 py-8 text-center text-sm text-text-muted">
                  Nothing recent for this filter.
                </div>
              )}

              <div className="space-y-2.5">
                {groupedSuccesses.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-2xl border border-border-subtle bg-panel px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text">
                          {group.label}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          {group.count} recent run
                          {group.count === 1 ? "" : "s"} • {group.provider} /{" "}
                          {group.model}
                        </p>
                      </div>
                      <span className="rounded-full bg-teal/10 px-2.5 py-1 text-[10px] font-medium text-teal">
                        success
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted/70">
                      <span>avg {formatLatency(group.avgLatency)}</span>
                      <span>{relativeTime(group.latestCreatedAt)}</span>
                    </div>
                  </div>
                ))}

                {filter === "issues" && filteredFailures.length > 0 && (
                  <div className="rounded-2xl border border-border-subtle bg-panel-alt/70 px-4 py-4 text-sm text-text-muted">
                    Issues are shown above so they stay prominent.
                  </div>
                )}
              </div>
            </section>

            <div className="rounded-2xl border border-border-subtle bg-panel-alt/80 px-4 py-3 text-xs text-text-muted">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p className="leading-relaxed">
                  This panel shows recent study-help health, not full debug
                  telemetry. If AI is off, core study flows still use
                  deterministic fallbacks where available.
                </p>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
