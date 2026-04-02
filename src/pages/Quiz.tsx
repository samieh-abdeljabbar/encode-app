import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QuizComplete } from "../components/quiz/QuizComplete";
import { QuizFeedback } from "../components/quiz/QuizFeedback";
import { QuizQuestion } from "../components/quiz/QuizQuestion";
import { QuizSidebar } from "../components/quiz/QuizSidebar";
import { SelfRatePanel } from "../components/quiz/SelfRatePanel";
import {
  completeQuiz,
  generateQuiz,
  getQuiz,
  submitQuizAnswer,
  submitQuizSelfRating,
} from "../lib/tauri";
import type { QuestionResult, QuizState, QuizSummary } from "../lib/tauri";

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
  const quizParam = searchParams.get("id");

  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(
    chapterParam ? "config" : "loading",
  );
  const [lastResult, setLastResult] = useState<QuestionResult | null>(null);
  const [lastAnswer, setLastAnswer] = useState("");
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  }, [chapterParam, quizParam, difficulty, questionCount, questionType]);

  // Auto-load for existing quizzes (not new generation)
  useEffect(() => {
    if (quizParam && !chapterParam) {
      loadQuiz();
    }
  }, [quizParam, chapterParam, loadQuiz]);

  const handleStartQuiz = useCallback(async () => {
    setPhase("loading");
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

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/library")}
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
    ] as const;

    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-panel p-8">
          <h2 className="mb-6 text-center text-lg font-semibold text-text">
            Quiz Settings
          </h2>

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
        <div className="pixel-cat">
          <div className="pixel-cat-body" />
        </div>
        <div className="text-center">
          <p className="mb-1 text-sm font-medium text-text">
            {chapterParam ? "Generating Quiz" : "Loading Quiz"}
          </p>
          <p className="text-xs text-text-muted">
            {chapterParam ? (
              <>
                Crafting questions from your chapter
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
    return <QuizComplete summary={summary} chapterTitle={quiz.chapter_title} />;
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
