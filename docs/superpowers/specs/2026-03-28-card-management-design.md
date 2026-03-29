# Card Management & Practice — Design Spec

## Problem

Cards can only be created via Reader repair flow. There's no way to manually create flashcards, browse existing cards, edit/delete them, or practice reviewing when no cards are due. The app supports basic/cloze/reversed card types in the DB but only renders basic.

## Solution

Add a Cards page (`/cards`) in the Ribbon for full card CRUD, browsing, and practice mode. Update the Review page with a link to Cards and a "Practice anyway" option. Support all three card types in creation and rendering.

## Architecture

### Backend — 3 New IPC Commands

**`cards.create(subject_id, chapter_id?, prompt, answer, card_type)`** → `Card`

Creates a card + initial `card_schedule` row (next_review = now, stability = 1.0, difficulty = 5.0, reps = 0, lapses = 0). If `card_type` is `"reversed"`, creates a second card with prompt/answer swapped — both get independent schedules.

```rust
struct CardCreateInput {
    subject_id: i64,
    chapter_id: Option<i64>,
    prompt: String,
    answer: String,
    card_type: String,  // "basic", "cloze", "reversed"
}

struct CardInfo {
    id: i64,
    subject_id: i64,
    chapter_id: Option<i64>,
    source_type: String,
    prompt: String,
    answer: String,
    card_type: String,
    status: String,
    created_at: String,
    next_review: Option<String>,
    stability: Option<f64>,
    reps: Option<i64>,
    lapses: Option<i64>,
}
```

**`cards.list(subject_id?, search?)`** → `Vec<CardInfo>`

Returns all active cards joined with `card_schedule` for schedule state. Optional filters:
- `subject_id`: filter to one subject
- `search`: LIKE match on prompt or answer

**`cards.update(card_id, prompt?, answer?, status?)`** → `CardInfo`

Edit card content or change status (active → suspended → buried). Setting status to `"suspended"` removes it from due queries.

### Card Type Rendering

**Basic**: Show prompt → reveal answer. (Already works.)

**Cloze**: Prompt stored as `"The {{powerhouse}} of the cell"`.
- Review display: `"The _____ of the cell"`
- Revealed: `"The **powerhouse** of the cell"` (bold the cloze)
- The `answer` field stores additional context/explanation

**Reversed**: On creation, two cards are inserted:
1. Original: prompt → answer
2. Reversed: answer → prompt (source_type = 'manual', card_type = 'reversed')
Both are independent cards with separate FSRS schedules.

### Frontend — Cards Page

**Route**: `/cards` (new Ribbon nav item)

**Layout:**
```
┌─────────────────────────────────────────┐
│  Cards              [ + Create Card ]   │
├─────────────────────────────────────────┤
│  🔍 Search...    [Subject ▾] [Practice] │
├─────────────────────────────────────────┤
│                                         │
│  Q: What is force?                      │
│  basic · Physics · Due in 3 days        │
│                                         │
│  Q: The {{mitochondria}} is the...      │
│  cloze · Biology · Due now              │
│                                         │
│  Q: F = ma means...                     │
│  reversed · Physics · 5 reviews         │
│                                         │
└─────────────────────────────────────────┘
```

**Create Card modal/form:**
- Subject selector (dropdown of existing subjects)
- Card type selector: Basic / Cloze / Reversed
- Prompt textarea (with cloze hint: "Use {{brackets}} for blanks")
- Answer textarea
- Create button

**Card row actions:** Click to expand inline → edit prompt/answer, change status (suspend/activate), or delete.

**Practice button:** Loads all active cards (or filtered by current subject) into the Review page via a query param like `/review?practice=true` or `/review?subject=5`. The Review page detects this and loads ALL cards instead of just due ones. Ratings still update FSRS.

### Review Page Updates

- "All caught up" screen: add "Practice anyway →" link that navigates to `/review?practice=all`
- Add "Browse Cards →" link that navigates to `/cards`

### Ribbon Update

Add a Cards icon (`Layers` from lucide-react) between Review and Settings:
```
Queue / Library / Review / Cards / Settings
```

### Frontend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `Cards.tsx` | `src/pages/Cards.tsx` | Page: list, search, filter, create modal |
| `CardRow.tsx` | `src/components/cards/CardRow.tsx` | Single card row with expand/edit |
| `CardForm.tsx` | `src/components/cards/CardForm.tsx` | Create/edit form with type selector |
| `ReviewCard.tsx` | `src/components/review/ReviewCard.tsx` | Modify: add cloze rendering |

### Review Page — Practice Mode

The existing `getDueCards` IPC fetches cards where `next_review <= now`. For practice mode, add a new IPC:

**`cards.get_practice(subject_id?, limit)`** → `Vec<DueCard>`

Same shape as `DueCard` but without the date filter — returns all active cards ordered by last_reviewed (least recently reviewed first).

## Files to Create/Modify

| File | Action |
|------|--------|
| `src-tauri/src/services/cards.rs` | Create — card CRUD + practice query |
| `src-tauri/src/services/mod.rs` | Modify — export cards |
| `src-tauri/src/commands/cards.rs` | Create — 4 IPC commands |
| `src-tauri/src/commands/mod.rs` | Modify — export cards |
| `src-tauri/src/lib.rs` | Modify — register card commands |
| `src/lib/tauri.ts` | Modify — add card types + IPC wrappers |
| `src/pages/Cards.tsx` | Create — card browser page |
| `src/components/cards/CardRow.tsx` | Create — card list row |
| `src/components/cards/CardForm.tsx` | Create — create/edit form |
| `src/components/review/ReviewCard.tsx` | Modify — cloze rendering |
| `src/pages/Review.tsx` | Modify — practice mode + links |
| `src/components/review/ReviewComplete.tsx` | Modify — practice link |
| `src/components/layout/Ribbon.tsx` | Modify — add Cards nav item |
| `src/App.tsx` | Modify — add /cards route |

## What NOT to Build

- No bulk import/export of cards
- No card tags/labels
- No spaced repetition parameter tuning
- No card statistics/history page (future)
- No drag-to-reorder cards

## Verification

1. `cargo test` — card CRUD tests, reversed card creation, practice query
2. `npx tsc --noEmit` — zero errors
3. Manual: create basic/cloze/reversed cards → appear in browser → practice all → cloze renders with blanks → reversed creates two cards → ratings update schedule
