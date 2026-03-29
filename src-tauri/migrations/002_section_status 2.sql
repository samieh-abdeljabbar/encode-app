-- Add status tracking to chapter sections for reader progression
ALTER TABLE chapter_sections ADD COLUMN status TEXT NOT NULL DEFAULT 'unseen'
  CHECK(status IN ('unseen', 'seen', 'checked_correct', 'checked_partial', 'checked_off_track'));
