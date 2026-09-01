-- ═══════════════════════════════════════════════════════════════════════════
-- Governance G3A — canonical unified stop authority
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS CLOSES
--
-- The G3 Phase 0 audit found two independent stop authorities, and neither one
-- records who stopped what, when, or why:
--
--   • GLOBAL   platform_config.automation_paused — written ONLY by a direct
--     table UPDATE from TypeScript (setAutomationPaused, lib/media/safeguards.ts).
--     No database function reads or writes it.
--   • PROJECT  projects.execution_paused — written ONLY by
--     set_project_execution_paused(), which has ZERO application callers and is
--     reachable only as a service-role RPC. Its predicate IS however enforced in
--     SQL, by claim_runs, workflow_claim_due and workflow_rearm.
--
-- Both are real kill switches. Neither leaves evidence. After an incident the
-- question "was automation paused while this ran, and who resumed it?" has no
-- answer in the database: only the CURRENT boolean survives, and each write
-- destroys the previous value. An operator control whose use cannot be
-- reconstructed afterwards is not an operator control, it is a rumour.
--
-- This migration keeps both booleans as the SOURCE OF TRUTH and adds the one
-- thing missing — a durable, append-only record of every TRANSITION, written in
-- the same transaction as the boolean it describes.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   • No third stop flag. `automation_paused` and `execution_paused` keep their
--     names and their meanings. A new boolean would be a second source of truth,
--     and two sources of truth for "is it stopped" drift silently — which is the
--     one failure mode a kill switch may never have.
--   • No copying the global flag into projects. The two scopes compose at READ
--     time (execution is eligible only when BOTH are clear). Materialising that
--     composition would turn resume into a fan-out write that can partially
--     fail, leaving projects stopped that nobody stopped.
--   • No change to any executor. Not one predicate in claim_runs,
--     workflow_claim_due or workflow_rearm is touched, and no new predicate is
--     added anywhere. Enforcement wiring is a later slice; this one establishes
--     the authority and its audit, and changes no execution semantics.
--   • No cancelling, no transitioning, no resuming of work. Pause freezes. The
--     inverse of pause is unpause — never "re-create what you killed".
--
-- ORDERING: applies after 20260830_execution_stop_safety.sql (which creates the
-- function this migration retires) and after 20260831_budget_scopes.sql.


-- ── 1) The ledger ──────────────────────────────────────────────────────────
--
-- TRANSITION HISTORY, NOT COMMAND HISTORY. A row exists here only where the
-- state actually CHANGED. Recording every command would make the ledger answer
-- "how often was the button pressed", when the question an operator asks during
-- an incident is "when did the system change". Pressing pause on an already
-- paused platform is a no-op, and a no-op is not an event.
--
-- The constraints below are what make that claim enforceable rather than
-- aspirational: `stop_events_is_a_transition` makes a no-op row physically
-- impossible, so the property cannot be lost by a future writer that forgets it.

create table if not exists public.stop_events (
  id              uuid        primary key default gen_random_uuid(),
  scope_type      text        not null,
  -- NULL for the platform scope (a singleton has no id), the project id for the
  -- project scope. Deliberately NOT a foreign key: an audit ledger must outlive
  -- the row it describes. ON DELETE CASCADE would erase the history of a deleted
  -- project, and RESTRICT would make the ledger silently un-deletable. The
  -- setter validates that the project exists; the ledger then keeps the record
  -- regardless of what happens to the project afterwards.
  scope_id        uuid        null,
  event           text        not null,
  previous_paused boolean     not null,
  new_paused      boolean     not null,
  actor           text        not null,
  reason          text        null,
  created_at      timestamptz not null default now(),

  constraint stop_events_scope_type_valid
    check (scope_type in ('PLATFORM_AUTOMATION', 'PROJECT_EXECUTION')),
  constraint stop_events_event_valid
    check (event in ('PAUSED', 'RESUMED')),
  -- Scope id presence is decided by scope type, not by the caller: a platform
  -- event with a project id, or a project event without one, is unattributable.
  constraint stop_events_scope_id_matches_type
    check ((scope_type = 'PLATFORM_AUTOMATION' and scope_id is null)
        or (scope_type = 'PROJECT_EXECUTION'   and scope_id is not null)),
  -- The event name is not free text sitting next to the booleans — it IS the
  -- booleans. Allowing them to disagree would let the ledger read PAUSED for a
  -- row that recorded a resume.
  constraint stop_events_event_matches_state
    check ((event = 'PAUSED'  and new_paused = true)
        or (event = 'RESUMED' and new_paused = false)),
  constraint stop_events_is_a_transition
    check (previous_paused is distinct from new_paused),
  constraint stop_events_actor_present
    check (length(btrim(actor)) > 0)
);

