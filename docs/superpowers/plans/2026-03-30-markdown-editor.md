# Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Obsidian-style live preview markdown editor with slash commands, table support, and image paste/drag to the Chapter View page.

**Architecture:** CodeMirror 6 editor with modular extensions: theme, live preview decorations, table handling, slash command menu, and image paste/drag. Each extension is an independent file. A Rust backend command handles content updates (re-chunking) and image saving. The Chapter View page toggles between Read/Edit mode.

**Tech Stack:** CodeMirror 6 (@codemirror/view, @codemirror/state, @codemirror/lang-markdown), React 18, TypeScript, Rust (rusqlite, Tauri 2)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/services/chapter.rs` | Create | update_content (re-chunk) + save_image |
| `src-tauri/src/services/mod.rs` | Modify | Export chapter module |
| `src-tauri/src/commands/library.rs` | Modify | Add 2 new IPC commands |
| `src-tauri/src/lib.rs` | Modify | Register commands |
| `src/lib/tauri.ts` | Modify | Add IPC wrappers |
| `src/components/editor/cm-theme.ts` | Create | Parchment CodeMirror theme |
| `src/components/editor/cm-decorations.ts` | Create | Live preview markdown decorations |
| `src/components/editor/cm-slash.ts` | Create | Slash command extension |
| `src/components/editor/SlashMenu.tsx` | Create | Floating slash command React component |
| `src/components/editor/cm-tables.ts` | Create | Table Tab navigation |
| `src/components/editor/cm-images.ts` | Create | Image paste/drag handler |
| `src/components/editor/MarkdownEditor.tsx` | Create | Main editor component combining all extensions |
| `src/pages/ChapterView.tsx` | Modify | Add edit/read toggle |
| `src/pages/Library.tsx` | Modify | New chapter → edit mode |

---

### Task 1: Install CodeMirror Dependencies

- [ ] **Step 1: Install packages**

```bash
npm install codemirror @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/language @codemirror/commands @codemirror/autocomplete @lezer/highlight
```

- [ ] **Step 2: Verify installation**

Run: `npx tsc --noEmit`
Expected: 0 errors (packages have types included)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install CodeMirror 6 dependencies"
```

---

### Task 2: Backend — Chapter Content Update + Image Save

**Files:**
- Create: `src-tauri/src/services/chapter.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/commands/library.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Create chapter service**

Create `src-tauri/src/services/chapter.rs`:

```rust
use rusqlite::Connection;
use crate::services::chunker;

pub fn update_content(conn: &Connection, chapter_id: i64, markdown: &str) -> Result<(), String> {
    // Delete existing sections
    conn.execute(
        "DELETE FROM chapter_sections WHERE chapter_id = ?1",
        [chapter_id],
    ).map_err(|e| format!("Failed to delete sections: {e}"))?;

    // Re-chunk the markdown
    let sections = chunker::split_into_sections(markdown);

    // Insert new sections
    for section in &sections {
        conn.execute(
            "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'unseen')",
            rusqlite::params![
                chapter_id,
                section.section_index,
                section.heading,
                section.body_markdown,
                section.word_count,
            ],
        ).map_err(|e| format!("Failed to insert section: {e}"))?;
    }

    // Update chapter estimated_minutes and updated_at
    let total_words: i32 = sections.iter().map(|s| s.word_count).sum();
    let estimated_minutes = (total_words as f64 / 200.0).ceil() as i64;

    conn.execute(
        "UPDATE chapters SET estimated_minutes = ?2, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![chapter_id, estimated_minutes],
    ).map_err(|e| format!("Failed to update chapter: {e}"))?;

    Ok(())
}

