ALTER TABLE assets ADD COLUMN folder TEXT;
ALTER TABLE assets ADD COLUMN cache_policy TEXT NOT NULL DEFAULT 'balanced';

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assets_folder_idx ON assets (folder);
CREATE INDEX IF NOT EXISTS assets_cache_policy_idx ON assets (cache_policy);
CREATE INDEX IF NOT EXISTS asset_tags_tag_idx ON asset_tags (tag);
CREATE INDEX IF NOT EXISTS asset_tags_asset_id_idx ON asset_tags (asset_id);
