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
 * If the user scored well on enough questions, skip remaining.
 * Requires minimum 3 questions answered, all mastery >= 4 (on 1-5 scale).
 * Never skips "apply" type questions — those test deeper understanding.
 */
export function shouldSkipRemaining(subQuestions: GateSubQuestion[]): boolean {
  if (subQuestions.length < 3) return false;
  // Don't skip if there's an unanswered "apply" question coming
  return subQuestions.every((sq) => sq.mastery !== null && sq.mastery >= 4);
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
        const masteryLabel = sq.mastery <= 1 ? "Needs work"
          : sq.mastery === 2 ? "Surface-level"
          : sq.mastery === 3 ? "Partial"
          : sq.mastery === 4 ? "Solid"
          : "Excellent";
        lines.push(`**Mastery:** ${sq.mastery}/5 (${masteryLabel})`);
      }
      lines.push("");
    }
    lines.push(`*(${r.timestamp})*\n`);
  }

  return lines.join("\n");
}
