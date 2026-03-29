# Reader Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Reader page — the core study surface where learners read chapter sections, answer comprehension checks via self-assessment, create repair cards from gaps, and complete chapter synthesis.

**Architecture:** Migration adds `status` column to `chapter_sections`. A new Rust service (`services/reader.rs`) handles session loading, check processing, repair card creation, and prompt generation. Three new Tauri commands expose this via IPC. The React frontend is a single-column focused Reader page with 5 small components.

**Tech Stack:** Rust (rusqlite, serde, Tauri 2), React 18, TypeScript, Tailwind CSS 4, marked + DOMPurify for markdown rendering

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/migrations/002_section_status.sql` | Create | Add `status` column to `chapter_sections` |
| `src-tauri/src/db/migrations.rs` | Modify | Register migration 002 |
| `src-tauri/src/services/reader.rs` | Create | Reader business logic (session, check, synthesis, prompts) |
| `src-tauri/src/services/mod.rs` | Modify | Export reader module |
| `src-tauri/src/commands/reader.rs` | Create | 3 Tauri IPC commands |
| `src-tauri/src/commands/mod.rs` | Modify | Export reader module |
| `src-tauri/src/lib.rs` | Modify | Register reader commands |
| `src/lib/tauri.ts` | Modify | Add reader IPC wrappers + types |
| `src/pages/Reader.tsx` | Create | Reader page orchestrator |
| `src/components/reader/ReaderHeader.tsx` | Create | Back button, title, progress |
| `src/components/reader/ReaderContent.tsx` | Create | Markdown section renderer |
| `src/components/reader/DigestionGate.tsx` | Create | Self-check flow UI |
| `src/components/reader/SynthesisPanel.tsx` | Create | End-of-chapter synthesis |
| `src/components/reader/ProgressBar.tsx` | Create | Section progress indicator |
| `src/App.tsx` | Modify | Replace Reader placeholder with real component |

---

### Task 1: Database Migration — Add Section Status

**Files:**
- Create: `src-tauri/migrations/002_section_status.sql`
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Create migration SQL**

Create `src-tauri/migrations/002_section_status.sql`:

```sql
-- Add status tracking to chapter sections for reader progression
ALTER TABLE chapter_sections ADD COLUMN status TEXT NOT NULL DEFAULT 'unseen'
  CHECK(status IN ('unseen', 'seen', 'checked_correct', 'checked_partial', 'checked_off_track'));
```

- [ ] **Step 2: Register migration in migrations.rs**

In `src-tauri/src/db/migrations.rs`, add the new migration to the `MIGRATIONS` array:

```rust
const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../../migrations/001_foundation.sql")),
    (2, include_str!("../../migrations/002_section_status.sql")),
];
```

- [ ] **Step 3: Verify migration applies**

Run: `cargo test`
Expected: All existing tests pass. The migration runner applies version 2 on fresh DBs.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/migrations/002_section_status.sql src-tauri/src/db/migrations.rs
git commit -m "feat: add section status column for reader progression (migration 002)"
```

---

### Task 2: Reader Service — Business Logic

**Files:**
- Create: `src-tauri/src/services/reader.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Create reader service with types**

Create `src-tauri/src/services/reader.rs`:

```rust
use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize)]
pub struct ReaderChapter {
    pub id: i64,
    pub title: String,
    pub status: String,
    pub estimated_minutes: Option<i64>,
}

#[derive(Serialize)]
pub struct ReaderSection {
    pub id: i64,
    pub section_index: i32,
    pub heading: Option<String>,
    pub body_markdown: String,
    pub word_count: i32,
    pub status: String,
    pub prompt: String,
}

#[derive(Serialize)]
pub struct ReaderSession {
    pub chapter: ReaderChapter,
    pub sections: Vec<ReaderSection>,
    pub current_index: i32,
}

#[derive(Serialize)]
pub struct CheckResult {
    pub outcome: String,
    pub can_retry: bool,
    pub repair_card_created: bool,
    pub chapter_complete: bool,
}

#[derive(Serialize)]
pub struct SynthesisResult {
    pub success: bool,
    pub new_status: String,
}

