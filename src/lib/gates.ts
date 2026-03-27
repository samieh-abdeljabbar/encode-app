import type { GatePromptType, GateResponse, GateSubQuestion } from "./types";
import {
  buildStudyMetaContent,
  splitFrontmatter,
  splitStudyMetaSections,
} from "./synthesis";

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
  // Never skip if an apply or analyze question hasn't been answered yet
  const hasDeepQuestion = subQuestions.some((sq) => sq.promptType === "apply" || sq.promptType === "analyze");
  if (!hasDeepQuestion) return false;
  return subQuestions.every((sq) => sq.mastery !== null && sq.mastery >= 4);
}

/**
 * Format gate responses as markdown to append to the file.
 */
export function formatDigestionMarkdown(responses: GateResponse[]): string {
  if (responses.length === 0) return "";

  const lines = ["## Digestion", ""];

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

function normalizePromptType(label: string): GatePromptType {
  const lower = label.trim().toLowerCase();
  if (lower === "recall" || lower === "explain" || lower === "apply" || lower === "analyze") {
    return lower;
  }
  return "explain";
}

function readField(block: string, label: string, lookahead: string[]): string {
  const next = lookahead.length > 0 ? `(?=\\n(?:${lookahead.join("|")})|$)` : "(?=$)";
  const pattern = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)${next}`, "m");
  return block.match(pattern)?.[1]?.trim() || "";
}

export function extractDigestion(raw: string): GateResponse[] {
  const { content } = splitFrontmatter(raw);
  const sections = splitStudyMetaSections(content);
  const digestion = sections.digestion?.trim();
  if (!digestion) return [];

  const responses: GateResponse[] = [];
  const gatePattern = /(?:^|\n)### Gate (\d+)\s*\n([\s\S]*?)(?=(?:\n### Gate \d+\s*\n)|$)/g;

  for (const gateMatch of digestion.matchAll(gatePattern)) {
    const sectionIndex = parseInt(gateMatch[1], 10);
    if (Number.isNaN(sectionIndex)) continue;

    const gateBlock = gateMatch[2].trim();
    const timestamp = gateBlock.match(/\*\((.+)\)\*\s*$/)?.[1]?.trim() || "";
    const body = gateBlock.replace(/\n?\*\((.+)\)\*\s*$/m, "").trim();
    const subQuestions: GateSubQuestion[] = [];
    const questionPattern = /(?:^|\n)\*\*Q\d+ \(([^)]+)\):\*\*\n([\s\S]*?)(?=(?:\n\*\*Q\d+ \([^)]+\):\*\*\n)|$)/g;

    for (const questionMatch of body.matchAll(questionPattern)) {
      const promptType = normalizePromptType(questionMatch[1]);
      const questionBlock = questionMatch[2].trim();
      const prompt = readField(questionBlock, "Prompt", ["\\*\\*Response:\\*\\*"]);
      const response = readField(questionBlock, "Response", ["\\*\\*AI Feedback:\\*\\*", "\\*\\*Mastery:\\*\\*"]);
      if (!prompt || !response) continue;

      const feedback = readField(questionBlock, "AI Feedback", ["\\*\\*Mastery:\\*\\*"]) || null;
      const masteryMatch = questionBlock.match(/\*\*Mastery:\*\*\s*(\d+)\/5\b/);

      subQuestions.push({
        promptType,
        prompt,
        response,
        feedback,
        mastery: masteryMatch ? parseInt(masteryMatch[1], 10) : null,
      });
    }

    if (subQuestions.length === 0) continue;
    responses.push({ sectionIndex, subQuestions, timestamp });
  }

  return responses.sort((a, b) => a.sectionIndex - b.sectionIndex);
}

export function upsertDigestion(raw: string, responses: GateResponse[]): string {
  const { frontmatter, content } = splitFrontmatter(raw);
  const sections = splitStudyMetaSections(content);
  sections.digestion = responses.length > 0
    ? formatDigestionMarkdown(responses).replace(/^## Digestion\s*\n?/, "").trim()
    : null;

  const nextContent = buildStudyMetaContent(sections);
  return frontmatter ? `${frontmatter}${nextContent}` : nextContent;
}

export function mergeGateResponses(
  existing: GateResponse[],
  nextResponse: GateResponse,
): GateResponse[] {
  const merged = new Map<number, GateResponse>();
  for (const response of existing) {
    merged.set(response.sectionIndex, response);
  }
  merged.set(nextResponse.sectionIndex, nextResponse);
  return [...merged.values()].sort((a, b) => a.sectionIndex - b.sectionIndex);
}
