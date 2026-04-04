# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

Encode v2 — a local-first desktop study engine built with Tauri 2.0. Not a note-taking app. The app runs one loop: `import → read in chunks → recall → verify → repair → spaced review`. The canonical specification lives in `second_shot/blueprint.md`.

## Commands

```bash
# Frontend
npm run dev              # Vite dev server (port 5173)
npm run build            # tsc && vite build
npm test                 # vitest run (CI mode)
npm run test:watch       # vitest (watch mode)
npx tsc --noEmit         # Type check (zero errors required)
npx biome check .        # Lint + format check
npx biome check --write . # Auto-fix lint/format

# Rust backend
cargo check              # Compile check (must pass clean)
cargo test               # Rust unit tests
cargo clippy             # Lint

# Full app
npm run tauri dev        # Launch dev build (Vite + Rust)
npm run tauri build      # Production build
```

## Tech Stack

- **Tauri 2.0** — Rust backend, system webview
- **React 18 + TypeScript** (strict mode) — Frontend
- **Tailwind CSS 4** — Styling via `@theme` CSS-first config
- **Zustand** — State management (stores split by feature domain)
- **CodeMirror 6** — Markdown editor (support surface, not the product center)
- **SQLite (rusqlite)** — Runtime source of truth (FTS5 for search)
- **FSRS-5** — Spaced repetition scheduling
- **Biome** — Linting and formatting for frontend/config only (src/, *.json, *.ts at root). Rust is linted by `cargo clippy`. `biome.json` explicitly ignores `src-tauri/`, `dist/`, `target/`, `.Codex/`.
- **lefthook** — Pre-commit hooks
- **Vitest** — Testing with coverage thresholds

## Architecture

### Storage Model (Two-Plane)

**SQLite is the runtime source of truth.** It owns queue state, section progress, study events, card scheduling, AI run metadata, and workflow state.

**Markdown is the export/trust layer.** User-facing artifacts (chapters, flashcards, quiz archives, teach-backs) are deterministically exportable as markdown. Background auto-export runs by default. Deleting SQLite without prior export/backup may lose runtime state — this is a deliberate tradeoff.

**Write coordination:** All file writes use atomic `.tmp` + rename. A per-path lock layer serializes concurrent access (editor, indexer, export).

### Data Model (13 tables)

`subjects`, `sources`, `chapters`, `chapter_sections`, `study_events` (append-only event log), `cards`, `card_schedule` (FSRS state: next_review, stability, difficulty, reps, lapses), `card_reviews`, `quizzes`, `quiz_attempts`, `teachbacks`, `ai_runs`, `settings`

### Frontend Structure

```
src/
  pages/           # Route-level orchestration
  features/        # Workflow-scoped state + components
    queue/ library/ reader/ review/ quiz/ teachback/ settings/
  domain/          # Pure logic (no React, no side effects)
    queue/ study/ fsrs/ ai/ export/ migration/
  components/      # Shared UI
    ui/ layout/
  lib/             # Utilities
    tauri/ markdown/ dates/ schemas/
```

Rule: **UI components render, feature modules orchestrate, domain modules decide.** One canonical implementation per utility (slugify, frontmatter parsing, date helpers).

### Backend Structure (Rust)

```
src-tauri/src/
  commands/        # Tauri IPC interface (domain-oriented, not file-primitive)
  services/        # Business logic (vault_fs, indexer, ai_client, export)
  db/              # SQLite operations, migrations, schema
```

Commands are domain-shaped: `reader.submit_check`, `queue.get_next_items`, `review.submit_rating` — not `write_file` or `read_file`. Main pages use batch IPC calls (e.g., `getDashboardData` returns everything in one invoke).

### State Machines

**Chapter:** `new → reading → awaiting_synthesis → ready_for_quiz → mastering → stable`

**Section:** `unseen → seen → checked_correct | checked_partial | checked_off_track → revisit_scheduled`

**Repair:** `created → queued → completed | snoozed | superseded`

## Non-Negotiable Rules

1. **Repair is the product.** Every partial/failed response creates exactly one of: `retry_now`, `create_repair_card`, `revisit_later`, `schedule_retest`. No multi-paragraph AI essay walls.
2. **One check per chunk.** Reader asks one short, high-signal response per section. No multi-question gates.
3. **One queue answers "what now?"** Unified Study Queue ranks reading, repair, review, and retesting into a single list with deterministic 0-100 scoring.
4. **AI must not own:** queue ranking, FSRS scheduling, chunk splitting, status transitions, import/export, migrations, data integrity.
5. **No-AI mode must be useful.** Deterministic fallbacks for every AI-powered feature.
6. **Fewer, better cards.** Cards come from demonstrated gaps, not automatic generation. One repair card per section failure, one per quiz miss.
7. **Batch IPC, never N+1.** No sequential Tauri invoke loops. Dashboard data in one call.
8. **Markdown before SQLite.** When both are written, file write happens first. If file write fails, SQLite stays stale (safe). If SQLite fails after file succeeds, it self-heals on restart.

## AI Integration

All AI goes through one typed contract:

```typescript
type AiJobRequest = {
  feature: 'reader.section_check' | 'reader.synthesis_eval' | 'reader.repair_card'
         | 'quiz.generate' | 'quiz.evaluate' | 'teachback.evaluate';
  modelPolicy: 'cheap_local' | 'balanced' | 'strong_reasoning';
  timeoutMs: number;
  fallbackPolicy: 'deterministic' | 'none';
};
```

Providers: `none`, `ollama`, `Codex`, `gemini`, `openai`, `deepseek`, `cli` — all through one typed Rust router with a shared `reqwest::Client`. Profile context injected server-side into all prompts. `ai_runs` table logs every call.

## Queue Scoring (0-100)

| Item Type | Base | Boosts |
|---|---|---|
| `due_card` | 60 | +25 overdue, +10 low-stability |
| `repair_card` | 75 | +10 recent-miss |
| `continue_reading` | 40 | +15 momentum |
| `synthesis_required` | 50 | — |
| `quiz_retake` | 45 | +15 cooldown elapsed |
| `new_chapter` | 20 | +10 pinned-subject |

Tie-breakers: shorter task → same-subject continuity → most recently active chapter.

## Testing

- **TDD for algorithms:** FSRS, queue ranking, chunk splitting, export/import round-trips — tests written before implementation
- **Coverage thresholds** enforced per-file in vitest.config.ts (100% branch on sr.ts)
- **Acceptance scenarios:** import→read→repair→review, synthesis unlocks quiz, quiz misses create repair, due review outranks new reading, no-AI mode works, export/import round-trip preserves artifacts

## Config

`config.toml` is the human-readable source for durable settings (AI providers, models, vault paths). SQLite stores ephemeral UI state (window position, last surface). Do not duplicate durable config across both.

## Security

- Strict CSP enabled (not null)
- DOMPurify on all rendered HTML
- Path traversal validation on all file operations
- AI error messages sanitized (no key leakage)
- Gemini API key in header, not URL query string
- CLI provider: command allowlist + 30s timeout

## What Not to Build

No plugin system, cloud sync, social features, gamification, mobile, AI chat mode, matching questions, large adaptive testing, concept maps, or heavy analytics suite. See blueprint Section 23.
