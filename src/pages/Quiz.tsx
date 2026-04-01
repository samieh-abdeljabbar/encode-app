import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QuizComplete } from "../components/quiz/QuizComplete";
import { QuizFeedback } from "../components/quiz/QuizFeedback";
import { QuizQuestion } from "../components/quiz/QuizQuestion";
import { QuizSidebar } from "../components/quiz/QuizSidebar";
import { SelfRatePanel } from "../components/quiz/SelfRatePanel";
import {
  checkAiStatus,
  completeQuiz,
  generateQuiz,
  getQuiz,
  submitQuizAnswer,
  submitQuizSelfRating,
} from "../lib/tauri";
import type { QuestionResult, QuizState, QuizSummary } from "../lib/tauri";

type Phase = "loading" | "answering" | "feedback" | "selfrating" | "complete";

export function Quiz() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const chapterParam = searchParams.get("chapter");
  const quizParam = searchParams.get("id");

  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [lastResult, setLastResult] = useState<QuestionResult | null>(null);
  const [lastAnswer, setLastAnswer] = useState("");
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadQuiz = useCallback(async () => {
    try {
      let data: QuizState;
      if (chapterParam) {
        // Check if AI is configured before generating
        const aiStatus = await checkAiStatus();
        if (!aiStatus.configured || !aiStatus.has_api_key) {
          setError(
            "Quiz generation requires an AI provider. Go to Settings to configure one.",
          );
          return;
        }
        data = await generateQuiz(Number(chapterParam));
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
  }, [chapterParam, quizParam]);

  useEffect(() => {
    loadQuiz();
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

  if (phase === "loading" || !quiz) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-accent" />
          </div>
          <p className="mb-2 text-sm font-medium text-text">
            {chapterParam ? "Generating Quiz" : "Loading Quiz"}
          </p>
          <p className="text-xs text-text-muted">
            {chapterParam
              ? "AI is crafting questions from your chapter..."
              : "Loading your quiz..."}
          </p>
          {chapterParam && (
            <div className="mx-auto mt-4 h-1 w-48 overflow-hidden rounded-full bg-border">
              <div
                className="h-full animate-pulse rounded-full bg-accent/60"
                style={{
                  width: "60%",
                  animation: "indeterminate 1.5s ease-in-out infinite",
                }}
              />
            </div>
          )}
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
