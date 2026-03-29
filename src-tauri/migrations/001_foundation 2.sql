-- Encode v2 foundation schema
-- Applied via PRAGMA user_version = 1
-- WAL mode is set at Database::open(), not here.

-- Top-level subject identity
CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    archived_at TEXT
);

-- Imported raw material and normalized content
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'url' CHECK(kind IN ('url', 'manual', 'pdf', 'paste')),
    title TEXT NOT NULL,
    source_url TEXT,
    author TEXT,
    raw_content TEXT,
    normalized_markdown TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Learner-facing study units
CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reading', 'awaiting_synthesis', 'ready_for_quiz', 'mastering', 'stable')),
    estimated_minutes INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(subject_id, slug)
);

-- Deterministic chunking results
CREATE TABLE IF NOT EXISTS chapter_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    section_index INTEGER NOT NULL,
    heading TEXT,
    body_markdown TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    difficulty_hint TEXT,  -- easy, moderate, hard (optional AI-derived)
    keywords_json TEXT,    -- JSON array of extracted keywords
    UNIQUE(chapter_id, section_index)
);

-- Append-only learner action log
-- card_id and quiz_id are intentionally NOT foreign keys.
-- Events must survive card/quiz deletion for analytics and queue ranking.
CREATE TABLE IF NOT EXISTS study_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    card_id INTEGER,       -- intentionally no FK: events survive card/quiz deletion
    quiz_id INTEGER,       -- intentionally no FK: events survive card/quiz deletion
    event_type TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Flashcard definitions and provenance
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL DEFAULT 'repair' CHECK(source_type IN ('repair', 'quiz_miss', 'manual', 'ai_suggest')),
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    card_type TEXT NOT NULL DEFAULT 'basic' CHECK(card_type IN ('basic', 'cloze', 'reversed')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'buried')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Current FSRS scheduling state per card
CREATE TABLE IF NOT EXISTS card_schedule (
    card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    next_review TEXT NOT NULL,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_reviewed TEXT
);

-- Historical card review log
CREATE TABLE IF NOT EXISTS card_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,  -- 1=Again, 2=Hard, 3=Good, 4=Easy
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    scheduled_days REAL NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL
);

-- Quiz generation metadata
CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    scope_type TEXT NOT NULL DEFAULT 'chapter' CHECK(scope_type IN ('chapter', 'subject', 'multi_chapter')),
    config_json TEXT,
    score REAL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Question-level learner results
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_index INTEGER NOT NULL,
    question_json TEXT NOT NULL,
    user_answer TEXT,
    evaluation_json TEXT,
    result TEXT NOT NULL DEFAULT 'unanswered' CHECK(result IN ('correct', 'partial', 'incorrect', 'unanswered')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Teach-back entries and evaluations
CREATE TABLE IF NOT EXISTS teachbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    prompt TEXT NOT NULL,
    response TEXT,
    evaluation_json TEXT,
    mastery TEXT CHECK(mastery IN ('weak', 'developing', 'solid', 'ready') OR mastery IS NULL),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI call metadata (not full payloads)
CREATE TABLE IF NOT EXISTS ai_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT,
    status TEXT NOT NULL,
    latency_ms INTEGER,
    error_summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key-value settings for typed local app preferences
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for hot query paths
CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_sections_chapter ON chapter_sections(chapter_id, section_index);
CREATE INDEX IF NOT EXISTS idx_events_type ON study_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_subject ON study_events(subject_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_chapter ON study_events(chapter_id, event_type);
CREATE INDEX IF NOT EXISTS idx_card_schedule_due ON card_schedule(next_review);
CREATE INDEX IF NOT EXISTS idx_card_reviews_card ON card_reviews(card_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject ON quizzes(subject_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id, question_index);
CREATE INDEX IF NOT EXISTS idx_ai_runs_feature ON ai_runs(feature, created_at);

-- FTS5 for full-text search across chapter sections.
-- Standalone (no content= binding) so column names are independent of the source table.
-- Triggers keep it in sync with chapter_sections.
CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
    heading,
    body,
    tokenize='porter'
);

-- Triggers to keep FTS in sync with chapter_sections
CREATE TRIGGER IF NOT EXISTS sections_fts_insert AFTER INSERT ON chapter_sections BEGIN
    INSERT INTO sections_fts(rowid, heading, body)
    VALUES (new.id, COALESCE(new.heading, ''), new.body_markdown);
END;

CREATE TRIGGER IF NOT EXISTS sections_fts_delete AFTER DELETE ON chapter_sections BEGIN
    DELETE FROM sections_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS sections_fts_update AFTER UPDATE ON chapter_sections BEGIN
    DELETE FROM sections_fts WHERE rowid = old.id;
    INSERT INTO sections_fts(rowid, heading, body)
    VALUES (new.id, COALESCE(new.heading, ''), new.body_markdown);
END;
