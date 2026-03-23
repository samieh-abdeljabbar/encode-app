import { create } from "zustand";
import type { Flashcard, ReviewRating } from "../lib/types";
import {
  getDueCards,
  getDueCount,
  readFile,
  writeFile,
  updateCardSchedule,
} from "../lib/tauri";
import {
  fsrs,
  fsrsRatingFromButton,
  migrateToFSRS,
  addDays,
  today,
  type FSRSCard,
} from "../lib/sr";

interface FlashcardState {
  cards: Flashcard[];
  currentIndex: number;
  showAnswer: boolean;
  dueCount: number;
  loading: boolean;
  sessionComplete: boolean;

  loadDueCards: () => Promise<void>;
  loadDueCount: () => Promise<void>;
  revealAnswer: () => void;
  rateCard: (rating: ReviewRating) => Promise<void>;
  createCard: (
    subject: string,
    topic: string,
    question: string,
    answer: string,
    bloom: number,
  ) => Promise<void>;
  resetSession: () => void;
}

/** Parse flashcard callout blocks from markdown content */
function parseFlashcards(
  content: string,
  filePath: string,
  subject: string,
  topic: string,
): Flashcard[] {
  const cards: Flashcard[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const cardMatch = line.match(/^>\s*\[!card\]\s*id:\s*(.+)/);
    if (cardMatch) {
      const id = cardMatch[1].trim();
      let question = "";
      let answer = "";
      let bloom = 1;
      let ease = 2.5;
      let interval = 0;
      let nextReview = today();
      let lastReviewed: string | null = null;
      let stability: number | undefined;
      let difficulty: number | undefined;
      let reps: number | undefined;
      let lapses: number | undefined;

      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        const l = lines[i].replace(/^>\s*/, "");
        if (l.startsWith("**Q:**")) question = l.replace("**Q:**", "").trim();
        else if (l.startsWith("**A:**"))
          answer = l.replace("**A:**", "").trim();
        else if (l.startsWith("**Bloom:**"))
          bloom = parseInt(l.replace("**Bloom:**", "").trim()) || 1;
        else if (l.startsWith("**Ease:**"))
          ease = parseFloat(l.replace("**Ease:**", "").trim()) || 2.5;
        else if (l.startsWith("**Interval:**"))
          interval = parseInt(l.replace("**Interval:**", "").trim()) || 0;
        else if (l.startsWith("**Next:**"))
          nextReview = l.replace("**Next:**", "").trim();
        else if (l.startsWith("**Last:**"))
          lastReviewed = l.replace("**Last:**", "").trim() || null;
        else if (l.startsWith("**Stability:**"))
          stability = parseFloat(l.replace("**Stability:**", "").trim());
        else if (l.startsWith("**Difficulty:**"))
          difficulty = parseFloat(l.replace("**Difficulty:**", "").trim());
        else if (l.startsWith("**Reps:**"))
          reps = parseInt(l.replace("**Reps:**", "").trim());
        else if (l.startsWith("**Lapses:**"))
          lapses = parseInt(l.replace("**Lapses:**", "").trim());
        i++;
      }

      if (question) {
        cards.push({
          id,
          filePath,
          subject,
          topic,
          question,
          answer,
          bloom,
          ease,
          interval,
          nextReview,
          lastReviewed,
          stability,
          difficulty,
          reps,
          lapses,
        });
      }
    } else {
      i++;
    }
  }
  return cards;
}

/** Build a card's FSRS state, migrating from SM-2 if needed */
function getCardFSRS(card: Flashcard): FSRSCard {
  if (card.stability !== undefined && card.difficulty !== undefined) {
    return {
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps ?? 0,
      lapses: card.lapses ?? 0,
    };
  }
  return migrateToFSRS(card.ease, card.interval);
}

/** Calculate elapsed days since last review */
function elapsedDays(lastReviewed: string | null): number {
  if (!lastReviewed) return 0;
  const last = new Date(lastReviewed);
  const now = new Date();
  return Math.max(0, Math.round((now.getTime() - last.getTime()) / 86400000));
}

/** Update a card's metadata in its markdown file (FSRS fields) */
async function updateCardInFile(
  card: Flashcard,
  newInterval: number,
  fsrsCard: FSRSCard,
): Promise<void> {
  const content = await readFile(card.filePath);
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const cardMatch = lines[i].match(/^>\s*\[!card\]\s*id:\s*(.+)/);
    if (cardMatch && cardMatch[1].trim() === card.id) {
      result.push(lines[i]);
      i++;
      const existingFields = new Set<string>();
      const cardLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        const l = lines[i];
        if (l.includes("**Ease:**")) {
          cardLines.push(l); // Preserve original SM-2 ease unchanged
          existingFields.add("Ease");
        } else if (l.includes("**Interval:**")) {
          cardLines.push(`> **Interval:** ${newInterval}`);
          existingFields.add("Interval");
        } else if (l.includes("**Next:**")) {
          cardLines.push(`> **Next:** ${addDays(newInterval)}`);
          existingFields.add("Next");
        } else if (l.includes("**Last:**")) {
          cardLines.push(`> **Last:** ${today()}`);
          existingFields.add("Last");
        } else if (l.includes("**Stability:**")) {
          cardLines.push(`> **Stability:** ${fsrsCard.stability.toFixed(2)}`);
          existingFields.add("Stability");
        } else if (l.includes("**Difficulty:**")) {
          cardLines.push(
            `> **Difficulty:** ${fsrsCard.difficulty.toFixed(2)}`,
          );
          existingFields.add("Difficulty");
        } else if (l.includes("**Reps:**")) {
          cardLines.push(`> **Reps:** ${fsrsCard.reps}`);
          existingFields.add("Reps");
        } else if (l.includes("**Lapses:**")) {
          cardLines.push(`> **Lapses:** ${fsrsCard.lapses}`);
          existingFields.add("Lapses");
        } else {
          cardLines.push(l);
        }
        i++;
      }
      // Add FSRS fields if they didn't exist before
      if (!existingFields.has("Stability"))
        cardLines.push(`> **Stability:** ${fsrsCard.stability.toFixed(2)}`);
      if (!existingFields.has("Difficulty"))
        cardLines.push(
          `> **Difficulty:** ${fsrsCard.difficulty.toFixed(2)}`,
        );
      if (!existingFields.has("Reps"))
        cardLines.push(`> **Reps:** ${fsrsCard.reps}`);
      if (!existingFields.has("Lapses"))
        cardLines.push(`> **Lapses:** ${fsrsCard.lapses}`);
      result.push(...cardLines);
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  await writeFile(card.filePath, result.join("\n"));
}

