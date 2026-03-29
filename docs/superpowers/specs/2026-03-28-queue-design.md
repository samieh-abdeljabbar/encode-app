# Sub-project 2C: Unified Study Queue — Design Spec

## Problem

The app has Reader, Chapter View, and Review pages but no unified "what should I do next?" surface. Learners open the app and have to manually decide between due cards, unfinished reading, and synthesis tasks.

## Solution

Build the Queue page as the home screen (`/`). It shows summary stats at the top and a prioritized list of next actions ranked by a deterministic 0-100 scoring model. One batch IPC call loads everything.

## Architecture

### Queue Scoring — Rust Service

**`services/queue.rs`** — Deterministic scoring, all SQL-based.

**Queue item types and base scores:**

| Item Type | Base | Boosters | Source Query |
|---|---|---|---|
| `due_card` | 60 | +25 if overdue >1 day, +10 if stability <3.0 | `card_schedule WHERE next_review <= now` |
| `repair_card` | 75 | +10 if created in last 24h | `cards WHERE source_type='repair' AND status='active'` joined with due schedule |
| `continue_reading` | 40 | +15 if last study_event for chapter <24h ago | `chapters WHERE status='reading'` |
| `synthesis_required` | 50 | — | `chapters WHERE status='awaiting_synthesis'` |
| `new_chapter` | 20 | — | `chapters WHERE status='new'` |

**Tie-breakers** (when scores equal): shorter estimated time first, then most recently active chapter.

**Output types:**

```rust
struct QueueItem {
    item_type: String,       // "due_card", "repair_card", "continue_reading", etc.
    score: i32,              // 0-100
    title: String,           // card prompt or chapter title
    subtitle: String,        // subject name or context
    reason: String,          // "Overdue by 3 days", "In progress", etc.
    estimated_minutes: i32,  // 1 for cards, chapter estimate for reading
    target_id: i64,          // card_id or chapter_id
    target_route: String,    // "/review", "/reader?chapter=X", "/chapter?id=X"
}

struct QueueSummary {
    due_cards: i64,
    chapters_in_progress: i64,
    sections_studied_today: i64,
}

struct QueueDashboard {
    summary: QueueSummary,
    items: Vec<QueueItem>,
}
```

### Rust Backend — 1 IPC Command

**`queue.get_dashboard()`** → `QueueDashboard`

Single batch call. Runs multiple queries inside one `with_conn` closure, merges and sorts results by score descending, returns top 20 items + summary stats.

### Frontend — Queue Page

**Route**: `/` (replaces the current Placeholder)

**Layout:**
```
┌─────────────────────────────────────┐
│  📋 3 due    📖 2 reading    ✓ 5   │  ← stats row
├─────────────────────────────────────┤
│                                     │
│  🔴 Review: Section 3 heading       │
│     Physics · Overdue by 2 days     │
│                                     │
│  🟡 Continue: Chapter Title         │
│     Math · In progress · ~9 min     │
│                                     │
│  🟢 Synthesis: Chapter Title        │
│     Chemistry · All sections done   │
│                                     │
│  ○  New: Untouched Chapter          │
│     Biology · ~12 min               │
│                                     │
└─────────────────────────────────────┘
```

**Components:**
- `Queue.tsx` (page) — loads dashboard, renders stats + list
- `QueueStats.tsx` — 3 compact stat cards
- `QueueItem.tsx` — single queue item row with icon, title, reason, click to navigate

## Files to Create/Modify

| File | Action |
|------|--------|
| `src-tauri/src/services/queue.rs` | Create — scoring engine + dashboard query |
| `src-tauri/src/services/mod.rs` | Modify — export queue |
| `src-tauri/src/commands/queue.rs` | Create — 1 IPC command |
| `src-tauri/src/commands/mod.rs` | Modify — export queue |
| `src-tauri/src/lib.rs` | Modify — register queue command |
| `src/lib/tauri.ts` | Modify — add queue types + IPC wrapper |
| `src/pages/Queue.tsx` | Create — Queue page |
| `src/components/queue/QueueStats.tsx` | Create — stat cards |
| `src/components/queue/QueueItem.tsx` | Create — item row |
| `src/App.tsx` | Modify — replace Queue placeholder |

## What NOT to Build

- No skip/snooze/pin (future)
- No starvation prevention (future — add when there's real data)
- No "why this is next" modal (the reason string is sufficient)
- No drag-to-reorder

## Verification

1. `cargo test` — queue scoring tests (score calculation, ordering, tie-breaks)
2. `npx tsc --noEmit` — zero errors
3. Manual: create subjects + chapters + read some sections + miss some checks → Queue shows ranked items in correct priority order
