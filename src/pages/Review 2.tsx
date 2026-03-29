import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ReviewCard } from "../components/review/ReviewCard";
import { ReviewComplete } from "../components/review/ReviewComplete";
import { getDueCards, getPracticeCards, submitCardRating } from "../lib/tauri";
import type { DueCard } from "../lib/tauri";

interface SessionStats {
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export function Review() {
  const [searchParams] = useSearchParams();
  const practiceMode = searchParams.get("practice");
  const [cards, setCards] = useState<DueCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SessionStats>({
    reviewed: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });

  const loadCards = useCallback(async () => {
    try {
      const data = practiceMode
        ? await getPracticeCards(undefined, 50)
        : await getDueCards(50);
      setCards(data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [practiceMode]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleRate = useCallback(
    async (rating: number) => {
      const card = cards[currentIndex];
      if (!card) return;
      setLoading(true);
      try {
        await submitCardRating(card.id, rating);
        const ratingKeys = ["again", "hard", "good", "easy"] as const;
        const ratingKey = ratingKeys[rating - 1];
        setStats((prev) => ({
          ...prev,
          reviewed: prev.reviewed + 1,
          [ratingKey]: prev[ratingKey] + 1,
        }));
        setCurrentIndex((prev) => prev + 1);
        setRevealed(false);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    },
    [cards, currentIndex],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;
      if (currentIndex >= cards.length) return;

      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const ratingMap: Record<string, number> = {
          Digit1: 1,
          Digit2: 2,
          Digit3: 3,
          Digit4: 4,
        };
        const rating = ratingMap[e.code];
        if (rating) {
          e.preventDefault();
          handleRate(rating);
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [revealed, currentIndex, cards.length, handleRate]);

  if (loading && cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  if (cards.length === 0 || currentIndex >= cards.length) {
    return <ReviewComplete stats={stats} />;
  }

  const card = cards[currentIndex];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <p className="text-sm font-medium text-text">
            Card {currentIndex + 1} of {cards.length}
          </p>
          <p className="text-xs text-text-muted">{stats.reviewed} reviewed</p>
        </div>
      </div>

      {/* Card area */}
      <div className="flex flex-1 items-center justify-center overflow-auto px-7 py-7">
        <ReviewCard
          prompt={card.prompt}
          answer={card.answer}
          revealed={revealed}
          sourceType={card.source_type}
          cardType={card.card_type}
          onReveal={() => setRevealed(true)}
        />
      </div>

      {/* Rating buttons */}
      {revealed && (
        <div className="shrink-0 border-t border-border-subtle px-7 py-4">
          <div className="mx-auto flex max-w-2xl justify-center gap-3">
            <button
              type="button"
              onClick={() => handleRate(1)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-coral/30 bg-coral/5 px-5 text-xs font-medium text-coral transition-all hover:bg-coral/10"
            >
              Again
              <kbd className="ml-1 rounded border border-coral/20 px-1 text-[10px]">
                1
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => handleRate(2)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-amber/30 bg-amber/5 px-5 text-xs font-medium text-amber transition-all hover:bg-amber/10"
            >
              Hard
              <kbd className="ml-1 rounded border border-amber/20 px-1 text-[10px]">
                2
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => handleRate(3)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-teal/30 bg-teal/5 px-5 text-xs font-medium text-teal transition-all hover:bg-teal/10"
            >
              Good
              <kbd className="ml-1 rounded border border-teal/20 px-1 text-[10px]">
                3
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => handleRate(4)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/5 px-5 text-xs font-medium text-accent transition-all hover:bg-accent/10"
            >
              Easy
              <kbd className="ml-1 rounded border border-accent/20 px-1 text-[10px]">
                4
              </kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
