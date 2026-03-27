import { create } from "zustand";
import type { GateResponse, GateSubQuestion, GatePromptType } from "../lib/types";
import { splitSections, parseFrontmatter } from "../lib/markdown";
import type { Section } from "../lib/markdown";
import {
  extractSchemaActivation,
  extractSynthesis,
  stripStudyMetaSections,
  upsertSchemaActivation,
  upsertSynthesis,
} from "../lib/synthesis";
import {
  extractDigestion,
  mergeGateResponses,
  shouldGateSection,
  upsertDigestion,
} from "../lib/gates";
import { readFile, writeFile, aiRequest, getConfig, getCachedAnalysis, putCachedAnalysis } from "../lib/tauri";
import { getProfileContext } from "../lib/profile";
import { useFlashcardStore } from "./flashcard";

export interface SuggestedCard {
  question: string;
  answer: string;
  bloom: number;
}

interface CoreCardState extends SuggestedCard {
  id: string;
  filePath: string;
  created: boolean;
  skipped: boolean;
}

interface GeneratedQuestion {
  type: GatePromptType;
  question: string;
}

interface AnalysisConcept {
  name: string;
  kind: "term" | "mechanism" | "relationship";
  detail: string;
}

interface SectionAnalysis {
  concepts: AnalysisConcept[];
  commonMisconception: string;
  questions: GeneratedQuestion[];
  summary: {
    remember: string;
    watchOut: string;
    goDeeper: string;
  };
  coreCard: SuggestedCard;
}

interface EvaluationResult {
  feedback: string | null;
  mastery: number | null;
  repairCardCandidate: SuggestedCard | null;
}

interface ReaderState {
  filePath: string | null;
  rawContent: string | null;
  sections: Section[];
  currentSectionIndex: number;
  gateOpen: boolean;
  gateResponses: GateResponse[];
  suggestedCards: SuggestedCard[];
  currentCoreCard: CoreCardState | null;
  loading: boolean;
  error: string | null;

  // Multi-question gate state
  gateGenerating: boolean;
  gatePhase: number;
  gateQuestions: GeneratedQuestion[];
  currentGateAnalysis: SectionAnalysis | null;
  gateAnalysisCache: Record<string, SectionAnalysis>;
  currentGateSubQuestions: GateSubQuestion[]; // Answered sub-questions so far
  weakestRepairCard: SuggestedCard | null;
  lastFeedback: string | null;
  lastMastery: number | null;

  // Pre-reading schema activation
  showSchemaActivation: boolean;
  schemaActivationTopic: string;
  schemaActivationResponse: string;

  // Post-reading synthesis
  synthesisSaving: boolean;
  synthesisResponse: string;
  synthesisEvaluation: string | null;
  synthesisComplete: boolean;

  loadFile: (path: string) => Promise<void>;
  advanceSection: () => void;
  goToSection: (index: number) => void;
  submitGateResponse: (response: string) => Promise<void>;
  submitSynthesis: (response: string) => Promise<void>;
  clearError: () => void;
  dismissSuggestions: () => void;
  dismissCoreCard: () => void;
  removeCoreCard: () => Promise<void>;
  closeReader: () => void;
  setSchemaActivationResponse: (response: string) => void;
  submitSchemaActivation: (response: string) => Promise<void>;
  dismissSchemaActivation: () => void;
}

