# Encode

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="Encode" width="128" height="128" />
</p>

<p align="center">
  A desktop study environment that makes you think harder about what you're learning.<br/>
  Built with Tauri 2.0 &mdash; all your knowledge lives as plain markdown files you own forever.
</p>

---

Encode isn't a note-taking app. It's a structured learning system backed by cognitive science research: spaced repetition, retrieval practice, elaborative interrogation, and the Feynman technique. Import content, read it section by section, prove you understood it, then review it on a schedule. Everything saves as markdown. Delete the database and it rebuilds from your files. Zero lock-in.

## Download

**Current version: v0.9.1**

Grab the latest release from [Releases](https://github.com/samieh-abdeljabbar/encode-app/releases/latest).

| Platform | Formats |
|----------|---------|
| macOS | `.dmg` (Apple Silicon & Intel) |
| Windows | `.exe` installer or `.msi` |
| Linux | `.AppImage`, `.deb`, `.rpm` |

> **macOS first launch:** Right-click the app, click Open, then Open again (bypasses Gatekeeper).
> **Windows first launch:** Click "More info", then "Run anyway" (bypasses SmartScreen).

---

## How to Use Encode

### 1. Set Up Your AI Provider (Optional)

Open **Settings** (gear icon at the bottom of the left ribbon) and pick an AI provider. AI powers digestion feedback, quiz generation, teach-back evaluation, and flashcard suggestions. Everything except quizzes works without AI.

| Provider | Cost | Setup |
|----------|------|-------|
| **Ollama** (default) | Free | Install [Ollama](https://ollama.com), pull a model (`ollama pull llama3.1:8b`), enter `http://localhost:11434` in Settings |
| **Claude API** | Paid | Paste your Anthropic API key, pick a model |
| **Gemini API** | Free tier | Paste your Google AI API key, pick a model |
| **DeepSeek API** | Paid | Paste your API key |
| **Custom CLI** | Varies | Point to any command-line tool that accepts prompts |
| **None** | Free | Toggle off. Gates still prompt you to think, flashcards still schedule, quizzes require AI |

Use the **Test Connection** button to verify your provider is working before you start studying.

For detailed local AI setup, see [LOCAL-AI-SETUP.md](LOCAL-AI-SETUP.md).

### 2. Create a Subject and Import Content

1. Open the **Vault** (book icon in the ribbon).
2. Click the **+** button in the sidebar to create a new subject (e.g., "Data Management").
3. Click the **URL** button in the sidebar to import a web page, or create a new chapter manually.
4. Imported content is converted to markdown with frontmatter and saved to your vault.

### 3. Read with Digestion Gates

Open any chapter and click **Read** to enter the Reader.

- Content is revealed **one section at a time**.
- At each section boundary, a **digestion gate** activates. You cannot advance until you engage.
- Gates ask you to **summarize**, **connect** to prior knowledge, **predict** what comes next, or **apply** the concept. Each gate asks 2-3 questions at progressive difficulty.
- AI evaluates your response and gives mastery feedback (Needs work / Partial / Solid / Excellent).
- If your answers are strong, remaining questions skip automatically.
- After each gate, AI suggests 1-2 flashcards from the section. Accept, edit, or dismiss them.
- After all sections, a **synthesis step** asks you to connect the chapter's key ideas into a throughline.

Gates and synthesis responses are saved directly into the chapter's markdown file under `## Digestion` and `## Synthesis`. Close and reopen the chapter and your progress is preserved.

**Reader shortcuts:**
| Key | Action |
|-----|--------|
| `Right arrow` or `Space` | Next section |
| `Left arrow` or `Backspace` | Previous section |
| `Cmd+Enter` | Submit gate response |
| `Esc` | Exit reader |

### 4. Review Flashcards

Open **Flashcards** (cards icon in the ribbon).

- The dashboard shows how many cards are **due today**.
- Click **Start Review** to begin.
- Each card shows the question. Think of the answer, then reveal it.
- Rate your recall: **Again** (forgot) / **Hard** / **Good** / **Easy**.
- FSRS calculates the next review date based on your rating, the card's stability, and its difficulty.
- Cards come from three sources:
  - AI-suggested cards accepted during reading
  - Cards you create manually (click **New Card**)
  - Cards auto-generated from wrong quiz answers

**Card types:**
- **Basic** - question and answer
- **Cloze** - fill-in-the-blank using `{{bracketed}}` text
- **Reversed** - creates both Q-to-A and A-to-Q cards

### 5. Take Quizzes

Open **Quiz** (checklist icon in the ribbon).

1. Select a subject and topic.
2. Choose question types: multiple choice, true/false, fill-in-blank, free recall, or code problems.
3. Set difficulty (Bloom levels 1-6 or adaptive).
4. AI generates questions from your chapter content.
5. Answer each question. Free-recall and code answers are evaluated by AI.
6. After the quiz, review your score, per-question feedback, and a summary of concepts to revisit.
7. Wrong answers are automatically turned into flashcards so they come back in review.

Quiz results are saved as markdown files in `subjects/{subject}/quizzes/`.

### 6. Teach It Back

Open **Teach-Back** (presentation icon in the ribbon).

1. Select a subject and topic.
2. Explain the topic in your own words, as if teaching someone who knows nothing about it.
3. AI evaluates your explanation for:
   - **Accuracy** - did you get the facts right?
   - **Simplicity** - did you avoid unexplained jargon?
   - **Completeness** - did you cover the key points?
   - **Depth** - a follow-up question to push you further
4. Click **Save** to persist the explanation and evaluation to your vault.

### 7. Track Your Progress

The **Home** dashboard shows:
- **Cards due** today
- **Subject count** and **day streak**
- **Study time** tracked by the Pomodoro timer
- **Subject grades** based on quiz scores
- **At-risk cards** about to lapse
- **Smart recommendations** for what to study next

The **Progress** page shows per-subject mastery scores (weighted: 40% chapters read, 40% quiz score, 20% card retention) and a test-readiness indicator.

### 8. Use the Pomodoro Timer

The timer lives in the bottom of the sidebar (Vault page).

- Pick a study duration (defaults: 25, 30, 45, or 60 minutes) or set custom durations in Settings.
- Select a subject to log time against.
- Work through study/break/long-break cycles.
- Study time is tracked per subject and visible on the dashboard.

### 9. Write and Edit in the Vault

The vault editor is an Obsidian-style CodeMirror 6 editor:

- **Live preview** - heading markers, bold/italic syntax, and links are hidden when your cursor is elsewhere; raw syntax appears when you click into a line.
- **Toolbar** - bold, italic, strikethrough, highlight, links, lists, indent/outdent.
- **Slash commands** - type `/` at the start of a line: `/table`, `/heading`, `/code`, `/mermaid`, `/card`, `/callout`.
- **Source mode** - toggle to edit raw markdown and YAML frontmatter directly.
- **Auto-save** - changes save automatically 1 second after you stop typing.
- **Wiki-links** - use `[[filename]]` to link between files. Click to navigate.

**Editor shortcuts:**
| Key | Action |
|-----|--------|
| `Cmd+O` | Quick Switcher (fuzzy search all files) |
| `Cmd+\` | Toggle sidebar |
| `Cmd+Shift+F` | Focus vault search |
| `Cmd+=` | Zoom in |
| `Cmd+-` | Zoom out |
| `Cmd+0` | Reset zoom |
| `?` | Show all shortcuts |

### 10. Customize Appearance

In **Settings**, you can configure:

- **Theme** - multiple built-in color themes
- **Fonts** - separate controls for UI font, reading/content font, and monospace font
- **Font size** - adjustable from 10px to 24px
- **Content width** - small, medium, or large

---

## The Learning Loop

```
Import content
    |
    v
Read section by section
    |
    v
Digestion gate: stop, think, respond
    |
    v
AI feedback + flashcard suggestions
    |
    v
Advance to next section (repeat)
    |
    v
Chapter synthesis: connect the throughline
    |
    v
Quiz: test retrieval at Bloom levels
    |
    v
Teach-back: explain it simply
    |
    v
Spaced review: flashcards on schedule
    |
    v
(loop back as cards come due)
```

The core idea: you cannot move forward until you've engaged with what you just read. Passive reading is not an option.

---

## Vault Structure

All data lives in `~/Encode/` as plain markdown:

```
~/Encode/
├── subjects/
│   └── {subject}/
│       ├── _subject.md          # Subject metadata
│       ├── chapters/            # Imported + digested content
│       ├── flashcards/          # Cards with FSRS scheduling data
│       ├── quizzes/             # Quiz sessions with results
│       ├── teach-backs/         # Feynman explanations + evaluation
│       └── maps/                # Mermaid diagrams
├── daily/                       # Daily commitments
├── captures/                    # Quick thoughts
└── .encode/
    ├── encode.db                # SQLite index (rebuildable from files)
    └── config.toml              # AI provider, model, API key
```

Every flashcard, quiz result, digestion response, and teach-back is a markdown file with YAML frontmatter. If you delete `encode.db`, the app rebuilds its index from the files on next launch. You can sync your vault with git, Dropbox, iCloud, or anything that moves files.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri 2.0 (Rust backend, system webview) |
| Frontend | React 18 + TypeScript (strict mode) |
| Styling | Tailwind CSS 4 |
| State | Zustand (domain-split stores) |
| Editor | CodeMirror 6 with custom live preview decorations |
| Database | SQLite via rusqlite (bundled) &mdash; index and cache only |
| Markdown | marked + DOMPurify |
| Spaced Repetition | FSRS (Free Spaced Repetition Scheduler) |
| Icons | Lucide React |
| Fonts | Inter, Literata, Source Serif 4, IBM Plex Sans, JetBrains Mono, Manrope |

---

## Build from Source

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20+ |
| Rust | 1.77.2+ |
| Tauri CLI | 2.0+ |
| Platform deps | See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |

**Linux (Ubuntu/Debian) additional packages:**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### Setup

```bash
# Clone the repo
git clone https://github.com/samieh-abdeljabbar/encode-app.git
cd encode-app

# Install frontend dependencies
npm install

# Run in development (hot reload)
npm run tauri dev

# Build for production
npm run tauri build
```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend only, port 5173) |
| `npm run tauri dev` | Full app with hot reload |
| `npm run tauri build` | Production build with platform installers |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npx tsc --noEmit` | Type-check without emitting |
| `cargo check` | Check Rust backend compiles |

Production builds output to `src-tauri/target/release/bundle/`.

---

## Releases

Releases are built automatically by GitHub Actions when a version tag (`v*`) is pushed. The CI builds for macOS (ARM64 + Intel), Windows, and Linux, then creates a GitHub release with platform-specific installers.

---

## Philosophy

This app exists because most study tools optimize for the wrong things. Highlighting creates an illusion of competence. Passive re-reading doesn't build durable memory. Gamification (points, streaks, badges) shifts motivation from learning to score-chasing.

Encode is built on evidence from cognitive science:

- **Retrieval practice** over re-reading
- **Spaced repetition** over cramming
- **Elaborative interrogation** over highlighting
- **The generation effect** &mdash; producing answers beats recognizing them
- **The Feynman technique** &mdash; if you can't explain it simply, you don't understand it

The digestion gate is the core mechanic: you cannot move forward until you've engaged with what you just read. That friction is the point.