/** Format a card callout block */
function formatCardBlock(
  id: string,
  question: string,
  answer: string,
  bloom: number,
): string {
  const d = today();
  return [
    `> [!card] id: ${id}`,
    `> **Q:** ${question}`,
    `> **A:** ${answer}`,
    `> **Bloom:** ${bloom}`,
    `> **Ease:** 2.50`,
    `> **Interval:** 0`,
    `> **Next:** ${d}`,
    `> **Last:**`,
    `> **Stability:** 0`,
    `> **Difficulty:** 0`,
    `> **Reps:** 0`,
    `> **Lapses:** 0`,
  ].join("\n");
}

/** Slugify a string for file paths */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  cards: [],
  currentIndex: 0,
  showAnswer: false,
  dueCount: 0,
  loading: false,
  sessionComplete: false,

  loadDueCount: async () => {
    const count = await getDueCount();
    set({ dueCount: count });
  },

  loadDueCards: async () => {
    set({ loading: true });
    try {
      const dueCards = await getDueCards();
      if (dueCards.length === 0) {
        set({ cards: [], loading: false, sessionComplete: true });
        return;
      }

      const fileMap = new Map<string, typeof dueCards>();
      for (const dc of dueCards) {
        const list = fileMap.get(dc.file_path) || [];
        list.push(dc);
        fileMap.set(dc.file_path, list);
      }

      const allCards: Flashcard[] = [];
      for (const [filePath, duelist] of fileMap) {
        try {
          const content = await readFile(filePath);
          const subjectMatch = content.match(/^subject:\s*(.+)$/m);
          const topicMatch = content.match(/^topic:\s*(.+)$/m);
          const subject = subjectMatch?.[1]?.trim() || "";
          const topic = topicMatch?.[1]?.trim() || "";

          const fileCards = parseFlashcards(content, filePath, subject, topic);
          const dueIds = new Set(duelist.map((d) => d.card_id));
          allCards.push(...fileCards.filter((c) => dueIds.has(c.id)));
        } catch {
          // Skip files that can't be read
        }
      }

      set({
        cards: allCards,
        currentIndex: 0,
        showAnswer: false,
        loading: false,
        sessionComplete: allCards.length === 0,
      });
    } catch {
      set({ loading: false });
    }
  },

  revealAnswer: () => set({ showAnswer: true }),

  rateCard: async (rating) => {
    const { cards, currentIndex } = get();
    const card = cards[currentIndex];
    if (!card) return;

    // Use FSRS (with auto-migration from SM-2)
    const fsrsCard = getCardFSRS(card);
    const fsrsRating = fsrsRatingFromButton(rating);
    const elapsed = elapsedDays(card.lastReviewed);
    const { interval: newInterval, card: newFSRS } = fsrs(
      fsrsCard,
      fsrsRating,
      elapsed,
    );
    const nextReview = addDays(newInterval);
    const reviewDate = today();

    // Update DB schedule
    await updateCardSchedule(
      card.id,
      card.filePath,
      nextReview,
      newInterval,
      newFSRS.stability,
      reviewDate,
    );

    // Update the markdown file with FSRS fields
    await updateCardInFile(card, newInterval, newFSRS);

    // Advance to next card
    const nextIndex = currentIndex + 1;
    if (nextIndex >= cards.length) {
      set({ sessionComplete: true, showAnswer: false });
    } else {
      set({ currentIndex: nextIndex, showAnswer: false });
    }
  },

  createCard: async (subject, topic, question, answer, bloom) => {
    const subjectSlug = slugify(subject);
    const topicSlug = slugify(topic || "general");
    const filePath = `subjects/${subjectSlug}/flashcards/${topicSlug}.md`;
    const cardId = `fc-${Date.now()}`;

    let content: string;
    try {
      content = await readFile(filePath);
      // Append new card to existing file
      content = content.trimEnd() + "\n\n" + formatCardBlock(cardId, question, answer, bloom) + "\n";
    } catch {
      // File doesn't exist — create with frontmatter
      const now = new Date().toISOString().split(".")[0];
      content = [
        "---",
        `subject: ${subject}`,
        `topic: ${topic || "General"}`,
        "type: flashcard",
        `created_at: ${now}`,
        "---",
        "",
        formatCardBlock(cardId, question, answer, bloom),
        "",
      ].join("\n");
    }

    await writeFile(filePath, content);

    // Schedule in DB — due today for immediate first review
    await updateCardSchedule(cardId, filePath, today(), 0, 2.5, "");

    // Refresh due count
    const count = await getDueCount();
    set({ dueCount: count });
  },

  resetSession: () =>
    set({
      cards: [],
      currentIndex: 0,
      showAnswer: false,
      sessionComplete: false,
    }),
}));
