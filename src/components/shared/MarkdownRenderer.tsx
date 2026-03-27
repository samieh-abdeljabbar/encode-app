import { useCallback, useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import mermaid from "mermaid";

marked.setOptions({ gfm: true, breaks: true });

// Initialize mermaid once with Encode dark theme
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "dark",
  themeVariables: {
    primaryColor: "#7F77DD",
    primaryTextColor: "#e5e5e5",
    primaryBorderColor: "#333",
    lineColor: "#888880",
    secondaryColor: "#1D9E75",
    tertiaryColor: "#252525",
    mainBkg: "#1a1a1a",
    nodeBorder: "#333",
    clusterBkg: "#252525",
    titleColor: "#e5e5e5",
    edgeLabelBackground: "#1a1a1a",
  },
});

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onWikilinkClick?: (name: string) => void;
}

/** Map callout types to colors */
const CALLOUT_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  note: { border: "#7F77DD", bg: "rgba(127,119,221,0.08)", label: "Note" },
  info: { border: "#7F77DD", bg: "rgba(127,119,221,0.08)", label: "Info" },
  tip: { border: "#1D9E75", bg: "rgba(29,158,117,0.08)", label: "Tip" },
  hint: { border: "#1D9E75", bg: "rgba(29,158,117,0.08)", label: "Hint" },
  important: { border: "#1D9E75", bg: "rgba(29,158,117,0.08)", label: "Important" },
  success: { border: "#1D9E75", bg: "rgba(29,158,117,0.08)", label: "Success" },
  warning: { border: "#BA7517", bg: "rgba(186,117,23,0.08)", label: "Warning" },
  caution: { border: "#BA7517", bg: "rgba(186,117,23,0.08)", label: "Caution" },
  danger: { border: "#D85A30", bg: "rgba(216,90,48,0.08)", label: "Danger" },
  error: { border: "#D85A30", bg: "rgba(216,90,48,0.08)", label: "Error" },
  bug: { border: "#D85A30", bg: "rgba(216,90,48,0.08)", label: "Bug" },
  example: { border: "#7F77DD", bg: "rgba(127,119,221,0.08)", label: "Example" },
  quote: { border: "#888880", bg: "rgba(136,136,128,0.06)", label: "Quote" },
  abstract: { border: "#7F77DD", bg: "rgba(127,119,221,0.08)", label: "Abstract" },
  question: { border: "#BA7517", bg: "rgba(186,117,23,0.08)", label: "Question" },
  todo: { border: "#7F77DD", bg: "rgba(127,119,221,0.08)", label: "Todo" },
};

/** Pre-process wiki-links: [[Page Name]] → clickable anchor */
function preprocessWikilinks(md: string): string {
  // Handle ![[embed]] syntax — render as regular wikilink for now
  return md.replace(/!?\[\[([^\]]+)\]\]/g, (_match, name: string) => {
    const escaped = name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<a class="wikilink" data-wikilink="${escaped}">${escaped}</a>`;
  });
}

/** Pre-process mermaid fenced code blocks before marked parses them */
function preprocessMermaid(md: string): { processed: string; hasMermaid: boolean } {
  let counter = 0;
  let hasMermaid = false;
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "```mermaid") {
      hasMermaid = true;
      const mermaidLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "```") {
        mermaidLines.push(lines[i]);
        i++;
      }
      // Skip closing ```
      if (i < lines.length) i++;
      const code = mermaidLines.join("\n");
      result.push(
        `<div class="mermaid" data-mermaid-id="mermaid-${counter}">${code}</div>`,
      );
      counter++;
      continue;
    }
    result.push(lines[i]);
    i++;
  }

  return { processed: result.join("\n"), hasMermaid };
}

