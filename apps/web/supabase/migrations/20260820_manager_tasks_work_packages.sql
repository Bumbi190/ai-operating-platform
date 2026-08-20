-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Manager → Workforce Work Package V1 — additive columns on manager_tasks
--   ──────────────────────────────────────────────────────────────────────
--   EI-S1.4D. Implements the FM.2 Stage 1 requirement "safe Manager/Workforce
--   handoff" as the canonical Chapter 21 §21.9 Work Package.
--
--   "Delegation is not instruction. It is the transfer of BOUNDED authority."
--   (§21.12) — and a Work Package is that transfer one hop further down:
--
--       Mission  ⊇  Delegation Envelope  ⊇  Work Package
--
--   WHY THIS TABLE AND NOT A NEW ONE. EI-S1.4A found manager_tasks is the
--   existing operational coordination store and the natural home for Work
--   Packages; a fresh EI-S1.4D audit agreed — 8 legacy rows, 14 columns, no
--   triggers, RLS on. Creating a parallel task system would leave the platform
--   with two places that both mean "work the Manager is coordinating", which is
--   how the two quietly stop agreeing. So this migration is ADDITIVE.
--
--   THE SPLIT THAT MAKES THIS SAFE. manager_tasks is deliberately mutable:
--   legacy callers move `status`, write `result`, attach `run_id`. A Work
--   Package's authority terms must be exactly the opposite. Rather than impose
--   one rule on the whole table, each row is two things at once:
--
--     OPERATIONAL SHELL   title, description, status, priority, result, run_id,
--                         workflow_id — unchanged, still mutable, legacy flows
--                         completely untouched.
--     CANONICAL CONTRACT  work_package + its hash + the Mission/Delegation pins
--                         + the assigned role — IMMUTABLE once written, enforced
--                         by the trigger below.
--
--   A legacy row has no contract: every column added here is NULL, the
--   conditional CHECK does not apply to it, and the trigger ignores it. That is
--   why `project_id` STAYS GLOBALLY NULLABLE. Making it NOT NULL would rewrite
--   the meaning of rows nobody reviewed, and §21.158 is enforced instead by the
--   conditional CHECK: a row carrying a canonical package must name its project.
--
--   NO DESTRUCTIVE BACKFILL. Nothing here updates, deletes or reinterprets an
--   existing row. The 8 production rows are untouched by design.
--
--   LEGACY STATUS IS NOT CANONICAL STATE. §21.42 `assigned` is DERIVED from the
--   existence of a valid contract, never read from manager_tasks.status. Those
--   are legacy operational values and keep meaning exactly what they meant; two
--   mutable status sources competing over one row is how a ledger starts
--   disagreeing with itself.
--
--   THE DISCRIMINATOR AND THE HISTORY ARE BOTH PROTECTED (EI-S1.4D-R2).
--   `source = 'work_package'` is required on canonical rows and frozen once
--   written, because legacy isolation depends on it. And a canonical row cannot
--   be deleted — not directly, and not through the project ON DELETE CASCADE
--   this table already carries — so §21.42 assignment history cannot disappear.
--   Legacy rows keep their existing delete semantics untouched.
--
--   NOTHING HERE EXECUTES ANYTHING. §21.42 — assignment means the Workforce role
--   has RECEIVED the package, not started it. This migration creates no queue,
--   no cron, no dispatch trigger, and no path to any runner, workflow, tool,
--   publisher or external API. Writing the row is the whole effect.
--
--   DEPLOYMENT ORDER IS DELIBERATE. This file is committed BEFORE it is applied,
--   so apps/web/scripts/check-migrations.mjs will correctly fail a Vercel build
--   until a separately authorized rollout applies it — deployment blocked by
--   design. That failure must not be bypassed, grandfathered, or dodged.
--   Derived ledger name: `manager_tasks_work_packages`.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── The canonical contract columns ────────────────────────────────────────────
-- All nullable: a legacy task simply has none of them.

