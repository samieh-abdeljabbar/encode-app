//! End-to-end integration tests for the Encode study flow.
//! These exercise the full backend service layer with an in-memory SQLite database.

use app_lib::db::Database;
use app_lib::services::{cards, chunker, notes, note_links, quiz, queue, reader, review, teachback};

fn setup() -> Database {
    let db = Database::open_memory().expect("Failed to create in-memory DB");
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO subjects (slug, name, created_at) VALUES ('cs', 'Computer Science', datetime('now'))",
            [],
        ).unwrap();
        Ok(())
    }).expect("setup failed");
    db
}

fn insert_chapter(db: &Database, subject_id: i64, title: &str, markdown: &str) -> i64 {
    db.with_conn(|conn| {
        let slug = title.to_lowercase().replace(' ', "-");
        let sections = chunker::split_into_sections(markdown);
        let word_count: i32 = sections.iter().map(|s| s.word_count).sum();
        let est_minutes = (word_count as f64 / 200.0).ceil() as i64;

        conn.execute(
            "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'new', ?4, datetime('now'), datetime('now'))",
            rusqlite::params![subject_id, title, slug, est_minutes],
        ).unwrap();

        let chapter_id = conn.last_insert_rowid();

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
            ).unwrap();
        }

        Ok(chapter_id)
    }).expect("Failed to insert chapter")
}

const SAMPLE_MARKDOWN: &str = r#"## Data Structures Overview

Data structures are ways to organize and store data. Common types include arrays, linked lists, stacks, queues, trees, and hash tables. Each has different performance characteristics for insertion, deletion, and lookup operations.

## Stacks and Queues

A stack is a LIFO (Last In, First Out) data structure. Think of a stack of plates — you add and remove from the top. Key operations: push (add to top), pop (remove from top), peek (view top).

A queue is a FIFO (First In, First Out) data structure. Think of a line at a store — first person in line is served first. Key operations: enqueue (add to back), dequeue (remove from front).

## Trees and Graphs

A binary tree has at most two children per node. A binary search tree (BST) maintains ordering: left children are smaller, right children are larger. This enables O(log n) average-case lookup.

Graphs are more general — nodes can have any number of connections. They can be directed or undirected, weighted or unweighted.

## Hash Tables

Hash tables provide O(1) average-case lookup by computing a hash of the key to determine the storage location. Collisions are handled through chaining (linked lists at each slot) or open addressing (probing for next empty slot).
"#;

// ──────────────────────────────────────────────
// Test 1: Full Study Loop
// ──────────────────────────────────────────────

