# Sub-project 2B: Review (FSRS Flashcard Review) — Design Spec

## Problem

The Reader creates repair cards when learners miss comprehension checks, but there's no way to review those cards. The Review page provides spaced repetition review using FSRS scheduling.

## Scope

Epic 2.4: Review and FSRS. Classic flashcard review with simplified FSRS-5 scheduling algorithm. No parameter optimization, no custom presets.

## Architecture

### FSRS Engine — Rust Service

**`services/fsrs.rs`** — Pure scheduling logic, no database access.

**Core types:**
```rust
struct ScheduleState {
    stability: f64,    // how well the card is remembered (days)
    difficulty: f64,   // 1.0-10.0 scale
    reps: i64,         // total successful reviews
    lapses: i64,       // times the card was forgotten (Again)
}

struct ScheduleOutput {
    next_review_days: i64,  // days until next review
    new_stability: f64,
    new_difficulty: f64,
    new_reps: i64,
    new_lapses: i64,
}
```

**Rating values:** Again=1, Hard=2, Good=3, Easy=4

**Simplified FSRS-5 formula:**
- **Again (1):** Reset stability to 1.0, increment lapses, next review = 1 day
- **Hard (2):** stability * 1.2, difficulty + 0.15 (capped at 10.0), next = ceil(stability * 1.2)
- **Good (3):** stability * 2.5, difficulty unchanged, next = ceil(stability * 2.5)
- **Easy (4):** stability * 3.5, difficulty - 0.15 (floored at 1.0), next = ceil(stability * 3.5)

First review (reps=0): Again=1d, Hard=3d, Good=5d, Easy=10d (fixed intervals for new cards).

100% branch coverage required on this module via TDD.

### Rust Backend — 2 New Commands

**`review.get_due_cards(limit: i64)`** → `Vec<DueCard>`

Batch query joining `cards` + `card_schedule` where `next_review <= datetime('now')`. Returns card content + schedule state. Single query, no N+1.

```rust
struct DueCard {
    id: i64,
    subject_id: i64,
    chapter_id: Option<i64>,
    source_type: String,
    prompt: String,
    answer: String,
    card_type: String,
    stability: f64,
    difficulty: f64,
    reps: i64,
    lapses: i64,
}
```

**`review.submit_rating(card_id: i64, rating: i32)`** → `RatingResult`

1. Read current `card_schedule` state
2. Run FSRS calculation
3. Update `card_schedule` (next_review, stability, difficulty, reps, lapses, last_reviewed)
4. Insert `card_reviews` row (rating, scheduled_days, stability, difficulty)
5. Log `study_event` (type: `card_reviewed`, payload: rating + card_id)

```rust
struct RatingResult {
    next_review_days: i64,
    new_stability: f64,
    cards_remaining: i64,  // how many due cards left
}
```

### Review Service

**`services/review.rs`** — Database operations for review commands:
- `get_due_cards(conn, limit)` — batch query
- `submit_rating(conn, card_id, rating)` — FSRS + persist + log event

### Frontend — Review Page

**Route**: `/review` (already in Ribbon nav)

**Flow:**
1. Load due cards via `review.get_due_cards(50)`
2. If none due → show "All caught up" screen
3. Show first card: prompt visible, answer hidden
4. User presses Space or clicks "Show Answer" → answer revealed
5. Four rating buttons appear: Again / Hard / Good / Easy
6. Submit rating → show next card
7. When all done → "Session Complete" screen with stats

**Keyboard shortcuts:**
- `Space` — reveal answer
- `1` — Again
- `2` — Hard
- `3` — Good
- `4` — Easy

### Frontend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `Review.tsx` | `src/pages/Review.tsx` | Page orchestrator, loads due cards, manages session |
| `ReviewCard.tsx` | `src/components/review/ReviewCard.tsx` | Single card display with front/back flip |
| `ReviewComplete.tsx` | `src/components/review/ReviewComplete.tsx` | "All caught up" / session complete screen |

### Frontend State

Local state in `Review.tsx`:
- `cards: DueCard[]` — loaded on mount
- `currentIndex: number` — which card is active
- `revealed: boolean` — answer visible
- `loading: boolean`
- `sessionStats: { reviewed: number, again: number, hard: number, good: number, easy: number }`

## Files to Create/Modify

| File | Action |
|------|--------|
| `src-tauri/src/services/fsrs.rs` | Create — FSRS scheduling engine + tests |
| `src-tauri/src/services/review.rs` | Create — Review database operations |
| `src-tauri/src/services/mod.rs` | Modify — export fsrs + review |
| `src-tauri/src/commands/review.rs` | Create — 2 IPC commands |
| `src-tauri/src/commands/mod.rs` | Modify — export review |
| `src-tauri/src/lib.rs` | Modify — register review commands |
| `src/lib/tauri.ts` | Modify — add review types + IPC wrappers |
| `src/pages/Review.tsx` | Create — Review page (replace placeholder) |
| `src/components/review/ReviewCard.tsx` | Create — Card display |
| `src/components/review/ReviewComplete.tsx` | Create — Completion screen |
| `src/App.tsx` | Modify — replace Review placeholder |

## What NOT to Build

- No FSRS parameter optimization (future)
- No card creation UI (cards come from Reader repair flow)
- No card browsing/management (future)
- No review history/stats page (future)
- No undo rating

## Verification

1. `cargo test` — FSRS unit tests (100% branch coverage), review service tests
2. `npm test` — vitest passes
3. `npx tsc --noEmit` — zero errors
4. Manual flow: Reader creates repair card → Review page shows it → rate it → card rescheduled → verify card_schedule updated in DB
