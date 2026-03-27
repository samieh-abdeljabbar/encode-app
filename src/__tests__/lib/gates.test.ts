import { describe, it, expect } from "vitest";
import {
  formatDigestionMarkdown,
  shouldGateSection,
  shouldSkipRemaining,
} from "../../lib/gates";
import type { GateResponse, GateSubQuestion } from "../../lib/types";

describe("formatDigestionMarkdown", () => {
  it("formats responses with sub-questions as markdown", () => {
    const responses: GateResponse[] = [
      {
        sectionIndex: 1,
        subQuestions: [
          {
            promptType: "recall",
            prompt: "What data type is the id column?",
            response: "Integer",
            feedback: "Correct!",
            mastery: 3,
          },
        ],
        remember: "Integer ids uniquely identify each row.",
        watchOut: "Do not confuse the id field with the entire record.",
        goDeeper: "Consider why surrogate keys simplify joins.",
        timestamp: "2026-03-21 7:12pm",
      },
    ];

    const md = formatDigestionMarkdown(responses);
    expect(md).toContain("## Digestion");
    expect(md).toContain("Gate 1");
    expect(md).toContain("Q1 (Recall)");
    expect(md).toContain("Integer");
    expect(md).toContain("**Remember:** Integer ids uniquely identify each row.");
    expect(md).toContain("2026-03-21 7:12pm");
  });

  it("returns empty string for no responses", () => {
    expect(formatDigestionMarkdown([])).toBe("");
  });

  it("includes AI feedback when present", () => {
    const responses: GateResponse[] = [
      {
        sectionIndex: 1,
        subQuestions: [
          {
            promptType: "explain",
            prompt: "How does this relate?",
            response: "Like my store inventory.",
            feedback: "Good connection!",
            mastery: 2,
          },
        ],
        timestamp: "2026-03-21",
      },
    ];

    const md = formatDigestionMarkdown(responses);
    expect(md).toContain("**AI Feedback:** Good connection!");
  });
});

describe("shouldGateSection", () => {
  it("skips section 0", () => {
    expect(shouldGateSection(0, "Some content here that is long enough")).toBe(false);
  });

  it("gates sections with enough content", () => {
    const content = "This is a section with enough words to warrant a digestion gate prompt for the user to answer and think about what they read.";
    expect(shouldGateSection(1, content)).toBe(true);
  });

  it("skips very short sections", () => {
    expect(shouldGateSection(1, "Just a title")).toBe(false);
  });
});

describe("shouldSkipRemaining", () => {
  it("returns false with fewer than 3 sub-questions", () => {
    const sqs: GateSubQuestion[] = [
      { promptType: "recall", prompt: "Q", response: "A", feedback: null, mastery: 3 },
    ];
    expect(shouldSkipRemaining(sqs)).toBe(false);
  });

  it("returns true when all mastery scores are 4+ and a deep question was answered", () => {
    const sqs: GateSubQuestion[] = [
      { promptType: "recall", prompt: "Q1", response: "A1", feedback: null, mastery: 4 },
      { promptType: "explain", prompt: "Q2", response: "A2", feedback: null, mastery: 4 },
      { promptType: "apply", prompt: "Q3", response: "A3", feedback: null, mastery: 4 },
    ];
    expect(shouldSkipRemaining(sqs)).toBe(true);
  });

  it("returns false when any mastery is below 4", () => {
    const sqs: GateSubQuestion[] = [
      { promptType: "recall", prompt: "Q1", response: "A1", feedback: null, mastery: 4 },
      { promptType: "explain", prompt: "Q2", response: "A2", feedback: null, mastery: 3 },
      { promptType: "apply", prompt: "Q3", response: "A3", feedback: null, mastery: 4 },
    ];
    expect(shouldSkipRemaining(sqs)).toBe(false);
  });

  it("returns false when no apply or analyze question has been answered", () => {
    const sqs: GateSubQuestion[] = [
      { promptType: "recall", prompt: "Q1", response: "A1", feedback: null, mastery: 5 },
      { promptType: "explain", prompt: "Q2", response: "A2", feedback: null, mastery: 5 },
      { promptType: "recall", prompt: "Q3", response: "A3", feedback: null, mastery: 5 },
    ];
    expect(shouldSkipRemaining(sqs)).toBe(false);
  });
});
