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

export default function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  const html = useMemo(() => {
    return DOMPurify.sanitize(marked.parse(content) as string);
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
    <div
      className={`prose ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  );
}
