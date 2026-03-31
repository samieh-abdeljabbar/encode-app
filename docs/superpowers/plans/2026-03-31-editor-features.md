# Editor Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 13 editor features (checkboxes, strikethrough, search, bracket matching, status bar, breadcrumb, callouts, code highlighting, folding, nested lists, math, outline panel, theme system) to reach Obsidian-level editor parity.

**Architecture:** Most features are independent CodeMirror 6 extensions or React components. Decoration features (checkboxes, strikethrough, callouts, nested lists) modify `cm-decorations.ts`. Editor config features (search, bracket matching, folding, code languages) modify `MarkdownEditor.tsx`. New components (status bar, outline, theme provider) are standalone. Theme system refactors CSS variables.

**Tech Stack:** CodeMirror 6, React 18, TypeScript, Tailwind CSS 4, KaTeX, @codemirror/lang-* packages

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/editor/cm-decorations.ts` | Modify | Add checkbox, strikethrough, callout, nested list decorations |
| `src/components/editor/cm-theme.ts` | Modify | Refactor to use CSS variables, add new CSS classes |
| `src/components/editor/MarkdownEditor.tsx` | Modify | Add search, bracket matching, folding, code languages |
| `src/components/editor/cm-math.ts` | Create | KaTeX math rendering extension |
| `src/components/editor/cm-fold.ts` | Create | Markdown heading fold service |
| `src/components/editor/StatusBar.tsx` | Create | Word count, cursor position bar |
| `src/components/editor/OutlinePanel.tsx` | Create | Heading TOC sidebar |
| `src/lib/themes.ts` | Create | Theme definitions (5 built-in themes) |
| `src/components/layout/ThemeProvider.tsx` | Create | Applies active theme CSS variables |
| `src/pages/ChapterView.tsx` | Modify | Integrate status bar, outline, breadcrumb |
| `src/pages/Settings.tsx` | Modify | Theme selector + custom CSS editor |
| `src/index.css` | Modify | Ensure all colors use CSS variables |

---

### Task 1: Install Dependencies

- [ ] **Step 1: Install language packs + KaTeX**

```bash
npm install @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-html @codemirror/lang-css @codemirror/lang-json katex @types/katex
```

Note: `@codemirror/search` and `@codemirror/language` (for `bracketMatching`, `foldGutter`) are already installed via the `codemirror` meta-package.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install language packs and KaTeX"
```

---

### Task 2: Quick Wins — Search, Bracket Matching, Folding, Code Languages

**Files:**
- Modify: `src/components/editor/MarkdownEditor.tsx`
- Create: `src/components/editor/cm-fold.ts`

These are all additions to the MarkdownEditor extensions array — independent of decorations.

- [ ] **Step 1: Create markdown heading fold service**

Create `src/components/editor/cm-fold.ts`:

```typescript
import { foldService } from "@codemirror/language";
import { syntaxTree } from "@codemirror/language";

/**
 * Fold service for markdown headings.
 * Folds from a heading to the next heading of equal or higher level.
 */
export const markdownFoldService = foldService.of((state, lineStart) => {
  const tree = syntaxTree(state);
  let headingLevel = 0;
  let headingEnd = 0;

  // Check if this line starts a heading
  tree.iterate({
    from: lineStart,
    to: state.doc.lineAt(lineStart).to,
    enter(node) {
      if (
        node.name.startsWith("ATXHeading") &&
        node.from === lineStart
      ) {
        headingLevel = Number.parseInt(node.name.replace("ATXHeading", ""), 10);
        headingEnd = node.to;
      }
    },
  });

  if (headingLevel === 0) return null;

  // Find the next heading of equal or higher level
  let foldEnd = state.doc.length;
  const startLine = state.doc.lineAt(lineStart).number;

  tree.iterate({
    from: headingEnd,
    enter(node) {
      if (node.name.startsWith("ATXHeading")) {
        const level = Number.parseInt(node.name.replace("ATXHeading", ""), 10);
        if (level <= headingLevel) {
          // Found a heading of equal or higher level
          const prevLine = state.doc.lineAt(node.from);
          if (prevLine.number > startLine) {
            foldEnd = prevLine.from > 0 ? prevLine.from - 1 : prevLine.from;
            return false; // stop iteration
          }
        }
      }
    },
  });

  if (foldEnd <= headingEnd) return null;

  return { from: headingEnd, to: foldEnd };
});
```

