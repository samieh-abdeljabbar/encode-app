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

  // Pre-reading schema activation
  showSchemaActivation: boolean;
  schemaActivationTopic: string;

  loadFile: (path: string) => Promise<void>;
  advanceSection: () => void;
  goToSection: (index: number) => void;
  submitGateResponse: (response: string) => Promise<void>;
  clearError: () => void;
  dismissSuggestions: () => void;
  closeReader: () => void;
  dismissSchemaActivation: () => void;
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

    // Scale question count to section length
    const wordCount = sectionContent.split(/\s+/).length;
    const questionCount = wordCount < 500 ? 2 : wordCount < 1500 ? 3 : wordCount < 3000 ? 4 : 5;

    const { text } = await aiRequest(
      "reader_gate_generate",
      `Read the ENTIRE section below carefully. Generate exactly ${questionCount} questions that collectively cover ALL key concepts in the section, not just the beginning. Output ONLY a JSON array.${profileLine}

Format: [{"type":"recall","q":"..."},{"type":"explain","q":"..."},{"type":"apply","q":"..."}]

Question types:
- recall: Ask about a specific fact, term, definition, or detail from the section.
- explain: Ask the student to explain WHY something works, how concepts relate, or cause/effect relationships.
- apply: Give a real-world scenario and ask how to use the knowledge. Be specific and practical.
- analyze: Ask the student to compare/contrast concepts, identify patterns, or evaluate approaches.

CRITICAL RULES:
- Questions MUST reference specific content from THROUGHOUT the section, including the middle and end.
- Do NOT cluster questions around the opening paragraph.
- Each question should test a DIFFERENT concept from the section.
- Questions should be 1-2 sentences and demand genuine thought, not yes/no answers.`,
      `Section: ${sectionHeading || "Introduction"}\n\n${sectionContent.slice(0, 6000)}`,
      1500,
    );

    const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { type?: string; q: string }[];
      const validTypes: GatePromptType[] = ["recall", "explain", "apply", "analyze"];
      return parsed.slice(0, questionCount).map((p, i) => ({
        type: (validTypes.includes(p.type as GatePromptType) ? p.type : validTypes[i % 3]) as GatePromptType,
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
      "reader_gate_evaluate",
      `You are evaluating a student's understanding of a study section. Reply ONLY with JSON:
{"right":"what they got correct (1-2 sentences)","gap":"what they missed or got wrong (1-2 sentences)","deeper":"one follow-up question to deepen understanding","mastery":1}

Mastery scale (1-5):
1 = Wrong or confused — fundamental misunderstanding
2 = Vague — only surface-level, missing key details
3 = Partially correct — got the gist but missed important specifics
4 = Solid understanding — minor gaps only
5 = Excellent — demonstrates deep comprehension, could teach this

Be specific: reference actual terms and concepts from the section content. Do not give mastery 4-5 unless the answer demonstrates genuine understanding beyond surface recall.`,
      `Section: ${sectionHeading}\nContent: ${sectionContent.slice(0, 3000)}\nQuestion: ${question}\nStudent's answer: ${response}`,
      500,
    );

    const cleaned = result.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        right?: string;
        gap?: string;
        deeper?: string;
        mastery?: number;
      };
      const parts = [parsed.right, parsed.gap];
      if (parsed.deeper) parts.push(`Think deeper: ${parsed.deeper}`);
      const feedback = parts.filter(Boolean).join(" ");
      return { feedback: feedback || null, mastery: parsed.mastery ?? null };
    }
    return { feedback: result.text, mastery: null };
  } catch {
    return { feedback: null, mastery: null };
  }
}

async function markChapterDigested(filePath: string, rawContent: string): Promise<string> {
  if (!filePath.includes("/chapters/")) {
    return rawContent;
  }

  const updatedContent = rawContent.match(/^status:\s*\w+/m)
    ? rawContent.replace(/^status:\s*\w+/m, "status: digested")
    : rawContent;

  if (updatedContent !== rawContent) {
    await writeFile(filePath, updatedContent);
  }

  return updatedContent;
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
  showSchemaActivation: false,
  schemaActivationTopic: "",
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
      const { content, frontmatter } = parseFrontmatter(raw);
      const sections = splitSections(content);
      // Show schema activation for chapter files that haven't been read yet
      const isChapter = path.includes("/chapters/");
      const isUnread = frontmatter.status === "unread" || !frontmatter.status;
      const topic = (frontmatter.topic as string) || path.split("/").pop()?.replace(".md", "") || "this topic";
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
        showSchemaActivation: isChapter && isUnread,
        schemaActivationTopic: topic,
      });
    } catch (e) {
      console.error("Failed to load file for reader:", e);
      set({ loading: false });
    }
  },

  advanceSection: () => {
    const { currentSectionIndex, sections, filePath, rawContent } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length) {
      if (filePath && rawContent) {
        markChapterDigested(filePath, rawContent)
          .then((updatedContent) => set({ rawContent: updatedContent }))
          .catch(() => {
            set({ error: "Failed to mark chapter complete. Please try again." });
          });
      }
      return;
    }

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

  dismissSchemaActivation: () => set({ showSchemaActivation: false }),

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

    let finalContent = updatedContent;

    await writeFile(filePath, finalContent);

    useReaderStore.setState({
      currentSectionIndex: newResponse.sectionIndex,
      gateOpen: false,
      gateResponses: updatedResponses,
      rawContent: finalContent,
      suggestedCards: [],
      gatePhase: 0,
      gateQuestions: [],
      currentGateSubQuestions: [],
    });

    // Auto-suggest flashcards (fire-and-forget)
    const sectionContent = sections[currentSectionIndex]?.content || "";
    if (sectionContent.trim().split(/\s+/).length >= 20) {
      aiRequest(
        "reader_flashcard_suggest",
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
