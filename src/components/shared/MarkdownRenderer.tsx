import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import mermaid from "mermaid";
import { getCurrentTheme, themes } from "../../lib/themes";

marked.setOptions({ gfm: true, breaks: true });

function initializeMermaid(themeId: string): void {
  const theme = themes.find((entry) => entry.id === themeId) || themes[0];
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      primaryColor: theme.colors.purple,
      primaryTextColor: theme.colors.text,
      primaryBorderColor: theme.colors.border,
      lineColor: theme.colors["text-muted"],
      secondaryColor: theme.colors.teal,
      tertiaryColor: theme.colors["surface-2"],
      mainBkg: theme.colors.surface,
      nodeBorder: theme.colors.border,
      clusterBkg: theme.colors["surface-2"],
      titleColor: theme.colors.text,
      edgeLabelBackground: theme.colors.surface,
    },
  });
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onWikilinkClick?: (name: string) => void;
  onQuizRetake?: () => void;
}

/** Map callout types to colors */
const CALLOUT_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  note: { border: "var(--color-accent)", bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)", label: "Note" },
  info: { border: "var(--color-accent)", bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)", label: "Info" },
  tip: { border: "var(--color-teal)", bg: "color-mix(in srgb, var(--color-teal) 12%, transparent)", label: "Tip" },
  hint: { border: "var(--color-teal)", bg: "color-mix(in srgb, var(--color-teal) 12%, transparent)", label: "Hint" },
  important: { border: "var(--color-teal)", bg: "color-mix(in srgb, var(--color-teal) 12%, transparent)", label: "Important" },
  success: { border: "var(--color-teal)", bg: "color-mix(in srgb, var(--color-teal) 12%, transparent)", label: "Success" },
  warning: { border: "var(--color-amber)", bg: "color-mix(in srgb, var(--color-amber) 12%, transparent)", label: "Warning" },
  caution: { border: "var(--color-amber)", bg: "color-mix(in srgb, var(--color-amber) 12%, transparent)", label: "Caution" },
  danger: { border: "var(--color-coral)", bg: "color-mix(in srgb, var(--color-coral) 12%, transparent)", label: "Danger" },
  error: { border: "var(--color-coral)", bg: "color-mix(in srgb, var(--color-coral) 12%, transparent)", label: "Error" },
  bug: { border: "var(--color-coral)", bg: "color-mix(in srgb, var(--color-coral) 12%, transparent)", label: "Bug" },
  example: { border: "var(--color-accent)", bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)", label: "Example" },
  quote: { border: "var(--color-border-strong)", bg: "color-mix(in srgb, var(--color-panel-alt) 88%, transparent)", label: "Quote" },
  abstract: { border: "var(--color-accent)", bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)", label: "Abstract" },
  question: { border: "var(--color-amber)", bg: "color-mix(in srgb, var(--color-amber) 12%, transparent)", label: "Question" },
  todo: { border: "var(--color-accent)", bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)", label: "Todo" },
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

