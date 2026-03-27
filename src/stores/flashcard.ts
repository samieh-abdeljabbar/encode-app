import { create } from "zustand";
import type { Flashcard, ReviewRating } from "../lib/types";
import {
  getDueCards,
  getDueCount,
  readFile,
  writeFile,
  deleteFile,
  updateCardSchedule,
  deleteCardSchedule,
  listSubjects,
  listFiles,
} from "../lib/tauri";
import {
  fsrs,
  fsrsRatingFromButton,
  migrateToFSRS,
  addDays,
  today,
  type FSRSCard,
} from "../lib/sr";
import { localDateTimeString } from "../lib/dates";

export interface SessionStats {
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

interface FlashcardState {
  cards: Flashcard[];
  allCards: Flashcard[];
  currentIndex: number;
  showAnswer: boolean;
  dueCount: number;
  loading: boolean;
  sessionComplete: boolean;
  sessionStats: SessionStats;
  requeueCount: Map<string, number>; // Track requeues per card id

  loadDueCards: () => Promise<void>;
  loadDueCount: () => Promise<void>;
  loadAllCards: () => Promise<void>;
  revealAnswer: () => void;
  rateCard: (rating: ReviewRating) => Promise<void>;
  createCard: (
    subject: string,
    topic: string,
    question: string,
    answer: string,
    bloom: number,
    cardType?: string,
  ) => Promise<void>;
  loadAllCardsForReview: (subjectFilter?: string) => Promise<void>;
  deleteCard: (cardId: string, filePath: string) => Promise<void>;
  editCard: (cardId: string, filePath: string, newQuestion: string, newAnswer: string, newBloom?: number) => Promise<void>;
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
      let cardType: "basic" | "cloze" | "reversed" = "basic";
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
        else if (l.startsWith("**Type:**")) {
          const t = l.replace("**Type:**", "").trim().toLowerCase();
          if (t === "cloze" || t === "reversed") cardType = t;
        }
        i++;
      }

