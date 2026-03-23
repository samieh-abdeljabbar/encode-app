import { create } from "zustand";
import { aiRequest, writeFile } from "../lib/tauri";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface QuizQuestion {
  id: string;
  question: string;
  bloomLevel: number;
  userAnswer: string | null;
  feedback: string | null;
  correct: boolean | null;
}

interface QuizState {
  subject: string | null;
  topic: string | null;
  questions: QuizQuestion[];
  currentIndex: number;
  loading: boolean;
  generating: boolean;
  showFeedback: boolean;
  sessionComplete: boolean;
  error: string | null;

  generateQuiz: (
    subject: string,
    topic: string,
    chapterContent: string,
  ) => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  nextQuestion: () => void;
  resetQuiz: () => void;
}

export const useQuizStore = create<QuizState>((set, get) => ({
  subject: null,
  topic: null,
  questions: [],
  currentIndex: 0,
  loading: false,
  generating: false,
  showFeedback: false,
  sessionComplete: false,
  error: null,

  generateQuiz: async (subject, topic, chapterContent) => {
    set({ generating: true, subject, topic, error: null });
    try {
      const { text } = await aiRequest(
        `You are a quiz generator for a study app. Generate exactly 5 quiz questions about the given content. Each question should test genuine understanding, not just recall.

Output ONLY a JSON array, no other text:
[{"question": "...", "bloomLevel": 1}, ...]

Bloom levels: 1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create
Target levels 1-3 for initial quizzes. Use free-recall questions — no multiple choice.`,
        `Subject: ${subject}\nTopic: ${topic}\n\nContent:\n${chapterContent.slice(0, 3000)}`,
        1000,
      );

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array in AI response");

      const parsed = JSON.parse(jsonMatch[0]) as {
        question: string;
        bloomLevel: number;
      }[];
      const questions: QuizQuestion[] = parsed.map((q, i) => ({
        id: `q-${i}`,
        question: q.question,
        bloomLevel: q.bloomLevel || 2,
        userAnswer: null,
        feedback: null,
        correct: null,
      }));

      set({
        questions,
        generating: false,
        currentIndex: 0,
        sessionComplete: false,
        showFeedback: false,
      });
    } catch (e) {
      set({
        generating: false,
        error: `Failed to generate quiz: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  },

  submitAnswer: async (answer) => {
    const { questions, currentIndex } = get();
    const question = questions[currentIndex];
    if (!question) return;

    set({ loading: true });

    let feedback: string | null = null;
    let correct: boolean | null = null;

    try {
      const { text } = await aiRequest(
        `You are evaluating a student's quiz answer. Respond with ONLY JSON:
{"correct": true, "feedback": "1-2 sentences explaining what was right/wrong and pushing deeper"}`,
        `Question (Bloom Level ${question.bloomLevel}): ${question.question}\nStudent's answer: ${answer}`,
        200,
      );
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          correct?: boolean;
          feedback?: string;
        };
        feedback = parsed.feedback || null;
        correct = parsed.correct ?? null;
      }
    } catch {
      // AI unavailable — accept answer without evaluation
      feedback = "AI evaluation unavailable.";
      correct = null;
    }

    const updatedQuestions = [...questions];
    updatedQuestions[currentIndex] = {
      ...question,
      userAnswer: answer,
      feedback,
      correct,
    };

    set({ questions: updatedQuestions, loading: false, showFeedback: true });
  },

  nextQuestion: () => {
    const { currentIndex, questions, subject, topic } = get();
    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length) {
      set({ sessionComplete: true, showFeedback: false });
      // Save quiz results to vault
      if (subject && topic) {
        const d = new Date().toISOString().split("T")[0];
        const now = new Date().toISOString().split(".")[0];
        const subjectSlug = slugify(subject);
        const topicSlug = slugify(topic);
        const filePath = `subjects/${subjectSlug}/quizzes/${topicSlug}-${d}.md`;
        const correctCount = questions.filter((q) => q.correct === true).length;
        const pct = Math.round((correctCount / questions.length) * 100);

        const lines = [
          "---",
          `subject: ${subject}`,
          `topic: ${topic}`,
          "type: quiz",
          `created_at: ${now}`,
          `score: ${pct}`,
          "---",
          "",
          `# Quiz: ${topic} (${d})`,
          "",
          `Score: **${correctCount}/${questions.length}** (${pct}%)`,
          "",
        ];

        for (const q of questions) {
          lines.push(`## Q: ${q.question}`);
          lines.push(`Bloom Level: ${q.bloomLevel}`);
          lines.push("");
          lines.push(`**Answer:** ${q.userAnswer || "(no answer)"}`);
          lines.push(`**Result:** ${q.correct === true ? "Correct" : q.correct === false ? "Incorrect" : "Unevaluated"}`);
          if (q.feedback) lines.push(`**Feedback:** ${q.feedback}`);
          lines.push("");
        }

        writeFile(filePath, lines.join("\n")).catch(() => {});
      }
    } else {
      set({ currentIndex: nextIndex, showFeedback: false });
    }
  },

  resetQuiz: () =>
    set({
      subject: null,
      topic: null,
      questions: [],
      currentIndex: 0,
      loading: false,
      generating: false,
      showFeedback: false,
      sessionComplete: false,
      error: null,
    }),
}));
