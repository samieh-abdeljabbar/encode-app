# Review FSRS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Review page with FSRS-5 spaced repetition scheduling so learners can review repair cards created by the Reader.

**Architecture:** A pure FSRS engine (`services/fsrs.rs`) handles scheduling math with no DB access. A review service (`services/review.rs`) handles database operations. Two IPC commands expose due cards and rating submission. The React frontend is a classic flashcard review experience with keyboard shortcuts.

**Tech Stack:** Rust (rusqlite, serde, Tauri 2), React 18, TypeScript, Tailwind CSS 4

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/services/fsrs.rs` | Create | Pure FSRS scheduling engine + tests |
| `src-tauri/src/services/review.rs` | Create | Review DB operations (due cards, submit rating) |
| `src-tauri/src/services/mod.rs` | Modify | Export fsrs + review modules |
| `src-tauri/src/commands/review.rs` | Create | 2 IPC commands |
| `src-tauri/src/commands/mod.rs` | Modify | Export review module |
| `src-tauri/src/lib.rs` | Modify | Register review commands |
| `src/lib/tauri.ts` | Modify | Add review types + IPC wrappers |
| `src/components/review/ReviewCard.tsx` | Create | Card front/back display |
| `src/components/review/ReviewComplete.tsx` | Create | Session complete screen |
| `src/pages/Review.tsx` | Create | Review page orchestrator |
| `src/App.tsx` | Modify | Replace Review placeholder |

---

### Task 1: FSRS Engine — Pure Scheduling Logic (TDD)

**Files:**
- Create: `src-tauri/src/services/fsrs.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Create fsrs.rs with types and schedule function + tests**

Create `src-tauri/src/services/fsrs.rs`:

```rust
/// Simplified FSRS-5 spaced repetition scheduler.
/// Pure math — no database access, no side effects.

pub struct ScheduleState {
    pub stability: f64,
    pub difficulty: f64,
    pub reps: i64,
    pub lapses: i64,
}

pub struct ScheduleOutput {
    pub next_review_days: i64,
    pub new_stability: f64,
    pub new_difficulty: f64,
    pub new_reps: i64,
    pub new_lapses: i64,
}

/// Calculate the next schedule given the current state and a rating.
/// Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
pub fn schedule(state: &ScheduleState, rating: i32) -> ScheduleOutput {
    // First review (new card) uses fixed intervals
    if state.reps == 0 {
        let days = match rating {
            1 => 1,
            2 => 3,
            3 => 5,
            4 => 10,
            _ => 1,
        };
        return ScheduleOutput {
            next_review_days: days,
            new_stability: days as f64,
            new_difficulty: state.difficulty,
            new_reps: if rating == 1 { 0 } else { 1 },
            new_lapses: if rating == 1 { state.lapses + 1 } else { state.lapses },
        };
    }

    match rating {
        1 => {
            // Again: reset stability, increment lapses
            ScheduleOutput {
                next_review_days: 1,
                new_stability: 1.0,
                new_difficulty: (state.difficulty + 0.2).min(10.0),
                new_reps: state.reps,
                new_lapses: state.lapses + 1,
            }
        }
        2 => {
            // Hard: small stability increase, difficulty increases
            let new_stability = state.stability * 1.2;
            ScheduleOutput {
                next_review_days: (new_stability).ceil() as i64,
                new_stability,
                new_difficulty: (state.difficulty + 0.15).min(10.0),
                new_reps: state.reps + 1,
                new_lapses: state.lapses,
            }
        }
        3 => {
            // Good: standard stability increase, difficulty unchanged
            let new_stability = state.stability * 2.5;
            ScheduleOutput {
                next_review_days: (new_stability).ceil() as i64,
                new_stability,
                new_difficulty: state.difficulty,
                new_reps: state.reps + 1,
                new_lapses: state.lapses,
            }
        }
        4 => {
            // Easy: large stability increase, difficulty decreases
            let new_stability = state.stability * 3.5;
            ScheduleOutput {
                next_review_days: (new_stability).ceil() as i64,
                new_stability,
                new_difficulty: (state.difficulty - 0.15).max(1.0),
                new_reps: state.reps + 1,
                new_lapses: state.lapses,
            }
        }
        _ => {
            // Invalid rating treated as Again
            ScheduleOutput {
                next_review_days: 1,
                new_stability: 1.0,
                new_difficulty: state.difficulty,
                new_reps: state.reps,
                new_lapses: state.lapses + 1,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_card_again() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 1);
        assert_eq!(out.next_review_days, 1);
        assert_eq!(out.new_reps, 0); // stays at 0
        assert_eq!(out.new_lapses, 1);
    }

    #[test]
    fn test_new_card_hard() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 2);
        assert_eq!(out.next_review_days, 3);
        assert_eq!(out.new_reps, 1);
        assert_eq!(out.new_lapses, 0);
    }

    #[test]
    fn test_new_card_good() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 3);
        assert_eq!(out.next_review_days, 5);
        assert_eq!(out.new_reps, 1);
    }

    #[test]
    fn test_new_card_easy() {
        let state = ScheduleState { stability: 1.0, difficulty: 5.0, reps: 0, lapses: 0 };
        let out = schedule(&state, 4);
        assert_eq!(out.next_review_days, 10);
        assert_eq!(out.new_reps, 1);
    }

    #[test]
    fn test_review_again_resets_stability() {
        let state = ScheduleState { stability: 30.0, difficulty: 5.0, reps: 5, lapses: 0 };
        let out = schedule(&state, 1);
        assert_eq!(out.next_review_days, 1);
        assert_eq!(out.new_stability, 1.0);
        assert_eq!(out.new_lapses, 1);
        assert_eq!(out.new_reps, 5); // reps unchanged on lapse
    }

    #[test]
    fn test_review_hard_increases_stability_slightly() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 2);
        assert_eq!(out.next_review_days, 12); // ceil(10.0 * 1.2) = 12
        assert!((out.new_stability - 12.0).abs() < 0.01);
        assert!((out.new_difficulty - 5.15).abs() < 0.01);
    }

    #[test]
    fn test_review_good_standard_increase() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 3);
        assert_eq!(out.next_review_days, 25); // ceil(10.0 * 2.5) = 25
        assert!((out.new_stability - 25.0).abs() < 0.01);
        assert!((out.new_difficulty - 5.0).abs() < 0.01); // unchanged
    }

    #[test]
    fn test_review_easy_large_increase() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 4);
        assert_eq!(out.next_review_days, 35); // ceil(10.0 * 3.5) = 35
        assert!((out.new_difficulty - 4.85).abs() < 0.01);
    }

    #[test]
    fn test_difficulty_capped_at_10() {
        let state = ScheduleState { stability: 5.0, difficulty: 9.95, reps: 2, lapses: 0 };
        let out = schedule(&state, 2); // +0.15 would be 10.1
        assert!((out.new_difficulty - 10.0).abs() < 0.01);
    }

    #[test]
    fn test_difficulty_floored_at_1() {
        let state = ScheduleState { stability: 5.0, difficulty: 1.05, reps: 2, lapses: 0 };
        let out = schedule(&state, 4); // -0.15 would be 0.9
        assert!((out.new_difficulty - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_invalid_rating_treated_as_again() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 99);
        assert_eq!(out.next_review_days, 1);
        assert_eq!(out.new_stability, 1.0);
    }

    #[test]
    fn test_again_increases_difficulty() {
        let state = ScheduleState { stability: 10.0, difficulty: 5.0, reps: 3, lapses: 0 };
        let out = schedule(&state, 1);
        assert!((out.new_difficulty - 5.2).abs() < 0.01);
    }
}
```

- [ ] **Step 2: Export fsrs module**

