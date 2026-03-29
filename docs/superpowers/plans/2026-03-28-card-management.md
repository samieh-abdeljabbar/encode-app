# Card Management & Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cards page for creating/browsing/managing flashcards (basic/cloze/reversed), add practice mode to Review, and add Cards to Ribbon navigation.

**Architecture:** A Rust cards service handles CRUD + practice queries. Four IPC commands expose card operations. The Cards page provides a searchable list with inline create/edit. The Review page gains practice mode via query params. Cloze cards render with blanks in the ReviewCard component.

**Tech Stack:** Rust (rusqlite, serde, Tauri 2), React 18, TypeScript, Tailwind CSS 4, Lucide icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/services/cards.rs` | Create | Card CRUD, practice query, reversed logic, tests |
| `src-tauri/src/services/mod.rs` | Modify | Export cards module |
| `src-tauri/src/commands/cards.rs` | Create | 4 IPC commands |
| `src-tauri/src/commands/mod.rs` | Modify | Export cards module |
| `src-tauri/src/lib.rs` | Modify | Register card commands |
| `src/lib/tauri.ts` | Modify | Add card types + IPC wrappers |
| `src/components/cards/CardForm.tsx` | Create | Create/edit form with type selector |
| `src/components/cards/CardRow.tsx` | Create | Card list row with expand/edit |
| `src/pages/Cards.tsx` | Create | Card browser page |
| `src/components/review/ReviewCard.tsx` | Modify | Add cloze rendering |
| `src/pages/Review.tsx` | Modify | Add practice mode |
| `src/components/review/ReviewComplete.tsx` | Modify | Add practice/browse links |
| `src/components/layout/Ribbon.tsx` | Modify | Add Cards nav item |
| `src/App.tsx` | Modify | Add /cards route |

---

### Task 1: Cards Service — Rust CRUD + Practice + Tests

**Files:**
- Create: `src-tauri/src/services/cards.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Create cards service**

Create `src-tauri/src/services/cards.rs`. This is a large file — read the complete code from this plan step carefully.

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct CardInfo {
    pub id: i64,
    pub subject_id: i64,
    pub chapter_id: Option<i64>,
    pub source_type: String,
    pub prompt: String,
    pub answer: String,
    pub card_type: String,
    pub status: String,
    pub created_at: String,
    pub next_review: Option<String>,
    pub stability: Option<f64>,
    pub reps: Option<i64>,
    pub lapses: Option<i64>,
}

#[derive(Deserialize)]
pub struct CardCreateInput {
    pub subject_id: i64,
    pub chapter_id: Option<i64>,
    pub prompt: String,
    pub answer: String,
    pub card_type: String,
}

fn insert_card_with_schedule(
    conn: &Connection,
    subject_id: i64,
    chapter_id: Option<i64>,
    source_type: &str,
    prompt: &str,
    answer: &str,
    card_type: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO cards (subject_id, chapter_id, source_type, prompt, answer, card_type, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', datetime('now'))",
        rusqlite::params![subject_id, chapter_id, source_type, prompt, answer, card_type],
    )
    .map_err(|e| format!("Failed to create card: {e}"))?;

    let card_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
         VALUES (?1, datetime('now'), 1.0, 5.0, 0, 0)",
        [card_id],
    )
    .map_err(|e| format!("Failed to create schedule: {e}"))?;

    Ok(card_id)
}

fn get_card_info(conn: &Connection, card_id: i64) -> Result<CardInfo, String> {
    conn.query_row(
        "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer,
                c.card_type, c.status, c.created_at,
                cs.next_review, cs.stability, cs.reps, cs.lapses
         FROM cards c
         LEFT JOIN card_schedule cs ON cs.card_id = c.id
         WHERE c.id = ?1",
        [card_id],
        |row| {
            Ok(CardInfo {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                chapter_id: row.get(2)?,
                source_type: row.get(3)?,
                prompt: row.get(4)?,
                answer: row.get(5)?,
                card_type: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                next_review: row.get(9)?,
                stability: row.get(10)?,
                reps: row.get(11)?,
                lapses: row.get(12)?,
            })
        },
    )
    .map_err(|e| format!("Card not found: {e}"))
}

pub fn create_card(conn: &Connection, input: &CardCreateInput) -> Result<CardInfo, String> {
    let card_id = insert_card_with_schedule(
        conn,
        input.subject_id,
        input.chapter_id,
        "manual",
        &input.prompt,
        &input.answer,
        &input.card_type,
    )?;

    // If reversed, create the swapped card too
    if input.card_type == "reversed" {
        insert_card_with_schedule(
            conn,
            input.subject_id,
            input.chapter_id,
            "manual",
            &input.answer,
            &input.prompt,
            "reversed",
        )?;
    }

    get_card_info(conn, card_id)
}

