import { useCallback, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked for GFM (tables, strikethrough, etc.)
marked.setOptions({
  gfm: true,
  breaks: true,
});

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/** Pre-process markdown to render flashcard callouts as styled cards */
function renderFlashcardCallouts(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const cardMatch = lines[i].match(/^>\s*\[!card\]\s*id:\s*(.+)/);
    if (cardMatch) {
      let question = "";
      let answer = "";
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        const l = lines[i].replace(/^>\s*/, "");
        if (l.startsWith("**Q:**")) question = l.replace("**Q:**", "").trim();
        else if (l.startsWith("**A:**")) answer = l.replace("**A:**", "").trim();
        // Skip all metadata fields (Bloom, Ease, Interval, etc.)
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
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join("\n");
}

export default function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  const html = useMemo(() => {
    const processed = renderFlashcardCallouts(content);
    return DOMPurify.sanitize(marked.parse(processed) as string, {
      ADD_TAGS: ["div", "span"],
      ADD_ATTR: ["class"],
    });
  }, [content]);

  // Intercept link clicks to open in system browser
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    e.preventDefault();

    // Open external URLs in system browser
    if (href.startsWith("http://") || href.startsWith("https://")) {
      window.open(href, "_blank");
    }
  }, []);

  return (
    <>
      <style>{`
        .fc-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          margin: 12px 0;
          border-left: 3px solid #7F77DD;
        }
        .fc-q {
          font-size: 15px;
          color: #e5e5e5;
          margin-bottom: 10px;
          font-weight: 500;
        }
        .fc-a {
          font-size: 14px;
          color: #888880;
          padding-top: 10px;
          border-top: 1px solid #333;
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
        .fc-q .fc-label {
          background: #7F77DD;
          color: white;
        }
        .fc-a .fc-label {
          background: #1D9E75;
          color: white;
        }
      `}</style>
      <div
        className={`prose ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
    </>
  );
}
