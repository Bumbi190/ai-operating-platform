-- Phase A — canonical Dream finding reconciliation.
--
-- One domain-specific append-only ledger.  dream_issues remains the observation
-- store, manager_tasks remains execution progress, and atlas_actions remains
-- action history.  Current disposition is reduced from these events only.
-- Absence of an event means UNVERIFIED, never implicitly ACTIVE.

create table if not exists public.dream_issue_reconciliation_events (
  event_id                      uuid primary key default gen_random_uuid(),
  event_seq                     bigint generated always as identity unique,
  project_id                    uuid not null references public.projects(id) on delete restrict,
  finding_id                    uuid not null references public.dream_issues(id) on delete restrict,
  finding_identity              text not null,
  event_type                    text not null,
  evidence_kind                 text,
  evidence_locator              text,
  evidence_digest               text,
  actor_principal               text not null,
  provenance                    text not null,
  superseding_finding_id        uuid references public.dream_issues(id) on delete restrict,
  superseding_finding_identity  text,
  source_key                    text not null,
  occurred_at                   timestamptz not null default now(),
  recorded_at                   timestamptz not null default now(),

  constraint dream_reconciliation_identity_valid
    check (length(btrim(finding_identity)) between 1 and 160
      and finding_identity !~ '[[:cntrl:]]'),
  constraint dream_reconciliation_event_type_valid
    check (event_type in (
      'implementation_evidence_recorded',
      'verification_evidence_recorded',
      'activated',
      'resolved',
      'superseded',
      'invalidated',
      'marked_unverified',
      'reopened'
    )),
  constraint dream_reconciliation_evidence_kind_valid
    check (evidence_kind is null or evidence_kind in (
      'merge_commit', 'pull_request', 'regression_test', 'runtime_verification',
      'migration', 'artifact', 'operator_attestation', 'canonical_task_completion'
    )),
  constraint dream_reconciliation_evidence_shape
    check (
      (event_type in ('implementation_evidence_recorded', 'verification_evidence_recorded')
        and evidence_kind is not null
        and nullif(btrim(evidence_locator), '') is not null)
      or
      (event_type not in ('implementation_evidence_recorded', 'verification_evidence_recorded')
        and evidence_kind is null and evidence_locator is null and evidence_digest is null)
    ),
  constraint dream_reconciliation_digest_valid
    check (evidence_digest is null or evidence_digest ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  constraint dream_reconciliation_hash_required
    check (evidence_kind not in ('merge_commit', 'regression_test', 'migration', 'artifact')
      or evidence_digest is not null),
  constraint dream_reconciliation_supersession_shape
    check (
      (event_type = 'superseded'
        and superseding_finding_id is not null
        and nullif(btrim(superseding_finding_identity), '') is not null)
      or
      (event_type <> 'superseded'
        and superseding_finding_id is null
        and superseding_finding_identity is null)
    ),
  constraint dream_reconciliation_not_self_superseding
    check (superseding_finding_id is null or superseding_finding_id <> finding_id),
  constraint dream_reconciliation_source_key_valid
    check (length(btrim(source_key)) between 8 and 240),
  constraint dream_reconciliation_actor_valid
    check (length(btrim(actor_principal)) between 3 and 200),
  constraint dream_reconciliation_provenance_valid
    check (length(btrim(provenance)) between 3 and 200),
  unique (project_id, source_key)
);

create index if not exists dream_reconciliation_finding_replay
  on public.dream_issue_reconciliation_events (project_id, finding_id, event_seq);
create index if not exists dream_reconciliation_identity_replay
  on public.dream_issue_reconciliation_events (project_id, finding_identity, event_seq);

comment on table public.dream_issue_reconciliation_events is
  'Canonical append-only evidence and disposition lifecycle for Dream findings. Status is reduced from events; dream_issues, manager_tasks, atlas_actions and AI prose are not resolution truth.';
comment on column public.dream_issue_reconciliation_events.event_seq is
  'Database-assigned total replay order. occurred_at is observation time; event_seq decides ties and transaction-local ordering.';

-- Bind redundant human-readable identities to their project-scoped UUIDs,
-- validate terminal transitions, and refuse supersession cycles.
create or replace function public.dream_reconciliation_guard_insert()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_identity text;
  v_successor_identity text;
  v_previous_event text;
  v_previous_seq bigint;
begin
  new.recorded_at := clock_timestamp();
  if new.occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'dream reconciliation: occurred_at may not be in the future';
  end if;

  select di.issue_id into v_identity
    from public.dream_issues di
   where di.id = new.finding_id and di.project_id = new.project_id;
  if not found or v_identity is distinct from new.finding_identity then
    raise exception 'dream reconciliation: finding identity/project mismatch';
  end if;

  if new.event_type = 'superseded' then
    select di.issue_id into v_successor_identity
      from public.dream_issues di
     where di.id = new.superseding_finding_id and di.project_id = new.project_id;
    if not found or v_successor_identity is distinct from new.superseding_finding_identity then
      raise exception 'dream reconciliation: successor identity/project mismatch';
    end if;

    if exists (
      with recursive successor(finding_id) as (
        select new.superseding_finding_id
        union all
        select e.superseding_finding_id
          from successor s
          join lateral (
            select x.superseding_finding_id
              from public.dream_issue_reconciliation_events x
             where x.project_id = new.project_id
               and x.finding_id = s.finding_id
               and x.event_type = 'superseded'
             order by x.event_seq desc
             limit 1
          ) e on e.superseding_finding_id is not null
      )
      select 1 from successor where finding_id = new.finding_id
    ) then
      raise exception 'dream reconciliation: supersession cycle refused';
    end if;
  end if;

  select e.event_type, e.event_seq into v_previous_event, v_previous_seq
    from public.dream_issue_reconciliation_events e
   where e.project_id = new.project_id
     and e.finding_id = new.finding_id
     and e.event_type in ('activated', 'resolved', 'superseded', 'invalidated', 'marked_unverified', 'reopened')
   order by e.event_seq desc
   limit 1;

  if new.event_type = 'activated' and not exists (
    select 1 from public.dream_issue_reconciliation_events e
     where e.project_id = new.project_id
       and e.finding_id = new.finding_id
       and e.event_type = 'verification_evidence_recorded'
  ) then
    raise exception 'dream reconciliation: ACTIVE requires verification evidence';
  end if;

  if new.event_type = 'resolved' then
    if not exists (
      select 1 from public.dream_issue_reconciliation_events e
       where e.project_id = new.project_id and e.finding_id = new.finding_id
         and e.event_type = 'implementation_evidence_recorded'
         and e.event_seq > coalesce(v_previous_seq, 0)
    ) or not exists (
      select 1 from public.dream_issue_reconciliation_events e
       where e.project_id = new.project_id and e.finding_id = new.finding_id
         and e.event_type = 'verification_evidence_recorded'
         and e.event_seq > coalesce(v_previous_seq, 0)
    ) then
      raise exception 'dream reconciliation: RESOLVED requires fresh implementation and verification evidence';
    end if;
  end if;

  if new.event_type = 'invalidated' and not exists (
    select 1 from public.dream_issue_reconciliation_events e
     where e.project_id = new.project_id and e.finding_id = new.finding_id
       and e.event_type = 'verification_evidence_recorded'
  ) then
    raise exception 'dream reconciliation: INVALIDATED requires verification evidence';
  end if;

  if new.event_type = 'reopened' then
    if v_previous_event not in ('resolved', 'superseded', 'invalidated') then
      raise exception 'dream reconciliation: REOPENED requires a terminal prior disposition';
    end if;
    if new.actor_principal !~ '^(user|owner|operator):' and not exists (
      select 1 from public.dream_issue_reconciliation_events e
       where e.project_id = new.project_id and e.finding_id = new.finding_id
         and e.event_seq > coalesce(v_previous_seq, 0)
         and e.event_type = 'verification_evidence_recorded'
         and (
           e.evidence_kind in ('runtime_verification', 'regression_test')
           or (e.evidence_kind = 'operator_attestation'
             and e.actor_principal ~ '^(user|owner|operator):')
         )
    ) then
      raise exception 'dream reconciliation: REOPENED requires new regression evidence or explicit owner/operator action';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists dream_reconciliation_guard_insert on public.dream_issue_reconciliation_events;
create trigger dream_reconciliation_guard_insert
  before insert on public.dream_issue_reconciliation_events
  for each row execute function public.dream_reconciliation_guard_insert();

create or replace function public.dream_reconciliation_append_only()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'dream_issue_reconciliation_events is append-only (attempted %)', tg_op;
end;
$$;

drop trigger if exists dream_reconciliation_no_mutation on public.dream_issue_reconciliation_events;
create trigger dream_reconciliation_no_mutation
  before update or delete on public.dream_issue_reconciliation_events
  for each row execute function public.dream_reconciliation_append_only();

drop trigger if exists dream_reconciliation_no_truncate on public.dream_issue_reconciliation_events;
create trigger dream_reconciliation_no_truncate
  before truncate on public.dream_issue_reconciliation_events
  for each statement execute function public.dream_reconciliation_append_only();

alter table public.dream_issue_reconciliation_events enable row level security;
revoke all on table public.dream_issue_reconciliation_events from public, anon, authenticated, service_role;
revoke all on sequence public.dream_issue_reconciliation_events_event_seq_seq from public, anon, authenticated, service_role;
grant select, insert on table public.dream_issue_reconciliation_events to service_role;
grant usage, select on sequence public.dream_issue_reconciliation_events_event_seq_seq to service_role;

-- ── Deterministic The Prompt backfill ──────────────────────────────────────
-- No text search and no inference.  If the audited production project exists,
-- each pinned identity must exist exactly once or the migration refuses to
-- classify anything.  Empty/new installations skip the historical backfill.
do $$
declare
  v_project constant uuid := 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52';
  v_count integer;
begin
  if exists (select 1 from public.projects where id = v_project) then
    select count(*) into v_count
      from public.dream_issues
     where project_id = v_project
       and issue_id in (
         'ig_self_account_id', 'critical_escalation_ig_self_account', 'p1_still_open',
         'step_logs_missing', 'critical_escalation_step_logs', 'open_actions'
       );
    if v_count <> 6 then
      raise exception 'dream reconciliation backfill guard: expected 6 pinned The Prompt findings, found %', v_count;
    end if;
  end if;
end;
$$;

-- Every legacy observation starts explicitly UNVERIFIED.  The audited identities
-- below then receive evidence and a later deterministic disposition event.
insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, actor_principal, provenance, source_key, occurred_at)
select di.project_id, di.id, di.issue_id, 'marked_unverified',
       'owner:phase-a-2026-09-19', 'owner_approved_legacy_backfill_v1',
       'phase-a:legacy-unverified:' || di.id::text, timestamptz '2026-09-19 12:00:00+00'
  from public.dream_issues di