#[test]
fn test_full_study_loop() {
    let db = setup();

    // 1. Create chapter with sections
    let chapter_id = insert_chapter(&db, 1, "Data Structures", SAMPLE_MARKDOWN);

    db.with_conn(|conn| {
        // Verify chapter created with correct status
        let status: String = conn.query_row(
            "SELECT status FROM chapters WHERE id = ?1", [chapter_id], |r| r.get(0)
        ).unwrap();
        assert_eq!(status, "new");

        // Verify sections created
        let section_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM chapter_sections WHERE chapter_id = ?1", [chapter_id], |r| r.get(0)
        ).unwrap();
        assert_eq!(section_count, 4, "Should have 4 sections from H2 splits");

        // 2. Load reader session
        let session = reader::get_reader_session(conn, chapter_id).unwrap();
        assert_eq!(session.sections.len(), 4);
        assert_eq!(session.current_index, 0);
        assert_eq!(session.chapter.status, "new");

        // 3. Mark all sections as seen
        for i in 0..4 {
            reader::mark_section_seen(conn, chapter_id, i).unwrap();
        }

        // Verify chapter transitioned to "reading"
        let status: String = conn.query_row(
            "SELECT status FROM chapters WHERE id = ?1", [chapter_id], |r| r.get(0)
        ).unwrap();
        assert_eq!(status, "reading");

        // 4. Submit section checks — mix of ratings
        // Section 0: correct
        let r0 = reader::process_check(conn, chapter_id, 0, "Arrays, linked lists, stacks, queues, trees, hash tables", "correct").unwrap();
        assert_eq!(r0.outcome, "correct");
        assert!(!r0.repair_card_created);

        // Section 1: partial (gets one retry)
        let r1 = reader::process_check(conn, chapter_id, 1, "Stack is LIFO", "partial").unwrap();
        assert!(r1.can_retry);

        // Retry section 1: correct this time
        let r1b = reader::process_check(conn, chapter_id, 1, "Stack is LIFO, Queue is FIFO", "correct").unwrap();
        assert!(!r1b.can_retry);

        // Section 2: off_track — should create repair card
        let r2 = reader::process_check(conn, chapter_id, 2, "Trees have three children", "off_track").unwrap();
        assert!(r2.repair_card_created);

        // Section 3: correct — this completes all sections
        let r3 = reader::process_check(conn, chapter_id, 3, "Hash tables use hashing for O(1) lookup", "correct").unwrap();
        assert!(r3.chapter_complete);

        // Verify chapter is now awaiting_synthesis
        let status: String = conn.query_row(
            "SELECT status FROM chapters WHERE id = ?1", [chapter_id], |r| r.get(0)
        ).unwrap();
        assert_eq!(status, "awaiting_synthesis");

        // 5. Verify repair card was created
        let repair_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM cards WHERE source_type = 'repair' AND chapter_id = ?1",
            [chapter_id], |r| r.get(0)
        ).unwrap();
        assert_eq!(repair_count, 1);

        // 6. Submit synthesis
        let syn = reader::process_synthesis(conn, chapter_id, "Data structures organize data with different performance tradeoffs. Stacks use LIFO, queues use FIFO, trees enable logarithmic lookup, and hash tables provide constant-time access.").unwrap();
        assert!(syn.success);
        assert_eq!(syn.new_status, "ready_for_quiz");

        // 7. Generate quiz
        let quiz_state = quiz::generate_quiz(conn, chapter_id, "intermediate", 8, "mixed").unwrap();
        assert_eq!(quiz_state.chapter_title, "Data Structures");
        assert!(quiz_state.questions.len() >= 4, "Should have at least 4 questions (one per section)");
        assert!(quiz_state.attempts.iter().all(|a| a.result == "unanswered"));

        // Verify question types are mixed
        let types: Vec<&str> = quiz_state.questions.iter().map(|q| q.question_type.as_str()).collect();
        assert!(types.contains(&"short_answer"), "Should have short_answer questions");

        // 8. Answer questions — mix of correct and incorrect
        let quiz_id = quiz_state.id;
        for (idx, q) in quiz_state.questions.iter().enumerate() {
            match q.question_type.as_str() {
                "short_answer" => {
                    let r = quiz::submit_answer(conn, quiz_id, idx as i64, "my answer").unwrap();
                    assert!(r.needs_self_rating, "Short answer should need self-rating");
                    // Self-rate: first one correct, rest incorrect
                    let rating = if idx == 0 { "correct" } else { "incorrect" };
                    quiz::submit_self_rating(conn, quiz_id, idx as i64, rating).unwrap();
                }
                "multiple_choice" => {
                    // Answer correctly
                    let r = quiz::submit_answer(conn, quiz_id, idx as i64, &q.correct_answer).unwrap();
                    assert_eq!(r.verdict, "correct");
                    assert!(!r.needs_self_rating);
                }
                "true_false" => {
                    // Answer correctly
                    let r = quiz::submit_answer(conn, quiz_id, idx as i64, &q.correct_answer).unwrap();
                    assert_eq!(r.verdict, "correct");
                }
                "fill_blank" => {
                    // Answer correctly
                    let r = quiz::submit_answer(conn, quiz_id, idx as i64, &q.correct_answer).unwrap();
                    assert_eq!(r.verdict, "correct");
                }
                _ => panic!("Unknown question type: {}", q.question_type),
            }
        }

        // 9. Complete quiz
        let summary = quiz::complete_quiz(conn, quiz_id).unwrap();
        assert_eq!(summary.total, quiz_state.questions.len() as i64);
        assert!(summary.correct > 0, "Should have some correct answers");

        // 10. Verify study events logged
        // Expected: 5 section_check_submitted (4 checks + 1 retry) + 1 synthesis_completed + quiz events
        let check_events: i64 = conn.query_row(
            "SELECT COUNT(*) FROM study_events WHERE event_type = 'section_check_submitted'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(check_events, 5, "Should have 5 section check events (4 sections + 1 retry)");

        let synthesis_events: i64 = conn.query_row(
            "SELECT COUNT(*) FROM study_events WHERE event_type = 'synthesis_completed'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(synthesis_events, 1, "Should have 1 synthesis event");

        Ok(())
    });
}

