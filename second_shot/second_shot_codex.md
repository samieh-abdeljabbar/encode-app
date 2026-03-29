# Encode Second Shot

## 1. Positioning

Encode should be rebuilt as a desktop-first study operating system, not a notes app with learning features bolted on.

The product thesis is simple:

1. Bring useful material in.
2. Break it into learnable chunks.
3. Force active recall before progress.
4. Turn misses into repair work.
5. Keep the queue honest with spaced review.

The core loop is:

`capture/import -> read in chunks -> respond from memory -> verify -> repair -> spaced review`

That loop should drive nearly every screen, every data model, and every AI call.

## 2. What Changes From Today

### Keep

- Tauri 2 desktop shell
- React 18 + TypeScript strict frontend
- Local-first product model
- SQLite for fast local querying
- FSRS for spaced repetition
- AI behind a single backend boundary
- Strong emphasis on active recall, synthesis, and teach-back

### Cut Or Defer

- Markdown as the live write-path for every interaction
- Multiple disconnected home/dashboard surfaces
- Large settings surface early on
- Theme proliferation and deep visual customization
- Productivity-adjacent features that do not tighten the learning loop
- Heavy analytics in v1
- Plugin system, cloud sync, social features, gamification

### New Product Shape

The v1 rewrite should have five first-class workflows:

1. `Inbox / Import`
2. `Reader`
3. `Review Queue`
4. `Quiz`
5. `Teach-back`

Everything else is support infrastructure.

## 3. Product Principles

### One default queue

The app should have one primary “what should I do now?” answer. That is the `Study Queue`.

The queue should combine:

- due flashcards
- repair cards from recent misses
- unfinished reading sessions
- chapters blocked on synthesis
- weak quiz topics that need retesting

The queue should rank for learning value, not just chronology. Forgetting prevention outranks novelty.

### Fewer decisions for the learner

The app should stop asking the learner to choose from many study modes up front. The default experience should be:

- open app
- see the next best task
- do the task
- roll into the next one

### One meaningful check per chunk

The current direction risks overcomplicating section gates. The rewrite should use one short but high-signal response per chunk by default. That response should prove understanding, not produce busywork.

### Repair is the product

The most valuable moment is not the correct answer. It is the moment the system catches a misconception and turns it into follow-up work. Every partial or failed response should yield exactly one next action:

- retry prompt
- repair card
- revisit task

No sprawling feedback walls.

## 4. Information Architecture

The app should simplify to five top-level areas:

### `Queue`

Default landing view. Shows the next recommended action first, then the rest of the ranked queue.

### `Library`

Holds subjects, chapters, source imports, and searchable study materials. This replaces the current vault-centric framing.

### `Reader`

Focused reading and section checks. No sidebar clutter. Built for throughput and retention.

### `Review`

FSRS review, repair cards, and recent misses.

### `Settings`

Only the essentials in v1:

- AI provider
- model policy
- import/export path
- review preferences
- basic appearance

`Quiz` and `Teach-back` can live as queue-driven destinations and subject-level actions rather than always-visible top-level navigation. They are important workflows, but not primary orientation surfaces.

## 5. UX Direction

The rewrite should be denser, calmer, and more editorial than dashboard-heavy.

### Visual direction

- dark graphite base with restrained accent use
- compact panels and strong spacing rhythm
- fewer cards, more hierarchy
- typography that feels like reading software, not admin software
- more “document workspace”, less “widget board”

### Reading behavior

- large, quiet content column
- visible chunk progress
- clear “respond to continue” boundary
- minimal chrome during reading
- persistent context for why the learner is being asked a question

### Queue behavior

Each queue item should clearly answer:

- what this is
- why it matters now
- how long it will take
- what will happen after completion

## 6. Storage Model

This rewrite should intentionally stop treating markdown as the primary runtime store.

### Canonical store

`SQLite` should be the canonical local source of truth for live app state.

That includes:

- subjects
- sources
- chapters
- chapter sections
- study events
- cards
- card review history
- quizzes
- quiz attempts
- teach-backs
- AI run metadata
- settings

### Markdown’s role

Markdown should become:

- an import source
- an export format
- a sync/mirror format
- a long-term archival format

