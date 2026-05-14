ALTER TABLE assets ADD COLUMN deleted_at TEXT;
ALTER TABLE assets ADD COLUMN delete_after TEXT;

CREATE INDEX IF NOT EXISTS assets_deleted_at_idx ON assets (deleted_at);
CREATE INDEX IF NOT EXISTS assets_delete_after_idx ON assets (delete_after);