- [ ] **Step 2: Update MarkdownEditor with search, brackets, folding, code languages**

In `src/components/editor/MarkdownEditor.tsx`, add these imports:

```typescript
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdownFoldService } from "./cm-fold";
```

Update the `markdown()` config to include code language support:

```typescript
markdown({
  base: markdownLanguage,
  codeLanguages: [
    { tag: "javascript", parser: javascript().language.parser, alias: ["js"] },
    { tag: "typescript", parser: javascript({ typescript: true }).language.parser, alias: ["ts"] },
    { tag: "python", parser: python().language.parser, alias: ["py"] },
    { tag: "html", parser: html().language.parser },
    { tag: "css", parser: css().language.parser },
    { tag: "json", parser: json().language.parser },
  ],
}),
```

Note: The `codeLanguages` option accepts `LanguageDescription[]`. Use `LanguageDescription.of()` from `@codemirror/language`:

```typescript
import { LanguageDescription } from "@codemirror/language";

// In the extensions array:
markdown({
  base: markdownLanguage,
  codeLanguages: [
    LanguageDescription.of({ name: "javascript", alias: ["js"], load: async () => (await import("@codemirror/lang-javascript")).javascript() }),
    LanguageDescription.of({ name: "typescript", alias: ["ts"], load: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true }) }),
    LanguageDescription.of({ name: "python", alias: ["py"], load: async () => (await import("@codemirror/lang-python")).python() }),
    LanguageDescription.of({ name: "html", load: async () => (await import("@codemirror/lang-html")).html() }),
    LanguageDescription.of({ name: "css", load: async () => (await import("@codemirror/lang-css")).css() }),
    LanguageDescription.of({ name: "json", load: async () => (await import("@codemirror/lang-json")).json() }),
  ],
}),
```

Add to the extensions array:

```typescript
search(),
highlightSelectionMatches(),
bracketMatching(),
foldGutter(),
markdownFoldService,
keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, ...tableKeymap]),
```

- [ ] **Step 3: Update theme to show fold gutter but hide line number gutter**

In `cm-theme.ts`, replace the gutters rule:

```typescript
".cm-gutters": {
  backgroundColor: "var(--color-bg, #f4f0e8)",
  border: "none",
  width: "24px",
},
".cm-gutter-lint, .cm-lineNumbers": {
  display: "none",
},
".cm-foldGutter": {
  width: "16px",
},
".cm-foldGutter .cm-gutterElement": {
  padding: "0 2px",
  cursor: "pointer",
  color: "var(--color-text-muted, #6b7265)",
  fontSize: "12px",
},
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/
git commit -m "feat: add search (Cmd+F), bracket matching, code highlighting, and header folding"
```

---

### Task 3: Decoration Enhancements — Checkboxes, Strikethrough, Callouts, Nested Lists

**Files:**
- Modify: `src/components/editor/cm-decorations.ts`
- Modify: `src/components/editor/cm-theme.ts`

This task adds 4 new decoration types to the existing live preview plugin. The subagent should read the current `cm-decorations.ts` and add cases to the `tree.iterate({ enter })` callback.

- [ ] **Step 1: Add checkbox widget and strikethrough to cm-decorations.ts**

Add a `CheckboxWidget` class that renders a checkbox input. On click, it dispatches a transaction that toggles `[ ]` ↔ `[x]` in the source:

```typescript
class CheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean, private readonly pos: number) {
    super();
  }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-task-checkbox";
    input.style.cursor = "pointer";
    input.style.marginRight = "4px";
    input.addEventListener("click", (e) => {
      e.preventDefault();
      const newText = this.checked ? "[ ]" : "[x]";
      view.dispatch({ changes: { from: this.pos, to: this.pos + 3, insert: newText } });
    });
    return input;
  }
  eq(other: CheckboxWidget): boolean { return this.checked === other.checked; }
  ignoreEvent(): boolean { return false; }
}
```

