import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuizStore, type QuestionType, type QuizQuestion } from "../stores/quiz";
import { listSubjects, listFiles, readFile, getSubjectGrades, getQuizHistoryTimeline, getWeakTopics, type SubjectGrade } from "../lib/tauri";
import type { QuizHistoryPoint, WeakTopic } from "../lib/types";
import { parseFrontmatter } from "../lib/markdown";
import { hasCompletedSynthesis } from "../lib/synthesis";
import type { Subject, FileEntry } from "../lib/types";
import { Flag, ChevronDown, ChevronRight, BookOpen, Brain, RotateCcw, Sparkles, CreditCard } from "lucide-react";
import { EmptyState, InputShell, LoadingState, MetaChip, PageHeader, Panel, PrimaryButton, SecondaryButton, SegmentedTabs } from "../components/ui/primitives";
import { useVaultStore } from "../stores/vault";

// ─── Types ──────────────────────────────────────────────
interface SubjectWithChapters {
  subject: Subject;
  chapters: FileEntry[];
  grade: SubjectGrade | null;
}

interface PastQuiz {
  path: string;
  name: string;
  subject: string;
  score: string;
  date: string;
  content: string | null;
}

function getScoreColor(score: number): string {
  return score >= 80 ? "var(--color-teal)" : score >= 60 ? "var(--color-amber)" : "var(--color-coral)";
}

function getScoreTextClass(score: number): string {
  return score >= 80 ? "text-teal" : score >= 60 ? "text-amber" : "text-coral";
}

