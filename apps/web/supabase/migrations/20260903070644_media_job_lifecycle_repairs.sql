-- ─────────────────────────────────────────────────────────────────────────────
--  PROPOSED FORWARD MIGRATION — media_job_lifecycle_repairs   (REVIEW ONLY)
--
--  Forward-only. `media_job_lifecycle` (ledger 20260903062550) is applied and
--  IMMUTABLE; nothing below edits it. Every statement is CREATE OR REPLACE on a
--  function, or a new function. No table is altered, no row is rewritten.
--
--    F4-01  `assets ON DELETE SET NULL` is blocked by media_jobs_guard
--    F4-02  the append-only ledger blocks its own ON DELETE CASCADE
--    F4-03  reconciliation needs one transaction (insert first, then CAS)
--
--  ── HOW A CASCADE IS DISTINGUISHED FROM APPLICATION SQL ────────────────────
--  Measured, not assumed (see PHASE4_FORWARD_REVIEW.md §3):
--
--      direct application UPDATE   pg_trigger_depth() = 1, parent row VISIBLE
--      FK cascade  (SET NULL)      pg_trigger_depth() = 2, parent row GONE
--      direct application DELETE   pg_trigger_depth() = 1
--      FK cascade  (CASCADE)       pg_trigger_depth() = 2
--
--  Both exemptions below require BOTH signals. They are independent: depth is a
--  mechanism fact (a referential action always runs nested inside the statement
--  that triggered it), and parent-absence is a semantic fact (the referenced row
--  is already gone within this command's snapshot). An application statement can
--  fake neither from the top level, and faking depth would require executing
--  from inside another trigger — which still leaves the parent visible.
--
--  REGRESSION-SENSITIVE SCHEMA INVARIANT. pg_trigger_depth() is accepted here
--  ONLY as part of the multi-signal condition proven by the local PostgreSQL
--  matrix. It is not a reusable security primitive and must not be generalised.
--  Adding or reordering triggers on public.media_jobs, changing the assets FK
--  action, or changing reconciliation cascade semantics REQUIRES re-running
--  lib/qa/media-job-lifecycle-sql.test.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── F4-01 · media_jobs_guard: permit ONLY the FK's SET NULL ─────────────────
create or replace function public.media_jobs_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare confirmed int;
begin
  -- THE CASCADE EXEMPTION. Deliberately the first branch, and deliberately
  -- narrow on FIVE conditions at once:
  --   1. we are nested inside another statement's trigger (a referential action)
  --   2. the referenced asset is already gone from this snapshot
  --   3. asset_id is moving to NULL specifically
  --   4. it previously held a value
  --   5. NOTHING else about the row changes
  -- A caller issuing `update media_jobs set asset_id = null` from application
  -- code fails (1) and (2) and is refused by the write-once rule below, exactly
  -- as it is today.
  if pg_trigger_depth() > 1
     and old.asset_id is not null
     and new.asset_id is null
     and not exists (select 1 from public.assets a where a.id = old.asset_id)
     and new.version               =              old.version
     and new.state                 =              old.state
     and new.remote_operation_id   is not distinct from old.remote_operation_id
     and new.dispatch_observation  is not distinct from old.dispatch_observation
     and new.project_id            =              old.project_id
     and new.reconciliation_required =            old.reconciliation_required
  then
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception 'media_jobs: every update must advance version (% -> %)',
      old.version, new.version using errcode = 'restrict_violation';
  end if;

  if public.media_job_state_rank(old.state) >= 1
     and public.media_job_state_rank(new.state) < 1 then
    raise exception 'media_jobs: cannot rewind to % after dispatch began (job %)',
      new.state, new.id using errcode = 'restrict_violation';
  end if;

  if old.state <> new.state and public.media_job_state_rank(old.state) = 4 then
    if old.state = 'UNKNOWN' and new.state in ('SUCCEEDED','FAILED','RUNNING','QUEUED') then
      select count(*) into confirmed
        from public.media_job_reconciliations r
       where r.media_job_id = new.id and r.result <> 'STILL_UNKNOWN';
      if confirmed = 0 then
        raise exception
          'media_jobs: UNKNOWN may only be resolved by a recorded reconciliation (job %)',
          new.id using errcode = 'restrict_violation';
      end if;
    else
      raise exception 'media_jobs: illegal state transition % -> % (job %)',
        old.state, new.state, new.id using errcode = 'restrict_violation';
    end if;
  end if;

  if old.remote_operation_id is not null
     and new.remote_operation_id is distinct from old.remote_operation_id then
    raise exception 'media_jobs: remote_operation_id is write-once (job %)', new.id
      using errcode = 'restrict_violation';
  end if;

  if old.asset_id is not null and new.asset_id is distinct from old.asset_id then
    raise exception 'media_jobs: asset binding is write-once (job %)', new.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

-- ── F4-02 · append-only, except for the cascade that removes the parent ─────
create or replace function public.reject_media_reconciliation_mutation()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  -- Same two signals. A direct `delete from media_job_reconciliations` runs at
  -- depth 1 with its parent job still present, and is refused. UPDATE is refused
  -- unconditionally — nothing legitimate ever edits a recorded fact.
  if tg_op = 'DELETE'
     and pg_trigger_depth() > 1
     and not exists (select 1 from public.media_jobs j where j.id = old.media_job_id)
  then
    return old;
  end if;
  raise exception 'media_job_reconciliations is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end $$;

-- ── F4-03 · the atomic reconciliation entry point ───────────────────────────
--
-- ONE transaction. Insert first (the guard counts ledger rows during the
-- update), CAS second. Every refusal RAISES rather than returning, because a
-- normal return would COMMIT the evidence row — an audit trail that claims a
-- resolution which never happened is worse than none.
--
-- IDENTITY IS DERIVED, NEVER ACCEPTED. project_id, provider and
-- remote_operation_id come from the locked job row, so a caller cannot name
-- another project's job, cannot supply a provider payload's idea of a project,
-- and cannot bind evidence to an operation the job does not own. That is why
-- those three are not parameters at all.
create or replace function public.media_job_record_reconciliation(
  p_job_id           uuid,
  p_expected_version integer,
  p_result           text,
  p_blocker          text,
  p_detail           jsonb,
  p_observed_at      timestamptz,
  p_resolves_to      text
) returns public.media_jobs
language plpgsql security definer set search_path to '' as $$
declare j public.media_jobs; updated public.media_jobs;
begin
  -- Lock the job for the whole operation, so the ledger append and the CAS see
  -- one consistent version and no concurrent writer can slip between them.
  select * into j from public.media_jobs where id = p_job_id for update;
  if not found then
    raise exception 'media_job_record_reconciliation: no such media job %', p_job_id
      using errcode = 'no_data_found';
  end if;

  -- Checked BEFORE the insert so the common conflict costs nothing. The raise
  -- after the insert would roll it back anyway; this simply fails earlier.
  if j.version <> p_expected_version then
    raise exception
      'media_job_record_reconciliation: version conflict on job % (expected %, found %)',
      p_job_id, p_expected_version, j.version using errcode = 'restrict_violation';
  end if;

  -- 1. THE EVIDENCE. Identity derived from the job, so the binding trigger on
  --    this table is satisfied by construction rather than by trust.
  insert into public.media_job_reconciliations
    (media_job_id, project_id, provider, remote_operation_id, result, blocker, detail, observed_at)
  values
    (p_job_id, j.project_id, j.provider, j.remote_operation_id,
     p_result, p_blocker, coalesce(p_detail, '{}'::jsonb), p_observed_at);

  -- STILL_UNKNOWN resolves nothing. The evidence stands, the job does not move,
  -- and `version` is NOT advanced — an observation is not a state change.
  if p_resolves_to is null then
    return j;
  end if;

  -- 2. THE CAS. Redundant under the row lock and kept anyway: if the predicate
  --    ever fails, this must abort rather than silently commit the evidence.
  update public.media_jobs
     set state                   = p_resolves_to,
         reconciliation_required = false,
         terminal_at             = case
           when p_resolves_to in ('SUCCEEDED','FAILED','UNKNOWN')
           then coalesce(terminal_at, p_observed_at) else terminal_at end,
         version                 = j.version + 1
   where id = p_job_id and version = p_expected_version
  returning * into updated;

  if not found then
    raise exception
      'media_job_record_reconciliation: version conflict on job % during transition', p_job_id
      using errcode = 'restrict_violation';
  end if;

  -- An illegal transition raises inside media_jobs_guard and propagates from
  -- here, rolling back the INSERT above with it.
  return updated;
end $$;

-- Smallest privilege surface. This is a lifecycle operation: an owner who could
-- call it could manufacture the evidence that clears their own UNKNOWN.
revoke all on function public.media_job_record_reconciliation(
  uuid, integer, text, text, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.media_job_record_reconciliation(
  uuid, integer, text, text, jsonb, timestamptz, text) to service_role;

comment on function public.media_job_record_reconciliation(
  uuid, integer, text, text, jsonb, timestamptz, text) is
  'F4-03: atomic reconciliation. Ledger INSERT then CAS transition in one transaction; every refusal raises so the evidence row can never outlive the transition it claims to justify. Identity is derived from the locked job row, never accepted from the caller.';
