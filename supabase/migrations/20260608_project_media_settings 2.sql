-- ─────────────────────────────────────────────────────────────────────────────
--  Project media settings (data backfill — no schema change)
--  ─────────────────────────────────────────────────────────────────────────────
--  The media dashboard (/projects/[slug]/media) used to hardcode "The Prompt"
--  branding, schedule, and pipeline state. It now derives everything from
--  projects.settings.media (the `settings` JSONB column already exists).
--
--  This migration populates settings.media for The Prompt (slug
--  'ai-media-automation') so its dashboard renders exactly as before. Projects
--  without a settings.media block (Familje-Stunden, GainPilot, …) get a graceful
--  "no media pipeline" empty state instead of another project's scaffolding.
--
--  Idempotent (merge via ||), reversible, single-row update — no data loss risk.
-- ─────────────────────────────────────────────────────────────────────────────

update public.projects
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
     'media', jsonb_build_object(
       'enabled', true,
       'brandInitials', 'TP',
       'tagline', 'AI news · daily reels · autonomous pipeline',
       'platform', 'instagram',
       'schedule', jsonb_build_array(
         jsonb_build_object('label', 'Morgon', 'pipeline', '07:20', 'publish', '08:00'),
         jsonb_build_object('label', 'Kväll',  'pipeline', '17:20', 'publish', '18:00')
       )
     )
   )
 where slug = 'ai-media-automation';

-- Rollback (manual):
--   update public.projects set settings = settings - 'media'
--    where slug = 'ai-media-automation';
