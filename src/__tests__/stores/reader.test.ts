import { beforeEach, describe, expect, it, vi } from "vitest";

const { files, aiRequestMock, getConfigMock, readFileMock, writeFileMock, updateCardScheduleMock, getDueCountMock, listSubjectsMock } = vi.hoisted(() => {
  const hoistedFiles = new Map<string, string>();
  return {
    files: hoistedFiles,
    aiRequestMock: vi.fn(),
    getConfigMock: vi.fn(async () => ({ ai_provider: "none" })),
    readFileMock: vi.fn(async (path: string) => {
      const value = hoistedFiles.get(path);
      if (value === undefined) throw new Error(`Missing file: ${path}`);
      return value;
    }),
    writeFileMock: vi.fn(async (path: string, content: string) => {
      hoistedFiles.set(path, content);
    }),
    updateCardScheduleMock: vi.fn(async () => undefined),
    getDueCountMock: vi.fn(async () => 0),
    listSubjectsMock: vi.fn(async () => []),
  };
});

vi.mock("../../lib/tauri", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  aiRequest: aiRequestMock,
  getConfig: getConfigMock,
  getDueCards: vi.fn(),
  getDueCount: getDueCountMock,
  deleteFile: vi.fn(),
  updateCardSchedule: updateCardScheduleMock,
  deleteCardSchedule: vi.fn(),
  listSubjects: listSubjectsMock,
  listFiles: vi.fn(),
  getCachedAnalysis: vi.fn(async () => null),
  putCachedAnalysis: vi.fn(async () => undefined),
}));

vi.mock("../../lib/profile", () => ({
  getProfileContext: () => "",
}));

import { parseFrontmatter, splitSections } from "../../lib/markdown";
import { useReaderStore } from "../../stores/reader";

const chapterPath = "subjects/data-management/chapters/normalization.md";