Add to the `tree.iterate` callback:

```typescript
// --- Task checkboxes ---
if (name === "TaskMarker") {
  const text = state.doc.sliceString(from, to);
  const isChecked = text.includes("x") || text.includes("X");
  addDeco(from, to, Decoration.replace({
    widget: new CheckboxWidget(isChecked, from),
  }));
  return;
}

// --- Strikethrough ---
if (name === "Strikethrough") {
  addDeco(from, to, Decoration.mark({ class: "cm-strikethrough" }));
  const cursor = node.node.cursor();
  if (cursor.firstChild()) {
    do {
      if (cursor.name === "StrikethroughMark") {
        addDeco(cursor.from, cursor.to, Decoration.replace({}));
      }
    } while (cursor.nextSibling());
  }
  return;
}
```

- [ ] **Step 2: Add callout detection to blockquote handler**

Enhance the existing `Blockquote` case in cm-decorations.ts. Instead of just applying a class, check if the first line contains `[!type]`:

```typescript
if (name === "Blockquote") {
  const firstLine = state.doc.lineAt(from).text;
  const calloutMatch = />\s*\[!(\w+)\]/.exec(firstLine);
  if (calloutMatch) {
    const calloutType = calloutMatch[1].toLowerCase();
    addDeco(from, to, Decoration.mark({ class: `cm-callout cm-callout-${calloutType}` }));
  } else {
    addDeco(from, to, Decoration.mark({ class: "cm-blockquote" }));
  }
  return;
}
```

- [ ] **Step 3: Add nested list level detection**

Enhance the `ListMark` handler to detect indentation level:

```typescript
if (name === "ListMark") {
  const markText = state.doc.sliceString(from, to);
  if (markText === "-" || markText === "*" || markText === "+") {
    // Detect indent level
    const line = state.doc.lineAt(from);
    const indent = from - line.from;
    const level = Math.floor(indent / 2); // 0, 1, 2, ...
    const bullets = ["•", "◦", "▪"];
    const bullet = bullets[Math.min(level, bullets.length - 1)];

    addDeco(from, to, Decoration.replace({
      widget: new (class extends WidgetType {
        toDOM(): HTMLElement {
          const span = document.createElement("span");
          span.textContent = bullet;
          span.style.marginRight = "4px";
          span.style.color = level === 0 ? "#1a1f17" : "#6b7265";
          return span;
        }
        eq(): boolean { return true; }
      })(),
    }));
  }
}
```

- [ ] **Step 4: Add CSS classes to cm-theme.ts**

Add these styles to the theme:

```typescript
".cm-strikethrough": {
  textDecoration: "line-through",
  color: "var(--color-text-muted, #6b7265)",
},
".cm-task-checkbox": {
  cursor: "pointer",
  verticalAlign: "middle",
  width: "16px",
  height: "16px",
  accentColor: "var(--color-accent, #2d6a4f)",
},
// Callout blocks
".cm-callout": {
  borderLeft: "3px solid",
  paddingLeft: "12px",
  borderRadius: "4px",
  padding: "8px 12px",
  marginBottom: "8px",
},
".cm-callout-note, .cm-callout-info": {
  borderColor: "#4a90d9",
  backgroundColor: "rgba(74, 144, 217, 0.06)",
},
".cm-callout-warning": {
  borderColor: "#d4a32a",
  backgroundColor: "rgba(212, 163, 42, 0.06)",
},
".cm-callout-tip": {
  borderColor: "#2d6a4f",
  backgroundColor: "rgba(45, 106, 79, 0.06)",
},
".cm-callout-example": {
  borderColor: "#7c3aed",
  backgroundColor: "rgba(124, 58, 237, 0.06)",
},
".cm-callout-danger": {
  borderColor: "#b85c3a",
  backgroundColor: "rgba(184, 92, 58, 0.06)",
},
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npx biome check --write .`

