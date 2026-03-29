# Final Shot

## What This Document Is

This is the merged rewrite blueprint for Encode, built from:

- [`second_shot_codex.md`](/Users/samiehabdeljabbar/Desktop/actually_learn/second_shot/second_shot_codex.md)
- [`second_shot.md`](/Users/samiehabdeljabbar/Desktop/actually_learn/second_shot/second_shot.md)

It keeps the strongest product ideas from both, removes overreach, resolves their biggest disagreement, and adds a few new decisions where the two plans left an important gap.

This is the version I would actually build from.

---

## 1. The Core Thesis

Encode should be rebuilt as a local-first study engine, not as a markdown vault with learning features attached.

The product exists to run one loop well:

`import -> read in chunks -> recall -> verify -> repair -> spaced review`

That loop should drive:

- the navigation
- the queue
- the data model
- the AI contract
- the onboarding
- the feature cut list

The rewrite succeeds only if the learner can open the app and immediately know what to do next.

---

## 2. The Best Ideas Worth Keeping

From the Codex draft, the strongest ideas are:

- one unified `Study Queue`
- one meaningful check per chunk
- repair as the center of the product
- fewer top-level surfaces
- strict AI boundaries
- real no-AI behavior
- anti-card-flood discipline

From the longer second plan, the strongest ideas are:

- markdown portability as a trust signal
- atomic and recoverable data handling
- domain-oriented backend commands
- strong testing discipline
- onboarding as part of the product, not an afterthought
- security hardening from day one
- explicit migration planning

The merged version should keep all of those, but trim the parts that would slow down the first real rebuild.

---

## 3. The Main Decision: Resolve Storage Without Compromising Trust

The biggest conflict between the two plans is storage.

One plan says:

- SQLite should become the primary runtime source of truth.

The other says:

- markdown must remain the source of truth for everything.

I would not choose either extreme.

### Final decision

Use a **two-plane model**:

### Knowledge Plane

User-owned learning artifacts must remain exportable, readable, and durable:

- chapter content
- flashcards
- quiz archives
- teach-back archives
- subject bundles

These should always be materializable to markdown in a deterministic way.

### Runtime Plane

Fast-changing application state should live in SQLite:

- queue state
- section progress
- study events
- AI run metadata
- card scheduling
- derived analytics
- caches and indexes

### Why this is the right compromise

It preserves the trust signal that the learner owns the material, while removing the worst part of the current architecture: using markdown mutation as the write path for every tiny runtime interaction.

### Practical rule

- Content and archival artifacts must always be exportable to markdown.
- Runtime state does not need to be written back to markdown immediately.
- Export must be deterministic.
- Later, optional continuous mirror mode can be added if you want tighter file parity.

This is the most important new takeaway from comparing both documents.

---

## 4. Product Shape

The app should collapse into five first-class workflows:

1. `Queue`
2. `Library`
3. `Reader`
4. `Review`
5. `Settings`

`Quiz` and `Teach-back` remain core capabilities, but they do not need to be permanent top-level orientation surfaces. They should appear naturally:

- from the queue
- from chapter completion
- from subject-level actions
- from repair flow

That reduces mode-picking and makes the product feel like one system instead of several adjacent tools.

---

## 5. Product Rules

These are the rules I would treat as non-negotiable.

### 1. Repair is the product

Every miss, partial answer, or weak explanation must produce exactly one actionable next step:

- retry now
- create repair card
- revisit section
- schedule retest

Never dump paragraphs of AI feedback on the learner.

### 2. One meaningful check per chunk

The default reader flow should ask for one short but high-signal response per chunk. Do not overbuild multi-question gates until the core loop proves itself.

### 3. The queue is the app’s control tower

The app must answer “what should I do next?” with one ranked list. The learner should not have to choose between disconnected study modes before getting started.

### 4. No-AI mode must still be useful

AI should improve quality, not provide basic functionality. The app must still work when AI is off.

### 5. Deterministic logic stays local

AI should not own:

- queue ranking
- FSRS scheduling
- path logic
- section chunking
- state transitions
- migrations

Those need to stay inspectable and testable.

### 6. Fewer, better cards

Do not generate cards at volume. Cards should mostly come from demonstrated gaps, not model enthusiasm.

---

## 6. The Unified Study Queue

This is the product’s main surface.

The queue should combine:

