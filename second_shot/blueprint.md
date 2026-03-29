# Encode Blueprint

## What This Is

This is the final blueprint for rebuilding Encode from scratch through version 2.

It is synthesized from:

- [second_shot.md](/Users/samiehabdeljabbar/Desktop/actually_learn/second_shot/second_shot.md)
- [second_shot_codex.md](/Users/samiehabdeljabbar/Desktop/actually_learn/second_shot/second_shot_codex.md)
- [final_shot.md](/Users/samiehabdeljabbar/Desktop/actually_learn/second_shot/final_shot.md)

This document is meant to be implementation-driving, not inspirational. It defines the product thesis, UX, architecture, storage model, build order, migration rules, and test bar for v2.

## 1. Product Thesis

Encode is a local-first study engine, not a note-taking app with learning features attached.

The system exists to run one loop well:

`import -> read in chunks -> recall -> verify -> repair -> spaced review`

The rebuild succeeds only if the learner can open the app and immediately know:

- what to do now
- why it matters
- how long it should take
- what it unlocks next

Everything in v2 should strengthen that loop. If it does not, it gets cut or deferred.

## 2. Non-Negotiable Product Rules

### 2.1 Repair is the product

The most valuable moment in the app is not a correct answer. It is the moment the system catches a misconception and turns it into one clean next action.

Every partial or failed response must create exactly one of:

- `retry_now`
- `create_repair_card`
- `revisit_later`
- `schedule_retest`

Never generate multi-paragraph AI essays during the core loop.

### 2.2 One meaningful check per chunk

The Reader asks for one short, high-signal response per chunk by default.

No multi-question gates in the default flow.

### 2.3 One queue answers “what now?”

The app should have one default `Study Queue` that ranks reading, repair, review, and retesting into a single next-action list.

### 2.4 Deterministic logic stays local

AI must not own:

- queue ranking
- FSRS scheduling
- chunk splitting
- status transitions
- import/export rules
- migrations
- data integrity

### 2.5 No-AI mode must still be useful

AI improves quality. It does not provide the app’s basic usefulness.

### 2.6 Fewer, better cards

Cards should mostly come from demonstrated gaps, not automatic model enthusiasm.

### 2.7 The learner owns the material

The learner must always be able to export meaningful study artifacts in a deterministic markdown format.

## 3. Product Shape

### Top-level navigation

Keep the app to five top-level surfaces:

1. `Queue`
2. `Library`
3. `Reader`
4. `Review`
5. `Settings`

`Quiz` and `Teach-back` remain core workflows, but they do not need to live as permanent top-level destinations. They should be launched from:

- queue items
- chapter completion states
- subject actions
- repair flow

This keeps the app feeling like one machine instead of several unrelated modes.

### Primary workflows

Encode v2 ships with these workflow categories:

1. `Import / Ingest`
2. `Read / Check`
3. `Repair / Review`
4. `Quiz / Retest`
5. `Teach-back / Readiness`

## 4. UI / UX Direction

The new app should feel denser, calmer, and more editorial than v1.

### Visual direction

- dark graphite base
- restrained accent use
- fewer dashboard cards
- stronger document-like reading surfaces
- compact but readable controls
- high contrast and keyboard-first ergonomics

### Queue UX

Each queue item must show:

- item type
- subject
- title
- why it is next
- estimated time
- what happens after completion

The learner must be able to:

- start the top suggestion
- choose another queue item
- skip/snooze an item
- pin a chapter or subject temporarily

The queue should guide, not trap.

### Keyboard-first desktop UX

Encode should explicitly preserve and improve desktop-native flows:

