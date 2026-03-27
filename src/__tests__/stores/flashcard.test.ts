import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock, writeFileMock, updateCardScheduleMock, getDueCountMock, listSubjectsMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  updateCardScheduleMock: vi.fn(),
  getDueCountMock: vi.fn(async () => 2),
  listSubjectsMock: vi.fn(async () => []),
}));

vi.mock("../../lib/tauri", () => ({
  getDueCards: vi.fn(),
  getDueCount: getDueCountMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  deleteFile: vi.fn(),
  updateCardSchedule: updateCardScheduleMock,
  deleteCardSchedule: vi.fn(),
  listSubjects: listSubjectsMock,
  listFiles: vi.fn(),
}));

import { useFlashcardStore } from "../../stores/flashcard";

describe("flashcard creation writes", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    writeFileMock.mockReset();
    updateCardScheduleMock.mockReset();
    getDueCountMock.mockClear();
    listSubjectsMock.mockClear();
  });

  it("writes reversed cards in a single file mutation", async () => {
    readFileMock.mockRejectedValueOnce(new Error("missing file"));
    writeFileMock.mockResolvedValue(undefined);
    updateCardScheduleMock.mockResolvedValue(undefined);

    await useFlashcardStore.getState().createCard(
      "D426 Data Management",
      "Normalization",
      "What does 1NF require?",
      "Atomic values.",
      2,
      "reversed",
    );

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const content = writeFileMock.mock.calls[0]?.[1] as string;
    expect(content.match(/>\s*\[!card\]/g)).toHaveLength(2);
    expect(content).toContain("> **Q:** What does 1NF require?");
    expect(content).toContain("> **Q:** Atomic values.");
    expect(updateCardScheduleMock).toHaveBeenCalledTimes(2);
  });

  it("preserves existing card content when appending a reversed pair", async () => {
    readFileMock.mockResolvedValueOnce([
      "---",
      "subject: D426 Data Management",
      "topic: Normalization",
      "type: flashcard",
      "---",
      "",
      "> [!card] id: fc-existing",
      "> **Q:** Existing",
      "> **A:** Existing answer",
    ].join("\n"));
    writeFileMock.mockResolvedValue(undefined);
    updateCardScheduleMock.mockResolvedValue(undefined);

    await useFlashcardStore.getState().createCard(
      "D426 Data Management",
      "Normalization",
      "New question",
      "New answer",
      3,
      "reversed",
    );

    const content = writeFileMock.mock.calls[0]?.[1] as string;
    expect(content).toContain("fc-existing");
    expect(content).toContain("> **Q:** New question");
    expect(content).toContain("> **Q:** New answer");
  });
});
