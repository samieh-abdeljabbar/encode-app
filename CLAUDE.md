# CLAUDE.md — Development Instructions for Encode

## What This App Is

Encode is a Tauri 2.0 desktop app that makes you think harder about what you're learning. It's a study environment with a structured markdown vault. All knowledge is stored as plain `.md` files — the app reads, renders, and augments them but never locks them in.

**Core loop:** Import content → Read section by section → Digestion gate forces you to stop and think → AI coaches deeper connections → Quizzes test understanding → Flashcards maintain recall → Everything saved as markdown.

**AI is tiered:** Ollama (local, free) is the default. Claude/Gemini API is optional for higher quality. No AI mode still works for reading, gates, and flashcards.

## Tech Stack

- **Tauri 2.0** — Rust backend, system webview
- **React 18 + TypeScript** (strict mode) — Frontend
- **Tailwind CSS 4** — Styling, dark mode
- **Zustand** — State management (stores split by domain)
- **CodeMirror 6** — Live preview markdown editor (Obsidian-style)
- **SQLite** (rusqlite, bundled) — FTS5 index + SR scheduling + quiz history
- **marked** — Markdown to HTML rendering (for Reader + preview)
- **DOMPurify** — HTML sanitization on all rendered content
- **FSRS** — Free Spaced Repetition Scheduler (replaced SM-2)
- **Lucide React** — Icon system (1000+ tree-shakable icons)
- **Inter** — UI font via @fontsource/inter

## Critical Architecture Rule

**Markdown files are the source of truth. SQLite is just an index.**

If you delete `encode.db`, the app MUST rebuild everything from the markdown files on next launch. Zero data loss. Every piece of knowledge, every flashcard, every quiz result, every teach-back — all in `.md` files.

SQLite stores only: FTS5 search index, spaced repetition schedule cache, quiz score history (for adaptive difficulty), file index (for fast lookups).

## Vault Structure

```
~/Encode/
├── subjects/
│   └── {subject-slug}/
│       ├── _subject.md          # Subject metadata
│       ├── chapters/            # Imported + digested content
│       ├── flashcards/          # Flashcard files with SR metadata
│       ├── quizzes/             # Quiz sessions with results
│       ├── teach-backs/         # Feynman explain-backs with eval
│       └── maps/                # Mermaid diagram files
├── daily/                       # One Thing commitments
├── captures/                    # Quick thought captures
└── .encode/
    ├── encode.db                # SQLite index only
    └── config.toml              # Settings (provider, model, api_key, etc.)
```

## File Conventions

**Every markdown file has YAML frontmatter:**
```yaml
---
subject: D426 Data Management
topic: Normalization
type: chapter | flashcard | quiz | teach-back | map | daily | capture
created_at: 2026-03-21T19:00:00
---
```

**Wiki-links:** Use `[[filename]]` without extension. Obsidian-compatible format.

**Mermaid diagrams:** Fenced code blocks with `mermaid` language tag.

**Flashcard blocks:** Use callout syntax with FSRS scheduling fields:
```markdown
> [!card] id: fc-001
> **Q:** Question text
> **A:** Answer text
> **Bloom:** 1-6
> **Ease:** 2.5
> **Interval:** 7
> **Next:** 2026-04-04
> **Last:** 2026-03-28
> **Stability:** 30.5
> **Difficulty:** 5.5
> **Reps:** 12
> **Lapses:** 0
```

**Digestion gate responses** are appended to chapter files under `## Digestion`:
```markdown
## Digestion

**Gate 1 (Summarize):**
**Prompt:** Explain what you just read in one sentence.
**Response:** A database organizes data for fast querying...
**AI Feedback:** Good summary. You captured the core idea...
*(03/22/2026, 8:33 PM)*
```

## AI Router

The AI router lives in `src-tauri/src/ai.rs`. It routes requests to the configured provider:

- **Ollama** — POST to `{url}/api/generate` (local, free, private)
- **Claude** — POST to `api.anthropic.com/v1/messages` (best quality)
- **Gemini** — POST to `generativelanguage.googleapis.com` (fast, free tier)
- **None** — graceful degradation, all AI features skip silently

**All AI calls go through one Tauri command:**
```rust
#[tauri::command]
async fn ai_request_cmd(
    state: tauri::State<'_, AppState>,
    system_prompt: String,
    user_prompt: String,
    max_tokens: u32,
) -> Result<ai::AiResponse, String>
```

The frontend calls `aiRequest()` from `src/lib/tauri.ts`. The frontend never talks to AI directly.

**Config** is stored in `~/Encode/.encode/config.toml`:
```toml
[ai]
provider = "ollama"
ollama_model = "llama3.1:8b"
ollama_url = "http://localhost:11434"
api_key = ""
```

