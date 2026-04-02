# Teach-Back Feature Design

## Overview

A single-round "explain what you learned" exercise. The user writes a free-form explanation of a chapter's content, AI evaluates it against a 5-criterion rubric, and the result is a mastery band with targeted feedback. Not mandatory for chapter completion — an optional reinforcement tool.

## Entry Points

1. **Reader done screen** — "Teach Back" button alongside "Take Quiz" after completing all sections
2. **Library chapter card** — purple "Teach Back" button on chapters at `mastering` or `stable` status
3. **Study Queue** — suggested teach-back items for chapters at `mastering`/`stable` with no prior teach-back (base score: 35)

## User Flow

1. User clicks "Teach Back" → navigates to `/teachback?chapter={id}`
2. Page loads chapter context, AI generates a chapter-specific prompt (e.g., "Explain how a BST maintains sorted order during insertions and deletions. Use a concrete example.")
3. User writes their explanation in a textarea (no time limit, no word limit)
4. User clicks Submit → loading state while AI evaluates
5. Result screen shows: mastery band (color-coded), strongest part, biggest gap, rubric breakdown bars
6. If mastery is `weak` or `developing`: one repair flashcard is auto-created from the biggest gap
7. User can click "Try Again" (generates a fresh prompt) or "Back to Library"

## Rubric

Five criteria, each scored 0-100 internally by the AI evaluator:

| Criterion | What it measures |
|-----------|-----------------|
| Accuracy | Factual correctness of the explanation |
| Clarity | Organization, flow, easy to follow |
| Completeness | Covers the key concepts from the chapter |
| Concrete example | Includes a real, illustrative example |
| Jargon | Technical terms are explained, not just dropped |

Overall mastery score = average of the 5 criteria scores.

## Mastery Bands

| Band | Score Range | Color | Repair Card? |
|------|-----------|-------|--------------|
| weak | 0-39 | Red | Yes |
| developing | 40-59 | Amber | Yes |
| solid | 60-79 | Green | No |
| ready | 80-100 | Teal | No |

## Result Screen

Displays:
- Mastery band with color-coded icon
- "Strongest part" — one sentence highlighting what the user did well
- "Biggest gap" — one sentence identifying the main weakness
- Rubric breakdown — 4 horizontal progress bars (accuracy, clarity, completeness, example)
- If repair card created: small notice "Repair card created for: [gap topic]"
- Action buttons: "Try Again" and "Back to Library"

## No-AI Fallback

When no AI provider is configured, teach-back uses a structured self-review:
- The prompt is deterministic: "Explain the key concepts from this chapter in your own words. Include at least one concrete example."
- After the user writes their explanation, instead of AI evaluation, they see the 5 rubric criteria as a self-rating checklist
- Each criterion has 3 options: "Missed" (0), "Partial" (50), "Strong" (100)
- Mastery band computed from the average of self-ratings
- Repair card created if weak/developing, using the lowest-rated criterion as the gap

## Database

Existing `teachbacks` table — no schema changes needed:

```sql
CREATE TABLE IF NOT EXISTS teachbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    prompt TEXT NOT NULL,
    response TEXT,
    evaluation_json TEXT,
    mastery TEXT CHECK(mastery IN ('weak', 'developing', 'solid', 'ready') OR mastery IS NULL),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `evaluation_json` Shape

```json
{
  "scores": {
    "accuracy": 85,
    "clarity": 90,
    "completeness": 60,
    "example": 80,
    "jargon": 75
  },
  "overall": 78,
  "strongest": "Your explanation of insertion order was clear and your binary tree example was well-chosen.",
  "biggest_gap": "Deletion cases (especially nodes with two children) weren't covered.",
  "repair_card_id": null
}
```

## Backend

### Service: `src-tauri/src/services/teachback.rs`

Three public functions:

1. **`start_teachback(conn, chapter_id, ai_state?) → Result<TeachbackStart>`**
   - Validates chapter exists and has sections
   - If AI configured: generates a chapter-specific prompt via AI (`teachback.generate_prompt` feature, `balanced` policy, 60s timeout)
   - If no AI: returns deterministic prompt "Explain the key concepts from this chapter in your own words. Include at least one concrete example."
   - Inserts `teachbacks` row with prompt, NULL response/evaluation/mastery
   - Returns `TeachbackStart { id, prompt, chapter_title, subject_name }`

2. **`submit_teachback(conn, teachback_id, response, ai_state?) → Result<TeachbackResult>`**
   - Loads teachback row and chapter sections for context
   - If AI configured: calls AI with `teachback.evaluate` feature, `strong_reasoning` policy, 90s timeout
   - If no AI: returns result with `needs_self_rating: true` (frontend handles self-review)
   - Computes mastery band from overall score
   - If weak/developing: creates repair card via `cards::create_card` with `source_type: "teachback_miss"`, prompt = biggest gap
   - Updates teachback row with response, evaluation_json, mastery
   - Logs study event (`event_type: "teachback"`)
   - Logs AI run
   - Returns `TeachbackResult { mastery, scores, strongest, biggest_gap, repair_card_id, needs_self_rating }`

3. **`submit_self_rating(conn, teachback_id, ratings) → Result<TeachbackResult>`**
   - For no-AI mode: receives user's self-ratings for the 5 criteria
   - Computes overall score and mastery band
   - Creates repair card if weak/developing
   - Updates teachback row
   - Logs study event
   - Returns same `TeachbackResult` shape

### Commands: `src-tauri/src/commands/teachback.rs`

```
start_teachback(chapter_id) → TeachbackStart        // async (AI prompt generation)
submit_teachback(teachback_id, response) → TeachbackResult  // async (AI evaluation)
submit_self_rating(teachback_id, ratings) → TeachbackResult  // sync
list_teachbacks(subject_id?) → Vec<TeachbackListItem>        // sync
```

Register all 4 in `lib.rs` invoke handler.

### AI Prompts

**Prompt generation** (system prompt):
```
You are generating a teach-back prompt for a student. Given the chapter content below, create a single focused question that asks the student to explain a key concept in their own words. The question should require demonstrating understanding, not just recall. Ask them to include a concrete example.
```

**Evaluation** (system prompt):
```
You are evaluating a student's teach-back explanation. Score each criterion 0-100:
- accuracy: factual correctness
- clarity: organization and flow
- completeness: covers key concepts
- example: includes a real, illustrative example
- jargon: technical terms are explained, not just dropped

