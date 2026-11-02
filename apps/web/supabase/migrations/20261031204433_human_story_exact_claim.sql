-- Local-only until explicitly reviewed/applied. Atomic human approval + exact claim.
-- One common claim policy; existing default drain retains its two-argument ABI/ACL.
begin;
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='public.claim_runs(integer,integer)'::regprocedure)
  is distinct from 'b57f9daf82e944428a3f3f3deeefcfa1' then
  raise exception 'claim_runs predecessor changed: rebase and review this migration';
 end if;
end $guard$;
create function public.claim_runs_selected(
  p_limit integer, p_lease_seconds integer, p_run_id uuid
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
  v_claimed_at timestamptz;
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
      and (p_run_id is null or r.id = p_run_id)
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
  -- Keep the ordinary worker's transaction clock; the exact lane may have
  -- waited for canonical approval locks, so its full lease starts here.
  v_claimed_at := case when p_run_id is null then now() else clock_timestamp() end;
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = v_claimed_at,
    started_at  = coalesce(r.started_at, v_claimed_at),
    lease_until = v_claimed_at + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1,
    claim_id    = gen_random_uuid()
  where (r.kind is distinct from 'website.static.build.v1' or coalesce((r.context->>'atlasLifecycleVersion')::bigint,0)=coalesce((select version from public.project_lifecycle where project_id=r.project_id),0))
    and r.id = any(v_ids)
    and r.project_id = any(v_allowed)     -- a paused project's run stays pending
  returning r.*;
end
$fn$;

-- Owner-only core. Neither session callers nor service clients get a free selector.
revoke all on function public.claim_runs_selected(integer,integer,uuid) from public,anon,authenticated,service_role;
create or replace function public.claim_runs(p_limit integer,p_lease_seconds integer default 320)
returns setof public.runs language sql security definer set search_path='' as $shared$
 select * from public.claim_runs_selected(p_limit,p_lease_seconds,null);
$shared$;
revoke all on function public.claim_runs(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_runs(integer,integer) to service_role;

-- Reuse canonical owner/session/hash/expiry/Survival approval. Any claim refusal
-- aborts that same transaction, so no newly granted pending run escapes to drain.
create function public.approve_and_claim_human_story(p_request_id uuid,p_reviewed_hash text,p_current_action_hash text)
returns setof public.runs language plpgsql security definer set search_path='' set lock_timeout='2s' as $atomic$
declare receipt record; claimed public.runs; request public.workflow_human_story_requests;
begin
 -- Survival's commit fence takes epoch-shard locks last. Global budget writers
 -- lock this row before bumping an epoch; acquire the same order before approval.
 -- lock_timeout bounds each wait so this prelock cannot wait indefinitely on a gate.
 perform 1 from public.platform_config where id=1 for share;
 if not found then raise exception 'platform stop authority unavailable' using errcode='P0002'; end if;
 select * into strict receipt from public.approve_and_start_human_story(p_request_id,p_reviewed_hash,p_current_action_hash);
 if receipt.replayed is distinct from false then raise exception 'approval already recorded: inspect existing receipt' using errcode='55000'; end if;
 select * into strict request from public.workflow_human_story_requests where id=p_request_id;
 select * into claimed from public.claim_runs_selected(1,320,receipt.run_id);
 if not found then raise exception 'approved story not claimable: approval rolled back' using errcode='55000'; end if;
 if claimed.id is distinct from receipt.run_id or claimed.human_story_request_id is distinct from request.id
  or claimed.project_id is distinct from request.project_id or claimed.workflow_instance_id is distinct from request.instance_id
  or claimed.status is distinct from 'running' or claimed.kind is distinct from 'workflow.action:generate_monthly_story'
  or claimed.action_kind is distinct from 'generate_monthly_story' or claimed.action_class is distinct from 'FINANCIAL'
  or claimed.attempts is distinct from 1 or claimed.max_attempts is distinct from 1 or claimed.claim_id is null
 then raise exception 'exact story claim binding failed' using errcode='23000'; end if;
 return next claimed; return;
end $atomic$;
revoke all on function public.approve_and_claim_human_story(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.approve_and_claim_human_story(uuid,text,text) to authenticated;
commit;
