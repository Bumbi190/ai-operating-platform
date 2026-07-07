-- Hero Image V2 — Phase 2A: rendering observability columns on website_content.
--
-- hero_image_source:
--   Which pipeline produced the current hero_image_url.
--     'brief'           — Phase 2 brief-driven pipeline (generateArticleHeroImage)
--     'fallback_writer' — writer.hero_image_prompt path (generateNewsImage)
--     NULL              — pre-Phase-2 rows / hero never generated
--
-- hero_image_render_input:
--   The exact request body sent to Ideogram for the current hero_image_url:
--     { prompt, negative_prompt, aspect_ratio, style_type }
--   So failures and misses can be inspected without guessing what the
--   composition was. NULL on rows produced by generateNewsImage (the writer
--   fallback path); only the brief-driven path captures the full input.
--
-- Both additive, nullable, no behavior change until the same commit's
-- lib/article/hero-image.ts refactor begins writing them.

ALTER TABLE public.website_content
  ADD COLUMN IF NOT EXISTS hero_image_source text;

ALTER TABLE public.website_content
  ADD COLUMN IF NOT EXISTS hero_image_render_input jsonb;

COMMENT ON COLUMN public.website_content.hero_image_source IS
  'Pipeline that produced the current hero_image_url: brief | fallback_writer | NULL.';

COMMENT ON COLUMN public.website_content.hero_image_render_input IS
  'Exact Ideogram request body for the current hero_image_url when source=brief.';