on conflict (project_id, source_key) do nothing;

-- Instagram canonical finding: implementation, binding migration, exact
-- regression suite, audited main identity, then RESOLVED.
insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, evidence_kind, evidence_locator,
   evidence_digest, actor_principal, provenance, source_key, occurred_at)
select di.project_id, di.id, di.issue_id, x.event_type, x.evidence_kind, x.locator,
       x.digest, 'owner:phase-a-2026-09-19', 'owner_approved_instagram_backfill_v1',
       x.source_key, timestamptz '2026-09-19 12:01:00+00' + x.n * interval '1 millisecond'
  from public.dream_issues di
  cross join (values
    (1, 'implementation_evidence_recorded', 'merge_commit',
      'git:commit:8cc7d36b875b76b3afc5ef76138fdf70afb05ae0',
      '8cc7d36b875b76b3afc5ef76138fdf70afb05ae0',
      'phase-a:ig:implementation:commit-8cc7d36b875b76b3afc5ef76138fdf70afb05ae0'),
    (2, 'implementation_evidence_recorded', 'merge_commit',
      'git:merge:afd45acb034ea0f39b8453d10275abc475c37793',
      'afd45acb034ea0f39b8453d10275abc475c37793',
      'phase-a:ig:implementation:merge-afd45acb034ea0f39b8453d10275abc475c37793'),
    (3, 'implementation_evidence_recorded', 'migration',
      'repo:apps/web/supabase/migrations/20260914120400_social_account_bindings_the_prompt_evidence.sql',
      'aa7890719107de3f83f260af759f772ff4c7ef160b9c8e351ffedc85cc304c32',
      'phase-a:ig:binding-migration:aa7890719107de3f83f260af759f772ff4c7ef160b9c8e351ffedc85cc304c32'),
    (4, 'verification_evidence_recorded', 'regression_test',
      'repo:apps/web/lib/qa/instagram-webhook-self-filter.test.ts#self-identity-and-fail-closed-suite',
      'adfda4c2dc50ef1caa6aee7685c960b7f263aa94890112a82534004941e9f4ff',
      'phase-a:ig:regression:adfda4c2dc50ef1caa6aee7685c960b7f263aa94890112a82534004941e9f4ff'),
    (5, 'verification_evidence_recorded', 'artifact',
      'git:audited-main:09e97de1435cf22a22aa0989d275cff60d134aa6',
      '09e97de1435cf22a22aa0989d275cff60d134aa6',
      'phase-a:ig:audited-main:09e97de1435cf22a22aa0989d275cff60d134aa6')
  ) as x(n, event_type, evidence_kind, locator, digest, source_key)
 where di.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and di.issue_id = 'ig_self_account_id'