const FALLBACK_GATE_QUESTIONS: Array<[GeneratedQuestion, GeneratedQuestion]> = [
  [
    { type: "recall", question: "What specific term, rule, or fact from this section matters most?" },
    { type: "apply", question: "Why does that detail matter in practice?" },
  ],
  [
    { type: "recall", question: "What changed or became clearer in this section compared with the previous one?" },
    { type: "apply", question: "How would you use that idea in a real example?" },
  ],
  [
    { type: "explain", question: "Which relationship or dependency in this section is most important?" },
    { type: "apply", question: "What breaks if you misunderstand that relationship?" },
  ],
  [
    { type: "recall", question: "What is one precise claim this section makes?" },
    { type: "explain", question: "Explain why that claim is true using the section's logic." },
  ],
  [
    { type: "analyze", question: "What distinction did this section draw between similar ideas?" },
    { type: "apply", question: "Give an example that shows the difference." },
  ],
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function analysisCacheKey(filePath: string, sectionIndex: number): string {
  return `${filePath}::${sectionIndex}`;
}

/** SHA-256 fingerprint of section content (first 8 bytes as hex). */
async function contentFingerprint(content: string): Promise<string> {
  const data = new TextEncoder().encode(content.trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes.slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}

/** Tracks in-flight analysis requests to prevent duplicate generation. */
const inflightAnalysis = new Set<string>();

function getFallbackQuestions(sectionIndex: number, wordCount: number): GeneratedQuestion[] {
  const pair = FALLBACK_GATE_QUESTIONS[sectionIndex % FALLBACK_GATE_QUESTIONS.length];
  if (wordCount < 500) {
    return pair;
  }
  return [
    ...pair,
    { type: "analyze", question: "Where would someone most likely misuse or overgeneralize this idea?" },
  ];
}

function trimSentence(input: string | undefined, fallback: string): string {
  const normalized = input?.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function parseAnalysis(text: string, questionCount: number): SectionAnalysis | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as {
    concepts?: { name?: string; kind?: string; detail?: string }[];
    commonMisconception?: string;
    questions?: { type?: string; q?: string }[];
    summary?: { remember?: string; watchOut?: string; goDeeper?: string };
    coreCard?: { q?: string; a?: string; bloom?: number };
  };

  const validTypes: GatePromptType[] = ["recall", "explain", "apply", "analyze"];
  const concepts = (parsed.concepts || []).slice(0, questionCount + 1).map((concept, index) => ({
    name: trimSentence(concept.name, `Concept ${index + 1}`),
    kind: (concept.kind === "term" || concept.kind === "mechanism" || concept.kind === "relationship"
      ? concept.kind
      : "term") as AnalysisConcept["kind"],
    detail: trimSentence(concept.detail, "Key detail unavailable."),
  }));
  const questions = (parsed.questions || []).slice(0, questionCount).map((question, index) => ({
    type: (validTypes.includes(question.type as GatePromptType)
      ? question.type
      : (index === 0 ? "recall" : index === 1 ? "explain" : "apply")) as GatePromptType,
    question: trimSentence(question.q, "Explain the most important idea in this section."),
  }));
  const summary = parsed.summary;
  const coreCard = parsed.coreCard;

  if (concepts.length === 0 || questions.length !== questionCount || !summary || !coreCard?.q || !coreCard?.a) {
    return null;
  }

  return {
    concepts,
    commonMisconception: trimSentence(parsed.commonMisconception, "A common misconception was not identified."),
    questions,
    summary: {
      remember: trimSentence(summary.remember, "Remember the most important idea from this section."),
      watchOut: trimSentence(summary.watchOut, "Watch for the most common misunderstanding in this section."),
      goDeeper: trimSentence(summary.goDeeper, "Consider where this idea connects next."),
    },
    coreCard: {
      question: trimSentence(coreCard.q, "What should you remember from this section?"),
      answer: trimSentence(coreCard.a, "The key answer was not generated."),
      bloom: Math.min(3, Math.max(1, coreCard.bloom || 2)),
    },
  };
}

async function analyzeSectionForGate(
  filePath: string,
  sectionIndex: number,
  sectionContent: string,
  sectionHeading: string,
): Promise<{ analysis: SectionAnalysis | null; questions: GeneratedQuestion[] }> {
  const wordCount = sectionContent.trim().split(/\s+/).filter(Boolean).length;
  const questionCount = wordCount < 500 ? 2 : 3;
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
      "reader_gate_analyze",
      `Read the ENTIRE section below carefully and return ONLY valid JSON.${profileLine}

Use this exact schema:
{
  "concepts": [
    { "name": "string", "kind": "term|mechanism|relationship", "detail": "string" }
  ],
  "commonMisconception": "string",
  "questions": [
    { "type": "recall|explain|apply|analyze", "q": "string" }
  ],
  "summary": {
    "remember": "string",
    "watchOut": "string",
    "goDeeper": "string"
  },
  "coreCard": {
    "q": "string",
    "a": "string",
    "bloom": 1
  }
}

Rules:
- "concepts" must contain exactly ${wordCount < 500 ? 3 : 4} items.
- each concepts[].detail must be 1 sentence max.
- "commonMisconception" must be 1 sentence max.
- "questions" must contain exactly ${questionCount} items.
- Question 1 must be a concrete recall/detail question.
- Question 2 must ask about a mechanism, relationship, or why-it-works.
- Question 3, when present, must ask for application, contrast, or an error-case.
- Questions must cover different ideas from across the section, not just the opening.
- "summary" must contain all 3 fields, each 1-2 sentences max.
- "coreCard" must contain exactly 1 flashcard with Bloom between 1 and 3.
- Keep all strings concise and specific to the section.`,
      `File: ${filePath}\nSection: ${sectionHeading || "Introduction"}\n\n${sectionContent.slice(0, 6000)}`,
      1500,
    );

    const analysis = parseAnalysis(text, questionCount);
    if (analysis) {
      return { analysis, questions: analysis.questions };
    }
  } catch {
    // AI unavailable or invalid JSON.
  }

  return {
    analysis: null,
    questions: getFallbackQuestions(sectionIndex, wordCount),
  };
}

