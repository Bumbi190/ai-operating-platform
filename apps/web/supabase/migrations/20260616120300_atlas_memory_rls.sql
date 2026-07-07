-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 1: RLS (defense-in-depth backstop only).
--
-- Per ADR v3 §4 (wrapper model): `atlas` is NEVER exposed to PostgREST, and app
-- access goes through public SECURITY DEFINER wrappers (which run with definer rights
-- and scope-gate themselves) — so RLS is INERT today. We still enable it with an
-- owner-scoped SELECT policy from day 1 so the tables are never open if the schema is
-- ever exposed later (avoids the audit's "RLS on, no policy" trap). No write policies:
-- writes are service_role / definer wrappers.
-- ─────────────────────────────────────────────────────────────────────────────

alter table atlas.memory_events enable row level security;
alter table atlas.memories      enable row level security;

drop policy if exists memory_events_select_owner on atlas.memory_events;
create policy memory_events_select_owner on atlas.memory_events
  for select to authenticated
  using (
    scope = 'world'
    or (scope = 'project' and project_id in (select id from public.projects where owner_id = auth.uid()))
  );

drop policy if exists memories_select_owner on atlas.memories;
create policy memories_select_owner on atlas.memories
  for select to authenticated
  using (
    scope = 'world'
    or (scope = 'project' and project_id in (select id from public.projects where owner_id = auth.uid()))
  );