on conflict (project_id, source_key) do nothing;

insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, actor_principal, provenance, source_key, occurred_at)
select di.project_id, di.id, di.issue_id, 'resolved',
       'owner:phase-a-2026-09-19', 'owner_approved_instagram_backfill_v1',
       'phase-a:ig:resolved:v1', timestamptz '2026-09-19 12:01:01+00'
  from public.dream_issues di
 where di.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and di.issue_id = 'ig_self_account_id'
on conflict (project_id, source_key) do nothing;

-- Exact Instagram duplicate identities point to the canonical finding.
insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, actor_principal, provenance,
   superseding_finding_id, superseding_finding_identity, source_key, occurred_at)
select duplicate.project_id, duplicate.id, duplicate.issue_id, 'superseded',
       'owner:phase-a-2026-09-19', 'owner_approved_instagram_backfill_v1',
       canonical.id, canonical.issue_id, 'phase-a:ig:supersede:' || duplicate.issue_id,
       timestamptz '2026-09-19 12:01:02+00'
  from public.dream_issues duplicate
  join public.dream_issues canonical
    on canonical.project_id = duplicate.project_id and canonical.issue_id = 'ig_self_account_id'
 where duplicate.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and duplicate.issue_id in ('critical_escalation_ig_self_account', 'p1_still_open')
