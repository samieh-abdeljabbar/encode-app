# CLAUDE.md — Development Instructions for Encode

## What This App Is

Encode is a Tauri 2.0 desktop app that makes you think harder about what you're learning. It's a study environment with a structured markdown vault. All knowledge is stored as plain `.md` files — the app reads, renders, and augments them but never locks them in.

**Core loop:** Import content → Read section by section → Digestion gate forces you to stop and think → AI coaches deeper connections → Quizzes test understanding → Flashcards maintain recall → Everything saved as markdown.

**AI is tiered:** Ollama (local, free) is the default. Claude/Gemini API is optional for higher quality. No AI mode still works for reading, gates, and flashcards.

## Tech Stack

- **Tauri 2.0** — Rust backend, system webview
- **React 18 + TypeScript** (strict mode) — Frontend
- **Tailwind CSS 4** — Styling, dark mode via `class` strategy
- **Zustand** — State management
- **SQLite** via `@tauri-apps/plugin-sql` — FTS5 index + scheduling only
- **Mozilla Readability** (JS) — Web page content extraction
- **mermaid.js** — Render diagrams inside markdown
- **marked** or **remark** — Markdown rendering

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
    └── config.toml              # Settings
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

**Wiki-links:** Use `[[filename]]` without extension. The app resolves these within the same subject folder. Obsidian-compatible format.

**Mermaid diagrams:** Fenced code blocks with `mermaid` language tag. Rendered visually in the reader.

**Flashcard blocks:** Use callout syntax for each card:
```markdown
> [!card] id: fc-001
> **Q:** Question text
> **A:** Answer text
> **Bloom:** 1-6
> **Ease:** 2.5
> **Interval:** 7
> **Next:** 2026-04-04
> **Last:** 2026-03-28
```

## AI Router

The AI router lives in `src-tauri/src/ai.rs`. It tries providers in order:

```rust
pub enum AIProvider {
    Ollama { model: String },      // default: llama3.1:8b
    Claude { api_key: String },     // claude-sonnet-4-20250514
    Gemini { api_key: String },     // gemini-2.0-flash
    None,                           // graceful degradation
}
```

Detection on startup:
1. Check `http://localhost:11434/api/tags` — if Ollama responds, it's available
2. Check config for Claude API key in system keychain
3. Check config for Gemini API key in system keychain
4. Fall back to None

**All AI calls go through one Tauri command:**
```rust
#[tauri::command]
async fn ai_request(
    provider: AIProvider,
    system_prompt: String,
    user_prompt: String,
    max_tokens: u32,
) -> Result<String, String>
```

The frontend never talks to AI directly. Everything goes through the Rust backend.

## Key Features — Implementation Notes

### Bookmarklet Import Server

Tauri Rust backend starts a tiny HTTP server on `localhost:7878`:

```rust
// POST /import { "url": "https://..." }
// 1. Fetch the URL
// 2. Run readability extraction
// 3. Convert to markdown with frontmatter
// 4. Save to vault: subjects/{subject}/chapters/{slug}.md
// 5. Return file path
// 6. Frontend opens the file in reader
```

The Readability library runs in the frontend webview (it's JS). The Rust backend fetches the HTML, passes it to the frontend for extraction, gets clean content back, and writes the markdown file.

### Digestion Gates

The reader tracks which section the user is viewing. When they reach the end of a section and try to advance:

1. Gate activates — next section is hidden
2. Prompt shown (rotate: summarize, connect, predict, apply)
3. User types response in text area
4. If AI available: evaluate response quality, show feedback
5. If no AI: accept any non-empty response
6. Response + feedback appended to the markdown file under a `## Digestion` heading
7. Next section revealed

Gate prompts should reference prior knowledge when possible. Use FTS5 to find related notes in the vault and include them in the prompt context.

### Vault Search (FTS5)

On startup and on file change (use `notify` crate for file watching):
1. Scan all `.md` files in vault
2. Parse frontmatter + content
3. Upsert into `vault_fts` and `file_index` tables

Search query:
```sql
SELECT file_path, subject, topic,
       snippet(vault_fts, 3, '<mark>', '</mark>', '...', 30) as excerpt
FROM vault_fts
WHERE vault_fts MATCH ?
ORDER BY rank
LIMIT 20
```

### Spaced Repetition

Use SM-2 algorithm. Implementation in `src/lib/sr.ts`:

```typescript
function sm2(ease: number, interval: number, quality: number) {
  // quality: 0=Again, 3=Hard, 4=Good, 5=Easy
  if (quality < 3) {
    return { interval: 1, ease: Math.max(1.3, ease - 0.2) };
  }
  const newInterval = interval === 0 ? 1
    : interval === 1 ? 6
    : Math.round(interval * ease);
  const newEase = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return { interval: newInterval, ease: Math.max(1.3, newEase) };
}
```

After review, update the card's metadata directly in the markdown file. Also update the `sr_schedule` SQLite table for fast "due today" queries.

### Quiz Adaptive Difficulty

Track Bloom's level performance in `quiz_history` table:
```sql
SELECT bloom_level,
       COUNT(*) as attempts,
       SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct_count,
       ROUND(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / COUNT(*)) as pct
FROM quiz_history
WHERE subject = ?
GROUP BY bloom_level
ORDER BY bloom_level
```

Target quiz generation at one level above the highest level with >70% accuracy.

## UI Guidelines

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
- UI: system sans-serif, 14px base
- Reader content: serif (Georgia, Merriweather), 17px, line-height 1.8
- Code/technical: JetBrains Mono or system monospace, 13px

### Layout
- Sidebar: 220px, collapsible to icons
- Reader: Single column, max-width 720px centered (optimal reading width)
- Gates: Slide up from bottom of reader, push content up
- Coach: Slide-over panel from right side

### Patterns
- Toast notifications for non-blocking feedback
- All destructive actions require confirmation
- Loading states on every AI call (they take 1-5 seconds)
- Keyboard shortcuts shown in tooltips

## Coding Standards

- TypeScript strict mode, zero `any`
- Functional components + hooks only
- Zustand stores split by domain
- Tauri commands return `Result<T, String>`
- All file writes go through the Rust backend (never write from frontend directly)
- Markdown parsing: use gray-matter for frontmatter, marked for HTML
- All AI responses validated before display (try/catch JSON parsing, check expected fields)
- Components under 150 lines — extract hooks for logic

## Testing

- Vitest for unit tests (SR algorithm, markdown parsing, Bloom's utilities)
- Test every feature with AI provider set to `None` — graceful degradation is required
- Mock AI responses in tests

## What NOT to Build

- No complex dashboard with charts and analytics
- No React Flow canvas (use mermaid in markdown)
- No audio recording
- No RAIL stage UI
- No PACER classification UI (auto-classify or skip)
- No gamification (points, badges, XP, leaderboards)
- No social features
- No cloud sync (files sync via git, Dropbox, iCloud, whatever the user prefers)

## Context for Personalization

The primary developer and user (Samieh) is studying Data Analytics at WGU (D426 Data Management is current course). He manages 50+ gas station/convenience store locations — real-world analogies from this domain are highly relevant for his learning. He uses Claude Code with ultrathink, has Tauri 2.0 experience from prior projects, and prefers teach-then-quiz learning style.