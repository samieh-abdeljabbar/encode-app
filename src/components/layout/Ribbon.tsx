import {
  AlertCircle,
  BookOpen,
  Brain,
  CheckCircle2,
  FileText,
  FolderOpen,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Repeat,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { checkAiStatus } from "../../lib/tauri";
import type { AiStatus } from "../../lib/tauri";
import { AiLogPanel } from "./AiLogPanel";
import { usePathwayGeneration } from "./PathwayGenerationProvider";

const NAV_ITEMS = [
  {
    path: "/",
    icon: LayoutDashboard,
    label: "Queue",
    description: "See your next best step.",
  },
  {
    path: "/workspace",
    icon: FolderOpen,
    label: "Library",
    description: "Subjects, chapters, imports, and notes.",
  },
  {
    path: "/reader",
    icon: BookOpen,
    label: "Reader",
    description: "Read in focused chunks.",
  },
  {
    path: "/review",
    icon: Repeat,
    label: "Review",
    description: "Run through due cards fast.",
  },
] as const;

const SECONDARY_ITEMS = [
  {
    path: "/cards",
    icon: Layers,
    label: "Cards",
    description: "Manage the card set behind review.",
  },
  {
    path: "/quizzes",
    icon: FileText,
    label: "Quizzes",
    description: "See quiz runs, scores, and create more.",
  },
] as const;

const SETTINGS_ITEM = {
  path: "/settings",
  icon: Settings,
  label: "Settings",
  description: "Adjust exports, AI, and setup.",
} as const;

type NavItem =
  | (typeof NAV_ITEMS)[number]
  | (typeof SECONDARY_ITEMS)[number]
  | typeof SETTINGS_ITEM;

export function Ribbon() {
  const navigate = useNavigate();
  const location = useLocation();
  const { job, clearJob } = usePathwayGeneration();
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    checkAiStatus()
      .then(setAiStatus)
      .catch(() => {});
  }, []);

  const dotColor = !aiStatus
    ? "bg-text-muted/30"
    : aiStatus.provider === "none"
      ? "bg-text-muted/30"
      : aiStatus.configured && aiStatus.has_api_key
        ? "bg-teal"
        : aiStatus.configured
          ? "bg-amber"
          : "bg-text-muted/30";

  const renderNavButton = (item: NavItem, key?: string) => {
    const isActive = location.pathname === item.path;
    return (
      <button
        key={key ?? item.path}
        type="button"
        onClick={() => navigate(item.path)}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-150 ${
          isActive
            ? "bg-accent text-white shadow-[0_16px_30px_rgba(45,106,79,0.22)]"
            : "text-text-muted hover:bg-panel-active hover:text-text"
        }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isActive ? "bg-white/16" : "bg-panel-alt"
          }`}
        >
          <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.9} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{item.label}</div>
          <div
            className={`mt-0.5 text-xs ${
              isActive ? "text-white/78" : "text-text-muted/75"
            }`}
          >
            {item.description}
          </div>
        </div>
      </button>
    );
  };

  const showPathwaySidebarCard = job && location.pathname !== "/pathway";
  const isJobRunning = job?.status === "running";
  const isJobComplete = job?.status === "completed";
  const JobIcon = isJobRunning
    ? Sparkles
    : isJobComplete
      ? CheckCircle2
      : AlertCircle;

  return (
    <>
      <nav className="soft-panel flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-r border-border-subtle/80 px-3 py-4 xl:px-4 xl:py-6">
        <div className="mb-4 shrink-0 flex items-center gap-3 px-2 xl:mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_16px_24px_rgba(45,106,79,0.22)]">
            <GraduationCap size={18} />
          </div>
          <div>
            <div className="serif-heading text-xl font-semibold text-text">
              Encode
            </div>
            <div className="text-xs text-text-muted">
              Study without the clutter.
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-3 shrink-0 px-2">
            <div className="section-kicker">Primary</div>
          </div>

          <div className="flex flex-col gap-2">
            {NAV_ITEMS.map((item) => renderNavButton(item))}

            <div className="mt-4 px-2">
              <div className="section-kicker">Study Tools</div>
            </div>

            {SECONDARY_ITEMS.map((item) => renderNavButton(item))}

            {showPathwaySidebarCard && job && (
              <>
                <div className="mt-4 px-2">
                  <div className="section-kicker">
                    {isJobRunning ? "Background Task" : "Pathway Status"}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-subtle bg-panel/80 p-3 shadow-[0_18px_34px_rgba(0,0,0,0.05)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <JobIcon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-text">
                            {isJobRunning
                              ? "Curriculum running"
                              : isJobComplete
                                ? "Curriculum ready"
                                : "Curriculum stopped"}
                          </div>
                          <div className="mt-0.5 text-xs text-text-muted">
                            {isJobRunning
                              ? `Chapter ${job.generatingIndex + 1} of ${job.totalChapters}`
                              : isJobComplete
                                ? job.result?.subject_name
                                : "Open Pathway to review the issue."}
                          </div>
                        </div>

                        {!isJobRunning && (
                          <button
                            type="button"
                            onClick={clearJob}
                            aria-label="Dismiss pathway status"
                            className="rounded-lg p-1 text-text-muted/60 transition-colors hover:bg-panel-alt hover:text-text"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel-alt">
                        <div
                          className="pathway-progress-fill h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(job.percent, 8)}%` }}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-text-muted">
                        <span className="truncate">
                          {isJobRunning
                            ? (job.currentChapterTitle ?? "Finalizing subject")
                            : isJobComplete
                              ? `${job.result?.chapters_created ?? job.totalChapters} chapters ready`
                              : job.error}
                        </span>
                        <span className="shrink-0 font-medium text-text">
                          {job.percent}%
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate("/pathway")}
                        className="mt-3 w-full rounded-xl border border-border-subtle bg-panel-alt/70 px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-panel-active"
                      >
                        {isJobRunning ? "Open studio" : "Open Pathway"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 shrink-0 rounded-2xl border border-border-subtle bg-panel-alt/70 p-3 xl:mt-6">
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            aria-label="AI Status"
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-text-muted transition-all duration-150 hover:bg-panel-active hover:text-text"
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel">
              <Brain size={16} strokeWidth={1.8} />
              <span
                className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-panel ${dotColor}`}
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text">AI Status</div>
              <div className="text-xs text-text-muted">
                Check provider health and recent study help.
              </div>
            </div>
          </button>

          <div className="my-3 border-t border-border-subtle/80" />
          {renderNavButton(SETTINGS_ITEM)}

          <div className="mt-3 rounded-xl bg-panel px-3 py-2 text-xs text-text-muted">
            Press{" "}
            <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">
              O
            </kbd>{" "}
            to jump anywhere quickly.
          </div>
        </div>
      </nav>

      <AiLogPanel open={logOpen} onClose={() => setLogOpen(false)} />
    </>
  );
}
