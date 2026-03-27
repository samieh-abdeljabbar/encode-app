export interface SynthesisEntry {
  prompt: string;
  response: string;
  evaluation: string | null;
  completedAt: string;
}

const SYNTHESIS_HEADING = "## Synthesis";

function splitFrontmatter(raw: string): { frontmatter: string; content: string } {
  const match = raw.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/);
  if (!match) {
    return { frontmatter: "", content: raw };
  }
  return { frontmatter: match[1], content: match[2] };
}

function stripSynthesisSection(content: string): string {
  return content.replace(/\n*## Synthesis\n[\s\S]*$/m, "").trimEnd();
}

export function stripStudyMetaSections(content: string): string {
  const withoutSynthesis = stripSynthesisSection(content);
  return withoutSynthesis.replace(/\n*## Digestion\n[\s\S]*$/m, "").trimEnd();
}

export function extractSynthesis(raw: string): SynthesisEntry | null {
  const { content } = splitFrontmatter(raw);
  const match = content.match(/(?:^|\n)## Synthesis\n([\s\S]*)$/m);
  if (!match) return null;

  const block = match[1];
  const prompt = block.match(/\*\*Prompt:\*\*\s*(.+)/)?.[1]?.trim() || "";
  const response = block.match(/\*\*Response:\*\*\s*([\s\S]*?)(?=\n\*\*AI Evaluation:\*\*|\n\*\(.+\)\*|\s*$)/)?.[1]?.trim() || "";
  const evaluationMatch = block.match(/\*\*AI Evaluation:\*\*\s*([\s\S]*?)(?=\n\*\(.+\)\*|\s*$)/);
  const completedAt = block.match(/\*\((.+)\)\*/)?.[1]?.trim() || "";

  if (!response) return null;

  return {
    prompt: prompt || "Connect the key ideas from this chapter.",
    response,
    evaluation: evaluationMatch?.[1]?.trim() || null,
    completedAt,
  };
}

export function upsertSynthesis(raw: string, entry: SynthesisEntry): string {
  const { frontmatter, content } = splitFrontmatter(raw);
  const baseContent = stripSynthesisSection(content);
  const section = [
    SYNTHESIS_HEADING,
    "",
    `**Prompt:** ${entry.prompt.trim()}`,
    `**Response:** ${entry.response.trim()}`,
    `**AI Evaluation:** ${(entry.evaluation || "AI evaluation unavailable.").trim()}`,
    `*(${entry.completedAt})*`,
  ].join("\n");

  const nextContent = [baseContent.trimEnd(), "", section].join("\n").trimStart();
  return `${frontmatter}${nextContent}`;
}

export function hasCompletedSynthesis(raw: string): boolean {
  return extractSynthesis(raw) !== null;
}
