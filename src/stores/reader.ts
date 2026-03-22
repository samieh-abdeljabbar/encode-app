import { create } from "zustand";
import type { GateResponse } from "../lib/types";
import { splitSections, parseFrontmatter } from "../lib/markdown";
import type { Section } from "../lib/markdown";
import {
  getGatePrompt,
  shouldGateSection,
  formatDigestionMarkdown,
} from "../lib/gates";
import { readFile, writeFile } from "../lib/tauri";

interface ReaderState {
  filePath: string | null;
  rawContent: string | null;
  sections: Section[];
  currentSectionIndex: number;
  gateOpen: boolean;
  gateResponses: GateResponse[];
  loading: boolean;
  error: string | null;

  loadFile: (path: string) => Promise<void>;
  advanceSection: () => void;
  goToSection: (index: number) => void;
  submitGateResponse: (response: string) => Promise<void>;
  clearError: () => void;
  closeReader: () => void;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  filePath: null,
  rawContent: null,
  sections: [],
  currentSectionIndex: 0,
  gateOpen: false,
  gateResponses: [],
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

    const newResponse: GateResponse = {
      sectionIndex: nextIndex,
      promptType: prompt.type,
      prompt: prompt.prompt,
      response,
      feedback: null, // No AI for now
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
      });
    } catch (e) {
      console.error("Failed to save digestion:", e);
      set({ error: "Failed to save gate response. Please try again." });
    }
  },

  clearError: () => set({ error: null }),

  closeReader: () => {
    set({
      filePath: null,
      rawContent: null,
      sections: [],
      currentSectionIndex: 0,
      gateOpen: false,
      gateResponses: [],
    });
  },
}));