Respond with JSON only:
{"scores":{"accuracy":N,"clarity":N,"completeness":N,"example":N,"jargon":N},"overall":N,"strongest":"...","biggest_gap":"..."}
```

## Frontend

### Route

Add `/teachback` to `App.tsx` inside the Shell route group.

### Page: `src/pages/Teachback.tsx`

State machine: `loading → prompting → writing → evaluating → result | selfrating`

- Accepts `?chapter={id}` query parameter
- `loading`: calls `start_teachback` IPC
- `prompting → writing`: shows prompt card + textarea (auto-transition, same screen)
- `writing → evaluating`: user clicks Submit, shows loading spinner
- `evaluating → result`: AI returns evaluation, shows mastery + feedback
- `evaluating → selfrating`: no-AI mode, shows self-rating checklist
- `selfrating → result`: user submits self-ratings

The page is self-contained — no separate components directory needed. It's simpler than Quiz (no sidebar, no multi-question navigation).

### IPC Wrappers: `src/lib/tauri.ts`

```typescript
interface TeachbackStart {
  id: number;
  prompt: string;
  chapter_title: string;
  subject_name: string;
}

interface TeachbackResult {
  mastery: string;
  scores: { accuracy: number; clarity: number; completeness: number; example: number; jargon: number };
  strongest: string;
  biggest_gap: string;
  repair_card_id: number | null;
  needs_self_rating: boolean;
}

interface TeachbackListItem {
  id: number;
  chapter_id: number | null;
  chapter_title: string;
  subject_name: string;
  mastery: string | null;
  created_at: string;
}

interface SelfRatings {
  accuracy: number;
  clarity: number;
  completeness: number;
  example: number;
  jargon: number;
}

export const startTeachback = (chapterId: number) => invoke<TeachbackStart>('start_teachback', { chapterId });
export const submitTeachback = (teachbackId: number, response: string) => invoke<TeachbackResult>('submit_teachback', { teachbackId, response });
export const submitTeachbackSelfRating = (teachbackId: number, ratings: SelfRatings) => invoke<TeachbackResult>('submit_teachback_self_rating', { teachbackId, ratings });
export const listTeachbacks = (subjectId?: number) => invoke<TeachbackListItem[]>('list_teachbacks', { subjectId: subjectId ?? null });
```

### Entry Point Modifications

1. **`src/pages/Reader.tsx`** — add "Teach Back" button on done screen
2. **`src/pages/Library.tsx`** — add "Teach Back" button on chapter cards at `mastering`/`stable`
3. **`src-tauri/src/services/queue.rs`** — add `teachback_available` queue item type (base score: 35, chapters at mastering/stable without a teachback with mastery solid/ready)

## Queue Integration

New queue item type: `teachback_available`
- Base score: 35
- Eligible: chapters at `mastering` or `stable` status, without a teach-back record that has mastery `solid` or `ready`
- Route: `/teachback?chapter={id}`
- Reason: "Practice explaining what you learned"
- Estimated minutes: 5

## Testing

### Rust Unit Tests (in `services/teachback.rs`)
- `test_start_teachback_creates_record` — inserts row with prompt, NULL response
- `test_submit_teachback_updates_record` — sets response, evaluation, mastery
- `test_weak_mastery_creates_repair_card` — score < 40 creates card with source_type "teachback_miss"
- `test_solid_mastery_no_repair_card` — score >= 60 does not create card
- `test_self_rating_computes_mastery` — average of ratings maps to correct band
- `test_list_teachbacks` — returns filtered list by subject

### Integration Tests (extend `tests/integration_flow.rs`)
- `test_teachback_flow` — start → submit → verify mastery + repair card

### Frontend Verification
- `npx tsc --noEmit` — zero errors
- `npx biome check .` — clean
