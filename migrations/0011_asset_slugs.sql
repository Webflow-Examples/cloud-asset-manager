ALTER TABLE assets ADD COLUMN slug TEXT;

UPDATE assets
SET slug = id
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS assets_slug_idx ON assets (slug);
