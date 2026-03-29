# Chapter View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chapter View page for freeform reading (default when clicking a chapter), with a "Start Study" button for the Reader loop. Library cards show study progress.

**Architecture:** Modify the Rust `list_chapters` query to include section progress counts via a LEFT JOIN. Add a new `ChapterView.tsx` page that reuses `loadReaderSession` for data and `ReaderContent` for rendering. Update Library click targets.

**Tech Stack:** Rust (rusqlite), React 18, TypeScript, Tailwind CSS 4, marked + DOMPurify

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/commands/library.rs` | Modify | Add `section_count` and `checked_count` to Chapter struct + query |
| `src/lib/tauri.ts` | Modify | Update Chapter interface with new fields |
| `src/pages/ChapterView.tsx` | Create | Freeform chapter reading page |
| `src/App.tsx` | Modify | Add `/chapter` route |
| `src/pages/Library.tsx` | Modify | Change click target to `/chapter`, add progress bar |

---

### Task 1: Backend — Add Progress Counts to Chapter

**Files:**
- Modify: `src-tauri/src/commands/library.rs`

- [ ] **Step 1: Add fields to Chapter struct**

In `src-tauri/src/commands/library.rs`, add two fields to the `Chapter` struct:

```rust
#[derive(Debug, Serialize)]
pub struct Chapter {
    pub id: i64,
    pub subject_id: i64,
    pub title: String,
    pub slug: String,
    pub status: String,
    pub estimated_minutes: Option<i64>,
    pub created_at: String,
    pub section_count: i64,
    pub checked_count: i64,
}
```

- [ ] **Step 2: Update row_to_chapter closure**

Find the `row_to_chapter` closure and update it to read the two new columns:

```rust
let row_to_chapter = |row: &rusqlite::Row| -> rusqlite::Result<Chapter> {
    Ok(Chapter {
        id: row.get(0)?,
        subject_id: row.get(1)?,
        title: row.get(2)?,
        slug: row.get(3)?,
        status: row.get(4)?,
        estimated_minutes: row.get(5)?,
        created_at: row.get(6)?,
        section_count: row.get(7)?,
        checked_count: row.get(8)?,
    })
};
```

- [ ] **Step 3: Update list_chapters query**

Replace the `list_chapters` SQL query:

```sql
SELECT id, subject_id, title, slug, status, estimated_minutes, created_at
FROM chapters WHERE subject_id = ?1 ORDER BY created_at
```

With:

```sql
SELECT c.id, c.subject_id, c.title, c.slug, c.status, c.estimated_minutes, c.created_at,
       COUNT(cs.id) as section_count,
       COUNT(CASE WHEN cs.status IN ('checked_correct', 'checked_partial', 'checked_off_track') THEN 1 END) as checked_count
