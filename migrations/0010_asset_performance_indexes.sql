CREATE INDEX IF NOT EXISTS assets_status_deleted_uploaded_idx
  ON assets (status, deleted_at, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS assets_status_size_idx
  ON assets (status, size_bytes DESC);

CREATE INDEX IF NOT EXISTS assets_content_sha256_status_uploaded_idx
  ON assets (content_sha256, status, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS asset_tags_tag_asset_id_idx
  ON asset_tags (tag, asset_id);