alter table public.manager_tasks
  -- §21.9 — stable Work Package identity, distinct from the task row id so the
  -- canonical object can be referenced without leaking the operational shell.
  add column if not exists work_package_id        uuid,
  -- The §21.9 contract itself: task objective, inputs, expected output,
  -- authority, allowed/forbidden actions, constraints, tools, data scope,
  -- budget, deadline, reporting, escalation, stop conditions, approval gates,
  -- scope, §21.29 dependencies and fallback. Deliberately NOT a prompt string:
  -- prose cannot be checked for containment against its parent.
  add column if not exists work_package           jsonb,
  -- Deterministic hash of the authority-bearing terms above. The trigger below
  -- compares against this, so "did the contract change?" is one comparison
  -- rather than a structural diff nobody can audit.
  add column if not exists work_package_hash      text,

  -- ── The authority pin (§21.14/§21.15) ──
  -- WHICH accepted Delegation this package draws authority from, and WHAT that
  -- Delegation said at the time. The hash is what catches drift: version
  -- numbers can agree while the terms have moved.
  add column if not exists delegation_envelope_id uuid,
  add column if not exists delegation_bound_hash  text,
  -- The Mission behind that Delegation, carried for §21.28 traceability.
  add column if not exists mission_id             uuid,
  add column if not exists mission_version        integer,
  add column if not exists mission_bound_hash     text,

  -- §21.34 — the Workforce role that RECEIVED the package. References the
  -- `agents` registry: the real, project-scoped, populated table the runtime
  -- itself resolves when work has to be done by someone.
  add column if not exists workforce_role_id      uuid,
  add column if not exists assigned_at            timestamptz;

-- ── Conditional invariants ────────────────────────────────────────────────────
-- Every constraint below is written so a legacy row (work_package_id IS NULL)
-- trivially satisfies it. New rules apply only to canonical packages.

do $$
begin
  -- §6.117/§21.158 — a canonical package names its project. Legacy rows may
  -- still have a null project; that is their existing, reviewed meaning.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manager_tasks'::regclass
      and conname = 'manager_tasks_work_package_project_check'
  ) then
    alter table public.manager_tasks
      add constraint manager_tasks_work_package_project_check check (
        work_package_id is null or project_id is not null
      );
  end if;

  -- ALL OR NONE. A row is structurally exactly one of two things.
  --
  -- EI-S1.4D-R1 corrected a one-directional check here. It required a complete
  -- contract when `work_package_id` was present, but said nothing about the
  -- other direction — so a row could carry a populated `work_package` JSON, a
  -- Mission pin and a role while leaving `work_package_id` NULL. That row would
  -- be invisible to every canonical index and lookup (all partial on
  -- `work_package_id is not null`) while sitting in the table looking like
  -- authority. Schema integrity, not policy: neither shape is a judgement about
  -- what anyone may do, only about what a row IS.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manager_tasks'::regclass
      and conname = 'manager_tasks_work_package_shape_check'
  ) then
    alter table public.manager_tasks
      add constraint manager_tasks_work_package_shape_check check (
        -- LEGACY: no canonical identity, and no canonical field populated.
        (
          work_package_id            is null
          and work_package           is null
          and work_package_hash      is null
          and delegation_envelope_id is null
          and delegation_bound_hash  is null
          and mission_id             is null
          and mission_version        is null
          and mission_bound_hash     is null
          and workforce_role_id      is null
          and assigned_at            is null
        )
        -- CANONICAL: identity present, and every required field with it.
        or (
          work_package_id            is not null
          and work_package           is not null
          and work_package_hash      is not null
          and delegation_envelope_id is not null
          and delegation_bound_hash  is not null
          and mission_id             is not null
          and mission_version        is not null
          and mission_bound_hash     is not null
          and workforce_role_id      is not null
          and assigned_at            is not null
        )
      );
  end if;

  -- THE CANONICAL DISCRIMINATOR IS PART OF THE CONTRACT (EI-S1.4D-R2).
  --
  -- `source` began as an ordinary operational-shell field, but EI-S1.4D-R1 made
  -- it load-bearing: legacy Manager surfaces exclude canonical rows with
  -- `source IS NULL OR source <> 'work_package'`. A canonical row that lost its
  -- discriminator would therefore reappear as an ACTIVE MANAGER TASK — a §21.42
  -- assigned package, which has been RECEIVED and not started, presented as
  -- work in flight. So the value is now required, not merely written.
  --
  -- The reverse is constrained too: a row may not CLAIM to be a Work Package
  -- without carrying a complete contract, which would exclude it from legacy
  -- surfaces while giving it no canonical identity — invisible in both
  -- directions at once.
  --
  -- Legacy `source` values are otherwise untouched: NULL, 'dream' and anything
  -- else stay exactly as valid as they were.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manager_tasks'::regclass
      and conname = 'manager_tasks_work_package_source_check'
  ) then
    alter table public.manager_tasks
      add constraint manager_tasks_work_package_source_check check (
        case
          when work_package_id is not null
            then source = 'work_package' and source_key = work_package_id::text
          else source is null or source <> 'work_package'
        end
      );
  end if;

  -- Hashes are sha256 hex or absent. A malformed pin cannot be compared, and a
  -- pin that cannot be compared is not a pin.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manager_tasks'::regclass
      and conname = 'manager_tasks_work_package_hash_format_check'
  ) then
    alter table public.manager_tasks
      add constraint manager_tasks_work_package_hash_format_check check (
        (work_package_hash     is null or work_package_hash     ~ '^[0-9a-f]{64}$')
        and (delegation_bound_hash is null or delegation_bound_hash ~ '^[0-9a-f]{64}$')
        and (mission_bound_hash    is null or mission_bound_hash    ~ '^[0-9a-f]{64}$')
      );
  end if;

  -- §20.127 — a version within the package's own lineage. V1 assigns once.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manager_tasks'::regclass
      and conname = 'manager_tasks_mission_version_check'
  ) then
    alter table public.manager_tasks
      add constraint manager_tasks_mission_version_check check (
        mission_version is null or mission_version >= 1
      );
  end if;

  -- §21.34 — the role must exist in the sanctioned registry. ON DELETE RESTRICT
  -- so a role cannot be removed out from under a package that was assigned to
  -- it, which would leave an assignment naming nobody.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manager_tasks'::regclass
      and conname = 'manager_tasks_workforce_role_fkey'
  ) then
    alter table public.manager_tasks
      add constraint manager_tasks_workforce_role_fkey
      foreign key (workforce_role_id) references public.agents(id) on delete restrict;
  end if;