```bash
git add src/components/editor/cm-decorations.ts src/components/editor/cm-theme.ts
git commit -m "feat: add checkboxes, strikethrough, callout blocks, and nested list bullets"
```

---

### Task 4: Status Bar + Breadcrumb

**Files:**
- Create: `src/components/editor/StatusBar.tsx`
- Modify: `src/pages/ChapterView.tsx`

- [ ] **Step 1: Create StatusBar component**

Create `src/components/editor/StatusBar.tsx`:

```tsx
import { type EditorView } from "@codemirror/view";
import { useEffect, useState } from "react";

interface StatusInfo {
  words: number;
  chars: number;
  line: number;
  col: number;
}

export function StatusBar({ view }: { view: EditorView | null }) {
  const [info, setInfo] = useState<StatusInfo>({ words: 0, chars: 0, line: 1, col: 1 });

  useEffect(() => {
    if (!view) return;

    const update = () => {
      const doc = view.state.doc.toString();
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.head);
      setInfo({
        words: doc.trim() ? doc.trim().split(/\s+/).length : 0,
        chars: doc.length,
        line: line.number,
        col: sel.head - line.from + 1,
      });
    };

    update();
    // Poll on a short interval since we can't easily subscribe from outside
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [view]);

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border-subtle bg-bg px-5 py-1.5 text-[11px] text-text-muted">
      <div className="flex gap-4">
        <span>{info.words} words</span>
        <span>{info.chars} characters</span>
      </div>
      <span>Ln {info.line}, Col {info.col}</span>
    </div>
  );
}
```

- [ ] **Step 2: Integrate StatusBar and breadcrumb into ChapterView**

In `src/pages/ChapterView.tsx`:

1. Import `StatusBar` and expose `viewRef` from the MarkdownEditor (the subagent should check how to access the EditorView instance — either expose it via ref or pass it up via callback)

2. Add breadcrumb: show subject name in the header subtitle. The `ReaderSession` already has `chapter.title` but not subject name. The subagent should check if subject name is available or needs to be loaded separately.

3. Add StatusBar below the editor (before the closing `</div>` of the flex column)

- [ ] **Step 3: Verify and commit**

```bash
git add src/components/editor/StatusBar.tsx src/pages/ChapterView.tsx
git commit -m "feat: add status bar (word count, cursor position) and breadcrumb"
```

---

### Task 5: Math/LaTeX Rendering

**Files:**
- Create: `src/components/editor/cm-math.ts`
- Modify: `src/components/editor/MarkdownEditor.tsx`

- [ ] **Step 1: Create KaTeX math extension**

Create `src/components/editor/cm-math.ts`:

```typescript
import { EditorView, Decoration, WidgetType, ViewPlugin, type ViewUpdate, type DecorationSet } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import katex from "katex";
import "katex/dist/katex.min.css";

class MathWidget extends WidgetType {
  constructor(private readonly tex: string, private readonly block: boolean) {
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
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc.toString();
  const cursor = state.selection.main;

  // Block math: $$...$$
  const blockRegex = /\$\$([\s\S]*?)\$\$/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (cursor.from >= from && cursor.to <= to) continue;
    decorations.push({
      from, to,
      decoration: Decoration.replace({ widget: new MathWidget(match[1].trim(), true), block: true }),
    });
  }

  // Inline math: $...$  (not $$)
  const inlineRegex = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;
  while ((match = inlineRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (cursor.from >= from && cursor.to <= to) continue;
    decorations.push({
      from, to,
      decoration: Decoration.replace({ widget: new MathWidget(match[1], false) }),
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
```

- [ ] **Step 2: Add to MarkdownEditor**

Import and add `mathRendering` to the extensions array in MarkdownEditor.tsx.

- [ ] **Step 3: Verify and commit**

```bash
git add src/components/editor/cm-math.ts src/components/editor/MarkdownEditor.tsx
git commit -m "feat: add KaTeX math rendering for inline and block math"
```

---

