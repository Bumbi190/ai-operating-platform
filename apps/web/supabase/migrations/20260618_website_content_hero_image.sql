-- MVP Phase 1: hero image columns on website_content (Atlas article image pipeline).
--
-- Adds operator-managed hero image fields so the Atlas review UI can generate,
-- preview, and regenerate the hero image before approve→publish. All additive,
-- defensively idempotent, behavior-neutral until Commit 5 wires hero_image_url
-- into the publish payload (still defaults to null when unset).
--
-- Columns:
--   hero_image_url     — public Supabase Storage URL once generated; threaded
--                        into PublishPayload.hero_image_url at approve time.
--   hero_image_prompt  — denormalized from payload.hero_image_prompt for
--                        operator visibility + regenerate input. Article writer
--                        already emits this in the draft.
--   hero_image_status  — operator-facing state machine. NULL on existing rows
--                        (no image, no expectation). New rows are set to
--                        'pending' by saveGeneratedArticle in Commit 2.
--   hero_image_qa      — reserved for Phase 3 editorial Vision QA report.
--                        Unused in MVP.
--
-- Index: partial queue index covering work-needed states only, mirroring the
-- existing idx_website_content_pending pattern.

ALTER TABLE public.website_content
  ADD COLUMN IF NOT EXISTS hero_image_url    text;

ALTER TABLE public.website_content
  ADD COLUMN IF NOT EXISTS hero_image_prompt text;

ALTER TABLE public.website_content
  ADD COLUMN IF NOT EXISTS hero_image_status text;

ALTER TABLE public.website_content
  ADD COLUMN IF NOT EXISTS hero_image_qa     jsonb;

-- CHECK constraint: NULL allowed (existing rows + future "no image" articles).
-- Drop-then-add for idempotent re-apply on a fresh/branch DB.
ALTER TABLE public.website_content
  DROP CONSTRAINT IF EXISTS website_content_hero_image_status_check;
ALTER TABLE public.website_content
  ADD CONSTRAINT website_content_hero_image_status_check
  CHECK (hero_image_status IS NULL OR hero_image_status IN
         ('pending','generating','ready','failed','rejected_qa'));

-- Atlas queue: only items needing work. 'ready' and the transient 'generating'
-- state are deliberately excluded; NULL (no image expectation) is excluded by
-- the partial WHERE clause.
CREATE INDEX IF NOT EXISTS idx_website_content_hero_queue
  ON public.website_content (project_id, hero_image_status)
  WHERE hero_image_status IN ('pending','failed','rejected_qa');
