ALTER TABLE assets ADD COLUMN content_sha256 TEXT;

CREATE INDEX IF NOT EXISTS assets_content_sha256_idx ON assets (content_sha256);
