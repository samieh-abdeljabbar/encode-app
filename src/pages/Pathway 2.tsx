import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GraduationCap,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createPathwaySubject,
  generatePathwayChapter,
  generatePathwayOutline,
  importUrl,
} from "../lib/tauri";
import type {
  ChapterContent,
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

export function Pathway() {
  const navigate = useNavigate();

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

  const handleGenerateContent = async () => {
    setPhase("generating_content");
    setError(null);
    const contents: [ChapterOutline, ChapterContent][] = [];

    try {
      for (let i = 0; i < editableChapters.length; i++) {
        setGeneratingIndex(i);
        const ch = editableChapters[i];
        const content = await generatePathwayChapter(
          topic,
          mastery,
          ch.title,
          ch.description,
          i,
          editableChapters.length,
        );
        contents.push([ch, content]);
      }

      const r = await createPathwaySubject(editableSubjectName, contents);
      setResult(r);
      setPhase("done");
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
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="pixel-cat">
          <div className="pixel-cat-body" />
        </div>
        <p className="text-sm text-text-muted">
          Creating your learning plan...
        </p>
      </div>
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
    const progress = ((generatingIndex + 1) / editableChapters.length) * 100;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="pixel-cat">
          <div className="pixel-cat-body" />
        </div>
        <div className="w-64">
          <div className="mb-2 text-center text-sm text-text-muted">
            Generating chapter {generatingIndex + 1} of{" "}
            {editableChapters.length}...
          </div>
          <div className="h-2 rounded-full bg-border">
            <div
              className="h-2 rounded-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 text-center text-xs text-text-muted/50">
            {editableChapters[generatingIndex]?.title}
          </div>
        </div>
      </div>
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
            onClick={() => navigate("/library")}
            className="h-10 rounded-xl bg-accent px-6 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
          >
            Start Studying
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("input");
              setTopic("");
              setOutline(null);
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
