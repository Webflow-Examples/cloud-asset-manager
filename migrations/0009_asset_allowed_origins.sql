ALTER TABLE assets ADD COLUMN allowed_origins TEXT;
ALTER TABLE assets ADD COLUMN inherit_allowed_origins INTEGER NOT NULL DEFAULT 1;
