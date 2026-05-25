-- Add quality_score and background_music_url to media_scripts
-- quality_score: stores QualityScore JSON from the quality gate evaluator
-- background_music_url: stores selected background music track URL
-- composition: Remotion composition name (may already exist — ADD COLUMN IF NOT EXISTS is safe)

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS composition text DEFAULT 'SimpleNewsReel';

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS quality_score jsonb;

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS background_music_url text;

COMMENT ON COLUMN media_scripts.composition IS
  'Remotion composition name, e.g. SimpleNewsReel';

COMMENT ON COLUMN media_scripts.quality_score IS
  'QualityScore JSON: hook_strength, information_density, scroll_stop_probability, hallucination_risk, editorial_quality, overall, passed, verdict, weak_spots';

COMMENT ON COLUMN media_scripts.background_music_url IS
  'Direct MP3 URL for background music used in Remotion render (from Pixabay or custom override)';
