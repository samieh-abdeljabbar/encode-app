import { useEffect, useState } from "react";
import { useQuizStore } from "../stores/quiz";
import { listSubjects, listFiles, readFile, getSubjectGrades, type SubjectGrade } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";
import type { Subject, FileEntry } from "../lib/types";
import { Flag, ChevronDown, ChevronRight, BookOpen, Brain } from "lucide-react";

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

// ─── Dashboard Tab ──────────────────────────────────────
function QuizDashboard({ onStartQuiz }: { onStartQuiz: () => void }) {
  const [subjects, setSubjects] = useState<SubjectWithChapters[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { generateQuiz, generateSubjectQuiz } = useQuizStore();

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
      const { content } = parseFrontmatter(raw);
      const fm = parseFrontmatter(raw).frontmatter;
      await generateQuiz(subjectName, (fm.topic as string) || chapter.file_path.split("/").pop()?.replace(".md", "") || "", content);
      onStartQuiz();
    } catch { /* */ }
  };

  const handleSubjectQuiz = async (slug: string, name: string) => {
    await generateSubjectQuiz(slug, name);
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
      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subjects.map(({ subject, chapters, grade }) => {
          const score = grade ? Math.round(grade.avg_score) : null;
          const scoreColor = score !== null
            ? score >= 80 ? "#1D9E75" : score >= 60 ? "#BA7517" : "#D85A30"
            : "#333";
          const isExpanded = expanded === subject.slug;

          return (
            <div key={subject.slug} className="bg-surface rounded-xl border border-border overflow-hidden">
              {/* Card header with grade ring */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-text">{subject.name}</h3>
                    <p className="text-xs text-text-muted mt-1">
                      {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
                      {grade ? ` · ${grade.total_quizzes} quiz${grade.total_quizzes !== 1 ? "zes" : ""}` : ""}
                    </p>
                  </div>
                  {/* Grade circle */}
                  <div className="relative w-14 h-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="#252525" strokeWidth="3" />
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

                {/* Quick actions */}
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

              {/* Expanded chapter list */}
              {isExpanded && chapters.length > 0 && (
                <div className="border-t border-border bg-[#0f0f0f]">
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
function QuizHistory() {
  const [quizzes, setQuizzes] = useState<PastQuiz[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

      // Sort by date descending
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
    // Load content if not loaded
    if (!quiz.content) {
      try {
        const raw = await readFile(quiz.path);
        const { content } = parseFrontmatter(raw);
        const fm = parseFrontmatter(raw).frontmatter;
        quiz.content = content;
        quiz.score = fm.score ? String(fm.score) : "";
        setQuizzes([...quizzes]);
      } catch { /* */ }
    }
    setExpanded(quiz.path);
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
          <button
            onClick={() => handleExpand(q)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors text-left"
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

          {expanded === q.path && q.content && (
            <div className="border-t border-border px-4 py-3 space-y-3 text-xs">
              {/* Parse and display questions from markdown content */}
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

// ─── Active Quiz (existing flow) ────────────────────────
function ActiveQuiz() {
  const {
    subject, topic, questions, currentIndex, loading, generating,
    showFeedback, sessionComplete, error,
    submitAnswer, flagQuestion, nextQuestion, resetQuiz,
  } = useQuizStore();

  const [answer, setAnswer] = useState("");

  if (generating) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-pulse text-purple text-lg mb-2">Generating quiz...</div>
          <p className="text-text-muted text-sm">Creating questions for {topic || subject}</p>
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

  if (questions.length === 0) {
    return null; // Dashboard will show instead
  }

  if (sessionComplete) {
    const correctCount = questions.filter((q) => q.correct === true).length;
    const pct = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="text-center mb-6">
          <p className="text-3xl font-bold mb-1">
            <span className={pct >= 80 ? "text-teal" : pct >= 60 ? "text-amber" : "text-coral"}>{pct}%</span>
          </p>
          <p className="text-text-muted">{correctCount} of {questions.length} correct</p>
        </div>

        <div className="space-y-2 mb-8">
          {questions.map((q, i) => (
            <div key={q.id} className={`p-3 rounded border ${
              q.correct === true ? "border-teal/30 bg-teal/5" : q.correct === false ? "border-coral/30 bg-coral/5" : "border-border bg-surface"
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-[10px] text-text-muted mb-1">Q{i + 1} ({q.type}) Bloom {q.bloomLevel}</p>
                  <p className="text-sm text-text">{q.question}</p>
                  {q.userAnswer && <p className="text-xs text-text-muted mt-1">Your answer: {q.userAnswer}</p>}
                  {q.correctAnswer && q.correct === false && (
                    <p className="text-xs text-teal mt-1">Correct answer: {q.correctAnswer}</p>
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

  // Active question
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
      </div>

      <p className="text-lg leading-relaxed mb-6" style={{ fontFamily: "var(--editor-font-family, Georgia, serif)" }}>
        {question.question}
      </p>

      {showFeedback ? (
        <div>
          <div className="p-3 bg-surface rounded border border-border mb-4">
            <p className="text-xs text-text-muted mb-1">Your answer:</p>
            <p className="text-sm text-text">{question.userAnswer}</p>
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
                <p className="text-xs text-teal mt-2">Correct answer: {question.correctAnswer}</p>
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
          const color = score >= 80 ? "#1D9E75" : score >= 60 ? "#BA7517" : "#D85A30";
          return (
            <div key={g.subject} className="bg-surface rounded-xl border border-border p-5">
              <div className="flex items-center gap-5">
                {/* Grade ring */}
                <div className="relative w-20 h-20 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#252525" strokeWidth="2.5" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="2.5"
                      strokeDasharray={`${score * 0.942} 94.2`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold" style={{ color }}>{score}%</span>
                  </div>
                </div>

                {/* Details */}
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
  const { questions, generating, resetQuiz } = useQuizStore();
  const [tab, setTab] = useState<"dashboard" | "quiz" | "grades" | "history">("dashboard");

  // Auto-switch to quiz tab when questions are generated
  useEffect(() => {
    if (questions.length > 0 || generating) {
      setTab("quiz");
    }
  }, [questions.length, generating]);

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
        {(questions.length > 0 || generating) && (
          <button
            onClick={() => setTab("quiz")}
            className={`text-sm transition-colors ${tab === "quiz" ? "text-purple font-medium border-b-2 border-purple pb-0.5" : "text-text-muted hover:text-text"}`}
          >
            Active Quiz
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
          <QuizDashboard onStartQuiz={() => setTab("quiz")} />
        )}
        {tab === "quiz" && <ActiveQuiz />}
        {tab === "grades" && <QuizGrades />}
        {tab === "history" && <QuizHistory />}
      </div>
    </div>
  );
}