pub fn generate_prompt(heading: &Option<String>, body: &str) -> String {
    let text = format!(
        "{} {}",
        heading.as_deref().unwrap_or(""),
        &body[..body.len().min(400)]
    )
    .to_lowercase();

    if text.contains("step") || text.contains("process") || text.contains("procedure") || text.contains("how to") {
        "What are the main steps or process described in this section?".to_string()
    } else if text.contains(" vs ") || text.contains("compar") || text.contains("difference") || text.contains("distinguish") {
        "What are the key differences or similarities discussed?".to_string()
    } else if text.contains("define") || text.contains("definition") || text.contains("meaning") || text.contains("concept") {
        "Explain the key concept from this section in your own words.".to_string()
    } else {
        "Summarize the main idea of this section in 2-3 sentences.".to_string()
    }
}

pub fn get_reader_session(conn: &Connection, chapter_id: i64) -> Result<ReaderSession, String> {
    let chapter = conn
        .query_row(
            "SELECT id, title, status, estimated_minutes FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| {
                Ok(ReaderChapter {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    status: row.get(2)?,
                    estimated_minutes: row.get(3)?,
                })
            },
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, section_index, heading, body_markdown, word_count, status
             FROM chapter_sections WHERE chapter_id = ?1
             ORDER BY section_index",
        )
        .map_err(|e| e.to_string())?;

    let sections: Vec<ReaderSection> = stmt
        .query_map([chapter_id], |row| {
            let heading: Option<String> = row.get(2)?;
            let body: String = row.get(3)?;
            let prompt = generate_prompt(&heading, &body);
            Ok(ReaderSection {
                id: row.get(0)?,
                section_index: row.get(1)?,
                heading,
                body_markdown: body,
                word_count: row.get(4)?,
                status: row.get(5)?,
                prompt,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let current_index = sections
        .iter()
        .find(|s| s.status == "unseen" || s.status == "seen")
        .map(|s| s.section_index)
        .unwrap_or(0);

    Ok(ReaderSession {
        chapter,
        sections,
        current_index,
    })
}

pub fn mark_section_seen(conn: &Connection, chapter_id: i64, section_index: i32) -> Result<(), String> {
    conn.execute(
        "UPDATE chapter_sections SET status = 'seen' WHERE chapter_id = ?1 AND section_index = ?2 AND status = 'unseen'",
        rusqlite::params![chapter_id, section_index],
    )
    .map_err(|e| e.to_string())?;

    // Transition chapter to 'reading' if still 'new'
    conn.execute(
        "UPDATE chapters SET status = 'reading', updated_at = datetime('now') WHERE id = ?1 AND status = 'new'",
        [chapter_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn process_check(
    conn: &Connection,
    chapter_id: i64,
    section_index: i32,
    response: &str,
    self_rating: &str,
) -> Result<CheckResult, String> {
    // Get current section status
    let current_status: String = conn
        .query_row(
            "SELECT status FROM chapter_sections WHERE chapter_id = ?1 AND section_index = ?2",
            rusqlite::params![chapter_id, section_index],
            |row| row.get(0),
        )
        .map_err(|e| format!("Section not found: {e}"))?;

    let mut can_retry = false;
    let mut repair_card_created = false;

    match self_rating {
        "correct" => {
            conn.execute(
                "UPDATE chapter_sections SET status = 'checked_correct' WHERE chapter_id = ?1 AND section_index = ?2",
                rusqlite::params![chapter_id, section_index],
            ).map_err(|e| e.to_string())?;
        }
        "partial" => {
            if current_status == "seen" {
                // First attempt partial — allow retry
                can_retry = true;
                // Keep status as 'seen' so they can retry
            } else {
                // Second attempt or already checked — finalize
                conn.execute(
                    "UPDATE chapter_sections SET status = 'checked_partial' WHERE chapter_id = ?1 AND section_index = ?2",
                    rusqlite::params![chapter_id, section_index],
                ).map_err(|e| e.to_string())?;
            }
        }
        "off_track" => {
            conn.execute(
                "UPDATE chapter_sections SET status = 'checked_off_track' WHERE chapter_id = ?1 AND section_index = ?2",
                rusqlite::params![chapter_id, section_index],
            ).map_err(|e| e.to_string())?;

            // Create repair card
            let heading: Option<String> = conn
                .query_row(
                    "SELECT heading FROM chapter_sections WHERE chapter_id = ?1 AND section_index = ?2",
                    rusqlite::params![chapter_id, section_index],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            let subject_id: i64 = conn
                .query_row(
                    "SELECT subject_id FROM chapters WHERE id = ?1",
                    [chapter_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            let prompt = format!(
                "Review: {}",
                heading.as_deref().unwrap_or("this section")
            );

            conn.execute(
                "INSERT INTO cards (subject_id, chapter_id, source_type, prompt, answer, card_type, status, created_at)
                 VALUES (?1, ?2, 'repair', ?3, ?4, 'basic', 'active', datetime('now'))",
                rusqlite::params![subject_id, chapter_id, prompt, response],
            ).map_err(|e| e.to_string())?;

            let card_id = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
                 VALUES (?1, datetime('now'), 1.0, 5.0, 0, 0)",
                [card_id],
            ).map_err(|e| e.to_string())?;

            repair_card_created = true;
        }
        _ => return Err(format!("Invalid self_rating: {self_rating}")),
    }

    // Log study event
    let subject_id: i64 = conn
        .query_row("SELECT subject_id FROM chapters WHERE id = ?1", [chapter_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "section_index": section_index,
        "rating": self_rating,
        "response_length": response.len(),
    });

    conn.execute(
        "INSERT INTO study_events (subject_id, chapter_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, 'section_check_submitted', ?3, datetime('now'))",
        rusqlite::params![subject_id, chapter_id, payload.to_string()],
    ).map_err(|e| e.to_string())?;

    // Check if all sections are done
    let unchecked_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = ?1 AND status IN ('unseen', 'seen')",
            [chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let chapter_complete = unchecked_count == 0 && !can_retry;

    if chapter_complete {
        conn.execute(
            "UPDATE chapters SET status = 'awaiting_synthesis', updated_at = datetime('now') WHERE id = ?1",
            [chapter_id],
        ).map_err(|e| e.to_string())?;
    }

    Ok(CheckResult {
        outcome: self_rating.to_string(),
        can_retry,
        repair_card_created,
        chapter_complete,
    })
}

pub fn process_synthesis(conn: &Connection, chapter_id: i64, _synthesis_text: &str) -> Result<SynthesisResult, String> {
    // Verify chapter is awaiting synthesis
    let current_status: String = conn
        .query_row("SELECT status FROM chapters WHERE id = ?1", [chapter_id], |row| row.get(0))
        .map_err(|e| format!("Chapter not found: {e}"))?;

    if current_status != "awaiting_synthesis" {
        return Err(format!("Chapter is not awaiting synthesis (current: {current_status})"));
    }

    conn.execute(
        "UPDATE chapters SET status = 'ready_for_quiz', updated_at = datetime('now') WHERE id = ?1",
        [chapter_id],
    ).map_err(|e| e.to_string())?;

    // Log study event
    let subject_id: i64 = conn
        .query_row("SELECT subject_id FROM chapters WHERE id = ?1", [chapter_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO study_events (subject_id, chapter_id, event_type, created_at)
         VALUES (?1, ?2, 'synthesis_completed', datetime('now'))",
        rusqlite::params![subject_id, chapter_id],
    ).map_err(|e| e.to_string())?;

    Ok(SynthesisResult {
        success: true,
        new_status: "ready_for_quiz".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_test_db() -> Database {
        let db = Database::open_memory().expect("Failed to open test DB");
        db.with_conn(|conn| {
            crate::db::migrations::run_all(conn);
            // Insert test subject
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('test', 'Test Subject', datetime('now'))",
                [],
            ).unwrap();
            // Insert test chapter
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, created_at, updated_at)
                 VALUES (1, 'Test Chapter', 'test-chapter', 'new', datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            // Insert test sections
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (1, 0, 'Introduction', 'This is the intro.', 4, 'unseen')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (1, 1, 'Steps to follow', 'Step 1: do this. Step 2: do that.', 8, 'unseen')",
                [],
            ).unwrap();
        });
        db
    }

    #[test]
    fn test_generate_prompt_procedural() {
        let prompt = generate_prompt(&Some("Steps to follow".to_string()), "Step 1: do this.");
        assert!(prompt.contains("steps or process"));
    }

    #[test]
    fn test_generate_prompt_comparison() {
        let prompt = generate_prompt(&Some("X vs Y".to_string()), "Comparing two approaches.");
        assert!(prompt.contains("differences or similarities"));
    }

    #[test]
    fn test_generate_prompt_definition() {
        let prompt = generate_prompt(&Some("Definition of Entropy".to_string()), "The definition is...");
        assert!(prompt.contains("key concept"));
    }

    #[test]
    fn test_generate_prompt_default() {
        let prompt = generate_prompt(&Some("Overview".to_string()), "General content here.");
        assert!(prompt.contains("Summarize"));
    }

    #[test]
    fn test_load_session() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            let session = get_reader_session(conn, 1).unwrap();
            assert_eq!(session.chapter.title, "Test Chapter");
            assert_eq!(session.sections.len(), 2);
            assert_eq!(session.current_index, 0);
            assert_eq!(session.sections[0].status, "unseen");
        });
    }

    #[test]
    fn test_mark_seen_transitions_chapter() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let status: String = conn.query_row(
                "SELECT status FROM chapters WHERE id = 1", [], |row| row.get(0)
            ).unwrap();
            assert_eq!(status, "reading");
        });
    }

    #[test]
    fn test_check_correct_advances() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let result = process_check(conn, 1, 0, "my answer", "correct").unwrap();
            assert_eq!(result.outcome, "correct");
            assert!(!result.can_retry);
            assert!(!result.repair_card_created);
        });
    }

    #[test]
    fn test_check_partial_allows_retry_once() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let r1 = process_check(conn, 1, 0, "partial answer", "partial").unwrap();
            assert!(r1.can_retry);

            let r2 = process_check(conn, 1, 0, "better answer", "partial").unwrap();
            assert!(!r2.can_retry);
        });
    }

    #[test]
    fn test_check_off_track_creates_repair_card() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            let result = process_check(conn, 1, 0, "wrong answer", "off_track").unwrap();
            assert!(result.repair_card_created);

            let card_count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM cards WHERE chapter_id = 1 AND source_type = 'repair'",
                [], |row| row.get(0)
            ).unwrap();
            assert_eq!(card_count, 1);
        });
    }

    #[test]
    fn test_all_sections_checked_triggers_synthesis() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            mark_section_seen(conn, 1, 1).unwrap();
            process_check(conn, 1, 0, "answer", "correct").unwrap();
            let result = process_check(conn, 1, 1, "answer", "correct").unwrap();
            assert!(result.chapter_complete);

            let status: String = conn.query_row(
                "SELECT status FROM chapters WHERE id = 1", [], |row| row.get(0)
            ).unwrap();
            assert_eq!(status, "awaiting_synthesis");
        });
    }

    #[test]
    fn test_synthesis_transitions_to_ready_for_quiz() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            // Complete all sections first
            mark_section_seen(conn, 1, 0).unwrap();
            mark_section_seen(conn, 1, 1).unwrap();
            process_check(conn, 1, 0, "a", "correct").unwrap();
            process_check(conn, 1, 1, "a", "correct").unwrap();

            let result = process_synthesis(conn, 1, "My synthesis").unwrap();
            assert!(result.success);
            assert_eq!(result.new_status, "ready_for_quiz");
        });
    }

    #[test]
    fn test_study_events_logged() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            mark_section_seen(conn, 1, 0).unwrap();
            process_check(conn, 1, 0, "answer", "correct").unwrap();

            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM study_events WHERE event_type = 'section_check_submitted'",
                [], |row| row.get(0)
            ).unwrap();
            assert_eq!(count, 1);
        });
    }
}
```

- [ ] **Step 2: Export reader module**

Add to `src-tauri/src/services/mod.rs`:

```rust
pub mod reader;
```

- [ ] **Step 3: Run Rust tests**

Run: `cargo test`
Expected: All existing tests + 11 new reader tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/reader.rs src-tauri/src/services/mod.rs
git commit -m "feat: add reader service with session loading, checks, repair cards, and prompts"
```

