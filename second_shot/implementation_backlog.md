# Encode Implementation Backlog

This backlog turns [`blueprint.md`](/Users/samiehabdeljabbar/Desktop/actually_learn/second_shot/blueprint.md) into a build sequence.

It is organized by phase, with:

- goal
- exit criteria
- epics
- concrete tasks
- dependencies
- defer notes

The priority order here is intentional. Build top to bottom.

## Working Rules

- Do not start Phase 2 before Phase 1 exit criteria are met.
- Do not start Phase 3 AI work before the no-AI core loop works end to end.
- Do not expand provider complexity before the typed AI router is stable.
- Do not build broad analytics, concept maps, or cloud sync during this backlog.
- Treat `blueprint.md` as the product and architecture source of truth.
- Critical algorithms are test-first:
  - FSRS scheduling
  - queue scoring
  - chunk splitting
  - import/export round-trip transforms
  - migration transforms

## Milestones

### M1

Foundation is stable:

- app shell exists
- import works
- Library works
- deterministic export works
- incremental indexing works

### M2

Core learning loop is real:

- Reader works
- one-check-per-chunk works
- repair flow works
- review works
- queue works
- no-AI mode is useful

### M3

Retrieval system is complete:

- quiz works
- SQL sandbox works
- teach-back works
- AI router works across supported providers

### M4

Product is launch-ready:

- migration works
- onboarding works
- accessibility is audited
- export/snapshot safety is visible
- performance targets are met

## Phase 1: Foundation

Goal: establish the new runtime, app shell, import/export baseline, and engineering discipline.

Estimate: 4-5 days

Exit criteria:

- app launches into the new shell
- typed config loads and saves
- SQLite schema is in place
- subject/chapter import works
- Library renders imported content
- subject export works deterministically
- automatic background export refresh works
- periodic SQLite snapshots work
- Quick Switcher works
- startup reconciliation is incremental
- CI, lint, and test gates are active

### Epic 1.1: Project scaffolding and tooling

Tasks:

- initialize fresh v2 app structure in the existing repo or a clean app subtree
- configure Biome
- configure pre-commit hooks
- configure GitHub Actions CI
- wire `cargo check`, `tsc --noEmit`, and test runner as required gates
- add error boundaries and global error handling

Dependencies:

- none

### Epic 1.2a: App shell and navigation

Tasks:

- build top-level shell with `Queue`, `Library`, `Reader`, `Review`, `Settings`
- add page-level error boundaries

Dependencies:

- Epic 1.1

### Epic 1.2b: Keyboard infrastructure

Tasks:

- add global Quick Switcher
- implement keyboard shortcut registry
- implement shortcuts overlay

Dependencies:

- Epic 1.1

### Epic 1.2c: Theme system

Tasks:

- add theme token system
- implement curated built-in themes
- persist theme switching

Dependencies:

- Epic 1.1

### Epic 1.2d: Window state persistence

Tasks:

- persist window size
- persist window position
- persist sidebar width
- persist last-opened surface

Dependencies:

- Epic 1.1

### Epic 1.3: Runtime storage, schema, and file coordination

Tasks:

- define SQLite schema for `subjects`, `sources`, `chapters`, `chapter_sections`, `study_events`, `cards`, `card_schedule`, `card_reviews`, `quizzes`, `quiz_attempts`, `teachbacks`, `ai_runs`
- define migration runner
- define typed TOML config loading
- define settings ownership boundary between `config.toml` and SQLite runtime state
- implement coordinated file-access service

Dependencies:

- Epic 1.1

### Epic 1.4: Import, Library, and search

Tasks:

- implement URL/article import pipeline
- implement manual chapter creation
- normalize imports into `sources`, `chapters`, and `chapter_sections`
- build Library subject and chapter views
- wire FTS5 search
- add “Read now” entry after import

Dependencies:

- Epic 1.3
- Epic 1.2a
- Epic 1.2b

### Epic 1.5: Export, backup, and indexing

Tasks:

- implement deterministic subject export format
- implement subject-bundle export
- implement periodic background export refresh
- implement periodic SQLite snapshots
- expose last export and last snapshot status in Settings
- implement content-hash incremental reconciliation

Dependencies:

- Epic 1.3
- Epic 1.4
- Epic 1.2d

### Phase 1 validation tasks