FROM chapters c
LEFT JOIN chapter_sections cs ON cs.chapter_id = c.id
WHERE c.subject_id = ?1
GROUP BY c.id
ORDER BY c.created_at
```

- [ ] **Step 4: Update create_chapter return value**

In the `create_chapter` function, update the `Ok(Chapter { ... })` return to include the new fields:

```rust
section_count: sections.len() as i64,
checked_count: 0,
```

- [ ] **Step 5: Update any other places that construct Chapter**

Check `import_url` — it also returns a `Chapter`. Add the same two fields there:

```rust
section_count: sections.len() as i64,
checked_count: 0,
```

- [ ] **Step 6: Verify**

Run: `cargo test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/library.rs
git commit -m "feat: add section_count and checked_count to Chapter for progress tracking"
```

---

### Task 2: Frontend Types Update

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Update Chapter interface**

In `src/lib/tauri.ts`, add the two new fields to the `Chapter` interface:

```typescript
export interface Chapter {
  id: number;
  subject_id: number;
  title: string;
  slug: string;
  status: string;
  estimated_minutes: number | null;
  created_at: string;
  section_count: number;
  checked_count: number;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat: add section progress fields to Chapter type"
```

---

### Task 3: Chapter View Page

**Files:**
- Create: `src/pages/ChapterView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create ChapterView page**

Create `src/pages/ChapterView.tsx`:

```tsx
import { ArrowLeft, BookOpen, CheckCircle2, Circle, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ReaderContent } from "../components/reader/ReaderContent";
import { loadReaderSession } from "../lib/tauri";
import type { ReaderSession } from "../lib/tauri";

function StatusDot({ status }: { status: string }) {
  switch (status) {
    case "checked_correct":
      return <CheckCircle2 size={14} className="shrink-0 text-teal" />;
    case "checked_partial":
      return <Circle size={14} className="shrink-0 text-amber" />;
    case "checked_off_track":
      return <XCircle size={14} className="shrink-0 text-coral" />;
    case "seen":
      return <Circle size={14} className="shrink-0 text-text-muted/40" />;
    default:
      return <Circle size={14} className="shrink-0 text-text-muted/20" />;
  }
}

export function ChapterView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapterId = Number(searchParams.get("id"));

  const [session, setSession] = useState<ReaderSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await loadReaderSession(chapterId);
      setSession(data);
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!chapterId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">No chapter selected</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/library")}
            className="text-sm text-accent hover:underline"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  const checkedCount = session.sections.filter(
    (s) => s.status === "checked_correct" || s.status === "checked_partial" || s.status === "checked_off_track",
  ).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/library")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-text">
                {session.chapter.title}
              </h1>
              <p className="text-xs text-text-muted">
                {checkedCount}/{session.sections.length} sections studied
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/reader?chapter=${chapterId}`)}
              className="flex h-10 items-center gap-2 rounded-xl bg-accent px-5 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90"
            >
              <BookOpen size={14} />
              Start Study
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content — all sections */}
      <div className="flex-1 overflow-auto">
        {session.sections.map((section) => (
          <div key={section.id} className="border-b border-border-subtle/40">
            {section.heading && (
              <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-7 pt-7">
                <StatusDot status={section.status} />
                <h2 className="text-lg font-semibold tracking-tight text-text">
                  {section.heading}
                </h2>
              </div>
            )}
            <ReaderContent
              heading={null}
              bodyMarkdown={section.body_markdown}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route in App.tsx**

In `src/App.tsx`, add import:

```tsx
import { ChapterView } from "./pages/ChapterView";
```

Add route inside the `<Route element={<Shell />}>` block:

```tsx
<Route path="/chapter" element={<ChapterView />} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run Biome**

Run: `npx biome check --write .`

- [ ] **Step 5: Commit**

```bash
git add src/pages/ChapterView.tsx src/App.tsx
git commit -m "feat: add ChapterView page for freeform reading with study progress"
```

---

### Task 4: Library — Update Click Target and Add Progress

**Files:**
- Modify: `src/pages/Library.tsx`

- [ ] **Step 1: Change chapter click navigation**

In `src/pages/Library.tsx`, find the chapter list button's onClick:

```tsx
onClick={() => navigate(`/reader?chapter=${chapter.id}`)}
```

Replace with:

```tsx
onClick={() => navigate(`/chapter?id=${chapter.id}`)}
```

There are TWO instances — one in the search results and one in the chapter list. Update both.

Search results (around line 282):
```tsx
onClick={() => navigate(`/reader?chapter=${result.chapter_id}`)}
```
Change to:
```tsx
onClick={() => navigate(`/chapter?id=${result.chapter_id}`)}
```

Chapter list (around line 433):
```tsx
onClick={() => navigate(`/reader?chapter=${chapter.id}`)}
```
Change to:
```tsx
onClick={() => navigate(`/chapter?id=${chapter.id}`)}
```

- [ ] **Step 2: Add progress bar to chapter cards**

In the chapter card's subtitle area (the div with `mt-0.5 flex items-center gap-2.5`), add a progress indicator after the clock/minutes span:

Find:
```tsx
                      {chapter.estimated_minutes && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} />
                          {chapter.estimated_minutes} min
                        </span>
                      )}
```

Add after it:
```tsx
                      {chapter.section_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-text-muted/50">
                          {chapter.checked_count}/{chapter.section_count}
                        </span>
                      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx biome check --write . && npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Library.tsx
git commit -m "feat: Library chapters open to ChapterView, show study progress"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run all gates**

Run: `cargo test` (from src-tauri)
Run: `npx tsc --noEmit && npx biome check . && npm test`
Expected: All pass.

- [ ] **Step 2: Visual verification with Tauri dev**

Run: `npm run tauri dev`

Verify:
1. Library → click chapter → opens **Chapter View** (not Reader)
2. Chapter View shows all sections with markdown content rendered
3. Status dots show next to section headings (unseen = muted, checked = green, etc.)
4. Header shows "X/Y sections studied"
5. "Start Study" button navigates to Reader
6. Library chapter cards show progress fraction (e.g., "3/8")
7. Back button from Chapter View returns to Library