-- "What is the current stop history for this scope, newest first" is the only
-- access pattern; both the platform singleton and a single project are served
-- by the same index.
create index if not exists stop_events_scope_time_idx
  on public.stop_events (scope_type, scope_id, created_at desc);

comment on table public.stop_events is
  'Append-only audit of stop-authority TRANSITIONS. The booleans '
  '(platform_config.automation_paused, projects.execution_paused) remain the '
  'source of truth; this table records how they got there. Written only by '
  'stop_set_platform_automation / stop_set_project_execution, in the same '
  'transaction as the boolean.';


-- ── 2) Append-only, enforced ───────────────────────────────────────────────
--
-- REVOKE alone would not do it: every writer here is service_role, which owns
-- the table's access path, and the migration itself runs as postgres. A trigger
-- is the only enforcement that binds the privileged callers too — an audit
-- ledger that its own writer can rewrite is not an audit ledger.

create or replace function public.stop_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'stop_events is append-only (attempted %)', tg_op
    using errcode = '42501';
end $$;

drop trigger if exists stop_events_no_mutation on public.stop_events;
create trigger stop_events_no_mutation
  before update or delete on public.stop_events
  for each row execute function public.stop_events_append_only();

-- TRUNCATE bypasses row-level triggers entirely, so it needs its own.
drop trigger if exists stop_events_no_truncate on public.stop_events;
create trigger stop_events_no_truncate
  before truncate on public.stop_events
  for each statement execute function public.stop_events_append_only();

-- ── 2b) Explicit table privileges ──────────────────────────────────────────
--
-- These are NOT optional, and RLS does not cover them. Verified against
-- production before writing this:
--
--   • `service_role` has rolbypassrls = TRUE, so `enable row level security`
--     below is no defence at all against the application's own role. RLS here
--     protects against anon/authenticated only.
--   • `pg_default_acl` for tables created by `postgres` in `public` grants
--     `arwdDxtm` — everything — to `anon`, `authenticated` AND `service_role`.
--     A newly created table is therefore fully writable by service_role the
--     instant it exists, with no GRANT written anywhere.
--   • Confirmed on a real predecessor table: `spend_reservations.relacl` is
--     `{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--       authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}`.
--
-- So staying silent about service_role would leave it holding INSERT. The
-- append-only triggers would still refuse UPDATE/DELETE/TRUNCATE, but a direct
-- INSERT would let the application fabricate ledger rows that no setter ever
-- produced — an audit trail its own subject can write is not provenance.
--
-- The revoke MUST come after CREATE TABLE, because the default ACL is applied
-- at creation time; a grant issued before the table exists has nothing to act on.
--
-- SELECT is granted back because the read model reads this table directly
-- through PostgREST with the service key. The SECURITY DEFINER setters are
-- unaffected by any of this: they execute as the table's OWNER, whose rights are
-- implicit and cannot be revoked from it here.
alter table public.stop_events enable row level security;

revoke all on table public.stop_events from public, anon, authenticated, service_role;
grant select on table public.stop_events to service_role;


