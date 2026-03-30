# Markdown Editor (Obsidian-style) — Design Spec

## Problem

Users can't create or edit chapter content directly in the app. They can only import URLs or paste raw markdown into a basic textarea. There's no real editing experience — no live preview, no formatting, no way to just open a chapter and type notes like in Obsidian.

## Solution

Add an Obsidian-style live preview markdown editor to the Chapter View page using CodeMirror 6. Users can toggle between Read mode (current rendered view) and Edit mode (CodeMirror with live preview decorations). Auto-saves on a 2-second debounce. On save, content is re-chunked into sections.

## Architecture

### Editor Component

**`src/components/editor/MarkdownEditor.tsx`** — CodeMirror 6 editor with:
- Markdown syntax highlighting (`@codemirror/lang-markdown`)
- Live preview decorations: headings render as styled headings, bold/italic render inline, code blocks styled, links clickable — same as Obsidian's Live Preview
- When cursor is on a markdown line (e.g., `## Heading`), the raw syntax is visible for editing. When cursor moves away, it renders as a heading.
- Parchment-themed styling matching the app's color scheme
- Controlled component: receives `value` and `onChange` props

### Chapter View Update

The existing Chapter View page (`/chapter?id=X`) gets:
- A **pencil icon toggle** in the header to switch between Read/Edit mode
- **Read mode**: current rendered markdown (unchanged)
- **Edit mode**: full-screen CodeMirror editor replacing the content area
- **Auto-save**: 2-second debounce after last keystroke, calls `updateChapterContent` IPC
- **Visual save indicator**: small "Saved" / "Saving..." text near the toggle

### Backend — 1 New IPC Command

**`chapter.update_content(chapter_id, markdown)`** → `Chapter`

1. Delete all existing `chapter_sections` for this chapter
2. Run `chunker::split_into_sections(markdown)` to get new sections
3. Insert new sections into `chapter_sections`
4. Update FTS5 index (triggers handle this automatically)
5. Recalculate `estimated_minutes` from total word count
6. Update `chapters.updated_at`
7. Return updated Chapter

Note: section study progress (status) is reset when content changes. This is acceptable — if you restructure your notes, you should re-study them.

### Library "New Chapter" Flow Update

The existing "New Chapter" modal in Library has a basic textarea. Update it to:
- Create the chapter with empty content (or minimal placeholder)
- Navigate to `/chapter?id=X` in edit mode immediately
- User starts typing in the full editor right away

### CodeMirror Dependencies

Already in `package.json` from v1:
- `@codemirror/lang-markdown`
- `@codemirror/state`
- `@codemirror/view`
- `codemirror`

Need to verify these are still installed. If not, `npm install` them.

### Live Preview Decorations

CodeMirror 6 decorations that transform markdown while editing:

| Markdown | Rendered (cursor away) | Editing (cursor on line) |
|---|---|---|
| `## Heading` | **Heading** (large, bold) | `## Heading` (visible syntax) |
| `**bold**` | **bold** | `**bold**` |
| `*italic*` | *italic* | `*italic*` |
| `` `code` `` | `code` (styled) | `` `code` `` |
| `- item` | • item (bullet) | `- item` |
| `[link](url)` | link (clickable) | `[link](url)` |
| `> quote` | Styled blockquote | `> quote` |
| ``` ```code``` ``` | Code block (styled) | Raw fences visible |

### Table Support

**Live table rendering**: Markdown tables render as formatted tables with aligned columns, visible borders, and styled headers. When cursor enters a table, the raw markdown pipes are visible for editing.

**Table insertion**: Slash command `/table` inserts a 3x3 table template:
```
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell     | Cell     | Cell     |
| Cell     | Cell     | Cell     |
```

**Table navigation**: Tab moves to the next cell, Shift+Tab moves back. Enter in the last row adds a new row.

**Add column/row**: When cursor is inside a table, show small `+` buttons at the right edge (add column) and bottom edge (add row).

### Slash Commands

Type `/` at the start of a line to open a floating command menu:

