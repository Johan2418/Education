-- 039: snapshots for libro extraction prompt+eval tracking

ALTER TABLE internal.libro_extraccion
  ADD COLUMN IF NOT EXISTS snapshots JSONB NOT NULL DEFAULT '{}'::jsonb;

