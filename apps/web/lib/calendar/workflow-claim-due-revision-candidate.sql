-- ISOLATED SQL REVIEW CANDIDATE. Never apply directly to a live database.
-- Derived from 20260902081500_stop_atomic_execution_admission.sql, not the earlier PR3 definition.
-- Missing source version blocks the claim; locked source versions are skipped.
-- Source/project stop/transition lock ordering still requires full integration proof.
-- TEST FIXTURE ONLY: fair-share ordering metadata on project revisions.
alter table public.calendar_source_revision_probe
add column if not exists last_workflow_claim_at timestamptz;

-- Test-only indexes. The index supports a single earliest due wake lookup per
-- project instead of aggregating every active due workflow instance.
create index if not exists calendar_workflow_due_probe_idx
  on public.workflow_instances(project_id,wake_at,id)
  where status='active' and wake_at is not null;
create index if not exists calendar_source_fair_probe_idx
  on public.calendar_source_revision_probe(last_workflow_claim_at asc nulls first,project_id);


create or replace function public.workflow_claim_due(
  p_limit integer default 20,
  p_visibility_seconds integer default 300
)
returns setof public.workflow_instances
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids      uuid[];
  v_projects uuid[];
  v_source_projects uuid[] := '{}';
  v_allowed  uuid[] := '{}';
  v_pid      uuid;
  v_gpaused  boolean;
  v_ppaused  boolean;
begin
  -- TEST-ONLY: bound the number of source rows locked per claim invocation.
  -- Prefer projects that have NEVER been claimed; then the least recently served.
  -- Earliest due time breaks ties, avoiding perpetual domination by one backlog.
  -- SKIP LOCKED walks past busy projects; this is finite-backlog fair-share,
  -- not a formally starvation-free guarantee under continuous new projects.
  -- The existing instance -> platform -> project authority order remains below.
  if p_limit is null or p_limit < 1 then
    raise exception 'INVALID_CLAIM_LIMIT' using errcode='23514';
  end if;

  -- Fail closed for an untracked/owner-mismatched due project. Probe existence
  -- using the per-project due index; do not aggregate all due workflow rows.
  -- This still visits projects and is NOT a bounded discovery proof.
  if exists (
    select 1 from public.projects p
    where p.execution_paused is not true
      and not exists (
        select 1 from public.calendar_source_revision_probe r
        where r.project_id=p.id and r.owner_user_id=p.owner_id
      )
      and exists (
        select 1 from public.workflow_instances d
        where d.project_id=p.id and d.status='active'
          and d.wake_at is not null and d.wake_at<=now()
      )
  ) then
    raise exception 'MISSING_SOURCE_REVISION' using errcode='23514';
  end if;

  -- FOR UPDATE OF r applies only to source revisions, not to workflow rows.
  -- LIMIT caps source lock footprint at min(requested jobs, 16 projects).
  for v_pid in
    select r.project_id
    from public.calendar_source_revision_probe r
    join public.projects p on p.id=r.project_id and p.owner_id=r.owner_user_id
    join lateral (
      select d.wake_at as oldest_wake
      from public.workflow_instances d
      where d.project_id=r.project_id
        and d.status='active' and d.wake_at is not null
        and d.wake_at<=now()
      order by d.wake_at
      limit 1
    ) due on true
    where p.execution_paused is not true
    order by r.last_workflow_claim_at nulls first,due.oldest_wake,r.project_id
    limit least(p_limit,16)
    for update of r skip locked
  loop
    v_source_projects:=array_append(v_source_projects,v_pid);
  end loop;

  if cardinality(v_source_projects) = 0 then
    return;
  end if;

  -- ── PHASE 1 · instance rows first ──────────────────────────────────────────
  select array_agg(c.id order by c.wake_at),
         array_agg(distinct c.project_id)
    into v_ids, v_projects
  from (
    select d.id, d.wake_at, d.project_id
    from public.workflow_instances d
    where d.status = 'active'
      and d.project_id=any(v_source_projects)
      and d.wake_at is not null
      and d.wake_at <= now()
      and not exists (                   -- performance filter, NOT authoritative
        select 1 from public.projects p
        where p.id = d.project_id and p.execution_paused = true
      )
    order by d.wake_at
    for update skip locked
    limit p_limit
  ) c;

  if v_ids is null or cardinality(v_ids) = 0 then
    return;
  end if;

  -- ── PHASE 2 · global authority ─────────────────────────────────────────────
  select pc.automation_paused into v_gpaused
    from public.platform_config pc where pc.id = 1 for share;

  if not found then
    raise exception 'workflow_claim_due: platform stop authority unavailable (platform_config row 1 missing)'
      using errcode = 'P0002';
  end if;

  if v_gpaused then
    return;                              -- scheduler idle, not scheduler failure
  end if;

  -- ── PHASE 3 · project authority, deterministic order ───────────────────────
  foreach v_pid in array (select array_agg(u order by u) from unnest(v_projects) u)
  loop
    select p.execution_paused into v_ppaused
      from public.projects p where p.id = v_pid for share;

    if not found then
      raise exception 'workflow_claim_due: project stop authority unavailable for %', v_pid
        using errcode = 'P0002';
    end if;

    if not v_ppaused then
      v_allowed := array_append(v_allowed, v_pid);
    end if;
  end loop;

  if cardinality(v_allowed) = 0 then
    return;
  end if;

  -- ── PHASE 4 · claim ────────────────────────────────────────────────────────
  return query
  update public.workflow_instances w set
    wake_at      = now() + make_interval(secs => p_visibility_seconds),
    last_tick_at = now()
  where w.id = any(v_ids)
    and w.project_id = any(v_allowed)
  returning w.*;

  -- RETURN QUERY does not exit the function. Mark projects actually claimed;
  -- no fairness token is consumed by a paused, skipped or empty claim.
  update public.calendar_source_revision_probe r
    set last_workflow_claim_at=clock_timestamp()
    where r.project_id=any(v_allowed)
      and exists (
        select 1 from public.workflow_instances w
        where w.id=any(v_ids) and w.project_id=r.project_id
      );
end;
$$;
revoke all on function public.workflow_claim_due(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.workflow_claim_due(integer,integer) to service_role;