/** Escape HTML entities in free text before embedding in HTML strings */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pre-process quiz result markdown into styled HTML */
function preprocessQuizResults(md: string): string {
  // Check if this looks like a quiz result file
  if (!md.includes("## [MC]") && !md.includes("## [Open]") && !md.includes("## [Fill]") && !md.includes("## [T/F]") && !md.includes("## [Code]")) {
    return md;
  }

  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Score line: Score: **3/5** (60%)
    const scoreMatch = lines[i].match(/^Score:\s*\*\*(\d+)\/(\d+)\*\*\s*\((\d+)%\)/);
    if (scoreMatch) {
      const [, correct, total, pct] = scoreMatch;
      const pctNum = parseInt(pct);
      const color = pctNum >= 80 ? "var(--color-teal)" : pctNum >= 60 ? "var(--color-amber)" : "var(--color-coral)";
      result.push(
        `<div class="quiz-score-bar">` +
          `<div class="quiz-score-text"><strong>${correct}/${total}</strong> <span style="color:${color}">(${pct}%)</span></div>` +
          `<div class="quiz-score-track"><div class="quiz-score-fill" style="width:${pct}%;background:${color}"></div></div>` +
        `</div>`,
      );
      // Add retake button
      result.push(`<div class="quiz-action-row"><button class="quiz-retake-btn" data-quiz-retake="true">Retake Quiz</button></div>`);
      i++;
      continue;
    }

    // Question heading: ## [MC] Question text
    const qMatch = lines[i].match(/^##\s*\[(MC|Fill|T\/F|Open|Code)\]\s*(.*)/);
    if (qMatch) {
      const [, type, question] = qMatch;
      i++;

      // Collect fields until next heading or EOF
      let bloom = "";
      let answer = "";
      let correctAnswer = "";
      let resultStatus = "";
      let feedback = "";
      let options = "";

      while (i < lines.length && !lines[i].startsWith("## [")) {
        const line = lines[i];
        if (line.startsWith("Bloom Level:")) bloom = line.replace("Bloom Level:", "").trim();
        else if (line.startsWith("Options:")) options = line.replace("Options:", "").trim();
        else if (line.startsWith("**Answer:**")) answer = line.replace("**Answer:**", "").trim();
        else if (line.startsWith("**Correct Answer:**")) correctAnswer = line.replace("**Correct Answer:**", "").trim();
        else if (line.startsWith("**Result:**")) resultStatus = line.replace("**Result:**", "").trim();
        else if (line.startsWith("**Feedback:**")) feedback = line.replace("**Feedback:**", "").trim();
        i++;
      }

      const isCorrect = resultStatus.toLowerCase() === "correct";
      const cardClass = isCorrect ? "quiz-card-correct" : "quiz-card-incorrect";
      const typeColors: Record<string, string> = { MC: "var(--color-accent)", Fill: "var(--color-amber)", "T/F": "var(--color-teal)", Open: "var(--color-accent)", Code: "var(--color-coral)" };
      const badgeColor = typeColors[type] || "var(--color-accent)";

      let html = `<div class="quiz-result-card ${cardClass}">`;
      html += `<div class="quiz-card-header">`;
      html += `<span class="quiz-type-badge" style="background:${badgeColor}">${type}</span>`;
      html += `<span class="quiz-question-text">${escapeHtml(question)}</span>`;
      if (bloom) html += `<span class="quiz-bloom">Bloom ${bloom}</span>`;
      html += `</div>`;
      if (options) html += `<div class="quiz-options">${options.split(" | ").map((o) => `<span class="quiz-option">${escapeHtml(o)}</span>`).join("")}</div>`;
      html += `<div class="quiz-answer-row">`;
      html += `<span class="quiz-answer-label">Your answer:</span> <span class="quiz-answer-value">${escapeHtml(answer)}</span>`;
      html += `</div>`;
      if (correctAnswer && !isCorrect) {
        html += `<div class="quiz-answer-row">`;
        html += `<span class="quiz-answer-label">Correct:</span> <span class="quiz-correct-value">${escapeHtml(correctAnswer)}</span>`;
        html += `</div>`;
      }
      html += `<div class="quiz-result-badge ${isCorrect ? "quiz-result-correct" : "quiz-result-incorrect"}">${escapeHtml(resultStatus)}</div>`;
      if (feedback) html += `<div class="quiz-feedback">${escapeHtml(feedback)}</div>`;
      html += `</div>`;

      result.push(html);
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
    color: var(--color-text);
    font-size: var(--editor-font-size, 16px);
    line-height: 1.75;
    max-width: none;
  }
  .prose h1 {
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text);
    margin: 32px 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border-subtle);
    line-height: 1.3;
  }
  .prose h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--color-text);
    margin: 28px 0 12px 0;
    line-height: 1.3;
  }
  .prose h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin: 24px 0 8px 0;
  }
  .prose h4, .prose h5, .prose h6 {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-muted);
    margin: 20px 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .prose p {
    margin: 0 0 16px 0;
  }
  .prose a {
    color: var(--color-accent);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent) 32%, transparent);
    transition: border-color 0.15s;
  }
  .prose a:hover {
    border-bottom-color: var(--color-accent);
  }
  .prose strong {
    color: var(--color-text);
    font-weight: 600;
  }
  .prose em {
    color: color-mix(in srgb, var(--color-text) 88%, transparent);
  }
  .prose ul, .prose ol {
    margin: 0 0 16px 0;
    padding-left: 24px;
  }
  .prose li {
    margin-bottom: 6px;
  }
  .prose li::marker {
    color: var(--color-text-muted);
  }
  .prose blockquote {
    border-left: 3px solid var(--color-border-strong);
    margin: 16px 0;
    padding: 8px 16px;
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-panel-alt) 92%, transparent);
    border-radius: 0 6px 6px 0;
  }
  .prose blockquote p {
    margin: 0;
  }
  .prose code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    background: var(--color-panel-alt);
    color: var(--color-coral);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--color-border-subtle);
  }
  .prose pre {
    background: var(--color-panel-alt);
    border: 1px solid var(--color-border-subtle);
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
    overflow-x: auto;
  }
  .prose pre code {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-text);
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
    border-bottom: 2px solid var(--color-border-strong);
  }
  .prose th {
    text-align: left;
    padding: 10px 12px;
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-panel-alt);
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .prose td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border-subtle);
    color: color-mix(in srgb, var(--color-text) 92%, transparent);
  }
  .prose tr:nth-child(even) td {
    background: color-mix(in srgb, var(--color-panel-alt) 86%, transparent);
  }
  .prose hr {
    border: none;
    border-top: 1px solid var(--color-border-subtle);
    margin: 32px 0;
  }
  .prose img {
    max-width: 100%;
    border-radius: 8px;
    margin: 16px 0;
  }
  .prose del {
    color: var(--color-text-muted);
  }
  .prose input[type="checkbox"] {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-text-muted);
    border-radius: 3px;
    margin-right: 8px;
    vertical-align: middle;
    position: relative;
    top: -1px;
    cursor: default;
    flex-shrink: 0;
  }
  .prose input[type="checkbox"]:checked {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  .prose input[type="checkbox"]:checked::after {
    content: "\\2713";
    color: white;
    font-size: 12px;
    font-weight: 700;
    position: absolute;
    top: -2px;
    left: 1px;
  }
  .prose li:has(> input[type="checkbox"]) {
    list-style: none;
    margin-left: -24px;
  }
  .prose li:has(> input[type="checkbox"]:checked) {
    color: var(--color-text-muted);
    text-decoration: line-through;
  }
  /* Flashcard cards */
  .fc-card {
    background: var(--color-panel);
    border: 1px solid var(--color-border-subtle);
    border-radius: 8px;
    padding: 16px;
    margin: 12px 0;
    border-left: 3px solid var(--color-accent);
  }
  .fc-q {
    font-size: 15px;
    color: var(--color-text);
    margin-bottom: 10px;
    font-weight: 500;
  }
  .fc-a {
    font-size: 14px;
    color: var(--color-text-muted);
    padding-top: 10px;
    border-top: 1px solid var(--color-border-subtle);
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
  .fc-q .fc-label { background: var(--color-accent); color: white; }
  .fc-a .fc-label { background: var(--color-teal); color: white; }

  .callout {
    border-radius: 12px;
    padding: 14px 18px;
    margin: 12px 0;
    border-left: 3px solid var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  }
  .callout-note, .callout-info, .callout-example, .callout-abstract, .callout-todo { border-left-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 12%, transparent); }
  .callout-tip, .callout-hint, .callout-important, .callout-success { border-left-color: var(--color-teal); background: color-mix(in srgb, var(--color-teal) 12%, transparent); }
  .callout-warning, .callout-caution, .callout-question { border-left-color: var(--color-amber); background: color-mix(in srgb, var(--color-amber) 12%, transparent); }
  .callout-danger, .callout-error, .callout-bug { border-left-color: var(--color-coral); background: color-mix(in srgb, var(--color-coral) 12%, transparent); }
  .callout-quote { border-left-color: var(--color-border-strong); background: color-mix(in srgb, var(--color-panel-alt) 90%, transparent); }

  .callout-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    color: var(--color-accent);
  }
  .callout-title:last-child { margin-bottom: 0; }
  .callout-title-note, .callout-title-info, .callout-title-example, .callout-title-abstract, .callout-title-todo { color: var(--color-accent); }
  .callout-title-tip, .callout-title-hint, .callout-title-important, .callout-title-success { color: var(--color-teal); }
  .callout-title-warning, .callout-title-caution, .callout-title-question { color: var(--color-amber); }
  .callout-title-danger, .callout-title-error, .callout-title-bug { color: var(--color-coral); }
  .callout-title-quote { color: var(--color-text-muted); }

  .callout-body {
    font-size: 14px;
    color: var(--color-text);
    line-height: 1.6;
  }

  /* Wiki-links */
  .wikilink {
    color: var(--color-accent) !important;
    border-bottom: 1px dotted var(--color-accent) !important;
    cursor: pointer;
    text-decoration: none !important;
  }
  .wikilink:hover {
    border-bottom-style: solid !important;
  }

  /* Quiz result cards */
  .quiz-score-bar {
    margin: 16px 0;
    padding: 12px 16px;
    background: var(--color-panel);
    border: 1px solid var(--color-border-subtle);
    border-radius: 8px;
  }
  .quiz-score-text {
    font-size: 18px;
    margin-bottom: 8px;
    color: var(--color-text);
  }
  .quiz-score-track {
    height: 6px;
    background: var(--color-panel-alt);
    border-radius: 3px;
    overflow: hidden;
  }
  .quiz-score-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s;
  }
  .quiz-action-row {
    margin: 8px 0 16px 0;
  }
  .quiz-retake-btn {
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-amber);
    border: 1px solid color-mix(in srgb, var(--color-amber) 40%, transparent);
    background: color-mix(in srgb, var(--color-amber) 10%, transparent);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .quiz-retake-btn:hover {
    background: color-mix(in srgb, var(--color-amber) 16%, transparent);
    border-color: var(--color-amber);
  }
  .quiz-result-card {
    border-radius: 8px;
    padding: 14px 16px;
    margin: 10px 0;
    border-left: 3px solid var(--color-border-strong);
    background: var(--color-panel);
  }
  .quiz-card-correct {
    border-left-color: var(--color-teal);
    background: color-mix(in srgb, var(--color-teal) 8%, transparent);
  }
  .quiz-card-incorrect {
    border-left-color: var(--color-coral);
    background: color-mix(in srgb, var(--color-coral) 8%, transparent);
  }
  .quiz-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .quiz-type-badge {
    font-size: 10px;
    font-weight: 700;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .quiz-question-text {
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text);
    flex: 1;
  }
  .quiz-bloom {
    font-size: 10px;
    color: var(--color-text-muted);
    background: var(--color-panel-alt);
    padding: 2px 6px;
    border-radius: 3px;
  }
  .quiz-options {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .quiz-option {
    font-size: 12px;
    padding: 3px 10px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 4px;
    color: var(--color-text-muted);
  }
  .quiz-answer-row {
    font-size: 13px;
    margin-bottom: 4px;
    color: var(--color-text);
  }
  .quiz-answer-label {
    color: var(--color-text-muted);
    margin-right: 4px;
  }
  .quiz-correct-value {
    color: var(--color-teal);
    font-weight: 500;
  }
  .quiz-result-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 4px;
    margin-top: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .quiz-result-correct {
    background: color-mix(in srgb, var(--color-teal) 18%, transparent);
    color: var(--color-teal);
  }
  .quiz-result-incorrect {
    background: color-mix(in srgb, var(--color-coral) 18%, transparent);
    color: var(--color-coral);
  }
  .quiz-feedback {
    font-size: 13px;
    color: var(--color-text-muted);
    font-style: italic;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-border-subtle);
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
  onQuizRetake,
}: MarkdownRendererProps) {
  const proseRef = useRef<HTMLDivElement>(null);
  const [themeId, setThemeId] = useState(() => getCurrentTheme());

  const { html, hasMermaid } = useMemo(() => {
    // Pipeline: wikilinks → mermaid → callouts → quiz results → marked → sanitize
    const withWikilinks = preprocessWikilinks(content);
    const { processed: withMermaid, hasMermaid: mermaidFound } = preprocessMermaid(withWikilinks);
    const withCallouts = preprocessCallouts(withMermaid);
    const withQuizResults = preprocessQuizResults(withCallouts);
    const rawHtml = DOMPurify.sanitize(marked.parse(withQuizResults) as string, {
      ADD_TAGS: ["div", "span", "input", "button"],
      ADD_ATTR: ["class", "data-wikilink", "data-mermaid-id", "data-quiz-retake", "checked", "type", "disabled", "style"],
    });
    return { html: rawHtml, hasMermaid: mermaidFound };
  }, [content]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<string>).detail || getCurrentTheme();
      setThemeId(nextTheme);
    };

    window.addEventListener("encode-theme-change", handleThemeChange as EventListener);
    return () => window.removeEventListener("encode-theme-change", handleThemeChange as EventListener);
  }, []);

  // Render mermaid diagrams after DOM update
  useEffect(() => {
    if (!hasMermaid || !proseRef.current) return;
    initializeMermaid(themeId);
    const nodes = proseRef.current.querySelectorAll(".mermaid[data-mermaid-id]");
    if (nodes.length > 0) {
      mermaid.run({ nodes: Array.from(nodes) as HTMLElement[] }).catch(() => {
        // Silently handle invalid mermaid syntax — the raw text stays visible
      });
    }
  }, [html, hasMermaid, themeId]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // Quiz retake button
      if (target.getAttribute("data-quiz-retake")) {
        e.preventDefault();
        onQuizRetake?.();
        return;
      }

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
    [onWikilinkClick, onQuizRetake],
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