| Command | Inserts |
|---|---|
| `/heading` or `/h2` | `## ` |
| `/heading3` or `/h3` | `### ` |
| `/table` | 3x3 table template |
| `/code` | Fenced code block |
| `/quote` | `> ` blockquote |
| `/divider` | `---` horizontal rule |
| `/bullet` | `- ` list item |
| `/numbered` | `1. ` numbered list |
| `/todo` | `- [ ] ` checkbox |
| `/callout` | `> [!note]` callout box (types: note, warning, tip, example) |
| `/collapse` | `<details><summary>Title</summary>` collapsible section |
| `/flashcard` | `Q: ...\nA: ...` flashcard template (auto-creates card on save) |
| `/definition` | `**Term**: definition` formatted pair |
| `/formula` | `$$\n\n$$` LaTeX math block |
| `/image` | `![alt](url)` image placeholder |
| `/link` | `[text](url)` link template |
| `/date` | Today's date (e.g., 2026-03-30) |
| `/timestamp` | Date + time (e.g., 2026-03-30 14:30) |

The menu filters as you type (e.g., `/ta` shows only "table"). Arrow keys to navigate, Enter to select, Escape to dismiss.

### Image Support

**URL images**: `![alt](https://example.com/photo.png)` renders the image inline in the editor. CodeMirror decoration replaces the markdown with the actual image when cursor is not on the line.

**Paste from clipboard**: Paste an image (Cmd+V / Ctrl+V) → the app saves the image to `vault_path/images/{uuid}.{ext}` via a new IPC command → inserts `![](images/{uuid}.png)` at the cursor position.

**Drag and drop**: Drag an image file onto the editor → same save + insert flow as paste.

**Backend IPC**: `chapter.save_image(data: Vec<u8>, extension: String)` → saves to `images/{uuid}.{ext}` using `VaultFs::write_atomic`, returns the relative path. CSP already allows `img-src 'self' data:`.

**Image rendering**: Images render at max-width 100% of the editor, maintaining aspect ratio. Clicking an image could open it full-size in a modal (future enhancement).

### Editor Theming

Match the app's parchment palette:
- Background: `--color-panel` (#faf8f3)
- Text: `--color-text` (#1a1f17)
- Cursor: `--color-accent` (#2d6a4f)
- Selection: `--color-accent-soft` (#d8e2dc)
- Line numbers: `--color-text-muted` (#6b7265)
- Code blocks: `--color-panel-alt` (#f0ece3)

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/editor/MarkdownEditor.tsx` | Create — CodeMirror 6 editor with live preview |
| `src/components/editor/cm-theme.ts` | Create — Parchment color theme for CodeMirror |
| `src/components/editor/cm-decorations.ts` | Create — Live preview markdown decorations |
| `src/components/editor/cm-tables.ts` | Create — Table rendering, navigation (Tab), add row/column |
| `src/components/editor/SlashMenu.tsx` | Create — Floating slash command menu |
| `src/components/editor/cm-images.ts` | Create — Image paste/drag handler + inline rendering |
| `src/pages/ChapterView.tsx` | Modify — Add edit/read toggle, integrate editor |
| `src/pages/Library.tsx` | Modify — "New Chapter" navigates to edit mode |
| `src-tauri/src/services/chapter.rs` | Create — update_content function |
| `src-tauri/src/services/mod.rs` | Modify — export chapter module |
| `src-tauri/src/commands/library.rs` | Modify — add update_chapter_content command |
| `src-tauri/src/lib.rs` | Modify — register command |
| `src/lib/tauri.ts` | Modify — add updateChapterContent + saveImage IPC wrappers |

## What NOT to Build

- No file-based storage for text content (content lives in SQLite; images saved to vault filesystem)
- No vim mode
- No collaborative editing
- No markdown preview panel (live preview decorations handle this inline)

## Verification

1. `cargo test` — chapter content update tests (re-chunking, section replacement)
2. `npx tsc --noEmit` — zero errors
3. Manual: open Chapter View → toggle to Edit → type markdown → headings/bold render live → auto-saves → toggle back to Read → content updated → Reader shows new sections
