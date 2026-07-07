-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 1: schema foundation.
--
-- Tables live in a PRIVATE `atlas` schema and are NEVER exposed to PostgREST
-- (ADR-ATLAS-001 v3 §4). All app access in Commit 2+ goes through `public`
-- SECURITY DEFINER wrappers — the proven project pattern (public.claim_runs,
-- public.omnira_applied_migrations). This removes the branch≠prod schema-exposure
-- risk entirely: only `public` is exposed, identical on every environment.
--
-- `atlas_cron` is created here (reserved); consolidation/archive jobs land in
-- Commit 3 (DB-internal pg_cron, no PostgREST). Access at this stage = service_role
-- only; no anon/authenticated grants (tables are not API-reachable).
-- Additive & idempotent. Rollback = drop schema atlas cascade; drop schema atlas_cron cascade;
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists atlas;
create schema if not exists atlas_cron;

-- Service-role is the only direct accessor at this stage (it bypasses RLS). The
-- public SECURITY DEFINER wrappers (Commit 2+) are how the app reaches these tables.
grant usage on schema atlas to service_role;
alter default privileges in schema atlas grant select, insert, update, delete on tables to service_role;
