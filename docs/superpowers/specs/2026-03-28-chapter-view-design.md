# Chapter View Page — Design Spec

## Problem

Clicking a chapter in the Library always enters the structured Reader (study mode). Users can't just open and read their notes freely. The study loop should be opt-in, not forced.

## Solution

Add a Chapter View page as the default when clicking a chapter. It shows all content for freeform reading. A "Start Study" button enters the Reader loop. Library cards show study progress at a glance.

## Architecture

### New Page: Chapter View

**Route**: `/chapter?id={id}`

**Layout** (single column, scrollable):

```
┌─────────────────────────────────────┐
│ ← Back    Chapter Title             │
│ Subject: Physics    5/8 studied     │
│                    [ Start Study ]  │
├─────────────────────────────────────┤
│                                     │
│  ● Section 1: Introduction          │
│    Rendered markdown content...     │
│                                     │
│  ◐ Section 2: Key Concepts          │
│    Rendered markdown content...     │
│                                     │
│  ○ Section 3: Applications          │
│    Rendered markdown content...     │
│                                     │
└─────────────────────────────────────┘
```

**Section status indicators** (small dot next to each heading):
- `○` unseen — muted dot
- `●` checked_correct — green dot
- `◐` checked_partial — amber dot
- `✕` checked_off_track — coral dot
- `◉` seen (read but not checked) — subtle outline dot

**Data source**: Reuses `loadReaderSession(chapterId)` IPC — already returns chapter metadata, all sections with statuses, and prompts. No new backend work needed.

**Components**:
- `ChapterView.tsx` (new page) — header + scrollable sections
- Reuses `ReaderContent.tsx` for rendering each section's markdown

### Library Card Update

**Progress indicator** on each chapter card: show `checked_count / total_count` as a small fraction next to the status badge, plus a thin progress bar.

**Click behavior change**: Library chapter cards navigate to `/chapter?id={id}` instead of `/reader?chapter={id}`.

**Data**: The existing `listChapters` IPC doesn't return section progress. Two options:
1. Add a new IPC `getChapterProgress(chapterId)` — extra call per chapter (N+1 risk)
2. Modify `listChapters` to include `checked_count` and `total_count` in the response

Option 2 is better (batch, no N+1). Requires a small Rust change to join `chapter_sections` and count statuses in the `list_chapters` query.

### Files to Modify/Create

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pages/ChapterView.tsx` | Create | Freeform chapter reading page |
| `src/App.tsx` | Modify | Add `/chapter` route |
| `src/pages/Library.tsx` | Modify | Change click target, add progress indicator |
| `src-tauri/src/commands/library.rs` | Modify | Add checked_count/total_count to Chapter struct |
| `src/lib/tauri.ts` | Modify | Update Chapter type with new fields |

## What NOT to Build

- No CodeMirror editing (future task)
- No new IPC commands (reuse loadReaderSession for view, modify listChapters for progress)
- No section-level navigation/outline sidebar (YAGNI)

## Verification

1. `cargo test` — existing + any new tests pass
2. `npx tsc --noEmit` — zero errors
3. Library → click chapter → opens Chapter View (not Reader)
4. Chapter View shows all sections with status dots
5. "Start Study" button navigates to Reader
6. Library cards show progress fraction
