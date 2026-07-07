-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 3: pg_cron schedules (DB-internal; no PostgREST).
--
-- consolidation runs every 5 min; archive nightly. Both call the atlas functions
-- directly in-DB (no Vercel route), unlike omnira_cron's call_vercel jobs. Idempotent
-- by jobname (cron.schedule upserts). INERT in prod until Commit 4 emitters + ATLAS_MEMORY
-- produce events — until then the queue is empty and these are cheap no-ops.
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule('atlas_consolidate', '*/5 * * * *', 'select atlas.consolidate_memory_events();');
select cron.schedule('atlas_archive',     '30 3 * * *',  'select atlas.archive_stale_memories();');
