import { create } from "zustand";
import type { GateResponse, GateSubQuestion, GatePromptType } from "../lib/types";
import { splitSections, parseFrontmatter } from "../lib/markdown";
import type { Section } from "../lib/markdown";
import {
  shouldGateSection,
  shouldSkipRemaining,
  formatDigestionMarkdown,
} from "../lib/gates";
import { readFile, writeFile, aiRequest, getConfig } from "../lib/tauri";
import { getProfileContext } from "../lib/profile";

export interface SuggestedCard {
  question: string;
  answer: string;
  bloom: number;
}

interface GeneratedQuestion {
  type: GatePromptType;
  question: string;
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

  // Multi-question gate state
  gateGenerating: boolean;
  gatePhase: number;                         // 0-indexed: which sub-question we're on
  gateQuestions: GeneratedQuestion[];         // All questions for this gate
  currentGateSubQuestions: GateSubQuestion[]; // Answered sub-questions so far
  lastFeedback: string | null;               // Feedback from previous sub-question
  lastMastery: number | null;                // Mastery from previous sub-question
  gateSkipped: boolean;                      // True if remaining Qs were skipped (adaptive)

  loadFile: (path: string) => Promise<void>;
  advanceSection: () => void;
  goToSection: (index: number) => void;
  submitGateResponse: (response: string) => Promise<void>;
  clearError: () => void;
  dismissSuggestions: () => void;
  closeReader: () => void;
}

/** Generate 2-3 content-specific questions from a section using AI */
async function generateGateQuestions(
  sectionContent: string,
  sectionHeading: string,
): Promise<GeneratedQuestion[]> {
  try {
    let profileContext = "";
    try {
      const config = await getConfig();
      profileContext = getProfileContext(config);
    } catch { /* skip */ }

    const profileLine = profileContext
      ? `\nStudent context: ${profileContext} Use their background for relevant examples.`
      : "";

    const { text } = await aiRequest(
      `Read the study section below and generate 2-3 questions that test the student's understanding. Output ONLY JSON array.${profileLine}

Format: [{"type":"recall","q":"..."},{"type":"explain","q":"..."},{"type":"apply","q":"..."}]

- recall: Ask about a specific fact, term, or detail from the section.
- explain: Ask the student to explain a concept, relationship, or why something works.
- apply: Give a scenario and ask how to use the knowledge.

Questions must reference actual content, terms, and examples from the section. Be specific. Each question 1-2 sentences.`,
      `Section: ${sectionHeading || "Introduction"}\n\n${sectionContent.slice(0, 2000)}`,
      400,
    );

    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { type?: string; q: string }[];
      const types: GatePromptType[] = ["recall", "explain", "apply"];
      return parsed.slice(0, 3).map((p, i) => ({
        type: (types.includes(p.type as GatePromptType) ? p.type : types[i]) as GatePromptType,
        question: p.q,
      }));
    }
  } catch {
    // AI unavailable
  }

  // Fallback: generic questions if AI fails
  return [
    { type: "recall", question: "What is the main concept covered in this section?" },
    { type: "explain", question: "Explain why this concept matters in your own words." },
  ];
}

