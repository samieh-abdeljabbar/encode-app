import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeFileMock, recordQuizResultMock, aiRequestMock, createCardMock } = vi.hoisted(() => ({
  writeFileMock: vi.fn(),
  recordQuizResultMock: vi.fn(),
  aiRequestMock: vi.fn(),
  createCardMock: vi.fn(),
}));

vi.mock("../../lib/tauri", () => ({
  aiRequest: aiRequestMock,
  writeFile: writeFileMock,
  recordQuizResult: recordQuizResultMock,
  listFiles: vi.fn(),
  readFile: vi.fn(),
  createSandbox: vi.fn(),
  executeSandboxQuery: vi.fn(),
  destroySandbox: vi.fn(),
  getSubjectGrades: vi.fn(async () => []),
}));

vi.mock("../../stores/flashcard", () => ({
  useFlashcardStore: {
    getState: () => ({
      createCard: createCardMock,
    }),
  },
}));

import { useQuizStore } from "../../stores/quiz";

function seedCompletedQuestion() {
  useQuizStore.setState({
    subject: "D426 Data Management",
    topic: "Normalization",
    sourceChapterPath: "subjects/data-management/chapters/normalization.md",
    questions: [{
      id: "q-1",
      question: "What does first normal form require?",
      bloomLevel: 2,
      type: "free-recall",
      userAnswer: "Atomic values.",
      feedback: "Correct.",
      correct: false,
      correctAnswer: "Atomic values with no repeating groups.",
      flagged: false,
    }],
    currentIndex: 0,
    showFeedback: true,
    sessionComplete: false,
    error: null,
    completionWarning: null,
    completing: false,
    summary: null,
    generatedCards: 0,
    resultFilePath: null,
  });
}

describe("quiz completion durability", () => {
  beforeEach(() => {
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    recordQuizResultMock.mockReset();
    recordQuizResultMock.mockResolvedValue(undefined);
    aiRequestMock.mockReset();
    aiRequestMock.mockResolvedValue({ text: "- Review normalization rules.", provider: "test", model: "test" });
    createCardMock.mockReset();
    createCardMock.mockResolvedValue(undefined);
    useQuizStore.getState().resetQuiz();
  });

  it("blocks completion when the markdown quiz file cannot be saved", async () => {
    seedCompletedQuestion();
    writeFileMock.mockRejectedValueOnce(new Error("disk full"));

    await useQuizStore.getState().nextQuestion();

    const state = useQuizStore.getState();
    expect(state.sessionComplete).toBe(false);
    expect(state.completing).toBe(false);
    expect(state.error).toContain("Failed to save quiz results");
  });

  it("surfaces derivative-write warnings without losing the quiz artifact", async () => {
    seedCompletedQuestion();
    recordQuizResultMock.mockRejectedValueOnce(new Error("db offline"));
    createCardMock.mockRejectedValueOnce(new Error("card write failed"));

    await useQuizStore.getState().nextQuestion();

    const state = useQuizStore.getState();
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(state.sessionComplete).toBe(true);
    expect(state.completionWarning).toContain("grade history failed to update");
    expect(state.completionWarning).toContain("review cards could not be created");
  });

  it("retries the same result file path after an initial save failure", async () => {
    seedCompletedQuestion();
    writeFileMock
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);

    await useQuizStore.getState().nextQuestion();
    const firstPath = useQuizStore.getState().resultFilePath;

    await useQuizStore.getState().nextQuestion();
    const secondPath = useQuizStore.getState().resultFilePath;

    expect(firstPath).toBeTruthy();
    expect(secondPath).toBe(firstPath);
    expect(writeFileMock.mock.calls[0]?.[0]).toBe(firstPath);
    expect(writeFileMock.mock.calls[1]?.[0]).toBe(firstPath);
    expect(useQuizStore.getState().sessionComplete).toBe(true);
  });
});
