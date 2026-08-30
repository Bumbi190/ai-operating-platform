-- ─────────────────────────────────────────────────────────────────────────────
--  PR9c — WORKFLOW ACTION BINDING + IDEMPOTENCY.
--
--  A future workflow action run must be structurally bound to the exact thing a
--  human approved. Today `runs` carries project_id, workflow_id, kind and two
--  MUTABLE jsonb columns (input, context) that are written during execution — so
--  a run could swap its target after approval and nothing would notice.
--
--  ── ALL-OR-NOTHING ─────────────────────────────────────────────────────────
--  1251 legacy runs exist and must stay valid, so every binding column is
--  nullable. Nullable columns invite partial binding, which is worse than none:
--  a run with an authorization_id but no target_version_hash LOOKS authorized.
--  The CHECK therefore admits exactly two shapes — all ten null (a legacy run),
--  or all ten present (a workflow action run). Nothing in between.
--
--  ── IMMUTABLE AFTER INSERT ─────────────────────────────────────────────────
--  TypeScript cannot be the only guard: the service role can write this table
--  directly, and the whole point is that a run cannot change what it was
--  authorized to do. A BEFORE UPDATE trigger rejects any change to the binding
--  while leaving status/attempts/lease/error/output freely updatable, because the
--  executor must be able to do its job.
--
--  ── DERIVED, NEVER SUPPLIED ────────────────────────────────────────────────
--  The BEFORE INSERT trigger re-derives project, def_hash and state FROM the
--  instance and refuses a row that disagrees. A caller may request an action; it
--  may not assert the binding.
--
--  ── MATERIAL ACTIONS DO NOT RETRY ──────────────────────────────────────────
--  max_attempts is forced to 1 for MATERIAL_WRITE, FINANCIAL,
--  EXTERNAL_COMMUNICATION and DESTRUCTIVE. The default is 3, and a retried
--  material write is a duplicated side effect — a newsletter sent twice, an
--  upload duplicated, a charge repeated. This is a schema invariant rather than
--  a convention because conventions do not survive a hurried caller.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Binding columns. All nullable so 1251 legacy runs remain valid.
alter table public.runs add column if not exists workflow_instance_id uuid references public.workflow_instances(id);
alter table public.runs add column if not exists workflow_def_hash    text;
alter table public.runs add column if not exists workflow_from_state  text;
alter table public.runs add column if not exists action_kind          text;
alter table public.runs add column if not exists action_class         text;
alter table public.runs add column if not exists target_version_hash  text;
alter table public.runs add column if not exists authorization_id     uuid;
alter table public.runs add column if not exists idempotency_key      text;
alter table public.runs add column if not exists attempt_group        uuid;
alter table public.runs add column if not exists authorized_at        timestamptz;

-- 2) All-or-nothing. Partial binding is rejected outright.
alter table public.runs drop constraint if exists runs_action_binding_complete;
alter table public.runs add constraint runs_action_binding_complete check (
  (workflow_instance_id is null and workflow_def_hash is null and workflow_from_state is null
   and action_kind is null and action_class is null and target_version_hash is null
   and authorization_id is null and idempotency_key is null and attempt_group is null
   and authorized_at is null)
  or
  (workflow_instance_id is not null and workflow_def_hash is not null and workflow_from_state is not null
   and action_kind is not null and action_class is not null and target_version_hash is not null
   and authorization_id is not null and idempotency_key is not null and attempt_group is not null
   and authorized_at is not null)
);

-- 3) Shape of the pinned values. A truncated or upper-cased hash would silently
--    never match the authorization's, which reads as "stale" rather than "bug".
alter table public.runs drop constraint if exists runs_target_version_hash_sha256;
alter table public.runs add constraint runs_target_version_hash_sha256 check (
  target_version_hash is null or target_version_hash ~ '^[0-9a-f]{64}$'
);

alter table public.runs drop constraint if exists runs_idempotency_key_sha256;
alter table public.runs add constraint runs_idempotency_key_sha256 check (
  idempotency_key is null or idempotency_key ~ '^[0-9a-f]{64}$'
);

alter table public.runs drop constraint if exists runs_action_class_vocabulary;
alter table public.runs add constraint runs_action_class_vocabulary check (
  action_class is null or action_class in
    ('READ_ONLY','REVERSIBLE_WRITE','MATERIAL_WRITE','FINANCIAL','EXTERNAL_COMMUNICATION','DESTRUCTIVE')
);