/** Evaluate a student's response to a gate question */
async function evaluateResponse(
  sectionContent: string,
  sectionHeading: string,
  question: string,
  response: string,
): Promise<{ feedback: string | null; mastery: number | null }> {
  try {
    const result = await aiRequest(
      `Evaluate the student's answer. Reply ONLY JSON: {"right":"1 sentence","gap":"1 sentence","mastery":1}
mastery: 1=weak/vague, 2=partial, 3=solid. Be specific to the content.`,
      `Section: ${sectionHeading}\nContent: ${sectionContent.slice(0, 800)}\nQuestion: ${question}\nStudent's answer: ${response}`,
      200,
    );

    const cleaned = result.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        right?: string;
        gap?: string;
        mastery?: number;
      };
      const feedback = [parsed.right, parsed.gap].filter(Boolean).join(" ");
      return { feedback: feedback || null, mastery: parsed.mastery ?? null };
    }
    return { feedback: result.text, mastery: null };
  } catch {
    return { feedback: null, mastery: null };
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
  gateGenerating: false,
  gatePhase: 0,
  gateQuestions: [],
  currentGateSubQuestions: [],
  lastFeedback: null,
  lastMastery: null,
  gateSkipped: false,

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
        gateGenerating: false,
        gatePhase: 0,
        gateQuestions: [],
        currentGateSubQuestions: [],
        lastFeedback: null,
        lastMastery: null,
        gateSkipped: false,
      });
    } catch (e) {
      console.error("Failed to load file for reader:", e);
      set({ loading: false });
    }
  },

  advanceSection: () => {
    const { currentSectionIndex, sections } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length) return;

    const nextSection = sections[nextIndex];
    if (shouldGateSection(nextIndex, nextSection.content)) {
      const currentSection = sections[currentSectionIndex];

      set({
        gateOpen: true,
        gateGenerating: true,
        gatePhase: 0,
        gateQuestions: [],
        currentGateSubQuestions: [],
        lastFeedback: null,
        lastMastery: null,
        gateSkipped: false,
      });

      // Generate all questions for this gate
      generateGateQuestions(
        currentSection?.content || "",
        currentSection?.heading || "Introduction",
      ).then((questions) => {
        set({ gateQuestions: questions, gateGenerating: false });
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
    const {
      currentSectionIndex, sections, filePath, rawContent,
      gateQuestions, gatePhase, currentGateSubQuestions,
    } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length || !filePath || !rawContent) return;
    if (gatePhase >= gateQuestions.length) return;

    const currentQ = gateQuestions[gatePhase];
    const sectionContent = sections[currentSectionIndex]?.content || "";
    const sectionHeading = sections[currentSectionIndex]?.heading || "Introduction";

    // Evaluate the answer
    const { feedback, mastery } = await evaluateResponse(
      sectionContent, sectionHeading, currentQ.question, response,
    );

    const subQuestion: GateSubQuestion = {
      promptType: currentQ.type,
      prompt: currentQ.question,
      response,
      feedback,
      mastery,
    };

    const updatedSubQuestions = [...currentGateSubQuestions, subQuestion];
    const nextPhase = gatePhase + 1;
    const isLastQuestion = nextPhase >= gateQuestions.length;
    const shouldSkip = shouldSkipRemaining(updatedSubQuestions);

    if (isLastQuestion || shouldSkip) {
      // Gate complete — save and advance
      // Re-read fresh state in case user navigated during AI evaluation
      const fresh = get();
      if (fresh.filePath !== filePath) return; // User switched files — abort

      const now = new Date().toLocaleString("en-US", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "numeric", minute: "2-digit",
      });

      const newResponse: GateResponse = {
        sectionIndex: nextIndex,
        subQuestions: updatedSubQuestions,
        timestamp: now,
      };

      set({ lastFeedback: feedback, lastMastery: mastery });

      await saveAndAdvance(
        newResponse, fresh.filePath!, fresh.rawContent!,
        fresh.sections, fresh.currentSectionIndex, fresh.gateResponses,
      );

      // Set gateSkipped after successful save
      if (shouldSkip && !isLastQuestion) {
        set({ gateSkipped: true });
      }
    } else {
      // Move to next question
      set({
        gatePhase: nextPhase,
        currentGateSubQuestions: updatedSubQuestions,
        lastFeedback: feedback,
        lastMastery: mastery,
      });
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
      gateGenerating: false,
      gatePhase: 0,
      gateQuestions: [],
      currentGateSubQuestions: [],
      lastFeedback: null,
      lastMastery: null,
      gateSkipped: false,
    });
  },
}));

/** Helper: save gate response to file and advance section */
async function saveAndAdvance(
  newResponse: GateResponse,
  filePath: string,
  rawContent: string,
  sections: Section[],
  currentSectionIndex: number,
  gateResponses: GateResponse[],
) {
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
      gatePhase: 0,
      gateQuestions: [],
      currentGateSubQuestions: [],
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
