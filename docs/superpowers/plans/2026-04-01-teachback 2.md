# Teach-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-round teach-back exercise where users explain chapter content, AI evaluates against a 5-criterion rubric, and weak/developing results auto-create repair cards.

**Architecture:** Rust service (`services/teachback.rs`) handles prompt generation, AI evaluation, mastery computation, and repair card creation. Tauri commands (`commands/teachback.rs`) expose 4 IPC endpoints. A single React page (`pages/Teachback.tsx`) drives the UI state machine. Entry points are added to Reader done screen, Library chapter cards, and Queue.

**Tech Stack:** Rust/rusqlite (backend), React/TypeScript (frontend), Tauri IPC, AI router (`services/ai.rs`)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src-tauri/src/services/teachback.rs` | Teach-back service: start, submit, self-rating, list, mastery computation, repair cards |
| Create | `src-tauri/src/commands/teachback.rs` | 4 Tauri IPC commands wrapping the service |
| Create | `src/pages/Teachback.tsx` | Full teach-back page: prompt → write → evaluate → result/self-rate |
| Modify | `src-tauri/src/services/mod.rs` | Add `pub mod teachback;` |
| Modify | `src-tauri/src/commands/mod.rs` | Add `pub mod teachback;` |
| Modify | `src-tauri/src/lib.rs` | Register 4 new commands |
| Modify | `src/lib/tauri.ts` | Add teach-back types + 4 IPC wrappers |
| Modify | `src/App.tsx` | Add `/teachback` route |
| Modify | `src/pages/Reader.tsx` | Add "Teach Back" button on done screen |
| Modify | `src/pages/Library.tsx` | Add "Teach Back" button on chapter cards |
| Modify | `src-tauri/src/services/queue.rs` | Add `teachback_available` queue item type |
| Modify | `src-tauri/tests/integration_flow.rs` | Add `test_teachback_flow` |

---

### Task 1: Teach-Back Service — Types and `start_teachback`

**Files:**
- Create: `src-tauri/src/services/teachback.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write the failing test for `start_teachback`**

Add to bottom of `src-tauri/src/services/teachback.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup() -> Database {
        let db = Database::open_memory().expect("open");
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO subjects (slug, name, created_at) VALUES ('cs', 'CS', datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Data Structures', 'data-structures', 'mastering', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status, prompt)
                 VALUES (1, 0, 'Arrays', 'Arrays store elements in contiguous memory.', 6, 'checked_correct', 'Explain arrays')",
                [],
            ).unwrap();
            Ok(())
        }).expect("setup");
        db
    }

    #[test]
    fn test_start_teachback_creates_record() {
        let db = setup();
        db.with_conn(|conn| {
            let result = start_teachback(conn, 1).unwrap();
            assert_eq!(result.chapter_title, "Data Structures");
            assert_eq!(result.subject_name, "CS");
            assert!(!result.prompt.is_empty());
            assert!(result.id > 0);

            // Verify DB row
            let mastery: Option<String> = conn.query_row(
                "SELECT mastery FROM teachbacks WHERE id = ?1",
                [result.id],
                |row| row.get(0),
            ).unwrap();
            assert!(mastery.is_none()); // NULL until submitted
            Ok(())
        }).expect("test failed");
    }
}
```

- [ ] **Step 2: Write the types and `start_teachback` implementation**

At the top of `src-tauri/src/services/teachback.rs`:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::services::cards;

pub const TEACHBACK_GENERATE_PROMPT: &str = r#"You are generating a teach-back prompt for a student. Given the chapter content below, create a single focused question that asks the student to explain a key concept in their own words. The question should require demonstrating understanding, not just recall. Ask them to include a concrete example. Return ONLY the question text, nothing else."#;

pub const TEACHBACK_EVALUATE_PROMPT: &str = r#"You are evaluating a student's teach-back explanation. Score each criterion 0-100:
- accuracy: factual correctness
- clarity: organization and flow
- completeness: covers key concepts
- example: includes a real, illustrative example
- jargon: technical terms are explained, not just dropped

Respond with JSON only:
{"scores":{"accuracy":N,"clarity":N,"completeness":N,"example":N,"jargon":N},"overall":N,"strongest":"one sentence","biggest_gap":"one sentence"}"#;

const DETERMINISTIC_PROMPT: &str = "Explain the key concepts from this chapter in your own words. Include at least one concrete example.";

#[derive(Serialize)]
pub struct TeachbackStart {
    pub id: i64,
    pub prompt: String,
    pub chapter_title: String,
    pub subject_name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RubricScores {
    pub accuracy: i32,
    pub clarity: i32,
    pub completeness: i32,
    pub example: i32,
    pub jargon: i32,
}

#[derive(Serialize)]
pub struct TeachbackResult {
    pub mastery: String,
    pub scores: RubricScores,
    pub overall: i32,
    pub strongest: String,
    pub biggest_gap: String,
    pub repair_card_id: Option<i64>,
    pub needs_self_rating: bool,
}

#[derive(Serialize)]
pub struct TeachbackListItem {
    pub id: i64,
    pub chapter_id: Option<i64>,
    pub chapter_title: String,
    pub subject_name: String,
    pub mastery: Option<String>,
    pub created_at: String,
}

fn mastery_band(overall: i32) -> &'static str {
    match overall {
        0..=39 => "weak",
        40..=59 => "developing",
        60..=79 => "solid",
        _ => "ready",
    }
}

