-- Exact pinned-main canonical claim_runs body, minimal parent lifecycle table only.
create table public.project_lifecycle(project_id uuid primary key,version bigint);
create or replace function public.claim_runs(
  p_limit integer,
  p_lease_seconds integer default 320
)
returns setof public.runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ids      uuid[];
  v_projects uuid[];
  v_allowed  uuid[] := '{}';
  v_pid      uuid;
  v_gpaused  boolean;
  v_ppaused  boolean;
begin
  -- ── PHASE 1 · work rows first ──────────────────────────────────────────────
  -- FOR UPDATE SKIP LOCKED is unchanged: concurrent drains still divide the queue
  -- between them rather than serialising. The `execution_paused` predicate below
  -- is retained purely as a PERFORMANCE filter -- it keeps obviously-paused work
  -- out of the batch -- and is NOT authoritative. It is an unlocked read, so a
  -- pause committing after it must still be caught, and it is, in phase 3.
  --
  -- G3C-3B adds `cancel_requested = false`. This is DEFENSE IN DEPTH, not the
  -- primary mechanism: request_run_cancel already terminalizes a pending run
  -- under the row lock, release_stopped_run terminalizes rather than requeues a
  -- cancelled run, and the reaper never returns one to 'pending'. Together those
  -- make an ownerless `pending + cancel_requested = true` row unreachable — which
  -- is what makes this predicate safe to add. Adding it without them would create
  -- exactly the stranded state it is meant to prevent.
  select array_agg(c.id order by c.created_at),
         array_agg(distinct c.project_id)
    into v_ids, v_projects
  from (
    select r.id, r.created_at, r.project_id
    from public.runs r
    where (r.kind is distinct from 'website.static.build.v1' or coalesce((r.context->>'atlasLifecycleVersion')::bigint,0)=coalesce((select version from public.project_lifecycle where project_id=r.project_id),0))
      and r.status = 'pending'
      and r.cancel_requested = false
      and r.attempts < r.max_attempts
      and not exists (
        select 1 from public.projects p
        where p.id = r.project_id and p.execution_paused = true
      )
    order by r.created_at
    for update skip locked
    limit p_limit
  ) c;

  if v_ids is null or cardinality(v_ids) = 0 then
    return;                              -- nothing claimable; not an error
  end if;

  -- ── PHASE 2 · global authority ─────────────────────────────────────────────
  -- FOR SHARE conflicts with the setter's FOR UPDATE and is held to commit.
  select pc.automation_paused into v_gpaused
    from public.platform_config pc where pc.id = 1 for share;

  if not found then
    -- Fail closed. Treating a missing config row as "not paused" is how a kill
    -- switch becomes a no-op.
    raise exception 'claim_runs: platform stop authority unavailable (platform_config row 1 missing)'
      using errcode = 'P0002';
  end if;

  if v_gpaused then
    -- A paused platform has nothing claimable. Deliberately zero rows rather
    -- than an exception: "idle" is the worker API's normal shape, and turning a
    -- routine pause into an error would light up drain alerting every tick.
    return;
  end if;

  -- ── PHASE 3 · project authority, deterministic order ───────────────────────
  -- One row at a time, ordered by id. A set-based lock would leave acquisition
  -- order to the planner; ordering by a total key means two claimers holding
  -- overlapping batches can never queue on each other in opposite directions.
  foreach v_pid in array (select array_agg(u order by u) from unnest(v_projects) u)
  loop
    select p.execution_paused into v_ppaused
      from public.projects p where p.id = v_pid for share;

    if not found then
      -- runs.project_id is NOT NULL and references projects, so this is
      -- unreachable by construction. If construction is wrong, refuse.
      raise exception 'claim_runs: project stop authority unavailable for %', v_pid
        using errcode = 'P0002';
    end if;

    if not v_ppaused then
      v_allowed := array_append(v_allowed, v_pid);
    end if;
  end loop;

  if cardinality(v_allowed) = 0 then
    return;                              -- every candidate project is paused
  end if;

  -- ── PHASE 4 · admit ────────────────────────────────────────────────────────
  -- Every fencing property of PR9a is preserved verbatim: a fresh claim_id per
  -- claim, the attempt increment, the lease, and started_at set once.
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1,
    claim_id    = gen_random_uuid()
  where (r.kind is distinct from 'website.static.build.v1' or coalesce((r.context->>'atlasLifecycleVersion')::bigint,0)=coalesce((select version from public.project_lifecycle where project_id=r.project_id),0))
    and r.id = any(v_ids)
    and r.project_id = any(v_allowed)     -- a paused project's run stays pending
  returning r.*;
end
$fn$;
revoke all on function public.claim_runs(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_runs(integer,integer) to service_role;
