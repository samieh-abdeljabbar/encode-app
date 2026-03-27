CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY,
  subject_name TEXT NOT NULL,
  subject_slug TEXT NOT NULL,
  duration_secs INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_subject ON study_sessions(subject_slug);
CREATE INDEX IF NOT EXISTS idx_sessions_completed ON study_sessions(completed_at);