end $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- One canonical package per id. Partial, so the 8 legacy rows (and every future
-- legacy task) are simply not in the index.
create unique index if not exists manager_tasks_work_package_id_idx
  on public.manager_tasks (work_package_id)
  where work_package_id is not null;

-- The Executive's view of what a Delegation has been decomposed into.
create index if not exists manager_tasks_delegation_envelope_idx
  on public.manager_tasks (delegation_envelope_id, assigned_at desc)
  where delegation_envelope_id is not null;

-- Project listing of canonical packages, and the §21.158 scope lookup.
create index if not exists manager_tasks_work_package_project_idx
  on public.manager_tasks (project_id, assigned_at desc)
  where work_package_id is not null;

-- ── Contract immutability (§21.18 applied at this hop) ────────────────────────
-- A bounded contract whose terms can move after assignment is not a contract.
--
-- This is NOT an append-only table and must never become one: legacy callers
-- update `status`, `result`, `run_id` and `updated_at`, and those must keep
-- working exactly as before. The trigger therefore guards only the canonical
-- authority columns, and only once a contract exists.
--
-- Assignment is also final in V1: a row that carries a package cannot have that
-- package swapped for another. Reassigning work is a NEW package prepared from
-- the Delegation, never an edit to this one — §21.34 makes WHO received it part
-- of the contract.