pub fn save_image(vault_path: &std::path::Path, data: &[u8], extension: &str) -> Result<String, String> {
    let uuid = format!("{:x}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos());
    let relative_path = format!("images/{uuid}.{extension}");
    let full_path = vault_path.join(&relative_path);

    // Create images directory if needed
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create images dir: {e}"))?;
    }

    std::fs::write(&full_path, data)
        .map_err(|e| format!("Failed to save image: {e}"))?;

    Ok(relative_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_db() -> Database {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('test', 'Test', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, created_at, updated_at)
                 VALUES (1, 'Test Chapter', 'test', 'new', datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            // Insert initial sections
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (1, 0, 'Old Section', 'Old content.', 2, 'checked_correct')",
                [],
            ).unwrap();
            Ok(())
        });
        db
    }

    #[test]
    fn test_update_content_replaces_sections() {
        let db = setup_db();
        db.with_conn(|conn| {
            let markdown = "## New Section 1\n\nNew content here.\n\n## New Section 2\n\nMore content.";
            update_content(conn, 1, markdown).unwrap();

            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = 1",
                [], |r| r.get(0),
            ).unwrap();
            assert_eq!(count, 2);
            Ok(())
        });
    }

    #[test]
    fn test_update_content_resets_status_to_unseen() {
        let db = setup_db();
        db.with_conn(|conn| {
            let markdown = "## Fresh\n\nNew stuff.";
            update_content(conn, 1, markdown).unwrap();

            let status: String = conn.query_row(
                "SELECT status FROM chapter_sections WHERE chapter_id = 1 AND section_index = 0",
                [], |r| r.get(0),
            ).unwrap();
            assert_eq!(status, "unseen");
            Ok(())
        });
    }

    #[test]
    fn test_update_content_recalculates_minutes() {
        let db = setup_db();
        db.with_conn(|conn| {
            // ~200 words = ~1 minute
            let words: Vec<String> = (0..200).map(|i| format!("word{i}")).collect();
            let markdown = format!("## Section\n\n{}", words.join(" "));
            update_content(conn, 1, &markdown).unwrap();

            let minutes: i64 = conn.query_row(
                "SELECT estimated_minutes FROM chapters WHERE id = 1",
                [], |r| r.get(0),
            ).unwrap();
            assert_eq!(minutes, 1);
            Ok(())
        });
    }

    #[test]
    fn test_save_image() {
        let dir = std::env::temp_dir().join("encode_test_images");
        let _ = std::fs::remove_dir_all(&dir);
        let data = b"fake png data";
        let result = save_image(&dir, data, "png").unwrap();
        assert!(result.starts_with("images/"));
        assert!(result.ends_with(".png"));
        assert!(dir.join(&result).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Export chapter module**

Add to `src-tauri/src/services/mod.rs`:
```rust
pub mod chapter;
```

- [ ] **Step 3: Add IPC commands to library.rs**

Add to `src-tauri/src/commands/library.rs`:

```rust
#[tauri::command]
pub fn update_chapter_content(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    markdown: String,
) -> Result<(), String> {
    state.db.with_conn(|conn| {
        crate::services::chapter::update_content(conn, chapter_id, &markdown)
    })
}

#[tauri::command]
pub fn save_image(
    state: tauri::State<'_, AppState>,
    data: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    crate::services::chapter::save_image(&state.vault_path, &data, &extension)
}
```

Register in `src-tauri/src/lib.rs` `tauri::generate_handler!`:
```rust
commands::library::update_chapter_content,
commands::library::save_image,
```

- [ ] **Step 4: Add frontend IPC wrappers**

Append to `src/lib/tauri.ts`:

```typescript
// Editor IPC
export const updateChapterContent = (chapterId: number, markdown: string) =>
  invoke<void>("update_chapter_content", { chapterId, markdown });

export const saveImage = (data: number[], extension: string) =>
  invoke<string>("save_image", { data, extension });
```

- [ ] **Step 5: Run tests**

Run: `cargo test` (from `src-tauri/`)
Expected: All tests pass including 4 new chapter tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/chapter.rs src-tauri/src/services/mod.rs src-tauri/src/commands/library.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat: add chapter content update and image save backend"
```

---

### Task 3: CodeMirror Theme

**Files:**
- Create: `src/components/editor/cm-theme.ts`

- [ ] **Step 1: Create parchment theme**

Create `src/components/editor/cm-theme.ts`:

```typescript
import { EditorView } from "@codemirror/view";

export const parchmentTheme = EditorView.theme({
  "&": {
    backgroundColor: "#faf8f3",
    color: "#1a1f17",
    fontSize: "14px",
    fontFamily: "'Inter', system-ui, sans-serif",
    lineHeight: "1.7",
  },
  ".cm-content": {
    padding: "24px 0",
    caretColor: "#2d6a4f",
  },
  ".cm-cursor": {
    borderLeftColor: "#2d6a4f",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#d8e2dc !important",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(45, 106, 79, 0.03)",
  },
  ".cm-gutters": {
    backgroundColor: "#faf8f3",
    color: "#6b7265",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(45, 106, 79, 0.05)",
    color: "#1a1f17",
  },
  // Markdown heading styles
  ".cm-heading-1": {
    fontSize: "1.5em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  ".cm-heading-2": {
    fontSize: "1.25em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  ".cm-heading-3": {
    fontSize: "1.1em",
    fontWeight: "600",
    lineHeight: "1.3",
  },
  // Code
  ".cm-code": {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: "0.9em",
    backgroundColor: "#f0ece3",
    padding: "1px 4px",
    borderRadius: "3px",
  },
  ".cm-fencedCode": {
    backgroundColor: "#f0ece3",
    padding: "12px",
    borderRadius: "8px",
  },
  // Blockquote
  ".cm-blockquote": {
    borderLeft: "3px solid #2d6a4f",
    paddingLeft: "12px",
    color: "#6b7265",
  },
  // Links
  ".cm-link": {
    color: "#2d6a4f",
    textDecoration: "underline",
  },
  // Bold/italic
  ".cm-strong": {
    fontWeight: "600",
  },
  ".cm-emphasis": {
    fontStyle: "italic",
  },
  // Table
  ".cm-table": {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: "0.9em",
  },
  // Image
  ".cm-image-widget img": {
    maxWidth: "100%",
    borderRadius: "8px",
    margin: "8px 0",
  },
  // Horizontal rule
  ".cm-hr": {
    borderTop: "1px solid #c8c1b0",
    display: "block",
    margin: "16px 0",
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/cm-theme.ts
git commit -m "feat: add parchment CodeMirror theme"
```

---

### Task 4: Slash Command Extension + Menu

**Files:**
- Create: `src/components/editor/cm-slash.ts`
- Create: `src/components/editor/SlashMenu.tsx`

- [ ] **Step 1: Create slash command definitions and extension**

Create `src/components/editor/cm-slash.ts`. This file defines the 19 slash commands and the CodeMirror extension that detects `/` at the start of a line.

The subagent should read the spec at `docs/superpowers/specs/2026-03-30-markdown-editor-design.md` (Slash Commands section) for the full list of 19 commands and implement:
- A `SLASH_COMMANDS` array with `{ name, label, description, insert }` for each command
- A CodeMirror `ViewPlugin` that watches for `/` typed at line start
- When triggered, shows a floating menu (via DOM overlay or React portal)
- Menu filters as user types, arrow keys navigate, Enter inserts, Escape dismisses
- `/date` inserts actual current date, `/timestamp` inserts date+time

- [ ] **Step 2: Create SlashMenu React component**

Create `src/components/editor/SlashMenu.tsx` — a positioned dropdown that renders the filtered command list. Receives `commands`, `filter`, `selectedIndex`, `onSelect`, `position` as props.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/cm-slash.ts src/components/editor/SlashMenu.tsx
git commit -m "feat: add slash command extension with 19 commands"
```

---

### Task 5: Live Preview Decorations

**Files:**
- Create: `src/components/editor/cm-decorations.ts`

- [ ] **Step 1: Create markdown decorations extension**

Create `src/components/editor/cm-decorations.ts`. This is the core Obsidian-like live preview:

- Uses `ViewPlugin` and `DecorationSet` from `@codemirror/view`
- Scans the document for markdown syntax using the syntax tree from `@codemirror/lang-markdown`
- When cursor is NOT on a line, replaces/decorates:
  - `## Heading` → styled heading (hide `## `, apply heading class)
  - `**bold**` → hide markers, apply `.cm-strong`
  - `*italic*` → hide markers, apply `.cm-emphasis`
  - `` `code` `` → hide backticks, apply `.cm-code`
  - `- item` → replace `-` with bullet `•`
  - `> quote` → apply `.cm-blockquote` class
  - `---` → replace with styled horizontal rule
  - `[text](url)` → hide URL part, show text as link
  - `![alt](url)` → render actual image widget
- When cursor IS on the line, show raw markdown (no decorations)

This is the most complex CodeMirror file. The subagent should use `syntaxTree` from `@codemirror/language` to walk the parse tree and apply `Decoration.replace` or `Decoration.widget` based on node types.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/cm-decorations.ts
git commit -m "feat: add Obsidian-style live preview markdown decorations"
```

---

### Task 6: Table Support + Image Handling

**Files:**
- Create: `src/components/editor/cm-tables.ts`
- Create: `src/components/editor/cm-images.ts`

- [ ] **Step 1: Create table extension**

Create `src/components/editor/cm-tables.ts`:
- Tab key handler: when cursor is inside a markdown table, Tab moves to next cell, Shift+Tab moves to previous cell
- Enter at end of last row adds a new row with empty cells matching column count
- Uses regex to detect table context: line matches `|...|` pattern

- [ ] **Step 2: Create image extension**

Create `src/components/editor/cm-images.ts`:
- Paste handler: intercepts `paste` event, checks for image data in clipboard
- If image found: converts to `Uint8Array`, calls `saveImage` IPC, inserts `![](images/uuid.ext)` at cursor
- Drag handler: intercepts `drop` event for image files, same flow
- Import `saveImage` from `../../lib/tauri`

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/cm-tables.ts src/components/editor/cm-images.ts
git commit -m "feat: add table navigation and image paste/drag extensions"
```

---

### Task 7: Main Editor Component

**Files:**
- Create: `src/components/editor/MarkdownEditor.tsx`

- [ ] **Step 1: Create MarkdownEditor component**

Create `src/components/editor/MarkdownEditor.tsx`:

```tsx
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { useEffect, useRef } from "react";
import { parchmentTheme } from "./cm-theme";
import { livePreviewDecorations } from "./cm-decorations";
import { slashCommandExtension } from "./cm-slash";
import { tableKeymap } from "./cm-tables";
import { imageDropHandler } from "./cm-images";

export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        parchmentTheme,
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...tableKeymap]),
        livePreviewDecorations,
        slashCommandExtension,
        imageDropHandler,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only mount once

  // Sync external value changes (e.g., after save confirmation)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto"
    />
  );
}
```

Note: The exact imports for each extension (`livePreviewDecorations`, `slashCommandExtension`, `tableKeymap`, `imageDropHandler`) depend on what Tasks 4-6 export. The subagent should read those files and adjust imports accordingly.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/MarkdownEditor.tsx
git commit -m "feat: add MarkdownEditor component combining all CodeMirror extensions"
```

---

### Task 8: Chapter View — Edit/Read Toggle + Auto-Save

**Files:**
- Modify: `src/pages/ChapterView.tsx`
- Modify: `src/pages/Library.tsx`

- [ ] **Step 1: Add edit mode to ChapterView**

In `src/pages/ChapterView.tsx`:

1. Add imports: `MarkdownEditor` from editor component, `Pencil` and `Eye` from lucide, `updateChapterContent` from tauri
2. Add state: `editMode: boolean` (default false), `editorContent: string`, `saveStatus: 'saved' | 'saving' | 'idle'`
3. Add a pencil/eye toggle button in the header next to "Start Study"
4. When `editMode` is true, replace the scrollable sections with `<MarkdownEditor value={editorContent} onChange={handleChange} />`
5. `editorContent` initialized from concatenating all section markdowns (heading + body) on toggle
6. Auto-save with 2-second debounce: on change, set `saveStatus = 'saving'`, call `updateChapterContent(chapterId, content)`, then set `saveStatus = 'saved'`, reload session
7. Show save status indicator near the toggle button
8. Support URL query param `?edit=true` to open directly in edit mode

- [ ] **Step 2: Update Library "New Chapter" flow**

In `src/pages/Library.tsx`, update the `handleCreateChapter` function:
- After creating the chapter, navigate to `/chapter?id=${chapter.id}&edit=true` instead of staying on Library
- Remove the textarea content field from the create modal (just title + subject is enough)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx biome check --write . && npm test`

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChapterView.tsx src/pages/Library.tsx
git commit -m "feat: add edit/read toggle to ChapterView with auto-save"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run all gates**

Run: `cargo test` (from `src-tauri/`)
Run: `npx tsc --noEmit && npx biome check . && npm test`
Expected: All pass.

- [ ] **Step 2: Visual verification with Tauri dev**

Run: `npm run tauri dev`

Verify:
1. Chapter View → click pencil icon → editor opens with chapter content
2. Type `## New Heading` → renders as styled heading when cursor moves away
3. Type `**bold**` → renders bold inline
4. Type `/` at line start → slash menu appears with 19 commands
5. Select `/table` → 3x3 table inserted, Tab navigates cells
6. Paste an image from clipboard → image saved and rendered inline
7. Auto-save fires after 2 seconds of no typing → "Saved" indicator
8. Toggle back to Read mode → content reflects edits
9. Library → "New Chapter" → opens Chapter View in edit mode directly
10. Reader shows the new/updated sections