**Popular local models** (shown in Settings dropdown):
llama3.1:8b, deepseek-r1:8b, deepseek-coder-v2:16b, mistral:7b, phi3:latest, gemma2:9b, qwen2.5:7b

## Key Features — Current Implementation

### Vault Editor (CodeMirror 6 — Obsidian-style)

The vault editor uses CodeMirror 6 with custom live preview decorations:

- **Always editable** — click anywhere and type, no separate Preview/Edit modes
- **Live preview decorations** — `##` markers hidden when cursor is away, shown when cursor enters the line (Obsidian behavior)
- **Bold/italic** — `**` and `*` markers hidden when cursor is elsewhere
- **Links** — `[text](url)` shows as styled link text, raw syntax on cursor focus
- **Autosave** — debounced write 1 second after typing stops
- **Source mode** — toggle button for raw markdown + YAML editing
- **Dark theme** — custom CM6 theme matching Encode palette
- **Font size** — configurable in Settings (Small/Medium/Large), stored in localStorage

Key files: `src/components/shared/MarkdownEditor.tsx`, `src/lib/cm-theme.ts`, `src/lib/cm-decorations.ts`

### URL Import

Rust backend fetches HTML, converts to markdown via regex-based `html_to_markdown()` in `src-tauri/src/importer.rs`. Saves with frontmatter including `type: chapter`, `created_at`, `source_url`.

### Digestion Gates

The reader shows content section by section. At each section boundary:

1. Gate activates — next section hidden
2. Rotating prompt shown (summarize, connect, predict, apply)
3. User types free-text response (generation effect)
4. AI evaluates response: what's right, what's missing, one deeper question
5. Response + AI feedback saved to `## Digestion` in the markdown file
6. AI auto-suggests 1-2 flashcards from the section content
7. Next section revealed

Gate prompts rotate through Bloom levels for progressive difficulty.

### Spaced Repetition (FSRS)

