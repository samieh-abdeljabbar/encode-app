import { useEffect, useState } from "react";
import { useQuizStore, type QuestionType } from "../stores/quiz";
import { listSubjects, listFiles, readFile, getSubjectGrades, type SubjectGrade } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";
import type { Subject, FileEntry } from "../lib/types";
import { Flag, ChevronDown, ChevronRight, BookOpen, Brain, RotateCcw, Sparkles, CreditCard } from "lucide-react";

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

// ─── Pre-Quiz Config ────────────────────────────────────
function QuizConfigScreen({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  const { config, setConfig, configSubject, configTopic } = useQuizStore();

  const typeOptions: { id: QuestionType; label: string; desc: string }[] = [
    { id: "multiple-choice", label: "Multiple Choice", desc: "4 options, pick one" },
    { id: "true-false", label: "True / False", desc: "Binary choice" },
    { id: "fill-blank", label: "Fill in the Blank", desc: "Type the missing word" },
    { id: "free-recall", label: "Free Recall", desc: "Open-ended, AI-evaluated" },
    { id: "code", label: "Code Problem", desc: "SQL, Python, or pseudocode" },
  ];

  const toggleType = (type: QuestionType) => {
    const types = config.types.includes(type)
      ? config.types.filter((t) => t !== type)
      : [...config.types, type];
    if (types.length > 0) setConfig({ types });
  };

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <h2 className="text-lg font-semibold text-text mb-1">Quiz Setup</h2>
      <p className="text-xs text-text-muted mb-6">{configSubject} — {configTopic}</p>

      {/* Question Types */}
      <div className="mb-6">
        <p className="text-xs font-medium text-text mb-2">Question Types</p>
        <div className="space-y-1.5">
          {typeOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => toggleType(opt.id)}
              className={`w-full flex items-center justify-between p-2.5 rounded border text-left transition-colors ${
                config.types.includes(opt.id)
                  ? "border-purple bg-purple/10 text-text"
                  : "border-border bg-surface text-text-muted hover:border-purple/30"
              }`}
            >
              <div>
                <span className="text-sm">{opt.label}</span>
                <span className="text-[10px] text-text-muted ml-2">{opt.desc}</span>
              </div>
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                config.types.includes(opt.id) ? "bg-purple border-purple" : "border-border"
              }`}>
                {config.types.includes(opt.id) && <span className="text-white text-[10px]">✓</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Question Count */}
      <div className="mb-6">
        <p className="text-xs font-medium text-text mb-2">Number of Questions</p>
        <div className="flex gap-2">
          {[5, 10, 15].map((n) => (
            <button
              key={n}
              onClick={() => setConfig({ questionCount: n })}
              className={`flex-1 py-2 rounded border text-sm font-medium transition-colors ${
                config.questionCount === n
                  ? "border-purple bg-purple/10 text-purple"
                  : "border-border bg-surface text-text-muted hover:border-purple/30"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Bloom Level */}
      <div className="mb-8">
        <p className="text-xs font-medium text-text mb-2">Difficulty</p>
        <div className="flex gap-2">
          {([
            { label: "Beginner", range: [1, 3] as [number, number] },
            { label: "Intermediate", range: [2, 4] as [number, number] },
            { label: "Advanced", range: [3, 6] as [number, number] },
          ]).map((opt) => (
            <button
              key={opt.label}
              onClick={() => setConfig({ bloomRange: opt.range })}
              className={`flex-1 py-2 rounded border text-sm transition-colors ${
                config.bloomRange[0] === opt.range[0] && config.bloomRange[1] === opt.range[1]
                  ? "border-purple bg-purple/10 text-purple font-medium"
                  : "border-border bg-surface text-text-muted hover:border-purple/30"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-1.5">
          Bloom {config.bloomRange[0]}-{config.bloomRange[1]}: {config.bloomRange[0] <= 2 ? "Remember → Apply" : config.bloomRange[0] <= 3 ? "Understand → Analyze" : "Apply → Create"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 text-sm border border-border rounded text-text-muted hover:text-text hover:border-purple/30 transition-colors">
          Cancel
        </button>
        <button onClick={onStart} className="flex-1 py-2.5 text-sm bg-purple text-white rounded font-medium hover:opacity-90">
          Start Quiz
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard Tab ──────────────────────────────────────
function QuizDashboard({ onStartQuiz }: { onStartQuiz: () => void }) {
  const [subjects, setSubjects] = useState<SubjectWithChapters[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { prepareQuiz, prepareSubjectQuiz } = useQuizStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const subs = await listSubjects();
      const grades = await getSubjectGrades();
      const gradeMap = new Map(grades.map((g) => [g.subject, g]));

      const result: SubjectWithChapters[] = [];
      for (const s of subs) {
        try {
          const chapters = await listFiles(s.slug, "chapters");
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
      setLoading(false);
    })();
  }, []);

  const handleChapterQuiz = async (chapter: FileEntry, subjectName: string) => {
    try {
      const raw = await readFile(chapter.file_path);
      const { content, frontmatter } = parseFrontmatter(raw);
      const topic = (frontmatter.topic as string) || chapter.file_path.split("/").pop()?.replace(".md", "") || "";
      prepareQuiz(subjectName, topic, content);
      onStartQuiz();
    } catch { /* */ }
  };

  const handleSubjectQuiz = async (slug: string, name: string) => {
    await prepareSubjectQuiz(slug, name);
    onStartQuiz();
  };

  if (loading) {
    return <p className="text-text-muted text-center py-12">Loading subjects...</p>;
  }

  if (subjects.length === 0) {
    return (
      <div className="text-center py-12">
        <Brain size={32} className="text-text-muted mx-auto mb-3" />
        <p className="text-text-muted mb-2">No subjects yet.</p>
        <p className="text-text-muted text-sm">Import content in the Vault to start quizzing.</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subjects.map(({ subject, chapters, grade }) => {
          const score = grade ? Math.round(grade.avg_score) : null;
          const scoreColor = score !== null
            ? score >= 80 ? "var(--color-teal)" : score >= 60 ? "var(--color-amber)" : "var(--color-coral)"
            : "var(--color-border)";
          const isExpanded = expanded === subject.slug;

          return (
            <div key={subject.slug} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="p-5">
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

                <div className="flex gap-2">
                  <button
                    onClick={() => handleSubjectQuiz(subject.slug, subject.name)}
                    className="flex-1 py-2 text-xs bg-purple text-white rounded-lg hover:opacity-90 font-medium flex items-center justify-center gap-1.5"
                  >
                    <Brain size={13} />
                    Quiz All
                  </button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : subject.slug)}
                    className="px-3 py-2 text-xs text-text-muted border border-border rounded-lg hover:text-text hover:border-purple/50 transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              </div>

              {isExpanded && chapters.length > 0 && (
                <div className="border-t border-border bg-bg">
                  {chapters.map((ch) => {
                    const name = ch.file_path.split("/").pop()?.replace(".md", "") || "";
                    return (
                      <button
                        key={ch.file_path}
                        onClick={() => handleChapterQuiz(ch, subject.name)}
                        className="w-full flex items-center justify-between px-5 py-2.5 border-b border-border/50 last:border-0 hover:bg-surface-2/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BookOpen size={14} className="text-purple shrink-0" />
                          <span className="text-xs text-text truncate">{name}</span>
                        </div>
                        <span className="text-[10px] text-purple shrink-0">Quiz →</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── History Tab ────────────────────────────────────────
function QuizHistory({ onRetake }: { onRetake: () => void }) {
  const [quizzes, setQuizzes] = useState<PastQuiz[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { retakeQuiz } = useQuizStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const subs = await listSubjects();
      const all: PastQuiz[] = [];

      for (const s of subs) {
        try {
          const files = await listFiles(s.slug, "quizzes");
          for (const f of files) {
            const name = f.file_path.split("/").pop()?.replace(".md", "") || "";
            all.push({
              path: f.file_path,
              name,
              subject: s.name,
              score: "",
              date: name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "",
              content: null,
            });
          }
        } catch { /* */ }
      }

      all.sort((a, b) => b.date.localeCompare(a.date));
      setQuizzes(all);
      setLoading(false);
    })();
  }, []);

  const handleExpand = async (quiz: PastQuiz) => {
    if (expanded === quiz.path) {
      setExpanded(null);
      return;
    }
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

  if (loading) return <p className="text-text-muted text-center py-12">Loading history...</p>;

  if (quizzes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">No quizzes taken yet.</p>
        <p className="text-text-muted text-sm mt-1">Generate a quiz from the Dashboard tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-8">
      {quizzes.map((q) => (
        <div key={q.path} className="bg-surface rounded border border-border overflow-hidden">
          <div className="flex items-center">
            <button
              onClick={() => handleExpand(q)}
              className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors text-left"
            >
              <div>
                <p className="text-sm text-text">{q.name}</p>
                <p className="text-[10px] text-text-muted">{q.subject} · {q.date}</p>
              </div>
              {q.score && (
                <span className={`text-sm font-bold ${
                  Number(q.score) >= 80 ? "text-teal" : Number(q.score) >= 60 ? "text-amber" : "text-coral"
                }`}>
                  {q.score}%
                </span>
              )}
            </button>
            <button
              onClick={() => handleRetake(q.path)}
              className="flex items-center gap-1.5 px-3 py-3 text-xs text-text-muted hover:text-purple transition-colors border-l border-border"
            >
              <RotateCcw size={13} />
              <span>Retake</span>
            </button>
          </div>

          {expanded === q.path && q.content && (
            <div className="border-t border-border px-4 py-3 space-y-3 text-xs">
              {q.content.split("\n## ").filter((s) => s.startsWith("[")).map((block, i) => {
                const lines = block.split("\n");
                const questionLine = lines[0] || "";
                const answerLine = lines.find((l) => l.startsWith("**Answer:**"))?.replace("**Answer:**", "").trim() || "";
                const correctLine = lines.find((l) => l.startsWith("**Correct Answer:**"))?.replace("**Correct Answer:**", "").trim() || "";
                const resultLine = lines.find((l) => l.startsWith("**Result:**"))?.replace("**Result:**", "").trim() || "";
                const feedbackLine = lines.find((l) => l.startsWith("**Feedback:**"))?.replace("**Feedback:**", "").trim() || "";
                const isCorrect = resultLine.toLowerCase().includes("correct") && !resultLine.toLowerCase().includes("incorrect");

                return (
                  <div key={i} className={`p-3 rounded border ${isCorrect ? "border-teal/30 bg-teal/5" : "border-coral/30 bg-coral/5"}`}>
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
  );
}

// ─── Active Quiz ────────────────────────────────────────
function ActiveQuiz() {
  const {
    subject, topic, questions, currentIndex, loading, generating,
    showFeedback, sessionComplete, error, summary, generatedCards,
    submitAnswer, flagQuestion, nextQuestion, resetQuiz,
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
      <div className="flex items-center justify-center h-full">
        <div className="max-w-sm w-full px-8 text-center">
          <div className="text-purple text-lg font-medium mb-2">Generating quiz...</div>
          <p className="text-text-muted text-sm mb-4">Creating questions for {topic || subject}</p>
          {/* Progress bar */}
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-purple rounded-full animate-pulse" style={{ width: `${Math.min(90, elapsed * 2)}%`, transition: "width 1s ease" }} />
          </div>
          <p className="text-xs text-text-muted">
            {elapsed}s elapsed
            {elapsed > 10 && " — reasoning models take longer to think"}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-coral mb-4">{error}</p>
          <button onClick={resetQuiz} className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10">
            Back to Dashboard
          </button>
        </div>
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
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="text-center mb-6">
          <p className="text-3xl font-bold mb-1">
            <span className={pct >= 80 ? "text-teal" : pct >= 60 ? "text-amber" : "text-coral"}>{pct}%</span>
          </p>
          <p className="text-text-muted">{correctCount} of {questions.length} correct</p>
        </div>

        {/* Auto-flashcards notice */}
        {generatedCards > 0 && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded border border-purple/30 bg-purple/5">
            <CreditCard size={14} className="text-purple shrink-0" />
            <p className="text-xs text-text">
              Created <span className="font-semibold text-purple">{generatedCards} flashcard{generatedCards !== 1 ? "s" : ""}</span> from wrong answers — they're due for review today.
            </p>
          </div>
        )}

        {/* AI Summary of what to review */}
        {summary && (
          <div className="p-4 mb-4 rounded border border-amber/30 bg-amber/5">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={13} className="text-amber" />
              <p className="text-xs font-medium text-amber">Review These Concepts</p>
            </div>
            <p className="text-sm text-text whitespace-pre-line leading-relaxed">{summary}</p>
          </div>
        )}
        {wrongCount > 0 && !summary && (
          <div className="p-3 mb-4 rounded border border-border bg-surface text-center">
            <p className="text-xs text-text-muted animate-pulse">Generating review summary...</p>
          </div>
        )}

        {/* Question results */}
        <div className="space-y-2 mb-8">
          {questions.map((q, i) => (
            <div key={q.id} className={`p-3 rounded border ${
              q.correct === true ? "border-teal/30 bg-teal/5" : q.correct === false ? "border-coral/30 bg-coral/5" : "border-border bg-surface"
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[10px] text-text-muted mb-1">
                    Q{i + 1} ({q.type}{q.language ? ` · ${q.language}` : ""}) Bloom {q.bloomLevel}
                  </p>
                  <p className="text-sm text-text">{q.question}</p>
                  {q.userAnswer && (
                    <p className="text-xs text-text-muted mt-1">
                      Your answer: {q.type === "code" ? <code className="bg-surface-2 px-1 rounded">{q.userAnswer}</code> : q.userAnswer}
                    </p>
                  )}
                  {q.correctAnswer && (
                    <p className={`text-xs mt-1 ${q.correct === true ? "text-teal/60" : "text-teal"}`}>
                      Correct answer: {q.correctAnswer}
                    </p>
                  )}
                  {q.feedback && <p className="text-xs text-text-muted mt-1 italic">{q.feedback}</p>}
                </div>
                <button onClick={() => flagQuestion(i)}
                  className={`p-1 ml-2 ${q.flagged ? "text-coral" : "text-text-muted hover:text-coral"}`}>
                  <Flag size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={resetQuiz}
          className="w-full py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10">
          Back to Dashboard
        </button>
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
    <div className="max-w-[600px] mx-auto px-8 py-8">
      {/* Progress */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">Question {currentIndex + 1} of {questions.length}</span>
        <span className="text-xs text-text-muted">{topic || subject}</span>
      </div>
      <div className="h-1 bg-surface-2 rounded mb-6">
        <div className="h-full bg-purple rounded transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs px-2 py-0.5 bg-purple/20 text-purple rounded">Bloom {question.bloomLevel}</span>
        <span className="text-xs px-2 py-0.5 bg-surface-2 text-text-muted rounded capitalize">{question.type.replace("-", " ")}</span>
        {question.language && (
          <span className="text-xs px-2 py-0.5 bg-teal/20 text-teal rounded uppercase">{question.language}</span>
        )}
      </div>

      <p className="text-lg leading-relaxed mb-6" style={{ fontFamily: "var(--editor-font-family, Georgia, serif)" }}>
        {question.question}
      </p>

      {showFeedback ? (
        <div>
          <div className="p-3 bg-surface rounded border border-border mb-4">
            <p className="text-xs text-text-muted mb-1">Your answer:</p>
            {question.type === "code" ? (
              <pre className="text-sm text-text font-mono bg-bg p-2 rounded overflow-x-auto">{question.userAnswer}</pre>
            ) : (
              <p className="text-sm text-text">{question.userAnswer}</p>
            )}
          </div>

          {question.feedback && (
            <div className={`p-4 rounded border mb-6 ${
              question.correct === true ? "border-teal bg-teal/5" : question.correct === false ? "border-coral bg-coral/5" : "border-border bg-surface"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <p className={`text-xs font-medium ${question.correct === true ? "text-teal" : question.correct === false ? "text-coral" : "text-text-muted"}`}>
                  {question.correct === true ? "Correct" : question.correct === false ? "Incorrect" : "Evaluated"}
                </p>
                <button onClick={() => flagQuestion(currentIndex)}
                  className={`p-1 ${question.flagged ? "text-coral" : "text-text-muted hover:text-coral"}`}>
                  <Flag size={12} />
                </button>
              </div>
              <p className="text-sm text-text">{question.feedback}</p>
              {question.correctAnswer && question.correct === false && (
                <div className="mt-2">
                  <p className="text-xs text-teal">Correct answer:</p>
                  {question.type === "code" ? (
                    <pre className="text-xs text-teal font-mono bg-teal/5 p-2 rounded mt-1 overflow-x-auto">{question.correctAnswer}</pre>
                  ) : (
                    <p className="text-xs text-teal">{question.correctAnswer}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <button onClick={nextQuestion} className="w-full py-3 bg-purple text-white rounded font-medium hover:opacity-90">
            {currentIndex + 1 >= questions.length ? "See Results" : "Next Question"}
          </button>
        </div>
      ) : (
        <div>
          {question.type === "multiple-choice" && question.options ? (
            <div className="space-y-2 mb-4">
              {question.options.map((opt, i) => (
                <button key={i} onClick={() => handleSubmit(opt)} disabled={loading}
                  className="w-full text-left p-3 bg-surface border border-border rounded hover:border-purple hover:bg-surface-2 transition-colors text-sm disabled:opacity-50">
                  <span className="text-purple font-medium mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                </button>
              ))}
            </div>
          ) : question.type === "true-false" ? (
            <div className="flex gap-3 mb-4">
              <button onClick={() => handleSubmit("true")} disabled={loading}
                className="flex-1 py-3 bg-teal/10 border border-teal/30 rounded text-teal font-medium hover:bg-teal/20 disabled:opacity-50">True</button>
              <button onClick={() => handleSubmit("false")} disabled={loading}
                className="flex-1 py-3 bg-coral/10 border border-coral/30 rounded text-coral font-medium hover:bg-coral/20 disabled:opacity-50">False</button>
            </div>
          ) : question.type === "code" ? (
            <div>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)}
                placeholder={`Write your ${question.language || "code"} solution here...`}
                rows={8}
                className="w-full p-3 bg-bg border border-border rounded text-text text-sm resize-none focus:outline-none focus:border-purple font-mono"
                spellCheck={false}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }} />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-text-muted">Cmd+Enter to submit</span>
                <button onClick={() => handleSubmit()} disabled={!answer.trim() || loading}
                  className="px-6 py-2 bg-purple text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-30">
                  {loading ? "Evaluating..." : "Submit"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)}
                placeholder={question.type === "fill-blank" ? "Type the missing word(s)..." : "Type your answer..."}
                rows={question.type === "fill-blank" ? 2 : 4}
                className="w-full p-3 bg-surface border border-border rounded text-text text-sm resize-none focus:outline-none focus:border-purple"
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }} />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-text-muted">Cmd+Enter to submit</span>
                <button onClick={() => handleSubmit()} disabled={!answer.trim() || loading}
                  className="px-6 py-2 bg-purple text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-30">
                  {loading ? "Evaluating..." : "Submit"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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

  if (loading) return <p className="text-text-muted text-center py-12">Loading grades...</p>;

  if (grades.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">No grades yet. Take a quiz to see your performance.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="space-y-4">
        {grades.map((g) => {
          const score = Math.round(g.avg_score);
          const color = score >= 80 ? "var(--color-teal)" : score >= 60 ? "var(--color-amber)" : "var(--color-coral)";
          return (
            <div key={g.subject} className="bg-surface rounded-xl border border-border p-5">
              <div className="flex items-center gap-5">
                <div className="relative w-20 h-20 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-surface-2, #252525)" strokeWidth="2.5" />
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
            </div>
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
      {/* Tab bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border shrink-0">
        <button
          onClick={() => { resetQuiz(); setTab("dashboard"); }}
          className={`text-sm transition-colors ${tab === "dashboard" ? "text-purple font-medium border-b-2 border-purple pb-0.5" : "text-text-muted hover:text-text"}`}
        >
          Dashboard
        </button>
        {(questions.length > 0 || generating || showConfig) && (
          <button
            onClick={() => setTab(showConfig ? "config" : "quiz")}
            className={`text-sm transition-colors ${(tab === "quiz" || tab === "config") ? "text-purple font-medium border-b-2 border-purple pb-0.5" : "text-text-muted hover:text-text"}`}
          >
            {showConfig ? "Setup" : "Active Quiz"}
          </button>
        )}
        <button
          onClick={() => setTab("grades")}
          className={`text-sm transition-colors ${tab === "grades" ? "text-purple font-medium border-b-2 border-purple pb-0.5" : "text-text-muted hover:text-text"}`}
        >
          Grades
        </button>
        <button
          onClick={() => setTab("history")}
          className={`text-sm transition-colors ${tab === "history" ? "text-purple font-medium border-b-2 border-purple pb-0.5" : "text-text-muted hover:text-text"}`}
        >
          History
        </button>
      </div>

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