/** Pre-process markdown to handle callouts (including flashcards) */
function preprocessCallouts(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Flashcard callout
    const cardMatch = lines[i].match(/^>\s*\[!card\]\s*id:\s*(.+)/);
    if (cardMatch) {
      let question = "";
      let answer = "";
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        const l = lines[i].replace(/^>\s*/, "");
        if (l.startsWith("**Q:**")) question = l.replace("**Q:**", "").trim();
        else if (l.startsWith("**A:**")) answer = l.replace("**A:**", "").trim();
        i++;
      }
      if (question) {
        result.push(
          `<div class="fc-card">` +
            `<div class="fc-q"><span class="fc-label">Q</span> ${question}</div>` +
            `<div class="fc-a"><span class="fc-label">A</span> ${answer}</div>` +
          `</div>`,
        );
      }
      continue;
    }

    // General callout: > [!type] Optional title
    const calloutMatch = lines[i].match(/^>\s*\[!(\w+)\]\s*(.*)/);
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      const title = calloutMatch[2]?.trim() || "";
      const colors = CALLOUT_COLORS[type] || CALLOUT_COLORS.note;
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        contentLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const label = title || colors.label;
      const body = contentLines.join("\n").trim();
      result.push(
        `<div class="callout callout-${type}">` +
          `<div class="callout-title callout-title-${type}">${label}</div>` +
          (body ? `<div class="callout-body">${marked.parse(body) as string}</div>` : "") +
        `</div>`,
      );
      continue;
    }

    result.push(lines[i]);
    i++;
  }
  return result.join("\n");
}

/** Comprehensive prose styles — uses CSS variables from theme system */
const PROSE_STYLES = `
  .prose {
    color: var(--color-text, #e5e5e5);
    font-size: var(--editor-font-size, 16px);
    line-height: 1.75;
    max-width: none;
  }
  .prose h1 {
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text, #e5e5e5);
    margin: 32px 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border, #333);
    line-height: 1.3;
  }
  .prose h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
    margin: 28px 0 12px 0;
    line-height: 1.3;
  }
  .prose h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
    margin: 24px 0 8px 0;
  }
  .prose h4, .prose h5, .prose h6 {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-muted, #888880);
    margin: 20px 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .prose p {
    margin: 0 0 16px 0;
  }
  .prose a {
    color: var(--color-purple, #7F77DD);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--color-purple, #7F77DD) 30%, transparent);
    transition: border-color 0.15s;
  }
  .prose a:hover {
    border-bottom-color: var(--color-purple, #7F77DD);
  }
  .prose strong {
    color: var(--color-text, #e5e5e5);
    font-weight: 600;
  }
  .prose em {
    color: var(--color-text, #ccc);
  }
  .prose ul, .prose ol {
    margin: 0 0 16px 0;
    padding-left: 24px;
  }
  .prose li {
    margin-bottom: 6px;
  }
  .prose li::marker {
    color: var(--color-text-muted, #888880);
  }
  .prose blockquote {
    border-left: 3px solid var(--color-border, #333);
    margin: 16px 0;
    padding: 8px 16px;
    color: var(--color-text-muted, #888880);
    background: var(--color-surface, rgba(255,255,255,0.02));
    border-radius: 0 6px 6px 0;
  }
  .prose blockquote p {
    margin: 0;
  }
  .prose code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    background: var(--color-surface-2, #252525);
    color: var(--color-coral, #D85A30);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--color-border, #333);
  }
  .prose pre {
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
    overflow-x: auto;
  }
  .prose pre code {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-text, #e5e5e5);
    font-size: 13px;
    line-height: 1.6;
  }
  .prose table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 14px;
  }
  .prose thead {
    border-bottom: 2px solid var(--color-border, #333);
  }
  .prose th {
    text-align: left;
    padding: 10px 12px;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
    background: var(--color-surface, #1a1a1a);
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .prose td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-surface-2, #252525);
    color: var(--color-text, #ccc);
  }
  .prose tr:nth-child(even) td {
    background: var(--color-surface, rgba(255,255,255,0.02));
  }
  .prose hr {
    border: none;
    border-top: 1px solid var(--color-border, #333);
    margin: 32px 0;
  }
  .prose img {
    max-width: 100%;
    border-radius: 8px;
    margin: 16px 0;
  }
  .prose del {
    color: var(--color-text-muted, #888880);
  }
  .prose input[type="checkbox"] {
    accent-color: var(--color-purple, #7F77DD);
    margin-right: 8px;
  }
  /* Flashcard cards */
  .fc-card {
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 16px;
    margin: 12px 0;
    border-left: 3px solid var(--color-purple, #7F77DD);
  }
  .fc-q {
    font-size: 15px;
    color: var(--color-text, #e5e5e5);
    margin-bottom: 10px;
    font-weight: 500;
  }
  .fc-a {
    font-size: 14px;
    color: var(--color-text-muted, #888880);
    padding-top: 10px;
    border-top: 1px solid var(--color-border, #333);
  }
  .fc-label {
    display: inline-block;
    width: 20px;
    height: 20px;
    line-height: 20px;
    text-align: center;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    margin-right: 8px;
    vertical-align: middle;
  }
  .fc-q .fc-label { background: #7F77DD; color: white; }
  .fc-a .fc-label { background: #1D9E75; color: white; }

  .callout {
    border-radius: 6px;
    padding: 12px 16px;
    margin: 12px 0;
    border-left: 3px solid #7F77DD;
    background: rgba(127,119,221,0.08);
  }
  .callout-note, .callout-info, .callout-example, .callout-abstract, .callout-todo { border-left-color: #7F77DD; background: rgba(127,119,221,0.08); }
  .callout-tip, .callout-hint, .callout-important, .callout-success { border-left-color: #1D9E75; background: rgba(29,158,117,0.08); }
  .callout-warning, .callout-caution, .callout-question { border-left-color: #BA7517; background: rgba(186,117,23,0.08); }
  .callout-danger, .callout-error, .callout-bug { border-left-color: #D85A30; background: rgba(216,90,48,0.08); }
  .callout-quote { border-left-color: #888880; background: rgba(136,136,128,0.06); }

  .callout-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    color: #7F77DD;
  }
  .callout-title:last-child { margin-bottom: 0; }
  .callout-title-note, .callout-title-info, .callout-title-example, .callout-title-abstract, .callout-title-todo { color: #7F77DD; }
  .callout-title-tip, .callout-title-hint, .callout-title-important, .callout-title-success { color: #1D9E75; }
  .callout-title-warning, .callout-title-caution, .callout-title-question { color: #BA7517; }
  .callout-title-danger, .callout-title-error, .callout-title-bug { color: #D85A30; }
  .callout-title-quote { color: #888880; }

  .callout-body {
    font-size: 14px;
    color: var(--color-text, #e5e5e5);
    line-height: 1.6;
  }

  /* Wiki-links */
  .wikilink {
    color: #7F77DD !important;
    border-bottom: 1px dotted #7F77DD !important;
    cursor: pointer;
    text-decoration: none !important;
  }
  .wikilink:hover {
    border-bottom-style: solid !important;
  }

  /* Mermaid diagrams */
  .mermaid {
    text-align: center;
    margin: 16px 0;
    overflow-x: auto;
  }
  .mermaid svg {
    max-width: 100%;
  }
`;

