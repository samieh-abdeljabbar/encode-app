import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFlashcardStore } from "../stores/flashcard";
import type { ReviewRating } from "../lib/types";
import { sm2, qualityFromRating, addDays } from "../lib/sr";

const RATING_BUTTONS: { label: string; rating: ReviewRating; color: string }[] =
  [
    { label: "Again", rating: "again", color: "bg-[#D85A30]" },
    { label: "Hard", rating: "hard", color: "bg-[#BA7517]" },
    { label: "Good", rating: "good", color: "bg-[#1D9E75]" },
    { label: "Easy", rating: "easy", color: "bg-[#1D9E75]/80" },
  ];

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const {
    cards,
    currentIndex,
    showAnswer,
    loading,
    sessionComplete,
    loadDueCards,
    revealAnswer,
    rateCard,
    resetSession,
  } = useFlashcardStore();

  useEffect(() => {
    loadDueCards();
    return () => resetSession();
  }, [loadDueCards, resetSession]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">Loading flashcards...</p>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-teal text-lg font-medium mb-2">
            {cards.length > 0
              ? `Review complete! ${cards.length} cards reviewed.`
              : "No cards due for review."}
          </p>
          <p className="text-text-muted text-sm mb-6">
            {cards.length > 0
              ? "Great work — your memory traces are stronger now."
              : "Check back later or import new material."}
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const card = cards[currentIndex];
  if (!card) return null;

  // Preview next intervals for each rating
  const intervals = RATING_BUTTONS.map((b) => {
    const q = qualityFromRating(b.rating);
    const { interval } = sm2(card.ease, card.interval, q);
    return addDays(interval) === addDays(1)
      ? `${interval}d`
      : `${interval}d`;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-text-muted hover:text-text"
          >
            &larr; Back
          </button>
          <span className="text-sm font-medium">Flashcard Review</span>
        </div>
        <span className="text-xs text-text-muted">
          Card {currentIndex + 1} of {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-2">
        <div
          className="h-full bg-purple transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / cards.length) * 100}%`,
          }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="max-w-[600px] w-full mx-auto px-8">
          {/* Topic badge */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs px-2 py-1 bg-surface-2 text-text-muted rounded">
              {card.subject}
            </span>
            {card.topic && (
              <span className="text-xs px-2 py-1 bg-surface-2 text-text-muted rounded">
                {card.topic}
              </span>
            )}
            <span className="text-xs px-2 py-1 bg-purple/20 text-purple rounded">
              Bloom {card.bloom}
            </span>
          </div>

          {/* Question */}
          <div className="mb-8">
            <p className="text-lg leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
              {card.question}
            </p>
          </div>

          {/* Answer area */}
          {!showAnswer ? (
            <button
              onClick={revealAnswer}
              className="w-full py-3 bg-purple text-white rounded font-medium hover:opacity-90 transition-opacity"
            >
              Show Answer
            </button>
          ) : (
            <div>
              {/* Answer */}
              <div className="p-4 bg-surface rounded border border-border mb-6">
                <p
                  className="text-base leading-relaxed text-text"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {card.answer}
                </p>
              </div>

              {/* Rating buttons */}
              <p className="text-xs text-text-muted mb-3 text-center">
                How well did you recall this?
              </p>
              <div className="grid grid-cols-4 gap-2">
                {RATING_BUTTONS.map((b, i) => (
                  <button
                    key={b.rating}
                    onClick={() => rateCard(b.rating)}
                    className={`${b.color} text-white py-3 rounded text-sm font-medium hover:opacity-90 transition-opacity`}
                  >
                    <div>{b.label}</div>
                    <div className="text-xs opacity-75 mt-1">
                      {intervals[i]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
