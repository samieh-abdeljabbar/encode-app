import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { EditorView } from "@codemirror/view";

function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  td.use(gfm);

  // Strip semantically meaningless wrappers (Google Docs / Word span soup)
  td.addRule("stripWrappers", {
    filter: (node: Node) => {
      const el = node as HTMLElement;
      const tag = el.tagName?.toLowerCase();
      return (
        (tag === "span" || tag === "div") &&
        !(el.getAttribute?.("class") ?? "").includes("code")
      );
    },
    replacement: (content: string) => content,
  });

  // Replace data: URI images with placeholder (screenshots paste as huge base64)
  td.addRule("stripDataImages", {
    filter: (node: Node) => {
      const el = node as HTMLElement;
      return (
        el.tagName === "IMG" &&
        (el.getAttribute?.("src") ?? "").startsWith("data:")
      );
    },
    replacement: () => "*(pasted image)*",
  });

  return td;
}

const turndown = createTurndownService();

function postProcess(md: string): string {
  return md
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** Convert HTML string to markdown using the configured Turndown instance */
export function convertHtmlToMarkdown(html: string): string {
  return postProcess(turndown.turndown(html));
}

/** CM6 extension: intercept paste, convert HTML clipboard to markdown */
export const pasteHandler = EditorView.domEventHandlers({
  paste(event: ClipboardEvent, view: EditorView): boolean {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return false;

    const html = clipboardData.getData("text/html");
    if (!html) return false;

    // If HTML has no meaningful content, fall back to plain text
    const stripped = html.replace(/<meta[^>]*>/gi, "").replace(/<\/?[^>]*>/g, "").trim();
    if (!stripped) return false;

    event.preventDefault();

    const md = convertHtmlToMarkdown(html);
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: md },
      selection: { anchor: from + md.length },
    });

    return true;
  },
});
