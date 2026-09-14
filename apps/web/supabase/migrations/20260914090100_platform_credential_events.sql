-- Settings S0 — platform_credential_events: the audit trail for replacing the
-- platform's publishing credentials.
--
-- WHAT IT RECORDS. /api/media/token replaces the Instagram and Facebook
-- credentials in platform_tokens that every pipeline post uses. A replacement
-- attempt that has passed both authority gates (platform operator, ownership of
-- the default social project) and request validation first writes one
-- `attempted` event, BEFORE any provider is contacted or anything is stored. If
-- that write does not land, the route stops: no attempted event, no replacement.
-- It then writes exactly one terminal event under the same server-generated
-- operation_id: `replaced` when the store succeeded, `failed` when it did not.
--
-- WHY A NEW TABLE. Omnira has no canonical audit mechanism to reuse. Every
-- append-only table belongs to one domain: atlas_actions is Atlas's episodic
-- memory and is rendered into its system prompt; stop_events is CHECK-locked to
-- PAUSED/RESUMED transitions; approvals is the review queue; the atlas_* ledgers
-- are Executive Intelligence; the workflow_* tables, spend_advisory_overrides,
-- asset_provenance and media_job_reconciliations each record one engine's facts.
-- The owner chose a dedicated table (Settings S0, 2026-09-14).
--
-- CREDENTIAL-BLIND BY CONSTRUCTION. No column can hold a token, a token hash or
-- fingerprint, an authorization header, a provider response or error text, an
-- app secret, a refresh token or a URL. `detail` is the only structured field,
-- and its CHECK constraints admit five allowlisted keys with fixed types — three
-- booleans, an ISO-8601 UTC timestamp and a two-value failure stage — shaped by
-- platform and by outcome. A string that is not a timestamp cannot enter it.
--
-- APPEND-ONLY AND SERVER-ONLY. UPDATE, DELETE and TRUNCATE are refused by
-- triggers, as on stop_events. RLS is on with no policy, every client grant is
-- revoked, and the service role holds SELECT and INSERT only. occurred_at is the
-- database's clock, never the caller's, and a terminal event is refused unless
-- the attempted event for the same operation, project, platform, credential type
-- and actor already exists. The project reference restricts deletion, as on the
-- atlas_* ledgers, so an audit row is never cascaded away.
--
-- ADDITIVE ONLY. No existing table, row, policy, grant or token is touched.

