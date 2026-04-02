-- Add 'ai_generated' to cards.source_type CHECK constraint.
-- SQLite cannot ALTER CHECK constraints, so we recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS cards_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL DEFAULT 'repair' CHECK(source_type IN ('repair', 'quiz_miss', 'manual', 'ai_suggest', 'teachback_miss', 'ai_generated')),
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    card_type TEXT NOT NULL DEFAULT 'basic' CHECK(card_type IN ('basic', 'cloze', 'reversed')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'buried')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO cards_new SELECT * FROM cards;

DROP TABLE cards;

ALTER TABLE cards_new RENAME TO cards;

PRAGMA foreign_keys = ON;
