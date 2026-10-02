-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1B2 · M1 — authority serialization primitives (INERT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
--   A future licensed bind (M4) may only commit while the mutable authority it
--   evaluated cannot change underneath it. The 3B1B2 architecture review found
--   two inputs with nothing a bind transaction could lock:
--
--   1. The Decision Ledger is append-only with optimistic concurrency (the
--      `one_advance` unique index), but there is no STABLE ROW per decision
--      lineage. A bind could read a governing decision while a reversal commits
--      beside it, and neither would notice.
--   2. `autonomy_license_append` serializes ONE licence lineage, by locking that
--      lineage's existing rows. A brand-new `license_id` has no rows, so a fresh
--      LICENSE_ISSUED locked nothing, and two licences for the same workflow
--      instance never serialized against each other — or against a bind.
--
-- WHAT (and nothing more — Survival is M2, the commit clock/fence is M3, the
-- licensed bind RPC and its provenance are M4)
--
--   A. `atlas_decision_lineage_heads` — ONE row per decision lineage that has
--      lifecycle-advancing history, moved by the DATABASE in the same
--      transaction as every lifecycle-advancing ledger insert. It is a
--      SERIALIZATION CURSOR, not a second ledger: it stores the identity of the
--      latest lifecycle act (record id, generation, type, version) and nothing
--      derived — no "governing" flag, no DecisionState, no policy, no timestamp
--      authority. The immutable ledger remains the only truth; Chapter 11's
--      fold remains the only interpretation of it.
--
--      Lock contract (future M4):  SELECT … FROM atlas_decision_lineage_heads
--      WHERE decision_id = … FOR SHARE.  While held, a competing lifecycle writer
--      cannot COMMIT a new head: its ledger insert succeeds, then the head
--      UPDATE waits on the share lock, and ledger row + head commit together
--      after the bind releases — or roll back together.
--
--   B. `autonomy_license_append` locks the licence subject's workflow_instances
--      row FOR UPDATE FIRST, before it reads or locks any licence-lineage truth.
--      Every licence act — including a LICENSE_ISSUED for a brand-new
--      license_id with zero rows — now serializes on its instance. The rest of
--      the function is the Phase 2C body, unchanged.
--
-- CANONICAL LOCK ORDER (fixed here; M4 must follow it)
--   workflow_instances row  →  decision lineage head  →  licence lineage rows
--   →  (M2/M3 primitives)
--   Licence writer:  instance FOR UPDATE → licence rows FOR UPDATE → append.
--   Decision writer: its ledger row → head row (UPDATE). It never takes an
--   instance or licence lock, so it cannot close a cycle with either.
--
-- NOT APPLIED BY THIS BRANCH.

-- ── A1. The lifecycle-advancing vocabulary, ONCE in SQL ─────────────────────
-- Exactly `LIFECYCLE_ADVANCING` in lib/atlas/decision-ledger/derive.ts — the
-- same nine types the ledger's own `one_advance` index lists. A permanent test
-- compares this function's list with the TypeScript set, so the two cannot
-- drift. Annotations (`outcome_observed`, `reviewed`) are not lifecycle acts and
-- never move a head.
create or replace function public.atlas_decision_record_type_advances(p_record_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_record_type in (
    -- lifecycle-advancing:begin
    'drafted', 'proposed', 'approved', 'rejected', 'deferred',
    'amended', 'superseded', 'reversed', 'completed'
    -- lifecycle-advancing:end
  )
$$;

-- ── A2. The head ────────────────────────────────────────────────────────────
create table if not exists public.atlas_decision_lineage_heads (
  -- The lineage. One row per decision with lifecycle-advancing history.
  decision_id      uuid primary key,
  -- The lineage's recorded scope. Immutable: every lifecycle act of a decision
  -- belongs to one project, and a head that could change project would let a
  -- bind prove one scope and commit another.
  project_id       uuid not null references public.projects (id) on delete restrict,
  -- The latest lifecycle-advancing act, by its immutable identity. A future
  -- bind pins exactly this record and generation.
  head_record_id   uuid not null unique
                     references public.atlas_decision_ledger (record_id) on delete restrict,
  -- Its lifecycle generation: the number of lifecycle acts before it. Strictly
  -- monotonic (+1 per lifecycle act), so it is also the head's count identity:
  -- generation g ⇔ g + 1 lifecycle acts.
  head_generation  integer not null
    constraint atlas_decision_lineage_heads_generation_non_negative check (head_generation >= 0),
  -- Its act type and decision version, copied verbatim from that record.
  head_record_type text not null
    constraint atlas_decision_lineage_heads_type_advances
      check (public.atlas_decision_record_type_advances(head_record_type)),
  head_version     integer not null
    constraint atlas_decision_lineage_heads_version_positive check (head_version >= 1)
);

comment on table public.atlas_decision_lineage_heads is
  'Phase 3B1B2 M1: a SERIALIZATION CURSOR for each Decision Ledger lineage — the identity of '
  'its latest lifecycle-advancing act, moved by the database in the same transaction as that '
  'act. Not a second ledger and not decision state: it says only whether the lifecycle head '
  'has changed. A future licensed bind locks it FOR SHARE. Written ONLY by the ledger''s '
  'insert trigger; no role holds DML.';

-- ── A3. Maintenance: the ledger moves its own head ──────────────────────────
-- AFTER INSERT, so the ledger's own checks and its `one_advance` unique index
-- have already decided the row (two writers at the same generation still get
-- 23505 exactly as before, and nothing here runs for the loser). For a
-- lifecycle-advancing act the head row is then locked and moved in the SAME
-- transaction: ledger row and head commit together or not at all. A bind
-- holding the head FOR SHARE makes this UPDATE wait — the writer's commit is
-- deferred, never its row reinterpreted.
--
-- The trigger also refuses what would make the head ambiguous: a first act that
-- is not generation 0, a later act that is not exactly head + 1, or an act that
-- moves the lineage to another project. Today's only writer (the TypeScript
-- boundary) never produces these; the trigger makes them impossible for every
-- other permitted writer too. 23514 (check_violation): malformed history, not a
-- concurrency conflict.
create or replace function public.atlas_decision_lineage_head_advance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_head public.atlas_decision_lineage_heads;
begin
  if not public.atlas_decision_record_type_advances(new.record_type) then
    return null;                                -- annotations never move a head
  end if;

  select * into v_head from public.atlas_decision_lineage_heads
   where decision_id = new.decision_id
   for update;

  if not found then
    if new.lifecycle_generation <> 0 then
      raise exception 'decision %: the first lifecycle act must be generation 0, not %',
        new.decision_id, new.lifecycle_generation using errcode = '23514';
    end if;
    insert into public.atlas_decision_lineage_heads
      (decision_id, project_id, head_record_id, head_generation, head_record_type, head_version)
    values
      (new.decision_id, new.project_id, new.record_id, new.lifecycle_generation, new.record_type, new.version);
    return null;
  end if;

  if new.lifecycle_generation <> v_head.head_generation + 1 then
    raise exception 'decision %: a lifecycle act must be generation % (head + 1), not %',
      new.decision_id, v_head.head_generation + 1, new.lifecycle_generation using errcode = '23514';
  end if;
  if new.project_id <> v_head.project_id then
    raise exception 'decision %: a lifecycle act may not move the lineage to another project',
      new.decision_id using errcode = '23514';
  end if;

  update public.atlas_decision_lineage_heads
     set head_record_id   = new.record_id,
         head_generation  = new.lifecycle_generation,
         head_record_type = new.record_type,
         head_version     = new.version
   where decision_id = new.decision_id;
  return null;
end;
$$;

drop trigger if exists atlas_decision_lineage_head_advance on public.atlas_decision_ledger;
create trigger atlas_decision_lineage_head_advance
  after insert on public.atlas_decision_ledger
  for each row execute function public.atlas_decision_lineage_head_advance();

-- ── A4. Backfill existing lineages (fail closed on any ambiguity) ───────────
-- Deterministic and read-only on the ledger. A lineage gets a head only if its
-- lifecycle acts are exactly generations 0..n-1 (the unique index already makes
-- each generation appear once) and every record of the decision names ONE
-- project. Anything else is a history this migration cannot interpret, so it
-- refuses rather than invent a head.
--
-- ORDER: the maintenance trigger (A3) is created FIRST. CREATE TRIGGER holds a
-- SHARE ROW EXCLUSIVE lock on the ledger until this migration commits, so when
-- the migration is applied as one transaction (Supabase does) no lifecycle act
-- can land between the backfill and the trigger at all. If it were ever applied
-- statement by statement instead, an act landing in between is still handled:
-- a generation-0 act creates its own correct head (kept by ON CONFLICT DO
-- NOTHING below), and any later act on a lineage whose head is not backfilled
-- yet is refused by the trigger (23514) rather than mis-recorded.
do $backfill$
declare
  v_bad record;
begin
  select l.decision_id, count(*) as acts, min(l.lifecycle_generation) as lo, max(l.lifecycle_generation) as hi
    into v_bad
    from public.atlas_decision_ledger l
   where public.atlas_decision_record_type_advances(l.record_type)
   group by l.decision_id
  having min(l.lifecycle_generation) <> 0 or max(l.lifecycle_generation) <> count(*) - 1
   limit 1;
  if found then
    raise exception 'decision % has non-contiguous lifecycle generations (% acts, % … %): no unambiguous head',
      v_bad.decision_id, v_bad.acts, v_bad.lo, v_bad.hi using errcode = '23514';
  end if;

  select l.decision_id into v_bad
    from public.atlas_decision_ledger l
   group by l.decision_id
  having count(distinct l.project_id) > 1
   limit 1;
  if found then
    raise exception 'decision % names more than one project: no unambiguous head', v_bad.decision_id
      using errcode = '23514';
  end if;

  insert into public.atlas_decision_lineage_heads
    (decision_id, project_id, head_record_id, head_generation, head_record_type, head_version)
  select distinct on (l.decision_id)
         l.decision_id, l.project_id, l.record_id, l.lifecycle_generation, l.record_type, l.version
    from public.atlas_decision_ledger l
   where public.atlas_decision_record_type_advances(l.record_type)
   order by l.decision_id, l.lifecycle_generation desc
  on conflict (decision_id) do nothing;
end;
$backfill$;

-- ── A5. The head cannot be rewritten ────────────────────────────────────────
-- Defence in depth below the privilege closure (A6): even a role that held DML
-- could not move a head backwards, sideways or to another lineage, and could
-- not delete one. Only the +1 step the maintenance trigger performs passes.
-- PostgreSQL does not protect a table from its OWNER (who can disable
-- triggers); that boundary is the database role model, not this migration.
create or replace function public.atlas_decision_lineage_heads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'atlas_decision_lineage_heads: % is not permitted', tg_op using errcode = '42501';
  end if;
  if new.decision_id is distinct from old.decision_id
     or new.project_id is distinct from old.project_id
     or new.head_generation is distinct from old.head_generation + 1 then
    raise exception 'atlas_decision_lineage_heads: a head only advances by one lifecycle act'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists atlas_decision_lineage_heads_guard on public.atlas_decision_lineage_heads;
create trigger atlas_decision_lineage_heads_guard
  before update or delete on public.atlas_decision_lineage_heads
  for each row execute function public.atlas_decision_lineage_heads_guard();

drop trigger if exists atlas_decision_lineage_heads_no_truncate on public.atlas_decision_lineage_heads;
create trigger atlas_decision_lineage_heads_no_truncate
  before truncate on public.atlas_decision_lineage_heads
  for each statement execute function public.atlas_decision_lineage_heads_guard();

-- ── A6. Server-only, and no ordinary writer ─────────────────────────────────
-- RLS on with ZERO policies; every role's privilege revoked; SELECT to
-- service_role only (a future SECURITY DEFINER bind reads it as its owner). No
-- role — service_role included — holds INSERT/UPDATE/DELETE/TRUNCATE: the head
-- moves only through the ledger's insert trigger, which runs as the owner.
alter table public.atlas_decision_lineage_heads enable row level security;
revoke all on table public.atlas_decision_lineage_heads from public, anon, authenticated, service_role;
grant select on table public.atlas_decision_lineage_heads to service_role;

-- Machinery, not APIs.
revoke all on function public.atlas_decision_lineage_head_advance() from public, anon, authenticated, service_role;
revoke all on function public.atlas_decision_lineage_heads_guard() from public, anon, authenticated, service_role;
revoke all on function public.atlas_decision_record_type_advances(text) from public, anon, authenticated;

-- ── B. The licence writer locks the workflow instance FIRST ─────────────────
-- `autonomy_license_append` is redefined with the Phase 2C body unchanged
-- except for ONE block, placed after the pure argument checks and before the
-- first read or lock of licence-lineage truth:
--
--     perform 1 from public.workflow_instances
--      where id = p_workflow_instance_id
--      for update;
--
-- A brand-new license_id has no rows to lock, so this is what serializes a
-- fresh LICENSE_ISSUED — against another licence for the same instance and
-- against a future bind holding the instance. The foreign key's implicit
-- FOR KEY SHARE at insert time is NOT enough: two key-share locks do not
-- conflict, and it is taken only at the very end, after every check has read.
--
-- The caller-NAMED instance is locked. For a continuing act that names the
-- wrong instance this briefly locks an unrelated row before the unchanged
-- subject check refuses the act (22023) and the transaction releases it. That
-- grants nothing — the act is refused — and it cannot close a lock cycle:
-- every path locks an instance before any licence row, and no path takes an
-- instance lock after a licence row.
--
-- If the named instance does not exist nothing is locked here and the
-- unchanged subject checks below refuse the act exactly as before.

create or replace function public.autonomy_license_append(
  p_license_id               uuid,
  p_expected_generation      integer,
  p_act                      text,
  p_project_id               uuid,
  p_workflow_instance_id     uuid,
  p_bound_def_key            text,
  p_bound_def_hash           text,
  p_licensed_level           text,
  p_allowed_action_kinds     text[],
  p_action_scope_fingerprint text,
  p_decision_id              uuid,
  p_decision_version         integer,
  p_decision_record_id       uuid,
  p_effective_at             timestamptz,
  p_expires_at               timestamptz,
  p_superseded_by_license_id uuid,
  p_reason                   text,
  p_actor                    text
)
returns public.atlas_autonomy_license_events
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_generation   integer;
  v_first        public.atlas_autonomy_license_events;
  v_prior_start  timestamptz;
  v_prior_end    timestamptz;
  v_level_index  integer;
  v_prior_min_level integer;
  v_row          public.atlas_autonomy_license_events;
begin
  -- ── Actor shape ─────────────────────────────────────────────────────────
  -- The authoritative check is `resolvePlatformOperator()` upstream; this
  -- refuses to let the LEDGER record a non-human actor regardless.
  if p_actor is null
     or p_actor !~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'p_actor must be the canonical human actor shape user:<uuid>' using errcode = '22023';
  end if;

  if p_act is null or p_act not in (
    'LICENSE_ISSUED', 'LICENSE_RESTRICTED', 'LICENSE_SUSPENDED',
    'LICENSE_REVOKED', 'LICENSE_SUPERSEDED'
  ) then
    raise exception 'unsupported act %', p_act using errcode = '22023';
  end if;

  if p_licensed_level is null or p_licensed_level not in ('L0','L1','L2','L3','L4','L5','L6') then
    raise exception 'unsupported licensed level %', p_licensed_level using errcode = '22023';
  end if;

  if p_allowed_action_kinds is null or cardinality(p_allowed_action_kinds) = 0 then
    raise exception 'at least one allowed action kind is required' using errcode = '22023';
  end if;

  if p_effective_at is null or p_expires_at is null or p_expires_at <= p_effective_at then
    raise exception 'the licence window must be a non-empty forward interval' using errcode = '22023';
  end if;

  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception 'p_expected_generation must be the caller''s observed generation, >= 0'
      using errcode = '22023';
  end if;

  -- ── Phase 3B1B2 M1: the workflow instance is locked FIRST ─────────────────
  -- Before any licence-lineage truth is read or locked. A brand-new license_id
  -- has no rows to lock, so this is what serializes a fresh LICENSE_ISSUED
  -- against every other licence act and every future bind on the same
  -- instance. Canonical order: instance -> decision head -> licence rows.
  perform 1 from public.workflow_instances
   where id = p_workflow_instance_id
   for update;

  -- The lineage is serialized here. `for update` on the existing chain, then the
  -- max generation read under that lock.
  perform 1 from public.atlas_autonomy_license_events
   where license_id = p_license_id
   for update;

  select coalesce(max(license_generation) + 1, 0) into v_generation
    from public.atlas_autonomy_license_events
   where license_id = p_license_id;

  -- ── Optimistic concurrency: the caller's OBSERVED generation ──────────────
  -- This is what actually serializes two humans acting on the same licence
  -- state, and the unique index alone does NOT do it.
  --
  -- Without this check the generation is derived purely from committed database
  -- truth, so a caller that read the chain BEFORE another act committed simply
  -- receives the NEXT generation and inserts a second, later act built from a
  -- view that no longer exists:
  --
  --     A reads generation 1   B reads generation 1
  --     A calls RPC → lock → derives 1 → inserts 1 → commits
  --     B waits on the lock, then derives 2 and inserts 2 — no conflict, because
  --     B never asked for 1. The unique index is never given the chance to fire.
  --
  -- Comparing the caller's observation against the locked truth BEFORE inserting
  -- turns that into a refusal, and nothing is written. Fail closed: the stale
  -- caller must re-read and re-decide, never have its stale decision absorbed.
  --
  -- 40001 (serialization_failure) is the canonical PostgreSQL concurrency
  -- conflict code. A stale human decision is a CONFLICT, never malformed data,
  -- so it must not be reported as a 22023 data error.
  if p_expected_generation <> v_generation then
    raise exception
      'stale licence generation: caller expected %, lineage is at %',
      p_expected_generation, v_generation
      using errcode = '40001';
  end if;

  -- An ISSUED act starts a lineage and nothing else may; every other act
  -- continues one and may not be the first.
  if (v_generation = 0) <> (p_act = 'LICENSE_ISSUED') then
    raise exception 'act % is inconsistent with lineage position %', p_act, v_generation
      using errcode = '22023';
  end if;

  -- ── A terminal lineage accepts no further act ───────────────────────────
  -- §18.57 (revoked) and §18.56 (superseded) end a lineage. Ruling 7: after a
  -- suspension, restoring autonomy requires a NEW reviewed licensing act, not
  -- an appended one, so there is deliberately no RESUMED act to append.
  if exists (
    select 1 from public.atlas_autonomy_license_events
     where license_id = p_license_id
       and act in ('LICENSE_REVOKED', 'LICENSE_SUPERSEDED')
  ) then
    raise exception 'licence lineage % is terminal and accepts no further act', p_license_id
      using errcode = '22023';
  end if;

  if v_generation = 0 then
    -- ── ISSUED: the subject must be the instance's OWN truth ─────────────
    -- ONE relational check. The caller names the instance and nothing else: the
    -- project, the definition key and the definition hash are read from that
    -- instance's row rather than believed. Without this the ledger could record
    -- a binding the database itself knows to be false — a licence claiming a
    -- project or a definition its own workflow instance does not have.
    if not exists (
      select 1 from public.workflow_instances wi
       where wi.id = p_workflow_instance_id
         and wi.project_id = p_project_id
         and wi.def_key = p_bound_def_key
         and wi.def_hash = p_bound_def_hash
    ) then
      raise exception
        'the licence subject does not match workflow instance %: project, def_key or def_hash disagrees',
        p_workflow_instance_id using errcode = '22023';
    end if;

    -- ── ISSUED: the pinned decision act says exactly what we claim ───────
    -- ONE exact-row condition on the immutable record the licence pins.
    -- Deliberately NOT a scan of the whole lineage: a material amendment to the
    -- same decision may legitimately carry different materiality, and refusing
    -- on that would reject a valid pin. Whether the decision is CURRENTLY
    -- GOVERNING is proven in TypeScript against Chapter 11's own fold, which
    -- this function does not re-implement.
    if not exists (
      select 1 from public.atlas_decision_ledger dl
       where dl.decision_id = p_decision_id
         and dl.record_id = p_decision_record_id
         and dl.version = p_decision_version
         and dl.project_id = p_project_id
         and dl.materiality @> '["autonomy"]'::jsonb
    ) then
      raise exception
        'the pinned decision act is not a same-project autonomy record as claimed'
        using errcode = '22023';
    end if;
  else
    -- ── After a suspension, ONLY revocation and supersession ─────────────
    -- There is no RESUMED act. A restriction must not become a hidden resume
    -- path, and a SECOND suspension is not a narrowing act either — stopping
    -- something already stopped is outside the approved lifecycle. Restoring
    -- autonomy requires a NEW reviewed licensing lineage, not another act on
    -- this one. Refused here, refused again by the pure fold, and re-derived as
    -- ineffective at read time: three independent mechanisms, because
    -- "suspended means stopped" is the whole point of a suspension.
    if exists (
      select 1 from public.atlas_autonomy_license_events
       where license_id = p_license_id and act = 'LICENSE_SUSPENDED'
    ) and p_act not in ('LICENSE_REVOKED', 'LICENSE_SUPERSEDED') then
      raise exception
        'after a suspension the only admissible acts are revocation and supersession (got %)', p_act
        using errcode = '22023';
    end if;

    -- ── Every continuing act inherits the issued subject, unchanged ───────
    select * into v_first from public.atlas_autonomy_license_events
     where license_id = p_license_id and license_generation = 0;

    if v_first.project_id <> p_project_id
       or v_first.workflow_instance_id <> p_workflow_instance_id
       or v_first.bound_def_key <> p_bound_def_key
       or v_first.bound_def_hash <> p_bound_def_hash
       or v_first.decision_id <> p_decision_id
       or v_first.decision_version <> p_decision_version
       or v_first.decision_record_id <> p_decision_record_id then
      raise exception 'a continuing act may not move the licence subject or its provenance'
        using errcode = '22023';
    end if;

    -- ── Narrowing, enforced as an aggregate rather than a second fold ────
    -- Ruling 7: RESTRICTED may only narrow level, action set and window. This
    -- compares against the aggregate of every prior act, which is exactly what
    -- the read-time fold computes — without re-implementing its control flow.
    v_level_index := substring(p_licensed_level from 2)::integer;

    select min(substring(licensed_level from 2)::integer) into v_prior_min_level
      from public.atlas_autonomy_license_events where license_id = p_license_id;
    if v_level_index > v_prior_min_level then
      raise exception 'a continuing act may not raise the licensed level' using errcode = '22023';
    end if;

    -- Subset of EVERY prior action set is subset of their intersection.
    if exists (
      select 1 from public.atlas_autonomy_license_events e
       where e.license_id = p_license_id
         and not (p_allowed_action_kinds <@ e.allowed_action_kinds)
    ) then
      raise exception 'a continuing act may not add an action kind' using errcode = '22023';
    end if;

    select max(effective_at), min(expires_at) into v_prior_start, v_prior_end
      from public.atlas_autonomy_license_events where license_id = p_license_id;
    if p_effective_at < v_prior_start then
      raise exception 'a continuing act may not move the window start earlier' using errcode = '22023';
    end if;
    if p_expires_at > v_prior_end then
      raise exception 'a continuing act may not extend the window end' using errcode = '22023';
    end if;

    if p_act = 'LICENSE_SUPERSEDED' then
      if p_superseded_by_license_id is null
         or p_superseded_by_license_id = p_license_id
         or not exists (
           select 1 from public.atlas_autonomy_license_events
            where license_id = p_superseded_by_license_id
              and workflow_instance_id = p_workflow_instance_id
         ) then
        raise exception 'a supersession must name a replacement licence for the SAME instance'
          using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.atlas_autonomy_license_events (
    license_id, license_generation, act,
    project_id, workflow_instance_id, bound_def_key, bound_def_hash,
    licensed_level, allowed_action_kinds, action_scope_fingerprint,
    decision_id, decision_version, decision_record_id,
    effective_at, expires_at, superseded_by_license_id, reason, actor
  ) values (
    p_license_id, v_generation, p_act,
    p_project_id, p_workflow_instance_id, p_bound_def_key, p_bound_def_hash,
    p_licensed_level, p_allowed_action_kinds, p_action_scope_fingerprint,
    p_decision_id, p_decision_version, p_decision_record_id,
    p_effective_at, p_expires_at, p_superseded_by_license_id, p_reason, p_actor
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) is
  'The ONLY write path for the autonomy licence ledger. Serializes the lineage by generation and '
  'refuses any act whose caller-observed p_expected_generation no longer matches the locked truth '
  '(SQLSTATE 40001, nothing written) — that optimistic-concurrency check, not the unique index, is '
  'what stops two humans acting on the same licence state from both committing. It also '
  'refuses an act after a terminal one, admits ONLY revocation or supersession after a '
  'suspension, refuses any continuing act that widens level, actions or window, and proves on issue '
  'that the licence subject is the workflow instance''s OWN project/def_key/def_hash and that the '
  'pinned decision record says exactly what the licence claims. Whether that decision is '
  'CURRENTLY governing is proven in TypeScript against Chapter 11''s own fold, which this function '
  'deliberately does not re-implement. The actor-shape CHECK is defence in depth, NOT proof of '
  'platform-operator authority: that authority is resolvePlatformOperator() in the application.';

revoke all on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) to service_role;