### Task 6: Outline/TOC Panel

**Files:**
- Create: `src/components/editor/OutlinePanel.tsx`
- Modify: `src/pages/ChapterView.tsx`

- [ ] **Step 1: Create OutlinePanel**

Create `src/components/editor/OutlinePanel.tsx`:

```tsx
import { List } from "lucide-react";
import { useState } from "react";

interface HeadingEntry {
  level: number;
  text: string;
  line: number;
}

export function OutlinePanel({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate: (line: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const headings: HeadingEntry[] = content
    .split("\n")
    .map((text, i) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(text);
      if (!match) return null;
      return { level: match[1].length, text: match[2], line: i + 1 };
    })
    .filter((h): h is HeadingEntry => h !== null);

  if (headings.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
        title="Outline"
      >
        <List size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-border bg-panel p-3 shadow-xl">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Outline
          </p>
          <div className="max-h-64 overflow-auto">
            {headings.map((h) => (
              <button
                key={`${h.line}-${h.text}`}
                type="button"
                onClick={() => {
                  onNavigate(h.line);
                  setOpen(false);
                }}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-text-muted transition-colors hover:bg-panel-active hover:text-text"
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
              >
                {h.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into ChapterView**

Add `OutlinePanel` to the header, passing `editorContent` and an `onNavigate` callback that scrolls the editor to the given line.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/OutlinePanel.tsx src/pages/ChapterView.tsx
git commit -m "feat: add outline/TOC panel with heading navigation"
```

---

### Task 7: Theme System

**Files:**
- Create: `src/lib/themes.ts`
- Create: `src/components/layout/ThemeProvider.tsx`
- Modify: `src/components/editor/cm-theme.ts`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/index.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create theme definitions**

Create `src/lib/themes.ts` with 5 built-in themes. Each theme is an object mapping CSS variable names to values:

```typescript
export interface Theme {
  name: string;
  label: string;
  colors: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    name: "parchment",
    label: "Parchment",
    colors: {
      "--color-bg": "#f4f0e8",
      "--color-surface": "#ebe5d9",
      "--color-panel": "#faf8f3",
      "--color-panel-alt": "#f0ece3",
      "--color-panel-active": "#e4dfd4",
      "--color-border": "#c8c1b0",
      "--color-border-subtle": "#d6d0c3",
      "--color-border-strong": "#a8b5a0",
      "--color-text": "#1a1f17",
      "--color-text-muted": "#6b7265",
      "--color-accent": "#2d6a4f",
      "--color-accent-soft": "#d8e2dc",
    },
  },
  {
    name: "dark",
    label: "Dark",
    colors: {
      "--color-bg": "#1e1e1e",
      "--color-surface": "#252526",
      "--color-panel": "#2d2d2d",
      "--color-panel-alt": "#333333",
      "--color-panel-active": "#3c3c3c",
      "--color-border": "#404040",
      "--color-border-subtle": "#353535",
      "--color-border-strong": "#505050",
      "--color-text": "#d4d4d4",
      "--color-text-muted": "#808080",
      "--color-accent": "#4ec9b0",
      "--color-accent-soft": "#2d4a44",
    },
  },
  {
    name: "nord",
    label: "Nord",
    colors: {
      "--color-bg": "#2e3440",
      "--color-surface": "#3b4252",
      "--color-panel": "#434c5e",
      "--color-panel-alt": "#4c566a",
      "--color-panel-active": "#4c566a",
      "--color-border": "#4c566a",
      "--color-border-subtle": "#434c5e",
      "--color-border-strong": "#d8dee9",
      "--color-text": "#eceff4",
      "--color-text-muted": "#81a1c1",
      "--color-accent": "#88c0d0",
      "--color-accent-soft": "#3b4a5a",
    },
  },
  {
    name: "dracula",
    label: "Dracula",
    colors: {
      "--color-bg": "#282a36",
      "--color-surface": "#21222c",
      "--color-panel": "#343746",
      "--color-panel-alt": "#3e4152",
      "--color-panel-active": "#44475a",
      "--color-border": "#44475a",
      "--color-border-subtle": "#383a4a",
      "--color-border-strong": "#6272a4",
      "--color-text": "#f8f8f2",
      "--color-text-muted": "#6272a4",
      "--color-accent": "#bd93f9",
      "--color-accent-soft": "#3d3566",
    },
  },
  {
    name: "solarized",
    label: "Solarized Light",
    colors: {
      "--color-bg": "#fdf6e3",
      "--color-surface": "#eee8d5",
      "--color-panel": "#fdf6e3",
      "--color-panel-alt": "#eee8d5",
      "--color-panel-active": "#e0dbc8",
      "--color-border": "#d0c8b0",
      "--color-border-subtle": "#ddd6c1",
      "--color-border-strong": "#93a1a1",
      "--color-text": "#073642",
      "--color-text-muted": "#586e75",
      "--color-accent": "#268bd2",
      "--color-accent-soft": "#d5e8f0",
    },
  },
];
```