on conflict (project_id, source_key) do nothing;

-- The exact production audit proves the canonical step-log issue is ACTIVE.
insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, evidence_kind, evidence_locator,
   evidence_digest, actor_principal, provenance, source_key, occurred_at)
select di.project_id, di.id, di.issue_id, 'verification_evidence_recorded', 'runtime_verification',
       'production-audit:the-prompt:2026-09-18..2026-09-19:20-runs:0-run_logs',
       '26c38ab32763534d93409b4446f835731cc32f1d4551440f806c39d7a95fc9b9',
       'owner:phase-a-2026-09-19', 'owner_approved_step_logging_backfill_v1',
       'phase-a:step-logs:runtime-audit:v1', timestamptz '2026-09-19 12:02:00+00'
  from public.dream_issues di
 where di.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and di.issue_id = 'step_logs_missing'
on conflict (project_id, source_key) do nothing;

insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, actor_principal, provenance, source_key, occurred_at)
select di.project_id, di.id, di.issue_id, 'activated',
       'owner:phase-a-2026-09-19', 'owner_approved_step_logging_backfill_v1',
       'phase-a:step-logs:active:v1', timestamptz '2026-09-19 12:02:01+00'
  from public.dream_issues di
 where di.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and di.issue_id = 'step_logs_missing'
on conflict (project_id, source_key) do nothing;

insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, actor_principal, provenance,
   superseding_finding_id, superseding_finding_identity, source_key, occurred_at)
select duplicate.project_id, duplicate.id, duplicate.issue_id, 'superseded',
       'owner:phase-a-2026-09-19', 'owner_approved_step_logging_backfill_v1',
       canonical.id, canonical.issue_id, 'phase-a:step-logs:supersede:critical_escalation_step_logs',
       timestamptz '2026-09-19 12:02:02+00'
  from public.dream_issues duplicate
  join public.dream_issues canonical
    on canonical.project_id = duplicate.project_id and canonical.issue_id = 'step_logs_missing'
 where duplicate.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and duplicate.issue_id = 'critical_escalation_step_logs'
on conflict (project_id, source_key) do nothing;

-- open_actions is not closed: it contains the verified-active step-log work.
insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, evidence_kind, evidence_locator,
   evidence_digest, actor_principal, provenance, source_key, occurred_at)
select di.project_id, di.id, di.issue_id, 'verification_evidence_recorded', 'runtime_verification',
       'production-audit:the-prompt:open_actions-contains-active-step_logs_missing:2026-09-19',
       'a7805c37f6206be26069567aad47bb82d6cf8146da845b8ace7b4c01d191c052',
       'owner:phase-a-2026-09-19', 'owner_approved_open_actions_backfill_v1',
       'phase-a:open-actions:runtime-audit:v1', timestamptz '2026-09-19 12:03:00+00'
  from public.dream_issues di
 where di.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and di.issue_id = 'open_actions'
on conflict (project_id, source_key) do nothing;

insert into public.dream_issue_reconciliation_events
  (project_id, finding_id, finding_identity, event_type, actor_principal, provenance, source_key, occurred_at)
select di.project_id, di.id, di.issue_id, 'activated',
       'owner:phase-a-2026-09-19', 'owner_approved_open_actions_backfill_v1',
       'phase-a:open-actions:active:v1', timestamptz '2026-09-19 12:03:01+00'
  from public.dream_issues di
 where di.project_id = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
   and di.issue_id = 'open_actions'
on conflict (project_id, source_key) do nothing;
