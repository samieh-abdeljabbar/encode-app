import DOMPurify from "dompurify";
import { marked } from "marked";

// Enable breaks so single newlines render as <br> (preserves tree structures, lists, etc.)
marked.use({ breaks: true, gfm: true });

export function ReaderContent({
  heading,
  bodyMarkdown,
}: {
  heading: string | null;
  bodyMarkdown: string;
}) {
  const html = DOMPurify.sanitize(marked.parse(bodyMarkdown) as string);

  return (
    <div className="mx-auto max-w-3xl px-7 py-7">
      {heading && (
        <h2 className="mb-6 text-xl font-semibold tracking-tight text-text">
          {heading}
        </h2>
      )}
      <div
        className="prose-encode text-sm leading-relaxed text-text"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
