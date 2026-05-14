ALTER TABLE assets ADD COLUMN thumbnail_tiny_key TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_tiny_content_type TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_tiny_size_bytes INTEGER;
ALTER TABLE assets ADD COLUMN thumbnail_tiny_etag TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_tiny_updated_at TEXT;

ALTER TABLE assets ADD COLUMN thumbnail_medium_key TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_medium_content_type TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_medium_size_bytes INTEGER;
ALTER TABLE assets ADD COLUMN thumbnail_medium_etag TEXT;
ALTER TABLE assets ADD COLUMN thumbnail_medium_updated_at TEXT;

CREATE INDEX IF NOT EXISTS assets_thumbnail_tiny_key_idx ON assets (thumbnail_tiny_key);
CREATE INDEX IF NOT EXISTS assets_thumbnail_medium_key_idx ON assets (thumbnail_medium_key);
