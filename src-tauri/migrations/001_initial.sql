-- Enable WAL mode for concurrent reads
PRAGMA journal_mode=WAL;

-- Full-text search index (rebuilt from vault files)
CREATE VIRTUAL TABLE IF NOT EXISTS vault_fts USING fts5(
  file_path,
  subject,
  topic,
  content,
  tokenize='porter'
);

-- File index for fast lookups without scanning disk
CREATE TABLE IF NOT EXISTS file_index (
  file_path TEXT PRIMARY KEY,
  subject TEXT,
  topic TEXT,
  file_type TEXT,
  word_count INTEGER,
  updated_at TEXT,
  frontmatter_json TEXT
);

-- Spaced repetition schedule cache
CREATE TABLE IF NOT EXISTS sr_schedule (
  card_id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  next_review TEXT NOT NULL,
  interval_days REAL DEFAULT 1.0,
  ease_factor REAL DEFAULT 2.5,
  last_reviewed TEXT
);

-- Daily commitment streak tracking
CREATE TABLE IF NOT EXISTS daily_streaks (
  date TEXT PRIMARY KEY,
  commitment_text TEXT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT
);

-- Quiz score history for adaptive difficulty
CREATE TABLE IF NOT EXISTS quiz_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  bloom_level INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  attempted_at TEXT DEFAULT (datetime('now'))
);
