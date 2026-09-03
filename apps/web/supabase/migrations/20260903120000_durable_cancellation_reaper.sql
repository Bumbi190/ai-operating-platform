-- ═══════════════════════════════════════════════════════════════════════════
--  G3C-3B · DURABLE CANCELLATION · REAPER · CLAIM DEFENSE · ATTEMPT ACCOUNTING
-- ═══════════════════════════════════════════════════════════════════════════
--
--  G3C-3A made cancellation load-bearing at every OWNED boundary: a live worker
--  re-establishes ownership, cancellation and stop authority before each unit of
--  execution-bearing work. It deliberately changed no SQL. This migration owns
--  the other half — what is true when the worker is GONE.
--
--  THE FIRST PRINCIPLE
--    Worker death must not erase cancellation intent, and a run carrying durable
--    `cancel_requested = true` must never be reaped into a state where another
--    worker can begin execution-bearing work as though cancellation did not
--    exist. Where the database can decide safely, it decides — rather than
--    handing the row back to a worker for a decision it already knows.
--
--  WHAT CHANGES, AND WHY EACH IS HERE
--
--  1. `request_run_cancel` becomes the ONE atomic cancellation boundary. It now
--     locks the RUN ROW FIRST and branches on the state that exists AT THE WRITE.
--     Previously the route branched on a status it had READ, then issued a
--     conditional UPDATE whose row count it never checked: `claim_runs` landing
--     in between made that UPDATE match zero rows while the operator was told
--     the run was cancelled. The cancellation was lost and the run ran to
--     completion. The lock removes the window rather than narrowing it.
--
--  2. `release_stopped_run` (new) makes the STOP release cancel-aware and
--     compensates the admission it releases. A blind `running → pending` would,
--     with (4) below, strand any run whose cancellation committed between the
--     STOP decision and the release: pending, unclaimable, and invisible to the
--     reaper — which matches `status = 'running'` only.
--
--  3. `reap_stuck_runs` learns three classes instead of two, and — critically —
--     refuses to claim certainty it does not have. See the note above branch (c).
--
--  4. `claim_runs` gains `cancel_requested = false` as defense in depth. It is
--     safe ONLY because (1), (2) and (3) together make an ownerless
--     `pending + cancel_requested = true` row unreachable. The assertion at the
--     end of this migration proves no such row exists at apply time.
--
--  5. `resolve_approval` (new) puts approval resolution behind the same RUN row
--     the cancel path locks, in the same order. The human PATCH previously wrote
--     the approval FIRST and only afterwards discovered whether it had won the
--     run transition — so a cancelled run could still end up with an `approved`
--     approval and a PUBLISHED article.
--
--  LOCK ORDER (unchanged where it existed; extended consistently)
--    claim_runs            runs → platform_config → projects   (G3C-2A, verbatim)
--    request_run_cancel    runs → approvals
--    resolve_approval      runs → approvals
--    release_stopped_run   runs
--    reap_stuck_runs       runs
--  The reaper admits nothing, so it reads no stop authority and takes no lock
--  beyond `runs`; that is what keeps it outside every possible cycle. The two
--  approval-touching functions share one order, so they serialise, never
--  deadlock.
--
--  ABI: `request_run_cancel`, `claim_runs` and `reap_stuck_runs` are REPLACED in
--  place — same name, same argument identity and defaults, same result type. No
--  DROP, no `_v2`, no return-type change. SECURITY DEFINER and `search_path = ''`
--  are re-declared on every one of them: CREATE OR REPLACE preserves owner and
--  ACL but NOT these attributes, and silently losing them would turn a governance
--  function into a SECURITY INVOKER with a default search path.
--
--  No explicit BEGIN/COMMIT. The migration runner owns the transaction.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  1 · request_run_cancel — the single atomic cancellation boundary
-- ───────────────────────────────────────────────────────────────────────────
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