// ──────────────────────────────────────────────
// Test 2: Card CRUD + Review
// ──────────────────────────────────────────────

#[test]
fn test_card_crud_and_review() {
    let db = setup();

    db.with_conn(|conn| {
        // Create basic card
        let basic = cards::create_card(conn, &cards::CardCreateInput {
            subject_id: 1,
            chapter_id: None,
            prompt: "What is a binary tree?".to_string(),
            answer: "A tree where each node has at most two children".to_string(),
            card_type: "basic".to_string(),
        }).unwrap();
        assert_eq!(basic.card_type, "basic");
        assert_eq!(basic.source_type, "manual");

        // Create cloze card
        let cloze = cards::create_card(conn, &cards::CardCreateInput {
            subject_id: 1,
            chapter_id: None,
            prompt: "A {{stack}} uses LIFO ordering".to_string(),
            answer: "LIFO data structure".to_string(),
            card_type: "cloze".to_string(),
        }).unwrap();
        assert_eq!(cloze.card_type, "cloze");

        // Create reversed card (creates 2 cards)
        cards::create_card(conn, &cards::CardCreateInput {
            subject_id: 1,
            chapter_id: None,
            prompt: "FIFO".to_string(),
            answer: "Queue".to_string(),
            card_type: "reversed".to_string(),
        }).unwrap();

        // List all cards — should be 4 (basic + cloze + 2 reversed)
        let all = cards::list_cards(conn, None, None).unwrap();
        assert_eq!(all.len(), 4);

        // Filter by subject
        let filtered = cards::list_cards(conn, Some(1), None).unwrap();
        assert_eq!(filtered.len(), 4);

        // Search
        let search = cards::list_cards(conn, None, Some("binary")).unwrap();
        assert_eq!(search.len(), 1);

        // Get due cards (all cards should be due immediately after creation)
        let due = review::get_due_cards(conn, 50).unwrap();
        assert_eq!(due.len(), 4);

        // Submit a rating
        let rating_result = review::submit_rating(conn, basic.id, 3).unwrap(); // Good
        assert!(rating_result.next_review_days > 0);

        // Card should no longer be due (next_review in the future)
        let due_after = review::get_due_cards(conn, 50).unwrap();
        assert_eq!(due_after.len(), 3, "Rated card should no longer be due");

        Ok(())
    });
}

// ──────────────────────────────────────────────
// Test 3: Quiz Failure + Retest Scheduling
// ──────────────────────────────────────────────

