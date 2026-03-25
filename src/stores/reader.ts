import { create } from "zustand";
import type { GateResponse } from "../lib/types";
import { splitSections, parseFrontmatter } from "../lib/markdown";
import type { Section } from "../lib/markdown";
import {
  getGatePrompt,
  shouldGateSection,
  formatDigestionMarkdown,
} from "../lib/gates";
import { readFile, writeFile, aiRequest, getConfig } from "../lib/tauri";
import { getProfileContext } from "../lib/profile";

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

  // AI-generated gate question
  gateQuestion: string | null;
  gateGenerating: boolean;

  // Follow-up state
  pendingResponse: GateResponse | null;
  followUpMode: boolean;

  loadFile: (path: string) => Promise<void>;
  advanceSection: () => void;
  goToSection: (index: number) => void;
  submitGateResponse: (response: string) => Promise<void>;
  submitFollowUp: (response: string) => Promise<void>;
  clearError: () => void;
  dismissSuggestions: () => void;
  closeReader: () => void;
}

/** Generate a content-specific gate question using AI */
async function generateGateQuestion(
  sectionContent: string,
  sectionHeading: string,
  gateType: string,
  previousResponses: GateResponse[],
): Promise<string | null> {
  try {
    const prevContext = previousResponses.length > 0
      ? previousResponses.map((r) =>
        `[${r.promptType}] Q: ${r.prompt}\nA: ${r.response}`
      ).join("\n\n")
      : "None yet — this is the first section.";

    // Load user profile for personalization
    let profileContext = "";
    try {
      const config = await getConfig();
      profileContext = getProfileContext(config);
    } catch { /* no profile — skip personalization */ }

    const profileLine = profileContext
      ? `\n\nStudent context: ${profileContext} Use their background and interests for real-world analogies when relevant.`
      : "";

    const { text } = await aiRequest(
      `Generate ONE study question about the section below. Technique: "${gateType}".${profileLine}

${gateType}=summarize: name a specific concept and ask to explain it. ${gateType}=connect: relate a concept to their life/work. ${gateType}=predict: what comes next and why. ${gateType}=apply: give a scenario, ask to solve it.

Be specific to the content. Reference actual terms. 1-2 sentences only. Output ONLY the question.`,
      `Section: ${sectionHeading}\n${sectionContent.slice(0, 1500)}\n\nPrior responses:\n${prevContext}`,
      150,
    );
    return text.trim();
  } catch {
    return null; // Fall back to generic prompt
  }
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
  gateQuestion: null,
  gateGenerating: false,
  pendingResponse: null,
  followUpMode: false,

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
        gateQuestion: null,
        gateGenerating: false,
        pendingResponse: null,
        followUpMode: false,
      });
    } catch (e) {
      console.error("Failed to load file for reader:", e);
      set({ loading: false });
    }
  },

  advanceSection: () => {
    const { currentSectionIndex, sections, gateResponses } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length) return;

    const nextSection = sections[nextIndex];
    if (shouldGateSection(nextIndex, nextSection.content)) {
      // Open gate and generate AI-specific question
      const currentSection = sections[currentSectionIndex];
      const gatePrompt = getGatePrompt(nextIndex);

      set({ gateOpen: true, gateQuestion: null, gateGenerating: true });

      // Generate content-specific question (async, non-blocking)
      generateGateQuestion(
        currentSection?.content || "",
        currentSection?.heading || "Introduction",
        gatePrompt.type,
        gateResponses,
      ).then((question) => {
        set({
          gateQuestion: question, // null = fallback to generic
          gateGenerating: false,
        });
      });
    } else {
      set({ currentSectionIndex: nextIndex, gateOpen: false });
    }
  },

  goToSection: (index) => {
    const { sections, gateResponses } = get();
    if (index < 0 || index >= sections.length) return;

    const maxRevealed = gateResponses.length > 0
      ? Math.max(...gateResponses.map((r) => r.sectionIndex)) + 1
      : 0;

    if (index <= maxRevealed || index <= get().currentSectionIndex) {
      set({ currentSectionIndex: index, gateOpen: false });
    }
  },

  submitGateResponse: async (response) => {
    const { currentSectionIndex, sections, filePath, rawContent, gateQuestion } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length || !filePath || !rawContent) return;

    const prompt = getGatePrompt(nextIndex);
    // Use AI-generated question if available, otherwise generic
    const displayedPrompt = gateQuestion || prompt.prompt;

    const now = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });

    // AI evaluation with mastery scoring
    let feedback: string | null = null;
    let mastery: number | null = null;
    let followUp: string | null = null;

    try {
      const sectionHeading = sections[currentSectionIndex]?.heading || "Introduction";
      const sectionContent = sections[currentSectionIndex]?.content || "";
      const result = await aiRequest(
        `Evaluate the student's response. Reply ONLY JSON: {"right":"1 sentence","gap":"1 sentence","followUp":"a question","mastery":1}
mastery: 1=weak/vague, 2=partial, 3=solid. Be specific to the content.`,
        `Section: ${sectionHeading}\nContent: ${sectionContent.slice(0, 800)}\nPrompt: ${displayedPrompt}\nResponse: ${response}`,
        250,
      );

      const cleanedResult = result.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const jsonMatch = cleanedResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          right?: string;
          gap?: string;
          followUp?: string;
          mastery?: number;
        };
        feedback = [
          parsed.right && `${parsed.right}`,
          parsed.gap && `${parsed.gap}`,
        ].filter(Boolean).join(" ");
        mastery = parsed.mastery ?? null;
        followUp = parsed.followUp || null;
      } else {
        feedback = result.text;
      }
    } catch {
      // AI unavailable
    }

    const newResponse: GateResponse = {
      sectionIndex: nextIndex,
      promptType: prompt.type,
      prompt: displayedPrompt,
      response,
      feedback,
      mastery,
      followUp,
      followUpResponse: null,
      timestamp: now,
    };

    // If mastery is weak, require follow-up
    if (mastery !== null && mastery <= 1 && followUp) {
      set({ pendingResponse: newResponse, followUpMode: true });
      return;
    }

    // Mastery OK — advance
    set({ gateQuestion: null });
    await saveAndAdvance(newResponse);
  },

  submitFollowUp: async (followUpAnswer) => {
    const { pendingResponse } = get();
    if (!pendingResponse) return;

    const updatedResponse: GateResponse = {
      ...pendingResponse,
      followUpResponse: followUpAnswer,
    };

    set({ followUpMode: false, pendingResponse: null, gateQuestion: null });
    await saveAndAdvance(updatedResponse);
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
      gateQuestion: null,
      gateGenerating: false,
      pendingResponse: null,
      followUpMode: false,
    });
  },
}));

