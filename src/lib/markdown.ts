import type { Frontmatter } from "./types";

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
 */
export function splitSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let currentLevel = 0;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0 || currentHeading !== null) {
        sections.push({
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
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentLines.join("\n").trim(),
    });
  }

  if (sections.length === 0 && content.trim()) {
    return [{ heading: null, level: 0, content: content.trim() }];
  }

  return sections;
}
