ALTER TABLE notes
ADD COLUMN chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_subject_id ON notes(subject_id);
CREATE INDEX IF NOT EXISTS idx_notes_chapter_id ON notes(chapter_id);