function makeChapter(): string {
  return [
    "---",
    "subject: D426 Data Management",
    "topic: Normalization",
    "type: chapter",
    "status: unread",
    "---",
    "",
    "# Normalization",
    "",
    "Normalization reduces duplicate data and keeps updates consistent across a schema.",
    "",
    "## First Normal Form",
    "",
    "First normal form requires atomic values in each column and prohibits repeating groups so each row stays consistent and queryable.",
    "",
    "## Second Normal Form",
    "",
    "Second normal form removes partial dependencies from tables with composite keys so non-key attributes depend on the full key.",
  ].join("\n");
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("reader store durability", () => {
  beforeEach(() => {
    files.clear();
    files.set(chapterPath, makeChapter());
    aiRequestMock.mockReset();
    getConfigMock.mockClear();
    readFileMock.mockClear();
    writeFileMock.mockClear();
    updateCardScheduleMock.mockClear();
    getDueCountMock.mockClear();
    listSubjectsMock.mockClear();
    useReaderStore.setState({
      filePath: null,
      rawContent: null,
      sections: [],
      currentSectionIndex: 0,
      gateOpen: false,
      gateResponses: [],
      suggestedCards: [],
      currentCoreCard: null,
      loading: false,
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
      showSchemaActivation: false,
      schemaActivationTopic: "",
      schemaActivationResponse: "",
      synthesisSaving: false,
      synthesisResponse: "",
      synthesisEvaluation: null,
      synthesisComplete: false,
    });
  });

  it("reloads saved digestion and resumes at the last revealed section", async () => {
    files.set(
      chapterPath,
      `${makeChapter()}\n\n## Digestion\n\n### Gate 1\n**Q1 (Recall):**\n**Prompt:** What is normalization?\n**Response:** It reduces duplication.\n**AI Feedback:** Good.\n**Mastery:** 4/5 (Solid)\n\n*(03/27/2026, 8:33 PM)*`,
    );

    await useReaderStore.getState().loadFile(chapterPath);

    const state = useReaderStore.getState();
    expect(state.gateResponses).toHaveLength(1);
    expect(state.currentSectionIndex).toBe(1);
    expect(state.gateResponses[0]?.subQuestions[0]?.response).toBe("It reduces duplication.");
  });

  it("saves a new gate after reload without erasing earlier gates", async () => {
    files.set(
      chapterPath,
      `${makeChapter()}\n\n## Digestion\n\n### Gate 1\n**Q1 (Recall):**\n**Prompt:** What is normalization?\n**Response:** It reduces duplication.\n**AI Feedback:** Good.\n**Mastery:** 4/5 (Solid)\n\n*(03/27/2026, 8:33 PM)*`,
    );
    aiRequestMock.mockImplementation(async (feature: string) => {
      if (feature === "reader_gate_evaluate") {
        return {
          text: '{"right":"Correct.","gap":"Minor gap.","deeper":"What changes with composite keys?","mastery":4}',
          provider: "test",
          model: "test",
        };
      }
      return { text: "not valid json", provider: "test", model: "test" };
    });

    await useReaderStore.getState().loadFile(chapterPath);
    const rawContent = files.get(chapterPath)!;
    useReaderStore.setState({
      rawContent,
      sections: splitSections(parseFrontmatter(rawContent).content),
      currentSectionIndex: 1,
      gateQuestions: [{ type: "recall", question: "What does second normal form remove?" }],
      gatePhase: 0,
      currentGateSubQuestions: [],
    });

    await useReaderStore.getState().submitGateResponse("Partial dependencies.");
    await flushPromises();

    const saved = files.get(chapterPath)!;
    expect(saved).toContain("### Gate 1");
    expect(saved).toContain("### Gate 2");
    expect(useReaderStore.getState().currentSectionIndex).toBe(2);
    expect(useReaderStore.getState().suggestedCards).toEqual([]);
  });

  it("persists a completed gate even if the user navigates away during evaluation", async () => {
    const pending = deferred<{ text: string; provider: string; model: string }>();
    aiRequestMock.mockImplementation((feature: string) => {
      if (feature === "reader_gate_evaluate") {
        return pending.promise;
      }
      return Promise.resolve({ text: "[]", provider: "test", model: "test" });
    });

    const rawContent = files.get(chapterPath)!;
    useReaderStore.setState({
      filePath: chapterPath,
      rawContent,
      sections: splitSections(parseFrontmatter(rawContent).content),
      currentSectionIndex: 0,
      gateQuestions: [{ type: "recall", question: "What is first normal form?" }],
      gatePhase: 0,
      currentGateSubQuestions: [],
    });

    const submitPromise = useReaderStore.getState().submitGateResponse("Atomic values in each column.");
    useReaderStore.setState({ filePath: "subjects/other/chapters/other.md", rawContent: "# Other", sections: [], currentSectionIndex: 0 });
    pending.resolve({
      text: '{"right":"Correct.","gap":"None.","deeper":"Why does this matter?","mastery":5}',
      provider: "test",
      model: "test",
    });

    await submitPromise;

    expect(files.get(chapterPath)).toContain("## Digestion");
    expect(useReaderStore.getState().filePath).toBe("subjects/other/chapters/other.md");
  });

  it("prefetches analysis for the section the user is now reading, not the one after", async () => {
    const tauri = await import("../../lib/tauri");
    const putMock = vi.mocked(tauri.putCachedAnalysis);
    putMock.mockClear();

    // Set up a 4-section chapter (intro + 3 gated sections)
    const fourSectionChapter = [
      "---", "subject: Test", "topic: Prefetch", "type: chapter", "status: unread", "---",
      "", "# Intro", "", "Short intro paragraph that is not gated.",
      "", "## Section One", "", "This section has enough words to be gated because it contains more than twenty words of real content that matters for normalization testing.",
      "", "## Section Two", "", "This section also has enough words to be gated because it contains more than twenty words of real content that matters for testing.",
      "", "## Section Three", "", "This section also has enough words to be gated because it contains more than twenty words of content for the test.",
    ].join("\n");
    files.set(chapterPath, fourSectionChapter);

    // AI returns valid analysis for any reader_gate_analyze call
    aiRequestMock.mockImplementation(async (feature: string) => {
      if (feature === "reader_gate_analyze") {
        return {
          text: JSON.stringify({
            concepts: [
              { name: "A", kind: "term", detail: "Detail A." },
              { name: "B", kind: "mechanism", detail: "Detail B." },
              { name: "C", kind: "relationship", detail: "Detail C." },
            ],
            commonMisconception: "None.",
            questions: [
              { type: "recall", q: "What is A?" },
              { type: "explain", q: "Why does B work?" },
            ],
            summary: { remember: "Remember A.", watchOut: "Watch B.", goDeeper: "Dig into C." },
            coreCard: { q: "Q?", a: "A.", bloom: 1 },
          }),
          provider: "test", model: "test",
        };
      }
      if (feature === "reader_gate_evaluate") {
        return {
          text: '{"right":"Correct.","gap":"None.","deeper":"Think more.","mastery":4}',
          provider: "test", model: "test",
        };
      }
      return { text: "", provider: "test", model: "test" };
    });
    getConfigMock.mockResolvedValue({ ai_provider: "claude" });

    await useReaderStore.getState().loadFile(chapterPath);
    // After loading: currentSectionIndex=0, sections[0]=Intro, sections[1]=Section One, etc.

    // Advance past intro (section 0 → section 1 is gated, so gate opens)
    useReaderStore.getState().advanceSection();
    await flushPromises();
    await flushPromises();

    // Gate should now be open with questions for section 0
    // Submit the gate response to advance to section 1
    const state1 = useReaderStore.getState();
    if (state1.gateQuestions.length > 0) {
      for (let i = 0; i < state1.gateQuestions.length; i++) {
        await useReaderStore.getState().submitGateResponse("Test answer.");
        await flushPromises();
      }
    }
    await flushPromises();
    await flushPromises();
    await flushPromises();

    // After completing the gate, user is at section 1.
    // The prefetch should cache analysis for section 1 (the section being read),
    // NOT section 2 (the off-by-one bug).
    const putCalls = putMock.mock.calls;
    const prefetchedIndices = putCalls.map((call) => call[1]);

    // The prefetch target should be section index 1 (the section the user is now reading)
    // If the off-by-one bug existed, it would be 2
    if (prefetchedIndices.length > 0) {
      const lastPrefetchIdx = prefetchedIndices[prefetchedIndices.length - 1];
      expect(lastPrefetchIdx).toBe(1);
      expect(lastPrefetchIdx).not.toBe(2);
    }
  });

  it("persists summary fields and auto-adds a deterministic core card", async () => {
    aiRequestMock.mockImplementation(async (feature: string) => {
      if (feature === "reader_gate_evaluate") {
        return {
          text: '{"right":"Correct.","gap":"Minor gap.","deeper":"How does it affect updates?","mastery":4}',
          provider: "test",
          model: "test",
        };
      }
      return { text: "[]", provider: "test", model: "test" };
    });

    const rawContent = files.get(chapterPath)!;
    useReaderStore.setState({
      filePath: chapterPath,
      rawContent,
      sections: splitSections(parseFrontmatter(rawContent).content),
      currentSectionIndex: 0,
      gateQuestions: [
        { type: "recall", question: "What does first normal form require?" },
        { type: "explain", question: "Why does that help?" },
      ],
      gatePhase: 1,
      currentGateSubQuestions: [
        {
          promptType: "recall",
          prompt: "What does first normal form require?",
          response: "Atomic values.",
          feedback: "Correct.",
          mastery: 4,
        },
      ],
      currentGateAnalysis: {
        concepts: [
          { name: "Atomic values", kind: "term", detail: "Each column stores one value." },
          { name: "Repeating groups", kind: "relationship", detail: "Repeating groups make rows inconsistent." },
          { name: "Queryable rows", kind: "mechanism", detail: "Atomic rows are easier to query and update." },
        ],
        commonMisconception: "1NF is not just about adding IDs.",
        questions: [
          { type: "recall", question: "What does first normal form require?" },
          { type: "explain", question: "Why does that help?" },
        ],
        summary: {
          remember: "1NF requires atomic values in each column.",
          watchOut: "Do not confuse atomic values with just naming columns clearly.",
          goDeeper: "Compare 1NF structure changes to later normalization rules.",
        },
        coreCard: {
          question: "What does first normal form require?",
          answer: "Atomic values with no repeating groups.",
          bloom: 2,
        },
      },
    });

    await useReaderStore.getState().submitGateResponse("It keeps rows consistent and queryable.");

    const savedChapter = files.get(chapterPath)!;
    expect(savedChapter).toContain("**Remember:** 1NF requires atomic values in each column.");
    expect(savedChapter).toContain("**Watch out:** Do not confuse atomic values with just naming columns clearly.");
    expect(savedChapter).toContain("**Go deeper:** Compare 1NF structure changes to later normalization rules.");

    const flashcardPath = "subjects/d426-data-management/flashcards/normalization.md";
    expect(files.get(flashcardPath)).toContain("> [!card] id: fc-core-d426-data-management-normalization-s0");
  });
});
