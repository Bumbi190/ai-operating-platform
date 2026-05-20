-- Add images array to media_scripts
-- Stores 5 public Supabase Storage URLs for scene backgrounds

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN media_scripts.images IS
  'Array of 5 public image URLs (Ideogram-generated, re-hosted in Supabase Storage) used as video background scenes';