-- ── 3) The global setter ───────────────────────────────────────────────────
--
-- Replaces the direct TypeScript UPDATE. The state change and its audit row are
-- one statement pair inside one function, so there is no interleaving in which
-- the boolean moves and the evidence does not — the failure mode of a TS update
-- followed by a separate insert.
--
-- Returns `changed` so the caller can tell a real transition from a repeated
-- command WITHOUT reading the ledger back and guessing.

create or replace function public.stop_set_platform_automation(
  p_paused boolean, p_actor text, p_reason text default null
) returns table (changed boolean, previous_paused boolean,
                 new_paused boolean, event_id uuid)
language plpgsql security definer set search_path to '' as $$
declare
  v_prev     boolean;
  v_event_id uuid;
begin
  if p_paused is null then
    raise exception 'p_paused is required' using errcode = '22023';
  end if;
  -- The actor is the whole point of the ledger. A nameless transition is worth
  -- less than no row at all, because it looks like provenance and is not.
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'p_actor is required' using errcode = '22023';
  end if;

  -- Serialise concurrent operators on the singleton row. Without the lock two
  -- simultaneous toggles both read the old value and both write a transition,
  -- and the ledger then claims the same change happened twice.
  select pc.automation_paused into v_prev
    from public.platform_config pc where pc.id = 1 for update;

  if not found then
    -- Fail loudly. Silently treating a missing config row as "not paused" is
    -- how a kill switch becomes a no-op.
    raise exception 'platform_config row 1 is missing' using errcode = 'P0002';
  end if;

  if v_prev = p_paused then
    return query select false, v_prev, v_prev, null::uuid;
    return;
  end if;

  update public.platform_config set
    automation_paused = p_paused,
    -- No coalesce is needed to "keep the first pause instant": this branch runs
    -- ONLY on a false→true transition, so there is no re-pause to restamp.
    paused_at         = case when p_paused then now()    else null end,
    paused_reason     = case when p_paused then p_reason else null end,
    updated_at        = now()
  where id = 1;

  insert into public.stop_events (scope_type, scope_id, event,
                                  previous_paused, new_paused, actor, reason)
  values ('PLATFORM_AUTOMATION', null,
          case when p_paused then 'PAUSED' else 'RESUMED' end,
          v_prev, p_paused, btrim(p_actor), p_reason)
  returning id into v_event_id;

  return query select true, v_prev, p_paused, v_event_id;
end $$;

revoke all on function public.stop_set_platform_automation(boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.stop_set_platform_automation(boolean, text, text)
  to service_role;


-- ── 4) The project setter ──────────────────────────────────────────────────
--
-- Same contract, one scope down. Row-locks the project rather than the config
-- singleton, so pausing project A never serialises against pausing project B.

create or replace function public.stop_set_project_execution(
  p_project_id uuid, p_paused boolean, p_actor text, p_reason text default null
) returns table (changed boolean, previous_paused boolean,
                 new_paused boolean, event_id uuid)
language plpgsql security definer set search_path to '' as $$
declare
  v_prev     boolean;
  v_event_id uuid;
begin
  if p_project_id is null then
    raise exception 'p_project_id is required' using errcode = '22023';
  end if;
  if p_paused is null then
    raise exception 'p_paused is required' using errcode = '22023';
  end if;
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'p_actor is required' using errcode = '22023';
  end if;

  select p.execution_paused into v_prev
    from public.projects p where p.id = p_project_id for update;

  if not found then
    -- An unknown project must not produce a ledger row pointing at nothing.
    raise exception 'project % does not exist', p_project_id using errcode = 'P0002';
  end if;

  if v_prev = p_paused then
    return query select false, v_prev, v_prev, null::uuid;
    return;
  end if;

  update public.projects set
    execution_paused = p_paused,
    paused_at        = case when p_paused then now()    else null end,
    paused_reason    = case when p_paused then p_reason else null end
  where id = p_project_id;   -- never touches another project

  insert into public.stop_events (scope_type, scope_id, event,
                                  previous_paused, new_paused, actor, reason)
  values ('PROJECT_EXECUTION', p_project_id,
          case when p_paused then 'PAUSED' else 'RESUMED' end,
          v_prev, p_paused, btrim(p_actor), p_reason)
  returning id into v_event_id;

  return query select true, v_prev, p_paused, v_event_id;