/** Evaluate a student's response to a gate question */
async function evaluateResponse(
  sectionHeading: string,
  sectionAnalysis: SectionAnalysis | null,
  question: string,
  response: string,
): Promise<EvaluationResult> {
  if (!sectionAnalysis) {
    return { feedback: null, mastery: null, repairCardCandidate: null };
  }

  try {
    const result = await aiRequest(
      "reader_gate_evaluate",
      `You are evaluating a student's understanding of a study section. Reply ONLY with JSON:
{"right":"what they got correct (1-2 sentences)","gap":"what they missed or got wrong (1-2 sentences)","deeper":"one follow-up question to deepen understanding","mastery":1,"repairCardCandidate":{"q":"...","a":"..."}}

Mastery scale (1-5):
1 = Wrong or confused — fundamental misunderstanding
2 = Vague — only surface-level, missing key details
3 = Partially correct — got the gist but missed important specifics
4 = Solid understanding — minor gaps only
5 = Excellent — demonstrates deep comprehension, could teach this

Rules:
- Be specific: reference actual concepts from the section analysis.
- Do not give mastery 4-5 unless the answer demonstrates genuine understanding beyond surface recall.
- Only include repairCardCandidate when mastery is below 3.
- repairCardCandidate should target the weakest missed concept and be concise.`,
      `Section: ${sectionHeading}\nSection analysis: ${JSON.stringify(sectionAnalysis)}\nQuestion: ${question}\nStudent's answer: ${response}`,
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
        repairCardCandidate?: { q?: string; a?: string };
      };
      const parts = [parsed.right, parsed.gap];
      if (parsed.deeper) parts.push(`Think deeper: ${parsed.deeper}`);
      const feedback = parts.filter(Boolean).join(" ");
      return {
        feedback: feedback || null,
        mastery: parsed.mastery ?? null,
        repairCardCandidate: parsed.mastery !== undefined && parsed.mastery < 3 && parsed.repairCardCandidate?.q && parsed.repairCardCandidate?.a
          ? {
              question: trimSentence(parsed.repairCardCandidate.q, "What concept needs more work?"),
              answer: trimSentence(parsed.repairCardCandidate.a, "Review the concept you missed in this section."),
              bloom: 2,
            }
          : null,
      };
    }
    return { feedback: result.text, mastery: null, repairCardCandidate: null };
  } catch {
    return { feedback: null, mastery: null, repairCardCandidate: null };
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

async function markChapterReading(filePath: string, rawContent: string): Promise<string> {
  if (!filePath.includes("/chapters/")) {
    return rawContent;
  }

  const { frontmatter } = parseFrontmatter(rawContent);
  if (frontmatter.status && frontmatter.status !== "unread") {
    return rawContent;
  }

  const updatedContent = rawContent.match(/^status:\s*\w+/m)
    ? rawContent.replace(/^status:\s*\w+/m, "status: reading")
    : rawContent;

  if (updatedContent !== rawContent) {
    await writeFile(filePath, updatedContent);
  }

  return updatedContent;
}

async function countExistingCoreCards(subject: string, topic: string): Promise<number> {
  const filePath = `subjects/${slugify(subject)}/flashcards/${slugify(topic || "general")}.md`;
  try {
    const content = await readFile(filePath);
    return (content.match(/^>\s*\[!card\]\s*id:\s*fc-core-[\w-]+$/gm) || []).length;
  } catch {
    return 0;
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
  currentCoreCard: null,
  loading: false,
  showSchemaActivation: false,
  schemaActivationTopic: "",
  schemaActivationResponse: "",
  synthesisSaving: false,
  synthesisResponse: "",
  synthesisEvaluation: null,
  synthesisComplete: false,
  error: null,
  gateGenerating: false,
  gatePhase: 0,
  gateQuestions: [],
  currentGateAnalysis: null,
  gateAnalysisCache: {},
  currentGateSubQuestions: [],
  weakestRepairCard: null,
  lastFeedback: null,
  lastMastery: null,

  loadFile: async (path) => {
    set({ loading: true });
    try {
      const raw = await readFile(path);
      const { frontmatter: originalFrontmatter } = parseFrontmatter(raw);
      const isChapter = path.includes("/chapters/");
      const isUnread = originalFrontmatter.status === "unread" || !originalFrontmatter.status;
      const nextRaw = isChapter ? await markChapterReading(path, raw) : raw;
      const { content, frontmatter } = parseFrontmatter(nextRaw);
      const gateResponses = extractDigestion(nextRaw);
      const schemaActivation = extractSchemaActivation(nextRaw);
      const synthesis = extractSynthesis(nextRaw);
      const sections = splitSections(content);
      const topic = (frontmatter.topic as string) || path.split("/").pop()?.replace(".md", "") || "this topic";
      const maxRevealedSection = gateResponses.length > 0
        ? Math.max(...gateResponses.map((response) => response.sectionIndex))
        : 0;
      const isComplete = Boolean(synthesis) || frontmatter.status === "digested";
      const currentSectionIndex = sections.length === 0
        ? 0
        : isComplete
          ? sections.length - 1
          : Math.min(maxRevealedSection, sections.length - 1);
      const showSchemaActivation = isChapter
        && currentSectionIndex === 0
        && gateResponses.length === 0
        && !synthesis
        && (isUnread || Boolean(schemaActivation?.response));

      set({
        filePath: path,
        rawContent: nextRaw,
        sections,
        currentSectionIndex,
        gateOpen: false,
        gateResponses,
        loading: false,
        gateGenerating: false,
        gatePhase: 0,
        gateQuestions: [],
        currentGateAnalysis: null,
        gateAnalysisCache: {},
        currentGateSubQuestions: [],
        weakestRepairCard: null,
        lastFeedback: null,
        lastMastery: null,
        currentCoreCard: null,
        showSchemaActivation,
        schemaActivationTopic: topic,
        schemaActivationResponse: schemaActivation?.response || "",
        synthesisSaving: false,
        synthesisResponse: synthesis?.response || "",
        synthesisEvaluation: synthesis?.evaluation || null,
        synthesisComplete: Boolean(synthesis),
      });
    } catch (e) {
      console.error("Failed to load file for reader:", e);
      set({ loading: false });
    }
  },

  advanceSection: () => {
    const { currentSectionIndex, sections, filePath, rawContent, synthesisComplete } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length) {
      if (filePath && rawContent && synthesisComplete) {
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
        currentGateAnalysis: null,
        currentGateSubQuestions: [],
        weakestRepairCard: null,
        lastFeedback: null,
        lastMastery: null,
        suggestedCards: [],
        currentCoreCard: null,
      });

      // Level 1: in-memory cache (session-scoped)
      const memKey = filePath ? analysisCacheKey(filePath, currentSectionIndex) : "";
      const memCached = filePath ? get().gateAnalysisCache[memKey] : undefined;
      if (memCached) {
        set({
          gateQuestions: memCached.questions,
          currentGateAnalysis: memCached,
          gateGenerating: false,
        });
        return;
      }

      const sectionContent = currentSection?.content || "";
      const sectionHeading = currentSection?.heading || "Introduction";
      const fp = filePath || "";

      // Level 2: persistent SQLite cache, then live generation
      (async () => {
        // Short-circuit when AI is disabled — skip cache, use fallback questions
        try {
          const config = await getConfig();
          if (config.ai_provider === "none") {
            const wordCount = sectionContent.trim().split(/\s+/).filter(Boolean).length;
            set({
              gateQuestions: getFallbackQuestions(currentSectionIndex, wordCount),
              currentGateAnalysis: null,
              gateGenerating: false,
            });
            return;
          }
        } catch { /* config unavailable — proceed with live generation attempt */ }

        // Check SQLite cache
        if (fp) {
          try {
            const fingerprint = await contentFingerprint(sectionContent);
            const dbHit = await getCachedAnalysis(fp, currentSectionIndex, fingerprint);
            if (dbHit) {
              // Derive question count from stored data to avoid mismatch if word count threshold shifted
              const storedQCount = (() => { try { return (JSON.parse(dbHit) as { questions?: unknown[] })?.questions?.length ?? 2; } catch { return 2; } })();
              const parsed = parseAnalysis(dbHit, storedQCount);
              if (parsed) {
                set((state) => ({
                  gateQuestions: parsed.questions,
                  currentGateAnalysis: parsed,
                  gateGenerating: false,
                  gateAnalysisCache: { ...state.gateAnalysisCache, [memKey]: parsed },
                }));
                return;
              }
              // Corrupt row — will be overwritten on regeneration
            }
          } catch { /* SQLite unavailable — fall through to live generation */ }
        }

        // Live generation with inflight guard
        const inflightKey = `${fp}::${currentSectionIndex}`;
        if (inflightAnalysis.has(inflightKey)) return;
        inflightAnalysis.add(inflightKey);
        try {
          const { analysis, questions } = await analyzeSectionForGate(fp, currentSectionIndex, sectionContent, sectionHeading);
          if (analysis && fp) {
            // Store in both caches
            set((state) => ({
              gateQuestions: questions,
              currentGateAnalysis: analysis,
              gateGenerating: false,
              gateAnalysisCache: { ...state.gateAnalysisCache, [memKey]: analysis },
            }));
            try {
              const fingerprint = await contentFingerprint(sectionContent);
              await putCachedAnalysis(fp, currentSectionIndex, fingerprint, JSON.stringify(analysis));
            } catch { /* SQLite write failed — non-fatal */ }
            return;
          }
          set({ gateQuestions: questions, currentGateAnalysis: null, gateGenerating: false });
        } finally {
          inflightAnalysis.delete(inflightKey);
        }
      })();
    } else {
      set({ currentSectionIndex: nextIndex, gateOpen: false });
    }
  },

  goToSection: (index) => {
    const { sections, gateResponses } = get();
    if (index < 0 || index >= sections.length) return;

    const maxRevealed = gateResponses.length > 0
      ? Math.max(...gateResponses.map((r) => r.sectionIndex))
      : 0;

    if (index <= maxRevealed || index <= get().currentSectionIndex) {
      set({ currentSectionIndex: index, gateOpen: false });
    }
  },

  submitGateResponse: async (response) => {
    const {
      currentSectionIndex, sections, filePath, rawContent,
      gateQuestions, gatePhase, currentGateSubQuestions, currentGateAnalysis, weakestRepairCard,
    } = get();
    const nextIndex = currentSectionIndex + 1;

    if (nextIndex >= sections.length || !filePath || !rawContent) return;
    if (gatePhase >= gateQuestions.length) return;

    const currentQ = gateQuestions[gatePhase];
    const sectionHeading = sections[currentSectionIndex]?.heading || "Introduction";

    const { feedback, mastery, repairCardCandidate } = await evaluateResponse(
      sectionHeading, currentGateAnalysis, currentQ.question, response,
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
    const nextWeakest = (() => {
      if (!repairCardCandidate || mastery === null || mastery >= 3) return weakestRepairCard;
      const existingWeakest = currentGateSubQuestions
        .map((sq) => sq.mastery)
        .filter((value): value is number => value !== null)
        .reduce((lowest, value) => Math.min(lowest, value), Number.POSITIVE_INFINITY);
      return mastery <= existingWeakest ? repairCardCandidate : weakestRepairCard;
    })();

    if (isLastQuestion) {
      const now = new Date().toLocaleString("en-US", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "numeric", minute: "2-digit",
      });

      const newResponse: GateResponse = {
        sectionIndex: nextIndex,
        subQuestions: updatedSubQuestions,
        remember: currentGateAnalysis?.summary.remember,
        watchOut: currentGateAnalysis?.summary.watchOut,
        goDeeper: currentGateAnalysis?.summary.goDeeper,
        timestamp: now,
      };

      set({ lastFeedback: feedback, lastMastery: mastery });

      await saveAndAdvance(
        newResponse,
        filePath,
        currentSectionIndex,
        currentGateAnalysis,
        nextWeakest,
      );
    } else {
      set({
        gatePhase: nextPhase,
        currentGateSubQuestions: updatedSubQuestions,
        weakestRepairCard: nextWeakest,
        lastFeedback: feedback,
        lastMastery: mastery,
      });
    }
  },

  clearError: () => set({ error: null }),

  submitSynthesis: async (response) => {
    const { filePath, rawContent } = get();
    if (!filePath || !rawContent || !filePath.includes("/chapters/")) return;

    const trimmed = response.trim();
    if (!trimmed) {
      set({ error: "Write a chapter synthesis before moving on." });
      return;
    }

    set({ synthesisSaving: true, error: null });

    const prompt = "Connect the key ideas from this chapter. What is the throughline, how do the parts fit together, and what should you remember going forward?";
    let evaluation = "AI evaluation unavailable.";

    try {
      const config = await getConfig();
      if (config.ai_provider !== "none") {
        const { text } = await aiRequest(
          "reader_chapter_synthesis",
          `You are evaluating a student's chapter synthesis. Keep the response under 140 words.

Respond with plain text in this structure:
Strong: one sentence on what the synthesis connected well.
Gap: one sentence on what was missing, vague, or underdeveloped.
Remember: one sentence on the most important takeaway.

Be specific to the chapter content. Do not fail the student or block progress.`,
          `Chapter content:\n${stripStudyMetaSections(parseFrontmatter(rawContent).content).slice(0, 5000)}\n\nStudent synthesis:\n${trimmed}`,
          400,
        );
        evaluation = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || evaluation;
      }
    } catch {
      // Non-blocking by design.
    }

    try {
      const timestamp = new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      });
      const latestRaw = await readFile(filePath);
      let nextContent = upsertSynthesis(latestRaw, {
        prompt,
        response: trimmed,
        evaluation,
        completedAt: timestamp,
      });
      nextContent = nextContent.match(/^status:\s*\w+/m)
        ? nextContent.replace(/^status:\s*\w+/m, "status: digested")
        : nextContent;
      await writeFile(filePath, nextContent);
      const fresh = get();
      if (fresh.filePath === filePath) {
        set({
          rawContent: nextContent,
          synthesisSaving: false,
          synthesisResponse: trimmed,
          synthesisEvaluation: evaluation,
          synthesisComplete: true,
        });
      } else {
        set({ synthesisSaving: false });
      }
    } catch (e) {
      console.error("Failed to save synthesis:", e);
      set({ synthesisSaving: false, error: "Failed to save chapter synthesis. Please try again." });
    }
  },

  dismissSuggestions: () => set({ suggestedCards: [] }),

  dismissCoreCard: () => set({ currentCoreCard: null }),

  removeCoreCard: async () => {
    const coreCard = get().currentCoreCard;
    if (!coreCard) return;
    await useFlashcardStore.getState().deleteCard(coreCard.id, coreCard.filePath);
    set({ currentCoreCard: null });
  },

  setSchemaActivationResponse: (schemaActivationResponse) => set({ schemaActivationResponse }),

  submitSchemaActivation: async (response) => {
    const { filePath, rawContent, schemaActivationTopic } = get();
    if (!filePath || !rawContent || !filePath.includes("/chapters/")) {
      set({ showSchemaActivation: false });
      return;
    }

    const trimmed = response.trim();
    if (!trimmed) {
      set({ showSchemaActivation: false });
      return;
    }

    try {
      const latestRaw = await readFile(filePath);
      const timestamp = new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      });
      const nextContent = upsertSchemaActivation(latestRaw, {
        prompt: `What do you already know about ${schemaActivationTopic}?`,
        response: trimmed,
        completedAt: timestamp,
      });
      await writeFile(filePath, nextContent);

      if (get().filePath === filePath) {
        set({
          rawContent: nextContent,
          showSchemaActivation: false,
          schemaActivationResponse: trimmed,
        });
      }
    } catch (e) {
      console.error("Failed to save schema activation:", e);
      set({ error: "Failed to save your pre-reading note. Please try again." });
    }
  },

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
      currentCoreCard: null,
      showSchemaActivation: false,
      schemaActivationTopic: "",
      synthesisSaving: false,
      schemaActivationResponse: "",
      synthesisResponse: "",
      synthesisEvaluation: null,
      synthesisComplete: false,
      gateGenerating: false,
      gatePhase: 0,
      gateQuestions: [],
      currentGateAnalysis: null,
      gateAnalysisCache: {},
      currentGateSubQuestions: [],
      weakestRepairCard: null,
      lastFeedback: null,
      lastMastery: null,
    });
  },
}));