pub fn start_teachback(conn: &Connection, chapter_id: i64) -> Result<TeachbackStart, String> {
    // Load chapter + subject info
    let (chapter_title, subject_id, subject_name): (String, i64, String) = conn
        .query_row(
            "SELECT ch.title, ch.subject_id, s.name
             FROM chapters ch
             JOIN subjects s ON s.id = ch.subject_id
             WHERE ch.id = ?1",
            [chapter_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Chapter not found: {e}"))?;

    // Verify chapter has sections
    let section_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if section_count == 0 {
        return Err("Chapter has no sections".to_string());
    }

    let prompt = DETERMINISTIC_PROMPT.to_string();

    conn.execute(
        "INSERT INTO teachbacks (subject_id, chapter_id, prompt, created_at)
         VALUES (?1, ?2, ?3, datetime('now'))",
        rusqlite::params![subject_id, chapter_id, prompt],
    )
    .map_err(|e| format!("Failed to create teachback: {e}"))?;

    let id = conn.last_insert_rowid();

    Ok(TeachbackStart {
        id,
        prompt,
        chapter_title,
        subject_name,
    })
}
```

- [ ] **Step 3: Register the module**

In `src-tauri/src/services/mod.rs`, add:

```rust
pub mod teachback;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test services::teachback::tests::test_start_teachback_creates_record -- --exact`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/teachback.rs src-tauri/src/services/mod.rs
git commit -m "feat(teachback): add service with start_teachback + types"
```

---

### Task 2: Teach-Back Service — `submit_teachback` and mastery computation

**Files:**
- Modify: `src-tauri/src/services/teachback.rs`

- [ ] **Step 1: Write the failing tests**

Add to `mod tests` in `teachback.rs`:

```rust
    #[test]
    fn test_submit_teachback_solid_no_repair_card() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();

            let scores = RubricScores {
                accuracy: 80,
                clarity: 75,
                completeness: 65,
                example: 70,
                jargon: 60,
            };
            let result = finalize_teachback(
                conn, start.id, "My explanation of arrays...", &scores,
                "Good accuracy", "Missing linked list comparison", None,
            ).unwrap();

            assert_eq!(result.mastery, "solid"); // avg = 70
            assert!(result.repair_card_id.is_none());
            assert!(!result.needs_self_rating);

            // Verify DB updated
            let mastery: String = conn.query_row(
                "SELECT mastery FROM teachbacks WHERE id = ?1",
                [start.id],
                |row| row.get(0),
            ).unwrap();
            assert_eq!(mastery, "solid");
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_submit_teachback_weak_creates_repair_card() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();

            let scores = RubricScores {
                accuracy: 30,
                clarity: 20,
                completeness: 25,
                example: 10,
                jargon: 15,
            };
            let result = finalize_teachback(
                conn, start.id, "I don't remember", &scores,
                "Attempted", "Missed all key concepts", None,
            ).unwrap();

            assert_eq!(result.mastery, "weak"); // avg = 20
            assert!(result.repair_card_id.is_some());

            // Verify repair card created
            let card_source: String = conn.query_row(
                "SELECT source_type FROM cards WHERE id = ?1",
                [result.repair_card_id.unwrap()],
                |row| row.get(0),
            ).unwrap();
            assert_eq!(card_source, "teachback_miss");
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_submit_teachback_developing_creates_repair_card() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();

            let scores = RubricScores {
                accuracy: 55,
                clarity: 50,
                completeness: 45,
                example: 40,
                jargon: 50,
            };
            let result = finalize_teachback(
                conn, start.id, "Arrays are data structures", &scores,
                "Basic understanding", "No concrete example", None,
            ).unwrap();

            assert_eq!(result.mastery, "developing"); // avg = 48
            assert!(result.repair_card_id.is_some());
            Ok(())
        }).expect("test failed");
    }
```

- [ ] **Step 2: Implement `finalize_teachback`**

Add to `teachback.rs` (before `#[cfg(test)]`):

```rust
/// Core function that writes the evaluation result to DB and optionally creates a repair card.
/// Called by both AI evaluation path and self-rating path.
pub fn finalize_teachback(
    conn: &Connection,
    teachback_id: i64,
    response: &str,
    scores: &RubricScores,
    strongest: &str,
    biggest_gap: &str,
    chapter_id_override: Option<i64>,
) -> Result<TeachbackResult, String> {
    let overall = (scores.accuracy + scores.clarity + scores.completeness + scores.example + scores.jargon) / 5;
    let mastery = mastery_band(overall).to_string();

    // Create repair card if weak or developing
    let mut repair_card_id = None;
    if mastery == "weak" || mastery == "developing" {
        // Load subject_id and chapter_id from teachback row
        let (subject_id, chapter_id): (i64, Option<i64>) = conn
            .query_row(
                "SELECT subject_id, chapter_id FROM teachbacks WHERE id = ?1",
                [teachback_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Teachback not found: {e}"))?;

        let ch_id = chapter_id_override.or(chapter_id);
        let card_id = cards::insert_card_with_schedule_pub(
            conn,
            subject_id,
            ch_id,
            "teachback_miss",
            biggest_gap,
            &format!("Review: {}", biggest_gap),
            "basic",
        )?;
        repair_card_id = Some(card_id);
    }

    // Build evaluation JSON
    let eval_json = serde_json::json!({
        "scores": {
            "accuracy": scores.accuracy,
            "clarity": scores.clarity,
            "completeness": scores.completeness,
            "example": scores.example,
            "jargon": scores.jargon,
        },
        "overall": overall,
        "strongest": strongest,
        "biggest_gap": biggest_gap,
        "repair_card_id": repair_card_id,
    });

    // Update teachback row
    conn.execute(
        "UPDATE teachbacks SET response = ?2, evaluation_json = ?3, mastery = ?4
         WHERE id = ?1",
        rusqlite::params![teachback_id, response, eval_json.to_string(), mastery],
    )
    .map_err(|e| format!("Failed to update teachback: {e}"))?;

    // Log study event
    let subject_id: i64 = conn
        .query_row(
            "SELECT subject_id FROM teachbacks WHERE id = ?1",
            [teachback_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO study_events (subject_id, event_type, created_at) VALUES (?1, 'teachback', datetime('now'))",
        [subject_id],
    )
    .map_err(|e| format!("Failed to log study event: {e}"))?;

    Ok(TeachbackResult {
        mastery,
        scores: scores.clone(),
        overall,
        strongest: strongest.to_string(),
        biggest_gap: biggest_gap.to_string(),
        repair_card_id,
        needs_self_rating: false,
    })
}
```

- [ ] **Step 3: Expose `insert_card_with_schedule` in `cards.rs`**

The existing `insert_card_with_schedule` function in `src-tauri/src/services/cards.rs` is private. Add a public wrapper:

```rust
/// Public wrapper for other services to create cards with schedule.
pub fn insert_card_with_schedule_pub(
    conn: &Connection,
    subject_id: i64,
    chapter_id: Option<i64>,
    source_type: &str,
    prompt: &str,
    answer: &str,
    card_type: &str,
) -> Result<i64, String> {
    insert_card_with_schedule(conn, subject_id, chapter_id, source_type, prompt, answer, card_type)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test services::teachback::tests -- --exact`

Expected: All 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/services/teachback.rs src-tauri/src/services/cards.rs
git commit -m "feat(teachback): add finalize_teachback with mastery + repair cards"
```

---

### Task 3: Teach-Back Service — `submit_self_rating` and `list_teachbacks`

**Files:**
- Modify: `src-tauri/src/services/teachback.rs`

- [ ] **Step 1: Write the failing tests**

Add to `mod tests`:

```rust
    #[test]
    fn test_self_rating_computes_mastery() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();

            let ratings = RubricScores {
                accuracy: 100,  // "Strong"
                clarity: 50,    // "Partial"
                completeness: 100,
                example: 0,     // "Missed"
                jargon: 50,
            };
            let result = submit_self_rating(conn, start.id, "My explanation", &ratings).unwrap();
            assert_eq!(result.mastery, "developing"); // avg = 60... wait (100+50+100+0+50)/5 = 60 → solid
            // Actually 60 is solid boundary
            assert_eq!(result.overall, 60);
            assert_eq!(result.mastery, "solid");
            Ok(())
        }).expect("test failed");
    }

    #[test]
    fn test_list_teachbacks() {
        let db = setup();
        db.with_conn(|conn| {
            let start = start_teachback(conn, 1).unwrap();
            let scores = RubricScores { accuracy: 80, clarity: 80, completeness: 80, example: 80, jargon: 80 };
            finalize_teachback(conn, start.id, "Great explanation", &scores, "All good", "Minor gaps", None).unwrap();

            let all = list_teachbacks(conn, None).unwrap();
            assert_eq!(all.len(), 1);
            assert_eq!(all[0].chapter_title, "Data Structures");
            assert_eq!(all[0].mastery, Some("ready".to_string()));

            // Filter by subject
            let filtered = list_teachbacks(conn, Some(1)).unwrap();
            assert_eq!(filtered.len(), 1);

            let empty = list_teachbacks(conn, Some(999)).unwrap();
            assert_eq!(empty.len(), 0);
            Ok(())
        }).expect("test failed");
    }