end $$;

revoke all on function public.stop_set_project_execution(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.stop_set_project_execution(uuid, boolean, text, text)
  to service_role;


-- ── 5) The read model ──────────────────────────────────────────────────────
--
-- Both scopes in ONE round trip, so a resolver cannot observe a half-state in
-- which the global flag is fresh and the project flag is stale.
--
-- `project_paused` is NULL — not false — when the project is absent or was not
-- asked about. A missing project is "I do not know", and the caller must be able
-- to tell that from "I know, and it is clear"; coalescing to false would hand an
-- autonomous caller a green light derived from a lookup that failed.

create or replace function public.stop_state(p_project_id uuid default null)
returns table (
  global_paused         boolean,
  global_paused_at      timestamptz,
  global_paused_reason  text,
  project_requested     boolean,
  project_found         boolean,
  project_paused        boolean,
  project_paused_at     timestamptz,
  project_paused_reason text
) language sql stable security definer set search_path to '' as $$
  select
    pc.automation_paused,
    pc.paused_at,
    pc.paused_reason,
    (p_project_id is not null),
    (p.id is not null),
    p.execution_paused,     -- NULL when not found / not requested
    p.paused_at,
    p.paused_reason
  from public.platform_config pc
  left join public.projects p
    on p_project_id is not null and p.id = p_project_id
  where pc.id = 1;
$$;

revoke all on function public.stop_state(uuid) from public, anon, authenticated;
grant execute on function public.stop_state(uuid) to service_role;