**Primary algorithm: FSRS (Free Spaced Repetition Scheduler)** — replaces SM-2.
- 89.6% recall prediction accuracy (vs SM-2's 47.1%)
- Three Component Model: Retrievability, Stability, Difficulty
- Default FSRS-5 parameters from open-source benchmarks
- SM-2 cards auto-migrate to FSRS on first review

Implementation in `src/lib/sr.ts`. Both `sm2()` and `fsrs()` functions available.

**Flashcard review flow:**
1. Dashboard shows "X Cards Due"
2. Cards loaded from `sr_schedule` DB table + parsed from markdown files
3. Show question → user recalls → reveal answer → rate (Again/Hard/Good/Easy)
4. FSRS computes next interval + updates Stability/Difficulty
5. Both DB and markdown file updated with new schedule

**Flashcard creation:**
- "+ Card" panel in Reader with AI Suggest button
- Auto-suggested cards after completing digestion gates
- New Card form on Flashcards page (pick subject/topic)
- Cards saved to `subjects/{subject}/flashcards/{topic}.md`

### Quiz System

AI generates quiz questions from chapter content at target Bloom levels.

- **Question types:** Currently free-recall (planned: multiple choice, fill-in-blank, true/false)
- **AI evaluation:** Each answer evaluated for correctness + feedback
- **Results saved** to `subjects/{subject}/quizzes/{topic}-{date}.md`
- **Entry points:** Quiz button in Vault header, "Quiz This Chapter" on Reader completion

### Teach-Back (Feynman Technique)

User explains a topic in simple terms. AI evaluates:
- Accuracy
- Simplicity (flags unexplained jargon)
- Concrete examples used
- Knowledge gaps

Saved to `subjects/{subject}/teach-backs/{topic}-{date}.md`

### Dashboard

Home page shows:
- Cards Due count (coral if > 0)
- Subject count
- Day Streak
- "Start Review" button → Flashcards page
- One Thing daily commitment below

### Quick Switcher

`Cmd+O` opens a floating fuzzy-search modal over all vault files. Shows file type icons, subject badges, keyboard navigation (arrows + enter + escape).

### Slash Commands

Type `/` at the start of a line in the Source editor to insert:
- `/table` — markdown table template
- `/heading` — ## heading
- `/code` — fenced code block
- `/mermaid` — mermaid diagram template
- `/card` — flashcard callout template
- `/callout` — note/tip/warning callout

## UI Architecture

### Layout: Ribbon + Sidebar + Content

```
[Ribbon 48px] [Sidebar 260px] [Content Area]
```

- **Ribbon** — far-left icon strip (Lucide icons): Dashboard, Vault, Flashcards, Quiz, Teach Back, Settings. Includes sidebar toggle button.
- **Sidebar** — file browser with search + URL import. Only visible on Vault page by default. Collapsible via Ribbon button or `Cmd+\`.
- **Content** — main area: CM6 editor (Vault), Reader, Flashcard review, Quiz, etc.

### Colors
```
Background:   #0f0f0f
Surface:      #1a1a1a
Surface 2:    #252525
Border:       #333333
Text:         #e5e5e5
Text muted:   #888880
Purple:       #7F77DD  (primary actions, encoding)
Teal:         #1D9E75  (success, retrieval)
Coral:        #D85A30  (emphasis, important)
Amber:        #BA7517  (warnings, attention)
```

### Typography
- UI: Inter, 14px base
- Editor/Reader content: Georgia/Merriweather serif, configurable size (14-18px)
- Code: JetBrains Mono or system monospace, 13px

### Key Components
- `src/components/layout/Ribbon.tsx` — icon navigation strip
- `src/components/layout/Shell.tsx` — layout wrapper with Ribbon + Sidebar + Quick Switcher
- `src/components/layout/Sidebar.tsx` — file browser panel with search
- `src/components/shared/MarkdownEditor.tsx` — CM6 editor wrapper
- `src/components/shared/MarkdownRenderer.tsx` — HTML rendering with DOMPurify + callout support
- `src/components/shared/QuickSwitcher.tsx` — Cmd+O file search modal
- `src/components/shared/SlashMenu.tsx` — / command palette for Source editor
- `src/components/vault/VaultBrowser.tsx` — subject/file tree with Lucide icons
- `src/components/reader/DigestionGate.tsx` — gate prompt UI
- `src/components/reader/ProgressBar.tsx` — consumption/digestion progress

### Stores (Zustand, split by domain)
- `src/stores/app.ts` — global app state, daily commitment, config
- `src/stores/vault.ts` — file browser, search, file selection
- `src/stores/reader.ts` — section-by-section reading, gate responses, AI suggestions
- `src/stores/flashcard.ts` — FSRS review, card creation, due count
- `src/stores/quiz.ts` — AI quiz generation, evaluation, results
- `src/stores/teachback.ts` — Feynman technique flow

### Pages
- `src/pages/Home.tsx` — Dashboard + One Thing
- `src/pages/Vault.tsx` — CM6 editor with properties panel + status bar
- `src/pages/Reader.tsx` — Section-by-section reader with gates
- `src/pages/Flashcards.tsx` — Dashboard/Review/All Cards tabs
- `src/pages/Quiz.tsx` — AI quiz flow
- `src/pages/TeachBack.tsx` — Feynman technique
- `src/pages/Settings.tsx` — AI provider, model picker, font size, index management

## Coding Standards

- TypeScript strict mode, zero `any`
- Functional components + hooks only
- Zustand stores split by domain
- Tauri commands return `Result<T, String>`
- All file writes go through the Rust backend (never write from frontend directly)
- All HTML rendered via DOMPurify — no raw `dangerouslySetInnerHTML` without sanitization
- All AI responses wrapped in try/catch with graceful degradation
- Path traversal protection: validate all file paths stay inside vault boundary

## Security

- DOMPurify sanitizes all rendered HTML (MarkdownRenderer + search excerpts)
- Path traversal validation in `vault.rs` (canonicalize + starts_with check)
- `write_file` rejects paths containing `..` components
- API keys stored in config.toml (planned: migrate to OS keychain)
- Gemini API errors sanitized to prevent key leakage in error messages
- `sr_schedule` entries cleaned up on file deletion

## Testing

- Vitest for unit tests (FSRS/SM-2 algorithm, markdown parsing, gate logic)
- `npx tsc --noEmit` — zero TypeScript errors required
- `cargo check` — Rust must compile clean
- Test every feature with AI provider set to `None` — graceful degradation required

## What NOT to Build

- No complex dashboard with charts and analytics
- No React Flow canvas (use mermaid in markdown)
- No audio recording
- No gamification (points, badges, XP, leaderboards) — research confirms this hurts learning
- No social features
- No cloud sync (files sync via git, Dropbox, iCloud, whatever the user prefers)
- No highlighting feature — research shows it creates illusion of competence
- No plugin system (yet) — app is purpose-built for the study loop

## Research Documents

- `research/obsidian-features.md` — 896 lines: Obsidian UX analysis, what to adopt/skip
- `research/how-to-learn.md` — 766 lines: evidence-based learning science driving every feature
- `research/gaps-and-priorities.md` — known issues and next priorities

## Context for Personalization

The primary developer and user (Samieh) is studying Data Analytics at WGU (D426 Data Management is current course). He manages 50+ gas station/convenience store locations — real-world analogies from this domain are highly relevant for his learning. He uses Claude Code, has Tauri 2.0 experience from prior projects, and prefers teach-then-quiz learning style.
