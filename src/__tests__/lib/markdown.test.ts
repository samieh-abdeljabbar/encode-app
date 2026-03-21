import { describe, it, expect } from "vitest";
import { parseFrontmatter, splitSections } from "../../lib/markdown";

describe("parseFrontmatter", () => {
  it("extracts YAML frontmatter and content", () => {
    const input = `---
subject: D426 Data Management
topic: Normalization
type: chapter
---

# Normalization

Content here.`;

    const result = parseFrontmatter(input);
    expect(result.frontmatter.subject).toBe("D426 Data Management");
    expect(result.frontmatter.topic).toBe("Normalization");
    expect(result.frontmatter.type).toBe("chapter");
    expect(result.content.trim()).toBe("# Normalization\n\nContent here.");
  });

  it("returns empty frontmatter when none present", () => {
    const input = "# Just content\n\nNo frontmatter here.";
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(input);
  });

  it("handles empty content after frontmatter", () => {
    const input = `---
type: daily
date: 2026-03-21
---
`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter.type).toBe("daily");
    expect(result.frontmatter.date).toBe("2026-03-21");
    expect(result.content.trim()).toBe("");
  });
});

describe("splitSections", () => {
  it("splits markdown by h2 headings", () => {
    const content = `# Main Title

Intro paragraph.

## Section 1

First section content.

## Section 2

Second section content.`;

    const sections = splitSections(content);
    expect(sections).toHaveLength(3);
    expect(sections[0].heading).toBe("Main Title");
    expect(sections[0].content).toContain("Intro paragraph.");
    expect(sections[1].heading).toBe("Section 1");
    expect(sections[1].content).toContain("First section content.");
    expect(sections[2].heading).toBe("Section 2");
    expect(sections[2].content).toContain("Second section content.");
  });

  it("returns single section when no headings", () => {
    const content = "Just a paragraph with no headings.";
    const sections = splitSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBeNull();
    expect(sections[0].content).toBe(content);
  });
});