Add to `src-tauri/src/services/mod.rs`:

```rust
pub mod fsrs;
```

- [ ] **Step 3: Run tests**

Run: `cargo test` (from `src-tauri/`)
Expected: All 12 new FSRS tests + existing 82 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/fsrs.rs src-tauri/src/services/mod.rs
git commit -m "feat: add FSRS-5 scheduling engine with 12 unit tests"
```

---

### Task 2: Review Service — Database Operations

**Files:**
- Create: `src-tauri/src/services/review.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Create review service**

Create `src-tauri/src/services/review.rs`:

```rust
use rusqlite::Connection;
use serde::Serialize;
use crate::services::fsrs;

#[derive(Serialize)]
pub struct DueCard {
    pub id: i64,
    pub subject_id: i64,
    pub chapter_id: Option<i64>,
    pub source_type: String,
    pub prompt: String,
    pub answer: String,
    pub card_type: String,
    pub stability: f64,
    pub difficulty: f64,
    pub reps: i64,
    pub lapses: i64,
}

#[derive(Serialize)]
pub struct RatingResult {
    pub next_review_days: i64,
    pub new_stability: f64,
    pub cards_remaining: i64,
}

pub fn get_due_cards(conn: &Connection, limit: i64) -> Result<Vec<DueCard>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer, c.card_type,
                    cs.stability, cs.difficulty, cs.reps, cs.lapses
             FROM cards c
             JOIN card_schedule cs ON cs.card_id = c.id
             WHERE c.status = 'active' AND cs.next_review <= datetime('now')
             ORDER BY cs.next_review ASC
             LIMIT ?1",
        )
        .map_err(|e| format!("Failed to query due cards: {e}"))?;

    let cards = stmt
        .query_map([limit], |row| {
            Ok(DueCard {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                chapter_id: row.get(2)?,
                source_type: row.get(3)?,
                prompt: row.get(4)?,
                answer: row.get(5)?,
                card_type: row.get(6)?,
                stability: row.get(7)?,
                difficulty: row.get(8)?,
                reps: row.get(9)?,
                lapses: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to map due cards: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cards)
}

pub fn submit_rating(conn: &Connection, card_id: i64, rating: i32) -> Result<RatingResult, String> {
    // 1. Read current schedule state
    let (stability, difficulty, reps, lapses): (f64, f64, i64, i64) = conn
        .query_row(
            "SELECT stability, difficulty, reps, lapses FROM card_schedule WHERE card_id = ?1",
            [card_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Card schedule not found: {e}"))?;

    // 2. Run FSRS calculation
    let state = fsrs::ScheduleState { stability, difficulty, reps, lapses };
    let output = fsrs::schedule(&state, rating);

    // 3. Update card_schedule
    conn.execute(
        "UPDATE card_schedule SET
            next_review = datetime('now', '+' || ?2 || ' days'),
            stability = ?3, difficulty = ?4, reps = ?5, lapses = ?6,
            last_reviewed = datetime('now')
         WHERE card_id = ?1",
        rusqlite::params![
            card_id,
            output.next_review_days,
            output.new_stability,
            output.new_difficulty,
            output.new_reps,
            output.new_lapses,
        ],
    )
    .map_err(|e| format!("Failed to update schedule: {e}"))?;

    // 4. Insert card_reviews row
    conn.execute(
        "INSERT INTO card_reviews (card_id, rating, reviewed_at, scheduled_days, stability, difficulty)
         VALUES (?1, ?2, datetime('now'), ?3, ?4, ?5)",
        rusqlite::params![
            card_id,
            rating,
            output.next_review_days,
            output.new_stability,
            output.new_difficulty,
        ],
    )
    .map_err(|e| format!("Failed to insert review: {e}"))?;

    // 5. Log study event
    let subject_id: Option<i64> = conn
        .query_row("SELECT subject_id FROM cards WHERE id = ?1", [card_id], |row| row.get(0))
        .ok();

    let payload = serde_json::json!({ "card_id": card_id, "rating": rating });
    conn.execute(
        "INSERT INTO study_events (subject_id, card_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, 'card_reviewed', ?3, datetime('now'))",
        rusqlite::params![subject_id, card_id, payload.to_string()],
    )
    .map_err(|e| format!("Failed to log event: {e}"))?;

    // 6. Count remaining due cards
    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM card_schedule WHERE next_review <= datetime('now')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(RatingResult {
        next_review_days: output.next_review_days,
        new_stability: output.new_stability,
        cards_remaining: remaining,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_test_db_with_card() -> Database {
        let db = Database::open_memory().expect("Failed to open test DB");
        db.with_conn(|conn| {
            crate::db::migrations::run_all(conn);
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('test', 'Test', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (1, 'repair', 'What is X?', 'X is Y.', 'basic', 'active', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (1, datetime('now', '-1 hour'), 1.0, 5.0, 0, 0)",
                [],
            ).unwrap();
        });
        db
    }

    #[test]
    fn test_get_due_cards_returns_due() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            let cards = get_due_cards(conn, 50).unwrap();
            assert_eq!(cards.len(), 1);
            assert_eq!(cards[0].prompt, "What is X?");
        });
    }

    #[test]
    fn test_get_due_cards_excludes_future() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            // Move card to future
            conn.execute(
                "UPDATE card_schedule SET next_review = datetime('now', '+7 days') WHERE card_id = 1",
                [],
            ).unwrap();
            let cards = get_due_cards(conn, 50).unwrap();
            assert_eq!(cards.len(), 0);
        });
    }

    #[test]
    fn test_submit_rating_updates_schedule() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            let result = submit_rating(conn, 1, 3).unwrap(); // Good
            assert_eq!(result.next_review_days, 5); // new card + Good = 5 days
            assert_eq!(result.cards_remaining, 0); // card now in future
        });
    }

    #[test]
    fn test_submit_rating_creates_review_record() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            submit_rating(conn, 1, 3).unwrap();
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM card_reviews WHERE card_id = 1",
                [], |row| row.get(0)
            ).unwrap();
            assert_eq!(count, 1);
        });
    }

    #[test]
    fn test_submit_rating_logs_study_event() {
        let db = setup_test_db_with_card();
        db.with_conn(|conn| {
            submit_rating(conn, 1, 3).unwrap();
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM study_events WHERE event_type = 'card_reviewed'",
                [], |row| row.get(0)
            ).unwrap();
            assert_eq!(count, 1);
        });
    }
}
```

