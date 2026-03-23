import { create } from "zustand";
import type { Flashcard, ReviewRating } from "../lib/types";
import {
  getDueCards,
  getDueCount,
  readFile,
  writeFile,
  updateCardSchedule,
} from "../lib/tauri";
import { sm2, qualityFromRating, addDays, today } from "../lib/sr";

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

      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        const l = lines[i].replace(/^>\s*/, "");
        if (l.startsWith("**Q:**")) question = l.replace("**Q:**", "").trim();
        else if (l.startsWith("**A:**")) answer = l.replace("**A:**", "").trim();
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
        });
      }
    } else {
      i++;
    }
  }
  return cards;
}

/** Update a card's metadata in its markdown file */
async function updateCardInFile(card: Flashcard, newEase: number, newInterval: number): Promise<void> {
  const content = await readFile(card.filePath);
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const cardMatch = lines[i].match(/^>\s*\[!card\]\s*id:\s*(.+)/);
    if (cardMatch && cardMatch[1].trim() === card.id) {
      result.push(lines[i]);
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        const l = lines[i];
        if (l.includes("**Ease:**")) {
          result.push(`> **Ease:** ${newEase.toFixed(2)}`);
        } else if (l.includes("**Interval:**")) {
          result.push(`> **Interval:** ${newInterval}`);
        } else if (l.includes("**Next:**")) {
          result.push(`> **Next:** ${addDays(newInterval)}`);
        } else if (l.includes("**Last:**")) {
          result.push(`> **Last:** ${today()}`);
        } else {
          result.push(l);
        }
        i++;
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  await writeFile(card.filePath, result.join("\n"));
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

      // Group by file path and load each file
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
          // Extract subject/topic from frontmatter
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

    const quality = qualityFromRating(rating);
    const { interval: newInterval, ease: newEase } = sm2(
      card.ease,
      card.interval,
      quality,
    );
    const nextReview = addDays(newInterval);
    const reviewDate = today();

    // Update DB schedule
    await updateCardSchedule(
      card.id,
      card.filePath,
      nextReview,
      newInterval,
      newEase,
      reviewDate,
    );

    // Update the markdown file
    await updateCardInFile(card, newEase, newInterval);

    // Advance to next card
    const nextIndex = currentIndex + 1;
    if (nextIndex >= cards.length) {
      set({ sessionComplete: true, showAnswer: false });
    } else {
      set({ currentIndex: nextIndex, showAnswer: false });
    }
  },

  resetSession: () =>
    set({
      cards: [],
      currentIndex: 0,
      showAnswer: false,
      sessionComplete: false,
    }),
}));
