export interface SM2Result {
  interval: number;
  ease: number;
}

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * SM-2 spaced repetition algorithm.
 * quality: 0=Again, 3=Hard, 4=Good, 5=Easy
 */
export function sm2(ease: number, interval: number, quality: ReviewQuality): SM2Result {
  if (quality < 3) {
    return { interval: 1, ease: Math.max(1.3, ease - 0.2) };
  }
  const newInterval =
    interval === 0 ? 1 : interval === 1 ? 6 : Math.round(interval * ease);
  const newEase =
    ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return { interval: newInterval, ease: Math.max(1.3, newEase) };
}

/** Map button label to SM-2 quality score */
export function qualityFromRating(
  rating: "again" | "hard" | "good" | "easy",
): ReviewQuality {
  switch (rating) {
    case "again":
      return 0;
    case "hard":
      return 3;
    case "good":
      return 4;
    case "easy":
      return 5;
  }
}

/** Calculate a future date string (YYYY-MM-DD) from today + days */
export function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Get today's date as YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().split("T")[0];
}
