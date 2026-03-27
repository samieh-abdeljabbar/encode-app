-- Add status column to file_index for tracking chapter completion
-- Status values: 'unread', 'reading', 'digested'
ALTER TABLE file_index ADD COLUMN status TEXT DEFAULT 'unread';