- due cards
- repair cards
- unfinished reading
- synthesis-required chapters
- weak quiz areas
- scheduled quiz retakes
- ready-to-start new chapters

### Priority order

1. overdue review
2. repair work from demonstrated misses
3. unfinished chapter momentum
4. synthesis-required items
5. quiz retakes after cooldown
6. new content

### Important addition

The queue must always explain itself with:

- why this is next
- how long it should take
- what happens after completion

That keeps the queue from feeling opaque or authoritarian.

### Manual control

The learner should still be able to:

- skip an item
- start a different item from the queue
- pin a chapter or subject temporarily

The queue should guide, not trap.

This is another important synthesis choice. The Codex draft risked reducing agency; the merged version keeps the queue strong but not controlling.

---

## 7. Reader Design

The Reader is the heart of the rebuild.

### Session flow

1. Load a chapter and its sections.
2. Show one chunk at a time.
3. Ask one section check.
4. Evaluate the response.
5. Emit exactly one follow-up.
6. Continue.
7. Require chapter synthesis.
8. Unlock quiz after synthesis.

### Prompt types

Use a constrained set:

- explain
- apply
- distinguish
- predict

The system should choose the prompt type based on section shape and learner context, not randomly.

### Evaluation contract

Use only:

- `correct`
- `partial`
- `off_track`

With exactly one follow-up action:

- `advance`
- `retry_now`
- `create_repair_card`
- `revisit_later`

That is one of the best ideas across both plans and should survive unchanged.

### Synthesis

Synthesis should be mandatory before quiz unlock, but brief. It should ask the learner to connect:

- the central idea
- the key relationships
- one practical example

Teach-back remains distinct and later.

---

## 8. Quiz And Teach-back

### Quiz

Quiz should be targeted retrieval, not a giant exam mode.

Ship in v1:

- short answer
- multiple choice
- true/false
- fill-in-the-blank if it comes cheaply

Conditional:

- SQL/code questions only when the subject warrants executable checking

Defer:

- matching
- large adaptive exam simulation
- broad analytics-heavy quiz tooling

Every incorrect or partial answer should feed back into the repair loop.

### Teach-back

Teach-back should remain a capstone confidence check, not a required step after every chapter.

Use it for:

- hard topics
- readiness checks
- synthesis reinforcement
- self-requested deeper practice

If you add iterative teach-back, keep it modest. One extra follow-up round may be enough for v1. Three rounds by default is probably too much early on.

That is a new simplification relative to the larger plan.

---

## 9. AI Strategy

Both source documents were right to keep AI centralized. The merged version should keep that, but reduce early provider sprawl.

### AI should be used for

- section evaluation
- synthesis evaluation
- repair card suggestion
- quiz generation
- quiz evaluation
- teach-back critique

### AI should not be used for

- queue ranking
- scheduling
- chunk splitting
- file paths
- migrations
- data integrity

### Typed contract

Keep a typed internal job shape:

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

### Provider strategy for v1

Do not ship six polished providers on day one.

Start with:

1. `none`
2. `ollama`
3. one strong cloud provider

Then add the rest only if they are actually needed.

That is a better v1 tradeoff than either source document made explicitly.

### AI safety rules

- schema-validate structured outputs
- sanitize provider errors
- log metadata, not sensitive content by default
- keep timeouts strict
- keep fallback behavior predictable

---

## 10. No-AI Mode

No-AI mode must feel like a lower-powered version of the product, not a broken version.

### Reader fallback

- use deterministic prompt templates
- show extracted key points
- allow self-marking plus manual repair creation

### Quiz fallback

- use locally derived fact prompts
- allow deterministic grading only where appropriate
- otherwise use structured self-review

### Review fallback

- fully functional, because FSRS is local

### Teach-back fallback

- show a self-review rubric
- prompt for missing concepts and examples

This requirement should remain a release gate.

---

## 11. Architecture

### Keep

- Tauri 2
- React 18
- TypeScript strict
- Zustand or similarly light state management
- CodeMirror 6
- rusqlite
- FTS5
- DOMPurify
- FSRS

### Add early

- typed TOML config parsing
- CI
- formatter/linter
- error boundaries
- accessibility review
- strict IPC boundaries

### Backend command model

Move to domain commands:

