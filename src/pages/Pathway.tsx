import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  FileText,
  FolderOpen,
  GraduationCap,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PathwayCatSprite } from "../components/layout/PathwayCatSprite";
import { usePathwayGeneration } from "../components/layout/PathwayGenerationProvider";
import { generatePathwayOutline, importUrl } from "../lib/tauri";
import type {
  ChapterOutline,
  PathwayOutline,
  PathwayResult,
} from "../lib/tauri";

type Phase =
  | "input"
  | "generating_outline"
  | "outline"
  | "generating_content"
  | "done";

const PATHWAY_STEPS = [
  {
    key: "outline",
    label: "Shape the syllabus",
    detail: "Map the learning arc and sequence the chapters.",
    icon: Sparkles,
  },
  {
    key: "chapters",
    label: "Write the curriculum",
    detail: "Draft each chapter into a study-ready path.",
    icon: FileText,
  },
  {
    key: "vault",
    label: "Open it in Encode",
    detail: "Bundle everything into a ready-to-study subject.",
    icon: GraduationCap,
  },
] as const;

type PathwayLoadingStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  activeStep: 0 | 1 | 2;
  progressLabel: string;
  currentItem?: string;
  percent?: number;
  spriteSeed?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

function PathwayLoadingState({
  eyebrow,
  title,
  description,
  activeStep,
  progressLabel,
  currentItem,
  percent,
  spriteSeed,
  secondaryActionLabel,
  onSecondaryAction,
}: PathwayLoadingStateProps) {
  const progressValue =
    percent === undefined ? undefined : Math.min(100, Math.max(0, percent));

  return (
    <div className="mx-auto flex h-full max-w-4xl items-center justify-center p-6">
      <section className="pathway-loading-panel soft-panel relative w-full max-w-3xl overflow-hidden rounded-[2rem] px-8 py-8 md:px-10 md:py-10">
        <div className="pathway-loading-orb pathway-loading-orb-primary" />
        <div className="pathway-loading-orb pathway-loading-orb-secondary" />

        <div className="relative">
          <div className="section-kicker">{eyebrow}</div>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <h1 className="serif-heading text-3xl font-semibold tracking-tight text-text md:text-[2.6rem]">
                {title}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-text-muted md:text-[15px]">
                {description}
              </p>
              {secondaryActionLabel && onSecondaryAction && (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-subtle/80 bg-panel/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted transition-all hover:border-accent/30 hover:bg-panel hover:text-text"
                >
                  <FolderOpen size={14} />
                  {secondaryActionLabel}
                </button>
              )}
            </div>
            <div className="pathway-progress-pill">
              {progressValue === undefined ? (
                <div className="pathway-progress-pill-indeterminate" />
              ) : (
                <div
                  className="pathway-progress-pill-fill"
                  style={{ width: `${progressValue}%` }}
                />
              )}
              <div className="pathway-progress-pill-label">
                {progressValue === undefined
                  ? "In progress"
                  : `${progressValue}% built`}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-2 md:grid-cols-3">
            {PATHWAY_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeStep;
              const isComplete = index < activeStep;
              return (
                <div
                  key={step.key}
                  className={`rounded-2xl border px-4 py-3 transition-all ${
                    isActive
                      ? "border-accent/30 bg-accent/10 shadow-[0_18px_35px_rgba(0,0,0,0.08)]"
                      : "border-border-subtle/80 bg-panel/70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        isComplete
                          ? "bg-accent text-white"
                          : isActive
                            ? "bg-panel text-accent"
                            : "bg-panel-alt text-text-muted"
                      }`}
                    >
                      {isComplete ? (
                        <Check size={15} />
                      ) : (
                        <Icon size={15} strokeWidth={2} />
                      )}
                    </div>
                    <div className="text-sm font-semibold text-text">
                      {step.label}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-muted">
                    {step.detail}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="rounded-[1.75rem] border border-border-subtle/80 bg-panel/80 px-6 py-8 shadow-[0_24px_48px_rgba(0,0,0,0.06)]">
              <div className="pathway-mascot-stage">
                <div className="pathway-sprite-wander">
                  <div className="pathway-sprite-direction">
                    <div className="pathway-sprite-cluster">
                      <PathwayCatSprite
                        seed={spriteSeed ?? title}
                        className="pathway-sprite-main"
                      />
                      <div className="pathway-pixel-cat-shadow" />
                    </div>
                  </div>
                </div>
                <div className="pathway-mascot-spark pathway-mascot-spark-a" />
                <div className="pathway-mascot-spark pathway-mascot-spark-b" />
              </div>

              <div className="mt-6 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                  Studio status
                </div>
                <p className="mt-3 text-base font-semibold text-text">
                  {progressLabel}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {currentItem
                    ? `Current chapter: ${currentItem}`
                    : "This pass is planning the chapter order before any writing starts."}
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border-subtle/80 bg-panel-alt/70 p-6 shadow-[0_20px_44px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                <span>Generation progress</span>
                <span>
                  {percent === undefined ? "Estimating" : `${percent}%`}
                </span>
              </div>

              <div className="mt-4 h-4 overflow-hidden rounded-full bg-panel">
                {percent === undefined ? (
                  <div className="pathway-progress-indeterminate h-full rounded-full" />
                ) : (
                  <div
                    className="pathway-progress-fill h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(percent, 8)}%` }}
                  />
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-border-subtle/70 bg-panel/80 px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Right now
                </div>
                <div className="mt-2 text-lg font-semibold text-text">
                  {percent === undefined
                    ? "Building the first draft"
                    : progressLabel}
                </div>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {percent === undefined
                    ? "Working out prerequisites, pacing, and chapter flow so the curriculum lands in a usable order."
                    : "Each chapter is generated in sequence so the subject opens already organized for study."}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border-subtle/70 bg-panel/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    Output
                  </div>
                  <div className="mt-1 text-sm font-medium text-text">
                    Study-ready chapters
                  </div>
                </div>
                <div className="rounded-2xl border border-border-subtle/70 bg-panel/70 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    Next
                  </div>
                  <div className="mt-1 text-sm font-medium text-text">
                    {percent === undefined
                      ? "Move into chapter generation"
                      : "Finalize the subject in your library"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function Pathway() {
  const navigate = useNavigate();
  const { job, startJob, clearJob } = usePathwayGeneration();

  const [phase, setPhase] = useState<Phase>("input");
  const [topic, setTopic] = useState("");
  const [mastery, setMastery] = useState("intermediate");
  const [scope, setScope] = useState("standard");
  const [, setOutline] = useState<PathwayOutline | null>(null);
  const [editableChapters, setEditableChapters] = useState<ChapterOutline[]>(
    [],
  );
  const [editableSubjectName, setEditableSubjectName] = useState("");
  const [generatingIndex, setGeneratingIndex] = useState(0);
  const [result, setResult] = useState<PathwayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!job) return;

    setTopic(job.topic);
    setMastery(job.mastery);
    setScope(job.scope);
    setEditableChapters(job.chapters);
    setEditableSubjectName(job.subjectName);
    setGeneratingIndex(job.generatingIndex);

    if (job.status === "running") {
      setPhase("generating_content");
      setError(null);
      return;
    }

    if (job.status === "completed" && job.result) {
      setResult(job.result);
      setPhase("done");
      setError(null);
      return;
    }

    if (job.status === "error") {
      setPhase("outline");
      setError(job.error ?? "Curriculum generation failed.");
    }
  }, [job]);

  const handleGenerateOutline = async () => {
    if (!topic.trim()) return;
    setPhase("generating_outline");
    setError(null);
    try {
      const o = await generatePathwayOutline(topic, mastery, scope);
      setOutline(o);
      setEditableChapters(o.chapters);
      setEditableSubjectName(o.subject_name);
      setPhase("outline");
    } catch (e) {
      setError(String(e));
      setPhase("input");
    }
  };

  const handleGenerateContent = () => {
    setError(null);

    try {
      startJob({
        topic,
        mastery,
        scope,
        subjectName: editableSubjectName,
        chapters: editableChapters,
      });
      setPhase("generating_content");
    } catch (e) {
      setError(String(e));
      setPhase("outline");
    }
  };

  const handleImportUrl = async (url: string, subjectId: number) => {
    setImporting((prev) => ({ ...prev, [url]: true }));
    try {
      await importUrl(url, subjectId);
    } catch {
      /* silent */
    }
    setImporting((prev) => ({ ...prev, [url]: false }));
  };

  const moveChapter = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= editableChapters.length) return;
    const updated = [...editableChapters];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setEditableChapters(updated);
  };

  const deleteChapter = (index: number) => {
    setEditableChapters((prev) => prev.filter((_, i) => i !== index));
  };

  const addChapter = () => {
    setEditableChapters((prev) => [
      ...prev,
      {
        title: "New Chapter",
        description: "Add description",
        estimated_minutes: 10,
      },
    ]);
  };

  const updateChapterTitle = (index: number, title: string) => {
    setEditableChapters((prev) =>
      prev.map((ch, i) => (i === index ? { ...ch, title } : ch)),
    );
  };

  // INPUT PHASE
  if (phase === "input") {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <Sparkles size={28} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            Learn Something New
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Tell me what you want to learn and I'll create a full curriculum for
            you
          </p>
        </div>

        <div className="w-full max-w-lg space-y-6">
          <div>
            <label
              htmlFor="pw-topic"
              className="mb-2 block text-sm font-medium text-text"
            >
              What do you want to learn?
            </label>
            <input
              id="pw-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerateOutline()}
              placeholder="e.g., Docker containerization, Machine Learning basics, Rust programming..."
              autoFocus
              className="h-12 w-full rounded-xl border border-border bg-panel px-4 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-text">
              Mastery Level
            </div>
            <div className="flex gap-2">
              {[
                {
                  value: "beginner",
                  label: "Beginner",
                  desc: "Start from scratch",
                },
                {
                  value: "intermediate",
                  label: "Intermediate",
                  desc: "Know the basics",
                },
                {
                  value: "expert",
                  label: "Expert",
                  desc: "Deep mastery",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMastery(opt.value)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all ${
                    mastery === opt.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-panel text-text-muted hover:border-accent/30"
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] opacity-60">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-text">Scope</div>
            <div className="flex gap-2">
              {[
                {
                  value: "quick",
                  label: "Quick Overview",
                  desc: "3-4 chapters",
                },
                {
                  value: "standard",
                  label: "Standard Course",
                  desc: "6-8 chapters",
                },
                {
                  value: "deep",
                  label: "Deep Dive",
                  desc: "10-15 chapters",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all ${
                    scope === opt.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-panel text-text-muted hover:border-accent/30"
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] opacity-60">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateOutline}
            disabled={!topic.trim()}
            className="h-12 w-full rounded-xl bg-accent px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
          >
            Generate Outline
          </button>
        </div>
      </div>
    );
  }

  // GENERATING OUTLINE
  if (phase === "generating_outline") {
    return (
      <PathwayLoadingState
        eyebrow="Pathway Studio"
        title="Designing your curriculum arc."
        description="Encode is sketching the chapter sequence, calibrating difficulty, and finding a clean path from first principle to confident recall."
        activeStep={0}
        progressLabel="Creating your learning plan..."
        spriteSeed={topic}
      />
    );
  }

  // OUTLINE REVIEW
  if (phase === "outline") {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
        <button
          type="button"
          onClick={() => setPhase("input")}
          className="mb-4 flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} /> Back
        </button>

        <div className="mb-6">
          <label
            htmlFor="pw-subject"
            className="mb-1 block text-xs text-text-muted"
          >
            Subject Name
          </label>
          <input
            id="pw-subject"
            type="text"
            value={editableSubjectName}
            onChange={(e) => setEditableSubjectName(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-panel px-3 text-base font-semibold text-text focus:border-accent/40 focus:outline-none"
          />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">
            {editableChapters.length} Chapters
          </h2>
          <button
            type="button"
            onClick={addChapter}
            className="flex items-center gap-1 rounded-lg bg-panel-active px-3 py-1.5 text-xs text-text-muted hover:text-text"
          >
            <Plus size={12} /> Add Chapter
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-auto">
          {editableChapters.map((ch, i) => (
            <div
              key={`ch-${ch.title}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-panel p-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-[10px] font-bold text-accent">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={ch.title}
                  onChange={(e) => updateChapterTitle(i, e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-text focus:outline-none"
                />
                <p className="truncate text-[11px] text-text-muted/60">
                  {ch.description}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-text-muted/40">
                {ch.estimated_minutes}m
              </span>
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={() => moveChapter(i, -1)}
                  disabled={i === 0}
                  className="rounded p-1 text-text-muted/40 hover:text-text disabled:opacity-20"
                >
                  <ArrowUp size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => moveChapter(i, 1)}
                  disabled={i === editableChapters.length - 1}
                  className="rounded p-1 text-text-muted/40 hover:text-text disabled:opacity-20"
                >
                  <ArrowDown size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteChapter(i)}
                  className="rounded p-1 text-text-muted/40 hover:text-coral"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerateContent}
          disabled={editableChapters.length === 0}
          className="mt-4 h-12 w-full rounded-xl bg-accent px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
        >
          Generate Curriculum
        </button>
      </div>
    );
  }

  // GENERATING CONTENT
  if (phase === "generating_content") {
    const totalChapters = job?.totalChapters ?? editableChapters.length;
    const progress = job?.percent ?? 0;
    const currentTitle =
      job?.currentChapterTitle ?? editableChapters[generatingIndex]?.title;
    const progressLabel =
      job?.stage === "finalizing"
        ? "Finalizing your subject"
        : `Generating chapter ${generatingIndex + 1} of ${totalChapters}`;
    return (
      <PathwayLoadingState
        eyebrow="Pathway Studio"
        title="Writing the chapters into place."
        description="The outline is locked. Encode is now turning each stop in the pathway into material you can open and study immediately."
        activeStep={1}
        progressLabel={progressLabel}
        currentItem={currentTitle}
        percent={Math.round(progress)}
        spriteSeed={`${topic}:${editableSubjectName}`}
        secondaryActionLabel="Keep this running in the sidebar"
        onSecondaryAction={() => navigate("/")}
      />
    );
  }

  // DONE
  if (phase === "done" && result) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal/10">
            <GraduationCap size={28} className="text-teal" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            Curriculum Ready!
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Created <strong>{result.subject_name}</strong> with{" "}
            {result.chapters_created} chapters and {result.flashcards_created}{" "}
            flashcards
          </p>
        </div>

        {result.suggested_urls.length > 0 && (
          <div className="mb-6 w-full max-w-lg">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">
              Suggested Sources
            </h3>
            <div className="space-y-2">
              {result.suggested_urls.map((u) => (
                <div
                  key={u.url}
                  className="flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text">{u.title}</div>
                    <div className="truncate text-[11px] text-text-muted/50">
                      {u.url}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleImportUrl(u.url, result.subject_id)}
                    disabled={importing[u.url]}
                    className="shrink-0 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
                  >
                    {importing[u.url] ? "Importing..." : "Import"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="h-10 rounded-xl bg-accent px-6 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
          >
            Start Studying
          </button>
          <button
            type="button"
            onClick={() => {
              clearJob();
              setPhase("input");
              setTopic("");
              setOutline(null);
              setEditableChapters([]);
              setEditableSubjectName("");
              setGeneratingIndex(0);
              setResult(null);
              setError(null);
            }}
            className="h-10 rounded-xl border border-border bg-panel px-6 text-sm font-medium text-text hover:bg-panel-active"
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return null;
}
