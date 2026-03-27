import type { SchemaActivationEntry } from "./types";

export interface SynthesisEntry {
  prompt: string;
  response: string;
  evaluation: string | null;
  completedAt: string;
}

type StudyMetaKey = "schemaActivation" | "digestion" | "synthesis";

export interface StudyMetaSections {
  body: string;
  schemaActivation: string | null;
  digestion: string | null;
  synthesis: string | null;
}

export const SCHEMA_ACTIVATION_HEADING = "## Schema Activation";
export const DIGESTION_HEADING = "## Digestion";
export const SYNTHESIS_HEADING = "## Synthesis";

const HEADING_BY_KEY: Record<StudyMetaKey, string> = {
  schemaActivation: SCHEMA_ACTIVATION_HEADING,
  digestion: DIGESTION_HEADING,
  synthesis: SYNTHESIS_HEADING,
};

function getStudyMetaKey(line: string): StudyMetaKey | null {
  const trimmed = line.trim();
  if (trimmed === SCHEMA_ACTIVATION_HEADING) return "schemaActivation";
  if (trimmed === DIGESTION_HEADING) return "digestion";
  if (trimmed === SYNTHESIS_HEADING) return "synthesis";
  return null;
}

function normalizeBlock(block: string | null): string | null {
  if (!block) return null;
  const trimmed = block.trim();
  return trimmed ? trimmed : null;
}

function readField(block: string, label: string, lookahead: string[]): string {
  const next = lookahead.length > 0 ? `(?=\\n(?:${lookahead.join("|")})|$)` : "(?=$)";
  const pattern = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)${next}`, "m");
  return block.match(pattern)?.[1]?.trim() || "";
}

function joinFrontmatterAndContent(frontmatter: string, content: string): string {
  const trimmedContent = content.trim();
  if (!frontmatter) return trimmedContent;
  return trimmedContent ? `${frontmatter}${trimmedContent}` : frontmatter.trimEnd();
}

export function splitFrontmatter(raw: string): { frontmatter: string; content: string } {
  const match = raw.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/);
  if (!match) {
    return { frontmatter: "", content: raw };
  }
  return { frontmatter: match[1], content: match[2] };
}

export function splitStudyMetaSections(content: string): StudyMetaSections {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const firstMetaIndex = lines.findIndex((line) => getStudyMetaKey(line) !== null);

  if (firstMetaIndex === -1) {
    return {
      body: normalized.trimEnd(),
      schemaActivation: null,
      digestion: null,
      synthesis: null,
    };
  }

  const sections: StudyMetaSections = {
    body: lines.slice(0, firstMetaIndex).join("\n").trimEnd(),
    schemaActivation: null,
    digestion: null,
    synthesis: null,
  };

  let currentKey: StudyMetaKey | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentKey) return;
    sections[currentKey] = normalizeBlock(currentLines.join("\n"));
    currentLines = [];
  };

  for (const line of lines.slice(firstMetaIndex)) {
    const nextKey = getStudyMetaKey(line);
    if (nextKey) {
      flush();
      currentKey = nextKey;
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }

  flush();
  return sections;
}

export function buildStudyMetaContent(sections: StudyMetaSections): string {
  const parts: string[] = [];
  const body = sections.body.trimEnd();

  if (body) {
    parts.push(body);
  }

  (["schemaActivation", "digestion", "synthesis"] as StudyMetaKey[]).forEach((key) => {
    const block = normalizeBlock(sections[key]);
    if (!block) return;
    parts.push([HEADING_BY_KEY[key], "", block].join("\n"));
  });

  return parts.join("\n\n").trim();
}

export function stripStudyMetaSections(content: string): string {
  return splitStudyMetaSections(content).body.trimEnd();
}

export function extractSchemaActivation(raw: string): SchemaActivationEntry | null {
  const { content } = splitFrontmatter(raw);
  const sections = splitStudyMetaSections(content);
  if (!sections.schemaActivation) return null;

  const response = readField(sections.schemaActivation, "Response", ["\\*\\(.+\\)\\*"]);
  if (!response) return null;

  return {
    prompt: readField(sections.schemaActivation, "Prompt", ["\\*\\*Response:\\*\\*"]) || "What do you already know about this topic?",
    response,
    completedAt: sections.schemaActivation.match(/\*\((.+)\)\*\s*$/)?.[1]?.trim() || "",
  };
}

export function upsertSchemaActivation(raw: string, entry: SchemaActivationEntry | null): string {
  const { frontmatter, content } = splitFrontmatter(raw);
  const sections = splitStudyMetaSections(content);
  sections.schemaActivation = entry
    ? [
      `**Prompt:** ${entry.prompt.trim()}`,
      `**Response:** ${entry.response.trim()}`,
      `*(${entry.completedAt})*`,
    ].join("\n")
    : null;

  return joinFrontmatterAndContent(frontmatter, buildStudyMetaContent(sections));
}

export function extractSynthesis(raw: string): SynthesisEntry | null {
  const { content } = splitFrontmatter(raw);
  const sections = splitStudyMetaSections(content);
  if (!sections.synthesis) return null;

  const response = readField(sections.synthesis, "Response", ["\\*\\*AI Evaluation:\\*\\*", "\\*\\(.+\\)\\*"]);
  if (!response) return null;

  const evaluation = readField(sections.synthesis, "AI Evaluation", ["\\*\\(.+\\)\\*"]);

  return {
    prompt: readField(sections.synthesis, "Prompt", ["\\*\\*Response:\\*\\*"]) || "Connect the key ideas from this chapter.",
    response,
    evaluation: evaluation || null,
    completedAt: sections.synthesis.match(/\*\((.+)\)\*\s*$/)?.[1]?.trim() || "",
  };
}

export function upsertSynthesis(raw: string, entry: SynthesisEntry): string {
  const { frontmatter, content } = splitFrontmatter(raw);
  const sections = splitStudyMetaSections(content);
  sections.synthesis = [
    `**Prompt:** ${entry.prompt.trim()}`,
    `**Response:** ${entry.response.trim()}`,
    `**AI Evaluation:** ${(entry.evaluation || "AI evaluation unavailable.").trim()}`,
    `*(${entry.completedAt})*`,
  ].join("\n");

  return joinFrontmatterAndContent(frontmatter, buildStudyMetaContent(sections));
}

export function hasCompletedSynthesis(raw: string): boolean {
  return extractSynthesis(raw) !== null;
}
