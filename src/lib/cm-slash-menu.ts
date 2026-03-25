import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

interface SlashCommand {
  command: string;
  label: string;
  template: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "table",
    label: "Table",
    template:
      "| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n",
  },
  { command: "heading", label: "Heading", template: "## " },
  { command: "code", label: "Code Block", template: "```\n\n```\n" },
  {
    command: "mermaid",
    label: "Mermaid Diagram",
    template:
      "```mermaid\ngraph TD\n    A[Start] --> B[Process]\n    B --> C[End]\n```\n",
  },
  {
    command: "card",
    label: "Flashcard",
    template:
      '> [!card] id: fc-\n> **Q:** \n> **A:** \n> **Bloom:** 2\n> **Ease:** 2.50\n> **Interval:** 0\n> **Next:** \n> **Last:**\n',
  },
  {
    command: "callout",
    label: "Callout (Note)",
    template: "> [!note] Title\n> Content here.\n",
  },
  {
    command: "warning",
    label: "Callout (Warning)",
    template: "> [!warning] Title\n> Content here.\n",
  },
  {
    command: "tip",
    label: "Callout (Tip)",
    template: "> [!tip] Title\n> Content here.\n",
  },
];

function slashCommandSource(
  context: CompletionContext,
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = context.state.sliceDoc(line.from, context.pos);

  const match = textBefore.match(/^\/(\w*)$/);
  if (!match) return null;

  const options: Completion[] = SLASH_COMMANDS.map((cmd) => ({
    label: `/${cmd.command}`,
    detail: cmd.label,
    apply: cmd.template,
  }));

  return {
    from: line.from,
    options,
    filter: true,
  };
}

const slashMenuTheme = EditorView.baseTheme({
  ".cm-tooltip-autocomplete": {
    backgroundColor: "#1a1a1a !important",
    border: "1px solid #333 !important",
    borderRadius: "8px !important",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5) !important",
  },
  ".cm-tooltip-autocomplete ul": {
    fontFamily: "Inter, system-ui, sans-serif !important",
    fontSize: "13px !important",
  },
  ".cm-tooltip-autocomplete ul li": {
    padding: "6px 12px !important",
    color: "#888880 !important",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "#252525 !important",
    color: "#e5e5e5 !important",
  },
  ".cm-tooltip-autocomplete .cm-completionLabel": {
    color: "#7F77DD !important",
    fontFamily: "monospace !important",
    fontSize: "12px !important",
  },
  ".cm-tooltip-autocomplete .cm-completionDetail": {
    color: "inherit !important",
    fontStyle: "normal !important",
    marginLeft: "8px !important",
  },
});

export const slashMenuExtension = [
  autocompletion({
    override: [slashCommandSource],
    activateOnTyping: true,
    icons: false,
  }),
  slashMenuTheme,
];
