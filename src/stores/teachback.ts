import { create } from "zustand";
import { aiRequest, writeFile } from "../lib/tauri";
import { localDateTimeString } from "../lib/dates";
import { today } from "../lib/sr";

interface TeachBackState {
  subject: string | null;
  topic: string | null;
  chapterPath: string | null;
  explanation: string;
  evaluation: string | null;
  loading: boolean;
  evaluated: boolean;
  saved: boolean;

  startTeachBack: (subject: string, topic: string, chapterPath?: string) => void;
  submitExplanation: (text: string) => Promise<void>;
  saveToVault: () => Promise<void>;
  reset: () => void;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const useTeachBackStore = create<TeachBackState>((set, get) => ({
  subject: null,
  topic: null,
  chapterPath: null,
  explanation: "",
  evaluation: null,
  loading: false,
  evaluated: false,
  saved: false,

  startTeachBack: (subject, topic, chapterPath) => {
    set({
      subject,
      topic,
      chapterPath: chapterPath ?? null,
      explanation: "",
      evaluation: null,
      loading: false,
      evaluated: false,
      saved: false,
    });
  },

  submitExplanation: async (text) => {
    const { topic } = get();
    set({ explanation: text, loading: true });

    try {
      const { text: feedback } = await aiRequest(
        "teachback_evaluate",
        `You are evaluating a teach-back explanation using the Feynman Technique. The student attempted to explain a concept in simple terms.

Evaluate with this structure:
**Strong:** What the explanation got right (1-2 sentences)
**Missing:** What was left out or could be deeper (1-2 sentences)
**Jargon:** Any technical terms used without explanation (list them, or say "None")
**Deeper Question:** One follow-up question that would push the student further

Be specific. Reference what they actually wrote. Keep total response under 150 words.`,
        `Topic: ${topic}\n\nStudent's explanation:\n${text}`,
        300,
      );
      set({ evaluation: feedback, loading: false, evaluated: true });
    } catch {
      set({
        evaluation:
          "AI evaluation unavailable. Your explanation has been saved — review it yourself for gaps.",
        loading: false,
        evaluated: true,
      });
    }
  },

  saveToVault: async () => {
    const { subject, topic, chapterPath, explanation, evaluation } = get();
    if (!subject || !topic) return;

    const subjectSlug = slugify(subject);
    const topicSlug = slugify(topic);
    const d = today();
    const now = localDateTimeString();
    const filePath = `subjects/${subjectSlug}/teach-backs/${topicSlug}-${d}.md`;

    const content = [
      "---",
      `subject: ${subject}`,
      `topic: ${topic}`,
      "type: teach-back",
      `created_at: ${now}`,
      ...(chapterPath ? [`source_chapter: ${chapterPath}`] : []),
      "---",
      "",
      `# Teach-Back: ${topic}`,
      "",
      "## Your Explanation",
      "",
      explanation,
      "",
      "## AI Evaluation",
      "",
      evaluation || "No AI evaluation available.",
      "",
    ].join("\n");

    await writeFile(filePath, content);
    set({ saved: true });
  },

  reset: () =>
    set({
      subject: null,
      topic: null,
      chapterPath: null,
      explanation: "",
      evaluation: null,
      loading: false,
      evaluated: false,
      saved: false,
    }),
}));
