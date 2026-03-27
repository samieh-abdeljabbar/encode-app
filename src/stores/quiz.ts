import { create } from "zustand";
import { aiRequest, writeFile, recordQuizResult, listFiles, readFile, createSandbox, executeSandboxQuery, destroySandbox, getSubjectGrades } from "../lib/tauri";
import type { QueryResult } from "../lib/types";
import { runPython, type PythonResult } from "../lib/pyodide";
import { parseFrontmatter } from "../lib/markdown";
import { localDateString, localDateTimeString } from "../lib/dates";
import { hasCompletedSynthesis, stripStudyMetaSections } from "../lib/synthesis";
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
  setupSql?: string;          // For SQL: CREATE/INSERT statements
  setupCode?: string;         // For Python: setup/test data code
  expectedOutput?: string;    // For code: expected stdout
  userAnswer: string | null;
  feedback: string | null;
  correct: boolean | null;
  flagged: boolean;
}

interface QuizState {
  subject: string | null;
  topic: string | null;
  sourceChapterPath: string | null;
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
  configChapterPath: string | null;
  showConfig: boolean;

  // SQL sandbox state
  activeSandboxId: string | null;
  sandboxResult: QueryResult | null;
  sandboxError: string | null;
  // Python execution state
  pythonResult: PythonResult | null;
  pythonRunning: boolean;

