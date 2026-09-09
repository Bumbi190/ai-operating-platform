-- Phase 9Y — schema-layer RLS closure for public.workflow_stories.
--
-- WHAT WAS WRONG. `20260904120000_workflow_stories.sql` created the table with
-- content-addressed identity, append-only UPDATE and no-DELETE triggers — and
-- never enabled row level security. Supabase grants the public schema to `anon`
-- and `authenticated` by default, and those grants are inert only while RLS is
-- on. Here it was off, so they were live: workflow_stories was the ONLY table in
-- the schema reachable by the public anon key (HTTP 200, where every hardened
-- sibling answers 401).
--
-- WHY RLS WITH NO POLICY IS THE RIGHT SHAPE. This table is server-only. Its one
-- consumer is `lib/workflows/story/store.ts`, which is `import 'server-only'`
-- and is handed the service-role client by the workflow executor. No browser
-- caller, no user-bound client, and no route reads it. There is therefore no
-- owner-scoped access to express, and inventing an owner policy would describe a
-- product surface that does not exist. RLS enabled with zero policies is
-- default-deny for every non-bypass role, which is exactly the boundary — the
-- same construction, and the same reasoning, as
-- `supabase/migrations/20260707172102_enable_public_rls_for_internal_tables.sql`
-- applied to atlas_actions, cron_heartbeat and token_health.
--
-- THE REVOKE IS NOT REDUNDANT. RLS alone would already deny these roles, so the
-- revoke is defence in depth: it removes the privilege as well as the row
-- visibility, so a future migration that disables RLS on this table does not
-- silently re-open the Data API. That belt-and-braces pairing is what the
-- July hardening migration established, and it is kept here deliberately.
--
-- NOT FORCE RLS. `force row level security` binds the table OWNER too, but the
-- owner here is `postgres`, which holds BYPASSRLS — so FORCE would change
-- nothing in this deployment while adding a trap for any future owner change.
-- The requirement is that anon and authenticated cannot reach the table
-- directly, and RLS + revoke meets it.
--
-- NO DATA OPERATION. Nothing is inserted, updated, deleted or dropped. The
-- append-only and no-delete triggers from the creation migration are untouched.

alter table public.workflow_stories enable row level security;

revoke all on public.workflow_stories from anon, authenticated;

grant all on public.workflow_stories to service_role;

comment on table public.workflow_stories is
  'Immutable, content-addressed generated stories. Append-only: content is never '
  'updated in place, and superseded rows are retained so a prior approval stays auditable. '
  'Server-only (Phase 9Y): RLS enabled with no policies; anon and authenticated hold no '
  'grants; reached exclusively by the service-role client through lib/workflows/story/store.ts.';
