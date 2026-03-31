import type { EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import katex from "katex";

class MathWidget extends WidgetType {
  constructor(
    private readonly tex: string,
    private readonly block: boolean,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement(this.block ? "div" : "span");
    container.className = this.block ? "cm-math-block" : "cm-math-inline";
    try {
      container.innerHTML = katex.renderToString(this.tex, {
        throwOnError: false,
        displayMode: this.block,
      });
    } catch {
      container.textContent = this.tex;
      container.style.color = "#b85c3a";
    }
    return container;
  }

  eq(other: MathWidget): boolean {
    return this.tex === other.tex && this.block === other.block;
  }
}

function buildMathDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] =
    [];
  const doc = state.doc.toString();
  const cursor = state.selection.main;

  // Block math: $$...$$
  for (const match of doc.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (cursor.from >= from && cursor.to <= to) continue;
    decorations.push({
      from,
      to,
      decoration: Decoration.replace({
        widget: new MathWidget(match[1].trim(), true),
        block: true,
      }),
    });
  }

  // Inline math: $...$ (not $$)
  for (const match of doc.matchAll(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (cursor.from >= from && cursor.to <= to) continue;
    decorations.push({
      from,
      to,
      decoration: Decoration.replace({
        widget: new MathWidget(match[1], false),
      }),
    });
  }

  return Decoration.set(
    decorations.map(({ from, to, decoration }) => decoration.range(from, to)),
    true,
  );
}

export const mathRendering = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMathDecorations(view.state);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildMathDecorations(update.state);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