- [ ] **Step 2: Export review module**

Add to `src-tauri/src/services/mod.rs`:

```rust
pub mod review;
```

- [ ] **Step 3: Run tests**

Run: `cargo test` (from `src-tauri/`)
Expected: All new review tests + FSRS tests + existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/review.rs src-tauri/src/services/mod.rs
git commit -m "feat: add review service with due cards query and rating submission"
```

---

### Task 3: Review Commands — Tauri IPC

**Files:**
- Create: `src-tauri/src/commands/review.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create review commands**

Create `src-tauri/src/commands/review.rs`:

```rust
use crate::AppState;
use crate::services::review;

#[tauri::command]
pub fn get_due_cards(
    state: tauri::State<'_, AppState>,
    limit: i64,
) -> Result<Vec<review::DueCard>, String> {
    state.db.with_conn(|conn| review::get_due_cards(conn, limit))
}

#[tauri::command]
pub fn submit_card_rating(
    state: tauri::State<'_, AppState>,
    card_id: i64,
    rating: i32,
) -> Result<review::RatingResult, String> {
    state.db.with_conn(|conn| review::submit_rating(conn, card_id, rating))
}
```

- [ ] **Step 2: Export and register**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod review;
```

Add to `src-tauri/src/lib.rs` in the `tauri::generate_handler!` macro:
```rust
commands::review::get_due_cards,
commands::review::submit_card_rating,
```

- [ ] **Step 3: Verify**

Run: `cargo check`
Expected: Compiles clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/review.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add review IPC commands (get_due_cards, submit_card_rating)"
```