pub fn list_cards(
    conn: &Connection,
    subject_id: Option<i64>,
    search: Option<&str>,
) -> Result<Vec<CardInfo>, String> {
    let mut sql = String::from(
        "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer,
                c.card_type, c.status, c.created_at,
                cs.next_review, cs.stability, cs.reps, cs.lapses
         FROM cards c
         LEFT JOIN card_schedule cs ON cs.card_id = c.id
         WHERE c.status != 'buried'",
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(sid) = subject_id {
        sql.push_str(&format!(" AND c.subject_id = ?{param_idx}"));
        params.push(Box::new(sid));
        param_idx += 1;
    }

    if let Some(q) = search {
        if !q.is_empty() {
            let like = format!("%{q}%");
            sql.push_str(&format!(
                " AND (c.prompt LIKE ?{param_idx} OR c.answer LIKE ?{})",
                param_idx + 1
            ));
            params.push(Box::new(like.clone()));
            params.push(Box::new(like));
        }
    }

    sql.push_str(" ORDER BY c.created_at DESC LIMIT 100");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let cards = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(CardInfo {
                id: row.get(0)?,
                subject_id: row.get(1)?,
                chapter_id: row.get(2)?,
                source_type: row.get(3)?,
                prompt: row.get(4)?,
                answer: row.get(5)?,
                card_type: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                next_review: row.get(9)?,
                stability: row.get(10)?,
                reps: row.get(11)?,
                lapses: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cards)
}

pub fn update_card(
    conn: &Connection,
    card_id: i64,
    prompt: Option<&str>,
    answer: Option<&str>,
    status: Option<&str>,
) -> Result<CardInfo, String> {
    if let Some(p) = prompt {
        conn.execute(
            "UPDATE cards SET prompt = ?2 WHERE id = ?1",
            rusqlite::params![card_id, p],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(a) = answer {
        conn.execute(
            "UPDATE cards SET answer = ?2 WHERE id = ?1",
            rusqlite::params![card_id, a],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(s) = status {
        conn.execute(
            "UPDATE cards SET status = ?2 WHERE id = ?1",
            rusqlite::params![card_id, s],
        )
        .map_err(|e| e.to_string())?;
    }

    get_card_info(conn, card_id)
}

pub fn get_practice_cards(
    conn: &Connection,
    subject_id: Option<i64>,
    limit: i64,
) -> Result<Vec<crate::services::review::DueCard>, String> {
    let sql = if let Some(sid) = subject_id {
        format!(
            "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer, c.card_type,
                    cs.stability, cs.difficulty, cs.reps, cs.lapses
             FROM cards c
             JOIN card_schedule cs ON cs.card_id = c.id
             WHERE c.status = 'active' AND c.subject_id = {sid}
             ORDER BY cs.last_reviewed ASC NULLS FIRST
             LIMIT {limit}"
        )
    } else {
        format!(
            "SELECT c.id, c.subject_id, c.chapter_id, c.source_type, c.prompt, c.answer, c.card_type,
                    cs.stability, cs.difficulty, cs.reps, cs.lapses
             FROM cards c
             JOIN card_schedule cs ON cs.card_id = c.id
             WHERE c.status = 'active'
             ORDER BY cs.last_reviewed ASC NULLS FIRST
             LIMIT {limit}"
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let cards = stmt
        .query_map([], |row| {
            Ok(crate::services::review::DueCard {
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
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(cards)
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
            Ok(())
        });
        db
    }

    #[test]
    fn test_create_basic_card() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1,
                chapter_id: None,
                prompt: "What is X?".to_string(),
                answer: "X is Y.".to_string(),
                card_type: "basic".to_string(),
            };
            let card = create_card(conn, &input).unwrap();
            assert_eq!(card.prompt, "What is X?");
            assert_eq!(card.card_type, "basic");
            assert_eq!(card.source_type, "manual");
            assert!(card.next_review.is_some());
            Ok(())
        });
    }

    #[test]
    fn test_create_reversed_creates_two_cards() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1,
                chapter_id: None,
                prompt: "Front".to_string(),
                answer: "Back".to_string(),
                card_type: "reversed".to_string(),
            };
            create_card(conn, &input).unwrap();

            let count: i64 = conn.query_row("SELECT COUNT(*) FROM cards", [], |r| r.get(0)).unwrap();
            assert_eq!(count, 2);

            // Second card has swapped prompt/answer
            let reversed: String = conn.query_row(
                "SELECT prompt FROM cards WHERE id = 2", [], |r| r.get(0)
            ).unwrap();
            assert_eq!(reversed, "Back");
            Ok(())
        });
    }

    #[test]
    fn test_create_cloze_card() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1,
                chapter_id: None,
                prompt: "The {{mitochondria}} is the powerhouse".to_string(),
                answer: "Energy production organelle".to_string(),
                card_type: "cloze".to_string(),
            };
            let card = create_card(conn, &input).unwrap();
            assert_eq!(card.card_type, "cloze");
            assert!(card.prompt.contains("{{mitochondria}}"));
            Ok(())
        });
    }

    #[test]
    fn test_list_cards_filters_by_subject() {
        let db = setup_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('other', 'Other', datetime('now'))",
                [],
            ).unwrap();

            let input1 = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "A".to_string(), answer: "B".to_string(), card_type: "basic".to_string(),
            };
            let input2 = CardCreateInput {
                subject_id: 2, chapter_id: None,
                prompt: "C".to_string(), answer: "D".to_string(), card_type: "basic".to_string(),
            };
            create_card(conn, &input1).unwrap();
            create_card(conn, &input2).unwrap();

            let all = list_cards(conn, None, None).unwrap();
            assert_eq!(all.len(), 2);

            let filtered = list_cards(conn, Some(1), None).unwrap();
            assert_eq!(filtered.len(), 1);
            assert_eq!(filtered[0].prompt, "A");
            Ok(())
        });
    }

    #[test]
    fn test_list_cards_search() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "What is photosynthesis?".to_string(),
                answer: "Plants convert light".to_string(),
                card_type: "basic".to_string(),
            };
            create_card(conn, &input).unwrap();

            let results = list_cards(conn, None, Some("photo")).unwrap();
            assert_eq!(results.len(), 1);

            let empty = list_cards(conn, None, Some("quantum")).unwrap();
            assert_eq!(empty.len(), 0);
            Ok(())
        });
    }

    #[test]
    fn test_update_card_prompt() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "Old".to_string(), answer: "Answer".to_string(), card_type: "basic".to_string(),
            };
            let card = create_card(conn, &input).unwrap();

            let updated = update_card(conn, card.id, Some("New"), None, None).unwrap();
            assert_eq!(updated.prompt, "New");
            assert_eq!(updated.answer, "Answer");
            Ok(())
        });
    }

    #[test]
    fn test_update_card_status_suspend() {
        let db = setup_db();
        db.with_conn(|conn| {
            let input = CardCreateInput {
                subject_id: 1, chapter_id: None,
                prompt: "Q".to_string(), answer: "A".to_string(), card_type: "basic".to_string(),
            };
            let card = create_card(conn, &input).unwrap();

            let updated = update_card(conn, card.id, None, None, Some("suspended")).unwrap();
            assert_eq!(updated.status, "suspended");
            Ok(())
        });
    }

    #[test]
    fn test_practice_returns_all_active() {
        let db = setup_db();
        db.with_conn(|conn| {
            // Create 2 cards — both with future next_review (not due)
            for i in 0..2 {
                let input = CardCreateInput {
                    subject_id: 1, chapter_id: None,
                    prompt: format!("Q{i}"), answer: format!("A{i}"), card_type: "basic".to_string(),
                };
                create_card(conn, &input).unwrap();
                conn.execute(
                    &format!("UPDATE card_schedule SET next_review = datetime('now', '+7 days') WHERE card_id = {}", i + 1),
                    [],
                ).unwrap();
            }

            // get_due_cards would return 0 (not due), but practice returns all
            let practice = get_practice_cards(conn, None, 50).unwrap();
            assert_eq!(practice.len(), 2);
            Ok(())
        });
    }
}
```

- [ ] **Step 2: Export cards module**

Add to `src-tauri/src/services/mod.rs`:
```rust
pub mod cards;
```

- [ ] **Step 3: Run tests**

Run: `cargo test` (from `src-tauri/`)
Expected: All 8 new card tests + existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/cards.rs src-tauri/src/services/mod.rs
git commit -m "feat: add cards service with CRUD, reversed creation, practice query"
```

