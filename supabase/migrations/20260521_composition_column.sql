-- Add composition column to media_scripts
-- Tracks which Remotion composition to use for rendering:
--   'SimpleNewsReel' — 1 static image with headline baked in (~5× cheaper, default)
--   'ShortFormVideo' — 5 cinematic scenes with Ken Burns effect

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS composition TEXT DEFAULT 'SimpleNewsReel';

-- Back-fill: anything that already has 5 images in the array gets ShortFormVideo
UPDATE media_scripts
SET composition = 'ShortFormVideo'
WHERE composition IS NULL
  AND jsonb_array_length(images::jsonb) >= 5;