// ─── Pre-Quiz Config ────────────────────────────────────
function QuizConfigScreen({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  const { config, setConfig, configSubject, configTopic } = useQuizStore();

  const typeOptions: { id: QuestionType; label: string; desc: string }[] = [
    { id: "multiple-choice", label: "Multiple Choice", desc: "4 options, pick one" },
    { id: "true-false", label: "True / False", desc: "Binary choice" },
    { id: "fill-blank", label: "Fill in the Blank", desc: "Type the missing word" },
    { id: "free-recall", label: "Free Recall", desc: "Open-ended, AI-evaluated" },
    { id: "code", label: "Code Problem", desc: "SQL + Python run live, pseudocode" },
  ];

  const toggleType = (type: QuestionType) => {
    const types = config.types.includes(type)
      ? config.types.filter((t) => t !== type)
      : [...config.types, type];
    if (types.length > 0) setConfig({ types });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Quiz Setup"
        subtitle={`${configSubject} — ${configTopic}`}
        meta={
          <>
            <MetaChip>{config.types.length} types</MetaChip>
            <MetaChip>{config.questionCount} questions</MetaChip>
            <MetaChip variant="accent">
              {config.bloomRange[0] === 0 ? "Adaptive difficulty" : `Bloom ${config.bloomRange[0]}-${config.bloomRange[1]}`}
            </MetaChip>
          </>
        }
        className="rounded-t-2xl border border-border-subtle"
      />

      <Panel
        className="rounded-t-none border-t-0"
        footer={
          <div className="flex gap-3">
            <SecondaryButton onClick={onCancel} className="flex-1">
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={onStart} className="flex-1">
              Start Quiz
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-8">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Question Types</p>
            <div className="grid gap-3 md:grid-cols-2">
              {typeOptions.map((opt) => {
                const active = config.types.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleType(opt.id)}
                    className={`flex items-start justify-between rounded-2xl border px-4 py-4 text-left transition-colors ${
                      active
                        ? "border-accent/40 bg-accent-soft text-text"
                        : "border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong hover:bg-panel-active"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-text">{opt.label}</p>
                      <p className="mt-1 text-xs text-text-muted">{opt.desc}</p>
                    </div>
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                      active ? "border-accent bg-accent text-white" : "border-border-strong text-text-muted"
                    }`}>
                      {active ? "✓" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Number of Questions</p>
            <div className="flex gap-2">
              {[5, 10, 15].map((n) => (
                <button
                  key={n}
                  onClick={() => setConfig({ questionCount: n })}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                    config.questionCount === n
                      ? "border-accent/40 bg-accent-soft text-text"
                      : "border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong hover:text-text"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Difficulty</p>
            <div className="grid gap-2 md:grid-cols-4">
              {([
                { label: "Auto", range: [0, 0] as [number, number] },
                { label: "Beginner", range: [1, 3] as [number, number] },
                { label: "Intermediate", range: [2, 4] as [number, number] },
                { label: "Advanced", range: [3, 6] as [number, number] },
              ]).map((opt) => {
                const active = config.bloomRange[0] === opt.range[0] && config.bloomRange[1] === opt.range[1];
                return (
                  <button
                    key={opt.label}
                    onClick={() => setConfig({ bloomRange: opt.range })}
                    className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
                      active
                        ? "border-accent/40 bg-accent-soft text-text"
                        : "border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong hover:text-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {config.bloomRange[0] === 0
                ? "Auto adjusts to your recent performance."
                : `Bloom ${config.bloomRange[0]}-${config.bloomRange[1]}: ${config.bloomRange[0] <= 2 ? "Remember → Apply" : config.bloomRange[0] <= 3 ? "Understand → Analyze" : "Apply → Create"}`}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ─── Dashboard Tab ──────────────────────────────────────
function QuizDashboard({ onStartQuiz }: { onStartQuiz: () => void }) {
  const navigate = useNavigate();
  const selectFile = useVaultStore((s) => s.selectFile);
  const [subjects, setSubjects] = useState<SubjectWithChapters[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChapters, setSelectedChapters] = useState<Record<string, string[]>>({});
  const [recentAttempts, setRecentAttempts] = useState<PastQuiz[]>([]);
  const { prepareQuiz, prepareSubjectQuiz, prepareMultiChapterQuiz } = useQuizStore();

  const toggleChapter = (slug: string, path: string) => {
    setSelectedChapters((prev) => {
      const current = prev[slug] || [];
      return { ...prev, [slug]: current.includes(path) ? current.filter((p) => p !== path) : [...current, path] };
    });
  };

  const selectAllChapters = (slug: string, chapters: FileEntry[]) => {
    const current = selectedChapters[slug] || [];
    const allPaths = chapters.map((c) => c.file_path);
    const allSelected = allPaths.every((p) => current.includes(p));
    setSelectedChapters((prev) => ({ ...prev, [slug]: allSelected ? [] : allPaths }));
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const subs = await listSubjects();
      const grades = await getSubjectGrades();
      const gradeMap = new Map(grades.map((g) => [g.subject, g]));

      const result: SubjectWithChapters[] = [];
      const recent: PastQuiz[] = [];
      for (const s of subs) {
        try {
          const chapters = await listFiles(s.slug, "chapters");
          const quizFiles = await listFiles(s.slug, "quizzes");
          for (const f of quizFiles) {
            try {
              const raw = await readFile(f.file_path);
              const { frontmatter } = parseFrontmatter(raw);
              recent.push({
                path: f.file_path,
                name: f.file_path.split("/").pop()?.replace(".md", "") || "",
                subject: s.name,
                score: frontmatter.score ? String(frontmatter.score) : "",
                date: String(frontmatter.created_at || "").split("T")[0],
                content: null,
              });
            } catch { /* skip */ }
          }
          result.push({
            subject: s,
            chapters,
            grade: gradeMap.get(s.name) || null,
          });
        } catch {
          result.push({ subject: s, chapters: [], grade: gradeMap.get(s.name) || null });
        }
      }
      setSubjects(result);
      recent.sort((a, b) => b.date.localeCompare(a.date));
      setRecentAttempts(recent.slice(0, 5));
      setLoading(false);
    })();
  }, []);

  const handleChapterQuiz = async (chapter: FileEntry, subjectName: string) => {
    try {
      const raw = await readFile(chapter.file_path);
      const { content, frontmatter } = parseFrontmatter(raw);
      const topic = (frontmatter.topic as string) || chapter.file_path.split("/").pop()?.replace(".md", "") || "";
      const ready = frontmatter.status === "digested" || hasCompletedSynthesis(raw);
      if (!ready) {
        selectFile(chapter.file_path);
        navigate("/reader");
        return;
      }
      prepareQuiz(subjectName, topic, content, chapter.file_path);
      onStartQuiz();
    } catch { /* */ }
  };

  const handleSubjectQuiz = async (slug: string, name: string) => {
    await prepareSubjectQuiz(slug, name);
    onStartQuiz();
  };

  if (loading) {
    return <LoadingState label="Loading quiz dashboard" detail="Collecting subjects, chapters, and recent scores." />;
  }

  if (subjects.length === 0) {
    return (
      <EmptyState
        title="No subjects yet"
        description="Import content in the Vault to start generating quizzes."
      />
    );
  }

  return (
    <div className="pb-8">
      {recentAttempts.length > 0 && (
        <Panel title="Recent Attempts" className="mb-4">
          <div className="space-y-2">
            {recentAttempts.map((attempt) => (
              <button
                key={attempt.path}
                onClick={async () => {
                  await useQuizStore.getState().retakeQuiz(attempt.path);
                  onStartQuiz();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-panel-alt px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-panel-active"
              >
                <div>
                  <p className="text-sm font-medium text-text">{attempt.name}</p>
                  <p className="text-[10px] text-text-muted">{attempt.subject} · {attempt.date || "Recent"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {attempt.score && <span className={`text-sm font-semibold ${getScoreTextClass(Number(attempt.score))}`}>{attempt.score}%</span>}
                  <span className="text-[10px] text-accent">Retake →</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subjects.map(({ subject, chapters, grade }) => {
          const score = grade ? Math.round(grade.avg_score) : null;
          const scoreColor = score !== null ? getScoreColor(score) : "var(--color-border-strong)";
          const isExpanded = expanded === subject.slug;

          return (
            <Panel
              key={subject.slug}
              className="overflow-hidden"
              bodyClassName="p-0"
              title={
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-text">{subject.name}</h3>
                    <p className="text-xs text-text-muted mt-1">
                      {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
                      {grade ? ` · ${grade.total_quizzes} quiz${grade.total_quizzes !== 1 ? "zes" : ""}` : ""}
                    </p>
                  </div>
                  <div className="relative w-14 h-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-surface-2, #252525)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15" fill="none" stroke={scoreColor} strokeWidth="3"
                        strokeDasharray={`${(score || 0) * 0.942} 94.2`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold" style={{ color: scoreColor }}>
                        {score !== null ? `${score}%` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              }
              footer={
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSubjectQuiz(subject.slug, subject.name)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-95"
                  >
                    <Brain size={13} />
                    Quiz All
                  </button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : subject.slug)}
                    className="rounded-xl border border-border-strong bg-panel-alt px-3 py-2 text-xs text-text-muted transition-colors hover:border-accent/40 hover:text-text"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              }
            >
              <div className="px-5">
                <div className="flex flex-wrap gap-2 pb-4">
                  <MetaChip>{chapters.length} chapter{chapters.length !== 1 ? "s" : ""}</MetaChip>
                  {grade ? <MetaChip variant={score !== null && score >= 80 ? "success" : score !== null && score >= 60 ? "warning" : "danger"}>{grade.total_quizzes} quiz{grade.total_quizzes !== 1 ? "zes" : ""}</MetaChip> : <MetaChip>No quiz history</MetaChip>}
                </div>
              </div>

              {isExpanded && chapters.length > 0 && (() => {
                const selected = selectedChapters[subject.slug] || [];
                const allSelected = chapters.every((c) => selected.includes(c.file_path));
                return (
                  <div className="border-t border-border-subtle bg-panel-alt">
                    {/* Select all + Quiz Selected bar */}
                    {chapters.length > 1 && (
                      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
                        <button
                          onClick={() => selectAllChapters(subject.slug, chapters)}
                          className="text-[10px] text-text-muted transition-colors hover:text-text"
                        >
                          {allSelected ? "Deselect All" : "Select All"}
                        </button>
                        {selected.length >= 2 && (
                          <button
                            onClick={async () => {
                              await prepareMultiChapterQuiz(subject.slug, subject.name, selected);
                              onStartQuiz();
                            }}
                            className="rounded-lg border border-accent bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-95"
                          >
                            Quiz Selected ({selected.length})
                          </button>
                        )}
                      </div>
                    )}
                    {chapters.map((ch) => {
                      const name = ch.file_path.split("/").pop()?.replace(".md", "") || "";
                      const isChecked = selected.includes(ch.file_path);
                      const topic = ch.topic || name;
                      return (
                        <div
                          key={ch.file_path}
                          className="flex items-center gap-0 border-b border-border-subtle last:border-0"
                        >
                          <button
                            onClick={() => toggleChapter(subject.slug, ch.file_path)}
                            className="px-3 py-3 transition-colors hover:bg-panel-active"
                          >
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                              isChecked ? "bg-accent border-accent" : "border-border-strong"
                            }`}>
                              {isChecked && <span className="text-white text-[8px]">✓</span>}
                            </div>
                          </button>
                          <button
                            onClick={() => handleChapterQuiz(ch, subject.name)}
                            className="flex-1 text-left transition-colors hover:bg-panel-active"
                          >
                            <div className="flex items-center justify-between gap-3 px-2 py-3 pr-5">
                              <div className="flex min-w-0 items-center gap-2">
                                <BookOpen size={14} className="shrink-0 text-accent" />
                                <span className="truncate text-xs text-text">{name}</span>
                                {topic && <span className="shrink-0 rounded-full border border-border-subtle bg-panel px-2 py-0.5 text-[10px] text-text-muted">{topic}</span>}
                              </div>
                              <span className="shrink-0 text-[10px] text-accent">Quiz →</span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ─── Score Trend Chart (SVG) ─────────────────────────────
function ScoreTrendChart({ timeline }: { timeline: QuizHistoryPoint[] }) {
  if (timeline.length === 0) return null;

  const W = 600, H = 200, PAD = 40;
  const plotW = W - PAD * 2, plotH = H - PAD * 2;

  const points = timeline.map((p, i) => {
    const x = PAD + (timeline.length === 1 ? plotW / 2 : (i / (timeline.length - 1)) * plotW);
    const y = PAD + plotH - (p.score_pct / 100) * plotH;
    return { x, y, ...p };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const dotColor = (s: number) => getScoreColor(s);

  return (
    <Panel title="Score Trend" className="mb-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((pct) => {
          const y = PAD + plotH - (pct / 100) * plotH;
          return (
            <g key={pct}>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--color-border-subtle)" strokeDasharray="2,4" />
              <text x={PAD - 6} y={y + 3} fill="var(--color-text-muted)" fontSize="9" textAnchor="end">{pct}%</text>
            </g>
          );
        })}
        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={dotColor(p.score_pct)} />
            <title>{p.date}: {p.score_pct}% ({p.subject})</title>
          </g>
        ))}
        {/* Date labels (first, last) */}
        {points.length > 0 && (
          <>
            <text x={points[0].x} y={H - 8} fill="var(--color-text-muted)" fontSize="9" textAnchor="middle">{points[0].date}</text>
            {points.length > 1 && (
              <text x={points[points.length - 1].x} y={H - 8} fill="var(--color-text-muted)" fontSize="9" textAnchor="middle">{points[points.length - 1].date}</text>
            )}
          </>
        )}
      </svg>
    </Panel>
  );
}

// ─── History Tab (Analytics Dashboard) ──────────────────
function QuizHistory({ onRetake }: { onRetake: () => void }) {
  const [timeline, setTimeline] = useState<QuizHistoryPoint[]>([]);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [grades, setGrades] = useState<SubjectGrade[]>([]);
  const [quizzes, setQuizzes] = useState<PastQuiz[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAllQuizzes, setShowAllQuizzes] = useState(false);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { retakeQuiz, prepareQuiz } = useQuizStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [tl, wt, gr, subs] = await Promise.all([
        getQuizHistoryTimeline(filterSubject ?? undefined),
        getWeakTopics(filterSubject ?? undefined),
        getSubjectGrades(),
        listSubjects(),
      ]);
      setTimeline(tl);
      setWeakTopics(wt);
      setGrades(gr);

      // Load past quizzes from files
      const all: PastQuiz[] = [];
      for (const s of subs) {
        try {
          const files = await listFiles(s.slug, "quizzes");
          for (const f of files) {
            const name = f.file_path.split("/").pop()?.replace(".md", "") || "";
            all.push({
              path: f.file_path, name, subject: s.name,
              score: "", date: name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "", content: null,
            });
          }
        } catch { /* */ }
      }
      all.sort((a, b) => b.date.localeCompare(a.date));
      setQuizzes(all);
      setLoading(false);
    })();
  }, [filterSubject]);

  const handleExpand = async (quiz: PastQuiz) => {
    if (expanded === quiz.path) { setExpanded(null); return; }
    if (!quiz.content) {
      try {
        const raw = await readFile(quiz.path);
        const { content, frontmatter } = parseFrontmatter(raw);
        quiz.content = content;
        quiz.score = frontmatter.score ? String(frontmatter.score) : "";
        setQuizzes([...quizzes]);
      } catch { /* */ }
    }
    setExpanded(quiz.path);
  };

  const handleRetake = async (path: string) => {
    await retakeQuiz(path);
    onRetake();
  };

  const handleQuizWeakTopic = async (wt: WeakTopic) => {
    // Find the chapter for this topic and start a quiz on it
    const subs = await listSubjects();
    for (const s of subs) {
      if (s.name !== wt.subject) continue;
      const files = await listFiles(s.slug, "chapters");
      for (const f of files) {
        const name = f.file_path.split("/").pop()?.replace(".md", "") || "";
        if (name.toLowerCase().includes(wt.topic.toLowerCase())) {
          try {
            const raw = await readFile(f.file_path);
            const { content } = parseFrontmatter(raw);
            prepareQuiz(wt.subject, wt.topic, content);
            onRetake();
            return;
          } catch { /* */ }
        }
      }
    }
  };

  if (loading) return <LoadingState label="Loading quiz history" detail="Analyzing trends, weak topics, and prior attempts." />;

  const hasData = timeline.length > 0 || grades.length > 0;

  if (!hasData) {
    return (
      <EmptyState title="No quiz data yet" description="Take a quiz from the dashboard to see trends and weak topics." />
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-8">
      {/* Subject filter */}
      {grades.length > 1 && (
        <Panel className="mb-4" bodyClassName="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">Filter</span>
          <button
            onClick={() => setFilterSubject(null)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              !filterSubject ? "bg-accent text-white" : "border border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong hover:text-text"
            }`}
          >
            All
          </button>
          {grades.map((g) => (
            <button
              key={g.subject}
              onClick={() => setFilterSubject(filterSubject === g.subject ? null : g.subject)}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                filterSubject === g.subject ? "bg-accent text-white" : "border border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {g.subject}
            </button>
          ))}
        </Panel>
      )}

      {/* Score Trend Chart */}
      <ScoreTrendChart timeline={timeline} />

      {/* Per-Subject Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {grades.filter((g) => !filterSubject || g.subject === filterSubject).map((g) => {
          const score = Math.round(g.avg_score);
          const color = score >= 80 ? "var(--color-teal)" : score >= 60 ? "var(--color-amber)" : "var(--color-coral)";
          return (
            <div
              key={g.subject}
              onClick={() => setFilterSubject(filterSubject === g.subject ? null : g.subject)}
              className={`cursor-pointer rounded-2xl border p-4 transition-colors ${
                filterSubject === g.subject ? "border-accent/50 bg-accent-soft" : "border-border-subtle bg-panel hover:border-border-strong"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-surface-2)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
                      strokeDasharray={`${score * 0.942} 94.2`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold" style={{ color }}>{score}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-text">{g.subject}</p>
                  <p className="text-[10px] text-text-muted">
                    {g.total_quizzes} quiz{g.total_quizzes !== 1 ? "zes" : ""}
                    {g.last_quiz_date && ` · Last: ${g.last_quiz_date.split("T")[0]}`}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weak Topics */}
      {weakTopics.length > 0 && (
        <Panel title="Weak Topics" className="mb-4">
          <div className="space-y-2">
            {weakTopics.map((wt, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-text truncate">{wt.topic}</span>
                    <span className="shrink-0 rounded-full bg-panel-alt px-2 py-0.5 text-[10px] text-text-muted">{wt.subject}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-alt">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${wt.accuracy_pct}%`,
                        backgroundColor: getScoreColor(wt.accuracy_pct),
                      }}
                    />
                  </div>
                </div>
                <span className="text-xs text-text-muted shrink-0 w-12 text-right">{Math.round(wt.accuracy_pct)}%</span>
                <button
                  onClick={() => handleQuizWeakTopic(wt)}
                  className="shrink-0 text-[10px] text-accent hover:underline"
                >
                  Quiz
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* All Quizzes (collapsible) */}
      {quizzes.length > 0 && (
        <div>
          <button
            onClick={() => setShowAllQuizzes(!showAllQuizzes)}
            className="flex items-center gap-2 text-xs text-text-muted hover:text-text mb-2"
          >
            {showAllQuizzes ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            All Quizzes ({quizzes.length})
          </button>
          {showAllQuizzes && (
            <div className="space-y-2">
              {quizzes.map((q) => (
                <div key={q.path} className="overflow-hidden rounded-2xl border border-border-subtle bg-panel shadow-[var(--shadow-panel)]">
                  <div className="flex items-center">
                    <button
                      onClick={() => handleExpand(q)}
                      className="flex-1 text-left transition-colors hover:bg-panel-alt"
                    >
                      <div className="px-4 py-3">
                        <p className="text-sm text-text">{q.name}</p>
                        <p className="text-[10px] text-text-muted">{q.subject} · {q.date}</p>
                      </div>
                      {q.score && (
                        <span className={`pr-4 text-sm font-bold ${getScoreTextClass(Number(q.score))}`}>
                          {q.score}%
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handleRetake(q.path)}
                      className="flex items-center gap-1.5 border-l border-border-subtle px-3 py-3 text-xs text-text-muted transition-colors hover:text-accent"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>

                  {expanded === q.path && q.content && (
                    <div className="space-y-3 border-t border-border-subtle px-4 py-3 text-xs">
                      {q.content.split("\n## ").filter((s) => s.startsWith("[")).map((block, i) => {
                        const lines = block.split("\n");
                        const questionLine = lines[0] || "";
                        const answerLine = lines.find((l) => l.startsWith("**Answer:**"))?.replace("**Answer:**", "").trim() || "";
                        const correctLine = lines.find((l) => l.startsWith("**Correct Answer:**"))?.replace("**Correct Answer:**", "").trim() || "";
                        const resultLine = lines.find((l) => l.startsWith("**Result:**"))?.replace("**Result:**", "").trim() || "";
                        const feedbackLine = lines.find((l) => l.startsWith("**Feedback:**"))?.replace("**Feedback:**", "").trim() || "";
                        const isCorrect = resultLine.toLowerCase().includes("correct") && !resultLine.toLowerCase().includes("incorrect");
                        return (
                          <div key={i} className={`rounded-xl border p-3 ${isCorrect ? "border-teal/30 bg-teal/10" : "border-coral/30 bg-coral/10"}`}>
                            <p className="text-text font-medium mb-1">Q{i + 1}: {questionLine.replace(/^\[.*?\]\s*/, "")}</p>
                            <p className="text-text-muted">Your answer: {answerLine}</p>
                            {correctLine && <p className="text-text-muted">Correct: {correctLine}</p>}
                            <p className={`font-medium mt-1 ${isCorrect ? "text-teal" : "text-coral"}`}>{resultLine}</p>
                            {feedbackLine && <p className="text-text-muted mt-1 italic">{feedbackLine}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SQL Quiz Editor ────────────────────────────────────
function SqlQuizEditor({ question, answer, setAnswer, onSubmit, onRun, onSetupSandbox, sandboxResult, sandboxError, activeSandboxId, loading }: {
  question: QuizQuestion;
  answer: string;
  setAnswer: (a: string) => void;
  onSubmit: () => void;
  onRun: () => void;
  onSetupSandbox: () => void;
  sandboxResult: import("../lib/types").QueryResult | null;
  sandboxError: string | null;
  activeSandboxId: string | null;
  loading: boolean;
}) {
  const [showSchema, setShowSchema] = useState(false);

  // Auto-setup sandbox when this component mounts
  useEffect(() => {
    if (question.setupSql && !activeSandboxId) {
      onSetupSandbox();
    }
  }, [question.setupSql, activeSandboxId, onSetupSandbox]);

  return (
    <div>
      {/* Schema toggle */}
      {question.setupSql && (
        <div className="mb-3">
          <button
            onClick={() => setShowSchema(!showSchema)}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            {showSchema ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showSchema ? "Hide Schema" : "Show Table Schema"}
          </button>
          {showSchema && (
            <pre className="mt-2 max-h-48 overflow-x-auto overflow-y-auto rounded-xl border border-border-subtle bg-panel-alt p-3 font-mono text-xs text-text-muted">
              {question.setupSql}
            </pre>
          )}
        </div>
      )}

      {/* SQL Editor */}
      <InputShell className="px-0 py-0">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write your SQL query here..."
          rows={6}
          className="input-reset w-full resize-none bg-transparent px-4 py-3 font-mono text-sm text-text"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) onRun();
            if (e.key === "Enter" && e.shiftKey && e.metaKey) onSubmit();
          }}
        />
      </InputShell>

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-3 mb-3">
        <div className="flex gap-2">
          <PrimaryButton
            onClick={onRun}
            disabled={!answer.trim() || !activeSandboxId}
            className="bg-teal border-teal px-4 py-2 text-xs"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run Query
          </PrimaryButton>
          <span className="text-[10px] text-text-muted self-center">Cmd+Enter to run</span>
        </div>
        <PrimaryButton
          onClick={onSubmit}
          disabled={!answer.trim() || loading}
          className="px-6 py-2 text-xs"
        >
          {loading ? "Evaluating..." : "Submit Answer"}
        </PrimaryButton>
      </div>

      {/* Sandbox error */}
      {sandboxError && (
        <div className="mb-3 rounded-xl border border-coral/30 bg-coral/10 p-3">
          <p className="text-xs text-coral font-mono">{sandboxError}</p>
        </div>
      )}

      {/* Results table */}
      {sandboxResult && (
        <div className="mb-3 overflow-hidden rounded-xl border border-border-subtle bg-panel">
          <div className="border-b border-border-subtle bg-panel-alt px-3 py-2">
            <p className="text-[10px] text-text-muted">{sandboxResult.row_count} row{sandboxResult.row_count !== 1 ? "s" : ""} returned</p>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  {sandboxResult.columns.map((col, i) => (
                    <th key={i} className="bg-panel-alt px-3 py-2 text-left font-medium text-text-muted">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sandboxResult.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-border-subtle last:border-0">
                    {row.map((val, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-text font-mono">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!activeSandboxId && question.setupSql && (
        <p className="text-xs text-text-muted animate-pulse">Setting up database...</p>
      )}
    </div>
  );
}

// ─── Python Quiz Editor ─────────────────────────────────
function PythonQuizEditor({ question, answer, setAnswer, onSubmit, onRun, pythonResult, pythonRunning, loading }: {
  question: QuizQuestion;
  answer: string;
  setAnswer: (a: string) => void;
  onSubmit: () => void;
  onRun: () => void;
  pythonResult: import("../lib/pyodide").PythonResult | null;
  pythonRunning: boolean;
  loading: boolean;
}) {
  const [showSetup, setShowSetup] = useState(false);

  return (
    <div>
      {/* Setup code toggle */}
      {question.setupCode && (
        <div className="mb-3">
          <button
            onClick={() => setShowSetup(!showSetup)}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            {showSetup ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {showSetup ? "Hide Setup Code" : "Show Setup Code"}
          </button>
          {showSetup && (
            <pre className="mt-2 max-h-48 overflow-x-auto overflow-y-auto rounded-xl border border-border-subtle bg-panel-alt p-3 font-mono text-xs text-text-muted">
              {question.setupCode}
            </pre>
          )}
        </div>
      )}

      {/* Python Editor */}
      <InputShell className="px-0 py-0">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write your Python code here..."
          rows={8}
          className="input-reset w-full resize-none bg-transparent px-4 py-3 font-mono text-sm text-text"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) onRun();
          }}
        />
      </InputShell>

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-3 mb-3">
        <div className="flex gap-2">
          <PrimaryButton
            onClick={onRun}
            disabled={!answer.trim() || pythonRunning}
            className="border-teal bg-teal px-4 py-2 text-xs"
          >
            {pythonRunning ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Run Code
              </>
            )}
          </PrimaryButton>
          <span className="text-[10px] text-text-muted self-center">Cmd+Enter to run</span>
        </div>
        <PrimaryButton
          onClick={onSubmit}
          disabled={!answer.trim() || loading}
          className="px-6 py-2 text-xs"
        >
          {loading ? "Evaluating..." : "Submit Answer"}
        </PrimaryButton>
      </div>

      {/* Output panel */}
      {pythonRunning && !pythonResult && (
        <div className="mb-3 rounded-xl border border-border-subtle bg-panel-alt p-3 text-center">
          <div className="mx-auto mb-2 h-4 w-4 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
          <p className="text-xs text-text-muted">Loading Python runtime...</p>
        </div>
      )}

      {pythonResult && (
        <div className="mb-3 overflow-hidden rounded-xl border border-border-subtle bg-panel">
          <div className="border-b border-border-subtle bg-panel-alt px-3 py-1.5">
            <span className="text-[10px] text-text-muted font-mono">Output</span>
          </div>
          <div className="p-3 font-mono text-xs max-h-48 overflow-y-auto">
            {pythonResult.stdout && (
              <pre className="text-teal whitespace-pre-wrap">{pythonResult.stdout}</pre>
            )}
            {pythonResult.error && (
              <pre className="text-coral whitespace-pre-wrap">{pythonResult.stderr || pythonResult.error}</pre>
            )}
            {!pythonResult.stdout && !pythonResult.error && (
              <span className="text-text-muted italic">No output</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Active Quiz ────────────────────────────────────────
function ActiveQuiz() {
  const {
    subject, topic, questions, currentIndex, loading, generating,
    showFeedback, sessionComplete, error, summary, generatedCards,
    activeSandboxId, sandboxResult, sandboxError,
    pythonResult, pythonRunning,
    submitAnswer, flagQuestion, nextQuestion, resetQuiz,
    runSandboxQuery, setupSandbox, runPythonCode,
  } = useQuizStore();

  const [answer, setAnswer] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!generating) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);

  if (generating) {
    return (
      <div className="mx-auto flex h-full max-w-xl items-center justify-center px-4">
        <Panel className="w-full text-center">
          <div className="space-y-4 py-4">
            <div className="text-lg font-medium text-accent">Generating quiz...</div>
            <p className="text-sm text-text-muted">Creating questions for {topic || subject}</p>
            <div className="h-2 overflow-hidden rounded-full bg-panel-alt">
              <div className="h-full rounded-full bg-accent animate-pulse" style={{ width: `${Math.min(90, elapsed * 2)}%`, transition: "width 1s ease" }} />
            </div>
            <p className="text-xs text-text-muted">
              {elapsed}s elapsed
              {elapsed > 10 && " — reasoning models take longer to think"}
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex h-full max-w-xl items-center justify-center px-4">
        <EmptyState
          title="Quiz failed to generate"
          description={error}
          action={<SecondaryButton onClick={resetQuiz}>Back to Dashboard</SecondaryButton>}
        />
      </div>
    );
  }

  if (questions.length === 0) return null;

  // ─── Results Screen ───────────────────────────────
  if (sessionComplete) {
    const correctCount = questions.filter((q) => q.correct === true).length;
    const wrongCount = questions.filter((q) => q.correct === false).length;
    const pct = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader
          title="Quiz Results"
          subtitle={`${correctCount} of ${questions.length} correct`}
          meta={
            <>
              <MetaChip variant={pct >= 80 ? "success" : pct >= 60 ? "warning" : "danger"}>{pct}% overall</MetaChip>
              <MetaChip>{wrongCount} missed</MetaChip>
              {topic && <MetaChip>{topic}</MetaChip>}
            </>
          }
          className="rounded-t-2xl border border-border-subtle"
        />
        <Panel className="rounded-t-none border-t-0" bodyClassName="space-y-4">
          <div className="text-center">
            <p className={`mb-1 text-4xl font-bold ${getScoreTextClass(pct)}`}>{pct}%</p>
            <p className="text-text-muted">{correctCount} of {questions.length} correct</p>
          </div>

          {generatedCards > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent-soft p-3">
              <CreditCard size={14} className="shrink-0 text-accent" />
              <p className="text-xs text-text">
                Created <span className="font-semibold text-accent">{generatedCards} flashcard{generatedCards !== 1 ? "s" : ""}</span> from wrong answers — they are due for review today.
              </p>
            </div>
          )}

          {summary && (
            <Panel
              title={
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-amber" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">Review These Concepts</span>
                </div>
              }
              variant="alt"
              bodyClassName="pt-0"
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-text">{summary}</p>
            </Panel>
          )}
          {wrongCount > 0 && !summary && (
            <Panel variant="alt" className="text-center">
              <p className="text-xs text-text-muted animate-pulse">Generating review summary...</p>
            </Panel>
          )}

          <div className="space-y-3">
            {questions.map((q, i) => (
              <Panel
                key={q.id}
                variant={q.correct === true ? "active" : "default"}
                className={q.correct === true ? "border-teal/30" : q.correct === false ? "border-coral/30" : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <MetaChip>Q{i + 1}</MetaChip>
                      <MetaChip>{q.type}{q.language ? ` · ${q.language}` : ""}</MetaChip>
                      <MetaChip variant="accent">Bloom {q.bloomLevel}</MetaChip>
                    </div>
                    <p className="text-sm text-text">{q.question}</p>
                    {q.userAnswer && (
                      <p className="mt-2 text-xs text-text-muted">
                        Your answer: {q.type === "code" ? <code className="rounded bg-panel-alt px-1">{q.userAnswer}</code> : q.userAnswer}
                      </p>
                    )}
                    {q.correctAnswer && (
                      <p className={`mt-1 text-xs ${q.correct === true ? "text-teal/70" : "text-teal"}`}>
                        Correct answer: {q.correctAnswer}
                      </p>
                    )}
                    {q.feedback && <p className="mt-1 text-xs italic text-text-muted">{q.feedback}</p>}
                  </div>
                  <button onClick={() => flagQuestion(i)} className={`rounded-lg p-1 ${q.flagged ? "text-coral" : "text-text-muted hover:text-coral"}`}>
                    <Flag size={12} />
                  </button>
                </div>
              </Panel>
            ))}
          </div>

          <SecondaryButton onClick={resetQuiz} className="w-full">
            Back to Dashboard
          </SecondaryButton>
        </Panel>
      </div>
    );
  }

  // ─── Active Question ──────────────────────────────
  const question = questions[currentIndex];
  if (!question) return null;

  const handleSubmit = (ans?: string) => {
    const a = ans || answer;
    if (!a.trim()) return;
    submitAnswer(a.trim());
    setAnswer("");
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        title={`Question ${currentIndex + 1} of ${questions.length}`}
        subtitle={topic || subject}
        meta={
          <>
            <MetaChip variant="accent">Bloom {question.bloomLevel}</MetaChip>
            <MetaChip className="capitalize">{question.type.replace("-", " ")}</MetaChip>
            {question.language && <MetaChip variant="success" className="uppercase">{question.language}</MetaChip>}
          </>
        }
        className="rounded-t-2xl border border-border-subtle"
      />
      <Panel className="rounded-t-none border-t-0" bodyClassName="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-text-muted">Progress</span>
          <span className="text-xs text-text-muted">{topic || subject}</span>
        </div>
        <div className="mb-6 h-2 rounded-full bg-panel-alt">
          <div className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <p className="text-xl leading-relaxed text-text" style={{ fontFamily: "var(--editor-font-family, Georgia, serif)" }}>
        {question.question}
      </p>

      {showFeedback ? (
        <div>
          <Panel variant="alt" className="mb-4" title="Your Answer" bodyClassName="space-y-2">
            {question.type === "code" ? (
              <pre className="overflow-x-auto rounded-xl border border-border-subtle bg-panel px-3 py-3 font-mono text-sm text-text">{question.userAnswer}</pre>
            ) : (
              <p className="text-sm text-text">{question.userAnswer}</p>
            )}
          </Panel>

          {question.feedback && (
            <Panel
              variant={question.correct === true ? "active" : "alt"}
              className={`mb-6 ${question.correct === true ? "border-teal/30" : question.correct === false ? "border-coral/30" : ""}`}
              title={
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${question.correct === true ? "text-teal" : question.correct === false ? "text-coral" : "text-text-muted"}`}>
                    {question.correct === true ? "Correct" : question.correct === false ? "Incorrect" : "Evaluated"}
                  </span>
                  <button onClick={() => flagQuestion(currentIndex)} className={`rounded-lg p-1 ${question.flagged ? "text-coral" : "text-text-muted hover:text-coral"}`}>
                    <Flag size={12} />
                  </button>
                </div>
              }
            >
              <p className="text-sm text-text">{question.feedback}</p>
              {question.correctAnswer && question.correct === false && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-teal">Correct answer</p>
                  {question.type === "code" ? (
                    <pre className="overflow-x-auto rounded-xl bg-teal/10 p-3 font-mono text-xs text-teal">{question.correctAnswer}</pre>
                  ) : (
                    <p className="text-sm text-teal">{question.correctAnswer}</p>
                  )}
                </div>
              )}
            </Panel>
          )}

          <PrimaryButton onClick={nextQuestion} className="w-full py-3">
            {currentIndex + 1 >= questions.length ? "See Results" : "Next Question"}
          </PrimaryButton>
        </div>
      ) : (
        <div>
          {question.type === "multiple-choice" && question.options ? (
            <div className="space-y-3">
              {question.options.map((opt, i) => (
                <button key={i} onClick={() => handleSubmit(opt)} disabled={loading}
                  className="w-full rounded-2xl border border-border-subtle bg-panel-alt p-4 text-left text-sm text-text transition-colors hover:border-border-strong hover:bg-panel-active disabled:opacity-50">
                  <span className="mr-2 font-medium text-accent">{String.fromCharCode(65 + i)}.</span>{opt}
                </button>
              ))}
            </div>
          ) : question.type === "true-false" ? (
            <div className="flex gap-3">
              <button onClick={() => handleSubmit("true")} disabled={loading}
                className="flex-1 rounded-2xl border border-teal/30 bg-teal/10 py-4 font-medium text-teal transition-colors hover:bg-teal/15 disabled:opacity-50">True</button>
              <button onClick={() => handleSubmit("false")} disabled={loading}
                className="flex-1 rounded-2xl border border-coral/30 bg-coral/10 py-4 font-medium text-coral transition-colors hover:bg-coral/15 disabled:opacity-50">False</button>
            </div>
          ) : question.type === "code" && question.language?.toLowerCase() === "python" ? (
            <PythonQuizEditor
              question={question}
              answer={answer}
              setAnswer={setAnswer}
              onSubmit={() => handleSubmit()}
              onRun={() => { if (answer.trim()) runPythonCode(answer.trim()); }}
              pythonResult={pythonResult}
              pythonRunning={pythonRunning}
              loading={loading}
            />
          ) : question.type === "code" && question.language?.toLowerCase() === "sql" ? (
            <SqlQuizEditor
              question={question}
              answer={answer}
              setAnswer={setAnswer}
              onSubmit={() => handleSubmit()}
              onRun={() => { if (answer.trim()) runSandboxQuery(answer.trim()); }}
              onSetupSandbox={() => { if (question.setupSql) setupSandbox(question.setupSql); }}
              sandboxResult={sandboxResult}
              sandboxError={sandboxError}
              activeSandboxId={activeSandboxId}
              loading={loading}
            />
          ) : question.type === "code" ? (
            <div>
              <InputShell className="px-0 py-0">
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)}
                  placeholder={`Write your ${question.language || "code"} solution here...`}
                  rows={8}
                  className="input-reset w-full resize-none bg-transparent px-4 py-3 font-mono text-sm text-text"
                  spellCheck={false}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }} />
              </InputShell>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-text-muted">Cmd+Enter to submit</span>
                <PrimaryButton onClick={() => handleSubmit()} disabled={!answer.trim() || loading}>
                  {loading ? "Evaluating..." : "Submit"}
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div>
              <InputShell className="px-0 py-0">
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)}
                  placeholder={question.type === "fill-blank" ? "Type the missing word(s)..." : "Type your answer..."}
                  rows={question.type === "fill-blank" ? 2 : 4}
                  className="input-reset w-full resize-none bg-transparent px-4 py-3 text-sm text-text"
                  onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }} />
              </InputShell>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-text-muted">Cmd+Enter to submit</span>
                <PrimaryButton onClick={() => handleSubmit()} disabled={!answer.trim() || loading}>
                  {loading ? "Evaluating..." : "Submit"}
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      )}
      </Panel>
    </div>
  );
}

// ─── Grades Tab ─────────────────────────────────────────
function QuizGrades() {
  const [grades, setGrades] = useState<SubjectGrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubjectGrades().then((g) => { setGrades(g); setLoading(false); });
  }, []);

  if (loading) return <LoadingState label="Loading grades" detail="Summarizing performance by subject." />;

  if (grades.length === 0) {
    return (
      <EmptyState title="No grades yet" description="Take a quiz to see subject-level performance." />
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="space-y-4">
        {grades.map((g) => {
          const score = Math.round(g.avg_score);
          const color = getScoreColor(score);
          return (
            <Panel key={g.subject}>
              <div className="flex items-center gap-5">
                <div className="relative w-20 h-20 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-panel-alt)" strokeWidth="2.5" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="2.5"
                      strokeDasharray={`${score * 0.942} 94.2`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold" style={{ color }}>{score}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-text">{g.subject}</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    <p className="text-xs text-text-muted">Quizzes taken</p>
                    <p className="text-xs text-text">{g.total_quizzes}</p>
                    <p className="text-xs text-text-muted">Average score</p>
                    <p className="text-xs text-text">{score}%</p>
                    <p className="text-xs text-text-muted">Last quiz</p>
                    <p className="text-xs text-text">{g.last_quiz_date?.split("T")[0] || "—"}</p>
                    <p className="text-xs text-text-muted">Grade</p>
                    <p className="text-xs font-medium" style={{ color }}>
                      {score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F"}
                    </p>
                  </div>
                  </div>
                </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Quiz Page ─────────────────────────────────────
export default function QuizPage() {
  const { questions, generating, showConfig, startQuiz, resetQuiz } = useQuizStore();
  const [tab, setTab] = useState<"dashboard" | "quiz" | "config" | "grades" | "history">("dashboard");
  const tabs = [
    { value: "dashboard" as const, label: "Dashboard" },
    ...(questions.length > 0 || generating || showConfig ? [{ value: showConfig ? "config" as const : "quiz" as const, label: showConfig ? "Setup" : "Active Quiz" }] : []),
    { value: "grades" as const, label: "Grades" },
    { value: "history" as const, label: "History" },
  ];

  // Auto-switch tabs based on quiz state
  useEffect(() => {
    if (showConfig) {
      setTab("config");
    } else if (questions.length > 0 || generating) {
      setTab("quiz");
    }
  }, [questions.length, generating, showConfig]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Quiz"
        subtitle="Generate targeted checks, review weak areas, and track performance over time."
        actions={
          <SegmentedTabs
            items={tabs}
            value={tab}
            onChange={(value) => {
              if (value === "dashboard") {
                resetQuiz();
              }
              setTab(value);
            }}
          />
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === "dashboard" && (
          <QuizDashboard onStartQuiz={() => setTab("config")} />
        )}
        {tab === "config" && (
          <QuizConfigScreen
            onStart={() => { startQuiz(); setTab("quiz"); }}
            onCancel={() => { resetQuiz(); setTab("dashboard"); }}
          />
        )}
        {tab === "quiz" && <ActiveQuiz />}
        {tab === "grades" && <QuizGrades />}
        {tab === "history" && <QuizHistory onRetake={() => setTab("quiz")} />}
      </div>
    </div>
  );
}
