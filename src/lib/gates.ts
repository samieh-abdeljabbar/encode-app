import type { GatePromptType, GateResponse } from "./types";

interface GatePrompt {
  type: GatePromptType;
  prompt: string;
}

const GATE_PROMPTS: GatePrompt[] = [
  { type: "summarize", prompt: "Explain what you just read in one sentence." },
  {
    type: "connect",
    prompt: "How does this relate to something you already know?",
  },
  {
    type: "predict",
    prompt: "What do you think comes next and why?",
  },
  {
    type: "apply",
    prompt: "Where in real life could you use this?",
  },
];

/**
 * Get the gate prompt for a given section index.
 * Rotates through summarize → connect → predict → apply.
 * Section 0 is typically skipped (title/intro), so gating starts at index 1.
 */
export function getGatePrompt(sectionIndex: number): GatePrompt {
  // Rotate through the 4 prompts
  const promptIndex = (sectionIndex - 1) % GATE_PROMPTS.length;
  const idx = promptIndex < 0 ? 0 : promptIndex;
  return GATE_PROMPTS[idx];
}

/**
 * Format gate responses as a markdown block to append to the file.
 */
export function formatDigestionMarkdown(responses: GateResponse[]): string {
  if (responses.length === 0) return "";

  const lines = ["\n\n## Digestion\n"];

  for (const r of responses) {
    const label = r.promptType.charAt(0).toUpperCase() + r.promptType.slice(1);
    lines.push(`**Gate ${r.sectionIndex} (${label}):**`);
    lines.push(`**Prompt:** ${r.prompt}`);
    lines.push(`**Response:** ${r.response}`);
    if (r.feedback) {
      lines.push(`**AI Feedback:** ${r.feedback}`);
    }
    if (r.mastery !== null && r.mastery !== undefined) {
      const masteryLabel = r.mastery <= 1 ? "Needs work" : r.mastery === 2 ? "Partial" : "Solid";
      lines.push(`**Mastery:** ${r.mastery}/3 (${masteryLabel})`);
    }
    if (r.followUp && r.followUpResponse) {
      lines.push(`**Follow-up:** ${r.followUp}`);
      lines.push(`**Follow-up Response:** ${r.followUpResponse}`);
    }
    lines.push(`*(${r.timestamp})*\n`);
  }

  return lines.join("\n");
}

/**
 * Check if a section should have a gate.
 * Skip very short sections (title-only) and section 0 (intro/title).
 */
export function shouldGateSection(
  sectionIndex: number,
  sectionContent: string,
): boolean {
  if (sectionIndex === 0) return false;
  // Skip sections with less than 20 words of content
  const wordCount = sectionContent.trim().split(/\s+/).length;
  return wordCount >= 20;
}