-- 4) Material and above never auto-retry. Schema invariant, not convention.
alter table public.runs drop constraint if exists runs_material_actions_single_attempt;
alter table public.runs add constraint runs_material_actions_single_attempt check (
  action_class is null
  or action_class in ('READ_ONLY','REVERSIBLE_WRITE')
  or max_attempts = 1
);

-- 5) Idempotency. One action identity may hold at most one live run; a cancelled
--    or rejected one releases the identity so a deliberate re-run can take it.
--    Partial, so the 1251 legacy runs (idempotency_key null) are unaffected.
drop index if exists runs_action_identity_uniq;
create unique index runs_action_identity_uniq
  on public.runs (idempotency_key)
  where idempotency_key is not null and status not in ('cancelled','rejected');

create index if not exists runs_workflow_instance_idx
  on public.runs (workflow_instance_id, created_at)
  where workflow_instance_id is not null;

-- 6) The invariant TypeScript must not be trusted with alone.
create or replace function public.runs_action_binding_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare inst public.workflow_instances;
begin
  if tg_op = 'UPDATE' then
    -- Binding is immutable. Status, attempts, lease, claim, error, output and
    -- cancellation all stay writable — the executor still has a job to do.
    if new.workflow_instance_id is distinct from old.workflow_instance_id
       or new.workflow_def_hash   is distinct from old.workflow_def_hash
       or new.workflow_from_state is distinct from old.workflow_from_state
       or new.action_kind         is distinct from old.action_kind
       or new.action_class        is distinct from old.action_class
       or new.target_version_hash is distinct from old.target_version_hash
       or new.authorization_id    is distinct from old.authorization_id
       or new.idempotency_key     is distinct from old.idempotency_key
       or new.attempt_group       is distinct from old.attempt_group
       or new.authorized_at       is distinct from old.authorized_at then
      raise exception
        'runs: the workflow action binding is immutable (run %); status/attempts/lease/error are updatable, the authorized target is not',
        old.id using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  -- INSERT: the binding is DERIVED from the instance, never asserted by the
  -- caller. A row that disagrees with its own instance is refused.
  if new.workflow_instance_id is null then
    return new;                              -- legacy run, nothing to check
  end if;

  select * into inst from public.workflow_instances where id = new.workflow_instance_id;
  if not found then
    raise exception 'runs: workflow instance % does not exist', new.workflow_instance_id
      using errcode = 'foreign_key_violation';
  end if;
  if new.project_id is distinct from inst.project_id then
    raise exception 'runs: project % does not match workflow instance project %',
      new.project_id, inst.project_id using errcode = 'restrict_violation';
  end if;
  if new.workflow_def_hash is distinct from inst.def_hash then
    raise exception 'runs: pinned def_hash does not match instance def_hash'
      using errcode = 'restrict_violation';
  end if;
  if new.workflow_from_state is distinct from inst.current_state then
    raise exception 'runs: from_state "%" is not the instance current state "%"',
      new.workflow_from_state, inst.current_state using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

drop trigger if exists runs_action_binding_guard_trg on public.runs;
create trigger runs_action_binding_guard_trg
  before insert or update on public.runs
  for each row execute function public.runs_action_binding_guard();

-- 7) PR9a carried finding, now closed. claim_runs' DEFAULT was 280 while the
--    drain's maxDuration is 300, so a caller relying on the default would get a
--    lease that expires while its function is still alive — the exact race the
--    320 value was chosen to close. Raising it is safe because there is EXACTLY
--    ONE caller (app/api/runs/drain) and it passes 320 explicitly, so this
--    changes the behaviour of no existing call site. Body is otherwise byte-for-
--    byte PR9a's: pause filter AND claim_id stamping both preserved.
create or replace function public.claim_runs(p_limit int, p_lease_seconds int default 320)
returns setof public.runs
language plpgsql security definer set search_path to '' as $$
begin
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1,
    claim_id    = gen_random_uuid()
  where r.id in (
    select ru.id from public.runs ru
    where ru.status = 'pending'
      and ru.attempts < ru.max_attempts
      and not exists (
        select 1 from public.projects p
        where p.id = ru.project_id and p.execution_paused = true
      )
    order by ru.created_at
    for update skip locked
    limit p_limit
  )
  returning r.*;
end $$;

revoke all on function public.claim_runs(int, int) from public, anon, authenticated;
grant execute on function public.claim_runs(int, int) to service_role;

comment on constraint runs_action_binding_complete on public.runs is
  'PR9c: a run is either fully bound to an authorized workflow action or not bound at all. Partial binding LOOKS authorized and is rejected.';