create table if not exists public.platform_credential_events (
  event_id         uuid primary key default gen_random_uuid(),
  operation_id     uuid not null,
  occurred_at      timestamptz not null default now(),
  project_id       uuid not null references public.projects(id) on delete restrict,
  platform         text not null,
  credential_type  text not null,
  actor            text not null,
  outcome          text not null,
  detail           jsonb not null default '{}'::jsonb,

  constraint platform_credential_events_platform_valid
    check (platform in ('instagram', 'facebook')),

  -- The credential type platform_tokens stores for each platform (token-store.ts).
  constraint platform_credential_events_credential_type_matches_platform
    check ((platform = 'instagram' and credential_type = 'user')
        or (platform = 'facebook'  and credential_type = 'page')),

  -- The server-authenticated actor (resolvePlatformOperator().actor). Never an email.
  constraint platform_credential_events_actor_is_a_user
    check (actor ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),

  constraint platform_credential_events_outcome_valid
    check (outcome in ('attempted', 'replaced', 'failed')),

  constraint platform_credential_events_detail_is_object
    check (jsonb_typeof(detail) = 'object'),

  -- The allowlist. Any other key — a token, a message, a URL — is refused.
  constraint platform_credential_events_detail_keys_allowlisted
    check ((detail - array['exchanged', 'page_resolved', 'read_insights_ok', 'expires_at', 'failure_stage']) = '{}'::jsonb),

  -- Fixed types. Every branch is written so it can never evaluate to NULL, which a
  -- CHECK would treat as a pass.
  constraint platform_credential_events_detail_types
    check (
          ((detail -> 'exchanged')        is null or jsonb_typeof(detail -> 'exchanged') = 'boolean')
      and ((detail -> 'page_resolved')    is null or jsonb_typeof(detail -> 'page_resolved') = 'boolean')
      and ((detail -> 'read_insights_ok') is null or jsonb_typeof(detail -> 'read_insights_ok') = 'boolean')
      and ((detail -> 'expires_at')       is null or (jsonb_typeof(detail -> 'expires_at') = 'string'
            and (detail ->> 'expires_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'))
      and ((detail -> 'failure_stage')    is null or (jsonb_typeof(detail -> 'failure_stage') = 'string'
            and (detail ->> 'failure_stage') in ('store', 'unexpected')))
    ),

  -- Facebook onboarding reports three booleans; an Instagram token may carry an expiry.
  constraint platform_credential_events_detail_matches_platform
    check ((platform = 'facebook'
            or ((detail -> 'exchanged') is null and (detail -> 'page_resolved') is null and (detail -> 'read_insights_ok') is null))
       and (platform = 'instagram' or (detail -> 'expires_at') is null)),

  -- attempted says nothing yet; failed says only where; replaced never says failed.
  constraint platform_credential_events_detail_matches_outcome
    check ((outcome = 'attempted' and detail = '{}'::jsonb)
        or (outcome = 'failed'    and (detail -> 'failure_stage') is not null and (detail - 'failure_stage') = '{}'::jsonb)
        or (outcome = 'replaced'  and (detail -> 'failure_stage') is null))
);

comment on table public.platform_credential_events is
  'Settings S0: append-only audit of platform publishing-credential replacement through /api/media/token. One attempted event before any provider contact or store, then exactly one replaced or failed event under the same server-generated operation_id. Credential-blind: no column can hold a token, hash, header, provider text or secret, and detail is CHECK-limited to allowlisted non-secret keys.';
comment on column public.platform_credential_events.operation_id is
  'Generated by the server for each replacement attempt; ties the attempted event to its terminal event. Never taken from the request.';
comment on column public.platform_credential_events.occurred_at is
  'Stamped by the insert guard with now(); a caller-supplied value is overwritten.';

-- One attempted event, and at most one terminal event, per operation.
create unique index if not exists platform_credential_events_one_attempt
  on public.platform_credential_events (operation_id) where outcome = 'attempted';
create unique index if not exists platform_credential_events_one_terminal
  on public.platform_credential_events (operation_id) where outcome in ('replaced', 'failed');

-- "When was this platform's credential last replaced?" per project.
create index if not exists platform_credential_events_project_platform_time
  on public.platform_credential_events (project_id, platform, occurred_at desc);

-- ── Insert guard ────────────────────────────────────────────────────────────
-- The clock is the database's. A terminal event must follow an attempted event of
-- the same operation, project, platform, credential type and actor, so an outcome
-- can never be recorded for an attempt that was not.
create or replace function public.platform_credential_events_guard_insert()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.occurred_at := now();
  if new.outcome <> 'attempted' and not exists (
    select 1
      from public.platform_credential_events a
     where a.operation_id    = new.operation_id
       and a.outcome         = 'attempted'
       and a.project_id      = new.project_id
       and a.platform        = new.platform
       and a.credential_type = new.credential_type
       and a.actor           = new.actor
  ) then
    raise exception 'platform_credential_events: % event for operation % has no matching attempted event',
      new.outcome, new.operation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists platform_credential_events_guard_insert on public.platform_credential_events;
create trigger platform_credential_events_guard_insert
  before insert on public.platform_credential_events
  for each row execute function public.platform_credential_events_guard_insert();

-- ── Append-only ─────────────────────────────────────────────────────────────
-- An audit event is a record of something that already happened. Editing or
-- deleting one would let the record be adjusted after the fact, so the database
-- refuses both — and TRUNCATE — rather than relying on convention.
create or replace function public.platform_credential_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_credential_events is append-only (attempted %)', tg_op;
end;
$$;

drop trigger if exists platform_credential_events_no_mutation on public.platform_credential_events;
create trigger platform_credential_events_no_mutation
  before update or delete on public.platform_credential_events
  for each row execute function public.platform_credential_events_append_only();

drop trigger if exists platform_credential_events_no_truncate on public.platform_credential_events;
create trigger platform_credential_events_no_truncate
  before truncate on public.platform_credential_events
  for each statement execute function public.platform_credential_events_append_only();

-- ── Privileges ──────────────────────────────────────────────────────────────
-- The revoke comes after CREATE TABLE: Supabase's default ACL grants a new public
-- table to anon, authenticated and service_role at creation. The service role gets
-- back only what the sanctioned writer needs — INSERT, and SELECT for the insert
-- guard's lookup and for Settings' status read.
alter table public.platform_credential_events enable row level security;

revoke all on table public.platform_credential_events from public, anon, authenticated, service_role;
grant select, insert on table public.platform_credential_events to service_role;