create or replace function public.manager_tasks_reject_work_package_mutation()
returns trigger
language plpgsql
as $$
begin
  -- A LEGACY ROW MAY NEVER BECOME CANONICAL BY UPDATE.
  --
  -- EI-S1.4D-R1 closed this. The first version returned early whenever the OLD
  -- row had no contract, which permitted exactly the thing the design forbids:
  -- take an existing legacy task, UPDATE a Work Package onto it, and it becomes
  -- authority without ever passing the sanctioned write boundary — no parent
  -- Delegation resolved, no attenuation, no role validation. A canonical Work
  -- Package originates by INSERT or not at all.
  --
  -- Ordinary legacy updates still pass: status, result, run_id, title,
  -- description and every other operational field move freely, so long as the
  -- row stays legacy.
  if old.work_package_id is null then
    if new.work_package_id            is not null
       or new.work_package            is not null
       or new.work_package_hash       is not null
       or new.delegation_envelope_id  is not null
       or new.delegation_bound_hash   is not null
       or new.mission_id              is not null
       or new.mission_version         is not null
       or new.mission_bound_hash      is not null
       or new.workforce_role_id       is not null
       or new.assigned_at             is not null
    then
      raise exception
        'manager_tasks: a Work Package contract may only be created by INSERT, never attached to an existing task (task %)', old.id
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  -- From here the row carries a contract. Every authority-bearing column is
  -- frozen; everything else on the row stays mutable.
  if new.work_package_id         is distinct from old.work_package_id
     or new.work_package         is distinct from old.work_package
     or new.work_package_hash    is distinct from old.work_package_hash
     or new.delegation_envelope_id is distinct from old.delegation_envelope_id
     or new.delegation_bound_hash  is distinct from old.delegation_bound_hash
     or new.mission_id           is distinct from old.mission_id
     or new.mission_version      is distinct from old.mission_version
     or new.mission_bound_hash   is distinct from old.mission_bound_hash
     or new.workforce_role_id    is distinct from old.workforce_role_id
     or new.assigned_at          is distinct from old.assigned_at
     or new.project_id           is distinct from old.project_id
     -- EI-S1.4D-R2: the discriminator is frozen too. Clearing `source` on a
     -- canonical row would push a §21.42 assigned package straight back into
     -- the legacy ACTIVE MANAGER TASKS surface that R1 closed.
     or new.source               is distinct from old.source
     or new.source_key           is distinct from old.source_key
  then
    raise exception
      'manager_tasks: the Work Package authority contract is immutable once assigned (task %)', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists manager_tasks_work_package_immutable on public.manager_tasks;
create trigger manager_tasks_work_package_immutable
  before update on public.manager_tasks
  for each row execute function public.manager_tasks_reject_work_package_mutation();

-- ── Audit preservation (§21.42) ───────────────────────────────────────────────
-- A canonical assignment is institutional history. It may not simply vanish.
--
-- THE CASCADE IS THE REAL RISK. `manager_tasks.project_id` references
-- `projects(id)` ON DELETE CASCADE — verified read-only against the production
-- catalog — so deleting a project would silently erase every Work Package
-- assigned within it, with no trace that the assignments ever happened. A
-- BEFORE DELETE trigger on the child table fires for cascaded deletes too, so
-- one conditional guard closes both the direct DELETE and the cascade without
-- rewriting the existing foreign key or touching project lifecycle.
--
-- THIS DOES NOT MAKE manager_tasks APPEND-ONLY. Legacy rows keep their existing
-- delete semantics exactly, including cascade. Only rows carrying a canonical
-- contract are protected, and the failure is loud: a project deletion that
-- would destroy assignment history is BLOCKED rather than quietly completed.

create or replace function public.manager_tasks_reject_work_package_delete()
returns trigger
language plpgsql
as $$
begin
  if old.work_package_id is null then
    return old;  -- legacy row: unchanged behaviour, including project cascade
  end if;
  raise exception
    'manager_tasks: Work Package assignment history is not deletable (task %, package %)',
    old.id, old.work_package_id
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists manager_tasks_work_package_no_delete on public.manager_tasks;
create trigger manager_tasks_work_package_no_delete
  before delete on public.manager_tasks
  for each row execute function public.manager_tasks_reject_work_package_delete();

comment on column public.manager_tasks.work_package is
  'Chapter 21 s21.9 Work Package contract — the Manager to Workforce bounded handoff. '
  'Immutable once assigned (trigger manager_tasks_work_package_immutable). '
  'Attenuated from an accepted Delegation Envelope: WorkPackage is a subset of Delegation is a subset of Mission (s6.39). '
  'Canonical state assigned (s21.42) is DERIVED from this contract existing; manager_tasks.status remains legacy operational. '
  'Assignment means the role RECEIVED the package, never that anything executed. '
  'NULL on legacy tasks, which are unaffected by every constraint added with this column. '
  'See docs/architecture/executive-intelligence/ and canonical Ch 21.';