It should not be the required persistence path for every interaction. App state should not depend on brittle file mutation logic for routine operations like rating a card or saving a quiz answer.

### Why this is better

- simpler state transitions
- easier migrations
- stronger querying
- easier queue generation
- fewer sync bugs between UI and files
- cleaner support for versioned AI outputs and audit logs

## 7. Canonical Data Model

These are the core tables I would lock in from day one.

### `subjects`

- `id`
- `slug`
- `name`
- `description`
- `created_at`
- `archived_at`

### `sources`

- `id`
- `subject_id`
- `kind` (`url`, `markdown`, `manual`, `imported_file`)
- `title`
- `source_url`
- `author`
- `imported_at`
- `raw_content`
- `normalized_markdown`

### `chapters`

- `id`
- `subject_id`
- `source_id`
- `title`
- `slug`
- `status` (`new`, `reading`, `awaiting_synthesis`, `ready_for_quiz`, `mastering`)
- `estimated_minutes`
- `created_at`
- `updated_at`

### `chapter_sections`

- `id`
- `chapter_id`
- `section_index`
- `heading`
- `body_markdown`
- `word_count`
- `difficulty_hint`
- `keywords_json`

### `study_events`

Append-only log of meaningful learner actions.

- `id`
- `subject_id`
- `chapter_id`
- `event_type`
- `payload_json`
- `created_at`

Examples:

- section check submitted
- section passed
- section failed
- synthesis completed
- quiz completed
- teach-back evaluated

### `cards`

- `id`
- `subject_id`
- `chapter_id`
- `source_type` (`ai_repair`, `manual`, `quiz_miss`, `reader_highlight`)
- `prompt`
- `answer`
- `card_type`
- `status`
- `fsrs_state_json`
- `created_at`

### `card_reviews`

- `id`
- `card_id`
- `rating`
- `reviewed_at`
- `scheduled_days`
- `stability`
- `difficulty`

### `quizzes`

- `id`
- `subject_id`
- `chapter_id`
- `scope_type` (`chapter`, `subject`, `repair`)
- `config_json`
- `generated_at`

### `quiz_attempts`

- `id`
- `quiz_id`
- `question_index`
- `question_json`
- `user_answer`
- `evaluation_json`
- `result` (`correct`, `partial`, `incorrect`)
- `created_at`

### `teachbacks`

- `id`
- `subject_id`
- `chapter_id`
- `prompt`
- `response`
- `evaluation_json`
- `created_at`

### `ai_runs`

- `id`
- `feature`
- `provider`
- `model`
- `prompt_version`
- `input_json`
- `output_json`
- `parsed_json`
- `status`
- `latency_ms`
- `created_at`

### `settings`

Single persisted settings table or key-value store for:

- AI configuration
- export behavior
- vault paths
- review defaults
- UI preferences

## 8. Backend Command Design

The current file-primitive IPC surface should be replaced with domain-oriented commands.

Recommended command groups:

### `library.*`

- `library.import_source`
- `library.list_subjects`
- `library.list_chapters`
- `library.get_chapter`
- `library.search`

### `reader.*`

- `reader.load_session`
- `reader.submit_check`
- `reader.submit_synthesis`
- `reader.get_next_chunk`

### `queue.*`

- `queue.get_next_items`
- `queue.get_queue_summary`
- `queue.dismiss_item`

### `review.*`

- `review.get_due_cards`
- `review.submit_rating`
- `review.create_manual_card`

### `quiz.*`

- `quiz.generate`
- `quiz.submit_answer`
- `quiz.finish_attempt`

### `teachback.*`

- `teachback.evaluate`
- `teachback.save`

### `export.*`

- `export.sync_subject`
- `export.export_subject_bundle`
- `export.import_legacy_vault`

This is a better contract because the frontend asks for outcomes, not filesystem mutations.

## 9. Frontend Architecture

I would keep React, but reduce store sprawl.

### State strategy

- one app-shell store for navigation, settings, and global session state
- feature controllers/hooks per workflow
- pure domain modules for scoring, FSRS transforms, chunk selection, and queue ranking
- server-shaped data from Tauri, not frontend reconstruction of app truth from many local reads

### Suggested frontend structure

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
  components/
    ui/
    layout/
  lib/
    tauri/
    dates/
    schemas/