- `Cmd+O` opens a global Quick Switcher
- arrow keys and `Enter` navigate/start queue items
- Reader supports keyboard-driven advance, retry, and submit
- Review supports keyboard ratings
- `Cmd+\` toggles the sidebar where applicable
- `Cmd+/` opens the shortcuts overlay

Window behavior should persist between launches:

- window size
- window position
- sidebar width
- last-opened surface

### Reader UX

The Reader is the highest-priority surface and should get the strongest design attention:

- wide quiet content column
- visible chunk progress
- minimal chrome
- clear transition from reading to response
- strong keyboard flow
- no sidebar clutter unless it materially improves orientation

### Review UX

Review should be optimized for repetition speed:

- one card at a time
- minimal visual noise
- visible session count and progress
- keyboard shortcuts for ratings

### Library UX

The Library replaces the vault-first framing. It should focus on:

- subjects
- chapters
- imports
- search
- recent work

Raw filesystem management should not be the default mental model.

## 5. Storage Authority And Trust Model

This is the most important architecture decision in the rebuild.

### 5.1 Final decision

Encode v2 uses a **two-plane storage model**.

### 5.2 Runtime source of truth

`SQLite` is the canonical runtime source of truth for the live app.

It owns:

- queue state
- section progress
- study events
- card scheduling
- AI run metadata
- caches and indexes
- derived analytics
- current workflow state

### 5.3 Knowledge artifact authority

User-facing learning artifacts must be exportable and recoverable as deterministic markdown:

- chapters
- flashcards
- quiz archives
- teach-back archives
- subject bundles

### 5.4 What this means in practice

- The app does not treat markdown as the write path for every tiny interaction.
- The app does guarantee deterministic export of meaningful study artifacts.
- Runtime state may be rebuilt from SQLite snapshots and event history, not necessarily from markdown alone.
- Trust comes from exportability and recoverability, not from forcing every runtime mutation through a file write.

### 5.5 Recovery guarantees

Version 2 guarantees:

- subject exports can recreate user-owned learning artifacts
- runtime state can be backed up via SQLite copy/snapshot
- import/export round-trips preserve material fidelity for supported artifact types
- automatic background artifact export is enabled by default
- periodic SQLite snapshots are enabled by default

Version 2 does **not** guarantee:

- deleting SQLite loses nothing without prior export or backup

This is a deliberate tradeoff. v2 is no longer a markdown-primary runtime.

### 5.5.1 Default safety behavior

To keep the trust model strong, v2 should not rely on the user remembering to export manually.

Default behavior:

- after meaningful artifact changes, enqueue a background export refresh
- maintain periodic subject-bundle exports on an idle timer
- maintain periodic SQLite snapshots
- expose last successful export and last successful snapshot in Settings

This is the mitigation for choosing SQLite as runtime truth.

### 5.6 Conflict handling

If imported/exported markdown diverges from runtime state:

- imports are explicit operations
- exports are deterministic snapshots
- optional continuous mirror mode is deferred

This avoids hidden bidirectional sync logic in v2.

## 6. Canonical Data Model

Keep these tables and responsibilities.

### `subjects`

Stores top-level subject identity and metadata.

Fields:

- `id`
- `slug`
- `name`
- `description`
- `created_at`
- `archived_at`

### `sources`

Stores imported raw material and normalized content.

Fields:

- `id`
- `subject_id`
- `kind`
- `title`
- `source_url`
- `author`
- `raw_content`
- `normalized_markdown`
- `imported_at`

### `chapters`

Stores learner-facing study units.

Fields:

- `id`
- `subject_id`
- `source_id`
- `title`
- `slug`
- `status`
- `estimated_minutes`
- `created_at`
- `updated_at`

### `chapter_sections`

Stores deterministic chunking results.

Fields:

- `id`
- `chapter_id`
- `section_index`
- `heading`
- `body_markdown`
- `word_count`
- `difficulty_hint`
- `keywords_json`

### `study_events`

Append-only record of learner actions.

Examples:

- section check submitted
- section passed
- section failed
- synthesis completed
- card reviewed
- quiz failed
- repair created
- teach-back completed

Fields:

- `id`
- `subject_id`
- `chapter_id`
- `card_id`
- `quiz_id`
- `event_type`
- `payload_json`
- `created_at`

Implementation note:

`payload_json` is reserved for event-specific details, not for every commonly queried field.

Keep hot query fields typed outside the JSON payload so queries like:

- recent section failures by subject
- repair events by chapter
- failed quizzes by chapter

remain simple and cheap.

### `cards`

Stores flashcard definitions and provenance.

Fields:

- `id`
- `subject_id`
- `chapter_id`
- `source_type`
- `prompt`
- `answer`
- `card_type`
- `status`
- `created_at`

### `card_schedule`

Stores the current FSRS scheduling state for each card.

Fields:

- `card_id`
- `next_review`
- `stability`
- `difficulty`
- `reps`
- `lapses`
- `last_reviewed`

Responsibility split:

- `cards` = flashcard definition
- `card_schedule` = current scheduling state
- `card_reviews` = historical review log

### `card_reviews`

Stores card review history and FSRS output values.

Fields:

- `id`
- `card_id`
- `rating`
- `reviewed_at`
- `scheduled_days`
- `stability`
- `difficulty`

### `quizzes`

Stores quiz generation metadata.

Fields:

- `id`
- `subject_id`
- `chapter_id`
- `scope_type`
- `config_json`
- `generated_at`

### `quiz_attempts`

Stores question-level learner results.

Fields:

- `id`
- `quiz_id`
- `question_index`
- `question_json`
- `user_answer`
- `evaluation_json`
- `result`
- `created_at`

### `teachbacks`

Stores teach-back entries and evaluations.

Fields:

- `id`
- `subject_id`
- `chapter_id`
- `prompt`
- `response`
- `evaluation_json`
- `created_at`

### `ai_runs`

Stores AI metadata, not full sensitive payloads by default.

Fields:

- `id`
- `feature`
- `provider`
- `model`
- `prompt_version`
- `status`
- `latency_ms`
- `error_summary`
- `created_at`

### `settings`

Stores typed local app settings.

## 7. State Machines

The rebuild needs explicit state transitions.

### 7.1 Chapter lifecycle

Use these states:

- `new`
- `reading`
- `awaiting_synthesis`
- `ready_for_quiz`
- `mastering`
- `stable`

Transitions:

- `new -> reading`
  - first Reader open
- `reading -> awaiting_synthesis`
  - final chunk completed
- `awaiting_synthesis -> ready_for_quiz`
  - synthesis submitted
- `ready_for_quiz -> mastering`
  - first acceptable quiz or successful retest
- `mastering -> stable`
  - sustained retrieval/review success over time

### 7.2 Section lifecycle

Each section should track:

- `unseen`
- `seen`
- `checked_correct`
- `checked_partial`
- `checked_off_track`
- `revisit_scheduled`

Retry limit:

- one immediate retry max per section check in the default flow
- after that, route to repair/revisit rather than trapping the learner

### 7.3 Repair lifecycle

Repair items should track:

- `created`
- `queued`
- `completed`
- `snoozed`
- `superseded`

### 7.4 Quiz readiness

A chapter becomes quiz-ready only when:

- all required chunks are completed
- synthesis is completed

### 7.5 Review readiness

A card becomes review-ready when:

- newly created repair cards are inserted into the queue immediately
- scheduled cards become due via FSRS date

## 8. Unified Study Queue Specification

The queue is rule-based, inspectable, and computed on demand.

### 8.1 Queue item types

At minimum:

- `due_card`
- `repair_card`
- `continue_reading`
- `synthesis_required`
- `quiz_retake`
- `new_chapter`

### 8.2 Base priority order

From highest to lowest:

1. overdue review
2. repair work
3. unfinished reading with momentum
4. synthesis required
5. quiz retake after cooldown
6. new content

### 8.3 Scoring inputs

Each item score should consider:

- overdue amount
- lapse risk
- recency of demonstrated miss
- momentum from recent reading
- cooldown elapsed
- task length
- learner pinning

### 8.3.1 Initial scoring model

The queue should use a deterministic 0-100 score in v2.

Initial scoring:

- `due_card`
  - base 60
  - overdue boost up to +25
  - low-stability boost up to +10
- `repair_card`
  - base 75
  - recent-miss boost up to +10
- `continue_reading`
  - base 40
  - momentum boost up to +15
- `synthesis_required`
  - base 50
- `quiz_retake`
  - base 45
  - cooldown boost up to +15
- `new_chapter`
  - base 20
  - pinned-subject boost up to +10

This is intentionally simple, inspectable, and tunable later from real usage.

### 8.4 Tie-breakers

If scores tie:

1. shorter task first
2. same-subject continuity first
3. most recently active chapter first

### 8.5 Starvation prevention

Low-priority items should not disappear forever.

Rule:

- if a `new_chapter` or `quiz_retake` item has been skipped repeatedly for more than 7 days, add a bounded visibility boost
- the boost may increase placement, but must never outrank overdue review or fresh repair work

### 8.6 Skip and snooze semantics

- `skip` lowers item priority for the current session only
- `snooze` hides the item until a chosen future time/date
- `pin` boosts one chapter or subject within a capped band and expires after the session

### 8.7 Queue transparency

Every queue item must expose:

- `reason`
- `estimated_minutes`
- `next_effect`

The user must be able to inspect why an item surfaced.

## 9. Reader Design

### 9.1 Reading flow

1. load chapter and sections
2. show one chunk
3. ask one check
4. evaluate
5. create exactly one follow-up action
6. continue
7. require synthesis
8. unlock quiz

### 9.2 Prompt types

Prompt families:

- `explain`
- `apply`
- `distinguish`
- `predict`

Selection should be deterministic based on section characteristics and learner history, not random.

### 9.3 Evaluation schema

Section evaluation outputs:

- `correct`
- `partial`
- `off_track`

Follow-up outputs:

- `advance`
- `retry_now`
- `create_repair_card`
- `revisit_later`

### 9.4 Threshold behavior

- `correct`
  - learner captured the core idea and no immediate repair is needed
- `partial`
  - learner shows the right direction but missed a key element
  - allow one targeted retry
- `off_track`
  - learner misunderstood the concept materially
  - create repair and move on rather than stall

### 9.5 No-AI evaluation path

Without AI:

- prompt types come from deterministic heuristics
- expected key points are locally derived from headings and extracted statements
- self-check is structured, not silent
- the user can mark `I need repair` manually

## 10. Review And Card System

### 10.1 Scheduling

Use FSRS for all scheduling.

### 10.2 Card sources

Primary sources:

- reader misses
- quiz misses
- manual creation

Secondary source:

- accepted AI suggestions

### 10.3 Anti-flood rule

The system should never automatically create large batches of cards from one section by default.

Default max:

- one repair card per section failure
- one repair action per quiz miss

## 11. Quiz System

### 11.1 v2 initial scope

Ship:

- short answer
- multiple choice
- true/false
- SQL sandbox questions for analytics/database subjects

Optional if implementation cost is low:

- fill-in-the-blank
- Python sandbox questions for data-analysis workflows

Defer from initial v2 ship:

- matching
- large adaptive exams

### 11.1.1 Why SQL is in scope

For the primary user and target coursework, executable SQL practice is core, not edge.

Version 2 should ship SQL quiz execution in the first real retrieval build using:

- the existing SQLite sandbox pattern from v1
- strict query restrictions
- deterministic result comparison

Python execution can remain conditional if it threatens scope, but SQL should not be deferred out of the initial target build.

### 11.2 Quiz outcome rules

Each incorrect or partial answer must generate one repair action and update the queue.

### 11.3 Retest rule

Failed quizzes should produce a cooldown retest item after a delay rather than an immediate forced repeat.

Initial cooldown:

- 48 hours

## 12. Teach-back

Teach-back remains in v2, but it is not part of the mandatory chapter-completion path.

Use it for:

- readiness checks
- hard topics
- end-of-subject reinforcement

If iterative teach-back is added in the first build, keep it constrained:

- one follow-up round is enough

### 12.1 Evaluation rubric

Teach-back evaluation should score against:

- accuracy
- clarity
- completeness
- use of concrete example
- unexplained jargon

The output should include:

- a concise overall judgment
- one strongest part
- one biggest gap
- one follow-up question if another round is used

### 12.2 Mastery scoring

Use a simple 4-band result:

- `weak`
- `developing`
- `solid`
- `ready`

Do not overbuild a complex scoring engine for v2.

## 13. Editing And Authoring

This area was under-specified in the prior drafts and needs explicit treatment.

### v2 expectation

Users must still be able to:

- create a subject
- create a chapter manually
- edit chapter content
- revise flashcards
- inspect exported markdown

### Editor stance

Keep CodeMirror 6, but editing is a support surface, not the center of the product.

The authoring experience should feel integrated with the Library, not like a separate note app trapped inside the study tool.

## 14. AI Strategy

### 14.1 AI use cases

Use AI for:

- section evaluation
- synthesis evaluation
- repair card suggestion
- quiz generation
- quiz evaluation
- teach-back critique

### 14.2 AI exclusions

Do not use AI for:

- queue ranking
- scheduling
- chunk splitting
- deterministic parsing
- migrations
- export logic

### 14.3 Typed AI contract

```ts
type AiJobRequest = {
  feature:
    | 'reader.section_check'
    | 'reader.synthesis_eval'
    | 'reader.repair_card'
    | 'quiz.generate'
    | 'quiz.evaluate'
    | 'teachback.evaluate';
  input: Record<string, unknown>;
  expectedSchema?: string;
  modelPolicy: 'cheap_local' | 'balanced' | 'strong_reasoning';
  timeoutMs: number;
  fallbackPolicy: 'deterministic' | 'none';
};

