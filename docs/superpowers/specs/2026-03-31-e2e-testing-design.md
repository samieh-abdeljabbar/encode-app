# End-to-End Testing — Design Spec

## Context

Features have been built (quizzes, AI settings, inline flashcards, AI wiring) but never tested end-to-end. Playwright can't control Tauri's webview directly. This spec creates two complementary test suites: Rust integration tests for backend logic, and Playwright + IPC mocks for UI verification.

## Part 1: Rust Integration Tests

**File:** `src-tauri/tests/integration_flow.rs`

Uses `Database::open_memory()` to create an in-memory SQLite with all migrations, then exercises the full service layer.

### Test 1: Full Study Loop
1. `subjects` — insert "Computer Science"
2. `chunker::split_into_sections` — split markdown into sections
3. Insert `chapters` + `chapter_sections` rows
4. `reader::mark_section_seen` — all sections
5. `reader::process_check` — mix of correct, partial, off_track
6. Verify: repair cards created for off_track
7. `reader::process_synthesis` — submit synthesis
8. Verify: chapter status = "ready_for_quiz"
9. `quiz::generate_quiz` — generates deterministic questions
10. Verify: correct number of questions, mix of types
11. `quiz::submit_answer` — answer some correct, some wrong
12. `quiz::submit_self_rating` — rate short answers
13. `quiz::complete_quiz` — finalize
14. Verify: score calculated, chapter status advanced (or not), repair cards from misses

### Test 2: Card CRUD + Review
1. Insert subject
2. `cards::create_card` — basic, cloze, reversed
3. `cards::list_cards` — verify all exist (reversed creates 2)
4. `review::get_due_cards` — verify cards are due
5. `review::submit_rating` — rate a card
6. Verify: schedule updated (next_review in future)

### Test 3: Quiz Failure + Retest
1. Set up chapter at ready_for_quiz
2. Generate quiz, answer all wrong
3. Complete quiz — verify score < 0.8, chapter stays ready_for_quiz
4. `queue::get_dashboard` — verify queue items include quiz-related entries

### Test 4: Queue Ordering
1. Create mix: due card, in-progress chapter, ready-for-quiz chapter
2. `queue::get_dashboard`
3. Verify: items sorted by score descending, due cards outrank new chapters

## Part 2: Playwright + IPC Mocks

### Mock Layer
**File:** `src/__tests__/tauri-mock.ts`

Exports a `setupTauriMock()` function that sets `window.__TAURI_INTERNALS__` with an `invoke` handler. Each command returns realistic mock data.

Mock commands: `list_subjects`, `list_chapters`, `get_chapter_with_sections`, `load_reader_session`, `generate_quiz`, `get_quiz`, `submit_quiz_answer`, `complete_quiz`, `list_cards`, `get_config`, `check_ai_status`, `list_ai_runs`, `get_queue_dashboard`, `get_export_status`, `list_snapshots`

### Playwright E2E Tests
**File:** `src/__tests__/e2e-ui.test.ts`

Uses Playwright MCP tools to navigate through the app at localhost:5173 with mocks injected.

Tests:
1. Library page renders with subjects and chapters
2. Navigation between pages works (Queue, Library, Review, Cards, Quizzes, Settings)
3. Quiz page renders questions with sidebar
4. Cards page shows cards
5. Settings page shows AI config form
6. Ribbon shows AI status indicator

## Files to Create

- `src-tauri/tests/integration_flow.rs` — Rust integration tests
- `src/__tests__/tauri-mock.ts` — Tauri IPC mock layer
- `src/__tests__/e2e-ui.test.ts` — Playwright UI tests (if practical, otherwise Vitest component tests)

## Verification

- `cargo test --test integration_flow` — all integration tests pass
- `npm test` — all frontend tests pass (including new ones)
