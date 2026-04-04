import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BacklinksPanel } from "../components/notes/BacklinksPanel";
import { buildChapterMarkdown } from "../pages/ChapterView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("chapter markdown and backlinks", () => {
  it("prefers canonical chapter markdown when it exists", () => {
    const markdown = buildChapterMarkdown({
      chapter: {
        canonical_markdown: "## Canonical\n\nBody",
      } as unknown as Parameters<typeof buildChapterMarkdown>[0]["chapter"],
      sections: [
        {
          id: 1,
          section_index: 0,
          heading: "Ignored",
          body_markdown: "Should not be used",
          word_count: 3,
          status: "seen",
          prompt: "",
        },
      ],
      current_index: 0,
    } as unknown as Parameters<typeof buildChapterMarkdown>[0]);

    expect(markdown).toBe("## Canonical\n\nBody");
  });

  it("falls back to reconstructing markdown from sections", () => {
    const markdown = buildChapterMarkdown({
      sections: [
        {
          id: 1,
          section_index: 0,
          heading: "Intro",
          body_markdown: "First paragraph.",
          word_count: 2,
          status: "seen",
          prompt: "",
        },
      ],
      current_index: 0,
    } as unknown as Parameters<typeof buildChapterMarkdown>[0]);

    expect(markdown).toBe("## Intro\n\nFirst paragraph.");
  });

  it("navigates to a backlink target through the provided callback", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_backlinks") {
        return [
          {
            note_id: 42,
            title: "Reference note",
            context: "linked in a paragraph",
          },
        ];
      }

      throw new Error(`Unexpected invoke command: ${command}`);
    });

    const onToggle = vi.fn();
    const onNavigateToNote = vi.fn();

    render(
      <BacklinksPanel
        noteId={7}
        collapsed={false}
        onToggle={onToggle}
        onNavigateToNote={onNavigateToNote}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Reference note")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /reference note/i }));
    expect(onNavigateToNote).toHaveBeenCalledWith(42);
  });
});
