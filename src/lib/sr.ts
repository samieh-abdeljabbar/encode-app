import { localDateString } from "./dates";

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

// ===== FSRS (Free Spaced Repetition Scheduler) =====

/** FSRS card state */
export interface FSRSCard {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
}

export interface FSRSResult {
  interval: number;
  card: FSRSCard;
}

/** FSRS rating: 1=Again, 2=Hard, 3=Good, 4=Easy */
export type FSRSRating = 1 | 2 | 3 | 4;

// Default FSRS-5 parameters (from open-source benchmarks)
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.5330,
  0.1647, 1.0621, 1.9744, 0.0946, 0.3597, 2.1748, 0.2547, 3.0537, 0.3773, 0.7195,
];

const DECAY = -0.5;
const FACTOR = 19 / 81; // (0.9^(1/DECAY) - 1)

/** Calculate retrievability (probability of recall) at elapsed days */
export function retrievability(stability: number, elapsedDays: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/** Initialize a new FSRS card */
export function fsrsNewCard(): FSRSCard {
  return { stability: 0, difficulty: 0, reps: 0, lapses: 0 };
}

/** Map UI rating to FSRS rating */
export function fsrsRatingFromButton(
  rating: "again" | "hard" | "good" | "easy",
): FSRSRating {
  switch (rating) {
    case "again": return 1;
    case "hard": return 2;
    case "good": return 3;
    case "easy": return 4;
  }
}

/**
 * FSRS scheduling algorithm.
 * Handles both new cards (reps=0) and review cards.
 */
export function fsrs(
  card: FSRSCard,
  rating: FSRSRating,
  elapsedDays: number,
): FSRSResult {
  const { stability: s, difficulty: d, reps, lapses } = card;

  if (reps === 0) {
    // First review — initialize stability and difficulty
    const initS = W[rating - 1];
    const initD = Math.min(10, Math.max(1, W[4] - W[5] * (rating - 3)));
    const interval = rating === 1 ? 1 : Math.max(1, Math.round(initS));

    return {
      interval,
      card: {
        stability: initS,
        difficulty: initD,
        reps: 1,
        lapses: rating === 1 ? lapses + 1 : lapses,
      },
    };
  }

  // Review card
  const r = retrievability(s, elapsedDays);

  // Update difficulty with mean reversion (FSRS-5 spec)
  const d0ForGood = W[4]; // initial difficulty for "Good" rating
  const rawD = d - W[6] * (rating - 3);
  const newD = Math.min(
    10,
    Math.max(1, W[7] * d0ForGood + (1 - W[7]) * rawD),
  );

  let newS: number;
  let newLapses = lapses;

  if (rating === 1) {
    // Lapse — stability decreases
    newS = Math.max(
      0.1,
      W[11] * Math.pow(newD, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)),
    );
    newLapses = lapses + 1;
  } else {
    // Success — stability increases
    const hardPenalty = rating === 2 ? W[15] : 1;
    const easyBonus = rating === 4 ? W[16] : 1;
    newS =
      s *
      (1 +
        Math.exp(W[8]) *
        (11 - newD) *
        Math.pow(s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus);
  }

  const interval = Math.max(1, Math.round(newS));

  return {
    interval,
    card: {
      stability: newS,
      difficulty: newD,
      reps: reps + 1,
      lapses: newLapses,
    },
  };
}

/** Migrate an SM-2 card to FSRS fields */
export function migrateToFSRS(ease: number, interval: number): FSRSCard {
  return {
    stability: Math.max(0.1, interval || 1),
    difficulty: Math.min(10, Math.max(1, 10 - ease * 2)),
    reps: interval > 0 ? 1 : 0,
    lapses: 0,
  };
}

/** Calculate a future date string (YYYY-MM-DD) from today + days */
export function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

/** Get today's date as YYYY-MM-DD */
export function today(): string {
  return localDateString();
}
