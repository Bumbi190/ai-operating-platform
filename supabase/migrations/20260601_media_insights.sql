-- Cache för Instagram-insights per publicerat inlägg (engagemang/räckvidd).
-- Fylls av /api/media/cron/insights. Tomt tills tokenet har instagram_manage_insights.

CREATE TABLE IF NOT EXISTS media_insights (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id           uuid REFERENCES media_scripts(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES projects(id) ON DELETE CASCADE,
  instagram_media_id  text UNIQUE,
  reach               integer,
  views               integer,
  likes               integer,
  comments            integer,
  saved               integer,
  shares              integer,
  total_interactions  integer,
  published_at        timestamptz,
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_insights_project ON media_insights(project_id);
CREATE INDEX IF NOT EXISTS idx_media_insights_published ON media_insights(published_at);

ALTER TABLE media_insights ENABLE ROW LEVEL SECURITY;