type AiJobResult<T = unknown> = {
  provider: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
  rawText: string;
  parsed: T | null;
  fallbackUsed: boolean;
  error: string | null;
};
```

### 14.4 Provider strategy

Do not overbuild provider complexity at the start, but do preserve provider continuity for existing users.

Version 2 should keep the existing provider family from v1:

1. `none`
2. `ollama`
3. `claude`
4. `gemini`
5. `openai`
6. `deepseek`
7. `cli`

Implementation rule:

- support all current providers through one typed router
- optimize and test the highest-polish paths first
- use model policy tiers to decide preferred provider/model when multiple are configured

This keeps migration smooth without letting provider-specific logic leak into product design.

### 14.5 AI safety rules

- schema validation on structured outputs
- sanitized errors
- strict timeouts
- metadata logging
- deterministic fallbacks

## 15. No-AI Contract

This needs to be explicit.

### Reader

Works without AI:

- chunking
- question presentation
- deterministic prompt choice
- self-check support
- manual repair creation

Degraded:

- answer evaluation quality

Unavailable:

- nuanced semantic evaluation

### Review

Works fully without AI.

### Quiz

Works without AI for:

- deterministic prompt generation from extracted facts/headings
- simple grading for objective question types

Degraded:

- open-ended grading quality

### Teach-back

Works in degraded mode with:

- structured self-review rubric
- prompts for missing examples and relationships

## 16. Import / Export Contract

This needs to be concrete for trust.

### 16.1 Export artifact layout

Exports should support subject bundles with this deterministic structure:

```text
subjects/{subject-slug}/
  _subject.md
  chapters/
  flashcards/
  quizzes/
  teach-backs/
