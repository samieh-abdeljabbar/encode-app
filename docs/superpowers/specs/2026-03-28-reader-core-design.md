# Sub-project 2A: Reader Core — Design Spec

## Problem

The app has a Library for organizing subjects/chapters but no way to actually study them. The Reader is the core surface where the learning loop happens: read a section, check understanding, create repair cards from gaps, complete synthesis.

## Scope

Epics 2.1 (Reader & chunk progression), 2.2 (Section evaluation & repair), 2.3 (Synthesis & quiz readiness). No AI (that's Phase 3) — uses self-check evaluation.

## Architecture

### Database Changes (Migration 002)

Add `status` column to `chapter_sections`:

```sql
ALTER TABLE chapter_sections ADD COLUMN status TEXT NOT NULL DEFAULT 'unseen'
  CHECK(status IN ('unseen', 'seen', 'checked_correct', 'checked_partial', 'checked_off_track'));
```

No new tables needed — `study_events`, `cards`, and `card_schedule` already exist from migration 001.

### Rust Backend — 3 New Commands

**`reader.load_session(chapter_id: i64)`** → `ReaderSession`

Returns chapter metadata + all sections with their statuses in one batch IPC call. No N+1.

```rust
struct ReaderSession {
    chapter: Chapter,        // id, title, status, estimated_minutes
    sections: Vec<Section>,  // id, section_index, heading, body_markdown, word_count, status
    current_index: i32,      // first unseen/incomplete section index
}
```

**`reader.submit_check(chapter_id: i64, section_index: i32, response: String, self_rating: String)`** → `CheckResult`

- `self_rating`: `"correct"`, `"partial"`, or `"off_track"`
- Updates `chapter_sections.status` to `checked_correct`, `checked_partial`, or `checked_off_track`
- If `off_track`: creates a repair card in `cards` table (source_type='repair') + initial `card_schedule` row
- If `partial` and section status is currently `seen` (first attempt): allows one retry by keeping status as `seen` and returning `can_retry: true`. If section status is already `checked_partial` (second attempt): finalizes as `checked_partial` with `can_retry: false`.
- Logs `study_event` (type: `section_check_submitted`, payload includes rating and response length)
- If all sections checked: transitions `chapters.status` to `awaiting_synthesis`

```rust
struct CheckResult {
    outcome: String,          // "correct", "partial", "off_track"
    can_retry: bool,          // true if partial and no prior retry
    repair_card_created: bool,
    chapter_complete: bool,   // all sections done, needs synthesis
}
```

**`reader.submit_synthesis(chapter_id: i64, synthesis_text: String)`** → `SynthesisResult`

- Transitions `chapters.status` from `awaiting_synthesis` to `ready_for_quiz`
- Logs `study_event` (type: `synthesis_completed`)
- Updates `chapters.updated_at`

```rust
struct SynthesisResult {
    success: bool,
    new_status: String,
}
```

### Rust Backend — Service Layer

**`services/reader.rs`** — Business logic extracted from commands:
- `get_reader_session(conn, chapter_id)` — batch query
- `process_check(conn, chapter_id, section_index, response, rating)` — evaluation + side effects
- `process_synthesis(conn, chapter_id, text)` — status transition
- `generate_prompt(section)` — deterministic no-AI prompt generation

**Prompt generation (no-AI)**: Template bank keyed on heuristic section type:
- Section has definitions/principles → `"Explain the key concept from this section in your own words."`
- Section has steps/procedures → `"What are the main steps or process described in this section?"`
- Section has comparisons → `"What are the key differences or similarities discussed?"`
- Default → `"Summarize the main idea of this section in 2-3 sentences."`

Heuristic: scan heading + first 100 words for keyword signals (e.g., "steps", "process" → procedural; "vs", "compared" → comparison).

### Frontend — Reader Page

**`src/pages/Reader.tsx`** — Route: `/reader?chapter={id}`

Single-column focused layout:
- Navigated to from Library chapter list or Queue items
- Loads session via `reader.load_session` on mount
- Manages section progression state locally

**Layout structure:**
```
┌─────────────────────────────────────┐
│ ← Back    Chapter Title    3 of 8  │  ← header
├─────────────────────────────────────┤
│                                     │
│     Section heading                 │
│     Rendered markdown content       │  ← scrollable content
│     ...                             │
│                                     │
├─────────────────────────────────────┤
│  [ Action Zone ]                    │  ← changes based on state
│  "I've read this" / Gate / Next     │
└─────────────────────────────────────┘
```

**Section state flow in UI:**

1. **Reading** — Section markdown displayed, "I've read this" button at bottom
2. **Gate** — Prompt question appears below content, textarea for response
3. **Self-check** — After submitting response, model answer revealed, three buttons: "Got it" / "Partially" / "Missed it"
4. **Result** — Brief feedback line, "Next Section" button
5. **Chapter complete** — All sections done, synthesis textarea appears
6. **Synthesis submitted** — Success message, link back to Library

### Frontend — Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `ReaderHeader` | `src/components/reader/ReaderHeader.tsx` | Back button, chapter title, progress (e.g., "3 of 8") |
| `ReaderContent` | `src/components/reader/ReaderContent.tsx` | Renders section markdown via `marked` + `DOMPurify` |
| `DigestionGate` | `src/components/reader/DigestionGate.tsx` | Prompt display, response textarea, self-check rating flow |
| `SynthesisPanel` | `src/components/reader/SynthesisPanel.tsx` | End-of-chapter synthesis textarea + submit |
| `ProgressBar` | `src/components/reader/ProgressBar.tsx` | Visual section progress indicator |

### Frontend — State Management

No Zustand store for the Reader. Local component state in `Reader.tsx` is sufficient:
- `session: ReaderSession | null` — loaded on mount
- `currentIndex: number` — which section is active
- `gatePhase: 'reading' | 'responding' | 'self_check' | 'result'` — gate UI state
- `response: string` — textarea value
- `loading: boolean` — for IPC calls

### Routing

Add route to `App.tsx`: `<Route path="/reader" element={<Reader />} />`

Library chapter buttons already navigate to `/reader?chapter={id}`.

## What NOT to Build

- No AI evaluation (Phase 3)
- No quiz generation (Phase 3)
- No flashcard review UI (Sub-project 2B)
- No queue page (Sub-project 2C)
- No CodeMirror editor integration (Epic 2.6, separate)
- No section outline sidebar (YAGNI — single column is sufficient)

## Verification

1. `cargo test` — Rust unit tests for reader service (prompt generation, status transitions, repair card creation)
2. `npm test` — Vitest tests for Reader component rendering and gate flow
3. `npx tsc --noEmit` — zero errors
4. `npx biome check .` — zero errors
5. Manual flow in `npm run tauri dev`:
   - Navigate to Library → click a chapter → Reader opens
   - Read through sections, mark as read
   - Gate appears with prompt question
   - Submit response, self-check, advance
   - "Missed it" creates a repair card (verify in DB)
   - Complete all sections → synthesis gate appears
   - Submit synthesis → chapter status becomes `ready_for_quiz`
   - Study events logged (verify in DB)