#[test]
fn test_quiz_failure_and_retest() {
    let db = setup();
    let chapter_id = insert_chapter(&db, 1, "Algorithms", SAMPLE_MARKDOWN);

    db.with_conn(|conn| {
        // Fast-track to ready_for_quiz
        for i in 0..4 {
            reader::mark_section_seen(conn, chapter_id, i).unwrap();
            reader::process_check(conn, chapter_id, i, "answer", "correct").unwrap();
        }
        reader::process_synthesis(conn, chapter_id, "synthesis").unwrap();

        let status: String = conn.query_row(
            "SELECT status FROM chapters WHERE id = ?1", [chapter_id], |r| r.get(0)
        ).unwrap();
        assert_eq!(status, "ready_for_quiz");

        // Generate quiz and answer everything wrong
        let quiz_state = quiz::generate_quiz(conn, chapter_id, "intermediate", 8, "mixed").unwrap();
        let quiz_id = quiz_state.id;

        for (idx, q) in quiz_state.questions.iter().enumerate() {
            if q.question_type == "short_answer" {
                quiz::submit_answer(conn, quiz_id, idx as i64, "wrong").unwrap();
                quiz::submit_self_rating(conn, quiz_id, idx as i64, "incorrect").unwrap();
            } else {
                quiz::submit_answer(conn, quiz_id, idx as i64, "totally wrong answer").unwrap();
            }
        }

        let summary = quiz::complete_quiz(conn, quiz_id).unwrap();
        assert!(summary.score < 0.8, "Score should be below passing: {}", summary.score);
        assert!(summary.retest_scheduled);
        assert_eq!(summary.incorrect, summary.total, "All should be incorrect (no partials expected)");

        // Chapter should stay at ready_for_quiz
        let status: String = conn.query_row(
            "SELECT status FROM chapters WHERE id = ?1", [chapter_id], |r| r.get(0)
        ).unwrap();
        assert_eq!(status, "ready_for_quiz");

        // Repair cards should have been created
        let repair_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM cards WHERE source_type = 'quiz_miss'",
            [], |r| r.get(0)
        ).unwrap();
        assert!(repair_count > 0, "Should have repair cards from quiz misses");

        Ok(())
    });
}

// ──────────────────────────────────────────────
// Test 4: Queue Ordering
// ──────────────────────────────────────────────

#[test]
fn test_queue_ordering() {
    let db = setup();

    db.with_conn(|conn| {
        // Create a new chapter (score 20)
        conn.execute(
            "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
             VALUES (1, 'New Chapter', 'new-ch', 'new', 10, datetime('now'), datetime('now'))",
            [],
        ).unwrap();

        // Create a reading chapter (score 55)
        conn.execute(
            "INSERT INTO chapters (subject_id, title, slug, status, estimated_minutes, created_at, updated_at)
             VALUES (1, 'Reading Chapter', 'reading-ch', 'reading', 10, datetime('now'), datetime('now'))",
            [],
        ).unwrap();

        // Create a due card (score 60+)
        conn.execute(
            "INSERT INTO cards (subject_id, source_type, prompt, answer, card_type, status, created_at)
             VALUES (1, 'manual', 'What is X?', 'Y', 'basic', 'active', datetime('now'))",
            [],
        ).unwrap();
        let card_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO card_schedule (card_id, next_review, stability, difficulty, reps, lapses)
             VALUES (?1, datetime('now', '-1 hour'), 2.0, 5.0, 1, 0)",
            [card_id],
        ).unwrap();

        let dashboard = queue::get_dashboard(conn).unwrap();

        // Verify ordering: due card > reading chapter > new chapter
        assert!(dashboard.items.len() >= 3);
        assert!(dashboard.items[0].score >= dashboard.items[1].score,
            "Items should be sorted by score descending");

        // Due card should be first (highest score)
        assert_eq!(dashboard.items[0].item_type, "due_card");

        // Summary should reflect the state
        assert_eq!(dashboard.summary.due_cards, 1);
        assert_eq!(dashboard.summary.chapters_in_progress, 1); // reading chapter

        Ok(())
    });
}

// ──────────────────────────────────────────────
// Test 5: Quiz List
// ──────────────────────────────────────────────

#[test]
fn test_quiz_list() {
    let db = setup();
    let chapter_id = insert_chapter(&db, 1, "Testing", SAMPLE_MARKDOWN);

    db.with_conn(|conn| {
        // Fast-track to ready_for_quiz
        for i in 0..4 {
            reader::mark_section_seen(conn, chapter_id, i).unwrap();
            reader::process_check(conn, chapter_id, i, "a", "correct").unwrap();
        }
        reader::process_synthesis(conn, chapter_id, "s").unwrap();

        // Generate and complete a quiz
        let qs = quiz::generate_quiz(conn, chapter_id, "intermediate", 8, "mixed").unwrap();
        for (idx, q) in qs.questions.iter().enumerate() {
            if q.question_type == "short_answer" {
                quiz::submit_answer(conn, qs.id, idx as i64, "a").unwrap();
                quiz::submit_self_rating(conn, qs.id, idx as i64, "correct").unwrap();
            } else {
                quiz::submit_answer(conn, qs.id, idx as i64, &q.correct_answer).unwrap();
            }
        }
        quiz::complete_quiz(conn, qs.id).unwrap();

        // List quizzes
        let quizzes = quiz::list_quizzes(conn, None).unwrap();
        assert_eq!(quizzes.len(), 1);
        assert_eq!(quizzes[0].chapter_title, "Testing");
        assert!(quizzes[0].score.is_some());
        assert_eq!(quizzes[0].question_count, 4);

        // Filter by subject
        let filtered = quiz::list_quizzes(conn, Some(1)).unwrap();
        assert_eq!(filtered.len(), 1);

        let empty = quiz::list_quizzes(conn, Some(999)).unwrap();
        assert_eq!(empty.len(), 0);

        Ok(())
    });
}

