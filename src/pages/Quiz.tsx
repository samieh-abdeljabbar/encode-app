import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuizStore } from "../stores/quiz";

export default function QuizPage() {
  const navigate = useNavigate();
  const {
    subject,
    topic,
    questions,
    currentIndex,
    loading,
    generating,
    showFeedback,
    sessionComplete,
    error,
    submitAnswer,
    nextQuestion,
    resetQuiz,
  } = useQuizStore();

  const [answer, setAnswer] = useState("");

  if (generating) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-pulse text-purple text-lg mb-2">
            Generating quiz...
          </div>
          <p className="text-text-muted text-sm">
            AI is creating questions for {topic || subject}
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
          <button
            onClick={() => {
              resetQuiz();
              navigate("/vault");
            }}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
          >
            Back to Vault
          </button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-text-muted mb-4">
            No quiz loaded. Generate a quiz from a chapter in the Vault.
          </p>
          <button
            onClick={() => navigate("/vault")}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
          >
            Go to Vault
          </button>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    const correctCount = questions.filter((q) => q.correct === true).length;
    const total = questions.length;
    const pct = Math.round((correctCount / total) * 100);

    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-2xl font-bold mb-2">
            <span className={pct >= 70 ? "text-teal" : "text-coral"}>
              {pct}%
            </span>
          </p>
          <p className="text-text-muted mb-6">
            {correctCount} of {total} correct
          </p>

          <div className="space-y-3 mb-8 text-left">
            {questions.map((q, i) => (
              <div
                key={q.id}
                className={`p-3 rounded border ${
                  q.correct === true
                    ? "border-[#1D9E75]/30 bg-[#1D9E75]/5"
                    : q.correct === false
                      ? "border-[#D85A30]/30 bg-[#D85A30]/5"
                      : "border-border bg-surface"
                }`}
              >
                <p className="text-xs text-text-muted mb-1">
                  Q{i + 1} (Bloom {q.bloomLevel})
                </p>
                <p className="text-sm text-text">{q.question}</p>
                {q.feedback && (
                  <p className="text-xs text-text-muted mt-1">{q.feedback}</p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              resetQuiz();
              navigate("/vault");
            }}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
          >
            Back to Vault
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  if (!question) return null;

  const handleSubmit = () => {
    if (!answer.trim()) return;
    submitAnswer(answer.trim());
    setAnswer("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              resetQuiz();
              navigate("/vault");
            }}
            className="text-sm text-text-muted hover:text-text"
          >
            &larr; Back
          </button>
          <span className="text-sm font-medium">
            Quiz: {topic || subject}
          </span>
        </div>
        <span className="text-xs text-text-muted">
          Question {currentIndex + 1} of {questions.length}
        </span>
      </div>

      {/* Progress */}
      <div className="h-1 bg-surface-2">
        <div
          className="h-full bg-purple transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / questions.length) * 100}%`,
          }}
        />
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[600px] mx-auto px-8 py-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs px-2 py-1 bg-purple/20 text-purple rounded">
              Bloom {question.bloomLevel}
            </span>
          </div>

          <p
            className="text-lg leading-relaxed mb-6"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {question.question}
          </p>

          {showFeedback ? (
            <div>
              {/* User's answer */}
              <div className="p-3 bg-surface rounded border border-border mb-4">
                <p className="text-xs text-text-muted mb-1">Your answer:</p>
                <p className="text-sm text-text">{question.userAnswer}</p>
              </div>

              {/* Feedback */}
              {question.feedback && (
                <div
                  className={`p-4 rounded border mb-6 ${
                    question.correct === true
                      ? "border-[#1D9E75] bg-[#1a2a1a]"
                      : question.correct === false
                        ? "border-[#D85A30] bg-[#3a1a1a]"
                        : "border-border bg-surface"
                  }`}
                >
                  <p
                    className={`text-xs font-medium mb-1 ${
                      question.correct === true
                        ? "text-teal"
                        : question.correct === false
                          ? "text-coral"
                          : "text-text-muted"
                    }`}
                  >
                    {question.correct === true
                      ? "Correct"
                      : question.correct === false
                        ? "Needs work"
                        : "Evaluated"}
                  </p>
                  <p className="text-sm text-text">{question.feedback}</p>
                </div>
              )}

              <button
                onClick={nextQuestion}
                className="w-full py-3 bg-purple text-white rounded font-medium hover:opacity-90"
              >
                {currentIndex + 1 >= questions.length
                  ? "See Results"
                  : "Next Question"}
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer..."
                rows={4}
                className="w-full p-3 bg-surface border border-border rounded text-text text-sm resize-none focus:outline-none focus:border-purple"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) handleSubmit();
                }}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-text-muted">
                  Cmd+Enter to submit
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!answer.trim() || loading}
                  className="px-6 py-2 bg-purple text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {loading ? "Evaluating..." : "Submit"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
