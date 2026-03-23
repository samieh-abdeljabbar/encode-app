import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuizStore } from "../stores/quiz";
import { Flag } from "lucide-react";

export default function QuizPage() {
  const navigate = useNavigate();
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
          <p className="text-text-muted text-sm">AI is creating questions for {topic || subject}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-coral mb-4">{error}</p>
          <button onClick={() => { resetQuiz(); navigate("/vault"); }}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10">
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
          <p className="text-text-muted mb-4">No quiz loaded. Generate a quiz from a chapter in the Vault.</p>
          <button onClick={() => navigate("/vault")}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10">
            Go to Vault
          </button>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    const correctCount = questions.filter((q) => q.correct === true).length;
    const pct = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md w-full px-8">
          <p className="text-3xl font-bold mb-1">
            <span className={pct >= 70 ? "text-teal" : "text-coral"}>{pct}%</span>
          </p>
          <p className="text-text-muted mb-6">{correctCount} of {questions.length} correct</p>

          <div className="space-y-2 mb-8 text-left">
            {questions.map((q, i) => (
              <div key={q.id} className={`p-3 rounded border ${
                q.correct === true ? "border-teal/30 bg-teal/5"
                  : q.correct === false ? "border-coral/30 bg-coral/5"
                    : "border-border bg-surface"
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-[10px] text-text-muted mb-1">
                      Q{i + 1} ({q.type}) Bloom {q.bloomLevel}
                    </p>
                    <p className="text-sm text-text">{q.question}</p>
                    {q.feedback && <p className="text-xs text-text-muted mt-1">{q.feedback}</p>}
                  </div>
                  <button onClick={() => flagQuestion(i)}
                    className={`p-1 ml-2 ${q.flagged ? "text-coral" : "text-text-muted hover:text-coral"}`}
                    title={q.flagged ? "Flagged as inaccurate" : "Flag question"}>
                    <Flag size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => { resetQuiz(); navigate("/vault"); }}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10">
            Back to Vault
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  if (!question) return null;

  const handleSubmit = (ans?: string) => {
    const a = ans || answer;
    if (!a.trim()) return;
    submitAnswer(a.trim());
    setAnswer("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => { resetQuiz(); navigate("/vault"); }}
            className="text-sm text-text-muted hover:text-text">&larr; Back</button>
          <span className="text-sm font-medium">Quiz: {topic || subject}</span>
        </div>
        <span className="text-xs text-text-muted">Question {currentIndex + 1} of {questions.length}</span>
      </div>

      {/* Progress */}
      <div className="h-1 bg-surface-2">
        <div className="h-full bg-purple transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[600px] mx-auto px-8 py-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs px-2 py-0.5 bg-purple/20 text-purple rounded">Bloom {question.bloomLevel}</span>
            <span className="text-xs px-2 py-0.5 bg-surface-2 text-text-muted rounded capitalize">{question.type.replace("-", " ")}</span>
          </div>

          <p className="text-lg leading-relaxed mb-6" style={{ fontFamily: "Georgia, serif" }}>
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
                <div className={`p-4 rounded border mb-6 ${
                  question.correct === true ? "border-teal bg-teal/5"
                    : question.correct === false ? "border-coral bg-coral/5"
                      : "border-border bg-surface"
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-xs font-medium ${
                      question.correct === true ? "text-teal"
                        : question.correct === false ? "text-coral"
                          : "text-text-muted"
                    }`}>
                      {question.correct === true ? "Correct" : question.correct === false ? "Incorrect" : "Evaluated"}
                    </p>
                    <button onClick={() => flagQuestion(currentIndex)}
                      className={`p-1 ${question.flagged ? "text-coral" : "text-text-muted hover:text-coral"}`}
                      title="Flag as inaccurate">
                      <Flag size={12} />
                    </button>
                  </div>
                  <p className="text-sm text-text">{question.feedback}</p>
                </div>
              )}

              <button onClick={nextQuestion}
                className="w-full py-3 bg-purple text-white rounded font-medium hover:opacity-90">
                {currentIndex + 1 >= questions.length ? "See Results" : "Next Question"}
              </button>
            </div>
          ) : (
            <div>
              {/* Multiple choice */}
              {question.type === "multiple-choice" && question.options ? (
                <div className="space-y-2 mb-4">
                  {question.options.map((opt, i) => (
                    <button key={i}
                      onClick={() => handleSubmit(opt)}
                      disabled={loading}
                      className="w-full text-left p-3 bg-surface border border-border rounded hover:border-purple hover:bg-surface-2 transition-colors text-sm disabled:opacity-50">
                      <span className="text-purple font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : question.type === "true-false" ? (
                /* True / False */
                <div className="flex gap-3 mb-4">
                  <button onClick={() => handleSubmit("true")} disabled={loading}
                    className="flex-1 py-3 bg-teal/10 border border-teal/30 rounded text-teal font-medium hover:bg-teal/20 transition-colors disabled:opacity-50">
                    True
                  </button>
                  <button onClick={() => handleSubmit("false")} disabled={loading}
                    className="flex-1 py-3 bg-coral/10 border border-coral/30 rounded text-coral font-medium hover:bg-coral/20 transition-colors disabled:opacity-50">
                    False
                  </button>
                </div>
              ) : (
                /* Free recall + Fill in blank */
                <div>
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)}
                    placeholder={question.type === "fill-blank" ? "Type the missing word(s)..." : "Type your answer..."}
                    rows={question.type === "fill-blank" ? 2 : 4}
                    className="w-full p-3 bg-surface border border-border rounded text-text text-sm resize-none focus:outline-none focus:border-purple"
                    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
                  />
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
      </div>
    </div>
  );
}
