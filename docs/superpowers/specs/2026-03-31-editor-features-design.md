# Editor Feature Parity — Design Spec

## Problem

The CodeMirror editor is functional but missing standard markdown editing features that users expect. Checkboxes, strikethrough, search, code highlighting, callouts, and folding are all absent.

## Solution

Implement 12 editor features in two tiers: 6 quick wins (Easy) and 6 core gaps (Medium). All changes are frontend-only — no backend work needed.

## Phase 1: Quick Wins

### 1. Task/Checkbox Rendering
- `- [ ]` renders as unchecked checkbox, `- [x]` as checked
- Clicking the checkbox toggles the state in the source document
- Add `TaskMarker` handling in `cm-decorations.ts`
- CSS: `.cm-task-checkbox { cursor: pointer; }`

### 2. Strikethrough
- `~~text~~` renders with line-through styling, `~~` markers hidden when cursor is away
- Handle `Strikethrough` and `StrikethroughMark` nodes in `cm-decorations.ts`
- CSS: `.cm-strikethrough { text-decoration: line-through; }`

### 3. In-Editor Search (Cmd+F)
- Import `search`, `searchKeymap`, `highlightSelectionMatches` from `@codemirror/search`
- Add to MarkdownEditor extensions array
- Already installed in the `codemirror` meta-package

### 4. Bracket Matching
- Import `bracketMatching` from `@codemirror/language`
- Add to MarkdownEditor extensions array
- One line

### 5. Status Bar
- React component below the editor showing: word count, character count, line:column
- Listen to EditorView.updateListener for selection/doc changes
- Style: `text-xs text-text-muted` bar at bottom

### 6. Breadcrumb Navigation
- Show "Subject > Chapter" in the ChapterView header
- Load subject name from the session data
- Simple text addition

## Phase 2: Core Gaps

### 7. Callout Block Rendering
- Detect `> [!type]` pattern in Blockquote nodes
- Types: note (blue), warning (orange), tip (green), example (purple), info (blue), danger (red)
- Render as colored container with icon and type label
- When cursor is inside, show raw blockquote syntax

### 8. Syntax-Highlighted Code Blocks
- Use `codeLanguages` option in `markdown()` config
- Support: JavaScript/TypeScript, Python, Rust, HTML, CSS, SQL, JSON, Bash
- Import language packs from `@codemirror/lang-*`
- Install: `npm install @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-rust @codemirror/lang-html @codemirror/lang-css @codemirror/lang-sql @codemirror/lang-json`

### 9. Folding/Collapsing Headers
- Use `foldGutter()` and `foldKeymap` from `@codemirror/language`
- Custom `foldService` that defines fold ranges from heading to next heading of equal/higher level
- Show fold gutter (small triangles) — update theme to show minimal gutter for fold indicators only

### 10. Nested List Indentation
- In `cm-decorations.ts`, check indentation level of `ListItem` nodes
- Apply different bullet styles per level (disc → circle → square)
- Add visual indent guides (subtle left borders)

### 11. Math/LaTeX Rendering
- Install `katex` package
- Detect `$$...$$` (block) and `$...$` (inline) patterns
- Replace with widget that calls `katex.renderToString()`
- Import KaTeX CSS for proper rendering

### 12. Outline/TOC Panel
- React component showing all headings as a clickable tree
- Parse headings from editor content
- Click scrolls to heading position
- Show in a collapsible right panel or as part of the header

## Files to Modify

| File | Changes |
|---|---|
| `src/components/editor/cm-decorations.ts` | Add checkbox, strikethrough, callout handling |
| `src/components/editor/cm-theme.ts` | Add strikethrough, callout, checkbox CSS classes |
| `src/components/editor/MarkdownEditor.tsx` | Add search, bracket matching, folding, code languages |
| `src/components/editor/cm-math.ts` | Create — KaTeX math rendering extension |
| `src/components/editor/StatusBar.tsx` | Create — word count, cursor position |
| `src/components/editor/OutlinePanel.tsx` | Create — heading TOC |
| `src/pages/ChapterView.tsx` | Add status bar, outline panel, breadcrumb |
| `package.json` | Add KaTeX + language packs |

## Phase 3: Theme System

### 13. Theme System with Custom CSS

**Built-in themes** (5 total):
- **Parchment** (current) — warm papyrus, forest green accents
- **Dark** — dark charcoal bg, light text, green accents
- **Nord** — cool blue-gray palette (nord0-nord15)
- **Dracula** — dark purple bg, colorful syntax
- **Solarized Light** — warm cream, blue accents

**How it works:**
- All app colors go through CSS custom properties (already partially done in `index.css` `@theme` block)
- Fix `cm-theme.ts` to use `var(--color-*)` instead of hardcoded hex values
- Each theme is a CSS file that overrides the `@theme` variables
- Theme selection saved in Settings (stored in SQLite `settings` table)
- Switching themes swaps which CSS variables are active

**Custom CSS support:**
- Settings page gets a "Custom CSS" textarea where users paste CSS snippets
- Snippets are injected as a `<style>` tag in the document head
- Stored in `settings` table as a string
- Users can override any CSS variable or add new styles
- Like Obsidian's "CSS Snippets" feature

**Files:**
- `src/lib/themes.ts` — Create: theme definitions (CSS variable overrides per theme)
- `src/components/layout/ThemeProvider.tsx` — Create: applies active theme's CSS variables
- `src/components/editor/cm-theme.ts` — Modify: use `var(--color-*)` instead of hex values
- `src/pages/Settings.tsx` — Modify: add theme selector + custom CSS editor
- `src/index.css` — Modify: ensure all colors use the `@theme` variables

## What NOT to Build

- No internal links (`[[...]]`)
- No graph view
- No backlinks
- No split view
- No tab bar
