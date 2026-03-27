import type { Frontmatter } from "./types";
import { stripStudyMetaSections } from "./synthesis";

export interface ParsedMarkdown {
  frontmatter: Frontmatter;
  content: string;
}

export interface Section {
  heading: string | null;
  level: number;
  content: string;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Uses a simple regex split to avoid Node.js polyfill issues in the webview.
 */
export function parseFrontmatter(raw: string): ParsedMarkdown {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: raw };
  }

  const yamlStr = match[1];
  const content = match[2];

  const frontmatter: Frontmatter = {};
  for (const line of yamlStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: string | number = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Parse integers
    if (/^\d+$/.test(String(value))) {
      value = parseInt(String(value), 10);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, content };
}

/**
 * Split markdown content into sections based on headings.
 * Post-processes to merge empty/title-only sections into the next
 * content-bearing section, and filters out the Digestion section.
 */
export function splitSections(content: string): Section[] {
  const studyContent = stripStudyMetaSections(content);
  const lines = studyContent.split("\n");
  const raw: Section[] = [];
  let currentHeading: string | null = null;
  let currentLevel = 0;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0 || currentHeading !== null) {
        raw.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentLines.join("\n").trim(),
        });
      }
      currentHeading = headingMatch[2];
      currentLevel = headingMatch[1].length;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Save final section
  if (currentLines.length > 0 || currentHeading !== null) {
    raw.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentLines.join("\n").trim(),
    });
  }

  if (raw.length === 0 && studyContent.trim()) {
    return [{ heading: null, level: 0, content: studyContent.trim() }];
  }

  return postProcessSections(raw);
}

/**
 * Merge empty/title-only sections into the next content section,
 * and filter out study meta-sections.
 */
function postProcessSections(sections: Section[]): Section[] {
  const result: Section[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Skip study meta-sections stored in the file footer.
    if (section.heading === "Schema Activation" || section.heading === "Digestion" || section.heading === "Synthesis") continue;

    // Skip empty leading sections (no heading, no content)
    if (!section.heading && !section.content.trim() && result.length === 0) {
      continue;
    }

    // If section has heading but no body content, merge into the next section
    if (section.heading && !section.content.trim() && i + 1 < sections.length) {
      const headingMd = "#".repeat(section.level) + " " + section.heading;
      sections[i + 1] = { ...sections[i + 1], content: headingMd + "\n\n" + sections[i + 1].content };
      continue;
    }

    result.push(section);
  }

  return result;
}