/** Helper: save gate response to file and advance section */
async function saveAndAdvance(
  newResponse: GateResponse,
  filePath: string,
  currentSectionIndex: number,
  sectionAnalysis: SectionAnalysis | null,
  repairCardCandidate: SuggestedCard | null,
) {
  try {
    const latestRaw = await readFile(filePath);
    const updatedResponses = mergeGateResponses(extractDigestion(latestRaw), newResponse);
    const nextContent = upsertDigestion(latestRaw, updatedResponses);

    await writeFile(filePath, nextContent);

    let coreCardState: CoreCardState | null = null;
    if (sectionAnalysis) {
      const { frontmatter } = parseFrontmatter(nextContent);
      const subject = String(frontmatter.subject || "");
      const topic = String(frontmatter.topic || "");
      const coreCount = await countExistingCoreCards(subject, topic);
      if (coreCount < 12) {
        const coreResult = await useFlashcardStore.getState().upsertCoreCard(
          subject,
          topic,
          currentSectionIndex,
          sectionAnalysis.coreCard.question,
          sectionAnalysis.coreCard.answer,
          sectionAnalysis.coreCard.bloom,
        );
        coreCardState = {
          ...sectionAnalysis.coreCard,
          id: coreResult.id,
          filePath: coreResult.filePath,
          created: coreResult.created,
          skipped: false,
        };
      } else {
        coreCardState = {
          ...sectionAnalysis.coreCard,
          id: `fc-core-${slugify(subject)}-${slugify(topic || "general")}-s${currentSectionIndex}`,
          filePath: `subjects/${slugify(subject)}/flashcards/${slugify(topic || "general")}.md`,
          created: false,
          skipped: true,
        };
      }
    }

    if (useReaderStore.getState().filePath === filePath) {
      useReaderStore.setState({
        currentSectionIndex: newResponse.sectionIndex,
        gateOpen: false,
        gateResponses: updatedResponses,
        rawContent: nextContent,
        suggestedCards: repairCardCandidate ? [repairCardCandidate] : [],
        currentCoreCard: coreCardState,
        gatePhase: 0,
        gateQuestions: [],
        currentGateAnalysis: null,
        currentGateSubQuestions: [],
        weakestRepairCard: null,
      });
    }

    // Prefetch: analyze the section the user is now reading (will be needed at next gate)
    const sections = useReaderStore.getState().sections;
    const prefetchIdx = newResponse.sectionIndex;
    const gateBoundaryIdx = prefetchIdx + 1;
    if (gateBoundaryIdx < sections.length && shouldGateSection(gateBoundaryIdx, sections[gateBoundaryIdx].content)) {
      const pContent = sections[prefetchIdx].content;
      const pHeading = sections[prefetchIdx].heading || "Introduction";
      const pInflightKey = `${filePath}::${prefetchIdx}`;

      if (!inflightAnalysis.has(pInflightKey)) {
        inflightAnalysis.add(pInflightKey);
        contentFingerprint(pContent).then((fp) =>
          getCachedAnalysis(filePath, prefetchIdx, fp).then((hit) => {
            if (hit) {
              inflightAnalysis.delete(pInflightKey);
              return;
            }
            analyzeSectionForGate(filePath, prefetchIdx, pContent, pHeading)
              .then(({ analysis }) => {
                if (analysis) {
                  putCachedAnalysis(filePath, prefetchIdx, fp, JSON.stringify(analysis)).catch(() => {});
                  useReaderStore.setState((s) => ({
                    gateAnalysisCache: { ...s.gateAnalysisCache, [`${filePath}::${prefetchIdx}`]: analysis },
                  }));
                }
              })
              .catch(() => {})
              .finally(() => inflightAnalysis.delete(pInflightKey));
          }).catch(() => inflightAnalysis.delete(pInflightKey))
        ).catch(() => inflightAnalysis.delete(pInflightKey));
      }
    }
  } catch (e) {
    console.error("Failed to save digestion:", e);
    useReaderStore.setState({ error: "Failed to save gate response. Please try again." });
  }
}
