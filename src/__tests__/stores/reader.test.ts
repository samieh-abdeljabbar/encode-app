import { beforeEach, describe, expect, it, vi } from "vitest";

const { files, aiRequestMock, getConfigMock, readFileMock, writeFileMock } = vi.hoisted(() => {
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
  };
});

vi.mock("../../lib/tauri", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  aiRequest: aiRequestMock,
  getConfig: getConfigMock,
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
    useReaderStore.setState({
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
});
