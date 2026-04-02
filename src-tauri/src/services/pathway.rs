use crate::services::cards;
use crate::services::chunker;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

// Types
#[derive(Serialize, Deserialize, Clone)]
pub struct ChapterOutline {
    pub title: String,
    pub description: String,
    pub estimated_minutes: i32,
}

#[derive(Serialize, Deserialize)]
pub struct PathwayOutline {
    pub subject_name: String,
    pub chapters: Vec<ChapterOutline>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FlashcardPair {
    pub prompt: String,
    pub answer: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SuggestedUrl {
    pub title: String,
    pub url: String,
}

#[derive(Serialize, Deserialize)]
pub struct ChapterContent {
    pub content: String,
    pub flashcards: Vec<FlashcardPair>,
    pub suggested_urls: Vec<SuggestedUrl>,
}

#[derive(Serialize)]
pub struct PathwayResult {
    pub subject_id: i64,
    pub subject_name: String,
    pub chapters_created: i32,
    pub flashcards_created: i32,
    pub suggested_urls: Vec<SuggestedUrl>,
}

/// AI prompt for outline generation.
pub fn outline_prompt(topic: &str, mastery: &str, scope: &str) -> (String, String) {
    let system = r#"You are a curriculum designer. Given a learning topic, mastery level, and scope, create a structured course outline.

Return JSON only:
{"subject_name":"Course title","chapters":[{"title":"Chapter title","description":"Brief description","estimated_minutes":10}]}

Rules:
- Chapter titles should be clear and specific
- Order chapters from foundational to advanced
- For beginner: focus on core concepts, definitions, practical basics
- For intermediate: assume fundamentals, focus on application and deeper understanding
- For expert: assume strong foundation, focus on advanced topics, edge cases, best practices
- Quick Overview: 3-4 chapters, Standard Course: 6-8 chapters, Deep Dive: 10-15 chapters
- Return ONLY valid JSON, no markdown fences"#
        .to_string();

    let user = format!(
        "Topic: {}\nMastery level: {}\nScope: {}",
        topic, mastery, scope
    );
    (system, user)
}

/// AI prompt for chapter content generation.
pub fn chapter_content_prompt(
    topic: &str,
    mastery: &str,
    title: &str,
    description: &str,
    chapter_index: i32,
    total_chapters: i32,
) -> (String, String) {
    let system = r#"You are a study content writer. Generate comprehensive study material for a chapter in a course.

Return JSON only:
{"content":"Full markdown with ## headings, explanations, examples. Include ## References at bottom.","flashcards":[{"prompt":"Question","answer":"Answer"}],"suggested_urls":[{"title":"Resource","url":"https://..."}]}

Rules:
- Content should have 2-4 sections with ## headings
- Write for the specified mastery level
- For beginner: explain terms, use analogies, step-by-step
- For intermediate: assume basics, go deeper, show patterns
- For expert: advanced techniques, trade-offs, real-world considerations
- Include concrete examples and practical applications
- Generate 3-5 flashcards testing key concepts (ask why/how, not just what)
- Suggest 2-3 real, well-known URLs for further reading
- Content should be 500-1500 words
- Return ONLY valid JSON, no markdown fences"#
        .to_string();

    let user = format!(
        "Course topic: {}\nMastery level: {}\nChapter {}/{}: {}\nDescription: {}",
        topic,
        mastery,
        chapter_index + 1,
        total_chapters,
        title,
        description
    );
    (system, user)
}

/// Create a full learning pathway in the database: subject, chapters, sections, and flashcards.
pub fn create_pathway(
    conn: &Connection,
    subject_name: &str,
    chapters: &[(ChapterOutline, ChapterContent)],
) -> Result<PathwayResult, String> {
    // Create subject
    let slug = subject_name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric(), "-");
    conn.execute(
        "INSERT INTO subjects (slug, name, created_at) VALUES (?1, ?2, datetime('now'))",
        rusqlite::params![slug, subject_name],
    )
    .map_err(|e| format!("Failed to create subject: {e}"))?;
    let subject_id = conn.last_insert_rowid();

    let mut total_flashcards = 0i32;
    let mut all_urls: Vec<SuggestedUrl> = Vec::new();

    for (outline, content) in chapters {
        // Split content into sections using the chunker
        let sections = chunker::split_into_sections(&content.content);
        let word_count: i32 = sections.iter().map(|s| s.word_count).sum();
        let est_minutes = outline
            .estimated_minutes
            .max((word_count as f64 / 200.0).ceil() as i32);
        let chapter_slug = outline
            .title
            .to_lowercase()
            .replace(|c: char| !c.is_alphanumeric(), "-");

        conn.execute(
            "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'new', ?4, datetime('now'), datetime('now'))",
            rusqlite::params![subject_id, outline.title, chapter_slug, est_minutes],
        )
        .map_err(|e| format!("Failed to create chapter: {e}"))?;
        let chapter_id = conn.last_insert_rowid();

        // Insert sections
        for section in &sections {
            conn.execute(
                "INSERT INTO chapter_sections (chapter_id, section_index, heading, body_markdown, word_count, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'unseen')",
                rusqlite::params![
                    chapter_id,
                    section.section_index,
                    section.heading,
                    section.body_markdown,
                    section.word_count
                ],
            )
            .map_err(|e| format!("Failed to insert section: {e}"))?;
        }

        // Create flashcards
        for fc in &content.flashcards {
            let _ = cards::insert_card_with_schedule_pub(
                conn,
                subject_id,
                Some(chapter_id),
                "ai_generated",
                &fc.prompt,
                &fc.answer,
                "basic",
            );
            total_flashcards += 1;
        }

        all_urls.extend(content.suggested_urls.clone());
    }

    Ok(PathwayResult {
        subject_id,
        subject_name: subject_name.to_string(),
        chapters_created: chapters.len() as i32,
        flashcards_created: total_flashcards,
        suggested_urls: all_urls,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup_db() -> Database {
        Database::open_memory().expect("open")
    }

    #[test]
    fn test_outline_prompt_contains_inputs() {
        let (system, user) = outline_prompt("Rust", "beginner", "Standard Course");
        assert!(system.contains("curriculum designer"));
        assert!(user.contains("Rust"));
        assert!(user.contains("beginner"));
        assert!(user.contains("Standard Course"));
    }

    #[test]
    fn test_chapter_content_prompt_contains_inputs() {
        let (system, user) =
            chapter_content_prompt("Rust", "intermediate", "Ownership", "Memory model", 0, 5);
        assert!(system.contains("study content writer"));
        assert!(user.contains("Rust"));
        assert!(user.contains("intermediate"));
        assert!(user.contains("1/5"));
        assert!(user.contains("Ownership"));
    }

    #[test]
    fn test_create_pathway_inserts_subject_and_chapters() {
        let db = setup_db();
        db.with_conn(|conn| {
            let chapters = vec![(
                ChapterOutline {
                    title: "Intro to Testing".to_string(),
                    description: "Basics of unit testing".to_string(),
                    estimated_minutes: 10,
                },
                ChapterContent {
                    content: "## What is Testing\nTesting verifies correctness.\n\n## Why Test\nBugs are costly."
                        .to_string(),
                    flashcards: vec![FlashcardPair {
                        prompt: "What is unit testing?".to_string(),
                        answer: "Testing individual units of code.".to_string(),
                    }],
                    suggested_urls: vec![SuggestedUrl {
                        title: "Rust Book".to_string(),
                        url: "https://doc.rust-lang.org/book/".to_string(),
                    }],
                },
            )];

            let result = create_pathway(conn, "Test Subject", &chapters)?;
            assert_eq!(result.subject_name, "Test Subject");
            assert_eq!(result.chapters_created, 1);
            assert_eq!(result.flashcards_created, 1);
            assert_eq!(result.suggested_urls.len(), 1);

            // Verify subject was created
            let name: String = conn
                .query_row(
                    "SELECT name FROM subjects WHERE id = ?1",
                    [result.subject_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            assert_eq!(name, "Test Subject");

            // Verify chapter was created
            let ch_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM chapters WHERE subject_id = ?1",
                    [result.subject_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            assert_eq!(ch_count, 1);

            // Verify sections were created (2 sections from the content)
            let sec_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM chapter_sections",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            assert_eq!(sec_count, 2);

            // Verify flashcard was created with ai_generated source_type
            let source: String = conn
                .query_row(
                    "SELECT source_type FROM cards WHERE subject_id = ?1",
                    [result.subject_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            assert_eq!(source, "ai_generated");

            Ok(())
        })
        .expect("pathway creation should succeed");
    }

    #[test]
    fn test_create_pathway_multiple_chapters() {
        let db = setup_db();
        db.with_conn(|conn| {
            let chapters = vec![
                (
                    ChapterOutline {
                        title: "Chapter One".to_string(),
                        description: "First chapter".to_string(),
                        estimated_minutes: 5,
                    },
                    ChapterContent {
                        content: "## Section A\nContent A.".to_string(),
                        flashcards: vec![
                            FlashcardPair {
                                prompt: "Q1".to_string(),
                                answer: "A1".to_string(),
                            },
                            FlashcardPair {
                                prompt: "Q2".to_string(),
                                answer: "A2".to_string(),
                            },
                        ],
                        suggested_urls: vec![],
                    },
                ),
                (
                    ChapterOutline {
                        title: "Chapter Two".to_string(),
                        description: "Second chapter".to_string(),
                        estimated_minutes: 8,
                    },
                    ChapterContent {
                        content: "## Section B\nContent B.".to_string(),
                        flashcards: vec![FlashcardPair {
                            prompt: "Q3".to_string(),
                            answer: "A3".to_string(),
                        }],
                        suggested_urls: vec![SuggestedUrl {
                            title: "Example".to_string(),
                            url: "https://example.com".to_string(),
                        }],
                    },
                ),
            ];

            let result = create_pathway(conn, "Multi Chapter Course", &chapters)?;
            assert_eq!(result.chapters_created, 2);
            assert_eq!(result.flashcards_created, 3);
            assert_eq!(result.suggested_urls.len(), 1);

            Ok(())
        })
        .expect("multi-chapter pathway should succeed");
    }
}