```

- [ ] **Step 2: Implement `submit_self_rating` and `list_teachbacks`**

Add to `teachback.rs` before `#[cfg(test)]`:

```rust
/// No-AI mode: user rates themselves on each rubric criterion.
pub fn submit_self_rating(
    conn: &Connection,
    teachback_id: i64,
    response: &str,
    ratings: &RubricScores,
) -> Result<TeachbackResult, String> {
    // Find the lowest-rated criterion for the "biggest gap"
    let criteria = [
        ("Accuracy", ratings.accuracy),
        ("Clarity", ratings.clarity),
        ("Completeness", ratings.completeness),
        ("Concrete example", ratings.example),
        ("Jargon explanation", ratings.jargon),
    ];
    let (weakest_name, _) = criteria.iter().min_by_key(|(_, score)| score).unwrap();
    let (strongest_name, _) = criteria.iter().max_by_key(|(_, score)| score).unwrap();

    finalize_teachback(
        conn,
        teachback_id,
        response,
        ratings,
        &format!("{strongest_name} was your strongest area"),
        &format!("{weakest_name} needs more work"),
        None,
    )
}

pub fn list_teachbacks(
    conn: &Connection,
    subject_id: Option<i64>,
) -> Result<Vec<TeachbackListItem>, String> {
    let query = if subject_id.is_some() {
        "SELECT t.id, t.chapter_id, COALESCE(ch.title, 'Unknown'), s.name, t.mastery, t.created_at
         FROM teachbacks t
         JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN chapters ch ON ch.id = t.chapter_id
         WHERE t.subject_id = ?1
         ORDER BY t.created_at DESC
         LIMIT 50"
    } else {
        "SELECT t.id, t.chapter_id, COALESCE(ch.title, 'Unknown'), s.name, t.mastery, t.created_at
         FROM teachbacks t
         JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN chapters ch ON ch.id = t.chapter_id
         ORDER BY t.created_at DESC
         LIMIT 50"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let rows = if let Some(sid) = subject_id {
        stmt.query_map([sid], |row| {
            Ok(TeachbackListItem {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                chapter_title: row.get(2)?,
                subject_name: row.get(3)?,
                mastery: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    } else {
        stmt.query_map([], |row| {
            Ok(TeachbackListItem {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                chapter_title: row.get(2)?,
                subject_name: row.get(3)?,
                mastery: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    };

    Ok(rows)
}
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test services::teachback::tests -- --exact`

