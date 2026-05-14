ALTER TABLE assets ADD COLUMN thumbnail_key TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_content_type TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_size_bytes INTEGER;
ALTER TABLE assets ADD COLUMN thumbnail_etag TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_updated_at TEXT;

CREATE INDEX IF NOT EXISTS assets_thumbnail_key_idx ON assets (thumbnail_key);
