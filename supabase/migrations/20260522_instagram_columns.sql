-- Add Instagram publishing columns to media_scripts
ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS instagram_media_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url       TEXT,
  ADD COLUMN IF NOT EXISTS published_at        TIMESTAMPTZ;
