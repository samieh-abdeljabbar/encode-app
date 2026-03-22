import { describe, it, expect } from "vitest";
import {
  getGatePrompt,
  formatDigestionMarkdown,
  shouldGateSection,
} from "../../lib/gates";
import type { GateResponse } from "../../lib/types";

describe("getGatePrompt", () => {
  it("returns summarize for section 1", () => {
    const prompt = getGatePrompt(1);
    expect(prompt.type).toBe("summarize");
    expect(prompt.prompt).toContain("one sentence");
  });

  it("returns connect for section 2", () => {
    expect(getGatePrompt(2).type).toBe("connect");
  });

  it("returns predict for section 3", () => {
    expect(getGatePrompt(3).type).toBe("predict");
  });

  it("returns apply for section 4", () => {
    expect(getGatePrompt(4).type).toBe("apply");
  });

  it("rotates back to summarize for section 5", () => {
    expect(getGatePrompt(5).type).toBe("summarize");
  });
});

describe("formatDigestionMarkdown", () => {
  it("formats responses as markdown", () => {
    const responses: GateResponse[] = [
      {
        sectionIndex: 1,
        promptType: "summarize",
        prompt: "Explain what you just read in one sentence.",
        response: "2NF removes partial dependencies.",
        feedback: null,
        timestamp: "2026-03-21 7:12pm",
      },
    ];

    const md = formatDigestionMarkdown(responses);
    expect(md).toContain("## Digestion");
    expect(md).toContain("Gate 1 (Summarize)");
    expect(md).toContain("2NF removes partial dependencies.");
    expect(md).toContain("2026-03-21 7:12pm");
  });

  it("returns empty string for no responses", () => {
    expect(formatDigestionMarkdown([])).toBe("");
  });

  it("includes AI feedback when present", () => {
    const responses: GateResponse[] = [
      {
        sectionIndex: 1,
        promptType: "connect",
        prompt: "How does this relate?",
        response: "Like my store inventory.",
        feedback: "Good connection!",
        timestamp: "2026-03-21",
      },
    ];

    const md = formatDigestionMarkdown(responses);
    expect(md).toContain("**AI Feedback:** Good connection!");
  });
});

describe("shouldGateSection", () => {
  it("skips section 0", () => {
    expect(shouldGateSection(0, "Some content here that is long enough")).toBe(
      false,
    );
  });

  it("gates sections with enough content", () => {
    const content = "This is a section with enough words to warrant a digestion gate prompt for the user to answer and think about what they read.";
    expect(shouldGateSection(1, content)).toBe(true);
  });

  it("skips very short sections", () => {
    expect(shouldGateSection(1, "Just a title")).toBe(false);
  });
});