/** Helper: save gate response to file and advance section */
async function saveAndAdvance(newResponse: GateResponse) {
  const state = useReaderStore.getState();
  const { gateResponses, filePath, rawContent, sections, currentSectionIndex } = state;

  if (!filePath || !rawContent) return;

  const updatedResponses = [...gateResponses, newResponse];

  try {
    const digestionMarker = "\n\n## Digestion";
    const baseContent = rawContent.includes(digestionMarker)
      ? rawContent.slice(0, rawContent.indexOf(digestionMarker))
      : rawContent;

    const digestionMd = formatDigestionMarkdown(updatedResponses);
    const updatedContent = baseContent + digestionMd;

    await writeFile(filePath, updatedContent);

    useReaderStore.setState({
      currentSectionIndex: newResponse.sectionIndex,
      gateOpen: false,
      gateResponses: updatedResponses,
      rawContent: updatedContent,
      suggestedCards: [],
    });

    // Auto-suggest flashcards (fire-and-forget)
    const sectionContent = sections[currentSectionIndex]?.content || "";
    if (sectionContent.trim().split(/\s+/).length >= 20) {
      aiRequest(
        `Generate 1-2 flashcard Q/A pairs from this study content. Output ONLY JSON: [{"q":"...","a":"...","bloom":1-3}]`,
        sectionContent.slice(0, 1500),
        300,
      ).then(({ text: cardText }) => {
        const cleanedCards = cardText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        const match = cleanedCards.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { q: string; a: string; bloom: number }[];
          useReaderStore.setState({
            suggestedCards: parsed.map((p) => ({ question: p.q, answer: p.a, bloom: p.bloom || 2 })),
          });
        }
      }).catch(() => {});
    }
  } catch (e) {
    console.error("Failed to save digestion:", e);
    useReaderStore.setState({ error: "Failed to save gate response. Please try again." });
  }
}
