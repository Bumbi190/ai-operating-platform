-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 5: health metrics wrapper.
--
-- public.atlas_memory_health() — SECURITY DEFINER read wrapper over the private
-- atlas schema (never PostgREST-exposed, ADR v3 §4). Surfaces the operational
-- signals the activation runbook watches:
--   • emit volume (events_total) — a FLAT line means emit is silently broken
--     (recordMemoryEvent is non-throwing, so failures are otherwise invisible).
--   • consolidation debt (events_unconsolidated) — should stay bounded by the
--     */5 cron; a rising line means consolidation is stuck.
--   • episodic window size + materialized memory counts by status.
--
-- Implemented as a function (not a view) to keep the wrapper model consistent and
-- avoid exposing atlas indirectly. service_role only.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.atlas_memory_health()
returns table (
  events_total          bigint,
  events_unconsolidated  bigint,
  events_episodic_90d    bigint,
  memories_active        bigint,
  memories_archived      bigint,
  memories_superseded    bigint,
  last_event_at          timestamptz,
  last_memory_update_at  timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    (select count(*) from atlas.memory_events),
    (select count(*) from atlas.memory_events where consolidated_at is null),
    (select count(*) from atlas.memory_events
       where event_type in ('outcome','reflection','correction')
         and occurred_at > now() - interval '90 days'),
    (select count(*) from atlas.memories where status = 'active'),
    (select count(*) from atlas.memories where status = 'archived'),
    (select count(*) from atlas.memories where status = 'superseded'),
    (select max(ingested_at) from atlas.memory_events),
    (select max(updated_at)  from atlas.memories);
$$;

revoke all on function public.atlas_memory_health() from public, anon, authenticated;
grant execute on function public.atlas_memory_health() to service_role;

comment on function public.atlas_memory_health() is
  'Atlas Memory health metrics (ADR v3 §4). Emit volume, consolidation debt, '
  'memory counts by status. service_role only; atlas not PostgREST-exposed.';
