-- ISOLATED SQL REVIEW CANDIDATE. Never apply directly to a live database.
-- Derived from 20260902081500_stop_atomic_execution_admission.sql, not the earlier PR3 definition.
-- Missing source version blocks the claim; locked source versions are skipped.
-- Source/project stop/transition lock ordering still requires full integration proof.

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
  v_due_project uuid;
  v_locked_project uuid;
  v_allowed  uuid[] := '{}';
  v_pid      uuid;
  v_gpaused  boolean;
  v_ppaused  boolean;
begin
  -- CANDIDATE ONLY: acquire source-revision rows before workflow-instance locks.
  -- SKIP LOCKED preserves non-blocking behavior when another writer owns a project.
  -- No platform/project stop authority is granted by this read; the existing
  -- instance-first stop checks below are still mandatory after row selection.
  for v_due_project in
    select distinct d.project_id
    from public.workflow_instances d
    where d.status = 'active'
      and d.wake_at is not null
      and d.wake_at <= now()
      and not exists (
        select 1 from public.projects p
        where p.id = d.project_id and p.execution_paused = true
      )
    order by d.project_id
  loop
    v_locked_project := null;
    select r.project_id into v_locked_project
      from public.calendar_source_revision_probe r
      join public.projects p on p.id=r.project_id and p.owner_id=r.owner_user_id
      where r.project_id=v_due_project
      for update of r skip locked;
    if v_locked_project is not null then
      v_source_projects := array_append(v_source_projects,v_due_project);
    elsif not exists (
      select 1 from public.calendar_source_revision_probe r
      join public.projects p on p.id=r.project_id and p.owner_id=r.owner_user_id
      where r.project_id=v_due_project
    ) then
      raise exception 'MISSING_SOURCE_REVISION' using errcode='23514';
    end if;
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
end;
$$;
revoke all on function public.workflow_claim_due(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.workflow_claim_due(integer,integer) to service_role;