      if (question) {
        cards.push({
          id, filePath, subject, topic, question, answer,
          bloom, ease, interval, nextReview, lastReviewed,
          cardType, stability, difficulty, reps, lapses,
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
        if (l.includes("**Ease:**")) { cardLines.push(l); existingFields.add("Ease"); }
        else if (l.includes("**Interval:**")) { cardLines.push(`> **Interval:** ${newInterval}`); existingFields.add("Interval"); }
        else if (l.includes("**Next:**")) { cardLines.push(`> **Next:** ${addDays(newInterval)}`); existingFields.add("Next"); }
        else if (l.includes("**Last:**")) { cardLines.push(`> **Last:** ${today()}`); existingFields.add("Last"); }
        else if (l.includes("**Stability:**")) { cardLines.push(`> **Stability:** ${fsrsCard.stability.toFixed(2)}`); existingFields.add("Stability"); }
        else if (l.includes("**Difficulty:**")) { cardLines.push(`> **Difficulty:** ${fsrsCard.difficulty.toFixed(2)}`); existingFields.add("Difficulty"); }
        else if (l.includes("**Reps:**")) { cardLines.push(`> **Reps:** ${fsrsCard.reps}`); existingFields.add("Reps"); }
        else if (l.includes("**Lapses:**")) { cardLines.push(`> **Lapses:** ${fsrsCard.lapses}`); existingFields.add("Lapses"); }
        else { cardLines.push(l); }
        i++;
      }
      if (!existingFields.has("Next")) cardLines.push(`> **Next:** ${addDays(newInterval)}`);
      if (!existingFields.has("Last")) cardLines.push(`> **Last:** ${today()}`);
      if (!existingFields.has("Stability")) cardLines.push(`> **Stability:** ${fsrsCard.stability.toFixed(2)}`);
      if (!existingFields.has("Difficulty")) cardLines.push(`> **Difficulty:** ${fsrsCard.difficulty.toFixed(2)}`);
      if (!existingFields.has("Reps")) cardLines.push(`> **Reps:** ${fsrsCard.reps}`);
      if (!existingFields.has("Lapses")) cardLines.push(`> **Lapses:** ${fsrsCard.lapses}`);
      result.push(...cardLines);
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  await writeFile(card.filePath, result.join("\n"));
}

/** Format a card callout block */
function formatCardBlock(id: string, question: string, answer: string, bloom: number, type: string = "basic"): string {
  const d = today();
  return [
    `> [!card] id: ${id}`,
    `> **Q:** ${question}`,
    `> **A:** ${answer}`,
    `> **Type:** ${type}`,
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeSubjectKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const emptyStats: SessionStats = { again: 0, hard: 0, good: 0, easy: 0, total: 0 };

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  cards: [],
  allCards: [],
  currentIndex: 0,
  showAnswer: false,
  dueCount: 0,
  loading: false,
  sessionComplete: false,
  sessionStats: { ...emptyStats },
  requeueCount: new Map(),

  loadAllCards: async () => {
    set({ loading: true });
    try {
      const subjects = await listSubjects();
      const all: Flashcard[] = [];
      for (const subj of subjects) {
        try {
          const files = await listFiles(subj.slug, "flashcards");
          for (const f of files) {
            try {
              const content = await readFile(f.file_path);
              const subjectMatch = content.match(/^subject:\s*(.+)$/m);
              const topicMatch = content.match(/^topic:\s*(.+)$/m);
              const cards = parseFlashcards(
                content, f.file_path,
                subjectMatch?.[1]?.trim() || subj.name,
                topicMatch?.[1]?.trim() || "",
              );
              all.push(...cards);
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
      set({ allCards: all, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  loadDueCount: async () => {
    const count = await getDueCount();
    set({ dueCount: count });
  },

  loadDueCards: async () => {
    set({ loading: true, sessionStats: { ...emptyStats }, requeueCount: new Map() });
    try {
      const dueCards = await getDueCards();
      let allCards: Flashcard[] = [];

      if (dueCards.length > 0) {
        const fileMap = new Map<string, typeof dueCards>();
        for (const dc of dueCards) {
          const list = fileMap.get(dc.file_path) || [];
          list.push(dc);
          fileMap.set(dc.file_path, list);
        }

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
          } catch { /* skip */ }
        }
      }

      // Fallback: scan files directly
      if (allCards.length === 0) {
        const subjects = await listSubjects();
        const d = today();
        for (const subj of subjects) {
          try {
            const files = await listFiles(subj.slug, "flashcards");
            for (const f of files) {
              try {
                const content = await readFile(f.file_path);
                const subjectMatch = content.match(/^subject:\s*(.+)$/m);
                const topicMatch = content.match(/^topic:\s*(.+)$/m);
                const cards = parseFlashcards(
                  content, f.file_path,
                  subjectMatch?.[1]?.trim() || subj.name,
                  topicMatch?.[1]?.trim() || "",
                );
                allCards.push(...cards.filter((c) => !c.nextReview || c.nextReview <= d));
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
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
    const { cards, currentIndex, sessionStats, requeueCount } = get();
    const card = cards[currentIndex];
    if (!card) return;

    // Track session stats
    const statKey = rating as string;
    const updatedStats = { ...sessionStats, total: sessionStats.total + 1 };
    if (statKey === "again") updatedStats.again++;
    else if (statKey === "hard") updatedStats.hard++;
    else if (statKey === "good") updatedStats.good++;
    else if (statKey === "easy") updatedStats.easy++;

    // Use FSRS
    const fsrsCard = getCardFSRS(card);
    const fsrsRating = fsrsRatingFromButton(rating);
    const elapsed = elapsedDays(card.lastReviewed);
    const { interval: newInterval, card: newFSRS } = fsrs(fsrsCard, fsrsRating, elapsed);
    const nextReview = addDays(newInterval);
    const reviewDate = today();

    // Update DB + file
    await updateCardSchedule(card.id, card.filePath, nextReview, newInterval, newFSRS.stability, reviewDate);
    await updateCardInFile(card, newInterval, newFSRS);

    // Requeue logic: "Again" cards come back at end of session (max 2 times)
    const updatedCards = [...cards];
    if (rating === "again") {
      const timesRequeued = requeueCount.get(card.id) || 0;
      if (timesRequeued < 2) {
        // Add card back to end of queue
        updatedCards.push({ ...card });
        const newRequeueCount = new Map(requeueCount);
        newRequeueCount.set(card.id, timesRequeued + 1);
        set({ requeueCount: newRequeueCount });
      }
    }

    // Advance
    const nextIndex = currentIndex + 1;
    if (nextIndex >= updatedCards.length) {
      set({ cards: updatedCards, sessionComplete: true, showAnswer: false, sessionStats: updatedStats });
    } else {
      set({ cards: updatedCards, currentIndex: nextIndex, showAnswer: false, sessionStats: updatedStats });
    }
  },

  createCard: async (subject, topic, question, answer, bloom, cardType = "basic") => {
    const subjectSlug = slugify(subject);
    const topicSlug = slugify(topic || "general");
    const filePath = `subjects/${subjectSlug}/flashcards/${topicSlug}.md`;
    const cardId = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let canonicalSubject = subject;

    try {
      const subjects = await listSubjects();
      const matchedSubject = subjects.find((entry) =>
        entry.slug === subjectSlug || normalizeSubjectKey(entry.name) === normalizeSubjectKey(subject)
      );
      if (matchedSubject) {
        canonicalSubject = matchedSubject.name;
      }
    } catch {
      // Ignore canonicalization failures and preserve the provided subject.
    }

    const cardBlocks = [{ id: cardId, question, answer, type: cardType }];
    if (cardType === "reversed") {
      cardBlocks.push({
        id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-rev`,
        question: answer,
        answer: question,
        type: "reversed",
      });
    }

    let content: string;
    const appendedBlocks = cardBlocks
      .map((block) => formatCardBlock(block.id, block.question, block.answer, bloom, block.type))
      .join("\n\n");

    try {
      content = await readFile(filePath);
      content = content.trimEnd() + "\n\n" + appendedBlocks + "\n";
    } catch {
      const now = localDateTimeString();
      content = [
        "---", `subject: ${canonicalSubject}`, `topic: ${topic || "General"}`,
        "type: flashcard", `created_at: ${now}`, "---", "",
        appendedBlocks, "",
      ].join("\n");
    }

    await writeFile(filePath, content);
    for (const block of cardBlocks) {
      await updateCardSchedule(block.id, filePath, today(), 0, 2.5, "");
    }

    const count = await getDueCount();
    set({ dueCount: count });
  },

  loadAllCardsForReview: async (subjectFilter) => {
    set({ loading: true, sessionStats: { ...emptyStats }, requeueCount: new Map() });
    try {
      const subjects = await listSubjects();
      const all: Flashcard[] = [];
      for (const subj of subjects) {
        try {
          const files = await listFiles(subj.slug, "flashcards");
          for (const f of files) {
            try {
              const content = await readFile(f.file_path);
              const subjectMatch = content.match(/^subject:\s*(.+)$/m);
              const topicMatch = content.match(/^topic:\s*(.+)$/m);
              const cards = parseFlashcards(
                content, f.file_path,
                subjectMatch?.[1]?.trim() || subj.name,
                topicMatch?.[1]?.trim() || "",
              );
              all.push(...cards);
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }
      const filtered = subjectFilter
        ? all.filter((c) => normalizeSubjectKey(c.subject) === normalizeSubjectKey(subjectFilter))
        : all;
      set({
        cards: filtered,
        currentIndex: 0,
        showAnswer: false,
        loading: false,
        sessionComplete: filtered.length === 0,
      });
    } catch {
      set({ loading: false });
    }
  },

  deleteCard: async (cardId, filePath) => {
    const content = await readFile(filePath);
    const lines = content.split("\n");
    const result: string[] = [];
    let i = 0;
    let foundCard = false;

    while (i < lines.length) {
      const cardMatch = lines[i].match(/^>\s*\[!card\]\s*id:\s*(.+)/);
      if (cardMatch && cardMatch[1].trim() === cardId) {
        foundCard = true;
        // Skip the entire card block
        i++;
        while (i < lines.length && lines[i].startsWith(">")) i++;
        // Skip trailing blank line after block
        if (i < lines.length && lines[i].trim() === "") i++;
        continue;
      }
      result.push(lines[i]);
      i++;
    }

    if (!foundCard) return;

    // Check if any cards remain in the file
    const hasCards = result.some((l) => /^>\s*\[!card\]/.test(l));
    if (!hasCards) {
      await deleteFile(filePath);
    } else {
      await writeFile(filePath, result.join("\n"));
    }

    await deleteCardSchedule(cardId);

    // Refresh state
    const { cards, currentIndex, allCards } = get();
    // Remove from review session if active
    const updatedCards = cards.filter((c) => c.id !== cardId);
    const newIndex = Math.min(currentIndex, Math.max(0, updatedCards.length - 1));
    set({
      cards: updatedCards,
      currentIndex: updatedCards.length === 0 ? 0 : newIndex,
      sessionComplete: updatedCards.length === 0 && cards.length > 0 ? true : undefined as unknown as boolean,
      allCards: allCards.filter((c) => c.id !== cardId),
    });

    const count = await getDueCount();
    set({ dueCount: count });
  },

  editCard: async (cardId, filePath, newQuestion, newAnswer, newBloom) => {
    const content = await readFile(filePath);
    const lines = content.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const cardMatch = lines[i].match(/^>\s*\[!card\]\s*id:\s*(.+)/);
      if (cardMatch && cardMatch[1].trim() === cardId) {
        result.push(lines[i]);
        i++;
        while (i < lines.length && lines[i].startsWith(">")) {
          const l = lines[i];
          if (l.includes("**Q:**")) {
            result.push(`> **Q:** ${newQuestion}`);
          } else if (l.includes("**A:**")) {
            result.push(`> **A:** ${newAnswer}`);
          } else if (newBloom !== undefined && l.includes("**Bloom:**")) {
            result.push(`> **Bloom:** ${newBloom}`);
          } else {
            result.push(l);
          }
          i++;
        }
        continue;
      }
      result.push(lines[i]);
      i++;
    }

    await writeFile(filePath, result.join("\n"));

    // Refresh allCards and current session cards
    const { cards, allCards } = get();
    const updateCard = (c: Flashcard) =>
      c.id === cardId ? { ...c, question: newQuestion, answer: newAnswer, bloom: newBloom ?? c.bloom } : c;
    set({
      cards: cards.map(updateCard),
      allCards: allCards.map(updateCard),
    });
  },

  resetSession: () =>
    set({
      cards: [], currentIndex: 0, showAnswer: false,
      sessionComplete: false, sessionStats: { ...emptyStats },
      requeueCount: new Map(),
    }),
}));
