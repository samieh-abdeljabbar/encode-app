import { create } from "zustand";
import { aiRequest, writeFile, recordQuizResult, listFiles, readFile } from "../lib/tauri";
import { parseFrontmatter } from "../lib/markdown";
import { useFlashcardStore } from "./flashcard";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type QuestionType = "free-recall" | "multiple-choice" | "fill-blank" | "true-false" | "code";

export interface QuizConfig {
  types: QuestionType[];
  questionCount: number;
  bloomRange: [number, number];
  timed: boolean;
}

export const DEFAULT_CONFIG: QuizConfig = {
  types: ["free-recall", "multiple-choice", "fill-blank", "true-false"],
  questionCount: 5,
  bloomRange: [1, 3],
  timed: false,
};

export interface QuizQuestion {
  id: string;
  question: string;
  bloomLevel: number;
  type: QuestionType;
  options?: string[];         // For multiple choice
  correctAnswer?: string;     // For MC, fill-blank, code
  language?: string;          // For code questions (sql, python, pseudocode)
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
  summary: string | null;
  generatedCards: number;
  config: QuizConfig;

  // Pre-quiz config state
  configSubject: string | null;
  configTopic: string | null;
  configContent: string | null;
  showConfig: boolean;

  setConfig: (config: Partial<QuizConfig>) => void;
  prepareQuiz: (subject: string, topic: string, content: string) => void;
  prepareSubjectQuiz: (subjectSlug: string, subjectName: string) => Promise<void>;
  startQuiz: () => Promise<void>;
  generateQuiz: (subject: string, topic: string, chapterContent: string, config?: QuizConfig) => Promise<void>;
  generateSubjectQuiz: (subjectSlug: string, subjectName: string) => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  flagQuestion: (index: number) => void;
  nextQuestion: () => void;
  retakeQuiz: (filePath: string) => Promise<void>;
  resetQuiz: () => void;
}