- [ ] **Step 2: Create ThemeProvider**

Create `src/components/layout/ThemeProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { THEMES, type Theme } from "../../lib/themes";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (name: string) => void;
  customCSS: string;
  setCustomCSS: (css: string) => void;
}>({
  theme: THEMES[0],
  setTheme: () => {},
  customCSS: "",
  setCustomCSS: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState(
    () => localStorage.getItem("encode-theme") ?? "parchment",
  );
  const [customCSS, setCustomCSS] = useState(
    () => localStorage.getItem("encode-custom-css") ?? "",
  );

  const theme = THEMES.find((t) => t.name === themeName) ?? THEMES[0];

  // Apply theme CSS variables to :root
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(key, value);
    }
  }, [theme]);

  // Apply custom CSS
  useEffect(() => {
    let styleEl = document.getElementById("encode-custom-css");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "encode-custom-css";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = customCSS;
  }, [customCSS]);

  const handleSetTheme = (name: string) => {
    setThemeName(name);
    localStorage.setItem("encode-theme", name);
  };

  const handleSetCustomCSS = (css: string) => {
    setCustomCSS(css);
    localStorage.setItem("encode-custom-css", css);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, customCSS, setCustomCSS: handleSetCustomCSS }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 3: Refactor cm-theme.ts to use CSS variables**

Replace all hardcoded hex values in `cm-theme.ts` with `var(--color-*)` references. The subagent should read the current file and replace each hex value with the corresponding CSS variable.

- [ ] **Step 4: Wrap app in ThemeProvider**

In `src/main.tsx` or `src/App.tsx`, wrap the app with `<ThemeProvider>`.

- [ ] **Step 5: Add theme selector to Settings page**

In `src/pages/Settings.tsx`, add a "Theme" section with:
- Grid of theme cards (click to select, show active with accent border)
- Custom CSS textarea
- Use `useTheme()` hook

- [ ] **Step 6: Verify and commit**

```bash
git add src/lib/themes.ts src/components/layout/ThemeProvider.tsx src/components/editor/cm-theme.ts src/pages/Settings.tsx src/main.tsx src/App.tsx
git commit -m "feat: add theme system with 5 built-in themes and custom CSS support"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run all gates**

Run: `cargo test` (from `src-tauri/`)
Run: `npx tsc --noEmit && npx biome check . && npm test`

- [ ] **Step 2: Visual verification**

Run: `npm run tauri dev`

Verify all 13 features:
1. `- [ ]` renders as checkbox, clicking toggles it
2. `~~strikethrough~~` renders with line-through
3. Cmd+F opens search bar
4. Bracket matching highlights
5. Status bar shows word count + cursor position
6. Header shows breadcrumb path
7. `> [!note]` renders as blue callout block
8. ` ```js ` code block has colored syntax
9. Click fold triangle next to heading → content collapses
10. Nested lists show different bullet styles (•, ◦, ▪)
11. `$x^2$` renders as math, `$$\int$$` renders as block math
12. Outline button shows heading TOC, clicking scrolls
13. Settings → theme selector works, custom CSS applies