---

### Task 4: Frontend — Types, IPC Wrappers, Components

**Files:**
- Modify: `src/lib/tauri.ts`
- Create: `src/components/review/ReviewCard.tsx`
- Create: `src/components/review/ReviewComplete.tsx`

- [ ] **Step 1: Add review types and IPC to tauri.ts**

Append to `src/lib/tauri.ts`:

```typescript
// Review types
export interface DueCard {
  id: number;
  subject_id: number;
  chapter_id: number | null;
  source_type: string;
  prompt: string;
  answer: string;
  card_type: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
}

export interface RatingResult {
  next_review_days: number;
  new_stability: number;
  cards_remaining: number;
}

// Review IPC
export const getDueCards = (limit: number) =>
  invoke<DueCard[]>("get_due_cards", { limit });

export const submitCardRating = (cardId: number, rating: number) =>
  invoke<RatingResult>("submit_card_rating", { cardId, rating });
```

- [ ] **Step 2: Create ReviewCard component**

Create `src/components/review/ReviewCard.tsx`:

```tsx
export function ReviewCard({
  prompt,
  answer,
  revealed,
  sourceType,
  onReveal,
}: {
  prompt: string;
  answer: string;
  revealed: boolean;
  sourceType: string;
  onReveal: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">
        {sourceType === "repair" ? "Repair Card" : "Flashcard"}
      </div>

      <div className="rounded-xl border border-border bg-panel p-7">
        <p className="text-base leading-relaxed text-text">{prompt}</p>
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={onReveal}
          className="mt-4 h-11 w-full rounded-xl border border-border bg-panel-alt text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
        >
          Show Answer
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent-soft/20 p-7">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
            Answer
          </p>
          <p className="text-base leading-relaxed text-text">{answer}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create ReviewComplete component**

Create `src/components/review/ReviewComplete.tsx`:

```tsx
import { CheckCircle2 } from "lucide-react";

