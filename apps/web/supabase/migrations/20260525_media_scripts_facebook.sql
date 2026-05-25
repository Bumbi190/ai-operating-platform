-- Add Facebook publishing columns to media_scripts
-- facebook_post_id: the video post ID returned by the Graph API
-- facebook_url:     direct link to the Facebook video post

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS facebook_post_id text;

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS facebook_url text;

COMMENT ON COLUMN media_scripts.facebook_post_id IS
  'Facebook Graph API video post ID (e.g. 1234567890_9876543210)';

COMMENT ON COLUMN media_scripts.facebook_url IS
  'Direct URL to the published Facebook video post';
