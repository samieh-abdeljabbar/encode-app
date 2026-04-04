import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const practiceMode = searchParams.get("practice");
  const practiceSubjectId = searchParams.get("subject")
    ? Number(searchParams.get("subject"))
    : null;
  const [cards, setCards] = useState<DueCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats>({
    reviewed: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });

  const loadCards = useCallback(async () => {
    setLoadError(null);
    try {
      const data = practiceMode
        ? await getPracticeCards(
            practiceSubjectId ?? undefined,
            50,
            practiceMode,
          )
        : await getDueCards(50);
      setCards(data);
    } catch (e) {
      console.error("Failed to load review cards", e);
      setLoadError("Couldn't load this study session.");
    } finally {
      setLoading(false);
    }
  }, [practiceMode, practiceSubjectId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleRate = useCallback(
    async (rating: number) => {
      const card = cards[currentIndex];
      if (!card) return;
      setLoading(true);
      setRatingError(null);
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
      } catch (e) {
        console.error("Failed to submit card rating", e);
        setRatingError("Couldn't save that rating. Try again.");
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

  if (loadError && cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md rounded-[28px] border border-coral/20 bg-coral/5 p-6 text-center">
          <p className="text-base font-semibold text-coral">{loadError}</p>
          <p className="mt-2 text-sm text-text-muted">
            Try reloading this session or go back to Cards and choose a
            different practice lane.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                loadCards();
              }}
              className="rounded-xl border border-coral/20 px-4 py-2 text-sm font-medium text-coral transition-all hover:bg-coral/10"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => navigate("/cards")}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-muted transition-all hover:border-accent/20 hover:text-text"
            >
              Back to Cards
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cards.length === 0 || currentIndex >= cards.length) {
    return (
      <ReviewComplete
        stats={stats}
        practiceMode={practiceMode}
        practiceSubjectId={practiceSubjectId}
      />
    );
  }

  const card = cards[currentIndex];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <p className="text-sm font-medium text-text">
            {practiceMode
              ? practiceMode === "new"
                ? "New Cards"
                : practiceMode === "struggling"
                  ? "Struggling Cards"
                  : practiceMode === "building"
                    ? "Building Cards"
                    : "Practice"
              : "Review"}{" "}
            {currentIndex + 1} of {cards.length}
          </p>
          <p className="text-xs text-text-muted">{stats.reviewed} reviewed</p>
        </div>
      </div>

      {/* Card area */}
      <div className="flex flex-1 items-center justify-center overflow-auto px-7 py-7">
        <div className="w-full">
          {ratingError && (
            <div className="mx-auto mb-4 max-w-2xl rounded-2xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
              {ratingError}
            </div>
          )}
          <ReviewCard
            prompt={card.prompt}
            answer={card.answer}
            revealed={revealed}
            sourceType={card.source_type}
            cardType={card.card_type}
            onReveal={() => setRevealed(true)}
          />
        </div>
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