Expected: All 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/teachback.rs
git commit -m "feat(teachback): add self-rating and list_teachbacks"
```

---

### Task 4: Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/teachback.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the commands file**

Write `src-tauri/src/commands/teachback.rs`:

```rust
use crate::services::{ai, teachback};
use crate::AppState;

#[tauri::command]
pub async fn start_teachback(
    state: tauri::State<'_, AppState>,
    chapter_id: i64,
) -> Result<teachback::TeachbackStart, String> {
    // Start with deterministic prompt
    let mut result = state
        .db
        .with_conn(|conn| teachback::start_teachback(conn, chapter_id))?;

    // Try AI prompt generation if configured
    let config = state.config.read().map_err(|e| e.to_string())?.clone();
    if config.ai.provider != "none" {
        // Load chapter sections for AI context
        let sections_text = state.db.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT heading, body_markdown FROM chapter_sections
                     WHERE chapter_id = ?1 ORDER BY section_index",
                )
                .map_err(|e| e.to_string())?;
            let texts: Vec<String> = stmt
                .query_map([chapter_id], |row| {
                    let heading: Option<String> = row.get(0)?;
                    let body: String = row.get(1)?;
                    Ok(if let Some(h) = heading {
                        format!("## {h}\n{body}")
                    } else {
                        body
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok(texts.join("\n\n"))
        })?;

        let ai_req = ai::AiRequest {
            feature: "teachback.generate_prompt".to_string(),
            system_prompt: teachback::TEACHBACK_GENERATE_PROMPT.to_string(),
            user_prompt: format!("Chapter: {}\n\n{}", result.chapter_title, sections_text),
            model_policy: "balanced".to_string(),
            timeout_ms: 60000,
        };

        match ai::ai_request(&state.http, &config.ai, &config.profile, ai_req).await {
            Ok(response) => {
                let ai_prompt = response.content.trim().to_string();
                if !ai_prompt.is_empty() {
                    // Update DB with AI-generated prompt
                    state.db.with_conn(|conn| {
                        conn.execute(
                            "UPDATE teachbacks SET prompt = ?2 WHERE id = ?1",
                            rusqlite::params![result.id, ai_prompt],
                        )
                        .map_err(|e| e.to_string())?;
                        ai::log_result(conn, "teachback.generate_prompt", Ok(&response));
                        Ok(())
                    })?;
                    result.prompt = ai_prompt;
                }
            }
            Err(e) => {
                // Log failure, keep deterministic prompt
                state.db.with_conn(|conn| {
                    ai::log_result(conn, "teachback.generate_prompt", Err(&e));
                    Ok(())
                })?;
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn submit_teachback(
    state: tauri::State<'_, AppState>,
    teachback_id: i64,
    response: String,
) -> Result<teachback::TeachbackResult, String> {
    let config = state.config.read().map_err(|e| e.to_string())?.clone();

    if config.ai.provider == "none" {
        // No-AI mode: return needs_self_rating
        return Ok(teachback::TeachbackResult {
            mastery: String::new(),
            scores: teachback::RubricScores {
                accuracy: 0,
                clarity: 0,
                completeness: 0,
                example: 0,
                jargon: 0,
            },
            overall: 0,
            strongest: String::new(),
            biggest_gap: String::new(),
            repair_card_id: None,
            needs_self_rating: true,
        });
    }

    // Load chapter sections for AI context
    let (chapter_id, prompt) = state.db.with_conn(|conn| {
        let row: (Option<i64>, String) = conn
            .query_row(
                "SELECT chapter_id, prompt FROM teachbacks WHERE id = ?1",
                [teachback_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Teachback not found: {e}"))?;
        Ok(row)
    })?;

    let sections_text = if let Some(ch_id) = chapter_id {
        state.db.with_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT heading, body_markdown FROM chapter_sections
                     WHERE chapter_id = ?1 ORDER BY section_index",
                )
                .map_err(|e| e.to_string())?;
            let texts: Vec<String> = stmt
                .query_map([ch_id], |row| {
                    let heading: Option<String> = row.get(0)?;
                    let body: String = row.get(1)?;
                    Ok(if let Some(h) = heading {
                        format!("## {h}\n{body}")
                    } else {
                        body
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok(texts.join("\n\n"))
        })?
    } else {
        String::new()
    };

    let ai_req = ai::AiRequest {
        feature: "teachback.evaluate".to_string(),
        system_prompt: teachback::TEACHBACK_EVALUATE_PROMPT.to_string(),
        user_prompt: format!(
            "Prompt given: {}\n\nChapter content:\n{}\n\nStudent's explanation:\n{}",
            prompt, sections_text, response
        ),
        model_policy: "strong_reasoning".to_string(),
        timeout_ms: 90000,
    };

    match ai::ai_request(&state.http, &config.ai, &config.profile, ai_req).await {
        Ok(ai_response) => {
            // Parse AI JSON response
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(&ai_response.content);
            match parsed {
                Ok(json) => {
                    let scores = teachback::RubricScores {
                        accuracy: json["scores"]["accuracy"].as_i64().unwrap_or(50) as i32,
                        clarity: json["scores"]["clarity"].as_i64().unwrap_or(50) as i32,
                        completeness: json["scores"]["completeness"].as_i64().unwrap_or(50) as i32,
                        example: json["scores"]["example"].as_i64().unwrap_or(50) as i32,
                        jargon: json["scores"]["jargon"].as_i64().unwrap_or(50) as i32,
                    };
                    let strongest = json["strongest"].as_str().unwrap_or("").to_string();
                    let biggest_gap = json["biggest_gap"].as_str().unwrap_or("").to_string();

                    let result = state.db.with_conn(|conn| {
                        ai::log_result(conn, "teachback.evaluate", Ok(&ai_response));
                        teachback::finalize_teachback(
                            conn, teachback_id, &response, &scores,
                            &strongest, &biggest_gap, None,
                        )
                    })?;

                    Ok(result)
                }
                Err(_) => {
                    // JSON parse failed — fall back to self-rating
                    state.db.with_conn(|conn| {
                        ai::log_result(conn, "teachback.evaluate", Err("Failed to parse AI response as JSON"));
                        Ok(())
                    })?;
                    Ok(teachback::TeachbackResult {
                        mastery: String::new(),
                        scores: teachback::RubricScores { accuracy: 0, clarity: 0, completeness: 0, example: 0, jargon: 0 },
                        overall: 0,
                        strongest: String::new(),
                        biggest_gap: String::new(),
                        repair_card_id: None,
                        needs_self_rating: true,
                    })
                }
            }
        }
        Err(e) => {
            state.db.with_conn(|conn| {
                ai::log_result(conn, "teachback.evaluate", Err(&e));
                Ok(())
            })?;
            // Fall back to self-rating
            Ok(teachback::TeachbackResult {
                mastery: String::new(),
                scores: teachback::RubricScores { accuracy: 0, clarity: 0, completeness: 0, example: 0, jargon: 0 },
                overall: 0,
                strongest: String::new(),
                biggest_gap: String::new(),
                repair_card_id: None,
                needs_self_rating: true,
            })
        }
    }
}

#[tauri::command]
pub fn submit_teachback_self_rating(
    state: tauri::State<'_, AppState>,
    teachback_id: i64,
    response: String,
    ratings: teachback::RubricScores,
) -> Result<teachback::TeachbackResult, String> {
    state.db.with_conn(|conn| {
        teachback::submit_self_rating(conn, teachback_id, &response, &ratings)
    })
}

#[tauri::command]
pub fn list_teachbacks(
    state: tauri::State<'_, AppState>,
    subject_id: Option<i64>,
) -> Result<Vec<teachback::TeachbackListItem>, String> {
    state.db.with_conn(|conn| teachback::list_teachbacks(conn, subject_id))
}
```

- [ ] **Step 2: Register the module in `commands/mod.rs`**

Add:

```rust
pub mod teachback;
```

- [ ] **Step 3: Register commands in `lib.rs`**

Add these 4 lines to the `invoke_handler` array in `src-tauri/src/lib.rs`:

```rust
commands::teachback::start_teachback,
commands::teachback::submit_teachback,
commands::teachback::submit_teachback_self_rating,
commands::teachback::list_teachbacks,
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`

Expected: Compiles with no errors

- [ ] **Step 5: Run all existing tests**

Run: `cd src-tauri && cargo test`

Expected: All tests pass (existing + new teachback tests)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/teachback.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(teachback): add Tauri IPC commands"
```

---

### Task 5: Frontend IPC Wrappers and Route

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add teach-back types and IPC wrappers to `src/lib/tauri.ts`**

Add before the final line of the file:

```typescript
// Teach-back types
export interface TeachbackStart {
  id: number;
  prompt: string;
  chapter_title: string;
  subject_name: string;
}

export interface RubricScores {
  accuracy: number;
  clarity: number;
  completeness: number;
  example: number;
  jargon: number;
}

export interface TeachbackResult {
  mastery: string;
  scores: RubricScores;
  overall: number;
  strongest: string;
  biggest_gap: string;
  repair_card_id: number | null;
  needs_self_rating: boolean;
}

export interface TeachbackListItem {
  id: number;
  chapter_id: number | null;
  chapter_title: string;
  subject_name: string;
  mastery: string | null;
  created_at: string;
}

// Teach-back IPC
export const startTeachback = (chapterId: number) =>
  invoke<TeachbackStart>("start_teachback", { chapterId });

export const submitTeachback = (teachbackId: number, response: string) =>
  invoke<TeachbackResult>("submit_teachback", { teachbackId, response });

export const submitTeachbackSelfRating = (
  teachbackId: number,
  response: string,
  ratings: RubricScores,
) =>
  invoke<TeachbackResult>("submit_teachback_self_rating", {
    teachbackId,
    response,
    ratings,
  });

export const listTeachbacks = (subjectId?: number) =>
  invoke<TeachbackListItem[]>("list_teachbacks", {
    subjectId: subjectId ?? null,
  });
```

- [ ] **Step 2: Add the import and route to `src/App.tsx`**

Add import:

```typescript
import { Teachback } from "./pages/Teachback";
```

Add route inside the Shell route group, after the `/settings` route:

```tsx
<Route path="/teachback" element={<Teachback />} />
```

- [ ] **Step 3: Create placeholder page `src/pages/Teachback.tsx`**

```tsx
export function Teachback() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-text-muted">Teach-back page loading...</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: Zero errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauri.ts src/App.tsx src/pages/Teachback.tsx
git commit -m "feat(teachback): add IPC wrappers, route, placeholder page"
```

---

### Task 6: Teach-Back Page — Full UI

**Files:**
- Modify: `src/pages/Teachback.tsx`

- [ ] **Step 1: Implement the full teach-back page**

Replace the placeholder with the full implementation:

```tsx
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  startTeachback,
  submitTeachback,
  submitTeachbackSelfRating,
} from "../lib/tauri";
import type { RubricScores, TeachbackResult, TeachbackStart } from "../lib/tauri";

type Phase = "loading" | "writing" | "evaluating" | "selfrating" | "result";

const RUBRIC_CRITERIA = [
  { key: "accuracy" as const, label: "Accuracy", desc: "Factual correctness" },
  { key: "clarity" as const, label: "Clarity", desc: "Organization and flow" },
  { key: "completeness" as const, label: "Completeness", desc: "Covers key concepts" },
  { key: "example" as const, label: "Concrete Example", desc: "Includes a real example" },
  { key: "jargon" as const, label: "Jargon", desc: "Terms explained, not just dropped" },
] as const;

const MASTERY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  weak: { bg: "bg-red-500/10", text: "text-red-400", label: "Weak" },
  developing: { bg: "bg-amber-500/10", text: "text-amber-400", label: "Developing" },
  solid: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Solid" },
  ready: { bg: "bg-teal/10", text: "text-teal", label: "Ready" },
};

export function Teachback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapterId = Number(searchParams.get("chapter"));

  const [phase, setPhase] = useState<Phase>("loading");
  const [tbStart, setTbStart] = useState<TeachbackStart | null>(null);
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<TeachbackResult | null>(null);
  const [selfRatings, setSelfRatings] = useState<RubricScores>({
    accuracy: -1,
    clarity: -1,
    completeness: -1,
    example: -1,
    jargon: -1,
  });
  const [error, setError] = useState<string | null>(null);

  const loadTeachback = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await startTeachback(chapterId);
      setTbStart(data);
      setPhase("writing");
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    loadTeachback();
  }, [loadTeachback]);

  const handleSubmit = async () => {
    if (!tbStart || !response.trim()) return;
    setPhase("evaluating");
    try {
      const res = await submitTeachback(tbStart.id, response);
      if (res.needs_self_rating) {
        setPhase("selfrating");
      } else {
        setResult(res);
        setPhase("result");
      }
    } catch (e) {
      setError(String(e));
      setPhase("writing");
    }
  };

  const handleSelfRatingSubmit = async () => {
    if (!tbStart) return;
    const allRated = Object.values(selfRatings).every((v) => v >= 0);
    if (!allRated) return;
    setPhase("evaluating");
    try {
      const res = await submitTeachbackSelfRating(tbStart.id, response, selfRatings);
      setResult(res);
      setPhase("result");
    } catch (e) {
      setError(String(e));
      setPhase("selfrating");
    }
  };

  const handleTryAgain = () => {
    setResponse("");
    setResult(null);
    setSelfRatings({ accuracy: -1, clarity: -1, completeness: -1, example: -1, jargon: -1 });
    setPhase("loading");
    loadTeachback();
  };

  if (!chapterId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">No chapter specified.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-sm text-red-400">{error}</p>
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

  if (phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (phase === "evaluating") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 size={24} className="animate-spin text-accent" />
        <p className="text-sm text-text-muted">Evaluating your explanation...</p>
      </div>
    );
  }

  // SELF-RATING PHASE
  if (phase === "selfrating") {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
        <div className="mb-6">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-purple-400">
            Self-Review
          </div>
          <h2 className="text-lg font-semibold text-text">Rate Your Explanation</h2>
          <p className="text-sm text-text-muted">
            AI evaluation unavailable. Rate yourself on each criterion.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-auto">
          {RUBRIC_CRITERIA.map((c) => (
            <div key={c.key} className="rounded-lg border border-border bg-panel p-4">
              <div className="mb-2 font-medium text-text">{c.label}</div>
              <div className="mb-3 text-xs text-text-muted">{c.desc}</div>
              <div className="flex gap-2">
                {[
                  { label: "Missed", value: 0 },
                  { label: "Partial", value: 50 },
                  { label: "Strong", value: 100 },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setSelfRatings((prev) => ({ ...prev, [c.key]: opt.value }))
                    }
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      selfRatings[c.key] === opt.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-panel-active text-text-muted hover:text-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSelfRatingSubmit}
            disabled={Object.values(selfRatings).some((v) => v < 0)}
            className="h-10 rounded-xl bg-purple-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-500 disabled:opacity-40"
          >
            See Results
          </button>
        </div>
      </div>
    );
  }

  // RESULT PHASE
  if (phase === "result" && result) {
    const m = MASTERY_COLORS[result.mastery] || MASTERY_COLORS.developing;
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
        <div className="mb-6 text-center">
          <div
            className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-xl ${m.bg}`}
          >
            <MessageSquare size={24} className={m.text} />
          </div>
          <div className={`text-xl font-bold ${m.text}`}>{m.label}</div>
          <div className="text-sm text-text-muted">
            Overall score: {result.overall}/100
          </div>
        </div>

        {result.strongest && (
          <div className="mb-3 rounded-lg border border-border bg-panel p-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-emerald-400">
              Strongest Part
            </div>
            <div className="text-sm text-text">{result.strongest}</div>
          </div>
        )}

        {result.biggest_gap && (
          <div className="mb-3 rounded-lg border border-border bg-panel p-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-400">
              Biggest Gap
            </div>
            <div className="text-sm text-text">{result.biggest_gap}</div>
          </div>
        )}

        <div className="mb-4 rounded-lg border border-border bg-panel p-4">
          <div className="space-y-3">
            {RUBRIC_CRITERIA.map((c) => (
              <div key={c.key}>
                <div className="mb-1 flex justify-between text-xs text-text-muted">
                  <span>{c.label}</span>
                  <span>{result.scores[c.key]}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-border">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      result.scores[c.key] >= 60 ? "bg-emerald-400" : result.scores[c.key] >= 40 ? "bg-amber-400" : "bg-red-400"
                    }`}
                    style={{ width: `${result.scores[c.key]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {result.repair_card_id && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
            Repair card created for: {result.biggest_gap}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={handleTryAgain}
            className="h-10 rounded-xl bg-purple-600 px-5 text-sm font-medium text-white shadow-sm hover:bg-purple-500"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => navigate("/library")}
            className="h-10 rounded-xl border border-border bg-panel px-5 text-sm font-medium text-text transition-all hover:bg-panel-active"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  // WRITING PHASE (default)
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
      <button
        type="button"
        onClick={() => navigate("/library")}
        className="mb-4 flex items-center gap-1 text-xs text-text-muted hover:text-text"
      >
        <ArrowLeft size={12} />
        Back to Library
      </button>

      <div className="mb-4">
        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-purple-400">
          Teach Back
        </div>
        <h2 className="text-lg font-semibold text-text">
          {tbStart?.chapter_title}
        </h2>
        <p className="text-xs text-text-muted">{tbStart?.subject_name}</p>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-panel p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          Your Prompt
        </div>
        <p className="text-sm leading-relaxed text-text">{tbStart?.prompt}</p>
      </div>

      <div className="mb-3">
        <label htmlFor="tb-response" className="mb-1 block text-xs text-text-muted">
          Your explanation
        </label>
        <textarea
          id="tb-response"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Imagine you're teaching this to someone who hasn't read the chapter..."
          className="h-40 w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted/50">No time limit</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!response.trim()}
          className="h-10 rounded-xl bg-purple-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-500 disabled:opacity-40"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: Zero errors

- [ ] **Step 3: Run lint**

Run: `npx biome check .`

Expected: No errors (warnings OK)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Teachback.tsx
git commit -m "feat(teachback): implement full teach-back page UI"
```

---

### Task 7: Entry Points — Reader, Library, Queue

**Files:**
- Modify: `src/pages/Reader.tsx`
- Modify: `src/pages/Library.tsx`
- Modify: `src-tauri/src/services/queue.rs`

- [ ] **Step 1: Add "Teach Back" button to Reader done screen**

In `src/pages/Reader.tsx`, find the done screen section (around line 192-207). Add a "Teach Back" button between "Back to Library" and "Take Quiz":

Find:
```tsx
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/library")}
              className="h-10 rounded-xl border border-border bg-panel px-5 text-sm font-medium text-text transition-all hover:bg-panel-active"
            >
              Back to Library
            </button>
            <button
              type="button"
              onClick={() => navigate(`/quiz?chapter=${chapterId}`)}
              className="h-10 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
            >
              Take Quiz
            </button>
          </div>
```

Replace with:
```tsx
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/library")}
              className="h-10 rounded-xl border border-border bg-panel px-5 text-sm font-medium text-text transition-all hover:bg-panel-active"
            >
              Back to Library
            </button>
            <button
              type="button"
              onClick={() => navigate(`/teachback?chapter=${chapterId}`)}
              className="h-10 rounded-xl bg-purple-600 px-5 text-sm font-medium text-white shadow-sm hover:bg-purple-500"
            >
              Teach Back
            </button>
            <button
              type="button"
              onClick={() => navigate(`/quiz?chapter=${chapterId}`)}
              className="h-10 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
            >
              Take Quiz
            </button>
          </div>
```

- [ ] **Step 2: Add "Teach Back" button to Library chapter cards**

In `src/pages/Library.tsx`, find the "Take Quiz" button section (around line 452-466). After the existing Take Quiz button, add a Teach Back button that shows for `mastering` and `stable` chapters:

Find:
```tsx
                  {["ready_for_quiz", "mastering", "stable"].includes(
                    chapter.status,
                  ) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/quiz?chapter=${chapter.id}`);
                      }}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 text-[11px] font-medium text-accent transition-all hover:bg-accent/10"
                    >
                      <ClipboardCheck size={12} />
                      Take Quiz
                    </button>
                  )}
```

Replace with:
```tsx
                  {["ready_for_quiz", "mastering", "stable"].includes(
                    chapter.status,
                  ) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/quiz?chapter=${chapter.id}`);
                      }}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 text-[11px] font-medium text-accent transition-all hover:bg-accent/10"
                    >
                      <ClipboardCheck size={12} />
                      Take Quiz
                    </button>
                  )}
                  {["mastering", "stable"].includes(chapter.status) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/teachback?chapter=${chapter.id}`);
                      }}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-500/5 px-3 text-[11px] font-medium text-purple-400 transition-all hover:bg-purple-500/10"
                    >
                      <MessageSquare size={12} />
                      Teach Back
                    </button>
                  )}
```

Also add `MessageSquare` to the lucide-react import at the top of Library.tsx.

- [ ] **Step 3: Add `teachback_available` queue items**

In `src-tauri/src/services/queue.rs`, add a new function after `get_quiz_items`:

```rust
fn get_teachback_items(conn: &Connection) -> Result<Vec<QueueItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ch.id, ch.title, s.name
             FROM chapters ch
             JOIN subjects s ON s.id = ch.subject_id
             WHERE ch.status IN ('mastering', 'stable')
               AND NOT EXISTS (
                   SELECT 1 FROM teachbacks t
                   WHERE t.chapter_id = ch.id AND t.mastery IN ('solid', 'ready')
               )
             ORDER BY ch.updated_at DESC
             LIMIT 10",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let title: String = row.get(1)?;
            let subject_name: String = row.get(2)?;
            Ok(QueueItem {
                item_type: "teachback_available".to_string(),
                score: 35,
                title,
                subtitle: subject_name,
                reason: "Practice explaining what you learned".to_string(),
                estimated_minutes: 5,
                target_id: id,
                target_route: format!("/teachback?chapter={id}"),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}
```

Then add `items.extend(get_teachback_items(conn)?);` in `get_dashboard`, after the quiz items line.

- [ ] **Step 4: Write a queue test for teachback items**

Add to `mod tests` in `queue.rs`:

```rust
    #[test]
    fn test_teachback_item_appears_for_mastering_chapter() {
        let db = setup_test_db();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
                 VALUES (1, 'Mastering Ch', 'mastering-ch', 'mastering', 10, datetime('now'), datetime('now'))",
                [],
            ).unwrap();
            let dash = get_dashboard(conn).unwrap();
            let tb_items: Vec<_> = dash.items.iter().filter(|i| i.item_type == "teachback_available").collect();
            assert_eq!(tb_items.len(), 1);
            assert_eq!(tb_items[0].score, 35);
            Ok(())
        }).expect("test failed");
    }
```

- [ ] **Step 5: Verify everything compiles and tests pass**

Run: `cd src-tauri && cargo test && cd .. && npx tsc --noEmit && npx biome check .`

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/pages/Reader.tsx src/pages/Library.tsx src-tauri/src/services/queue.rs
git commit -m "feat(teachback): add entry points in reader, library, and queue"
```

---

### Task 8: Integration Test

**Files:**
- Modify: `src-tauri/tests/integration_flow.rs`

- [ ] **Step 1: Add teachback import**

At the top of `integration_flow.rs`, add `teachback` to the use statement:

```rust
use app_lib::services::{cards, chunker, quiz, queue, reader, review, teachback};
```

- [ ] **Step 2: Write the integration test**

Add at the bottom of the file:

```rust
#[test]
fn test_teachback_flow() {
    let db = setup();
    let chapter_id = insert_chapter(&db, 1, "Trees", SAMPLE_MARKDOWN);

    db.with_conn(|conn| {
        // 1. Start teachback
        let start = teachback::start_teachback(conn, chapter_id).unwrap();
        assert!(!start.prompt.is_empty());
        assert_eq!(start.chapter_title, "Trees");

        // 2. Submit with weak scores → should create repair card
        let scores = teachback::RubricScores {
            accuracy: 20,
            clarity: 30,
            completeness: 10,
            example: 25,
            jargon: 15,
        };
        let result = teachback::finalize_teachback(
            conn,
            start.id,
            "Trees have branches",
            &scores,
            "Attempted an answer",
            "Missing all key concepts about BST properties",
            None,
        )
        .unwrap();

        assert_eq!(result.mastery, "weak");
        assert!(result.repair_card_id.is_some());

        // 3. Verify study event logged
        let event_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM study_events WHERE event_type = 'teachback'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(event_count, 1);

        // 4. List teachbacks
        let list = teachback::list_teachbacks(conn, None).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].mastery, Some("weak".to_string()));

        // 5. Start another one with self-rating → solid
        let start2 = teachback::start_teachback(conn, chapter_id).unwrap();
        let ratings = teachback::RubricScores {
            accuracy: 100,
            clarity: 100,
            completeness: 50,
            example: 50,
            jargon: 50,
        };
        let result2 = teachback::submit_self_rating(conn, start2.id, "Better explanation", &ratings).unwrap();
        assert_eq!(result2.mastery, "solid"); // avg = 70
        assert!(result2.repair_card_id.is_none());

        Ok(())
    })
    .expect("test_teachback_flow failed");
}
```

- [ ] **Step 3: Run integration tests**

Run: `cd src-tauri && cargo test --features test-utils test_teachback_flow -- --exact`

Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `cd src-tauri && cargo test --features test-utils`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/integration_flow.rs
git commit -m "test(teachback): add integration test for full teachback flow"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run the full gate check**

```bash
npx tsc --noEmit && npx biome check . && cd src-tauri && cargo clippy && cargo test && cargo test --features test-utils
```

Expected: All pass, zero errors

- [ ] **Step 2: Verify file structure**

Confirm these files exist:
- `src-tauri/src/services/teachback.rs`
- `src-tauri/src/commands/teachback.rs`
- `src/pages/Teachback.tsx`

And these files were modified:
- `src-tauri/src/services/mod.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri.ts`
- `src/App.tsx`
- `src/pages/Reader.tsx`
- `src/pages/Library.tsx`
- `src-tauri/src/services/queue.rs`
- `src-tauri/tests/integration_flow.rs`
