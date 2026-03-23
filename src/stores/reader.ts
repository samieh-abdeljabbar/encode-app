import { create } from "zustand";
import type { GateResponse } from "../lib/types";
import { splitSections, parseFrontmatter } from "../lib/markdown";
import type { Section } from "../lib/markdown";
import {
  getGatePrompt,
  shouldGateSection,
  formatDigestionMarkdown,
} from "../lib/gates";
import { readFile, writeFile, aiRequest } from "../lib/tauri";

export interface SuggestedCard {
  question: string;
  answer: string;
  bloom: number;
}

interface ReaderState {
  filePath: string | null;
  rawContent: string | null;
  sections: Section[];
  currentSectionIndex: number;
  gateOpen: boolean;
  gateResponses: GateResponse[];
  suggestedCards: SuggestedCard[];
  loading: boolean;
  error: string | null;

  loadFile: (path: string) => Promise<void>;
  advanceSection: () => void;
  goToSection: (index: number) => void;
  submitGateResponse: (response: string) => Promise<void>;
  clearError: () => void;
  dismissSuggestions: () => void;
  closeReader: () => void;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  filePath: null,
  rawContent: null,
  sections: [],
  currentSectionIndex: 0,
  gateOpen: false,
  gateResponses: [],
  suggestedCards: [],
  loading: false,
  error: null,

  loadFile: async (path) => {
    set({ loading: true });
    try {
      const raw = await readFile(path);
      const { content } = parseFrontmatter(raw);
      const sections = splitSections(content);
      set({
        filePath: path,
        rawContent: raw,
        sections,
        currentSectionIndex: 0,
        gateOpen: false,
        gateResponses: [],
        loading: false,
      });
    } catch (e) {
      console.error("Failed to load file for reader:", e);
      set({ loading: false });
    }
  },

  advanceSection: () => {
    const { currentSectionIndex, sections } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length) return; // Already at last section

    const nextSection = sections[nextIndex];
    if (shouldGateSection(nextIndex, nextSection.content)) {
      // Open the gate — block advancement until response submitted
      set({ gateOpen: true });
    } else {
      // Skip gate for short/title sections
      set({ currentSectionIndex: nextIndex, gateOpen: false });
    }
  },

  goToSection: (index) => {
    const { sections, gateResponses } = get();
    if (index < 0 || index >= sections.length) return;

    // Only allow going back to already-revealed sections
    // or forward if gates were completed
    const maxRevealed = gateResponses.length > 0
      ? Math.max(...gateResponses.map((r) => r.sectionIndex)) + 1
      : 0;

    if (index <= maxRevealed || index <= get().currentSectionIndex) {
      set({ currentSectionIndex: index, gateOpen: false });
    }
  },

  submitGateResponse: async (response) => {
    const { currentSectionIndex, sections, filePath, rawContent, gateResponses } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length || !filePath || !rawContent) return;

    const prompt = getGatePrompt(nextIndex);
    const now = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });

    // Try to get AI feedback on the gate response
    let feedback: string | null = null;
    try {
      const sectionHeading = sections[currentSectionIndex]?.heading || "Introduction";
      const result = await aiRequest(
        `You are a learning coach evaluating a student's digestion response. Evaluate with this structure:
1. What they got right (1 sentence)
2. What was missing or could be deeper (1 sentence)
3. One follow-up question to deepen understanding

Be specific to their response. Never say "Good job!" — always push deeper. Keep total response under 100 words.`,
        `Section: ${sectionHeading}\nGate type: ${prompt.type}\nPrompt: ${prompt.prompt}\nStudent's response: ${response}`,
        200,
      );
      feedback = result.text;
    } catch {
      // AI unavailable — continue without feedback
    }

    const newResponse: GateResponse = {
      sectionIndex: nextIndex,
      promptType: prompt.type,
      prompt: prompt.prompt,
      response,
      feedback,
      timestamp: now,
    };

    const updatedResponses = [...gateResponses, newResponse];

    // Save digestion to file
    try {
      // Remove existing Digestion section if present, then append updated one
      const digestionMarker = "\n\n## Digestion";
      const baseContent = rawContent.includes(digestionMarker)
        ? rawContent.slice(0, rawContent.indexOf(digestionMarker))
        : rawContent;

      const digestionMd = formatDigestionMarkdown(updatedResponses);
      const updatedContent = baseContent + digestionMd;

      await writeFile(filePath, updatedContent);

      set({
        currentSectionIndex: nextIndex,
        gateOpen: false,
        gateResponses: updatedResponses,
        rawContent: updatedContent,
        suggestedCards: [],
      });

      // Auto-suggest flashcards from the section (fire-and-forget)
      const sectionContent = sections[currentSectionIndex]?.content || "";
      if (sectionContent.trim().split(/\s+/).length >= 20) {
        aiRequest(
          `Generate 1-2 flashcard Q/A pairs from this study content. Output ONLY JSON: [{"q":"...","a":"...","bloom":1-3}]`,
          sectionContent.slice(0, 1500),
          300,
        ).then(({ text: cardText }) => {
          const match = cardText.match(/\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]) as { q: string; a: string; bloom: number }[];
            set({ suggestedCards: parsed.map((p) => ({ question: p.q, answer: p.a, bloom: p.bloom || 2 })) });
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.error("Failed to save digestion:", e);
      set({ error: "Failed to save gate response. Please try again." });
    }
  },

  clearError: () => set({ error: null }),

  dismissSuggestions: () => set({ suggestedCards: [] }),

  closeReader: () => {
    set({
      filePath: null,
      rawContent: null,
      sections: [],
      currentSectionIndex: 0,
      gateOpen: false,
      gateResponses: [],
      suggestedCards: [],
    });
  },
}));