---

### Task 2: Cards Commands — Tauri IPC

**Files:**
- Create: `src-tauri/src/commands/cards.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create cards commands**

Create `src-tauri/src/commands/cards.rs`:

```rust
use crate::AppState;
use crate::services::cards;
use crate::services::review;

#[tauri::command]
pub fn create_card(
    state: tauri::State<'_, AppState>,
    subject_id: i64,
    chapter_id: Option<i64>,
    prompt: String,
    answer: String,
    card_type: String,
) -> Result<cards::CardInfo, String> {
    let input = cards::CardCreateInput {
        subject_id,
        chapter_id,
        prompt,
        answer,
        card_type,
    };
    state.db.with_conn(|conn| cards::create_card(conn, &input))
}

#[tauri::command]
pub fn list_cards(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
    search: Option<String>,
) -> Result<Vec<cards::CardInfo>, String> {
    state.db.with_conn(|conn| cards::list_cards(conn, subject_id, search.as_deref()))
}

#[tauri::command]
pub fn update_card(
    state: tauri::State<'_, AppState>,
    card_id: i64,
    prompt: Option<String>,
    answer: Option<String>,
    status: Option<String>,
) -> Result<cards::CardInfo, String> {
    state.db.with_conn(|conn| {
        cards::update_card(conn, card_id, prompt.as_deref(), answer.as_deref(), status.as_deref())
    })
}

