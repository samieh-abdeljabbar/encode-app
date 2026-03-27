CREATE TABLE IF NOT EXISTS analysis_cache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path       TEXT    NOT NULL,
  section_index   INTEGER NOT NULL,
  fingerprint     TEXT    NOT NULL,
  provider        TEXT    NOT NULL,
  model           TEXT    NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  analysis        TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(file_path, section_index, fingerprint, provider, model)
);
CREATE INDEX IF NOT EXISTS idx_ac_lookup
  ON analysis_cache(file_path, section_index, provider, model);
CREATE INDEX IF NOT EXISTS idx_ac_created
  ON analysis_cache(created_at);
