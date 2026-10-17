-- Disposable, network-isolated test database only. These are prerequisite contracts,
-- not a replacement production schema or a full migration-replay claim.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;end$$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end$$;
do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;end$$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users,execution_paused boolean not null default false,paused_at timestamptz,paused_reason text);
create table public.conversations(id uuid primary key,user_id uuid not null references auth.users);
create table public.platform_config(id integer primary key,automation_paused boolean not null,paused_at timestamptz,paused_reason text);
insert into public.platform_config values(1,false,null,null);
-- Same function body as the canonical 20260831_unified_stop_authority migration.
create function public.stop_state(p_project_id uuid default null)
returns table(global_paused boolean,global_paused_at timestamptz,global_paused_reason text,project_requested boolean,project_found boolean,project_paused boolean,project_paused_at timestamptz,project_paused_reason text)
language sql stable security definer set search_path to '' as $$
 select pc.automation_paused,pc.paused_at,pc.paused_reason,(p_project_id is not null),(p.id is not null),p.execution_paused,p.paused_at,p.paused_reason
 from public.platform_config pc left join public.projects p on p_project_id is not null and p.id=p_project_id where pc.id=1;
$$;
revoke all on function public.stop_state(uuid) from public,anon,authenticated;
grant execute on function public.stop_state(uuid) to service_role;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
grant select on projects,conversations to service_role;

grant select on public.projects to authenticated;
-- Canonical runs/cost-events prerequisite columns used by this slice. Still a
-- disposable parent-contract fixture, not full repository migration replay.
create table public.runs(id uuid primary key default gen_random_uuid(),project_id uuid not null references projects,workflow_id uuid,workflow_instance_id uuid,kind text,status text not null default 'pending',input jsonb not null default '{}',context jsonb not null default '{}',claim_id uuid,attempts integer not null default 0,max_attempts integer not null default 3,cancel_requested boolean not null default false,claimed_at timestamptz,lease_until timestamptz,started_at timestamptz,finished_at timestamptz,dispatch_started_at timestamptz,reconciliation_required boolean not null default false,reconciliation_reason text,error text,created_at timestamptz not null default now());
create table public.cost_events(id uuid primary key default gen_random_uuid(),run_id uuid references runs,project_id uuid references projects,provider text,model text,operation text,tokens_in integer,tokens_out integer,cost_usd numeric,metadata jsonb default '{}',created_at timestamptz default now());
alter table public.runs enable row level security;alter table public.cost_events enable row level security;
grant all on public.runs,public.cost_events to service_role;
-- Exact canonical cancellation body from pinned main; minimal required parent columns.
alter table public.runs add column cancel_reason text,add column cancelled_by text;
create table public.approvals(id uuid primary key default gen_random_uuid(),run_id uuid references public.runs,project_id uuid references public.projects,status text,reviewed_at timestamptz);
grant all on public.approvals to service_role;
create or replace function public.request_run_cancel(
  p_run_id     uuid,
  p_project_id uuid,
  -- DEFAULT NULL on both trailing arguments is part of the practical ABI even
  -- though Postgres excludes defaults from function IDENTITY. The deployed
  -- function carries them (pronargdefaults = 2) and database.types.ts marks both
  -- optional; dropping them here would make a two-argument call fail at runtime
  -- while every static signal still said it was fine.
  p_actor      text default null,
  p_reason     text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_now    timestamptz := now();
begin
  -- ── THE LINEARIZATION POINT ──────────────────────────────────────────────
  -- Lock the run row BEFORE branching. Everything this function decides depends
  -- on the state that exists here, at the write — never on a status a caller
  -- read a moment ago. If `claim_runs` holds this row we block, and when it
  -- commits we re-read `pending → running` and record intent instead of
  -- terminalizing. If we hold it first, claim_runs' own `status = 'pending'`
  -- re-check drops the row from its batch.
  --
  -- The status filter is in the WHERE so a terminal run returns 0 rather than
  -- taking a lock we would only release again.
  select r.status into v_status
    from public.runs r
   where r.id = p_run_id
     and r.project_id = p_project_id
     and r.status in ('pending', 'running', 'awaiting_approval')
   for update;

  if not found then
    -- Terminal, or not this tenant's run. Report the truth: nothing was
    -- mutated. The caller must not translate this into success.
    return 0;
  end if;

  if v_status = 'running' then
    -- ── DURABLE INTENT ONLY ────────────────────────────────────────────────
    -- An executor owns this row and only that executor may write its terminal
    -- state, fenced on claim_id. Writing status/claim_id/lease_until/attempts
    -- here would race the owner and could resurrect work it had finished.
    -- G3C-3A's checkpoint reads this flag before every execution-bearing unit,
    -- and `release_stopped_run` and the reaper resolve it if the worker dies.
    update public.runs set
      cancel_requested = true,
      cancel_reason    = coalesce(p_reason, cancel_reason),
      cancelled_by     = coalesce(p_actor,  cancelled_by)
    where id = p_run_id;
    return 1;
  end if;

  if v_status = 'pending' then
    -- Never ran. Terminalize under the lock taken above, so no worker can admit
    -- it afterwards. `cancelled` is one of the two statuses excluded from
    -- runs_action_identity_uniq, so this also RELEASES the action identity for a
    -- legitimate replacement — which `failed` would not.
    update public.runs set
      status           = 'cancelled',
      finished_at      = v_now,
      cancel_requested = true,
      cancel_reason    = coalesce(p_reason, cancel_reason),
      cancelled_by     = coalesce(p_actor,  cancelled_by),
      claimed_at       = null,
      lease_until      = null,
      claim_id         = null       -- canonical for a row that never ran
    where id = p_run_id;
  else
    -- awaiting_approval. Terminalize, but KEEP claim_id: it is the provenance of
    -- the executor that produced the output under review, and G3C-3A's
    -- terminalizeCancelledRun preserves it for the same reason.
    update public.runs set
      status           = 'cancelled',
      finished_at      = v_now,
      cancel_requested = true,
      cancel_reason    = coalesce(p_reason, cancel_reason),
      cancelled_by     = coalesce(p_actor,  cancelled_by),
      claimed_at       = null,
      lease_until      = null
    where id = p_run_id;
  end if;

  -- ── UNRESOLVED REVIEW, SAME TRANSACTION ──────────────────────────────────
  -- A cancelled run must not leave a live review in the operator queue. Only
  -- UNRESOLVED states are closed; approved/rejected/returned are historical
  -- decisions and are deliberately NOT rewritten. If this raises, the whole
  -- function rolls back — a cancelled run with an orphaned pending approval is
  -- exactly the torn state this migration exists to prevent.
  update public.approvals set
    status      = 'returned',
    reviewed_at = v_now
  where run_id = p_run_id
    and status in ('pending', 'revised', 'needs_input');

  return 1;
end
$fn$;
revoke all on function public.request_run_cancel(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_run_cancel(uuid,uuid,text,text) to service_role;