  setConfig: (config: Partial<QuizConfig>) => void;
  prepareQuiz: (subject: string, topic: string, content: string, chapterPath?: string) => void;
  prepareSubjectQuiz: (subjectSlug: string, subjectName: string) => Promise<void>;
  prepareMultiChapterQuiz: (subjectSlug: string, subjectName: string, chapterPaths: string[]) => Promise<void>;
  startQuiz: () => Promise<void>;
  generateQuiz: (subject: string, topic: string, chapterContent: string, config?: QuizConfig, chapterPath?: string) => Promise<void>;
  generateSubjectQuiz: (subjectSlug: string, subjectName: string) => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  flagQuestion: (index: number) => void;
  nextQuestion: () => void;
  retakeQuiz: (filePath: string) => Promise<void>;
  runSandboxQuery: (query: string) => Promise<void>;
  runPythonCode: (code: string) => Promise<void>;
  setupSandbox: (setupSql: string) => Promise<void>;
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
  sourceChapterPath: null,
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
  configChapterPath: null,
  showConfig: false,
  activeSandboxId: null,
  sandboxResult: null,
  sandboxError: null,
  pythonResult: null,
  pythonRunning: false,

  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
  },

  prepareQuiz: (subject, topic, content, chapterPath) => {
    set({
      configSubject: subject,
      configTopic: topic,
      configContent: content,
      configChapterPath: chapterPath ?? null,
      showConfig: true,
      error: null,
    });
  },

  prepareSubjectQuiz: async (subjectSlug, subjectName) => {
    set({ generating: true, error: null });
    try {
      const files = await listFiles(subjectSlug, "chapters");
      let combinedContent = "";
      let eligibleCount = 0;
      for (const f of files) {
        try {
          const raw = await readFile(f.file_path);
          const { content, frontmatter } = parseFrontmatter(raw);
          const eligible = frontmatter.status === "digested" || hasCompletedSynthesis(raw);
          if (!eligible) continue;
          eligibleCount++;
          combinedContent += `\n\n--- Chapter: ${f.file_path.split("/").pop()?.replace(".md", "")} ---\n\n${stripStudyMetaSections(content)}`;
        } catch { /* skip */ }
      }
      if (!combinedContent.trim() || eligibleCount === 0) {
        set({ generating: false, error: "No synthesized chapters are ready for a subject quiz yet. Finish reading and save chapter synthesis first." });
        return;
      }
      set({
        generating: false,
        configSubject: subjectName,
        configTopic: "All Chapters",
        configContent: combinedContent,
        configChapterPath: null,
        showConfig: true,
      });
    } catch (e) {
      set({ generating: false, error: `Failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  },

  prepareMultiChapterQuiz: async (_subjectSlug, subjectName, chapterPaths) => {
    set({ generating: true, error: null });
    try {
      let combinedContent = "";
      let eligibleCount = 0;
      for (const path of chapterPaths) {
        try {
          const raw = await readFile(path);
          const { content, frontmatter } = parseFrontmatter(raw);
          const eligible = frontmatter.status === "digested" || hasCompletedSynthesis(raw);
          if (!eligible) continue;
          eligibleCount++;
          const name = path.split("/").pop()?.replace(".md", "") || "";
          combinedContent += `\n\n--- Chapter: ${name} ---\n\n${stripStudyMetaSections(content)}`;
        } catch { /* skip */ }
      }
      if (!combinedContent.trim() || eligibleCount === 0) {
        set({ generating: false, error: "Selected chapters are not ready yet. Finish chapter synthesis in Reader before quizzing them together." });
        return;
      }
      set({
        generating: false,
        configSubject: subjectName,
        configTopic: `${chapterPaths.length} Chapters`,
        configContent: combinedContent,
        configChapterPath: null,
        showConfig: true,
      });
    } catch (e) {
      set({ generating: false, error: `Failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  },

  startQuiz: async () => {
    const { configSubject, configTopic, configContent, config, configChapterPath } = get();
    if (!configSubject || !configTopic || !configContent) return;

    // Adaptive difficulty: auto-adjust bloom range based on recent scores
    let finalConfig = config;
    if (config.bloomRange[0] === 0 && config.bloomRange[1] === 0) {
      // "Auto" mode: bloom range [0,0] signals auto-detect
      try {
        const grades = await getSubjectGrades();
        const subjectGrade = grades.find((g) => g.subject === configSubject);
        if (subjectGrade && subjectGrade.total_quizzes >= 2) {
          const avg = subjectGrade.avg_score;
          const range: [number, number] = avg > 85 ? [3, 6] : avg > 65 ? [2, 5] : [1, 3];
          finalConfig = { ...config, bloomRange: range };
        } else {
          finalConfig = { ...config, bloomRange: [1, 3] }; // Default for new subjects
        }
      } catch {
        finalConfig = { ...config, bloomRange: [1, 3] };
      }
    }

    set({ showConfig: false });
    await get().generateQuiz(configSubject, configTopic, configContent, finalConfig, configChapterPath ?? undefined);
  },

  generateQuiz: async (subject, topic, chapterContent, config, chapterPath) => {
    const cfg = config || get().config;
    const cleanContent = stripStudyMetaSections(chapterContent);
    set({ generating: true, subject, topic, sourceChapterPath: chapterPath ?? null, error: null, summary: null, generatedCards: 0 });
    try {
      const typeList = buildTypePrompt(cfg.types);
      const typeNames = cfg.types.map((t) => `"${t}"`).join(", ");

      const contentLimit = cfg.questionCount > 10 ? 8000 : cfg.questionCount > 5 ? 6000 : 4000;
      const { text } = await aiRequest(
        "quiz_generate",
        `Generate exactly ${cfg.questionCount} quiz questions. Types: ${typeNames}. Bloom ${cfg.bloomRange[0]}-${cfg.bloomRange[1]}. Output ONLY a JSON array:
[{"question":"...","bloomLevel":2,"type":"free-recall"},{"question":"...","bloomLevel":1,"type":"multiple-choice","options":["A","B","C","D"],"correctAnswer":"B"}]
${typeList}${cfg.types.includes("code") ? '\nCode questions: For SQL, include a "setupSql" field with CREATE TABLE and INSERT INTO statements so the user can run their query against real data. Include "correctAnswer" with the expected SQL query. For Python, include a "setupCode" field with any imports or test data, an "expectedOutput" field with the expected stdout, and "correctAnswer" with the solution code. For pseudocode, include "correctAnswer".' : ""}`,
        `Subject: ${subject}\nTopic: ${topic}\n\nContent:\n${cleanContent.slice(0, contentLimit)}`,
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
        setupSql: (q as Record<string, unknown>).setupSql as string | undefined,
        setupCode: (q as Record<string, unknown>).setupCode as string | undefined,
        expectedOutput: (q as Record<string, unknown>).expectedOutput as string | undefined,
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
        configChapterPath: chapterPath ?? null,
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
      let eligibleCount = 0;
      for (const f of files) {
        try {
          const raw = await readFile(f.file_path);
          const { content, frontmatter } = parseFrontmatter(raw);
          const eligible = frontmatter.status === "digested" || hasCompletedSynthesis(raw);
          if (!eligible) continue;
          eligibleCount++;
          combinedContent += `\n\n--- Chapter: ${f.file_path.split("/").pop()?.replace(".md", "")} ---\n\n${stripStudyMetaSections(content)}`;
        } catch { /* skip */ }
      }
      if (!combinedContent.trim() || eligibleCount === 0) {
        set({ generating: false, error: "No synthesized chapters are ready for a subject quiz yet." });
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
      feedback = correct ? "Correct!" : null;
    } else if (question.type === "true-false" && question.correctAnswer) {
      correct = answer.toLowerCase() === question.correctAnswer.toLowerCase();
      feedback = correct ? "Correct!" : null;
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
          ? `\nLanguage: ${question.language || "unknown"}\nIf the answer is wrong, explicitly classify the problem as conceptual misunderstanding, incomplete solution, or invalid syntax / malformed query.`
          : "";
        const evaluationGoal = correct === false
          ? "The student's answer is already known to be incorrect. Explain specifically why it is incorrect, what misconception or mismatch caused the mistake, and why the correct answer is right."
          : "Decide whether the student's answer is correct, then explain what they got right or wrong. If wrong, explain the mismatch and why the correct answer is right.";
        const { text } = await aiRequest(
          "quiz_evaluate",
          `You are evaluating a student's quiz answer. Respond with ONLY JSON:
{"correct": true, "feedback": "3-5 sentences explaining what was right or wrong, the misconception or mismatch if wrong, and why the correct answer is right", "correctAnswer": "the actual correct answer to the question"}${codeContext}
${evaluationGoal}
If the answer is incorrect, the feedback must say what was wrong about the student's answer, not just state the correct answer.
Always include "correctAnswer" with the real, complete answer to the question.`,
          `Question (Bloom Level ${question.bloomLevel}): ${question.question}\nStudent's answer: ${answer}${question.correctAnswer ? `\nExpected answer: ${question.correctAnswer}` : ""}`,
          700,
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
        if (feedback === null && correct === false && question.correctAnswer) {
          feedback = `Incorrect. Your answer does not match the expected answer. The mismatch is that you gave a different result than the chapter expects. Correct answer: ${question.correctAnswer}`;
        } else if (feedback === null) {
          feedback = "AI evaluation unavailable.";
        }
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
        const d = localDateString();
        const now = localDateTimeString();
        const ts = Date.now();
        const subjectSlug = slugify(subject);
        const topicSlug = slugify(topic);
        const filePath = `subjects/${subjectSlug}/quizzes/${topicSlug}-${d}-${ts}.md`;
        const correctCount = questions.filter((q) => q.correct === true).length;
        const pct = Math.round((correctCount / questions.length) * 100);
        const { sourceChapterPath } = get();

        const lines = [
          "---", `subject: ${subject}`, `topic: ${topic}`, "type: quiz",
          `created_at: ${now}`, `score: ${pct}`,
          ...(sourceChapterPath ? [`source_chapter: ${sourceChapterPath}`] : []),
          "---", "",
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
            "quiz_wrong_answer_summary",
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
        sourceChapterPath: typeof frontmatter.source_chapter === "string" ? frontmatter.source_chapter : null,
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

  runPythonCode: async (code) => {
    const { questions, currentIndex } = get();
    const question = questions[currentIndex];
    set({ pythonRunning: true, pythonResult: null });
    try {
      const result = await runPython(code, question?.setupCode);
      set({ pythonResult: result, pythonRunning: false });
    } catch (e) {
      set({
        pythonResult: { stdout: "", stderr: e instanceof Error ? e.message : String(e), error: String(e) },
        pythonRunning: false,
      });
    }
  },

  runSandboxQuery: async (query) => {
    const { activeSandboxId } = get();
    if (!activeSandboxId) {
      set({ sandboxError: "No sandbox active. Schema may not have loaded." });
      return;
    }
    set({ sandboxError: null, sandboxResult: null });
    try {
      const result = await executeSandboxQuery(activeSandboxId, query);
      set({ sandboxResult: result });
    } catch (e) {
      set({ sandboxError: e instanceof Error ? e.message : String(e) });
    }
  },

  setupSandbox: async (setupSql) => {
    // Destroy existing sandbox if any
    const { activeSandboxId } = get();
    if (activeSandboxId) {
      try { await destroySandbox(activeSandboxId); } catch { /* */ }
    }
    try {
      const id = await createSandbox(setupSql);
      set({ activeSandboxId: id, sandboxResult: null, sandboxError: null });
    } catch (e) {
      set({ sandboxError: `Failed to create sandbox: ${e instanceof Error ? e.message : String(e)}` });
    }
  },

  resetQuiz: () => {
    // Clean up sandbox if active
    const { activeSandboxId } = get();
    if (activeSandboxId) {
      destroySandbox(activeSandboxId).catch(() => {});
    }
    set({
      subject: null, topic: null, questions: [],
      sourceChapterPath: null,
      currentIndex: 0, loading: false, generating: false,
      showFeedback: false, sessionComplete: false, error: null,
      summary: null, generatedCards: 0,
      configSubject: null, configTopic: null, configContent: null, configChapterPath: null, showConfig: false,
      activeSandboxId: null, sandboxResult: null, sandboxError: null,
      pythonResult: null, pythonRunning: false,
    });
  },
}));