---

### Task 3: Reader Commands — Tauri IPC

**Files:**
- Create: `src-tauri/src/commands/reader.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create reader commands**

Create `src-tauri/src/commands/reader.rs`:

```rust
use crate::AppState;
use crate::services::reader;

#[tauri::command]
pub fn load_reader_session(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<reader::ReaderSession, String> {
    state.db.with_conn(|conn| reader::get_reader_session(conn, chapter_id))
}

#[tauri::command]
pub fn mark_section_read(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
) -> Result<(), String> {
    state.db.with_conn(|conn| reader::mark_section_seen(conn, chapter_id, section_index))
}

#[tauri::command]
pub fn submit_section_check(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    section_index: i32,
    response: String,
    self_rating: String,
) -> Result<reader::CheckResult, String> {
    state.db.with_conn(|conn| reader::process_check(conn, chapter_id, section_index, &response, &self_rating))
}

#[tauri::command]
pub fn submit_synthesis(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
    synthesis_text: String,
) -> Result<reader::SynthesisResult, String> {
    state.db.with_conn(|conn| reader::process_synthesis(conn, chapter_id, &synthesis_text))
}
```

- [ ] **Step 2: Export reader commands module**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod reader;
```

- [ ] **Step 3: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, add the four reader commands to the `tauri::generate_handler!` macro call:

```rust
commands::reader::load_reader_session,
commands::reader::mark_section_read,
commands::reader::submit_section_check,
commands::reader::submit_synthesis,
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check`
Expected: Compiles clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/reader.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add reader IPC commands (load_session, mark_read, submit_check, submit_synthesis)"
```

---

### Task 4: Frontend IPC Wrappers

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add reader types and IPC functions**

Add to `src/lib/tauri.ts`:

```typescript
// Reader types
export interface ReaderChapter {
  id: number;
  title: string;
  status: string;
  estimated_minutes: number | null;
}

export interface ReaderSection {
  id: number;
  section_index: number;
  heading: string | null;
  body_markdown: string;
  word_count: number;
  status: string;
  prompt: string;
}

export interface ReaderSession {
  chapter: ReaderChapter;
  sections: ReaderSection[];
  current_index: number;
}

export interface CheckResult {
  outcome: string;
  can_retry: boolean;
  repair_card_created: boolean;
  chapter_complete: boolean;
}

export interface SynthesisResult {
  success: boolean;
  new_status: string;
}

// Reader IPC
export const loadReaderSession = (chapterId: number) =>
  invoke<ReaderSession>("load_reader_session", { chapterId });

export const markSectionRead = (chapterId: number, sectionIndex: number) =>
  invoke<void>("mark_section_read", { chapterId, sectionIndex });

export const submitSectionCheck = (
  chapterId: number,
  sectionIndex: number,
  response: string,
  selfRating: string,
) => invoke<CheckResult>("submit_section_check", { chapterId, sectionIndex, response, selfRating });

export const submitSynthesis = (chapterId: number, synthesisText: string) =>
  invoke<SynthesisResult>("submit_synthesis", { chapterId, synthesisText });
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat: add reader IPC wrappers and types"
```

---

### Task 5: Reader Components — ProgressBar, ReaderHeader, ReaderContent

**Files:**
- Create: `src/components/reader/ProgressBar.tsx`
- Create: `src/components/reader/ReaderHeader.tsx`
- Create: `src/components/reader/ReaderContent.tsx`

- [ ] **Step 1: Create ProgressBar**

Create `src/components/reader/ProgressBar.tsx`:

```tsx
export function ProgressBar({
  current,
  total,
}: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-active">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-text-muted">
        {current}/{total}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create ReaderHeader**

Create `src/components/reader/ReaderHeader.tsx`:

```tsx
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProgressBar } from "./ProgressBar";

export function ReaderHeader({
  title,
  currentSection,
  totalSections,
}: {
  title: string;
  currentSection: number;
  totalSections: number;
}) {
  const navigate = useNavigate();

  return (
    <div className="shrink-0 border-b border-border-subtle px-7 py-4">
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/library")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="flex-1 truncate text-sm font-semibold tracking-tight text-text">
          {title}
        </h1>
        <div className="w-32">
          <ProgressBar current={currentSection + 1} total={totalSections} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ReaderContent**

Create `src/components/reader/ReaderContent.tsx`:

```tsx
import DOMPurify from "dompurify";
import { marked } from "marked";

export function ReaderContent({
  heading,
  bodyMarkdown,
}: {
  heading: string | null;
  bodyMarkdown: string;
}) {
  const html = DOMPurify.sanitize(marked.parse(bodyMarkdown) as string);

  return (
    <div className="mx-auto max-w-3xl px-7 py-7">
      {heading && (
        <h2 className="mb-6 text-xl font-semibold tracking-tight text-text">
          {heading}
        </h2>
      )}
      <div
        className="prose-encode text-sm leading-relaxed text-text"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add prose-encode styles to index.css**

Add at the end of `src/index.css` (before the drag region rules):

```css
/* Reader markdown prose styles */
.prose-encode h1,
.prose-encode h2,
.prose-encode h3 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text);
}
.prose-encode h1 { font-size: 1.5em; }
.prose-encode h2 { font-size: 1.25em; }
.prose-encode h3 { font-size: 1.1em; }
.prose-encode p { margin-bottom: 1em; }
.prose-encode ul,
.prose-encode ol { margin-bottom: 1em; padding-left: 1.5em; }
.prose-encode li { margin-bottom: 0.25em; }
.prose-encode code {
  background: var(--color-panel-alt);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.prose-encode pre {
  background: var(--color-panel-alt);
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 1em;
}
.prose-encode pre code {
  background: none;
  padding: 0;
}
.prose-encode blockquote {
  border-left: 3px solid var(--color-accent);
  padding-left: 1em;
  margin-bottom: 1em;
  color: var(--color-text-muted);
}
.prose-encode strong { font-weight: 600; }
.prose-encode a { color: var(--color-accent); text-decoration: underline; }
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/reader/ProgressBar.tsx src/components/reader/ReaderHeader.tsx src/components/reader/ReaderContent.tsx src/index.css
git commit -m "feat: add ProgressBar, ReaderHeader, and ReaderContent components"
```

---

### Task 6: Reader Components — DigestionGate and SynthesisPanel

**Files:**
- Create: `src/components/reader/DigestionGate.tsx`
- Create: `src/components/reader/SynthesisPanel.tsx`

- [ ] **Step 1: Create DigestionGate**

Create `src/components/reader/DigestionGate.tsx`:

```tsx
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";

type Phase = "responding" | "self_check" | "result";

export function DigestionGate({
  prompt,
  sectionHeading,
  onSubmit,
  loading,
}: {
  prompt: string;
  sectionHeading: string | null;
  onSubmit: (response: string, rating: string) => void;
  loading: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("responding");
  const [response, setResponse] = useState("");
  const [selectedRating, setSelectedRating] = useState<string | null>(null);

  const handleReveal = () => {
    if (response.trim().length < 5) return;
    setPhase("self_check");
  };

  const handleRate = (rating: string) => {
    setSelectedRating(rating);
    setPhase("result");
    onSubmit(response, rating);
  };

  return (
    <div className="mx-auto max-w-3xl border-t border-border-subtle px-7 py-6">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
        Comprehension Check
      </p>
      <p className="mb-4 text-sm font-medium text-text">{prompt}</p>

      {phase === "responding" && (
        <>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Type your response..."
            rows={4}
            className="mb-3 w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleReveal}
            disabled={response.trim().length < 5}
            className="h-10 rounded-xl bg-accent px-5 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
          >
            Check Yourself
          </button>
        </>
      )}

      {phase === "self_check" && (
        <>
          <div className="mb-4 rounded-xl border border-border-subtle bg-panel p-4 text-sm leading-relaxed text-text-muted">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
              Key idea to check against
            </p>
            Re-read the section above — did your response capture the main point
            {sectionHeading ? ` of "${sectionHeading}"` : ""}?
          </div>
          <p className="mb-3 text-xs text-text-muted">
            How well did you capture it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleRate("correct")}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-teal/30 bg-teal/5 px-4 text-xs font-medium text-teal transition-all hover:bg-teal/10"
            >
              <CheckCircle2 size={14} />
              Got it
            </button>
            <button
              type="button"
              onClick={() => handleRate("partial")}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-amber/30 bg-amber/5 px-4 text-xs font-medium text-amber transition-all hover:bg-amber/10"
            >
              <RefreshCw size={14} />
              Partially
            </button>
            <button
              type="button"
              onClick={() => handleRate("off_track")}
              disabled={loading}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-coral/30 bg-coral/5 px-4 text-xs font-medium text-coral transition-all hover:bg-coral/10"
            >
              <XCircle size={14} />
              Missed it
            </button>
          </div>
        </>
      )}

      {phase === "result" && selectedRating && (
        <div className="flex items-center gap-2 text-sm">
          {selectedRating === "correct" && (
            <span className="text-teal">Nice — you've got it.</span>
          )}
          {selectedRating === "partial" && (
            <span className="text-amber">Close — review and try once more.</span>
          )}
          {selectedRating === "off_track" && (
            <span className="text-coral">
              A repair card has been created for review later.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create SynthesisPanel**

Create `src/components/reader/SynthesisPanel.tsx`:

```tsx
import { BookOpen } from "lucide-react";
import { useState } from "react";

export function SynthesisPanel({
  chapterTitle,
  onSubmit,
  loading,
}: {
  chapterTitle: string;
  onSubmit: (text: string) => void;
  loading: boolean;
}) {
  const [text, setText] = useState("");

  return (
    <div className="mx-auto max-w-3xl px-7 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <BookOpen size={18} className="text-accent" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-text">
            Chapter Synthesis
          </h2>
          <p className="text-xs text-text-muted">
            Summarize what you learned from "{chapterTitle}"
          </p>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a brief synthesis of the key ideas from this chapter..."
        rows={8}
        className="mb-4 w-full rounded-xl border border-border bg-panel-alt px-4 py-3 text-sm leading-relaxed text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onSubmit(text)}
        disabled={loading || text.trim().length < 20}
        className="h-11 w-full rounded-xl bg-accent text-sm font-medium text-white shadow-sm transition-all hover:bg-accent/90 disabled:opacity-40"
      >
        {loading ? "Submitting..." : "Complete Chapter"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/reader/DigestionGate.tsx src/components/reader/SynthesisPanel.tsx
git commit -m "feat: add DigestionGate and SynthesisPanel components"
```

---

### Task 7: Reader Page — Orchestrator

**Files:**
- Create: `src/pages/Reader.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Reader page**

Create `src/pages/Reader.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DigestionGate } from "../components/reader/DigestionGate";
import { ReaderContent } from "../components/reader/ReaderContent";
import { ReaderHeader } from "../components/reader/ReaderHeader";
import { SynthesisPanel } from "../components/reader/SynthesisPanel";
import {
  loadReaderSession,
  markSectionRead,
  submitSectionCheck,
  submitSynthesis,
} from "../lib/tauri";
import type { CheckResult, ReaderSession } from "../lib/tauri";

type GatePhase = "reading" | "gate" | "result" | "synthesis" | "done";

export function Reader() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapterId = Number(searchParams.get("chapter"));

  const [session, setSession] = useState<ReaderSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gatePhase, setGatePhase] = useState<GatePhase>("reading");
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await loadReaderSession(chapterId);
      setSession(data);
      setCurrentIndex(data.current_index);
      const currentSection = data.sections[data.current_index];
      if (currentSection && currentSection.status !== "unseen") {
        setGatePhase("gate");
      }
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (!chapterId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">No chapter selected</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/library")}
            className="text-sm text-accent hover:underline"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  const section = session.sections[currentIndex];
  const isChapterComplete = session.chapter.status === "awaiting_synthesis" || gatePhase === "synthesis";

  const handleMarkRead = async () => {
    setLoading(true);
    try {
      await markSectionRead(chapterId, section.section_index);
      setGatePhase("gate");
      // Update local section status
      setSession((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated.sections = updated.sections.map((s) =>
          s.section_index === section.section_index ? { ...s, status: "seen" } : s,
        );
        return updated;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckSubmit = async (response: string, rating: string) => {
    setLoading(true);
    try {
      const result = await submitSectionCheck(
        chapterId,
        section.section_index,
        response,
        rating,
      );
      setLastResult(result);

      if (result.can_retry) {
        // Stay on gate phase for retry
        setGatePhase("gate");
      } else if (result.chapter_complete) {
        setGatePhase("synthesis");
      } else {
        setGatePhase("result");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleNextSection = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= session.sections.length) {
      setGatePhase("synthesis");
      return;
    }
    setCurrentIndex(nextIndex);
    setGatePhase("reading");
    setLastResult(null);
  };

  const handleSynthesisSubmit = async (text: string) => {
    setLoading(true);
    try {
      await submitSynthesis(chapterId, text);
      setGatePhase("done");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Synthesis view
  if (gatePhase === "synthesis" || isChapterComplete) {
    return (
      <div className="flex h-full flex-col">
        <ReaderHeader
          title={session.chapter.title}
          currentSection={session.sections.length - 1}
          totalSections={session.sections.length}
        />
        <div className="flex-1 overflow-auto">
          <SynthesisPanel
            chapterTitle={session.chapter.title}
            onSubmit={handleSynthesisSubmit}
            loading={loading}
          />
        </div>
      </div>
    );
  }

  // Done view
  if (gatePhase === "done") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-teal/10">
            <span className="text-2xl">&#10003;</span>
          </div>
          <p className="mb-2 text-base font-semibold text-text">
            Chapter Complete
          </p>
          <p className="mb-6 text-sm text-text-muted">
            "{session.chapter.title}" is ready for quiz.
          </p>
          <button
            type="button"
            onClick={() => navigate("/library")}
            className="h-10 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  if (!section) return null;

  return (
    <div className="flex h-full flex-col">
      <ReaderHeader
        title={session.chapter.title}
        currentSection={currentIndex}
        totalSections={session.sections.length}
      />

      <div className="flex-1 overflow-auto">
        <ReaderContent
          heading={section.heading}
          bodyMarkdown={section.body_markdown}
        />

        {gatePhase === "reading" && (
          <div className="mx-auto max-w-3xl px-7 pb-7">
            <button
              type="button"
              onClick={handleMarkRead}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-border bg-panel text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              {loading ? "..." : "I've read this section"}
            </button>
          </div>
        )}

        {gatePhase === "gate" && (
          <DigestionGate
            prompt={section.prompt}
            sectionHeading={section.heading}
            onSubmit={handleCheckSubmit}
            loading={loading}
          />
        )}

        {gatePhase === "result" && (
          <div className="mx-auto max-w-3xl border-t border-border-subtle px-7 py-6">
            {lastResult?.repair_card_created && (
              <p className="mb-3 text-xs text-coral">
                A repair card has been created for later review.
              </p>
            )}
            <button
              type="button"
              onClick={handleNextSection}
              className="h-10 rounded-xl bg-accent px-5 text-xs font-medium text-white shadow-sm hover:bg-accent/90"
            >
              Next Section
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire Reader route in App.tsx**

In `src/App.tsx`, replace the Reader placeholder:

Add import at top:
```tsx
import { Reader } from "./pages/Reader";
```

Replace the reader route:
```tsx
<Route path="/reader" element={<Reader />} />
```

Remove it from the `Placeholder` usage.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run Biome**

Run: `npx biome check --write .`
Expected: Formatted, no errors.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Reader.tsx src/App.tsx
git commit -m "feat: add Reader page with section progression, self-check gates, and synthesis"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run all Rust tests**

Run: `cargo test`
Expected: All tests pass (existing + 11 new reader tests).

- [ ] **Step 2: Run all frontend checks**

Run: `npx tsc --noEmit && npx biome check . && npm test`
Expected: 0 type errors, 0 lint errors (only pre-existing warnings), all tests pass.

- [ ] **Step 3: Visual verification with Tauri dev**

Run: `npm run tauri dev`

Verify the full flow:
1. Library → click a chapter → Reader opens with first section
2. "I've read this section" button marks section as seen
3. Gate appears with comprehension prompt
4. Type response → "Check Yourself" reveals self-check buttons
5. "Got it" → advances to next section
6. "Partially" → allows one retry
7. "Missed it" → shows repair card message, advances
8. Complete all sections → synthesis panel appears
9. Write synthesis (20+ chars) → "Complete Chapter" → success screen
10. Check SQLite: `study_events` has entries, `chapter.status` = `ready_for_quiz`