- `library.import_source`
- `library.search`
- `reader.load_session`
- `reader.submit_check`
- `reader.submit_synthesis`
- `queue.get_next_items`
- `review.get_due_cards`
- `review.submit_rating`
- `quiz.generate`
- `quiz.submit_answer`
- `teachback.evaluate`
- `export.sync_subject`
- `migration.import_legacy_vault`

### Frontend rule

The frontend should stop reconstructing app truth from many tiny reads. Pages should request batched data from domain commands.

### New architecture takeaway

Do not be rigid about “one function, one file” or hard line counts. Small files are good, but artificial splitting is noise if it hurts cohesion.

That is where the larger plan over-specified implementation style.

---

## 12. Data Model

Keep these core entities:

- `subjects`
- `sources`
- `chapters`
- `chapter_sections`
- `study_events`
- `cards`
- `card_reviews`
- `quizzes`
- `quiz_attempts`
- `teachbacks`
- `ai_runs`
- `settings`

### Important modeling rule

Use `study_events` as append-only behavior history, but keep it scoped to real product use:

- section checks
- synthesis completion
- card reviews
- quiz outcomes
- teach-back completion
- repair creation

Do not let event logging become an excuse to build analytics before the learning loop is solid.

---

## 13. Onboarding

The longer plan was right to give onboarding more weight.

Onboarding should do three things:

1. explain the learning loop
2. configure AI optionally
3. get the learner into a first useful session fast

### First-run wizard

Suggested flow:

1. Welcome
2. AI setup or skip
3. Personalization context
4. Import first subject or launch sample subject

### Sample subject

Ship a tiny guided sample that teaches:

- chunked reading
- section checks
- repair cards
- spaced review

The app should teach itself through use.

---

## 14. Security And Reliability

The merged plan should keep the stronger operational discipline from the larger document.

### Must-have safeguards

- strict CSP
- DOMPurify on all rendered HTML
- typed config parsing
- sanitized provider errors
- path validation
- coordinated file writes for exports/imports
- timeouts on CLI and network AI calls
- keychain migration later for API keys

### Reliability rules

- deterministic exports
- recoverable imports
- migration backups
- batch IPC for main pages
- algorithm tests before UI polish

---

## 15. Build Order

The larger plan is useful, but too detailed for a first-pass rebuild document. I would compress it to four phases.

### Phase 1: Foundation

- fresh app shell
- typed config
- SQLite schema
- import pipeline
- Library
- search
- export scaffolding

### Phase 2: Core Loop

- Reader
- one-check-per-chunk evaluation
- synthesis
- repair flow
- FSRS review
- queue v1

### Phase 3: AI And Retrieval

- AI gateway
- constrained section evaluation
- quiz generation and evaluation
- teach-back
- no-AI fallback completion

### Phase 4: Migration And Polish

- legacy vault importer
- sample onboarding subject
- accessibility pass
- performance pass
- export quality
- security hardening

This is leaner and more buildable than the six-phase version, while keeping the right ordering.

---

## 16. Testing Strategy

The testing discipline from the larger plan should stay.

### Must-test logic first

- FSRS scheduling
- queue ranking
- flashcard parsing and export
- section splitting
- synthesis gating
- quiz repair generation
- migration transforms

### Acceptance scenarios

- import -> read -> repair -> review
- synthesis unlocks quiz
- incorrect quiz answers create repair work
- due review outranks new reading
- no-AI mode remains usable
- export -> import round-trip preserves content
- legacy import works on real samples

### Practical principle

Test the learning engine before polishing the chrome.

---

## 17. What To Cut From v1 Scope

Keep the cut discipline from both documents.

Do not ship these in the first rewrite:

- plugin system
- cloud sync
- social features
- gamification
- mobile version
- broad analytics suite
- AI chat mode
- matching questions
- heavy adaptive testing
- large theming surface
- concept maps as a primary feature

If the core loop is not great, none of these matter.

---

## 18. Final Recommendation

If I were actually rebuilding Encode, I would combine the two source plans like this:

- keep the sharper product simplification from the Codex draft
- keep the stronger testing, migration, onboarding, and security discipline from the longer plan
- reject both storage extremes
- build around a two-plane model: durable user-owned markdown artifacts plus SQLite runtime state
- ship one queue, one meaningful check per chunk, one repair action per miss
- keep AI typed, bounded, optional, and secondary to deterministic logic
- ship fewer features, but make the loop feel inevitable and good

That version is more coherent than either source document alone.

It is simpler than the long plan, safer than the Codex plan, and more realistic to ship.
