-- Add cloud render tracking columns to media_scripts
-- render_id:     Remotion Lambda render job ID (for polling progress)
-- render_bucket: S3 bucket name where output is stored
-- video_url:     Final public MP4 URL (S3 or re-uploaded to Supabase)

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS render_id     TEXT,
  ADD COLUMN IF NOT EXISTS render_bucket TEXT;

-- video_url already exists from initial migration — no-op if present
ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- video_status values: none | rendering | ready | failed
-- Already TEXT, no enum change needed