```

### 16.2 Frontmatter contract

At minimum:

```yaml
---
subject: ...
topic: ...
type: chapter | flashcard | quiz | teach-back
created_at: ...
source_id: ...
chapter_id: ...
---
```

### 16.3 Deterministic ordering rules

- chapters sorted by canonical chapter order
- cards sorted by creation timestamp then ID
- quiz attempts sorted by question index
- stable ID inclusion where possible

### 16.4 Round-trip expectation

Supported export/import round-trips must preserve:

- chapter content
- flashcard prompts/answers
- quiz archives
- teach-back archives

Round-trip does not need to preserve every runtime cache or queue score.

### 16.5 File access coordination

Concurrent file access must go through one coordinated backend file service.

Rules:

- editor writes use atomic write-and-rename
- export jobs do not read half-written files
- index reconciliation does not race active writes
- background export and indexing operate on stable snapshots

For v2, a per-path lock or equivalent serialized file-operation layer is sufficient.

## 17. Migration Plan

Migration needs explicit mapping and validation.

### 17.1 Migration input sources

From v1:

- subject folders
- chapter markdown
- flashcard callout files
- quiz markdown
- teach-back markdown
- config data where usable

### 17.2 Mapping rules

- v1 subjects -> `subjects`
- v1 chapter files -> `sources` + `chapters` + `chapter_sections`
- v1 flashcards -> `cards`
- v1 quiz files -> `quizzes` + `quiz_attempts` where reconstructable
- v1 teach-back files -> `teachbacks`

### 17.3 Validation rules

Migration should:

- count imported files by type
- record skipped or uncertain conversions
- preserve source references when available
- generate a migration report

### 17.4 Backup step

Before any migration write:

- copy the existing `.encode` directory
- never destructively modify original markdown

### 17.5 Uncertain conversion handling

If a file cannot be mapped cleanly:

- import it as archived raw content
- mark it in the migration report
- do not silently drop it

## 18. Backend And Frontend Architecture

### Backend

Keep:

- Tauri 2
- Rust services
- rusqlite
- FTS5

Add or formalize:

- typed TOML config
- shared HTTP client
- incremental index reconciliation via content hashing
- import/export services
- migration service
- queue service
- AI service
- CI-friendly command boundaries
- coordinated file access service

### Engineering foundation

Ship the rebuild with real engineering discipline from day one:

- Biome for linting/formatting
- lefthook or equivalent pre-commit hooks
- GitHub Actions CI
- Vitest coverage reporting
- `cargo check` and `tsc --noEmit` as required gates

The earlier plans were right about this: v2 should not repeat v1’s tooling gaps.

### Frontend

Keep:

- React 18
- TypeScript strict
- Zustand or similarly light state
- CodeMirror 6
- DOMPurify
- theme system built on CSS custom properties

### Frontend architecture rules

- pages orchestrate
- features own workflow state
- pure logic lives in domain modules
- main pages use batched domain-shaped IPC calls
- common utilities like `slugify`, frontmatter parsing, date helpers, and queue formatting must have one canonical implementation each

### Implementation hygiene rules

- no duplicated parsing logic across stores and components
- no N+1 IPC for primary pages
- shared `reqwest::Client` on the backend
- split large feature surfaces into components/modules before they become god files

Suggested structure:

```text
src/
  app/
  pages/
  features/
    queue/
    library/
    reader/
    review/
    quiz/
    teachback/
    settings/
  domain/
    queue/
    study/
    fsrs/
    ai/
    export/
    migration/
  components/
    ui/
    layout/
  lib/
    tauri/
    markdown/
    dates/
    schemas/