export function ReviewComplete({
  stats,
}: {
  stats: { reviewed: number; again: number; hard: number; good: number; easy: number };
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-teal/10">
          <CheckCircle2 size={28} className="text-teal" />
        </div>
        <p className="mb-2 text-lg font-semibold text-text">All caught up!</p>
        <p className="mb-6 text-sm text-text-muted">
          {stats.reviewed > 0
            ? `Reviewed ${stats.reviewed} card${stats.reviewed !== 1 ? "s" : ""}`
            : "No cards due for review"}
        </p>
        {stats.reviewed > 0 && (
          <div className="flex justify-center gap-4 text-xs">
            {stats.again > 0 && <span className="text-coral">Again: {stats.again}</span>}
            {stats.hard > 0 && <span className="text-amber">Hard: {stats.hard}</span>}
            {stats.good > 0 && <span className="text-teal">Good: {stats.good}</span>}
            {stats.easy > 0 && <span className="text-accent">Easy: {stats.easy}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauri.ts src/components/review/ReviewCard.tsx src/components/review/ReviewComplete.tsx
git commit -m "feat: add review types, IPC wrappers, ReviewCard and ReviewComplete components"
```

---

### Task 5: Review Page — Orchestrator

**Files:**
- Create: `src/pages/Review.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Review page**

Create `src/pages/Review.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { ReviewCard } from "../components/review/ReviewCard";
import { ReviewComplete } from "../components/review/ReviewComplete";
import { getDueCards, submitCardRating } from "../lib/tauri";
import type { DueCard } from "../lib/tauri";

interface SessionStats {
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export function Review() {
  const [cards, setCards] = useState<DueCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SessionStats>({
    reviewed: 0, again: 0, hard: 0, good: 0, easy: 0,
  });

  const loadCards = useCallback(async () => {
    try {
      const data = await getDueCards(50);
      setCards(data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (currentIndex >= cards.length) return;

      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        const ratingMap: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4 };
        const rating = ratingMap[e.code];
        if (rating) {
          e.preventDefault();
          handleRate(rating);
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const handleRate = async (rating: number) => {
    const card = cards[currentIndex];
    if (!card) return;
    setLoading(true);
    try {
      await submitCardRating(card.id, rating);
      const ratingKey = (["", "again", "hard", "good", "easy"] as const)[rating];
      setStats((prev) => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        [ratingKey]: prev[ratingKey] + 1,
      }));
      setCurrentIndex((prev) => prev + 1);
      setRevealed(false);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  if (loading && cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  if (cards.length === 0 || currentIndex >= cards.length) {
    return <ReviewComplete stats={stats} />;
  }

  const card = cards[currentIndex];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <p className="text-sm font-medium text-text">
            Card {currentIndex + 1} of {cards.length}
          </p>
          <p className="text-xs text-text-muted">
            {stats.reviewed} reviewed
          </p>
        </div>
      </div>

      {/* Card area */}
      <div className="flex flex-1 items-center justify-center overflow-auto px-7 py-7">
        <ReviewCard
          prompt={card.prompt}
          answer={card.answer}
          revealed={revealed}
          sourceType={card.source_type}
          onReveal={() => setRevealed(true)}
        />
      </div>

      {/* Rating buttons */}
      {revealed && (
        <div className="shrink-0 border-t border-border-subtle px-7 py-4">
          <div className="mx-auto flex max-w-2xl justify-center gap-3">
            <button
              type="button"
              onClick={() => handleRate(1)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-coral/30 bg-coral/5 px-5 text-xs font-medium text-coral transition-all hover:bg-coral/10"
            >
              Again
              <kbd className="ml-1 rounded border border-coral/20 px-1 text-[10px]">1</kbd>
            </button>
            <button
              type="button"
              onClick={() => handleRate(2)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-amber/30 bg-amber/5 px-5 text-xs font-medium text-amber transition-all hover:bg-amber/10"
            >
              Hard
              <kbd className="ml-1 rounded border border-amber/20 px-1 text-[10px]">2</kbd>
            </button>
            <button
              type="button"
              onClick={() => handleRate(3)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-teal/30 bg-teal/5 px-5 text-xs font-medium text-teal transition-all hover:bg-teal/10"
            >
              Good
              <kbd className="ml-1 rounded border border-teal/20 px-1 text-[10px]">3</kbd>
            </button>
            <button
              type="button"
              onClick={() => handleRate(4)}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/5 px-5 text-xs font-medium text-accent transition-all hover:bg-accent/10"
            >
              Easy
              <kbd className="ml-1 rounded border border-accent/20 px-1 text-[10px]">4</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire route in App.tsx**

In `src/App.tsx`, add import:
```tsx
import { Review } from "./pages/Review";
```

Replace the review route:
```tsx
<Route path="/review" element={<Review />} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx biome check --write . && npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Review.tsx src/App.tsx
git commit -m "feat: add Review page with flashcard display, ratings, and keyboard shortcuts"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run all gates**

Run: `cargo test` (from `src-tauri/`)
Run: `npx tsc --noEmit && npx biome check . && npm test`
Expected: All pass.

- [ ] **Step 2: Visual verification with Tauri dev**

Run: `npm run tauri dev`

Verify:
1. Reader → miss a section check ("Missed it") → repair card created
2. Navigate to Review page (Ribbon)
3. Due card appears with prompt visible
4. Click "Show Answer" or press Space → answer revealed
5. Rate with buttons or keyboard (1-4) → next card or session complete
6. Session complete shows stats breakdown
7. Check DB: card_schedule.next_review updated, card_reviews row inserted, study_event logged