```

The rule should be: UI components render, feature modules orchestrate, domain modules decide.

## 10. Reader Design

The Reader is the heart of the product.

### Reading session flow

1. Load chapter and precomputed sections.
2. Show one section chunk.
3. Ask one section check.
4. Evaluate response.
5. Emit one repair or advance action.
6. Repeat.
7. Require synthesis at chapter end.
8. Unlock quiz after synthesis.

### Section check contract

Each chunk should generate one prompt of one of these types:

- explain
- apply
- distinguish
- predict

The prompt should be chosen based on section type and current learner history, not randomly.

### Evaluation output

The evaluation should be constrained to:

- `correct`
- `partial`
- `off_track`

And exactly one follow-up:

- `advance`
- `retry_now`
- `create_repair_card`
- `revisit_later`

### Synthesis

End-of-chapter synthesis should be mandatory before quiz unlock.

It should ask the learner to explain:

- the chapter’s central idea
- the key relationships
- one practical example

This should be short, structured, and saved.

## 11. Review System

FSRS remains the right choice.

### Review sources

Cards should come from:

- explicit repair actions after misses
- quiz misses
- manual card creation
- optional AI suggestions from strong source material

### Important constraint

Do not flood the learner with cards just because AI can generate them.

The app should prefer:

- fewer cards
- higher quality cards
- cards tied to demonstrated gaps

That keeps the loop tight and prevents review debt from becoming the product.

## 12. Quiz Design

Quiz should not be a giant mode. It should be a targeted retrieval check.

### v1 question types

Ship:

- short answer
- multiple choice
- true/false when useful

Conditional:

- SQL/code questions only when the material warrants executable validation

Defer:

- matching
- complex adaptive exam simulation
- large historical analytics

### Quiz outcomes

Every incorrect or partial answer should result in one of:

- repair card
- revisit section task
- follow-up quiz recommendation

Quiz should update the queue immediately.

## 13. Teach-back Design

Teach-back should stay, but it should move later in the loop.

Use it as:

- capstone confidence check
- readiness signal before moving on
- synthesis amplifier for hard topics

Do not require it after every chapter in v1. That adds friction and slows throughput.

## 14. AI Strategy

AI should remain centralized in the backend, but the contract should become typed and feature-driven.

### Internal request shape

```ts
type AiJobRequest = {
  feature:
    | "reader.section_check"
    | "reader.synthesis_eval"
    | "reader.repair_card"
    | "quiz.generate"
    | "quiz.evaluate"
    | "teachback.evaluate";
  input: Record<string, unknown>;
  expectedSchema?: string;
  modelPolicy: "cheap_local" | "balanced" | "strong_reasoning";
  timeoutMs: number;
  fallbackPolicy: "deterministic" | "none";
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

### AI should be used for

- section understanding/evaluation
- repair prompt generation
- card suggestion from demonstrated misses
- quiz generation/evaluation
- teach-back critique

### AI should not be used for

- queue ranking
- section chunking
- due card calculation
- vault/export path logic
- status transitions
- deterministic parsing

Those should stay local and testable.

### Model policy

I would define policy tiers instead of letting each feature pick arbitrary models:

- `cheap_local`
  - extraction
  - summarization
  - simple card suggestion
- `balanced`
  - section evaluation
  - quiz generation
- `strong_reasoning`
  - teach-back critique
  - difficult free-response evaluation

### Required safety rules

- schema-validate all structured outputs
- log prompt version and latency
- sanitize provider errors
- never let malformed JSON silently mutate state
- keep deterministic fallback paths for core flows

## 15. No-AI Mode

No-AI mode needs to be real, not nominal.

### Reader fallback

- use pre-authored prompt templates
- let learner self-check against extracted key points
- allow “mark for repair” manually

### Quiz fallback

- generate questions from stored key facts, headings, and extracted statements
- use deterministic answer matching only for simple types
- otherwise present reflective self-grade flow

### Review fallback

- fully functional, because FSRS is local

### Teach-back fallback

- provide a structured self-review rubric instead of silent failure

If AI is unavailable, the product should still feel useful, just less adaptive.

## 16. Import And Export

### Import pipeline

Every import should follow this flow:

1. ingest raw source
2. normalize to markdown/plain text
3. parse metadata
4. chunk into sections
5. extract keywords and difficulty hints locally
6. persist canonical records
7. optionally run AI enrichment

### Export contract

The app should support deterministic markdown exports for:

- chapters
- flashcards
- quiz archives
- teach-back archives
- subject bundles

Export should be explicit and reproducible, not an implementation side effect.

## 17. Legacy Migration Path

The rewrite should provide a one-way import path from the current vault format.

### Migration phases

1. read current subject folders
2. import chapter markdown into `sources` and `chapters`
3. parse existing flashcard callouts into `cards`
4. import quiz markdown as historical attempts where possible
5. import teach-back files as archived teach-back entries
6. mark uncertain conversions with migration notes

### Important boundary

Legacy markdown structure should influence the importer, not the runtime design.

Do not rebuild the new app around old file constraints.

## 18. Queue Ranking Model

The queue is the product’s control tower.

### Ranking inputs

- overdue review urgency
- lapse risk
- unfinished chapter momentum
- recent quiz weakness
- pending repair tasks
- recency fatigue
- estimated task length

### Priority rules

- due review beats new reading
- repair work beats optional enrichment
- synthesis-required chapters beat starting unrelated new content
- short meaningful wins should be surfaced when the learner has low momentum

The queue should feel smart, but it should remain rule-based and inspectable in v1.

## 19. Phased Build Order

I would rebuild in this order.

### Phase 1: Foundations

- new SQLite schema
- domain services
- backend command surface
- import pipeline
- basic library UI

### Phase 2: Reader

- chunked reading sessions
- single-prompt section checks
- synthesis flow
- study event logging

### Phase 3: Review Queue

- queue ranking
- FSRS review flow
- repair task/card creation

### Phase 4: Quiz

- constrained quiz generator
- evaluation pipeline
- quiz outcomes feeding queue and cards

### Phase 5: Teach-back

- structured teach-back flow
- readiness scoring

### Phase 6: Export + Migration

- markdown export
- legacy vault importer
- audit/migration reporting

This order keeps the loop useful early instead of chasing parity.

## 20. Tests And Acceptance

The rewrite should be accepted only if these flows work cleanly.

### Core scenarios

- import a source, chunk it, read it, submit section checks, and see queue updates
- complete synthesis and confirm quiz unlock
- miss quiz answers and confirm repair tasks/cards are created
- review due cards and confirm FSRS updates remain stable
- run with AI disabled and confirm the loop still works
- export a subject to markdown and re-import it without material loss
- import a current-format vault and get usable chapters/cards/history
- confirm queue ranking favors forgetting prevention over lower-value tasks

### Technical verification

- `npm test`
- `npx tsc --noEmit`
- `cargo check`
- schema validation tests for AI outputs
- migration fixtures from real vault samples
- queue ranking tests from fixed event fixtures

## 21. Risks And Open Questions

The main risks in this rewrite are clear.

### Risk: losing the “your files are yours” trust signal

Mitigation:

- make markdown export first-class
- make export deterministic
- let users choose continuous mirror mode later

### Risk: overbuilding AI infrastructure early

Mitigation:

- ship typed job boundaries first
- keep feature count small
- maintain deterministic fallback for core flows

### Risk: queue logic becoming opaque

Mitigation:

- keep v1 queue ranking rule-based
- expose “why this is next”

### Risk: migration complexity

Mitigation:

- treat legacy import as phased
- prefer correctness over perfect fidelity
- explicitly flag uncertain conversions

### Open questions

- whether subject export should be manual only in v1 or support background mirror mode
- whether SQL/code quiz execution belongs in v1 or immediately after
- whether teach-back should produce readiness scoring in v1 or only feedback

## 22. Bottom Line

If I were rebuilding Encode from scratch, I would not start with markdown mutation as the center of the app. I would build a local SQLite-native study engine with a disciplined queue, a focused reader, FSRS review, constrained AI orchestration, and deterministic export back to markdown.

That gives you:

- faster iteration
- cleaner state
- better queueing
- less UI sprawl
- better AI observability
- a tighter learning loop from day one

The rebuild should aim to feel less like a vault with study tools and more like a serious machine for understanding, repairing, and retaining knowledge.