export default function MarkdownRenderer({
  content,
  className = "",
  onWikilinkClick,
}: MarkdownRendererProps) {
  const proseRef = useRef<HTMLDivElement>(null);

  const { html, hasMermaid } = useMemo(() => {
    // Pipeline: wikilinks → mermaid → callouts → marked → sanitize
    const withWikilinks = preprocessWikilinks(content);
    const { processed: withMermaid, hasMermaid: mermaidFound } = preprocessMermaid(withWikilinks);
    const withCallouts = preprocessCallouts(withMermaid);
    const rawHtml = DOMPurify.sanitize(marked.parse(withCallouts) as string, {
      ADD_TAGS: ["div", "span"],
      ADD_ATTR: ["class", "data-wikilink", "data-mermaid-id"],
    });
    return { html: rawHtml, hasMermaid: mermaidFound };
  }, [content]);

  // Render mermaid diagrams after DOM update
  useEffect(() => {
    if (!hasMermaid || !proseRef.current) return;
    const nodes = proseRef.current.querySelectorAll(".mermaid[data-mermaid-id]");
    if (nodes.length > 0) {
      mermaid.run({ nodes: Array.from(nodes) as HTMLElement[] }).catch(() => {
        // Silently handle invalid mermaid syntax — the raw text stays visible
      });
    }
  }, [html, hasMermaid]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;

      // Wiki-link click
      const wikilink = anchor.getAttribute("data-wikilink");
      if (wikilink) {
        e.preventDefault();
        onWikilinkClick?.(wikilink);
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      if (href.startsWith("http://") || href.startsWith("https://")) {
        window.open(href, "_blank");
      }
    },
    [onWikilinkClick],
  );

  return (
    <>
      <style>{PROSE_STYLES}</style>
      <div
        ref={proseRef}
        className={`prose ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
    </>
  );
}