// ──────────────────────────────────────────────
// Test 6: Teach-Back Flow
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
// Test 7: Notes Full Flow
// ──────────────────────────────────────────────

#[test]
fn test_notes_full_flow() {
    let db = setup();
    let tmp = tempfile::tempdir().expect("tmpdir");
    std::fs::create_dir_all(tmp.path().join("notes")).unwrap();

    db.with_conn(|conn| {
        // 1. Create notes with wikilinks
        let note_a = notes::create_note(conn, tmp.path(), "Binary Trees", None, None, "A binary tree has at most two children. See [[Hash Tables]] for comparison.").unwrap();
        assert_eq!(note_a.title, "Binary Trees");
        assert!(note_a.file_path.ends_with(".md"));

        let note_b = notes::create_note(conn, tmp.path(), "Hash Tables", None, None, "Hash tables provide O(1) lookup. Related: [[Binary Trees]].").unwrap();

        // 2. Resolve links and verify backlinks
        note_links::resolve_links(conn).unwrap();

        let backlinks_a = note_links::get_backlinks(conn, note_a.id).unwrap();
        assert_eq!(backlinks_a.len(), 1);
        assert_eq!(backlinks_a[0].title, "Hash Tables");

        let backlinks_b = note_links::get_backlinks(conn, note_b.id).unwrap();
        assert_eq!(backlinks_b.len(), 1);
        assert_eq!(backlinks_b[0].title, "Binary Trees");

        // 3. Get note content
        let detail = notes::get_note(conn, tmp.path(), note_a.id).unwrap();
        assert!(detail.content.contains("binary tree"));

        // 4. Graph data
        let graph = note_links::get_graph_data(conn).unwrap();
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 2); // bidirectional

        // 5. Local graph
        let local = note_links::get_local_graph(conn, note_a.id, 1).unwrap();
        assert_eq!(local.nodes.len(), 2);

        // 6. Rename note — backlinks should update
        let renamed = notes::rename_note(conn, tmp.path(), note_a.id, "BST Overview").unwrap();
        assert_eq!(renamed.title, "BST Overview");

        // 7. Search — FTS5 uses token matching, search for a single word
        let results = notes::search_notes(conn, "lookup").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Hash Tables");

        // 8. Create note in folder
        notes::create_folder(tmp.path(), "algorithms").unwrap();
        let foldered = notes::create_note(conn, tmp.path(), "Sorting", Some("algorithms"), None, "Merge sort and quicksort").unwrap();
        assert!(foldered.file_path.starts_with("algorithms/"));

        // 9. List with filter
        let all = notes::list_notes(conn, None, None, None).unwrap();
        assert_eq!(all.len(), 3);
        let in_folder = notes::list_notes(conn, Some("algorithms"), None, None).unwrap();
        assert_eq!(in_folder.len(), 1);

        // 10. Delete
        notes::delete_note(conn, tmp.path(), foldered.id).unwrap();
        let after_delete = notes::list_notes(conn, None, None, None).unwrap();
        assert_eq!(after_delete.len(), 2);

        // 11. Note titles for autocomplete
        let titles = notes::get_note_titles(conn).unwrap();
        assert_eq!(titles.len(), 2);

        Ok(())
    })
    .expect("test_notes_full_flow failed");
}