function buildTypePrompt(types: QuestionType[]): string {
  const descriptions: Record<QuestionType, string> = {
    "free-recall": '"free-recall": open-ended, user writes their answer',
    "multiple-choice": '"multiple-choice": 4 options (A/B/C/D), one correct. Include plausible distractors. Include "options" and "correctAnswer".',
    "fill-blank": '"fill-blank": statement with ___ for the missing word(s). Include "correctAnswer".',
    "true-false": '"true-false": statement that is either true or false. "correctAnswer" is "true" or "false".',
    "code": '"code": A coding problem. Include "language" field ("sql", "python", or "pseudocode"). Include "correctAnswer" with a sample solution. For SQL: give a scenario with table schema, ask for a query. For Python: give a data task. For pseudocode: give an algorithm task.',
  };
  return types.map((t) => `- ${descriptions[t]}`).join("\n");
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
  summary: null,
  generatedCards: 0,
  config: { ...DEFAULT_CONFIG },
  configSubject: null,
  configTopic: null,
  configContent: null,
  showConfig: false,

  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
  },

  prepareQuiz: (subject, topic, content) => {
    set({
      configSubject: subject,
      configTopic: topic,
      configContent: content,
      showConfig: true,
      error: null,
    });
  },

  prepareSubjectQuiz: async (subjectSlug, subjectName) => {
    set({ generating: true, error: null });
    try {
      const files = await listFiles(subjectSlug, "chapters");
      let combinedContent = "";
      for (const f of files) {
        try {
          const raw = await readFile(f.file_path);
          const { content } = parseFrontmatter(raw);
          combinedContent += `\n\n--- Chapter: ${f.file_path.split("/").pop()?.replace(".md", "")} ---\n\n${content}`;
        } catch { /* skip */ }
      }
      if (!combinedContent.trim()) {
        set({ generating: false, error: "No chapter content found for this subject." });
        return;
      }
      set({
        generating: false,
        configSubject: subjectName,
        configTopic: "All Chapters",
        configContent: combinedContent,
        showConfig: true,
      });
    } catch (e) {
      set({ generating: false, error: `Failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  },

  startQuiz: async () => {
    const { configSubject, configTopic, configContent, config } = get();
    if (!configSubject || !configTopic || !configContent) return;
    set({ showConfig: false });
    await get().generateQuiz(configSubject, configTopic, configContent, config);
  },

  generateQuiz: async (subject, topic, chapterContent, config) => {
    const cfg = config || get().config;
    set({ generating: true, subject, topic, error: null, summary: null, generatedCards: 0 });
    try {
      const typeList = buildTypePrompt(cfg.types);
      const typeNames = cfg.types.map((t) => `"${t}"`).join(", ");

      const contentLimit = cfg.questionCount > 10 ? 8000 : cfg.questionCount > 5 ? 6000 : 4000;
      const { text } = await aiRequest(
        `Generate exactly ${cfg.questionCount} quiz questions. Types: ${typeNames}. Bloom ${cfg.bloomRange[0]}-${cfg.bloomRange[1]}. Output ONLY a JSON array:
[{"question":"...","bloomLevel":2,"type":"free-recall"},{"question":"...","bloomLevel":1,"type":"multiple-choice","options":["A","B","C","D"],"correctAnswer":"B"}]
${typeList}${cfg.types.includes("code") ? "\nCode questions: include table schemas for SQL, function signatures for Python." : ""}`,
        `Subject: ${subject}\nTopic: ${topic}\n\nContent:\n${chapterContent.slice(0, contentLimit)}`,
        cfg.questionCount > 10 ? 8000 : cfg.questionCount > 5 ? 6000 : 4000,
      );

      // Strip <think>...</think> tags from reasoning models like DeepSeek R1
      const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array in AI response. Raw (first 300 chars): " + cleaned.slice(0, 300));

      const parsed = JSON.parse(jsonMatch[0]) as {
        question: string;
        bloomLevel: number;
        type?: string;
        options?: string[];
        correctAnswer?: string;
        language?: string;
      }[];

      const questions: QuizQuestion[] = parsed.map((q, i) => ({
        id: `q-${i}`,
        question: q.question,
        bloomLevel: q.bloomLevel || 2,
        type: (q.type as QuestionType) || "free-recall",
        options: q.options,
        correctAnswer: q.correctAnswer,
        language: q.language,
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

  generateSubjectQuiz: async (subjectSlug, subjectName) => {
    set({ generating: true, subject: subjectName, topic: "All Chapters", error: null });
    try {
      const files = await listFiles(subjectSlug, "chapters");
      let combinedContent = "";
      for (const f of files) {
        try {
          const raw = await readFile(f.file_path);
          const { content } = parseFrontmatter(raw);
          combinedContent += `\n\n--- Chapter: ${f.file_path.split("/").pop()?.replace(".md", "")} ---\n\n${content}`;
        } catch { /* skip */ }
      }
      if (!combinedContent.trim()) {
        set({ generating: false, error: "No chapter content found for this subject." });
        return;
      }
      await get().generateQuiz(subjectName, "All Chapters", combinedContent);
    } catch (e) {
      set({
        generating: false,
        error: `Failed to generate subject quiz: ${e instanceof Error ? e.message : String(e)}`,
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

    // Local validation for MC and T/F (exact match is reliable for these)
    if (question.type === "multiple-choice" && question.correctAnswer) {
      correct = answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
      feedback = correct ? "Correct!" : `Incorrect. The correct answer is: ${question.correctAnswer}`;
    } else if (question.type === "true-false" && question.correctAnswer) {
      correct = answer.toLowerCase() === question.correctAnswer.toLowerCase();
      feedback = correct ? "Correct!" : `Incorrect. The answer is: ${question.correctAnswer}`;
    } else if (question.type === "fill-blank" && question.correctAnswer) {
      // Exact match → correct. Otherwise fall through to AI for semantic evaluation.
      if (answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim()) {
        correct = true;
        feedback = "Correct!";
      }
      // If not exact match, leave correct=null and feedback=null so AI evaluates below
    }

    // For free-recall, code, fill-blank (no exact match), or missing feedback — use AI
    if (question.type === "free-recall" || question.type === "code" || !feedback) {
      try {
        const codeContext = question.type === "code"
          ? `\nLanguage: ${question.language || "unknown"}\nEvaluate the code for correctness of logic and approach, not exact syntax.`
          : "";
        const { text } = await aiRequest(
          `You are evaluating a student's quiz answer. Respond with ONLY JSON:
{"correct": true, "feedback": "1-2 sentences explaining what was right/wrong", "correctAnswer": "the actual correct answer to the question"}${codeContext}
Always include "correctAnswer" with the real, complete answer to the question.`,
          `Question (Bloom Level ${question.bloomLevel}): ${question.question}\nStudent's answer: ${answer}${question.correctAnswer ? `\nExpected answer: ${question.correctAnswer}` : ""}`,
          500,
        );
        const cleanedEval = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        const jsonMatch = cleanedEval.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { correct?: boolean; feedback?: string; correctAnswer?: string };
          feedback = parsed.feedback || feedback;
          // Set correctAnswer from AI if not already set
          if (!question.correctAnswer && parsed.correctAnswer) {
            const updatedQ = [...get().questions];
            updatedQ[currentIndex] = { ...updatedQ[currentIndex], correctAnswer: parsed.correctAnswer };
            set({ questions: updatedQ });
          }
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

      // Save results + auto-create flashcards from wrong answers
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
          const typeLabel = q.type === "multiple-choice" ? "MC"
            : q.type === "fill-blank" ? "Fill"
            : q.type === "true-false" ? "T/F"
            : q.type === "code" ? "Code"
            : "Open";
          lines.push(`## [${typeLabel}] ${q.question}`);
          lines.push(`Bloom Level: ${q.bloomLevel}`);
          if (q.language) lines.push(`Language: ${q.language}`);
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

        // Auto-create flashcards from wrong answers (awaited + serialized to avoid file races)
        const wrongQuestions = questions.filter((q) => q.correct === false && !q.flagged);
        if (wrongQuestions.length > 0) {
          (async () => {
            let cardCount = 0;
            for (const q of wrongQuestions) {
              const cardAnswer = q.correctAnswer || q.feedback || "Review this concept.";
              try {
                await useFlashcardStore.getState().createCard(subject, topic, q.question, cardAnswer, q.bloomLevel);
                cardCount++;
              } catch { /* skip */ }
            }
            set({ generatedCards: cardCount });
          })();
        }

        // Generate summary of wrong answers
        if (wrongQuestions.length > 0) {
          const wrongSummary = wrongQuestions.map((q) =>
            `Q: ${q.question}\nYour answer: ${q.userAnswer}\nCorrect: ${q.correctAnswer || "(see feedback)"}\nFeedback: ${q.feedback || ""}`
          ).join("\n\n");

          aiRequest(
            "You are a study coach. Based on the questions the student got wrong, write a concise summary (3-5 bullet points) of the key concepts they need to review. Be specific and actionable. Use plain text, no markdown headers.",
            `Subject: ${subject}\nTopic: ${topic}\n\nWrong answers:\n${wrongSummary}`,
            500,
          ).then(({ text }) => {
            set({ summary: text });
          }).catch(() => {
            set({ summary: null });
          });
        }
      }
    } else {
      set({ currentIndex: nextIndex, showFeedback: false });
    }
  },

  retakeQuiz: async (filePath) => {
    set({ generating: true, error: null, summary: null, generatedCards: 0 });
    try {
      const raw = await readFile(filePath);
      const { frontmatter, content } = parseFrontmatter(raw);
      const subject = (frontmatter.subject as string) || "";
      const topic = (frontmatter.topic as string) || "";

      // Parse questions from ## [TYPE] blocks
      const blocks = content.split("\n## ").filter((s) => s.startsWith("["));
      const questions: QuizQuestion[] = blocks.map((block, i) => {
        const lines = block.split("\n");
        const header = lines[0] || "";
        const typeMatch = header.match(/^\[(MC|Fill|T\/F|Open|Code)\]/);
        const questionText = header.replace(/^\[.*?\]\s*/, "");

        let qType: QuestionType = "free-recall";
        if (typeMatch) {
          const label = typeMatch[1];
          if (label === "MC") qType = "multiple-choice";
          else if (label === "Fill") qType = "fill-blank";
          else if (label === "T/F") qType = "true-false";
          else if (label === "Code") qType = "code";
        }

        const bloomLine = lines.find((l) => l.startsWith("Bloom Level:"));
        const bloomLevel = bloomLine ? parseInt(bloomLine.replace("Bloom Level:", "").trim()) || 2 : 2;

        const langLine = lines.find((l) => l.startsWith("Language:"));
        const language = langLine ? langLine.replace("Language:", "").trim() : undefined;

        const optionsLine = lines.find((l) => l.startsWith("Options:"));
        const options = optionsLine ? optionsLine.replace("Options:", "").trim().split(" | ") : undefined;

        const correctLine = lines.find((l) => l.startsWith("**Correct Answer:**"));
        const correctAnswer = correctLine ? correctLine.replace("**Correct Answer:**", "").trim() : undefined;

        return {
          id: `q-${i}`,
          question: questionText,
          bloomLevel,
          type: qType,
          options,
          correctAnswer,
          language,
          userAnswer: null,
          feedback: null,
          correct: null,
          flagged: false,
        };
      });

      if (questions.length === 0) {
        set({ generating: false, error: "Could not parse questions from this quiz." });
        return;
      }

      set({
        subject,
        topic,
        questions,
        generating: false,
        currentIndex: 0,
        sessionComplete: false,
        showFeedback: false,
        showConfig: false,
      });
    } catch (e) {
      set({ generating: false, error: `Failed to load quiz: ${e instanceof Error ? e.message : String(e)}` });
    }
  },

  resetQuiz: () =>
    set({
      subject: null, topic: null, questions: [],
      currentIndex: 0, loading: false, generating: false,
      showFeedback: false, sessionComplete: false, error: null,
      summary: null, generatedCards: 0,
      configSubject: null, configTopic: null, configContent: null, showConfig: false,
    }),
}));
