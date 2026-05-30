-- ─────────────────────────────────────────────────────────────────────────────
-- AI Media Automation tables
-- Run this in Supabase SQL Editor (project: iboepohjwrhtgshrqaol)
-- ─────────────────────────────────────────────────────────────────────────────

-- 0. Storage bucket for audio + video files
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-assets', 'media-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 1. News items fetched by News Hunter agent
CREATE TABLE IF NOT EXISTS media_news_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  run_id          uuid REFERENCES runs(id),

  title           text NOT NULL,
  summary         text,
  key_insight     text,
  url             text,
  source_name     text,          -- 'anthropic_blog' | 'openai_blog' | 'hackernews' | 'reddit' | 'github'
  target_audience text,          -- 'beginners' | 'intermediate' | 'advanced'
  content_angle   text,          -- 'educational' | 'controversial' | 'inspiring' | 'practical'
  virality_score  int DEFAULT 0, -- 0–100

  status          text DEFAULT 'new',  -- 'new' | 'approved' | 'rejected' | 'scripted'
  raw_output      jsonb,               -- full JSON from News Hunter

  fetched_at      timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- 2. Generated scripts linked to news items
CREATE TABLE IF NOT EXISTS media_scripts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  news_item_id    uuid REFERENCES media_news_items(id),
  run_id          uuid REFERENCES runs(id),

  -- Script content
  hook            text,          -- first 3–5 seconds
  script          text,          -- full voiceover script
  captions        jsonb,         -- array of caption options
  hashtags        jsonb,         -- array of hashtags
  cta             text,
  tone            text,          -- 'educational' | 'entertaining' | 'inspiring'
  estimated_duration text,
  raw_output      jsonb,         -- full JSON from Script Writer

  -- Voice generation (ElevenLabs)
  audio_url       text,          -- Supabase Storage public URL
  timing_url      text,          -- word timing JSON URL (for Remotion subtitles)
  duration_ms     int,           -- audio duration in milliseconds
  voice_status    text DEFAULT 'none',  -- 'none' | 'generating' | 'ready' | 'failed'

  -- Video rendering (Remotion)
  video_url       text,          -- rendered .mp4 public URL
  video_status    text DEFAULT 'none',  -- 'none' | 'rendering' | 'ready' | 'failed'

  -- Approval flow
  status          text DEFAULT 'pending_review',  -- 'pending_review' | 'approved' | 'rejected' | 'published'
  feedback        text,          -- reviewer notes
  version         int DEFAULT 1, -- increments on regeneration

  generated_at    timestamptz DEFAULT now(),
  reviewed_at     timestamptz,
  published_at    timestamptz
);

-- Indexes for common read patterns
CREATE INDEX IF NOT EXISTS idx_media_news_project_status
  ON media_news_items(project_id, status);

CREATE INDEX IF NOT EXISTS idx_media_scripts_project_status
  ON media_scripts(project_id, status);

CREATE INDEX IF NOT EXISTS idx_media_scripts_news_item
  ON media_scripts(news_item_id);

CREATE INDEX IF NOT EXISTS idx_media_scripts_voice_status
  ON media_scripts(project_id, voice_status);