#[tauri::command]
pub fn get_practice_cards(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
    limit: i64,
) -> Result<Vec<review::DueCard>, String> {
    state.db.with_conn(|conn| cards::get_practice_cards(conn, subject_id, limit))
}
```

- [ ] **Step 2: Export and register**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod cards;
```

Add to `src-tauri/src/lib.rs` in `tauri::generate_handler!`:
```rust
commands::cards::create_card,
commands::cards::list_cards,
commands::cards::update_card,
commands::cards::get_practice_cards,
```

- [ ] **Step 3: Verify**

Run: `cargo check`
Expected: Compiles clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/cards.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add card IPC commands (create, list, update, get_practice)"
```

---

### Task 3: Frontend Types + IPC Wrappers

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add card management types and IPC**

Append to `src/lib/tauri.ts`:

```typescript
// Card management types
export interface CardInfo {
  id: number;
  subject_id: number;
  chapter_id: number | null;
  source_type: string;
  prompt: string;
  answer: string;
  card_type: string;
  status: string;
  created_at: string;
  next_review: string | null;
  stability: number | null;
  reps: number | null;
  lapses: number | null;
}

// Card management IPC
export const createCard = (
  subjectId: number,
  chapterId: number | null,
  prompt: string,
  answer: string,
  cardType: string,
) => invoke<CardInfo>("create_card", { subjectId, chapterId, prompt, answer, cardType });

export const listCards = (subjectId?: number, search?: string) =>
  invoke<CardInfo[]>("list_cards", { subjectId: subjectId ?? null, search: search ?? null });

export const updateCard = (
  cardId: number,
  prompt?: string,
  answer?: string,
  status?: string,
) => invoke<CardInfo>("update_card", { cardId, prompt: prompt ?? null, answer: answer ?? null, status: status ?? null });

export const getPracticeCards = (subjectId?: number, limit?: number) =>
  invoke<DueCard[]>("get_practice_cards", { subjectId: subjectId ?? null, limit: limit ?? 50 });
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat: add card management types and IPC wrappers"
```

---

### Task 4: Card Components + Cards Page

**Files:**
- Create: `src/components/cards/CardForm.tsx`
- Create: `src/components/cards/CardRow.tsx`
- Create: `src/pages/Cards.tsx`
- Modify: `src/App.tsx`

This is the largest frontend task. Read the plan at `docs/superpowers/plans/2026-03-28-card-management.md`, Task 4 for the complete code. The subagent should create all 3 files and wire the route.

- [ ] **Step 1: Create CardForm**

Create `src/components/cards/CardForm.tsx` — a form with subject dropdown, card type selector (Basic/Cloze/Reversed), prompt textarea with cloze hint, answer textarea, and Create button. It calls `createCard` IPC and `listSubjects` to populate the dropdown.

- [ ] **Step 2: Create CardRow**

Create `src/components/cards/CardRow.tsx` — an expandable card row showing prompt (truncated), type badge, status, next review. Click expands to show full content + edit fields + suspend/activate button.

- [ ] **Step 3: Create Cards page**

Create `src/pages/Cards.tsx` — page with header ("Cards" + "Create Card" button), search input, subject filter, practice button, and scrollable card list using CardRow. Loads via `listCards` IPC.

- [ ] **Step 4: Wire route + Ribbon**

In `src/App.tsx`: import Cards, add `<Route path="/cards" element={<Cards />} />`.

In `src/components/layout/Ribbon.tsx`: add `Layers` to the lucide import, add `{ path: "/cards", icon: Layers, label: "Cards" }` to NAV_ITEMS after Review.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx biome check --write . && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/components/cards/ src/pages/Cards.tsx src/App.tsx src/components/layout/Ribbon.tsx
git commit -m "feat: add Cards page with create/browse/filter and Ribbon nav"
```

