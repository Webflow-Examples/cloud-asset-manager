CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  uploaded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS assets_display_name_idx ON assets (display_name);
CREATE INDEX IF NOT EXISTS assets_original_filename_idx ON assets (original_filename);
CREATE INDEX IF NOT EXISTS assets_uploaded_at_idx ON assets (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS assets_status_idx ON assets (status);
