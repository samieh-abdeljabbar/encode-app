# Encode v2 -- Complete Rebuild Plan

> The definitive blueprint for rebuilding Encode, the Tauri 2.0 desktop study engine.
> Written 2026-03-27. Assumes one developer (Samieh) working full-time with Claude Code.
> This document is the single source of truth for the rebuild.

---

## Table of Contents

1. [Product Vision](#product-vision)
2. [Architecture Principles](#architecture-principles)
3. [Tech Stack Decisions](#tech-stack-decisions)
4. [Vault & Data Architecture](#vault--data-architecture)
5. [Unified Study Queue](#unified-study-queue)
6. [AI Strategy](#ai-strategy)
7. [No-AI Mode](#no-ai-mode)
8. [File & Module Map](#file--module-map)
9. [Phase 1 -- Tooling & Foundation](#phase-1----tooling--foundation)
10. [Phase 2 -- Core Learning Loop](#phase-2----core-learning-loop)
11. [Phase 3 -- AI Integration & Reader Intelligence](#phase-3----ai-integration--reader-intelligence)
12. [Phase 4 -- Quiz, Teach-Back, Queue](#phase-4----quiz-teach-back-queue)
13. [Phase 5 -- Extended Features & Import](#phase-5----extended-features--import)
14. [Phase 6 -- Polish, Migration, Launch](#phase-6----polish-migration-launch)
15. [Testing Strategy](#testing-strategy)
16. [Onboarding Flow](#onboarding-flow)
17. [Data Migration (v1 to v2)](#data-migration-v1-to-v2)
18. [Performance Budget](#performance-budget)
19. [Security Hardened from Day One](#security-hardened-from-day-one)
20. [Cut List](#cut-list)

---

## Product Vision

Encode is a desktop-first study engine, not a notes app with learning features bolted on.

The product thesis:

1. Bring useful material in.
2. Break it into learnable chunks.
3. Force active recall before progress.
4. Turn misses into repair work.
5. Keep the queue honest with spaced review.

The core loop is:

```
import -> read in chunks -> respond from memory -> verify -> repair -> spaced review
```

That loop drives every screen, every data model, every AI call.

### Repair Is the Product

The most valuable moment is not the correct answer. It is the moment the system catches a misconception and turns it into follow-up work. Every partial or failed response yields exactly one next action:

- retry prompt
- repair card
- revisit task

No sprawling feedback walls. No five-paragraph AI essays about what went wrong. One actionable next step per miss.

### One Meaningful Check Per Chunk

The current v1 risks overcomplicating section gates. v2 uses one short but high-signal response per chunk. That response proves understanding. It does not produce busywork.

### Card Generation Restraint

Do not flood the learner with cards just because AI can generate them. The app prefers:

- fewer cards
- higher quality cards
- cards tied to demonstrated gaps

That keeps the loop tight and prevents review debt from becoming the product.

### Fewer Decisions for the Learner

The default experience:

- Open the app
- See the next best task (the Unified Study Queue)
- Do the task
- Roll into the next one

The learner should not have to decide between five study modes before starting work.

---

## Architecture Principles

Non-negotiable constraints. Every design decision is checked against these.

1. **Markdown is the source of truth.** SQLite is a rebuildable index and cache. Delete `encode.db` and lose nothing. This is the "your files are yours" trust signal -- it is non-negotiable.

2. **Write markdown first, then update the index.** Never the reverse. If the markdown write fails, the index stays stale (safe). If the index write fails, it self-heals on next startup (safe).

3. **Atomic file writes.** Write to `.tmp`, then `rename()`. No partial writes, ever.

4. **AI is optional.** Every feature must work with `provider = "none"`. AI adds quality; it never gates functionality.

5. **Batch IPC.** A single Tauri command returns everything a page needs. No N+1 sequential `invoke()` calls from the frontend.

6. **Domain-oriented backend commands.** The frontend asks for outcomes (`reader.submit_check`, `queue.get_next_items`, `review.submit_rating`), not filesystem mutations (`readFile`, `writeFile`). File-primitive commands still exist for the editor but learning-loop operations are domain-shaped.

7. **One function, one file.** No 1,400-line god components. No store files with parsing logic. No duplicated utilities. If a file exceeds 300 lines, split it.

8. **Test the algorithms.** FSRS scheduling, queue ranking, flashcard parsing, and frontmatter parsing must have 100% branch coverage before the UI that consumes them exists.

9. **Accessibility is not a phase.** ARIA attributes, keyboard navigation, and focus management ship with the component, not after.

10. **Settings remain human-readable.** Config lives in `config.toml` using the `toml` crate with typed deserialization. Not a SQLite key-value table.

11. **Concurrent file access is coordinated.** The indexer never runs while the editor is writing. Writes go through a single `vault_fs` service that holds a per-path lock. The indexer acquires a shared read lock; writes acquire an exclusive lock.

---

## Tech Stack Decisions

### Keep (proven in v1)

| Technology | Why |
|---|---|
| **Tauri 2.0** | Rust backend, system webview, small binary. Working well. |
| **React 18 + TypeScript strict** | Sufficient. React 19 can wait. |
| **Zustand** | Simple, fast, no boilerplate. Split-store pattern works. Handles caching fine for local IPC -- no need for react-query. |
| **CodeMirror 6** | Best-in-class editor. CM decorations are solid. Users need to edit study material. |
| **rusqlite (bundled)** | FTS5 + SR scheduling + study events. No server dependency. |
| **marked** | Fast markdown rendering. |
| **DOMPurify** | HTML sanitization. Non-negotiable. |
| **FSRS-5** | Correctly implemented in v1. Port the algorithm directly. |
| **Lucide React** | Tree-shakable icon set. |
| **Inter** | Clean UI font. |
| **Tailwind CSS 4** | Styling with `@theme` directive consuming CSS custom properties. |

### Replace

| v1 | v2 | Why |
|---|---|---|
| Hand-rolled TOML parser | **`toml` crate** (Rust) | 100-line `if/else` chain is fragile. `toml` crate gives typed deserialization, validation, correct escaping. |
| `mermaid` (full bundle, 2MB+) | **Lazy-loaded `mermaid`** via dynamic import | Mermaid only used in editor/reader. Load on demand. |
| Multiple font bundles at startup | **Lazy font loading** | Only load the active serif font. Defer non-critical fonts. |
| `turndown` + `turndown-plugin-gfm` | **`readability` + `turndown`** | Add Mozilla Readability for cleaner article extraction before Turndown conversion. |
| No linter/formatter | **Biome** | Single tool replaces ESLint + Prettier. Faster, zero-config TypeScript support, fewer dependencies. |
| No pre-commit hooks | **lefthook** | Lightweight, fast. Runs Biome + `tsc --noEmit` + `cargo check` on commit. |

### Add

| New | Purpose |
|---|---|
| **Vitest coverage (v8 provider)** | Coverage reporting with minimum thresholds enforced in CI. |
| **GitHub Actions CI** | `cargo check` + `tsc --noEmit` + `vitest run --coverage` + Biome lint on every push. |
| **React Error Boundary** | Per-page error boundaries so a crash in Quiz doesn't take down the whole app. |
| **@tauri-apps/plugin-stronghold** | Move API keys from plaintext `config.toml` to OS keychain (Phase 6). |
| **`pdf-extract` crate** | PDF text extraction. Scoped to best-effort plain text. `lopdf` is too low-level for reliable text extraction; `pdf-extract` wraps it with proper font/encoding handling. Documented limitation: scanned PDFs and complex layouts may produce garbled text. |

### Remove

| Dependency | Why |
|---|---|
| `@fontsource-variable/source-serif-4` | Keep only Literata as serif option. Two variable serif fonts is unnecessary weight. |
| `@fontsource/manrope` | Not used prominently. Inter is the UI font. |

### Explicitly NOT Adding

| Proposed | Why Not |
|---|---|
| **@tanstack/react-query** | Over-engineering for Tauri IPC. These are local function calls returning in <50ms, not network requests with caching/retry semantics. Zustand stores handle state fine. |
| **React.lazy for pages** | All code loads from local disk, not a network. The marginal benefit of code-splitting pages is unmeasurable when there is no network latency. Adds Suspense boundaries and loading flicker for nothing. |

---

## Vault & Data Architecture

### Core Rule

Markdown files are the source of truth. SQLite is a rebuildable cache.

### Vault Structure

```
~/Encode/
  subjects/
    {subject-slug}/
      _subject.md              # Subject metadata + progress summary
      chapters/                # Imported/written content
      flashcards/              # Flashcard files with FSRS metadata
      quizzes/                 # Quiz sessions (recoverable from markdown)
      teach-backs/             # Feynman sessions
      maps/                    # Mermaid diagrams
  daily/                       # Daily commitment files
  captures/                    # Quick captures
  tracking/                    # Study session logs
  .encode/
    encode.db                  # SQLite index (rebuildable from markdown)
    config.toml                # Settings (human-readable, toml crate)
    migration-v2.json          # One-time migration state tracker
```

### SQLite Schema (v2)

All tables are caches and indexes. Every piece of data they contain is derivable from the markdown files.

#### Database Migration Strategy

Migrations are numbered SQL files executed in order. The `db/schema.rs` module tracks a `user_version` pragma:

```sql
PRAGMA user_version; -- 0 = fresh, 1 = v2.0, 2 = v2.1, etc.
```

On startup:
1. Read `PRAGMA user_version`
2. Apply all migration files with version > current
3. Set `PRAGMA user_version = <latest>`

Migration files live in `src-tauri/migrations/`:
```
001_initial_schema.sql
002_study_events.sql
003_ai_runs.sql
```

Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

#### Core Tables

```sql
-- FTS5 search index
CREATE VIRTUAL TABLE vault_fts USING fts5(
  file_path, subject, topic, content,
  tokenize='porter unicode61'
);

-- File metadata index (fast lookups without reading disk)
CREATE TABLE file_index (
  file_path TEXT PRIMARY KEY,
  subject TEXT,
  topic TEXT,
  file_type TEXT NOT NULL,       -- chapter, flashcard, quiz, teach-back, map, daily, capture
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'unread',  -- unread, reading, read, learned
  content_hash TEXT,             -- SHA-256 for incremental reindex
  updated_at TEXT,
  indexed_at TEXT DEFAULT (datetime('now'))
);

-- FSRS spaced repetition schedule (denormalized -- no JSON blobs)
CREATE TABLE sr_schedule (
  card_id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  interval_days REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  next_review TEXT NOT NULL,
  last_reviewed TEXT,
  FOREIGN KEY (file_path) REFERENCES file_index(file_path) ON DELETE CASCADE
);

-- Quiz history (individual question results, recoverable from markdown)
CREATE TABLE quiz_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  bloom_level INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  question_type TEXT,            -- multiple-choice, free-recall, true-false, fill-blank, code
  attempted_at TEXT DEFAULT (datetime('now')),
  quiz_file_path TEXT            -- links to markdown source for recoverability
);

-- Section analysis cache (AI-generated, keyed by content fingerprint)
CREATE TABLE analysis_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  section_index INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  analysis TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(file_path, section_index, fingerprint, provider, model, schema_version)
);

-- Study sessions (time tracking)
CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  subject_name TEXT NOT NULL,
  subject_slug TEXT NOT NULL,
  duration_secs INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

-- Daily streaks
CREATE TABLE daily_streaks (
  date TEXT PRIMARY KEY,
  commitment_text TEXT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT
);
```

#### New Tables (from Codex plan)

```sql
-- Append-only log of meaningful learner actions (event sourcing)
CREATE TABLE study_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT,
  chapter_path TEXT,
  event_type TEXT NOT NULL,      -- section_check_submitted, section_passed, section_failed,
                                 -- synthesis_completed, quiz_completed, quiz_failed,
                                 -- card_reviewed, card_lapsed, teachback_completed,
                                 -- repair_card_created
  payload_json TEXT,             -- Structured event data (score, rating, etc.)
  created_at TEXT DEFAULT (datetime('now'))
);

-- AI call audit log
CREATE TABLE ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature TEXT NOT NULL,         -- reader.section_check, quiz.generate, teachback.evaluate, etc.
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT,           -- Versioned prompt identifier for tracking prompt iterations
  latency_ms INTEGER,
  status TEXT NOT NULL,          -- success, parse_error, timeout, provider_error
  error_message TEXT,            -- Sanitized error (never contains API keys)
  created_at TEXT DEFAULT (datetime('now'))
);
```

Key schema decisions:
- FSRS columns are **denormalized** (`stability`, `difficulty`, `reps`, `lapses` as proper columns). No JSON blob. This enables SQL queries like `SELECT * FROM sr_schedule WHERE stability < 5 AND lapses > 2` for queue ranking.
- `study_events` is append-only. It never updates or deletes rows. This is event sourcing -- the queue reads it, analytics reads it, but nobody mutates it.
- `ai_runs` logs every AI call for observability. Prompts and responses are NOT stored (too large). Only metadata: feature, provider, model, latency, status.
- `quiz_file_path` in `quiz_history` links back to the markdown source so quiz history can be rebuilt on index rebuild.

### Incremental Index Reconciliation

v1 does `DELETE FROM vault_fts; DELETE FROM file_index` then reinserts everything on startup. v2 uses SHA-256 content hashing:

```
On startup:
1. Walk vault directory, compute SHA-256 of each .md file
2. SELECT file_path, content_hash FROM file_index
3. For each file on disk:
   - If not in DB: index it (new file)
   - If in DB but hash differs: re-index it (modified file)
   - If in DB and hash matches: skip (unchanged)
4. For each DB entry not on disk: remove it (deleted file)
5. Total: only re-index changed files
```

This turns a 2-second full rebuild into a <100ms reconciliation for a 200-file vault.

### Write Order Rule

Every operation that modifies both markdown and SQLite follows this order:

```
1. Write markdown file (atomic: .tmp + rename)
2. Update SQLite index/cache
3. If step 2 fails, log the error -- the index self-heals on next startup
```

Never the reverse. If the markdown write fails, the SQLite stays stale (safe). If the SQLite write fails after markdown succeeds, the index reconciliation fixes it automatically.

---

## Unified Study Queue

The queue is the product's control tower. It answers "what should I do now?" with a single ranked list.

### Queue Contents

The queue combines:

- Due flashcards (FSRS says review now)
- Repair cards from recent misses
- Unfinished reading sessions (chapters in `reading` status)
- Chapters blocked on synthesis (status `read` but synthesis not done)
- Weak quiz topics that need retesting (scored <70%, 48h+ ago)
- Chapters eligible for the `learned` gate (status `read`, 48h+ since read, no passing quiz)

### Queue Item Shape

```typescript
type QueueItem = {
  id: string;
  kind: "due_card" | "repair_card" | "continue_reading" | "synthesis_required"
      | "quiz_retake" | "learned_gate" | "new_chapter";
  subject: string;
  title: string;              // Human-readable: "Review: Normalization" or "Continue: Ch 3"
  reason: string;             // Why this is next: "Due 2h ago" or "Failed quiz 3 days ago"
  urgency: number;            // 0-100, computed score
  estimated_minutes: number;  // How long this will take
  target_path: string;        // File path or route to navigate to
};
```

### Scoring Formula

Each queue item gets an urgency score from 0-100. The queue is sorted by urgency descending.

```typescript
function computeUrgency(item: QueueItemInput): number {
  switch (item.kind) {
    case "due_card": {
      // How overdue is this card? More overdue = higher urgency.
      // A card due right now = 60. A card 7+ days overdue = 95.
      const hoursOverdue = Math.max(0, hoursSince(item.nextReview));
      const overdueScore = Math.min(35, hoursOverdue * 0.2);  // caps at +35
      // Cards with low stability (fragile memories) get a boost
      const fragilityBoost = item.stability < 10 ? 10 : 0;
      return 60 + overdueScore + fragilityBoost;
    }

    case "repair_card": {
      // Repair cards are slightly more urgent than regular due cards
      // because they address demonstrated gaps
      const hoursOld = hoursSince(item.createdAt);
      const recencyBoost = hoursOld < 24 ? 10 : 0;  // Recent misses get priority
      return 75 + recencyBoost;
    }

    case "continue_reading": {
      // Continuing in-progress reading beats starting new content.
      // But it should not beat overdue reviews.
      const hoursSinceLastRead = hoursSince(item.lastReadAt);
      // Momentum bonus: recently read chapters rank higher
      const momentumBoost = hoursSinceLastRead < 4 ? 15 : 0;
      return 40 + momentumBoost;
    }

    case "synthesis_required": {
      // Chapter is read but not synthesized. This blocks quiz unlock.
      // Slightly higher than continue_reading because it completes a loop.
      return 50;
    }

    case "quiz_retake": {
      // Failed quiz, 48h+ cooling period elapsed. Time to retest.
      const daysSinceQuiz = daysSince(item.lastQuizAt);
      // Don't show until 48h have passed
      if (daysSinceQuiz < 2) return 0;
      return 55 + Math.min(15, (daysSinceQuiz - 2) * 2);  // Grows with delay
    }

    case "learned_gate": {
      // Chapter has been read for 48h+ with no quiz. Nudge toward quiz.
      return 35;
    }

    case "new_chapter": {
      // New unread content. Lowest priority -- review always beats novelty.
      return 20;
    }
  }
}
```

### Priority Rules (Enforced by the Scoring)

1. **Due reviews beat new reading.** `due_card` base 60 vs `new_chapter` base 20.
2. **Repair work beats optional enrichment.** `repair_card` base 75 beats everything except severely overdue reviews.
3. **Synthesis-required chapters beat starting unrelated new content.** `synthesis_required` 50 vs `new_chapter` 20.
4. **Short meaningful wins surface when momentum is low.** Cards and repairs are 1-2 minutes each; they appear before 30-minute reading sessions when nothing is urgent.

### Queue Generation (Backend)

The queue is computed in Rust from SQLite queries. It is NOT stored as a table. It is a view computed on demand from:

```sql
-- Due cards
SELECT card_id, file_path, stability, next_review FROM sr_schedule
WHERE next_review <= datetime('now', '+1 hour');

-- Repair cards (study_events of type repair_card_created, not yet reviewed)
SELECT * FROM study_events WHERE event_type = 'repair_card_created'
AND chapter_path NOT IN (SELECT chapter_path FROM study_events
  WHERE event_type = 'card_reviewed' AND created_at > study_events.created_at);

-- Unfinished reading
SELECT file_path FROM file_index WHERE status = 'reading';

-- Synthesis blocked
SELECT file_path FROM file_index WHERE status = 'read'
AND file_path NOT IN (
  SELECT chapter_path FROM study_events WHERE event_type = 'synthesis_completed'
);

-- Quiz retakes (failed quizzes 48h+ ago)
SELECT DISTINCT topic, MAX(attempted_at) as last_attempt
FROM quiz_history GROUP BY topic
HAVING AVG(correct) < 0.7
AND MAX(attempted_at) < datetime('now', '-48 hours');
```

The results are scored, merged, sorted, and returned as a single `Vec<QueueItem>`.

### Queue IPC

```rust
#[tauri::command]
async fn get_queue(
    state: tauri::State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<QueueItem>, String>
```

The frontend calls this once on the home page. The queue is not polled -- it refreshes when the user completes an action (navigates back to home, finishes a review session, etc.).

---

## AI Strategy

AI remains centralized in the Rust backend. The frontend never talks to AI directly.

### Model Policy Tiers

Instead of letting each feature pick arbitrary models, define three policy tiers:

| Tier | Use Cases | Characteristics |
|---|---|---|
| `cheap_local` | Extraction, summarization, simple card suggestion, keyword extraction | Speed over quality. Ollama small models. |
| `balanced` | Section evaluation, quiz generation, quiz evaluation | Quality matters. Default Ollama model or cloud API. |
| `strong_reasoning` | Teach-back critique, difficult free-response evaluation, synthesis evaluation | Maximum quality. Larger models or cloud API preferred. |

The tier is a hint to the router. If only one provider is configured, all tiers use it. If the user has both Ollama and Claude, `cheap_local` uses Ollama while `strong_reasoning` uses Claude.

### Typed AI Contract

```rust
// Rust-side request shape
pub struct AiJobRequest {
    pub feature: AiFeature,        // Enum: SectionCheck, SynthesisEval, QuizGenerate, etc.
    pub system_prompt: String,
    pub user_prompt: String,
    pub max_tokens: u32,
    pub temperature: f32,          // 0.1 for evaluation, 0.7 for generation
    pub model_policy: ModelPolicy,  // CheapLocal, Balanced, StrongReasoning
    pub timeout_ms: u64,
    pub profile_context: String,   // Injected server-side into ALL prompts
}

pub struct AiJobResult {
    pub provider: String,
    pub model: String,
    pub latency_ms: u64,
    pub raw_text: String,
    pub status: AiRunStatus,       // Success, ParseError, Timeout, ProviderError
    pub error: Option<String>,     // Sanitized error message
}
```

Every AI call:
1. Resolves the model policy to a concrete provider + model
2. Injects profile context into the system prompt
3. Makes the request with the configured timeout
4. Logs to `ai_runs` table (provider, model, latency, status)
5. Returns the result

### Error Type Differentiation

```rust
pub enum AiError {
    Unauthorized,          // 401 -- bad API key
    RateLimited {          // 429 -- retry after
        retry_after: Option<u64>,
    },
    ServerError,           // 5xx -- provider issue
    Timeout,               // Request timed out
    NetworkError,          // Connection failed (Ollama not running, no internet)
    InvalidResponse,       // Couldn't parse response body
    ProviderDisabled,      // provider = "none"
}
```

The frontend shows contextual error messages: "Invalid API key -- check Settings" vs "Rate limited, try again in 30s" vs "Ollama is not running".

### Profile Context Injection

Profile context (role, hobbies, learning style from config.toml) is injected server-side into ALL AI prompts. The frontend passes the feature name; the Rust command prepends profile context to the system prompt:

```rust
let profile_context = build_profile_context(&config);
let full_system = if profile_context.is_empty() {
    request.system_prompt
} else {
    format!("{}\n\nStudent context: {}", request.system_prompt, profile_context)
};
```

### AI Should Be Used For

- Section understanding evaluation
- Repair prompt generation
- Card suggestion from demonstrated misses
- Quiz question generation and answer evaluation
- Teach-back critique
- Synthesis evaluation

### AI Should NOT Be Used For

- Queue ranking (rule-based, must be deterministic and inspectable)
- Section chunking (heading-based, deterministic)
- Due card calculation (FSRS, pure math)
- File/export path logic
- Status transitions
- Frontmatter parsing

Those stay local and testable.

### AI Safety Rules

- Schema-validate all structured outputs before acting on them
- Log prompt version and latency to `ai_runs`
- Sanitize all provider errors (strip API keys, URLs with keys)
- Never let malformed JSON silently mutate state
- Keep deterministic fallback paths for core flows (see No-AI Mode)
- Shared `reqwest::Client` created once in `AppState`, reused everywhere

---

## No-AI Mode

No-AI mode is a real product, not a degraded stub. If AI is unavailable, the product feels useful, just less adaptive.

### Reader Fallback

- Pre-authored gate prompt templates rotate through Bloom levels:
  - "Summarize what you just read in one sentence."
  - "How does this connect to something you already know?"
  - "What would you predict happens next?"
  - "Describe a real-world scenario where this applies."
- User types a response. No AI evaluation.
- Show extracted key points from the section (headings, bold text, first sentence of each paragraph) as a self-check reference.
- User clicks "I got it" or "Mark for repair" manually.
- Repair creates a flashcard from the section heading as the question and the key points as the answer.

### Quiz Fallback

- Generate questions from stored headings, bold statements, and extracted key facts.
- Multiple-choice and true/false from heading-based templates ("Which of the following is true about {heading}?").
- Free-recall questions use section headings as prompts ("Explain {heading} in your own words").
- No AI evaluation -- present a self-grade rubric:
  - "Did I cover the main idea?"
  - "Did I use specific terms correctly?"
  - "Could I explain this to someone else?"
- User self-rates: Got it / Partially / Missed it.

### Review Fallback

Fully functional. FSRS is local math. No AI needed.

### Teach-Back Fallback

- Structured self-review rubric instead of AI evaluation:
  - "Did I explain the core concept without jargon?"
  - "Did I use at least one concrete example?"
  - "Could a non-expert understand my explanation?"
  - "What did I leave out?"
- User rates their own performance.
- Response saved to markdown with self-evaluation.

### Synthesis Fallback

- Three structured prompts (same as AI mode):
  - "What is the central idea of this chapter?"
  - "What are the key relationships between concepts?"
  - "Give one practical example."
- User types responses. No AI evaluation.
- Responses saved. Status transitions to `read` on completion.

---

## File & Module Map

### Rust Backend (`src-tauri/src/`)

```
src-tauri/src/
  main.rs                        # Entry point
  lib.rs                         # Tauri setup, AppState, command registration

  commands/                      # Tauri commands split by domain
    mod.rs
    vault.rs                     # File CRUD, subject management (~120 lines)
    reader.rs                    # reader.load_session, reader.submit_check, reader.submit_synthesis (~100 lines)
    queue.rs                     # queue.get_next_items, queue.get_summary (~80 lines)
    review.rs                    # review.get_due_cards, review.submit_rating, review.create_card (~100 lines)
    quiz.rs                      # quiz.generate, quiz.submit_answer, quiz.finish (~80 lines)
    teachback.rs                 # teachback.evaluate, teachback.save (~60 lines)
    ai.rs                        # AI request dispatch (~80 lines)
    search.rs                    # FTS5 search (~30 lines)
    config.rs                    # Config read/write (~40 lines)
    import.rs                    # URL import, PDF import (~80 lines)
    index.rs                     # Rebuild, incremental reconciliation (~40 lines)
    tracking.rs                  # Study sessions, streaks (~60 lines)
    export.rs                    # Markdown export for subjects (~80 lines)

  services/                      # Business logic (not Tauri-specific)
    mod.rs
    ai_client.rs                 # Shared reqwest::Client, provider dispatch, AiError enum (~120 lines)
    ai_providers/
      mod.rs                     # Provider trait definition
      ollama.rs                  # (~60 lines)
      claude.rs                  # (~60 lines)
      gemini.rs                  # Key in header, not URL (~70 lines)
      openai.rs                  # (~60 lines)
      deepseek.rs                # Reasoner handling (~70 lines)
      cli.rs                     # 30s timeout, command validation (~100 lines)
    vault_fs.rs                  # Atomic writes (.tmp + rename), path validation, per-path locking (~150 lines)
    indexer.rs                   # SHA-256 incremental reconciliation (~150 lines)
    importer.rs                  # URL fetch + readability cleanup (~120 lines)
    pdf.rs                       # pdf-extract text extraction, best-effort (~100 lines)
    config.rs                    # TOML deserialization with `toml` crate (~80 lines)
    migration.rs                 # v1 to v2 data migration (~200 lines)
    queue.rs                     # Queue scoring formula, SQL queries, merge + sort (~200 lines)
    profile.rs                   # Build profile context string from config (~30 lines)

  db/
    mod.rs                       # Database struct, open, migration runner (~60 lines)
    schema.rs                    # Migration version tracking (~40 lines)
    fts.rs                       # FTS5 operations (~60 lines)
    sr.rs                        # SR schedule CRUD (~100 lines)
    quiz.rs                      # Quiz history queries (~80 lines)
    tracking.rs                  # Study session queries (~60 lines)
    streaks.rs                   # Daily streak queries (~50 lines)
    events.rs                    # study_events append + query (~60 lines)
    ai_runs.rs                   # ai_runs insert + query (~40 lines)

  migrations/
    001_initial_schema.sql
    002_study_events.sql
    003_ai_runs.sql
```

**Estimated Rust files: ~35** (v1 has 7 -- each file is 30-200 lines instead of 1,000+)

### Frontend (`src/`)

```
src/
  main.tsx                       # App entry, router, error boundary
  App.tsx                        # Router configuration

  pages/                         # One file per route, <300 lines each
    Home.tsx                     # Dashboard + Queue view (~250 lines)
    Vault.tsx                    # Editor + sidebar (~250 lines)
    Reader.tsx                   # Section-by-section reader orchestrator (~200 lines)
    Flashcards.tsx               # Dashboard/Review/AllCards tabs (~150 lines)
    Quiz.tsx                     # Quiz orchestrator (~80 lines)
    TeachBack.tsx                # Feynman technique (~80 lines)
    Settings.tsx                 # Settings tabs (~300 lines)
    Progress.tsx                 # Analytics (~250 lines)
    Onboarding.tsx               # First-run wizard (~200 lines)

  components/
    layout/
      Shell.tsx                  # App shell (ribbon + sidebar + content) (~100 lines)
      Ribbon.tsx                 # Icon navigation strip (~80 lines)
      Sidebar.tsx                # File browser panel (~150 lines)
      PomodoroTimer.tsx          # Timer widget (~80 lines)
      PomodoroRuntime.tsx        # Timer logic (~60 lines)
      AiActivityButton.tsx       # AI activity indicator (~40 lines)
      ErrorBoundary.tsx          # Per-page error boundary (~40 lines)

    reader/
      ReaderContent.tsx          # Section display + scroll (~150 lines)
      ReaderSidebar.tsx          # Section outline + progress (~100 lines)
      DigestionGate.tsx          # Gate prompt UI (~200 lines)
      GateQuestionCard.tsx       # Single gate question (~80 lines)
      SectionSummary.tsx         # Post-gate summary display (~80 lines)
      SchemaActivation.tsx       # Pre-reading prompt (~100 lines)
      SynthesisPanel.tsx         # Chapter synthesis UI (~100 lines)
      CreateFlashcardPanel.tsx   # Card creation from reader (~100 lines)
      ProgressBar.tsx            # Reading progress (~50 lines)

    quiz/
      QuizDashboard.tsx          # Subject list + recent attempts (~200 lines)
      QuizConfig.tsx             # Pre-quiz setup (types, count, difficulty) (~150 lines)
      QuizRunner.tsx             # Active quiz session (~200 lines)
      QuizResults.tsx            # Results breakdown, repair cards, WhatNext (~150 lines)
      QuizQuestion.tsx           # Single question renderer (~100 lines)
      CodeSandbox.tsx            # SQL/Python sandbox (~150 lines)
      QuizReview.tsx             # Past quiz detail view (~100 lines)

    flashcards/
      FlashcardDashboard.tsx     # Due count, subject breakdown (~120 lines)
      FlashcardReview.tsx        # Review session (~180 lines)
      FlashcardCard.tsx          # Single card display (~80 lines)
      FlashcardForm.tsx          # Create/edit card form (~100 lines)
      AllCardsTable.tsx          # Searchable card list (~120 lines)

    teachback/
      TeachBackForm.tsx          # Explanation input (~100 lines)
      TeachBackResult.tsx        # AI evaluation display (~100 lines)
      TeachBackIteration.tsx     # Follow-up questions (~120 lines)

    shared/
      MarkdownEditor.tsx         # CodeMirror 6 wrapper (~200 lines)
      MarkdownRenderer.tsx       # HTML rendering + DOMPurify (~120 lines)
      QuickSwitcher.tsx          # Cmd+O file search (~150 lines)
      SlashMenu.tsx              # / command palette (~80 lines)
      EditorToolbar.tsx          # Formatting toolbar (~60 lines)
      WhatNext.tsx               # Study loop suggestions (~80 lines)
      ShortcutsOverlay.tsx       # Keyboard shortcuts help (Cmd+/) (~60 lines)

    vault/
      VaultBrowser.tsx           # File tree (~200 lines)
      ImportDialog.tsx           # URL/PDF import (~120 lines)
      CreateSubjectWizard.tsx    # New subject flow (~100 lines)

    ui/
      primitives.tsx             # Design system atoms (~100 lines)
      tokens.css                 # Single source of truth for CSS custom properties

  stores/                        # Zustand stores, pure state + async actions
    app.ts                       # Global state, daily commitment (~70 lines)
    vault.ts                     # File selection, sidebar state (~80 lines)
    reader.ts                    # Reader state (parsing extracted to lib) (~400 lines)
    flashcard.ts                 # Flashcard state (parsing extracted to lib) (~300 lines)
    quiz.ts                      # Quiz state (~300 lines)
    teachback.ts                 # Teach-back state (~180 lines)
    pomodoro.ts                  # Timer state (~60 lines)
    tracking.ts                  # Study time tracking (~50 lines)

  lib/                           # Pure functions and utilities
    tauri.ts                     # Tauri invoke wrappers + batch commands (~220 lines)
    types.ts                     # Shared TypeScript types (~200 lines)
    markdown.ts                  # parseFrontmatter, splitSections (~130 lines)
    flashcard-parser.ts          # parseFlashcards extracted from store (~100 lines)
    sr.ts                        # FSRS-5 + SM-2 algorithms (~190 lines)
    queue.ts                     # Queue item types, client-side helpers (~40 lines)
    study-loop.ts                # "What's Next" suggestion engine (~200 lines)
    study-loop-actions.ts        # Navigation handlers for suggestions (~60 lines)
    chapter-status.ts            # Chapter status helpers (~140 lines)
    gates.ts                     # Gate response parsing/serialization (~170 lines)
    synthesis.ts                 # Synthesis parsing/serialization (~190 lines)
    profile.ts                   # AI profile context builder (~30 lines)
    themes.ts                    # Theme definitions + CSS variable setter (~100 lines)
    fonts.ts                     # Font loading (~20 lines)
    dates.ts                     # Date utilities (~15 lines)
    slugify.ts                   # Single slugify() function (~8 lines)
    file-tree.ts                 # Tree building from flat file list (~60 lines)
    keyboard.ts                  # Keyboard shortcut registry (~40 lines)
    cm-theme.ts                  # CodeMirror theme (~80 lines)
    cm-decorations.ts            # CodeMirror live preview decorations (~150 lines)
    cm-slash-menu.ts             # CodeMirror slash command extension (~60 lines)
    cm-paste-handler.ts          # CodeMirror paste handler (~30 lines)

  hooks/
    useKeyboard.ts               # Keyboard shortcut registration (~30 lines)
    useFocusTrap.ts              # Modal focus trapping (~25 lines)
    useWindowState.ts            # Window size/position persistence (~30 lines)

  __tests__/
    lib/
      sr.test.ts
      flashcard-parser.test.ts
      markdown.test.ts
      study-loop.test.ts
      chapter-status.test.ts
      gates.test.ts
      slugify.test.ts
      queue.test.ts
    stores/
      reader.test.ts
      flashcard.test.ts
      quiz.test.ts
    components/
      DigestionGate.test.tsx
      QuizRunner.test.tsx
      FlashcardReview.test.tsx
```

**Estimated frontend files: ~80**
**Estimated test files: ~15**
**Estimated total files: ~130** (v1 has ~45, each 50-300 lines instead of 1,000+)

### Theme + Tailwind 4 Integration

Tailwind 4 uses `@theme` to consume CSS custom properties. The integration:

1. `tokens.css` defines all design tokens as CSS custom properties on `:root`:
   ```css
   :root {
     --color-bg: #0f0f0f;
     --color-surface: #1a1a1a;
     --color-surface-2: #252525;
     --color-border: #333333;
     --color-text: #e5e5e5;
     --color-text-muted: #888880;
     --color-purple: #7F77DD;
     --color-teal: #1D9E75;
     --color-coral: #D85A30;
     --color-amber: #BA7517;
   }
   ```

2. `tailwind.css` (or the main CSS entry) imports tokens and extends the theme:
   ```css
   @import "./components/ui/tokens.css";
   @import "tailwindcss";

   @theme {
     --color-bg: var(--color-bg);
     --color-surface: var(--color-surface);
     --color-surface-2: var(--color-surface-2);
     --color-border: var(--color-border);
     --color-text: var(--color-text);
     --color-text-muted: var(--color-text-muted);
     --color-purple: var(--color-purple);
     --color-teal: var(--color-teal);
     --color-coral: var(--color-coral);
     --color-amber: var(--color-amber);
   }
   ```

3. Theme switching: `themes.ts` swaps the CSS custom property values on `document.documentElement.style`. Tailwind classes like `bg-surface` and `text-purple` automatically pick up the new values because they reference the CSS variables.

4. This means `bg-[var(--color-surface)]` is NOT needed. Tailwind 4's `@theme` directive maps the variables to first-class utility names: `bg-surface`, `text-muted`, `border-border`, etc.

---

## Phase 1 -- Tooling & Foundation

**Goal:** Clean project skeleton, all tooling configured, vault filesystem, SQLite with incremental reconciliation, config management, app shell with navigation. No AI, no learning features.
**Estimate: 4-5 days.**

### 1A. Tooling & Scaffolding (Day 1)

1. **Initialize fresh Tauri 2.0 project**
   - `npm create tauri-app@latest encode-v2 -- --template react-ts`
   - Copy `tauri.conf.json` capabilities and window config from v1
2. **Install all dependencies** per the Tech Stack section
3. **Configure Biome** (`biome.json`)
   - TypeScript strict, no `any`, no unused vars, sorted imports
   - Format: 2-space indent, single quotes (match v1 style)
4. **Configure lefthook** (`.lefthook.yml`)
   - Pre-commit: `biome check --write`, `tsc --noEmit`, `cargo check`
5. **Configure Vitest** with v8 coverage provider
   - Minimum coverage thresholds: 80% lines on `src/lib/`, 60% on `src/stores/`
6. **Configure GitHub Actions** (`.github/workflows/ci.yml`)
   - `cargo check` + `tsc --noEmit` + `vitest run --coverage` + `biome ci`
7. **Set up Content Security Policy** in `tauri.conf.json`:
   ```json
   "security": {
     "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* https://api.anthropic.com https://generativelanguage.googleapis.com https://api.openai.com https://api.deepseek.com"
   }
   ```
8. **Create the design system foundation**
   - `src/components/ui/tokens.css` -- all CSS custom properties
   - `src/lib/themes.ts` -- port all themes from v1
   - `src/components/ui/primitives.tsx` -- design system atoms
9. **Set up Tailwind 4** with `@theme` consuming the CSS custom properties
10. **Window state persistence** -- save window size, position, sidebar width to `localStorage` on close, restore on open via `useWindowState` hook

### 1B. Rust Backend Foundation (Days 2-3)

| File | Lines (est.) | Purpose |
|---|---|---|
| `services/vault_fs.rs` | 150 | Atomic writes, path validation, per-path RwLock for concurrent access |
| `services/config.rs` | 80 | Typed config struct with `toml` crate deserialization, `#[serde(alias)]` for v1 compat |
| `services/indexer.rs` | 150 | SHA-256 incremental reconciliation |
| `db/mod.rs` | 60 | Database open, migration runner with `PRAGMA user_version` |
| `db/schema.rs` | 40 | Migration version tracking |
| `db/fts.rs` | 60 | FTS5 index/search operations |
| `db/sr.rs` | 100 | SR schedule CRUD |
| `db/quiz.rs` | 80 | Quiz history queries |
| `db/tracking.rs` | 60 | Study session queries |
| `db/streaks.rs` | 50 | Daily streak queries |
| `db/events.rs` | 60 | study_events append + query |
| `db/ai_runs.rs` | 40 | ai_runs insert + query |
| `commands/vault.rs` | 120 | File CRUD Tauri commands |
| `commands/config.rs` | 40 | Config read/write commands |
| `commands/search.rs` | 30 | FTS5 search command |
| `commands/index.rs` | 40 | Rebuild/reconcile commands |
| `commands/tracking.rs` | 60 | Study sessions, streaks |
| `lib.rs` | 100 | AppState with shared `reqwest::Client`, command registration |
| `migrations/001_initial_schema.sql` | 80 | Full schema DDL |

Key implementation:

```rust
// AppState -- created once, shared across all commands
struct AppState {
    vault_path: PathBuf,
    db: Arc<Database>,
    http_client: reqwest::Client,     // Created once, reused for all AI calls
    config_cache: Mutex<Option<AppConfig>>,
    file_locks: DashMap<PathBuf, ()>, // Per-path coordination for concurrent access
}
```

### 1C. Frontend Foundation (Days 3-5)

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/lib/tauri.ts` | 220 | All Tauri invoke wrappers, batch commands |
| `src/lib/types.ts` | 200 | All shared TypeScript types |
| `src/lib/slugify.ts` | 8 | Single `slugify()`, imported everywhere |
| `src/lib/markdown.ts` | 130 | `parseFrontmatter`, `splitSections` |
| `src/lib/dates.ts` | 15 | Date formatting utilities |
| `src/lib/keyboard.ts` | 40 | Keyboard shortcut registry |
| `src/lib/themes.ts` | 100 | Theme definitions + CSS variable setter |
| `src/stores/app.ts` | 70 | Global state |
| `src/stores/vault.ts` | 80 | File browser state |
| `src/components/layout/Shell.tsx` | 100 | App layout shell |
| `src/components/layout/Ribbon.tsx` | 80 | Navigation strip |
| `src/components/layout/Sidebar.tsx` | 150 | File browser panel |
| `src/components/layout/ErrorBoundary.tsx` | 40 | Error boundary |
| `src/components/vault/VaultBrowser.tsx` | 200 | File tree with icons |
| `src/components/shared/QuickSwitcher.tsx` | 150 | Cmd+O file search |
| `src/components/shared/MarkdownRenderer.tsx` | 120 | HTML rendering + DOMPurify |
| `src/components/shared/MarkdownEditor.tsx` | 200 | CodeMirror 6 wrapper |
| `src/components/shared/ShortcutsOverlay.tsx` | 60 | Cmd+/ keyboard shortcuts help |
| `src/hooks/useKeyboard.ts` | 30 | Shortcut registration hook |
| `src/hooks/useWindowState.ts` | 30 | Window state persistence |
| `src/pages/Home.tsx` | 250 | Dashboard (queue preview, due count, streak) |
| `src/pages/Vault.tsx` | 250 | Editor page |
| `src/pages/Settings.tsx` | 300 | Settings (split into tabs) |
| `src/App.tsx` | 40 | Router |
| `src/main.tsx` | 20 | Entry point |

Batch IPC for dashboard:
```typescript
export const getDashboardData = () =>
  invoke<{
    subjects: Subject[];
    dueCount: number;
    streak: StreakInfo;
    todayStudyTime: number;
    queuePreview: QueueItem[];  // Top 5 queue items
    atRiskCount: number;
  }>("get_dashboard_data");
```

Keyboard shortcuts registered at the shell level:
```typescript
// In Shell.tsx
useKeyboard({
  "mod+o": () => setQuickSwitcherOpen(true),
  "mod+\\": () => toggleSidebar(),
  "mod+/": () => setShortcutsOpen(true),
});
```

### Tests for Phase 1

| Test File | Coverage Target |
|---|---|
| `__tests__/lib/markdown.test.ts` | `parseFrontmatter` edge cases, `splitSections` with various heading levels |
| `__tests__/lib/slugify.test.ts` | Unicode, empty strings, special chars |

### Acceptance Criteria
- App launches, shows dashboard with subject count and streak
- Queue preview shows on home page (empty state with CTA when no items)
- Create subject, import URL, view in vault browser
- Open file in CodeMirror editor, edit, autosave (atomic write)
- Quick Switcher (Cmd+O) finds files across the vault
- Keyboard shortcuts overlay (Cmd+/) displays
- Full-text search works via FTS5
- Settings page loads/saves config via `toml` crate
- Startup reconciliation takes <200ms for 100 unchanged files
- Window size/position persists across restarts
- Sidebar width persists
- All ARIA landmarks present: `<main>`, `<nav>`, `<aside>`
- CSP is set (not null)
- Pre-commit hook fires and blocks on lint errors

---

## Phase 2 -- Core Learning Loop

**Goal:** Reader with digestion gates, flashcards with FSRS, study-loop suggestions, study event logging. The core value of the app.
**Estimate: 4-5 days.**

### 2A. FSRS & Flashcard Engine (TDD)

Write tests FIRST, then implement.

**TDD sequence:**
1. Write `sr.test.ts` with expected FSRS intervals for known inputs
2. Port `fsrs()` from v1, verify tests pass
3. Write `flashcard-parser.test.ts` with edge cases (missing fields, malformed blocks)
4. Implement `parseFlashcards()`, verify tests pass

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/lib/sr.ts` | 190 | Port FSRS-5 + SM-2 + migration |
| `src/lib/flashcard-parser.ts` | 100 | `parseFlashcards()` extracted from store |
| `src/stores/flashcard.ts` | 300 | Flashcard state (parsing in lib, no UI) |
| `src/pages/Flashcards.tsx` | 150 | Tab orchestrator |
| `src/components/flashcards/FlashcardDashboard.tsx` | 120 | Due count, breakdown |
| `src/components/flashcards/FlashcardReview.tsx` | 180 | Review session |
| `src/components/flashcards/FlashcardCard.tsx` | 80 | Single card display |
| `src/components/flashcards/FlashcardForm.tsx` | 100 | Create/edit card |
| `src/components/flashcards/AllCardsTable.tsx` | 120 | Searchable card list |
| `commands/review.rs` | 100 | Batch due cards, schedule updates |

**Critical fix: Write order.**

v1 `rateCard` does SQLite before markdown (wrong). v2:
```
1. updateCardInFile (markdown) -- source of truth first
2. updateCardSchedule (SQLite) -- cache second
3. Log study_event (card_reviewed)
4. If step 2 fails, it self-heals on next startup
```

**Batch IPC for flashcard loading:**
```rust
#[tauri::command]
async fn get_due_cards_with_content(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DueCardWithContent>, String> {
    // Single command: query sr_schedule JOIN file_index,
    // read all relevant files, parse card blocks, return everything
}
```

### 2B. Reader with Digestion Gates

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/stores/reader.ts` | 400 | Reader state (analysis logic extracted to lib) |
| `src/lib/gates.ts` | 170 | Gate response parsing, merge, shouldGate |
| `src/lib/synthesis.ts` | 190 | Synthesis parsing/serialization |
| `src/lib/chapter-status.ts` | 140 | Status transitions (with `learned` wired) |
| `src/pages/Reader.tsx` | 200 | Reader orchestrator (slim) |
| `src/components/reader/ReaderContent.tsx` | 150 | Section display |
| `src/components/reader/ReaderSidebar.tsx` | 100 | Section outline |
| `src/components/reader/DigestionGate.tsx` | 200 | Gate UI |
| `src/components/reader/GateQuestionCard.tsx` | 80 | Single question |
| `src/components/reader/SectionSummary.tsx` | 80 | Post-gate summary |
| `src/components/reader/SchemaActivation.tsx` | 100 | Pre-reading prompt |
| `src/components/reader/SynthesisPanel.tsx` | 100 | Chapter synthesis |
| `src/components/reader/CreateFlashcardPanel.tsx` | 100 | Card creation |
| `src/components/reader/ProgressBar.tsx` | 50 | Progress display |
| `commands/reader.rs` | 100 | reader.load_session, reader.submit_check, reader.submit_synthesis |

**Section Check Evaluation (Constrained Output)**

Each section check evaluates to exactly 3 possible outcomes:

| Outcome | Meaning | Follow-up Action |
|---|---|---|
| `correct` | Learner demonstrated understanding | `advance` to next section |
| `partial` | Core idea present but incomplete | `retry_now` with a targeted hint |
| `off_track` | Fundamental misunderstanding | `create_repair_card` + `advance` |

Exactly one follow-up action per evaluation. No multi-paragraph feedback walls. The AI prompt constrains output to this schema:

```json
{
  "outcome": "correct | partial | off_track",
  "one_line_feedback": "string (max 100 chars)",
  "follow_up_action": "advance | retry_now | create_repair_card",
  "repair_card": { "question": "...", "answer": "..." }  // only if off_track
}
```

**Section Check Prompt Selection**

Prompts are NOT random. They rotate through 4 types based on section content:

| Type | When to Use | Example |
|---|---|---|
| `explain` | Conceptual sections (definitions, principles) | "Explain {concept} in your own words." |
| `apply` | Procedural sections (steps, methods) | "Walk through how you'd apply {method} to {scenario}." |
| `distinguish` | Comparison sections (vs, differences) | "What's the key difference between {A} and {B}?" |
| `predict` | Consequence sections (causes, effects) | "What would happen if {condition}?" |

Without AI, the type is chosen by keyword matching on the section heading and content. With AI, the section analysis includes the recommended prompt type.

**Status transitions:**

```
unread -> reading       (on first open in Reader)
reading -> read         (on synthesis completion)
read -> learned         (on passing a delayed quiz gate: 48h+ after read, quiz >= 70%)
```

**Import -> "Read Now" transition:**

After URL import completes, show a toast with "Open in Reader" button that navigates to `/reader` with the new file path pre-loaded.

### 2C. Study Loop & What Next

Write tests FIRST.

**TDD sequence:**
1. Write `study-loop.test.ts` with priority ranking scenarios
2. Implement `getNextActions()`, verify tests pass
3. Write `chapter-status.test.ts` with all status transitions
4. Implement status helpers, verify tests pass

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/lib/study-loop.ts` | 200 | Suggestion engine (with `learned` awareness) |
| `src/lib/study-loop-actions.ts` | 60 | Navigation handlers |
| `src/components/shared/WhatNext.tsx` | 80 | Suggestion display |

### 2D. Study Event Logging

Every significant learner action appends to `study_events`:

```typescript
// Events logged automatically by domain commands
type StudyEventType =
  | "section_check_submitted"
  | "section_passed"
  | "section_failed"
  | "synthesis_completed"
  | "quiz_completed"
  | "quiz_failed"
  | "card_reviewed"
  | "card_lapsed"
  | "teachback_completed"
  | "repair_card_created";
```

Events are appended by the Rust backend inside domain commands. The frontend never writes events directly. For example, `reader.submit_check` logs `section_check_submitted` and either `section_passed` or `section_failed` as part of its execution.

### Tests for Phase 2

| Test File | Coverage Target |
|---|---|
| `__tests__/lib/sr.test.ts` | 100% branch coverage on `fsrs()`, `sm2()`, `migrateToFSRS()`, `retrievability()` |
| `__tests__/lib/flashcard-parser.test.ts` | All card fields parsed, malformed blocks handled |
| `__tests__/lib/study-loop.test.ts` | Priority ranking, edge cases (no subjects, no due cards) |
| `__tests__/lib/chapter-status.test.ts` | All status transitions, `learned` gate timing |
| `__tests__/lib/gates.test.ts` | Gate response merge, section gating rules |
| `__tests__/stores/flashcard.test.ts` | `rateCard` write order (markdown before SQLite) |
| `__tests__/stores/reader.test.ts` | Section advancement, gate trigger, cache usage |

### Acceptance Criteria
- Import URL -> "Read Now" toast -> Reader opens with new content
- Reader shows sections one at a time, gates activate at boundaries
- Gate questions display (fallback templates when AI is off)
- Submitting gate response saves to markdown `## Digestion`, advances section
- Constrained evaluation: outcome is exactly one of correct/partial/off_track
- Each evaluation produces exactly one follow-up action
- Schema activation shows on first open of unread chapter
- Chapter synthesis completes, status transitions to `read`
- Flashcard review: show question, reveal answer, rate (Again/Hard/Good/Easy)
- FSRS scheduling produces correct intervals (verified by tests)
- Markdown file updated before SQLite (verified by tests)
- Study events logged for every action
- Study loop suggests sensible next actions after each activity
- `learned` status transitions when delayed quiz gate passes
- All tests pass with >80% coverage on `src/lib/`

---

## Phase 3 -- AI Integration & Reader Intelligence

**Goal:** Multi-provider AI with shared client, error differentiation, profile injection, model tiers, and ai_runs audit logging. Gate analysis with two-level cache.
**Estimate: 3-4 days.**

### 3A. Rust AI Service

| File | Lines (est.) | Purpose |
|---|---|---|
| `services/ai_client.rs` | 120 | Shared `reqwest::Client`, dispatch, AiError enum, model policy resolution |
| `services/ai_providers/mod.rs` | 20 | Provider trait definition |
| `services/ai_providers/ollama.rs` | 60 | Ollama provider |
| `services/ai_providers/claude.rs` | 60 | Claude provider |
| `services/ai_providers/gemini.rs` | 70 | Key in header, not URL |
| `services/ai_providers/openai.rs` | 60 | OpenAI provider |
| `services/ai_providers/deepseek.rs` | 70 | DeepSeek Reasoner handling |
| `services/ai_providers/cli.rs` | 100 | 30s timeout, command validation, blocked dangerous commands |
| `services/profile.rs` | 30 | Build profile context from config |
| `commands/ai.rs` | 80 | AI request command + ai_runs logging |

**Critical fixes from v1:**

1. **Shared `reqwest::Client`**: Created once in `AppState`, passed to all providers. v1 creates a new client per request.

2. **Gemini key in header, not URL**:
   ```rust
   // v1 (INSECURE): key in URL query parameter -- leaks in logs, referer headers
   let url = format!("...?key={}", key);

   // v2 (SECURE): key in header
   let resp = client
       .post(&format!(".../{model}:generateContent"))
       .header("x-goog-api-key", key)
       .json(&body)
       .send()
       .await?;
   ```

3. **CLI command validation**: Block `rm`, `dd`, `mkfs`, `format`, `del`. Require absolute path or known binary. 30-second timeout (v1 has none).

4. **Temperature control per feature**: 0.1-0.3 for evaluation prompts, 0.5-0.7 for generation.

5. **ai_runs audit**: Every AI call logged with provider, model, feature, latency, status. Sanitized errors only.

### 3B. Frontend AI Integration

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/lib/profile.ts` | 30 | Profile context builder |
| `src/lib/tauri.ts` (additions) | +40 | AI request wrapper with error type parsing |

### 3C. Gate Analysis with AI

Port the two-level cache (in-memory + SQLite `analysis_cache` table) from v1. It works well. Key improvements:

- Analysis cache key includes provider + model + schema_version
- Prefetch the next section's analysis while the user reads
- Constrained output schema (correct/partial/off_track + one follow-up)
- Fallback questions when AI is unavailable (pre-authored templates)

### Acceptance Criteria
- AI requests work with all 6 providers (Ollama, Claude, Gemini, OpenAI, DeepSeek, CLI)
- Gemini API key in header, not URL
- Shared `reqwest::Client` (verified: only one `Client::builder()` in codebase)
- CLI provider has 30s timeout and blocked command list
- Error messages differentiate auth (401) from rate limit (429) from server (5xx) from timeout
- Profile context appears in all AI-generated content
- Model policy tiers resolve correctly (cheap_local/balanced/strong_reasoning)
- Temperature is lower for evaluation (0.1-0.3), higher for generation (0.5-0.7)
- `ai_runs` table populated with every AI call
- Gate analysis uses two-level cache with prefetching

---

## Phase 4 -- Quiz, Teach-Back, Queue

**Goal:** Quiz system with multiple question types, iterative teach-back, and the full Unified Study Queue on the home page.
**Estimate: 4-5 days.**

### 4A. Quiz System (Rebuilt from 1 file to 7)

v1's Quiz.tsx is 1,445 lines with 9 inline components. v2 splits it:

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/pages/Quiz.tsx` | 80 | Tab orchestrator |
| `src/stores/quiz.ts` | 300 | Quiz state (generation, evaluation, history) |
| `src/components/quiz/QuizDashboard.tsx` | 200 | Subject list, chapter selection, recent attempts |
| `src/components/quiz/QuizConfig.tsx` | 150 | Pre-quiz setup (types, count, difficulty) |
| `src/components/quiz/QuizRunner.tsx` | 200 | Active quiz session |
| `src/components/quiz/QuizResults.tsx` | 150 | Results breakdown, repair cards, WhatNext |
| `src/components/quiz/QuizQuestion.tsx` | 100 | Single question renderer (handles all types) |
| `src/components/quiz/CodeSandbox.tsx` | 150 | SQL/Python sandbox |
| `src/components/quiz/QuizReview.tsx` | 100 | Past quiz detail view |
| `commands/quiz.rs` | 80 | quiz.generate, quiz.submit_answer, quiz.finish |

**v1 question types (ship):** short answer, multiple choice, true/false.

**v2 additions (ship):** fill-in-blank. Code questions (SQL sandbox) for subjects that warrant it.

**Defer:** matching, complex adaptive exam simulation.

**Quiz outcomes feed the repair loop:**

Every incorrect or partial answer results in exactly one of:
- Repair flashcard (created automatically, added to review queue)
- Revisit section task (added to study queue)
- Follow-up quiz recommendation (shown in results)

**Spaced quiz retakes:**

When a quiz scores <70%, schedule a retake for 48h later. Log a `quiz_failed` study event. The queue picks it up as a `quiz_retake` item after the cooling period.

**Quiz results recoverable from markdown:**

Quiz markdown files include structured frontmatter:
```yaml
---
subject: D426 Data Management
topic: Normalization
type: quiz
score: 73
questions: 10
correct: 7
bloom_range: [2, 4]
created_at: 2026-03-27T14:00:00
---
```

On index rebuild, quiz history is reconstructed from these files.

### 4B. Teach-Back (Iterative)

v1 is single-pass. v2 makes it iterative (up to 3 rounds):

1. User explains the topic
2. AI evaluates: accuracy, simplicity, gaps
3. AI asks a follow-up question targeting the weakest gap
4. User responds
5. AI evaluates again
6. Repeat up to 3 rounds or until mastery >= 4
7. Final evaluation saved to markdown

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/stores/teachback.ts` | 180 | Teach-back state with iteration |
| `src/pages/TeachBack.tsx` | 80 | Page orchestrator |
| `src/components/teachback/TeachBackForm.tsx` | 100 | Explanation input |
| `src/components/teachback/TeachBackResult.tsx` | 100 | Evaluation display |
| `src/components/teachback/TeachBackIteration.tsx` | 120 | Follow-up question + response |
| `commands/teachback.rs` | 60 | teachback.evaluate, teachback.save |

Teach-back is a **capstone confidence check**, not a per-chapter requirement. Use it for:
- Readiness signal before moving on from a subject
- Synthesis amplifier for hard topics
- Self-requested deeper practice

Do not require it after every chapter. That adds friction and slows throughput.

### 4C. Unified Study Queue (Full Implementation)

| File | Lines (est.) | Purpose |
|---|---|---|
| `services/queue.rs` | 200 | Queue scoring, SQL queries, merge + sort |
| `commands/queue.rs` | 80 | queue.get_next_items, queue.get_summary |
| `src/lib/queue.ts` | 40 | QueueItem types, display helpers |

The home page transforms from a static dashboard to a queue-driven landing:

- Top card: "Your next task" with the highest-urgency queue item, prominently displayed
- Below: remaining queue items in a scrollable list, each showing kind, subject, reason, and estimated time
- Statistics (due count, streak, study time) are secondary, shown in a compact header strip
- Empty state: "All caught up. Import something new or start a fresh chapter."

### Tests for Phase 4

| Test File | Coverage Target |
|---|---|
| `__tests__/lib/queue.test.ts` | Scoring formula edge cases, priority ordering |
| `__tests__/stores/quiz.test.ts` | Quiz flow, retake scheduling, result saving |

### Acceptance Criteria
- Quiz setup -> active quiz -> results with score and breakdown
- All question types work (MC, T/F, fill-blank, free-recall, code)
- Code sandbox executes SQL and Python safely
- Quiz results saved to markdown with structured frontmatter
- Quiz history rebuilt from markdown on index rebuild
- Spaced retake nudge appears 48h after a failed quiz
- Every incorrect quiz answer produces exactly one repair action
- Teach-back supports 1-3 iterative rounds
- No-AI teach-back provides structured self-review rubric
- Queue renders on home page with correct priority ordering
- Queue refreshes after completing any task
- Due reviews outrank new reading in queue
- Repair cards outrank optional enrichment in queue
- Every page works with `provider = "none"` (graceful degradation)

---

## Phase 5 -- Extended Features & Import

**Goal:** PDF import, pomodoro timer, study tracking, progress page, markdown export.
**Estimate: 3-4 days.**

### 5A. PDF Import

| File | Lines (est.) | Purpose |
|---|---|---|
| `services/pdf.rs` | 100 | `pdf-extract` crate text extraction |
| `commands/import.rs` (additions) | +40 | `import_pdf` command |
| `src/components/vault/ImportDialog.tsx` (additions) | +60 | PDF tab in import dialog |

**Honest scoping:** PDF import is best-effort plain text extraction. Documented limitations:
- Scanned PDFs (image-based) will produce empty or garbled output
- Complex layouts (multi-column, tables, math notation) may not preserve structure
- No OCR capability
- The preview step lets users see what was extracted and cancel if quality is poor

PDF import flow:
1. User drags PDF or clicks "Import PDF"
2. Rust extracts text using `pdf-extract`
3. Text split into sections (by page breaks or heading heuristics)
4. Preview shown -- user can adjust section boundaries or cancel
5. On confirm, files written with frontmatter and indexed
6. "Read Now" toast appears

### 5B. Markdown Export

| File | Lines (est.) | Purpose |
|---|---|---|
| `commands/export.rs` | 80 | Deterministic markdown export per subject |

Export is explicit and reproducible:
- `export.sync_subject` -- export all files for a subject to a chosen directory
- `export.export_subject_bundle` -- zip a subject's markdown files
- Deterministic: same data always produces the same output
- This is NOT a continuous mirror. It is a manual action.

### 5C. Pomodoro Timer (Port from v1)

Port `PomodoroTimer.tsx`, `PomodoroRuntime.tsx`, and `stores/pomodoro.ts` from v1. Working feature, no changes needed.

### 5D. Study Time Tracking (Port from v1)

Port `stores/tracking.ts` and the tracking markdown format. Add `tracking/` directory to the incremental indexer.

### 5E. Progress Page

| File | Lines (est.) | Purpose |
|---|---|---|
| `src/pages/Progress.tsx` | 250 | Study analytics dashboard |

Show:
- Study time by subject (bar chart, pure CSS -- no charting library)
- Quiz score trends over time
- Flashcard retention rate
- Chapters read vs total per subject
- Weak topics needing attention
- Study event timeline (from `study_events` table)

### Acceptance Criteria
- PDF import extracts text and creates chapter files
- PDF preview lets user cancel if extraction quality is poor
- Markdown export produces complete, importable subject bundles
- Pomodoro timer works as in v1
- Study time tracking persists to markdown
- Progress page shows meaningful analytics from study_events
- Export -> import round-trip preserves all content

---

## Phase 6 -- Polish, Migration, Launch

**Goal:** Onboarding wizard, accessibility audit, data migration from v1, final polish.
**Estimate: 3-4 days.**

### 6A. Onboarding

See the dedicated [Onboarding Flow](#onboarding-flow) section below.

### 6B. Accessibility Audit

Every interactive element must have:
- `role` attribute where appropriate
- `aria-label` for icon-only buttons
- `aria-expanded` for collapsible sections
- `aria-live="polite"` for dynamic content (gate feedback, AI responses, queue updates)
- `tabIndex` and keyboard handlers for custom components
- Focus trap in modals (QuickSwitcher, ImportDialog, quiz config)
- Skip-to-content link
- Sufficient color contrast (WCAG AA minimum)

Specific components to audit:
- Ribbon: each icon button needs `aria-label`
- FlashcardCard: answer reveal needs `aria-live`
- DigestionGate: question text needs `role="heading"`
- QuizRunner: answer submission needs focus management
- MarkdownEditor: handled by CodeMirror (verify)
- Queue items: each needs keyboard navigation (arrow keys, Enter to start)

### 6C. Data Migration (v1 to v2)

See the dedicated [Data Migration](#data-migration-v1-to-v2) section below.

### 6D. API Key Migration

Move API keys from plaintext `config.toml` to OS keychain via `@tauri-apps/plugin-stronghold`. The `config.toml` `[ai.keys]` section remains as a fallback for environments where the keychain is unavailable.

### 6E. Final Polish

- Window title shows current file name
- Context menu in vault browser (rename, delete, move)
- Proper loading states on every page (skeleton screens, not spinners)
- Empty states with actionable CTAs on every page
- Toast notifications for background operations (save, import, index)
- Drag-and-drop file import (URL text and PDF files)

### Acceptance Criteria
- First-run wizard completes and creates a sample subject
- All ARIA audit items pass (manual testing with VoiceOver)
- Cold startup to interactive in <1.5s
- Index reconciliation for unchanged vault in <200ms
- v1 vault data migrates successfully (files, flashcards, quiz history)
- All keyboard shortcuts work (Cmd+O, Cmd+\, Cmd+/, arrow nav)
- Every page has loading state and empty state
- `npm run build` produces no warnings
- `cargo build --release` produces no warnings

---

## Testing Strategy

### Layers

| Layer | Tool | What to Test | Coverage Target |
|---|---|---|---|
| **Unit** | Vitest | Pure functions in `src/lib/` | 90%+ on sr.ts, flashcard-parser.ts, study-loop.ts, markdown.ts, queue.ts |
| **Store** | Vitest + mock Tauri | Zustand store actions | 70%+ on reader, flashcard, quiz stores |
| **Component** | Vitest + Testing Library | Interactive components | Key flows: gate submission, card review, quiz answer |
| **Rust Unit** | `cargo test` | Algorithm correctness | Incremental indexer, TOML config, path validation, queue scoring |
| **Integration** | Manual + Tauri dev mode | Full flows end-to-end | Every feature with AI on and AI off |

### TDD Protocol (Mandatory for Phase 2)

For all algorithm code, write tests BEFORE implementation:

1. Write `sr.test.ts` with expected FSRS intervals for known inputs
2. Port `fsrs()` from v1, verify tests pass
3. Write `flashcard-parser.test.ts` with edge cases
4. Implement `parseFlashcards()`, verify tests pass
5. Write `study-loop.test.ts` with priority ranking scenarios
6. Implement `getNextActions()`, verify tests pass
7. Write `queue.test.ts` with scoring formula edge cases
8. Implement `computeUrgency()`, verify tests pass

### Critical Test Cases

**FSRS Algorithm (`sr.test.ts`):**
- New card with each rating (Again/Hard/Good/Easy) produces correct initial stability
- Review card with various elapsed days and ratings produces correct new stability
- Difficulty stays within [1, 10] bounds
- Lapse resets stability but preserves difficulty
- `migrateToFSRS` produces reasonable values from SM-2 inputs
- `retrievability` at 0 elapsed days returns 1.0
- `retrievability` at stability days returns ~0.9

**Flashcard Parser (`flashcard-parser.test.ts`):**
- Standard card block parses all fields
- Missing optional fields get defaults
- Malformed `[!card]` header is skipped
- Multiple cards in one file all parsed
- FSRS fields (Stability, Difficulty, Reps, Lapses) parsed correctly
- Non-card callout blocks are not parsed as cards

**Study Loop (`study-loop.test.ts`):**
- Due flashcards are highest priority
- Post-quiz with low score suggests re-read
- Post-quiz with medium score suggests flashcard review
- Unread chapters lower priority than due cards
- `reading` chapters appear as "Continue" before new chapters
- At most 3 suggestions returned
- Works with no subjects, no due cards, no weak topics

**Queue Scoring (`queue.test.ts`):**
- Overdue cards score higher than on-time cards
- Repair cards outrank regular due cards
- Continue-reading with momentum beats new chapters
- Quiz retakes surface after 48h cooling period
- New chapters are always lowest priority
- Empty inputs produce empty queue

**Write Order (`flashcard.test.ts`):**
- `rateCard` calls `writeFile` before `updateCardSchedule`
- If `writeFile` throws, `updateCardSchedule` is never called

### Coverage Enforcement

```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  thresholds: {
    'src/lib/sr.ts': { branches: 100, functions: 100, lines: 95 },
    'src/lib/flashcard-parser.ts': { branches: 90, functions: 100, lines: 90 },
    'src/lib/study-loop.ts': { branches: 80, functions: 100, lines: 80 },
    'src/lib/markdown.ts': { branches: 80, functions: 100, lines: 80 },
    'src/lib/queue.ts': { branches: 90, functions: 100, lines: 90 },
  }
}
```

---

## Onboarding Flow

### First-Run Detection

On startup, check if `~/Encode/subjects/` is empty. If yes, show the onboarding wizard.

### Wizard Steps (4 screens)

**Screen 1: Welcome**
- "Welcome to Encode"
- "Encode makes you think harder about what you're learning. No passive highlighting. No illusions of competence. Just real understanding."
- "Let's set up your study vault."

**Screen 2: AI Setup (Optional)**
- "AI makes Encode smarter, but it's optional."
- Three options:
  - **Local (Ollama):** "Free, private, runs on your machine. Requires Ollama installed." Check `http://127.0.0.1:11434/api/tags` for available models.
  - **Cloud API:** "Higher quality. Bring your own key." (Claude, Gemini, OpenAI, DeepSeek tabs)
  - **Skip for now:** "You can always set this up later in Settings."

**Screen 3: Profile**
- "Help Encode personalize your experience."
- Role/occupation field
- Hobbies/interests field
- "This info generates relevant examples in AI responses. Stored locally only."

**Screen 4: First Subject**
- "Import your first study material."
- Three options:
  - **Paste a URL:** URL input -> imports article
  - **Try the sample:** Pre-bundled "How Encode Works" subject (3 short chapters teaching the study loop by walking through it)
  - **Start empty:** Blank subject, import later

### Sample Subject

Bundle in app resources:
- `_subject.md`: "How Encode Works"
- `chapters/01-reading-with-purpose.md` (300 words on active reading)
- `chapters/02-the-digestion-gate.md` (300 words on generation effect)
- `chapters/03-spaced-repetition.md` (300 words on FSRS and forgetting curves)

Each chapter is 2 minutes of reading. They teach the app's features by having the user use each feature.

### Progressive Feature Disclosure

After onboarding, features reveal themselves contextually:
- First gate activation: tooltip explaining what's happening
- First flashcard created: brief FSRS explanation
- First quiz available: tooltip on dashboard
- One-time tooltips, tracked in `localStorage`

---

## Data Migration (v1 to v2)

### Strategy: Non-destructive with late deletion

1. v2 reads the same `~/Encode/` vault directory as v1
2. Markdown files are already compatible (they are the source of truth)
3. v2 rebuilds SQLite from scratch on first run
4. `migration-v2.json` in `.encode/` tracks migration state

### Migration Steps (automatic on first v2 startup)

```
1. Detect v1 database (has `ease_factor` column in sr_schedule)
2. Export sr_schedule to temporary JSON:
   { card_id, file_path, ease_factor (actually stability), interval_days, next_review, last_reviewed }
3. Rename old database to encode-v1-backup.db
4. Create fresh database with v2 schema
5. Run incremental index reconciliation (indexes all markdown files)
6. Import sr_schedule data:
   - ease_factor -> stability (v1 already stores stability despite column name)
   - Read FSRS fields from markdown files for difficulty/reps/lapses
   - Fall back to migrateToFSRS() for cards without FSRS fields in markdown
7. Rebuild quiz_history from quiz markdown files (frontmatter parsing)
8. Rebuild study_sessions from tracking markdown files
9. Write migration-v2.json: { migrated_at, cards_migrated, files_indexed, quizzes_rebuilt }
10. Delete encode-v1-backup.db (only after step 9 succeeds)
```

### Rollback

If migration fails at any step:
- The old database (`encode-v1-backup.db`) exists until step 10
- Markdown files are never modified during migration
- User can delete `encode.db` and restart -- full rebuild from markdown
- Worst case: rename backup back to `encode.db` and run v1

### Config Migration

v1 flat format:
```toml
provider = "claude"
claude_api_key = "sk-..."
ollama_model = "llama3.1:8b"
```

v2 nested format:
```toml
[ai]
provider = "claude"
claude_model = "claude-sonnet-4-20250514"
ollama_model = "llama3.1:8b"
ollama_url = "http://localhost:11434"

[ai.keys]
claude = "sk-..."

[profile]
role = ""
hobbies = ""
learning_style = ""

[pomodoro]
study_secs = 1500
break_secs = 300
long_break_secs = 900
```

The `toml` crate reads v1 format with `#[serde(alias)]` and `#[serde(default)]` for backward compatibility. Both formats parse into the same `AppConfig` struct.

---

## Performance Budget

| Metric | Target | How to Measure |
|---|---|---|
| Cold startup to interactive | <1.5s | Tauri dev tools timing |
| Index reconciliation (100 unchanged files) | <200ms | Rust timing log |
| Index reconciliation (1 changed file) | <50ms | Rust timing log |
| Page navigation | <100ms | Chrome devtools |
| AI request round-trip (Ollama local) | <5s | ai_runs table |
| Flashcard load (50 due cards) | <300ms | Single batch IPC call |
| FTS5 search results | <50ms | Rust timing log |
| Memory (idle) | <150MB | Activity Monitor |
| Binary size (macOS universal) | <25MB | Build output |
| Queue computation | <100ms | Rust timing log |

---

## Security Hardened from Day One

| Issue | v1 Status | v2 Fix |
|---|---|---|
| Content Security Policy | **null** -- any injected HTML runs with full privileges | Strict CSP in `tauri.conf.json` (Phase 1) |
| Gemini API key in URL | Key in query parameter -- leaks in logs, referer headers | Key in `x-goog-api-key` header |
| CLI command validation | None -- arbitrary command execution | Blocked dangerous commands (`rm`, `dd`, etc.), absolute path check |
| CLI timeout | None -- hung script blocks forever | 30-second timeout |
| API keys in plaintext | `config.toml` unencrypted | Phase 6: migrate to `@tauri-apps/plugin-stronghold` (OS keychain). `config.toml` keys as fallback. |
| Path traversal | `canonicalize` + `starts_with` check | Keep v1's approach (correct) + `validate_new_vault_path` for new files |
| HTML sanitization | DOMPurify on render | Keep (correct). Add CSP as defense-in-depth. |
| Error message leakage | Gemini errors sanitized, others not | Sanitize ALL provider errors (strip keys, URLs with keys, token values) |
| SQL injection in sandbox | Only SELECT/WITH allowed | Keep (correct) |
| Concurrent file access | No coordination | Per-path RwLock in `vault_fs.rs` -- indexer takes shared read, writes take exclusive |

---

## Cut List

### Carry Forward from v1 "What NOT to Build"

- No complex dashboard with charts and analytics libraries
- No React Flow canvas (use Mermaid in markdown)
- No audio/video recording or playback
- No gamification (points, badges, XP, leaderboards -- research confirms this hurts learning)
- No social features
- No cloud sync (files sync via git, Dropbox, iCloud)
- No highlighting feature (creates illusion of competence)
- No plugin system

### Additional v2 Cuts

- **No streaming UI for AI responses.** Fire-and-wait works for 1-3 second gate analysis. If users report frustration, add streaming later.
- **No AI conversation mode.** Encode is not a chatbot. AI generates structured outputs (questions, evaluations, flashcards).
- **No mobile version.** Desktop study workflow (CodeMirror, keyboard shortcuts, side-by-side reading) doesn't translate to mobile.
- **No offline-first sync / CRDTs.** Files sync via filesystem tools.
- **No @tanstack/react-query.** Over-engineering for local IPC.
- **No React.lazy code splitting.** Local disk loading makes this unmeasurable.
- **No concept maps in v2.** The data model supports it (gate analysis contains topic relationships), but the visualization is not ready. If added later, it would transform `analysis_cache` topic/keyword data into Mermaid diagrams. Explicitly deferred.
- **No matching question type.** Ship MC, T/F, fill-blank, free-recall, code. Matching is complex UI for marginal learning benefit.
- **No complex adaptive exam simulation.** Simple targeted quizzes are more valuable.
- **No large historical analytics.** `study_events` enables future analytics. v2 shows basic progress only.

---

## Summary: Effort Estimates

| Phase | Days | New Files | Key Deliverable |
|---|---|---|---|
| Phase 1: Tooling & Foundation | 4-5 | ~40 | Skeleton, CI, linting, CSP, vault CRUD, index, config, app shell, editor |
| Phase 2: Core Learning Loop | 4-5 | ~30 | Reader + gates, flashcards + FSRS, study loop, event logging |
| Phase 3: AI Integration | 3-4 | ~15 | Multi-provider AI, shared client, error types, model tiers, gate analysis |
| Phase 4: Quiz, Teach-Back, Queue | 4-5 | ~20 | Quiz rebuild, iterative teach-back, full study queue |
| Phase 5: Extended Features | 3-4 | ~10 | PDF import, export, pomodoro, tracking, progress |
| Phase 6: Polish & Launch | 3-4 | ~10 | Onboarding, a11y, migration, keychain, final polish |
| **Total** | **21-27 days** | **~125 files** | **Complete app with tests, queue, and audit logging** |

The v1 codebase has ~45 source files totaling ~15,000 lines. v2 will have ~125 files but each is 30-300 lines (median ~120). Total lines will be similar (~16,000-20,000) but the code is organized, tested, and maintainable.

The extra files are worth it. A 1,445-line Quiz.tsx with 9 components is harder to work with than 7 files averaging 150 lines each.

---

## Quick Reference: What Goes Where

When building and unsure where something lives:

- **Pure function with no side effects?** `src/lib/`
- **Tauri `invoke()` wrapper?** `src/lib/tauri.ts`
- **Async state management?** `src/stores/`
- **React component < 300 lines?** `src/components/{domain}/`
- **React page orchestrator?** `src/pages/` (delegates to components)
- **Tauri command handler?** `src-tauri/src/commands/`
- **Business logic that doesn't need Tauri?** `src-tauri/src/services/`
- **Database query?** `src-tauri/src/db/`
- **Queue scoring/ranking?** `src-tauri/src/services/queue.rs`
- **Shared utility (slugify, dates)?** `src/lib/` with a single canonical export
- **Design token (color, spacing)?** `src/components/ui/tokens.css`
- **Theme definition?** `src/lib/themes.ts`
- **Schema migration?** `src-tauri/migrations/NNN_description.sql`
- **AI provider implementation?** `src-tauri/src/services/ai_providers/`

If a file exceeds 300 lines, split it. If a function is used in more than one file, extract it to `src/lib/`. If a component has more than 3 pieces of local state, consider if some state belongs in a store.
