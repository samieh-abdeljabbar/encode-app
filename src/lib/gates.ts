import type { GateResponse, GateSubQuestion } from "./types";

/**
 * Check if a section should have a gate.
 * Skip very short sections (title-only) and section 0 (intro/title).
 */
export function shouldGateSection(
  sectionIndex: number,
  sectionContent: string,
): boolean {
  if (sectionIndex === 0) return false;
  const wordCount = sectionContent.trim().split(/\s+/).length;
  return wordCount >= 20;
}

/**
 * If the user scored mastery 3 on all answered sub-questions, skip remaining questions.
 */
export function shouldSkipRemaining(subQuestions: GateSubQuestion[]): boolean {
  if (subQuestions.length < 2) return false;
  return subQuestions.every((sq) => sq.mastery !== null && sq.mastery >= 3);
}

/**
 * Format gate responses as markdown to append to the file.
 */
export function formatDigestionMarkdown(responses: GateResponse[]): string {
  if (responses.length === 0) return "";

  const lines = ["\n\n## Digestion\n"];

  for (const r of responses) {
    lines.push(`### Gate ${r.sectionIndex}\n`);
    for (let i = 0; i < r.subQuestions.length; i++) {
      const sq = r.subQuestions[i];
      const label = sq.promptType.charAt(0).toUpperCase() + sq.promptType.slice(1);
      lines.push(`**Q${i + 1} (${label}):**`);
      lines.push(`**Prompt:** ${sq.prompt}`);
      lines.push(`**Response:** ${sq.response}`);
      if (sq.feedback) {
        lines.push(`**AI Feedback:** ${sq.feedback}`);
      }
      if (sq.mastery !== null) {
        const masteryLabel = sq.mastery <= 1 ? "Needs work" : sq.mastery === 2 ? "Partial" : "Solid";
        lines.push(`**Mastery:** ${sq.mastery}/3 (${masteryLabel})`);
      }
      lines.push("");
    }
    lines.push(`*(${r.timestamp})*\n`);
  }

  return lines.join("\n");
}