---

### Task 5: Cloze Rendering in ReviewCard

**Files:**
- Modify: `src/components/review/ReviewCard.tsx`

- [ ] **Step 1: Add cloze rendering**

Update `ReviewCard.tsx` to handle cloze cards. Add a `cardType` prop and render cloze prompts with blanks:

The component should accept a new `cardType: string` prop. When `cardType === "cloze"`:
- **Not revealed**: Replace `{{text}}` patterns in prompt with `_____`
- **Revealed**: Replace `{{text}}` with `<strong>text</strong>`

Add this helper inside the component:
```tsx
const renderPrompt = (text: string, type: string, isRevealed: boolean) => {
  if (type !== "cloze") return text;
  if (!isRevealed) {
    return text.replace(/\{\{([^}]+)\}\}/g, "_____");
  }
  return text.replace(/\{\{([^}]+)\}\}/g, (_, match) => match);
};
```

Update the prompt display to use `renderPrompt(prompt, cardType, revealed)`.

When revealed and cloze, show the filled-in word in bold by using `dangerouslySetInnerHTML` with the replacement `<strong>${match}</strong>` (sanitize isn't needed since cloze text comes from the user's own cards).

- [ ] **Step 2: Update ReviewCard callers**

Update `Review.tsx` to pass `cardType={card.card_type}` to `ReviewCard`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/review/ReviewCard.tsx src/pages/Review.tsx
git commit -m "feat: add cloze card rendering with blanks and reveal"
```

---

### Task 6: Practice Mode in Review + Links

**Files:**
- Modify: `src/pages/Review.tsx`
- Modify: `src/components/review/ReviewComplete.tsx`

- [ ] **Step 1: Add practice mode to Review**

In `Review.tsx`, read query params to detect practice mode:

```tsx
const [searchParams] = useSearchParams();
const practiceMode = searchParams.get("practice");
```

In `loadCards`, check for practice mode:
```tsx
const loadCards = useCallback(async () => {
  try {
    const data = practiceMode
      ? await getPracticeCards(undefined, 50)
      : await getDueCards(50);
    setCards(data);
  } catch {
    // Non-critical
  } finally {
    setLoading(false);
  }
}, [practiceMode]);
```

Add `useSearchParams` import from `react-router-dom` and `getPracticeCards` import from `../lib/tauri`.

- [ ] **Step 2: Add links to ReviewComplete**

In `ReviewComplete.tsx`, add practice and browse links after the stats:

```tsx
<div className="mt-6 flex flex-col items-center gap-2">
  <a
    href="/review?practice=all"
    onClick={(e) => { e.preventDefault(); navigate("/review?practice=all"); }}
    className="text-sm text-accent hover:underline"
  >
    Practice anyway
  </a>
  <a
    href="/cards"
    onClick={(e) => { e.preventDefault(); navigate("/cards"); }}
    className="text-xs text-text-muted hover:text-text"
  >
    Browse Cards
  </a>
</div>
```

Add `useNavigate` import and call `const navigate = useNavigate()`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx biome check --write . && npm test`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Review.tsx src/components/review/ReviewComplete.tsx
git commit -m "feat: add practice mode to Review and browse/practice links"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run all gates**

Run: `cargo test` (from `src-tauri/`)
Run: `npx tsc --noEmit && npx biome check . && npm test`
Expected: All pass.

- [ ] **Step 2: Visual verification with Tauri dev**

Run: `npm run tauri dev`

Verify:
1. Cards icon appears in Ribbon (between Review and Settings)
2. Cards page shows searchable list (empty initially)
3. "Create Card" → form with type selector (Basic/Cloze/Reversed)
4. Create a basic card → appears in list
5. Create a cloze card with `{{brackets}}` → appears in list
6. Create a reversed card → TWO cards appear (original + swapped)
7. Click card → expand → edit prompt/answer → save
8. Suspend a card → status changes
9. "Practice" button → opens Review with ALL cards (not just due)
10. Review shows cloze cards with blanks, reveals with bold
11. Review "All caught up" screen shows "Practice anyway" and "Browse Cards" links
