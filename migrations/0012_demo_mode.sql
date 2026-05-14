ALTER TABLE assets ADD COLUMN demo_session_id TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN demo_seed_asset_id TEXT;
ALTER TABLE assets ADD COLUMN demo_storage_owner TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE assets ADD COLUMN demo_expires_at TEXT;

CREATE TABLE IF NOT EXISTS demo_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_asset_count INTEGER NOT NULL DEFAULT 0,
  seed_cloned_at TEXT,
  cleanup_started_at TEXT
);

CREATE TABLE IF NOT EXISTS demo_asset_tombstones (
  demo_session_id TEXT NOT NULL,
  seed_asset_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (demo_session_id, seed_asset_id),
  FOREIGN KEY (demo_session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

DROP INDEX IF EXISTS assets_slug_idx;
CREATE UNIQUE INDEX IF NOT EXISTS assets_slug_scope_idx ON assets (demo_session_id, slug);
CREATE INDEX IF NOT EXISTS assets_demo_session_idx ON assets (demo_session_id);
CREATE INDEX IF NOT EXISTS assets_demo_seed_asset_idx ON assets (demo_seed_asset_id);
CREATE INDEX IF NOT EXISTS assets_demo_expires_at_idx ON assets (demo_expires_at);
CREATE INDEX IF NOT EXISTS demo_sessions_expires_at_idx ON demo_sessions (expires_at);
