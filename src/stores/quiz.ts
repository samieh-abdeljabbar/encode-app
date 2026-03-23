import { create } from "zustand";
import { aiRequest, writeFile, recordQuizResult } from "../lib/tauri";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type QuestionType = "free-recall" | "multiple-choice" | "fill-blank" | "true-false";

export interface QuizQuestion {
  id: string;
  question: string;
  bloomLevel: number;
  type: QuestionType;
  options?: string[];         // For multiple choice
  correctAnswer?: string;     // For MC and fill-blank
  userAnswer: string | null;
  feedback: string | null;
  correct: boolean | null;
  flagged: boolean;
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

  generateQuiz: (subject: string, topic: string, chapterContent: string) => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  flagQuestion: (index: number) => void;
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
        `You are a quiz generator for a study app. Generate exactly 5 quiz questions about the given content. MIX the question types for variety.

Output ONLY a JSON array with this format:
[
  {"question": "...", "bloomLevel": 2, "type": "free-recall"},
  {"question": "...", "bloomLevel": 1, "type": "multiple-choice", "options": ["A", "B", "C", "D"], "correctAnswer": "B"},
  {"question": "...", "bloomLevel": 2, "type": "fill-blank", "correctAnswer": "the missing word"},
  {"question": "...", "bloomLevel": 1, "type": "true-false", "correctAnswer": "true"},
  {"question": "...", "bloomLevel": 3, "type": "free-recall"}
]

Question types:
- "free-recall": open-ended, user writes their answer
- "multiple-choice": 4 options (A/B/C/D), one correct. Include plausible distractors.
- "fill-blank": statement with ___ for the missing word(s). Include correctAnswer.
- "true-false": statement that is either true or false. correctAnswer is "true" or "false".

Bloom levels: 1=Remember, 2=Understand, 3=Apply, 4=Analyze.
Use levels 1-3 for initial quizzes. Make questions test genuine understanding.`,
        `Subject: ${subject}\nTopic: ${topic}\n\nContent:\n${chapterContent.slice(0, 3000)}`,
        1500,
      );

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array in AI response");

      const parsed = JSON.parse(jsonMatch[0]) as {
        question: string;
        bloomLevel: number;
        type?: string;
        options?: string[];
        correctAnswer?: string;
      }[];

      const questions: QuizQuestion[] = parsed.map((q, i) => ({
        id: `q-${i}`,
        question: q.question,
        bloomLevel: q.bloomLevel || 2,
        type: (q.type as QuestionType) || "free-recall",
        options: q.options,
        correctAnswer: q.correctAnswer,
        userAnswer: null,
        feedback: null,
        correct: null,
        flagged: false,
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

    // For MC and T/F, we can check locally first
    if (question.type === "multiple-choice" && question.correctAnswer) {
      correct = answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
      feedback = correct
        ? "Correct!"
        : `Incorrect. The correct answer is: ${question.correctAnswer}`;
    } else if (question.type === "true-false" && question.correctAnswer) {
      correct = answer.toLowerCase() === question.correctAnswer.toLowerCase();
      feedback = correct
        ? "Correct!"
        : `Incorrect. The answer is: ${question.correctAnswer}`;
    } else if (question.type === "fill-blank" && question.correctAnswer) {
      correct = answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
      feedback = correct
        ? "Correct!"
        : `The expected answer was: ${question.correctAnswer}`;
    }

    // For free-recall or to get richer feedback, use AI
    if (question.type === "free-recall" || !feedback) {
      try {
        const { text } = await aiRequest(
          `You are evaluating a student's quiz answer. Respond with ONLY JSON:
{"correct": true, "feedback": "1-2 sentences explaining what was right/wrong and pushing deeper"}`,
          `Question (Bloom Level ${question.bloomLevel}): ${question.question}\nStudent's answer: ${answer}${question.correctAnswer ? `\nExpected answer: ${question.correctAnswer}` : ""}`,
          200,
        );
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { correct?: boolean; feedback?: string };
          feedback = parsed.feedback || feedback;
          if (correct === null) correct = parsed.correct ?? null;
        }
      } catch {
        if (feedback === null) feedback = "AI evaluation unavailable.";
      }
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

  flagQuestion: (index) => {
    const { questions } = get();
    const updated = [...questions];
    updated[index] = { ...updated[index], flagged: !updated[index].flagged };
    set({ questions: updated });
  },

  nextQuestion: () => {
    const { currentIndex, questions, subject, topic } = get();
    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length) {
      set({ sessionComplete: true, showFeedback: false });

      // Save results to vault + DB
      if (subject && topic) {
        const d = new Date().toISOString().split("T")[0];
        const now = new Date().toISOString().split(".")[0];
        const ts = Date.now();
        const subjectSlug = slugify(subject);
        const topicSlug = slugify(topic);
        const filePath = `subjects/${subjectSlug}/quizzes/${topicSlug}-${d}-${ts}.md`;
        const correctCount = questions.filter((q) => q.correct === true).length;
        const pct = Math.round((correctCount / questions.length) * 100);

        const lines = [
          "---", `subject: ${subject}`, `topic: ${topic}`, "type: quiz",
          `created_at: ${now}`, `score: ${pct}`, "---", "",
          `# Quiz: ${topic} (${d})`, "",
          `Score: **${correctCount}/${questions.length}** (${pct}%)`, "",
        ];

        for (const q of questions) {
          const typeLabel = q.type === "multiple-choice" ? "MC" : q.type === "fill-blank" ? "Fill" : q.type === "true-false" ? "T/F" : "Open";
          lines.push(`## [${typeLabel}] ${q.question}`);
          lines.push(`Bloom Level: ${q.bloomLevel}`);
          if (q.options) lines.push(`Options: ${q.options.join(" | ")}`);
          lines.push("");
          lines.push(`**Answer:** ${q.userAnswer || "(no answer)"}`);
          if (q.correctAnswer) lines.push(`**Correct Answer:** ${q.correctAnswer}`);
          lines.push(`**Result:** ${q.correct === true ? "Correct" : q.correct === false ? "Incorrect" : "Unevaluated"}`);
          if (q.feedback) lines.push(`**Feedback:** ${q.feedback}`);
          if (q.flagged) lines.push(`**Flagged:** Yes — question may be inaccurate`);
          lines.push("");
        }

        writeFile(filePath, lines.join("\n")).catch(() => {});

        // Record each question in DB for grade tracking
        for (const q of questions) {
          if (q.correct !== null) {
            recordQuizResult(subject, topic, q.bloomLevel, q.correct).catch(() => {});
          }
        }
      }
    } else {
      set({ currentIndex: nextIndex, showFeedback: false });
    }
  },

  resetQuiz: () =>
    set({
      subject: null, topic: null, questions: [],
      currentIndex: 0, loading: false, generating: false,
      showFeedback: false, sessionComplete: false, error: null,
    }),
}));
