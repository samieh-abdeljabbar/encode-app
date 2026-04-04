import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PathwayCatSprite } from "../components/layout/PathwayCatSprite";
import { QuizComplete } from "../components/quiz/QuizComplete";
import { QuizFeedback } from "../components/quiz/QuizFeedback";
import { QuizQuestion } from "../components/quiz/QuizQuestion";
import { QuizSidebar } from "../components/quiz/QuizSidebar";
import { SelfRatePanel } from "../components/quiz/SelfRatePanel";
import {
  completeQuiz,
  createQuizMissedHelpNote,
  generateQuiz,
  generateSubjectQuiz,
  getQuiz,
  listNavigationChapters,
  listSubjects,
  submitQuizAnswer,
  submitQuizSelfRating,
} from "../lib/tauri";
import type {
  NavigationChapter,
  QuestionResult,
  QuizState,
  QuizSummary,
  StudyHelpNoteResult,
  Subject,
} from "../lib/tauri";

type Phase =
  | "config"
  | "loading"
  | "answering"
  | "feedback"
  | "selfrating"
  | "complete";

export function Quiz() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const chapterParam = searchParams.get("chapter");
  const subjectParam = searchParams.get("subject");
  const quizParam = searchParams.get("id");

  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(
    chapterParam || subjectParam ? "config" : "loading",
  );
  const [lastResult, setLastResult] = useState<QuestionResult | null>(null);
  const [lastAnswer, setLastAnswer] = useState("");
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [studyHelpResult, setStudyHelpResult] =
    useState<StudyHelpNoteResult | null>(null);
  const [studyHelpError, setStudyHelpError] = useState<string | null>(null);
  const [creatingStudyHelp, setCreatingStudyHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [chapterMeta, setChapterMeta] = useState<NavigationChapter | null>(
    null,
  );
  const [subjectMeta, setSubjectMeta] = useState<Subject | null>(null);

  // Config state
  const [difficulty, setDifficulty] = useState<string>("intermediate");
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [questionType, setQuestionType] = useState<string>("mixed");

  const loadQuiz = useCallback(async () => {
    try {
      let data: QuizState;
      if (chapterParam) {
        data = await generateQuiz(
          Number(chapterParam),
          difficulty,
          questionCount,
          questionType,
        );
      } else if (subjectParam) {
        data = await generateSubjectQuiz(
          Number(subjectParam),
          difficulty,
          questionCount,
          questionType,
        );
      } else if (quizParam) {
        data = await getQuiz(Number(quizParam));
      } else {
        setError("No chapter or quiz specified");
        return;
      }
      setQuiz(data);

      // Find first unanswered question
      const firstUnanswered = data.attempts.findIndex(
        (a) => a.result === "unanswered",
      );
      if (firstUnanswered === -1) {
        // All answered — complete
        const s = await completeQuiz(data.id);
        setSummary(s);
        setPhase("complete");
      } else {
        setCurrentIndex(firstUnanswered);
        setPhase("answering");
      }
    } catch (e) {
      setError(String(e));
    }
  }, [
    chapterParam,
    subjectParam,
    quizParam,
    difficulty,
    questionCount,
    questionType,
  ]);

  // Auto-load for existing quizzes (not new generation)
  useEffect(() => {
    if (quizParam && !chapterParam && !subjectParam) {
      loadQuiz();
    }
  }, [quizParam, chapterParam, subjectParam, loadQuiz]);

  useEffect(() => {
    if (!chapterParam) {
      setChapterMeta(null);
      return;
    }

    let cancelled = false;
    listNavigationChapters()
      .then((chapters) => {
        if (cancelled) return;
        setChapterMeta(
          chapters.find((chapter) => chapter.id === Number(chapterParam)) ??
            null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setChapterMeta(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chapterParam]);

  useEffect(() => {
    if (!subjectParam) {
      setSubjectMeta(null);
      return;
    }

    let cancelled = false;
    listSubjects()
      .then((subjects) => {
        if (cancelled) return;
        setSubjectMeta(
          subjects.find((subject) => subject.id === Number(subjectParam)) ??
            null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSubjectMeta(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [subjectParam]);

  const handleStartQuiz = useCallback(async () => {
    setPhase("loading");
    setStudyHelpResult(null);
    setStudyHelpError(null);
    await loadQuiz();
  }, [loadQuiz]);

  const handleSubmitAnswer = useCallback(
    async (answer: string) => {
      if (!quiz || submitting) return;
      setSubmitting(true);
      try {
        const result = await submitQuizAnswer(quiz.id, currentIndex, answer);
        setLastResult(result);
        setLastAnswer(answer);

        // Update attempts in local state
        setQuiz((prev) => {
          if (!prev) return prev;
          const updated = [...prev.attempts];
          const idx = updated.findIndex(
            (a) => a.question_index === currentIndex,
          );
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              result: result.needs_self_rating ? "unanswered" : result.verdict,
            };
          }
          return { ...prev, attempts: updated };
        });

        if (result.needs_self_rating) {
          setPhase("selfrating");
        } else {
          setPhase("feedback");
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setSubmitting(false);
      }
    },
    [quiz, currentIndex, submitting],
  );

  const handleSelfRate = useCallback(
    async (rating: string) => {
      if (!quiz || submitting) return;
      setSubmitting(true);
      try {
        const result = await submitQuizSelfRating(
          quiz.id,
          currentIndex,
          rating,
        );
        setLastResult(result);

        // Update attempts
        setQuiz((prev) => {
          if (!prev) return prev;
          const updated = [...prev.attempts];
          const idx = updated.findIndex(
            (a) => a.question_index === currentIndex,
          );
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], result: result.verdict };
          }
          return { ...prev, attempts: updated };
        });

        setPhase("feedback");
      } catch (e) {
        setError(String(e));
      } finally {
        setSubmitting(false);
      }
    },
    [quiz, currentIndex, submitting],
  );

  const handleNext = useCallback(async () => {
    if (!quiz) return;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= quiz.questions.length) {
      // All questions done — complete quiz
      setSubmitting(true);
      try {
        const s = await completeQuiz(quiz.id);
        setSummary(s);
        setPhase("complete");
      } catch (e) {
        setError(String(e));
      } finally {
        setSubmitting(false);
      }
    } else {
      setCurrentIndex(nextIndex);
      setLastResult(null);
      setLastAnswer("");
      setPhase("answering");
    }
  }, [quiz, currentIndex]);

  const handleCreateStudyHelp = useCallback(async () => {
    if (!quiz || creatingStudyHelp) return;
    setCreatingStudyHelp(true);
    setStudyHelpError(null);

    try {
      const result = await createQuizMissedHelpNote(quiz.id);
      setStudyHelpResult(result);
    } catch (reason) {
      setStudyHelpError(String(reason));
    } finally {
      setCreatingStudyHelp(false);
    }
  }, [creatingStudyHelp, quiz]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="text-sm text-accent hover:underline"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  if (phase === "config") {
    const difficulties = ["beginner", "intermediate", "expert"] as const;
    const questionCounts = [4, 6, 8, 10, 12];
    const questionTypes = [
      { value: "mixed", label: "Mixed" },
      { value: "multiple_choice", label: "Multiple Choice" },
      { value: "short_answer", label: "Short Answer" },
      { value: "true_false", label: "True / False" },
      { value: "fill_blank", label: "Fill in Blank" },
      { value: "math_input", label: "Math Input" },
      { value: "step_order", label: "Step Order" },
      { value: "code_output", label: "Code Output" },
      { value: "complete_snippet", label: "Complete Snippet" },
    ] as const;
    const quizRecommended =
      chapterMeta == null ||
      ["ready_for_quiz", "mastering", "stable"].includes(chapterMeta.status);

    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-panel p-8">
          <h2 className="mb-6 text-center text-lg font-semibold text-text">
            Quiz Settings
          </h2>

          {chapterMeta && (
            <div className="mb-5 rounded-2xl border border-border-subtle bg-surface px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                Chapter
              </div>
              <div className="mt-1 text-sm font-medium text-text">
                {chapterMeta.title}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {chapterMeta.subject_name} {"·"}{" "}
                {chapterMeta.status.replace(/_/g, " ")}
              </div>
            </div>
          )}

          {!chapterMeta && subjectMeta && (
            <div className="mb-5 rounded-2xl border border-border-subtle bg-surface px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                Subject Test
              </div>
              <div className="mt-1 text-sm font-medium text-text">
                {subjectMeta.name}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Mixed quiz across chapters in this subject
              </div>
            </div>
          )}

          {!quizRecommended && (
            <div className="mb-6 rounded-2xl border border-amber/20 bg-amber/8 px-4 py-3 text-sm text-amber">
              This chapter is not quiz-ready yet. You can still generate a quiz
              for a baseline check, but expect more gaps before reading.
            </div>
          )}

          {/* Difficulty */}
          <div className="mb-6">
            <span className="mb-2 block text-sm font-medium text-text-muted">
              Difficulty
            </span>
            <div className="flex gap-2">
              {difficulties.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-all ${
                    difficulty === d
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border-subtle bg-surface text-text-muted hover:border-accent/30"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Question Type */}
          <div className="mb-6">
            <span className="mb-2 block text-sm font-medium text-text-muted">
              Question Type
            </span>
            <div className="flex flex-wrap gap-2">
              {questionTypes.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setQuestionType(t.value)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                    questionType === t.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border-subtle bg-surface text-text-muted hover:border-accent/30"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Question Count */}
          <div className="mb-8">
            <label
              htmlFor="quiz-question-count"
              className="mb-2 block text-sm font-medium text-text-muted"
            >
              Questions
            </label>
            <select
              id="quiz-question-count"
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text focus:border-accent/40 focus:outline-none"
            >
              {questionCounts.map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-medium text-text-muted transition-all hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartQuiz}
              className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent/90"
            >
              Generate Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "loading" || !quiz) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="quiz-loading-stage">
          <div className="pathway-sprite-wander quiz-loading-wander">
            <div className="pathway-sprite-direction">
              <div className="pathway-sprite-cluster quiz-loading-sprite-cluster">
                <PathwayCatSprite
                  seed={`${chapterParam ?? subjectParam ?? "quiz"}-quiz`}
                  className="pathway-sprite-main quiz-loading-sprite"
                  personality="cozy"
                />
                <div className="pathway-pixel-cat-shadow quiz-loading-sprite-shadow" />
              </div>
            </div>
          </div>
        </div>
        <div className="text-center">
          <p className="mb-1 text-sm font-medium text-text">
            {chapterParam || subjectParam ? "Generating Quiz" : "Loading Quiz"}
          </p>
          <p className="text-xs text-text-muted">
            {chapterParam ? (
              <>
                Crafting questions from your chapter
                <span className="loading-dots" />
              </>
            ) : subjectParam ? (
              <>
                Building a mixed test across this subject
                <span className="loading-dots" />
              </>
            ) : (
              "Loading your quiz..."
            )}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "complete" && summary) {
    return (
      <QuizComplete
        summary={summary}
        chapterTitle={quiz.chapter_title}
        creatingStudyHelp={creatingStudyHelp}
        studyHelpError={studyHelpError}
        studyHelpResult={studyHelpResult}
        onCreateStudyHelp={summary.incorrect > 0 ? handleCreateStudyHelp : null}
      />
    );
  }

  const currentQuestion = quiz.questions[currentIndex];

  return (
    <div className="flex h-full">
      <QuizSidebar
        questions={quiz.questions}
        attempts={quiz.attempts}
        currentIndex={currentIndex}
      />

      <div className="flex flex-1 flex-col overflow-auto">
        {/* Header */}
        <div className="shrink-0 border-b border-border-subtle px-7 py-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <p className="text-sm font-medium text-text">
              {quiz.chapter_title}
            </p>
            <p className="text-xs text-text-muted">
              Question {currentIndex + 1} of {quiz.questions.length}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 items-start justify-center overflow-auto px-7 py-7">
          <div className="w-full max-w-2xl">
            {phase === "answering" && currentQuestion && (
              <QuizQuestion
                key={`${currentIndex}-${currentQuestion.section_id}-${currentQuestion.question_type}`}
                question={currentQuestion}
                onSubmit={handleSubmitAnswer}
                disabled={submitting}
              />
            )}

            {phase === "selfrating" && currentQuestion && (
              <SelfRatePanel
                question={currentQuestion}
                userAnswer={lastAnswer}
                onRate={handleSelfRate}
              />
            )}

            {phase === "feedback" && lastResult && (
              <QuizFeedback
                question={currentQuestion}
                result={lastResult}
                userAnswer={lastAnswer}
                onNext={handleNext}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