-- ── 6) The stop-state write guard ──────────────────────────────────────────
--
-- WHY THIS EXISTS. Everything above routes the APPLICATION through the audited
-- setters, but nothing yet stopped the application from going around them.
-- Verified in production:
--
--   • `service_role` holds direct UPDATE on BOTH public.platform_config and
--     public.projects (has_table_privilege = true for each).
--   • `service_role` has rolbypassrls = true, so no RLS policy can stop it.
--   • `service_role` is NOT a member of `postgres` and cannot SET ROLE postgres.
--   • Both tables are owned by `postgres`, and every canonical stop function is
--     SECURITY DEFINER owned by `postgres`.
--
-- So a service-role client could set `automation_paused = true` with a plain
-- UPDATE and produce NO ledger row — the exact bypass the ledger exists to make
-- impossible. Revoking table-level UPDATE is not an option: both are shared
-- runtime tables and a blanket revoke would break unrelated writers.
--
-- THE WHOLE BUNDLE IS PROTECTED, not just the booleans. Leaving `paused_at` and
-- `paused_reason` writable would let a caller keep the boolean untouched while
-- falsifying WHEN the stop happened and WHY — making the current state disagree
-- with an immutable ledger, which is worse than having no ledger.
--
-- ── WHY THESE FUNCTIONS MUST NOT BE SECURITY DEFINER ───────────────────────
-- They are SECURITY INVOKER (PostgreSQL's default, stated by omission) and that
-- is LOAD-BEARING, not stylistic.
--
-- PostgreSQL sets `current_user` to the function owner for the duration of a
-- SECURITY DEFINER call. That is exactly the signal these guards read:
--
--   service_role → stop_set_platform_automation() [SECURITY DEFINER, owner
--                  postgres] → the UPDATE runs with current_user = postgres
--                  = the table's owner → ALLOWED, and the audit row is written
--                  in the same transaction.
--
--   service_role → direct UPDATE → current_user = service_role ≠ owner
--                  → REFUSED.
--
-- Marking a guard SECURITY DEFINER would make it run as ITS owner too, so it
-- would observe the trusted identity even for a direct service_role UPDATE and
-- silently authorise the very bypass it was written to close. A mutation test
-- pins this.
--
-- `session_user` is deliberately NOT used: it keeps the original login role
-- through SECURITY DEFINER execution, so it cannot distinguish these cases.
--
-- The trusted identity is read from the catalog as the table's OWN owner rather
-- than hardcoded, so the guard states the actual rule — "stop state changes only
-- while executing as the table owner" — and cannot drift from the table it
-- protects. There is no bypass parameter, no GUC, no dynamic SQL, and nothing
-- the application can pass to opt out: the execution identity IS the boundary.

create or replace function public.stop_guard_platform_config()
returns trigger language plpgsql set search_path to '' as $$
declare v_owner name;
begin
  -- IS DISTINCT FROM, not "column appeared in the SET clause": a statement that
  -- writes the same value back is a no-op and must stay harmless, or ordinary
  -- writers that re-send the whole row would break for no safety gain.
  if new.automation_paused is distinct from old.automation_paused
     or new.paused_at      is distinct from old.paused_at
     or new.paused_reason  is distinct from old.paused_reason
  then
    select pg_catalog.pg_get_userbyid(c.relowner) into v_owner
      from pg_catalog.pg_class c where c.oid = tg_relid;

    if current_user <> v_owner then
      raise exception
        'platform stop state is writable only through stop_set_platform_automation() '
        '(current_user=%, required=%)', current_user, v_owner
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function public.stop_guard_projects()
returns trigger language plpgsql set search_path to '' as $$
declare v_owner name;
begin
  select pg_catalog.pg_get_userbyid(c.relowner) into v_owner
    from pg_catalog.pg_class c where c.oid = tg_relid;

  if tg_op = 'INSERT' then
    -- A project created ALREADY paused would reach the paused state with no
    -- transition row — the ledger would describe a system that had never
    -- stopped, while a project sat stopped. Normal creation is unaffected: the
    -- columns default to false/null/null and no application INSERT sets them.
    if current_user <> v_owner
       and (coalesce(new.execution_paused, false)
            or new.paused_at is not null
            or new.paused_reason is not null)
    then
      raise exception
        'a project cannot be created already stopped; use stop_set_project_execution() '
        'after creation (current_user=%)', current_user
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.execution_paused is distinct from old.execution_paused
     or new.paused_at     is distinct from old.paused_at
     or new.paused_reason is distinct from old.paused_reason
  then
    if current_user <> v_owner then
      raise exception
        'project stop state is writable only through stop_set_project_execution() '
        '(current_user=%, required=%)', current_user, v_owner
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stop_guard_platform_config on public.platform_config;
create trigger stop_guard_platform_config
  before update on public.platform_config
  for each row execute function public.stop_guard_platform_config();

drop trigger if exists stop_guard_projects on public.projects;
create trigger stop_guard_projects
  before insert or update on public.projects
  for each row execute function public.stop_guard_projects();

-- Trigger functions are invoked by the executor, not called by name; these
-- revokes only stop someone trying to call them directly and do not affect
-- whether the triggers fire.
revoke all on function public.stop_guard_platform_config() from public, anon, authenticated, service_role;
revoke all on function public.stop_guard_projects()        from public, anon, authenticated, service_role;


-- ── 7) Retire the unaudited alternate path ─────────────────────────────────
--
-- set_project_execution_paused() wrote projects.execution_paused with no actor,
-- no reason trail and no ledger row. Leaving it in place would mean the audit
-- established above can be bypassed by calling the older function — which makes
-- the ledger's completeness a convention rather than a property.
--
-- Verified against production before writing this migration:
--   • zero application callers        (grep across apps/web: only test pins)
--   • zero SQL callers                (no pg_proc body references it)
--   • zero pg_depend references       (nothing depends on it)
-- so this removes an unused path rather than breaking a live one.
--
-- No CASCADE. If some object DOES depend on it, this must fail and be
-- re-analysed, not quietly drop whatever hangs off it.

drop function if exists public.set_project_execution_paused(uuid, boolean, text);
