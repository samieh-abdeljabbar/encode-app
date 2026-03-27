import { describe, expect, it } from "vitest";
import { extractDigestion, formatDigestionMarkdown, upsertDigestion } from "../../lib/gates";
import type { GateResponse } from "../../lib/types";
import {
  extractSchemaActivation,
  extractSynthesis,
  stripStudyMetaSections,
  upsertSchemaActivation,
  upsertSynthesis,
} from "../../lib/synthesis";

const baseChapter = [
  "---",
  "subject: D426 Data Management",
  "topic: Normalization",
  "type: chapter",
  "---",
  "",
  "# Normalization",
  "",
  "Main body content.",
].join("\n");

const digestionResponses: GateResponse[] = [
  {
    sectionIndex: 1,
    timestamp: "03/27/2026, 8:33 PM",
    subQuestions: [
      {
        promptType: "recall",
        prompt: "What is first normal form?",
        response: "Each column holds atomic values.",
        feedback: "Good.",
        mastery: 4,
      },
    ],
  },
];

describe("study meta helpers", () => {
  it("round-trips digestion entries", () => {
    const raw = upsertDigestion(baseChapter, digestionResponses);
    expect(extractDigestion(raw)).toEqual(digestionResponses);
  });

  it("keeps digestion before synthesis when synthesis already exists", () => {
    const withSynthesis = upsertSynthesis(baseChapter, {
      prompt: "Connect the chapter.",
      response: "A normalized design reduces duplication.",
      evaluation: "Strong throughline.",
      completedAt: "03/27/2026, 8:40 PM",
    });

    const withBoth = upsertDigestion(withSynthesis, digestionResponses);
    const digestionIndex = withBoth.indexOf("## Digestion");
    const synthesisIndex = withBoth.indexOf("## Synthesis");

    expect(digestionIndex).toBeGreaterThan(-1);
    expect(synthesisIndex).toBeGreaterThan(-1);
    expect(digestionIndex).toBeLessThan(synthesisIndex);
    expect(extractSynthesis(withBoth)?.response).toBe("A normalized design reduces duplication.");
  });

  it("keeps synthesis when digestion already exists", () => {
    const withDigestion = upsertDigestion(baseChapter, digestionResponses);
    const withBoth = upsertSynthesis(withDigestion, {
      prompt: "Connect the chapter.",
      response: "Normalization organizes tables around dependencies.",
      evaluation: "Solid.",
      completedAt: "03/27/2026, 8:41 PM",
    });

    expect(extractDigestion(withBoth)).toEqual(digestionResponses);
    expect(extractSynthesis(withBoth)?.response).toBe("Normalization organizes tables around dependencies.");
  });

  it("round-trips schema activation entries", () => {
    const raw = upsertSchemaActivation(baseChapter, {
      prompt: "What do you already know about normalization?",
      response: "It reduces duplicate data.",
      completedAt: "03/27/2026, 8:20 PM",
    });

    expect(extractSchemaActivation(raw)).toEqual({
      prompt: "What do you already know about normalization?",
      response: "It reduces duplicate data.",
      completedAt: "03/27/2026, 8:20 PM",
    });
  });

  it("strips schema activation, digestion, and synthesis while preserving body", () => {
    const withSchema = upsertSchemaActivation(baseChapter, {
      prompt: "What do you already know about normalization?",
      response: "It reduces duplicate data.",
      completedAt: "03/27/2026, 8:20 PM",
    });
    const withDigestion = upsertDigestion(withSchema, digestionResponses);
    const withAll = upsertSynthesis(withDigestion, {
      prompt: "Connect the chapter.",
      response: "Normalization organizes data.",
      evaluation: "Solid.",
      completedAt: "03/27/2026, 8:40 PM",
    });

    expect(stripStudyMetaSections(withAll)).toContain("# Normalization");
    expect(stripStudyMetaSections(withAll)).toContain("Main body content.");
    expect(stripStudyMetaSections(withAll)).not.toContain("## Schema Activation");
    expect(stripStudyMetaSections(withAll)).not.toContain("## Digestion");
    expect(stripStudyMetaSections(withAll)).not.toContain("## Synthesis");
  });

  it("formats digestion markdown without losing gate labels", () => {
    const markdown = formatDigestionMarkdown(digestionResponses);
    expect(markdown).toContain("## Digestion");
    expect(markdown).toContain("### Gate 1");
    expect(markdown).toContain("**Q1 (Recall):**");
  });
});