```

### Theme policy

Do not remove themes entirely.

The cut is against a sprawling theming surface, not against theming itself.

Version 2 should ship a curated set of polished built-in themes, likely fewer than v1, using:

- CSS variable tokens
- Tailwind 4 theme integration
- runtime theme swapping

The goal is to preserve polish without turning themes into a product branch of their own.

### Settings authority

Settings need one explicit ownership boundary:

- `config.toml` remains the human-readable source for durable configuration
  - AI providers
  - model settings
  - export preferences
  - vault paths
- SQLite may store runtime UI state and ephemeral preferences
  - last-opened surface
  - window state
  - temporary view preferences

Do not duplicate durable configuration across both stores without a clear source-of-truth rule.

## 19. Onboarding

Onboarding should be part of the product.

### First-run steps

1. welcome
2. optional AI setup
3. profile context
4. import first material or launch sample subject

### Sample subject

Ship a small bundled sample that demonstrates:

- reading in chunks
- section checks
- repair
- spaced review

The app should teach itself through use.

## 20. Security And Reliability

Ship these early:

- strict CSP
- DOMPurify on all rendered HTML
- typed config parsing
- path validation
- sanitized AI errors
- import/export safety
- migration backups
- AI timeouts

Later:

- keychain-backed key storage

### Performance and indexing

The rebuild should avoid full index rebuilds on every startup.

Use incremental reconciliation:

- content hashing for imported/exported artifacts
- only changed files are reindexed
- deleted files are removed from the index

Target:

- unchanged startup reconciliation under 200ms for a normal vault

## 21. Build Roadmap

The first shippable v2 should be narrower than the source plans initially proposed.

### Phase 1: Foundation

Estimate: 4-5 days

- fresh app shell
- typed config
- SQLite schema
- Library
- search
- import pipeline
- export scaffolding
- Quick Switcher
- keyboard shortcut registry
- window state persistence
- CI / lint / test harness
- theme token system
- incremental index reconciliation

### Phase 2: Core Loop

Estimate: 5-6 days

- Reader
- one-check-per-chunk evaluation
- synthesis
- repair events
- FSRS review
- Study Queue v1
- no-AI completeness for core loop
- authoring/editing integration

### Phase 3: Retrieval Expansion

Estimate: 5-6 days

- constrained quiz generation/evaluation
- SQL sandbox quizzes
- retest scheduling
- teach-back
- onboarding sample subject
- multi-provider typed AI router

### Phase 4: Migration, Polish, Launch

Estimate: 4-5 days

- legacy vault importer
- accessibility pass
- performance pass
- security hardening
- export quality

Estimated total:

- 18-22 focused engineering days for a solo builder
- longer if Python sandboxing, broad analytics, or continuous mirror mode are pulled forward

### What is intentionally deferred beyond first v2 ship

- broad provider matrix
- SQL/code execution unless proven essential
- continuous markdown mirroring
- heavy analytics

## 22. Testing Strategy

### Must-test logic

- FSRS scheduling
- queue ranking
- chunk splitting
- export generation
- import round-trips
- synthesis gating
- repair generation
- migration transforms
- SQL sandbox validation

### Desktop interaction checks

Must verify:

- Quick Switcher keyboard flow
- queue keyboard navigation
- Reader keyboard submission flow
- review shortcut ratings
- window state restore
- theme switching persistence

### Acceptance scenarios

- import -> read -> repair -> review
- synthesis unlocks quiz
- quiz misses create repair work
- due review outranks new reading
- no-AI mode remains useful
- export/import round-trip preserves supported artifacts
- legacy import works on real sample data

### Principle

Test the learning engine before polishing the chrome.

## 23. Cut List

Do not ship these in the first v2 rebuild:

- plugin system
- cloud sync
- social features
- gamification
- mobile app
- AI chat mode
- matching questions
- large adaptive testing
- broad theming surface
- concept maps as a primary feature
- heavy analytics suite

## 24. Final Recommendation

The best version of Encode v2 is:

- queue-centered
- reader-first
- repair-driven
- SQLite-runtime-backed
- markdown-exportable
- AI-assisted but not AI-dependent
- narrower than the current ambition
- stricter about trust, migration, and testing

That is the build path most likely to produce a serious study product instead of a sprawling learning workspace.

## 25. Review Note

An external `claude-opus-second-pass` audit was attempted before finalization, but the automation shell could not access the interactive Claude auth session. A separate skeptical second-pass agent review was used as fallback and its findings were incorporated into this blueprint:

- storage authority is now explicit
- state machines were added
- queue scoring semantics were tightened
- no-AI behavior was turned into an explicit contract
- import/export rules were made concrete
- migration mapping and validation rules were added
- the initial ship was narrowed