- verify unchanged startup reconciliation target under 200ms on a realistic vault
- verify export/import round-trip for basic subject content
- verify keyboard shortcuts work across shell surfaces
- verify no N+1 IPC on home/library loads
- verify background export refresh triggers after artifact changes
- verify SQLite snapshots are created and recoverable

## Phase 2: Core Learning Loop

Goal: ship the first complete learning engine without depending on AI.

Estimate: 5-6 days

Exit criteria:

- Reader works end to end
- one-check-per-chunk is live
- chapter synthesis is required
- repair actions are created correctly
- FSRS review works
- queue ranks next actions correctly
- no-AI mode is useful for the core loop

### Epic 2.1: Reader and chunk progression

Tasks:

- write tests first for deterministic chunk splitting and section state transitions
- implement Reader session loading from `chapters` and `chapter_sections`
- render chunk progression and progress indicators
- add deterministic prompt-type selection
- implement section state tracking
- implement chapter state transitions
- consume coordinated file-access service where chapter writes or exports can overlap

Dependencies:

- Phase 1 complete

### Epic 2.2: Section evaluation and repair flow

Tasks:

- write tests first for evaluation outcomes and repair routing
- implement section evaluation contract with `correct`, `partial`, `off_track`
- enforce one immediate retry max
- implement repair item creation
- enforce anti-flood rule: max one repair card per section failure
- log `study_events` for section checks and outcomes
- define no-AI evaluation path and self-check flow

Dependencies:

- Epic 2.1

### Epic 2.3: Synthesis and quiz readiness

Tasks:

- implement required synthesis prompt
- persist synthesis completion
- transition chapter to `ready_for_quiz`
- ensure queue reflects synthesis-required chapters
- log synthesis completion to `study_events`

Dependencies:

- Epic 2.1

### Epic 2.4: Review and FSRS

Tasks:

- write tests first for FSRS scheduling and `card_schedule` updates
- implement `cards`, `card_schedule`, and `card_reviews` workflow
- port or rebuild FSRS engine with tests
- implement review session UI
- implement repair-card creation from reader misses
- implement keyboard ratings
- log card reviews and lapses to `study_events`

Dependencies:

- Epic 2.2

### Epic 2.5: Unified Study Queue v1

Tasks:

- write tests first for deterministic 0-100 queue scoring
- implement queue item model
- implement deterministic 0-100 scoring model
- implement tie-breakers
- implement starvation prevention
- implement skip, snooze, and pin behavior
- implement queue UI and “why this is next”
- read required momentum/miss signals from `study_events`

Dependencies:

- Epic 2.2
- Epic 2.3
- Epic 2.4

### Epic 2.6: Editing and authoring integration

Tasks:

- integrate CodeMirror authoring into Library flows
- support chapter editing
- support flashcard revision
- ensure file/export views are inspectable

Dependencies:

- Phase 1 complete

### Phase 2 validation tasks

- test import -> read -> repair -> review end to end
- verify due review outranks new reading
- verify section failure creates exactly one repair action
- verify no-AI mode works without hidden AI dependencies

## Phase 3: Retrieval Expansion

Goal: add AI-assisted retrieval, quizzes, SQL practice, and teach-back without destabilizing the core loop.

Estimate: 5-6 days

Exit criteria:

- typed AI router is stable
- current provider family is supported
- quiz flow works end to end
- SQL sandbox works safely
- teach-back works with a real rubric
- retest items feed back into the queue

### Epic 3.1: Typed AI router

Tasks:

- implement typed `AiJobRequest` and `AiJobResult`
- build provider router for `none`, `ollama`, `claude`, `gemini`, `openai`, `deepseek`, `cli`
- add shared HTTP client
- add model policy tiers
- add explicit AI error differentiation:
  - unauthorized
  - rate limited
  - server error
  - timeout
  - network/provider unreachable
  - invalid response
  - provider disabled
- map those errors to user-facing messages
- add sanitized errors and timeout handling
- log `ai_runs`
- inject profile context server-side into all AI prompts

Dependencies:

- Phase 2 complete

### Epic 3.2: AI-assisted Reader intelligence

Tasks:

- plug AI into section evaluation
- plug AI into synthesis evaluation
- add schema validation for structured outputs
- preserve deterministic fallback path
- verify profile context reaches reader prompts through the router

Dependencies:

- Epic 3.1

### Epic 3.3: Quiz system

Tasks:

- implement quiz generation contract
- implement quiz session state
- ship short answer, multiple choice, true/false
- optionally add fill-in-the-blank if low cost
- persist quiz attempts
- create repair actions from misses
- enforce anti-flood rule: one repair action per quiz miss by default
- create retest items with cooldown
- log quiz outcomes and retest scheduling signals to `study_events`

Dependencies:

- Epic 3.1
- Phase 2 queue/review complete

### Epic 3.4: SQL sandbox

Tasks:

- build SQLite sandbox for quiz questions
- restrict execution to safe query patterns
- compare results deterministically
- surface SQL quiz results cleanly in repair flow

Dependencies:

- Epic 3.3

### Epic 3.5: Teach-back

Tasks:

- implement teach-back prompt flow
- implement rubric for accuracy, clarity, completeness, concrete example, jargon
- implement 4-band mastery result
- optionally support one follow-up round
- persist teach-back records
- log teach-back completion to `study_events`
- verify profile context reaches teach-back prompts through the router

Dependencies:

- Epic 3.1

### Epic 3.6: Onboarding sample subject

Tasks:

- build first-run flow
- add optional AI setup
- add profile context setup
- bundle sample subject that teaches the loop

Dependencies:

- Phase 1 shell complete
- Phase 2 core loop complete

### Phase 3 validation tasks

- verify quiz misses feed repair and retest flows
- verify SQL sandbox safety constraints
- verify AI-off fallback still works for quiz and teach-back
- verify existing configured providers migrate cleanly

## Phase 4: Migration, Polish, Launch

Goal: make v2 safe, performant, accessible, and migration-ready.

Estimate: 4-5 days

Exit criteria:

- migration imports real v1 data successfully
- accessibility pass is complete
- performance targets are met
- export/snapshot safety is visible and reliable
- build is stable enough to ship

### Epic 4.1: Legacy migration

Tasks:

- import v1 subjects
- import chapter markdown into `sources` and `chapters`
- import flashcard callouts into `cards`
- import quiz archives where reconstructable
- import teach-back archives
- generate migration report with skipped or uncertain items
- never destructively modify source markdown

Dependencies:

- Phase 1 schema complete
- Phase 3 quiz/teach-back persistence complete

### Epic 4.2: Accessibility and keyboard audit

Tasks:

- audit focus order on all main surfaces
- audit icon buttons and ARIA labels
- audit Reader, Review, Queue, Quick Switcher, and modal focus handling
- verify screen-reader compatibility for dynamic content

Dependencies:

- Phase 2 and Phase 3 UI complete

### Epic 4.3: Performance and reliability

Tasks:

- measure startup reconciliation time
- measure queue computation time
- measure review load time
- verify background exports do not race writes
- verify snapshot recovery process
- verify no god-surface regressions or N+1 IPC regressions
- verify coordinated file-access service prevents export/index/write races

Dependencies:

- prior phases complete

### Epic 4.4: Security and operational hardening

Tasks:

- verify strict CSP
- verify DOMPurify coverage
- verify path validation
- verify provider error sanitization
- verify CLI timeout and command restrictions
- plan or implement keychain-backed key storage

Dependencies:

- prior phases complete

### Phase 4 validation tasks

- test migration on real v1 samples
- test export/import round-trip on migrated data
- test keyboard-first flow through Queue, Reader, Review, and Quick Switcher
- test shipping build cleanly

## Backlog Items Explicitly Deferred

- cloud sync
- plugin system
- gamification
- social features
- mobile app
- matching question type
- large adaptive exam simulation
- concept maps as a primary v2 feature
- broad analytics suite
- continuous bidirectional markdown mirroring

## Critical Path

Build in this order:

1. shell + schema + import/export
2. Reader + repair + review
3. queue
4. typed AI router
5. quiz + SQL sandbox
6. teach-back + onboarding
7. migration + accessibility + performance

If anything slips, cut from the bottom of that list first.

## Definition Of Done

This backlog is complete when:

- the app can import material and get the learner into reading immediately
- the learner can move through chunked reading, receive one meaningful check, and generate repair work
- repair work feeds review and retesting
- the queue gives a credible “what next” answer
- the app remains useful with AI off
- exports and snapshots make the SQLite-runtime model trustworthy
- migration from v1 is safe enough for real usage
- CI is green
- coverage thresholds are met
- `tsc --noEmit` passes with no `any` regressions
- no N+1 IPC remains on primary pages
- no unchecked user-controlled path handling remains in backend file operations