comment on function public.request_run_cancel(uuid, uuid, text, text) is
  'G3C-3B: the single atomic cancellation boundary. Locks the run row FIRST, then '
  'branches on the state that exists at the write: pending and awaiting_approval '
  'terminalize as cancelled (closing any unresolved approval in the same '
  'transaction); running records durable intent only, leaving terminal resolution '
  'to the owning checkpoint or the reaper. Returns rows affected — 0 means the run '
  'was not cancellable, and callers must not report that as success.';


-- ───────────────────────────────────────────────────────────────────────────
--  2 · release_stopped_run — cancel-aware STOP release + attempt compensation
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.release_stopped_run(
  p_run_id   uuid,
  p_claim_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_status text;
begin
  -- One ownership-conditioned transition. `cancel_requested` is read INSIDE the
  -- write, on the tuple this statement locks — not before it — so a cancellation
  -- committing between the STOP decision and this call is still seen.
  --
  -- Without that, the pair (STOP release, cancel) would produce
  -- `pending + cancel_requested = true`: unclaimable once claim_runs filters
  -- cancellation, and invisible to a reaper that only matches 'running'. That row
  -- would have no owner and no terminalizer, forever.
  update public.runs r set
    status      = case when r.cancel_requested then 'cancelled' else 'pending' end,
    finished_at = case when r.cancel_requested then now()       else r.finished_at end,
    claimed_at  = null,
    lease_until = null,
    -- Terminal rows keep claim_id as provenance (who resolved it); a requeued row
    -- must lose it, or the next claim could not fence against the old owner.
    claim_id    = case when r.cancel_requested then r.claim_id  else null end,
    -- ATTEMPT COMPENSATION. claim_runs increments once per ADMISSION. A
    -- governance STOP is not an execution failure, and this release is
    -- conditioned on claim_id, so it compensates exactly the one admission this
    -- owner consumed — atomically, under the row lock, never read-modify-write.
    -- Not applied on the cancelled branch: that run terminates and will never be
    -- admitted again. `greatest(…, 0)` keeps it total against legacy rows.
    attempts    = case when r.cancel_requested then r.attempts
                       else greatest(r.attempts - 1, 0) end
  where r.id = p_run_id
    and r.status = 'running'
    and r.claim_id = p_claim_id
  returning r.status into v_status;

  if not found then
    -- Zero rows means the row is no longer ours: another owner claimed it, or it
    -- already left 'running'. That is FENCING. It is never a successful release,
    -- and it is never a database fault — a real fault raises, and the caller maps
    -- the exception to ERROR.
    return 'FENCED';
  end if;

  return case when v_status = 'cancelled' then 'CANCELLED' else 'RELEASED' end;
end
$fn$;

comment on function public.release_stopped_run(uuid, uuid) is
  'G3C-3B: returns an owned, governance-stopped run to the queue — unless a '
  'cancellation became durable first, in which case it terminalizes cancelled '
  'instead. Compensates exactly the one claim admission it releases. Returns '
  'RELEASED | CANCELLED | FENCED; a database fault raises so callers can report '
  'ERROR rather than misreporting it as lost ownership.';


-- ───────────────────────────────────────────────────────────────────────────
--  3 · resolve_approval — approval resolution behind the RUN row
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.resolve_approval(
  p_approval_id uuid,
  p_run_id      uuid,
  p_project_id  uuid,
  p_action      text,
  -- Optional, and last: review notes are semantically optional, and the
  -- checked-in type marks `p_notes?`. The default is what makes that true.
  p_notes       text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_appr_status text;
  v_now         timestamptz := now();
begin
  if p_action not in ('approved', 'rejected', 'revised') then
    raise exception 'resolve_approval: unsupported action %', p_action
      using errcode = 'invalid_parameter_value';
  end if;

  -- ── RUN FIRST. ALWAYS. ───────────────────────────────────────────────────
  -- Cancellation locks the run row too, in this same order, so the two
  -- operations serialise on one row instead of interleaving. `revised` takes the
  -- lock as well even though it leaves the run alone: without it, a cancel could
  -- win the run while a revision independently overwrote the `returned` approval
  -- the cancel had just written.
  perform 1 from public.runs r
   where r.id = p_run_id
     and r.project_id = p_project_id
     and r.status = 'awaiting_approval'
   for update;

  if not found then
    -- The run is no longer awaiting review — cancelled, or already resolved by
    -- someone else. This caller LOST. It must write nothing, and above all it
    -- must not go on to publish.
    return 'LOST';
  end if;

  -- ── THEN THE APPROVAL ────────────────────────────────────────────────────
  -- Lineage rule. The RUN is authoritative — it was already matched on
  -- id + project_id + awaiting_approval above, so tenancy is established there.
  -- The approval must belong to that run, and may carry either NULL (the
  -- historical shape: 12 of 13 production rows have project_id NULL, and the
  -- generic creation endpoint still inserts without it) or the SAME project.
  -- An explicitly DIFFERENT project is refused: legacy lineage support must not
  -- become cross-project permission.
  select a.status into v_appr_status
    from public.approvals a
   where a.id = p_approval_id
     and a.run_id = p_run_id
     and (a.project_id is null or a.project_id = p_project_id)
   for update;

  if not found then
    return 'NOT_FOUND';               -- wrong approval, wrong run, or wrong tenant
  end if;

  if v_appr_status not in ('pending', 'revised', 'needs_input') then
    -- Already decided. Not our decision to overwrite — the previous defect was
    -- an UPDATE with no status predicate at all, which happily turned a
    -- `returned` approval back into `approved`.
    return 'ALREADY_RESOLVED';
  end if;

  if p_action = 'revised' then
    -- The run deliberately STAYS awaiting_approval: a revision asks for another
    -- pass, it does not conclude the run.
    update public.approvals set
      status = 'revised', reviewer_notes = p_notes, reviewed_at = v_now
    where id = p_approval_id;
    return 'REVISED';
  end if;

  if p_action = 'approved' then
    update public.runs set status = 'done' where id = p_run_id;
    update public.approvals set
      status = 'approved', reviewer_notes = p_notes, reviewed_at = v_now
    where id = p_approval_id;
    return 'APPROVED';
  end if;

  update public.runs set
    status = 'rejected',
    error  = left('approval_rejected: ' || coalesce(p_notes, ''), 500)
  where id = p_run_id;
  update public.approvals set
    status = 'rejected', reviewer_notes = p_notes, reviewed_at = v_now
  where id = p_approval_id;
  return 'REJECTED';
end
$fn$;

comment on function public.resolve_approval(uuid, uuid, uuid, text, text) is
  'G3C-3B: resolves one approval atomically, locking the RUN row before the '
  'approval row — the same order request_run_cancel uses, so cancellation and '
  'resolution serialise instead of tearing. Returns APPROVED | REJECTED | REVISED '
  'on a win, LOST when the run is no longer awaiting review, NOT_FOUND on an '
  'identity mismatch, ALREADY_RESOLVED when the approval is already terminal. '
  'Only a winning result may trigger publish or feedback.';


-- ───────────────────────────────────────────────────────────────────────────
--  4 · reap_stuck_runs — three classes, and honesty about the third
-- ───────────────────────────────────────────────────────────────────────────
create or replace function omnira_cron.reap_stuck_runs()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare n_post int; n_cancel int; n_legacy int; n_rest int;
begin
  -- ── (a) POST-DISPATCH WORKFLOW ACTION — unchanged, and deliberately so ────
  -- Past DISPATCH_STARTED the side effect may already have happened. Expiry
  -- tells us the worker died, never what the remote did. UNKNOWN +
  -- reconciliation is the only honest record, and it is unchanged by
  -- cancellation: cancelling stops FUTURE work, it does not rewrite the past.
  -- Provenance goes in the reason. `action_outcome = 'CANCELLED'` after dispatch
  -- is refused by runs_action_outcome_guard, and that guard stays load-bearing —
  -- this branch is the first layer, not the only one.
  update public.runs set
    status                  = 'unknown',
    action_outcome          = 'UNKNOWN',
    reconciliation_required = true,
    reconciliation_reason   = case when cancel_requested
      then 'lease expired after dispatch; cancellation was requested but the side '
           'effect may or may not have been applied'
      else 'lease expired after dispatch; the side effect may or may not have been applied' end,
    outcome_recorded_at     = now(),
    finished_at             = now(),
    claimed_at              = null,
    lease_until             = null,
    claim_id                = null
  where status = 'running'
    and lease_until is not null and lease_until < now()
    and workflow_instance_id is not null
    and public.action_phase_rank(action_phase) >= 3;
  get diagnostics n_post = row_count;

  -- ── (b) PRE-DISPATCH WORKFLOW ACTION + CANCELLED ─────────────────────────
  -- Ordered BEFORE the generic requeue below: if the generic branch ran first it
  -- would put this row back to 'pending' and this branch would never see it.
  --
  -- Here — and ONLY here — pre-dispatch is PROVEN rather than assumed. The phase
  -- is a durable column, and runs_dispatch_timestamp_present guarantees anything
  -- past PRE_COMMIT_VERIFIED carries dispatch_started_at. Below rank 3 nothing
  -- irreversible left the machine, so `cancelled` is the truth, and CANCELLED is
  -- a legal outcome at this rank.
  update public.runs set
    status                  = 'cancelled',
    action_outcome          = 'CANCELLED',
    reconciliation_required = false,
    outcome_recorded_at     = now(),
    finished_at             = now(),
    claimed_at              = null,
    lease_until             = null,
    claim_id                = null
  where status = 'running'
    and lease_until is not null and lease_until < now()
    and cancel_requested = true
    and workflow_instance_id is not null
    and public.action_phase_rank(action_phase) < 3;
  get diagnostics n_cancel = row_count;

  -- ── (c) LEGACY / NON-ACTION + CANCELLED — ambiguous, and said so ─────────
  -- `workflow_instance_id IS NULL` means "not a bound workflow action". It is
  -- NOT evidence about dispatch, and must never be renamed pre-dispatch: the
  -- agent-step families commit a run_logs row before each provider call, but
  -- marketing_channel_drafter calls a provider with no durable marker at all, and
  -- spend_reservations carries no run_id to attribute a reservation to a run. So
  -- for this class there is no universal durable proof, and:
  --   • `cancelled` would claim certainty we do not have;
  --   • `failed`    would record a cancellation as an execution failure AND
  --                 retain the action identity;
  --   • `pending`   would strand the row the moment claim_runs filters
  --                 cancellation — no owner, no terminalizer, forever.
  -- UNKNOWN retains the identity and makes the ambiguity operator-visible
  -- through runs_reconciliation_required_idx. A brittle SQL registry of handler
  -- names would only move the lie; universal dispatch marking is deferred.
  update public.runs set
    status                  = 'unknown',
    reconciliation_required = true,
    reconciliation_reason   = 'lease expired on a cancelled non-action run; no durable '
                              'dispatch marker exists for this family, so whether an '
                              'external effect began cannot be determined',
    finished_at             = now(),
    claimed_at              = null,
    lease_until             = null,
    claim_id                = null
  where status = 'running'
    and lease_until is not null and lease_until < now()
    and cancel_requested = true
    and workflow_instance_id is null;
  get diagnostics n_legacy = row_count;

  -- ── (d) EVERYTHING ELSE — retry semantics preserved verbatim ─────────────
  -- Not a cancellation question. G3C-3B is durable cancellation, honest
  -- ambiguity and stop accounting; it is not a reaper redesign, so an
  -- uncancelled expired run keeps exactly the behaviour it has today.
  update public.runs set
    status      = case when attempts >= max_attempts then 'failed' else 'pending' end,
    error       = case when attempts >= max_attempts then coalesce(last_error, 'Lease expired (stuck run)') else error end,
    finished_at = case when attempts >= max_attempts then now() else finished_at end,
    claimed_at  = null, lease_until = null, claim_id = null
  where status = 'running'
    and lease_until is not null and lease_until < now()
    and cancel_requested = false
    and (workflow_instance_id is null or public.action_phase_rank(action_phase) < 3);
  get diagnostics n_rest = row_count;

  return n_post + n_cancel + n_legacy + n_rest;
end
$fn$;

comment on function omnira_cron.reap_stuck_runs() is
  'G3C-3B: reaps expired leases in four ordered classes — post-dispatch actions to '
  'UNKNOWN + reconciliation (cancellation never rewrites the past); cancelled '
  'pre-dispatch actions, where the phase proves nothing dispatched, to cancelled; '
  'cancelled non-action runs to UNKNOWN + reconciliation because no universal '
  'durable dispatch marker exists for that class; and uncancelled runs to the '
  'unchanged retry/failed behaviour.';


-- ───────────────────────────────────────────────────────────────────────────
--  5 · claim_runs — cancellation defense in depth
-- ───────────────────────────────────────────────────────────────────────────
--  G3C-2A's body verbatim except for ONE added predicate. Every admission
--  property it established is preserved: FOR UPDATE SKIP LOCKED on the work rows
--  first, platform authority FOR SHARE, project authority FOR SHARE in
--  deterministic id order, fail-closed on missing authority, a fresh claim_id,
--  the lease, and the attempt increment.
-- ───────────────────────────────────────────────────────────────────────────
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
    where r.status = 'pending'
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
  where r.id = any(v_ids)
    and r.project_id = any(v_allowed)     -- a paused project's run stays pending
  returning r.*;
end
$fn$;


-- ───────────────────────────────────────────────────────────────────────────
--  6 · PRIVILEGE LOCKDOWN FOR THE NEW public FUNCTIONS
-- ───────────────────────────────────────────────────────────────────────────
--  SECURITY BLOCKING, and easy to miss: `CREATE FUNCTION` grants EXECUTE to
--  PUBLIC by default, and this project's `public` schema grants USAGE to `anon`
--  and `authenticated`. A new SECURITY DEFINER function in `public` is therefore
--  callable by unauthenticated clients unless it is explicitly revoked — these
--  two terminalize runs and resolve approvals as the definer, so that would be a
--  direct privilege-escalation path.
--
--  The two functions REPLACED by this migration already carry an explicit
--  {postgres, service_role} ACL, and CREATE OR REPLACE preserves it, so they
--  need nothing here. Only newly-created functions get the permissive default.
--
--  `omnira_cron.reap_stuck_runs` is deliberately untouched: its ACL is the
--  permissive default, but its SCHEMA grants USAGE to no client role, which is
--  what actually makes it unreachable. Rewriting its ACL would change a posture
--  this slice has no mandate over.
revoke all on function public.release_stopped_run(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_stopped_run(uuid, uuid)
  to service_role;

revoke all on function public.resolve_approval(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_approval(uuid, uuid, uuid, text, text)
  to service_role;


-- ───────────────────────────────────────────────────────────────────────────
--  7 · Apply-time assertion — NOT a backfill
-- ───────────────────────────────────────────────────────────────────────────
--  The claim filter above is only safe if no ownerless cancelled-pending row
--  already exists. Production discovery found ZERO. Rather than "repairing"
--  history — which would rewrite rows nobody has reasoned about — this FAILS the
--  migration if the assumption is wrong, so the state is examined by a human
--  instead of being silently normalised.
do $assert$
declare n int;
begin
  select count(*) into n
    from public.runs
   where status = 'pending' and cancel_requested = true;
  if n > 0 then
    raise exception
      'G3C-3B: % pending run(s) already carry cancel_requested=true. Adding the '
      'claim filter would strand them. Resolve them explicitly before applying.', n
      using errcode = 'restrict_violation';
  end if;
end
$assert$;
