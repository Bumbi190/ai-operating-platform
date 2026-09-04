/**
 * G3C-3B — durable cancellation, reaping and attempt accounting, proven against
 * REAL PostgreSQL with REAL concurrent sessions.
 *
 * ── WHY SEPARATE PROCESSES ─────────────────────────────────────────────────
 * Row locks live until COMMIT. One transaction, a CTE, or two sequential calls
 * cannot demonstrate a lock conflict — the lock is re-entrant and the second
 * caller sees the first's uncommitted work for free. Every race below runs in
 * its own psql process, and blocking is MEASURED, never assumed.
 *
 * ── WHY THE PREDECESSORS ARE MATERIALISED ──────────────────────────────────
 * Each race is proved twice: once against the bodies production runs TODAY —
 * copied from deployed pg_proc source — to show the forbidden interleaving
 * really happens, and once against the migration to show it cannot. A green
 * upgrade proof against a simplified stand-in is worth nothing.
 *
 * ── THE ONE STATE THAT MUST NEVER EXIST ────────────────────────────────────
 * `pending + cancel_requested = true`. Once claim_runs filters cancellation such
 * a row has no owner (unclaimable), no terminalizer (the reaper matches
 * `status = 'running'` only), and no way out. Every race asserts its absence.
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function findPsql(): string | null {
  const candidates = [
    process.env.ATLAS_SQL_TEST_PSQL, 'psql',
    '/opt/homebrew/opt/libpq/bin/psql', '/usr/local/opt/libpq/bin/psql', '/usr/bin/psql',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return c } catch { /* next */ }
  }
  return null
}

const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL
  ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const dsnFor = (db: string) => { const u = new URL(ADMIN_URL); u.pathname = `/${db}`; return u.toString() }

function run(dsn: string, args: string[]): string {
  try {
    return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 })
  } catch (e) {
    throw new Error(`psql failed: ${String((e as { stderr?: Buffer }).stderr ?? '').trim()}`)
  }
}
function query(dsn: string, sql: string): string[][] {
  let out: string
  try {
    out = execFileSync(PSQL!,
      ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  } catch (e) {
    throw new Error(`psql failed: ${String((e as { stderr?: Buffer }).stderr ?? '').trim()}`)
  }
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}
const one = (dsn: string, sql: string) => { const r = query(dsn, sql); return r.length ? r[0].join('|') : '' }

/** Runs SQL in its OWN process; resolves with output, error text and elapsed ms. */
function session(dsn: string, sql: string): Promise<{ out: string; err: string; ms: number }> {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const p = spawn(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('close', () => resolve({ out, err, ms: Date.now() - t0 }))
    p.on('error', reject)
  })
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Blocks until `pid` is actually waiting on a lock — the deterministic barrier.
 * A sleep would only assert that time passed; this asserts the contended state
 * the race is about really exists.
 */
async function awaitLockWait(dsn: string, deadlineMs = 15_000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < deadlineMs) {
    const n = one(dsn, `select count(*) from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`)
    if (Number(n) > 0) return true
    await wait(50)
  }
  return false
}

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn(
    '[durable-cancellation-sql] SKIPPED — no reachable local Postgres. The durable ' +
    'cancellation races (cancel vs claim, cancel vs reaper, stop-release vs cancel, ' +
    'cancel vs approval) were NOT proven in this run. Set ATLAS_SQL_TEST_URL to enable.',
  )
}

const DB_NAME = `omnira_g3c3b_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const PROJ = '11111111-1111-1111-1111-111111111111'
const INST = '33333333-3333-3333-3333-333333333333'
const ACTOR = 'user:00000000-0000-0000-0000-0000000000aa'
const MIGRATION = '20260903120000_durable_cancellation_reaper.sql'

/**
 * Mirrors production for every column, CHECK and TRIGGER these functions touch.
 * The guards are REAL, not stubs: `runs_action_outcome_guard` is the independent
 * layer that refuses CANCELLED after dispatch, and a race suite that disabled it
 * would prove the migration alone and call it defense in depth.
 */
const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $do$;
create schema if not exists omnira_cron;

create table public.projects (
  id uuid primary key, slug text unique not null, name text,
  execution_paused boolean not null default false);

create table public.platform_config (
  id int primary key default 1, automation_paused boolean not null default false);

create table public.workflow_instances (
  id uuid primary key, project_id uuid not null references public.projects(id),
  def_hash text not null, current_state text not null, status text not null default 'active');

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  status text not null default 'pending',
  kind text,
  created_at timestamptz not null default now(),
  started_at timestamptz, claimed_at timestamptz, lease_until timestamptz,
  finished_at timestamptz, outcome_recorded_at timestamptz, dispatch_started_at timestamptz,
  attempts int not null default 0, max_attempts int not null default 3,
  claim_id uuid,
  cancel_requested boolean not null default false,
  cancel_reason text, cancelled_by text,
  error text, last_error text,
  workflow_instance_id uuid references public.workflow_instances(id),
  workflow_def_hash text, workflow_from_state text,
  action_kind text, action_class text, action_phase text, action_outcome text,
  target_version_hash text, authorization_id uuid, idempotency_key text,
  attempt_group uuid, authorized_at timestamptz,
  reconciliation_required boolean not null default false,
  reconciliation_reason text,
  constraint runs_status_check check (status = any (array['pending','running','done','failed',
    'awaiting_approval','cancelled','rejected','unknown','partial'])),
  constraint runs_action_phase_vocabulary check (action_phase is null or action_phase = any (
    array['PREPARED','PRE_COMMIT_VERIFIED','DISPATCH_STARTED','REMOTE_CONFIRMED','EVIDENCE_RECORDED','COMPLETE'])),
  constraint runs_action_outcome_vocabulary check (action_outcome is null or action_outcome = any (
    array['FAILED','SUCCEEDED','UNKNOWN','PARTIAL','SUCCEEDED_EVIDENCE_PENDING','CANCELLED','REJECTED'])),
  constraint runs_ambiguous_requires_reconciliation check (action_outcome is null
    or action_outcome <> all (array['UNKNOWN','PARTIAL']) or reconciliation_required = true),
  constraint runs_material_actions_single_attempt check (action_class is null
    or action_class = any (array['READ_ONLY','REVERSIBLE_WRITE']) or max_attempts = 1));

create unique index runs_action_identity_uniq on public.runs (idempotency_key)
  where idempotency_key is not null and status <> all (array['cancelled','rejected']);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.runs(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text, output_key text, content text,
  status text not null default 'pending',
  reviewer_notes text, reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint approvals_status_check check (status = any (array['pending','approved','rejected',
    'revised','returned','needs_input'])));

create table public.run_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.runs(id) on delete cascade,
  step_order int, step_name text, role text, content text,
  created_at timestamptz not null default now());

create table public.workflow_action_reconciliations (
  id uuid primary key default gen_random_uuid(), run_id uuid, result text);

create or replace function public.action_phase_rank(p text) returns integer
language sql immutable set search_path = '' as $r$
  select case p
    when 'PREPARED' then 1 when 'PRE_COMMIT_VERIFIED' then 2
    when 'DISPATCH_STARTED' then 3 when 'REMOTE_CONFIRMED' then 4
    when 'EVIDENCE_RECORDED' then 5 when 'COMPLETE' then 6
    else 0 end;
$r$;

-- The REAL guard, copied from deployed source. Load-bearing for R3/M4.
create or replace function public.runs_action_outcome_guard() returns trigger
language plpgsql security definer set search_path = '' as $g$
declare confirmed int;
begin
  if new.workflow_instance_id is null and old.workflow_instance_id is null then
    return new;
  end if;
  if public.action_phase_rank(new.action_phase) < public.action_phase_rank(old.action_phase) then
    raise exception 'runs: action phase cannot move backwards (% -> %)',
      old.action_phase, new.action_phase using errcode = 'restrict_violation';
  end if;
  if old.action_outcome is not null and new.action_outcome is distinct from old.action_outcome then
    if old.action_outcome = 'UNKNOWN' and new.action_outcome in ('SUCCEEDED','FAILED','PARTIAL') then
      select count(*) into confirmed from public.workflow_action_reconciliations x
       where x.run_id = new.id and x.result <> 'STILL_UNKNOWN';
      if confirmed = 0 then
        raise exception 'runs: UNKNOWN may only be resolved by a recorded reconciliation (run %)', new.id
          using errcode = 'restrict_violation';
      end if;
    elsif old.action_outcome = 'SUCCEEDED_EVIDENCE_PENDING' and new.action_outcome = 'SUCCEEDED' then
      null;
    else
      raise exception 'runs: illegal action outcome transition % -> % (run %)',
        old.action_outcome, new.action_outcome, new.id using errcode = 'restrict_violation';
    end if;
  end if;
  if new.action_outcome = 'CANCELLED'
     and public.action_phase_rank(coalesce(new.action_phase, old.action_phase)) >= 3 then
    raise exception
      'runs: CANCELLED is not a legal outcome after DISPATCH_STARTED - the side effect may have happened (run %)',
      new.id using errcode = 'restrict_violation';
  end if;
  return new;
end $g$;
create trigger runs_action_outcome_guard before update on public.runs
  for each row execute function public.runs_action_outcome_guard();

insert into public.platform_config (id) values (1);
insert into public.projects (id, slug, name) values ('${PROJ}', 'alpha', 'Alpha');
insert into public.workflow_instances (id, project_id, def_hash, current_state)
  values ('${INST}', '${PROJ}', 'h', 's');
`

/** The bodies production runs TODAY. The forbidden interleavings must reproduce. */
const PREDECESSOR = `
create or replace function public.request_run_cancel(
  p_run_id uuid, p_project_id uuid,
  p_actor text default null, p_reason text default null)
returns integer language plpgsql security definer set search_path = '' as $p$
declare n int;
begin
  update public.runs set
    cancel_requested = true,
    cancel_reason    = coalesce(p_reason, cancel_reason),
    cancelled_by     = coalesce(p_actor,  cancelled_by)
  where id = p_run_id and project_id = p_project_id and status in ('pending','running');
  get diagnostics n = row_count;
  return n;
end $p$;

-- Production carries an EXPLICIT {postgres, service_role} ACL on both sensitive
-- RPCs. Reproduced here so the preservation test is meaningful: CREATE OR
-- REPLACE keeps an existing ACL, and this is what proves the migration did not
-- reset it to the permissive default.
revoke all on function public.request_run_cancel(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.request_run_cancel(uuid, uuid, text, text) to service_role;

create or replace function public.claim_runs(p_limit integer, p_lease_seconds integer default 320)
returns setof public.runs language plpgsql security definer set search_path = '' as $p$
declare v_ids uuid[]; v_projects uuid[]; v_allowed uuid[] := '{}'; v_pid uuid;
        v_gpaused boolean; v_ppaused boolean;
begin
  select array_agg(c.id order by c.created_at), array_agg(distinct c.project_id)
    into v_ids, v_projects
  from (select r.id, r.created_at, r.project_id from public.runs r
        where r.status = 'pending' and r.attempts < r.max_attempts
          and not exists (select 1 from public.projects p
                          where p.id = r.project_id and p.execution_paused = true)
        order by r.created_at for update skip locked limit p_limit) c;
  if v_ids is null or cardinality(v_ids) = 0 then return; end if;
  select pc.automation_paused into v_gpaused from public.platform_config pc where pc.id = 1 for share;
  if not found then raise exception 'claim_runs: platform stop authority unavailable' using errcode='P0002'; end if;
  if v_gpaused then return; end if;
  foreach v_pid in array (select array_agg(u order by u) from unnest(v_projects) u) loop
    select p.execution_paused into v_ppaused from public.projects p where p.id = v_pid for share;
    if not found then raise exception 'claim_runs: project stop authority unavailable for %', v_pid using errcode='P0002'; end if;
    if not v_ppaused then v_allowed := array_append(v_allowed, v_pid); end if;
  end loop;
  if cardinality(v_allowed) = 0 then return; end if;
  return query
  update public.runs r set status='running', claimed_at=now(), started_at=coalesce(r.started_at, now()),
    lease_until=now() + make_interval(secs => p_lease_seconds), attempts=r.attempts+1,
    claim_id=gen_random_uuid()
  where r.id = any(v_ids) and r.project_id = any(v_allowed) returning r.*;
end $p$;

revoke all on function public.claim_runs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_runs(integer, integer) to service_role;

create or replace function omnira_cron.reap_stuck_runs() returns integer
language plpgsql security definer set search_path = '' as $p$
declare n int; m int;
begin
  update public.runs set status='unknown', action_outcome='UNKNOWN', reconciliation_required=true,
    reconciliation_reason='lease expired after dispatch; the side effect may or may not have been applied',
    outcome_recorded_at=now(), finished_at=now(), claimed_at=null, lease_until=null, claim_id=null
  where status='running' and lease_until is not null and lease_until < now()
    and workflow_instance_id is not null and public.action_phase_rank(action_phase) >= 3;
  get diagnostics m = row_count;
  update public.runs set
    status = case when attempts >= max_attempts then 'failed' else 'pending' end,
    error = case when attempts >= max_attempts then coalesce(last_error,'Lease expired (stuck run)') else error end,
    finished_at = case when attempts >= max_attempts then now() else finished_at end,
    claimed_at=null, lease_until=null, claim_id=null
  where status='running' and lease_until is not null and lease_until < now()
    and (workflow_instance_id is null or public.action_phase_rank(action_phase) < 3);
  get diagnostics n = row_count;
  return n + m;
end $p$;
`

// ── run builders ───────────────────────────────────────────────────────────
const RUN = '55555555-5555-5555-5555-555555555551'
const APPR = '66666666-6666-6666-6666-666666666661'

/** A plain legacy run (no workflow_instance_id). */
function seedRun(over: Record<string, string> = {}) {
  const cols: Record<string, string> = {
    id: `'${RUN}'`, project_id: `'${PROJ}'`, status: `'pending'`, ...over,
  }
  run(dsn, ['-c', `delete from public.approvals; delete from public.run_logs; delete from public.runs;`])
  run(dsn, ['-c',
    `insert into public.runs (${Object.keys(cols).join(',')}) values (${Object.values(cols).join(',')})`])
}
/** A bound workflow-action run at a given phase. */
function seedAction(phase: string, over: Record<string, string> = {}) {
  seedRun({
    status: `'running'`, workflow_instance_id: `'${INST}'`, action_phase: `'${phase}'`,
    action_class: `'READ_ONLY'`, claim_id: `'${CLAIM}'`,
    dispatch_started_at: phase === 'DISPATCH_STARTED' ? 'now()' : 'null',
    lease_until: `now() - interval '1 minute'`, attempts: '1',
    ...over,
  })
}
const CLAIM = '77777777-7777-7777-7777-777777777771'

const runRow = (col: string) => one(dsn, `select coalesce(${col}::text,'∅') from public.runs where id='${RUN}'`)

/** The state that must never exist, checked after every race. */
function assertNoForbiddenStates() {
  expect(one(dsn, `select count(*) from public.runs
    where status='pending' and cancel_requested=true`), 'ownerless cancelled-pending row').toBe('0')
  expect(one(dsn, `select count(*) from public.runs
    where status in ('unknown','partial') and reconciliation_required = false`),
    'ambiguous terminal without reconciliation').toBe('0')
  expect(one(dsn, `select count(*) from public.runs r
    where r.status='cancelled' and exists (select 1 from public.approvals a
      where a.run_id=r.id and a.status in ('pending','revised','needs_input'))`),
    'cancelled run with an unresolved approval').toBe('0')
  expect(one(dsn, `select count(*) from public.runs r
    where r.status='cancelled' and exists (select 1 from public.approvals a
      where a.run_id=r.id and a.status='approved')`),
    'cancelled run with an approved approval — split brain').toBe('0')
}

const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

beforeAll(() => {
  if (!AVAILABLE && !SQL_REQUIRED) return
  run(ADMIN_URL, ['-c', `drop database if exists ${DB_NAME}`])
  run(ADMIN_URL, ['-c', `create database ${DB_NAME}`])
  dsn = dsnFor(DB_NAME)
  run(dsn, ['-c', FIXTURE])
  run(dsn, ['-c', PREDECESSOR])
}, 180_000)

afterAll(() => {
  if (!dsn) return
  try { run(ADMIN_URL, ['-c', `drop database if exists ${DB_NAME}`]) } catch { /* best effort */ }
})

/** Clears rows FIRST: the migration's own assertion refuses to apply over a
 *  leftover cancelled-pending row, which is exactly what it is for. */
const wipe = () => run(dsn, ['-c',
  'delete from public.approvals; delete from public.run_logs; delete from public.runs;'])
const applyMigration = () => run(dsn, ['-f', join(process.cwd(), 'supabase/migrations', MIGRATION)])
const freshMigration = () => { wipe(); applyMigration() }
const restorePredecessor = () => run(dsn, ['-c', PREDECESSOR])

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · the predecessor really is broken', () => {
  beforeEach(() => { wipe(); restorePredecessor() })

  it('F-2 — a claim landing mid-cancel LOSES the cancellation entirely', async () => {
    // The exact production shape: the route read `pending`, then issued
    // `update … where status='pending'`. This models that route faithfully.
    seedRun()
    const a = session(dsn, `begin; select count(*) from public.claim_runs(10, 320);
                            select pg_sleep(1.2); commit;`)
    await wait(250)
    // The route's conditional UPDATE — with SKIP LOCKED absent it simply waits.
    const b = await session(dsn,
      `with u as (update public.runs set status='cancelled', finished_at=now()
        where id='${RUN}' and status='pending' returning 1) select count(*) from u`)
    await a
    // Zero rows updated, and the old route returned {ok:true,status:'cancelled'}
    // regardless. The run is running; the operator was told it was cancelled.
    expect(b.out.trim(), 'the conditional UPDATE matched nothing').toBe('0')
    expect(runRow('status'), 'the run survived the cancellation').toBe('running')
    expect(runRow('cancel_requested'), 'and no intent was recorded either').toBe('false')
  }, 60_000)

  it('F-1 — a stop release strands a max_attempts=1 run permanently', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1', max_attempts: '1' })
    // The G3C-3A release, verbatim: pending, claim cleared, attempts untouched.
    run(dsn, ['-c', `update public.runs set status='pending', claimed_at=null,
      lease_until=null, claim_id=null where id='${RUN}' and status='running'`])
    expect(runRow('attempts')).toBe('1')
    // claim_runs requires attempts < max_attempts. 1 < 1 is false.
    expect(one(dsn, `select count(*) from public.claim_runs(10, 320)`),
      'one stop crossing and the run can never be claimed again').toBe('0')
  })

  it('R2 — a cancelled pre-dispatch action is REQUEUED, not terminalized', () => {
    seedAction('PREPARED', { cancel_requested: 'true' })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status'), 'back in the queue carrying live cancellation intent').toBe('pending')
    expect(runRow('cancel_requested')).toBe('true')
  })

  it('F-3 — a cancelled attempt-exhausted run is recorded as FAILED', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, cancel_requested: 'true',
              attempts: '3', max_attempts: '3', lease_until: `now() - interval '1 minute'` })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status'), 'a cancellation recorded as an execution failure').toBe('failed')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · R6 — cancel vs claim_runs on a PENDING run', () => {
  beforeEach(() => { freshMigration() })

  it('R6A — cancel takes the row first: claim_runs never admits it', async () => {
    seedRun()
    const a = session(dsn, `begin; select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator'); select pg_sleep(1.2); commit;`)
    await wait(250)
    // claim_runs' phase-1 SELECT is FOR UPDATE SKIP LOCKED, so it does not queue
    // behind the cancel — it declines the row. Either way it must not admit it.
    const b = await session(dsn, `select count(*) from public.claim_runs(10, 320)`)
    await a
    expect(b.out.trim(), 'the locked row is not admitted').toBe('0')
    expect(runRow('status')).toBe('cancelled')
    expect(one(dsn, `select count(*) from public.claim_runs(10, 320)`),
      'and it stays unclaimable afterwards').toBe('0')
    assertNoForbiddenStates()
  }, 60_000)

  it('R6B — claim takes the row first: the cancel BLOCKS, then records intent', async () => {
    seedRun()
    const a = session(dsn, `begin; select count(*) from public.claim_runs(10, 320);
                            select pg_sleep(1.5); commit;`)
    await wait(250)
    const bp = session(dsn, `select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator')`)
    // MEASURED, not assumed: the cancel is genuinely waiting on the row lock.
    expect(await awaitLockWait(dsn), 'the cancel must queue on the run row').toBe(true)
    const b = await bp
    await a
    expect(b.ms, 'it waited for the claim to commit').toBeGreaterThan(800)
    // EvalPlanQual re-reads the row as 'running' → intent, not terminalization.
    expect(b.out.trim(), 'the cancellation is NOT lost').toBe('1')
    expect(runRow('status')).toBe('running')
    expect(runRow('cancel_requested'), 'durable intent survives the claim').toBe('true')
    assertNoForbiddenStates()
  }, 60_000)

  it('R6C — a cancelled pending row is refused by the claim filter', () => {
    seedRun({ cancel_requested: 'true', status: `'pending'` })
    expect(one(dsn, `select count(*) from public.claim_runs(10, 320)`)).toBe('0')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · R9 — STOP release vs a concurrent cancel', () => {
  beforeEach(() => { freshMigration() })

  it('R9a — cancel commits first: the release TERMINALIZES, never requeues', async () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1', max_attempts: '1' })
    const a = session(dsn, `begin; select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator'); select pg_sleep(1.2); commit;`)
    await wait(250)
    const bp = session(dsn, `select public.release_stopped_run('${RUN}','${CLAIM}')`)
    expect(await awaitLockWait(dsn), 'the release must queue behind the cancel').toBe(true)
    const b = await bp
    await a
    expect(b.out.trim()).toBe('CANCELLED')
    expect(runRow('status')).toBe('cancelled')
    assertNoForbiddenStates()
  }, 60_000)

  it('R9b — release commits first: the cancel then terminalizes the PENDING row', async () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1', max_attempts: '1' })
    const a = session(dsn, `begin; select public.release_stopped_run('${RUN}','${CLAIM}');
                            select pg_sleep(1.2); commit;`)
    await wait(250)
    const bp = session(dsn, `select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator')`)
    expect(await awaitLockWait(dsn), 'the cancel must queue behind the release').toBe(true)
    const b = await bp
    await a
    expect(b.out.trim(), 'the cancel found a pending row and won it').toBe('1')
    expect(runRow('status'), 'both orderings converge on cancelled').toBe('cancelled')
    assertNoForbiddenStates()
  }, 60_000)

  it('R9c — an uncontended release requeues AND compensates the admission', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1', max_attempts: '1' })
    expect(one(dsn, `select public.release_stopped_run('${RUN}','${CLAIM}')`)).toBe('RELEASED')
    expect(runRow('status')).toBe('pending')
    expect(runRow('attempts'), 'the released admission is given back').toBe('0')
    expect(runRow('claim_id'), 'a requeued row must lose its claim').toBe('∅')
    assertNoForbiddenStates()
  })

  it('R9d — a release under a rotated claim is FENCED and writes nothing', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '2' })
    expect(one(dsn, `select public.release_stopped_run('${RUN}',
      '99999999-9999-9999-9999-999999999999')`)).toBe('FENCED')
    expect(runRow('status')).toBe('running')
    expect(runRow('attempts'), 'and no attempt was compensated').toBe('2')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · R7 — repeated STOP crossings never exhaust the retry budget', () => {
  beforeEach(() => { freshMigration() })

  it('a max_attempts=1 material run survives five stop/resume crossings', () => {
    // The CHECK constraint forces max_attempts=1 on every class except
    // READ_ONLY/REVERSIBLE_WRITE, so without compensation the FIRST stop would
    // strand it forever. Five crossings, no execution, still claimable.
    seedRun({ status: `'pending'`, max_attempts: '1', attempts: '0',
              action_class: `'MATERIAL_WRITE'` })
    for (let i = 0; i < 5; i++) {
      const claimed = query(dsn, `select id, claim_id from public.claim_runs(10, 320)`)
      expect(claimed.length, `crossing ${i + 1}: the run must still be claimable`).toBe(1)
      const claimId = claimed[0][1]
      expect(one(dsn, `select public.release_stopped_run('${RUN}','${claimId}')`)).toBe('RELEASED')
      expect(runRow('attempts'), `crossing ${i + 1}: budget net unchanged`).toBe('0')
    }
    expect(one(dsn, `select count(*) from public.claim_runs(10, 320)`),
      'still admissible after five stops').toBe('1')
    assertNoForbiddenStates()
  }, 60_000)
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · R2/R3 — the reaper classifies by PROOF, not by convenience', () => {
  beforeEach(() => { freshMigration() })

  it('R2 — cancelled + provably pre-dispatch action → cancelled', () => {
    seedAction('PREPARED', { cancel_requested: 'true' })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status')).toBe('cancelled')
    expect(runRow('action_outcome'), 'CANCELLED is legal below dispatch').toBe('CANCELLED')
    expect(runRow('reconciliation_required'), 'nothing to reconcile — nothing dispatched').toBe('false')
    assertNoForbiddenStates()
  })

  it('R3 — cancelled + POST-dispatch action → UNKNOWN, never cancelled', () => {
    seedAction('DISPATCH_STARTED', { cancel_requested: 'true' })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status'), 'cancellation does not rewrite the past').toBe('unknown')
    expect(runRow('action_outcome')).toBe('UNKNOWN')
    expect(runRow('reconciliation_required')).toBe('true')
    expect(runRow('reconciliation_reason'), 'the cancellation is recorded as provenance')
      .toContain('cancellation was requested')
    assertNoForbiddenStates()
  })

  it('R3b — the DB guard independently refuses CANCELLED after dispatch', () => {
    // Defense in depth, proven separately: even if the reaper were wrong, the
    // trigger refuses. A suite that disabled the guards would not know this.
    seedAction('DISPATCH_STARTED')
    const e = session(dsn, `update public.runs set action_outcome='CANCELLED' where id='${RUN}'`)
    return e.then(r => {
      expect(r.err, 'the guard is the independent second layer')
        .toMatch(/CANCELLED is not a legal outcome after DISPATCH_STARTED/)
    })
  })

  it('LEGACY AMBIGUITY — a cancelled non-action run → UNKNOWN, not cancelled', () => {
    // `workflow_instance_id IS NULL` is NOT evidence of pre-dispatch. The
    // agent-step families commit a run_logs row before each provider call, but
    // marketing_channel_drafter calls one with no durable marker, and
    // spend_reservations has no run_id to attribute a reservation. So this class
    // is genuinely ambiguous and must say so.
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, cancel_requested: 'true',
              attempts: '1', lease_until: `now() - interval '1 minute'` })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status'), 'no certainty is claimed').toBe('unknown')
    expect(runRow('reconciliation_required')).toBe('true')
    expect(runRow('reconciliation_reason')).toContain('no durable')
    assertNoForbiddenStates()
  })

  it('an UNCANCELLED expired run keeps its existing retry behaviour', () => {
    // G3C-3B is durable cancellation, not a reaper redesign.
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1', max_attempts: '3',
              lease_until: `now() - interval '1 minute'` })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status')).toBe('pending')
    expect(runRow('attempts'), 'and the reaper compensates nothing').toBe('1')
  })

  it('an UNCANCELLED attempt-exhausted run still lands on failed', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '3', max_attempts: '3',
              lease_until: `now() - interval '1 minute'` })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status')).toBe('failed')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · R4/R5/R8 — reaper exclusivity', () => {
  beforeEach(() => { freshMigration() })

  it('R4 — the old owner is fenced once the reaper has acted', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1',
              lease_until: `now() - interval '1 minute'` })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    expect(runRow('status')).toBe('pending')
    // The dead worker wakes and tries its ownership-conditioned terminal write.
    const late = one(dsn, `with u as (update public.runs set status='done'
      where id='${RUN}' and status='running' and claim_id='${CLAIM}' returning 1)
      select count(*) from u`)
    expect(late, 'exactly one lifecycle winner').toBe('0')
    expect(runRow('status')).toBe('pending')
  })

  it('R4b — a LIVE lease is never reaped', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1',
              lease_until: `now() + interval '5 minutes'` })
    expect(one(dsn, `select omnira_cron.reap_stuck_runs()`)).toBe('0')
    expect(runRow('status')).toBe('running')
  })

  it('R5 — a reaped run is re-claimable exactly once, with a NEW claim', () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1', max_attempts: '3',
              lease_until: `now() - interval '1 minute'` })
    run(dsn, ['-c', `select omnira_cron.reap_stuck_runs()`])
    const rows = query(dsn, `select id, claim_id from public.claim_runs(10, 320)`)
    expect(rows.length).toBe(1)
    expect(rows[0][1], 'fencing requires a fresh claim').not.toBe(CLAIM)
    expect(one(dsn, `select count(*) from public.claim_runs(10, 320)`),
      'and no second owner').toBe('0')
  })

  it('R8 — two concurrent reapers produce exactly one transition', async () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1', max_attempts: '3',
              lease_until: `now() - interval '1 minute'` })
    const [x, y] = await Promise.all([
      session(dsn, `select omnira_cron.reap_stuck_runs()`),
      session(dsn, `select omnira_cron.reap_stuck_runs()`),
    ])
    const total = Number(x.out.trim() || 0) + Number(y.out.trim() || 0)
    expect(x.err, 'no deadlock').toBe('')
    expect(y.err, 'no deadlock').toBe('')
    expect(total, 'exactly one reaper transitions the row').toBe(1)
    expect(runRow('status')).toBe('pending')
    expect(runRow('attempts'), 'and no duplicate requeue accounting').toBe('1')
    assertNoForbiddenStates()
  }, 60_000)
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · R1 — cancel vs the owner’s final success CAS', () => {
  beforeEach(() => { freshMigration() })

  const successCas = `with u as (update public.runs set status='done', finished_at=now()
      where id='${RUN}' and status='running' and claim_id='${CLAIM}' and cancel_requested=false
      returning 1) select count(*) from u`

  it('R1a — cancel commits first: the success CAS matches zero rows', async () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1' })
    const a = session(dsn, `begin; select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator'); select pg_sleep(1.2); commit;`)
    await wait(250)
    const bp = session(dsn, successCas)
    expect(await awaitLockWait(dsn)).toBe(true)
    const b = await bp
    await a
    expect(b.out.trim(), 'done is never written over a committed cancellation').toBe('0')
    expect(runRow('status')).toBe('running')
    expect(runRow('cancel_requested')).toBe('true')
  }, 60_000)

  it('R1b — success commits first: the later cancel affects the running row only', async () => {
    seedRun({ status: `'running'`, claim_id: `'${CLAIM}'`, attempts: '1' })
    const a = session(dsn, `begin; ${successCas}; select pg_sleep(1.2); commit;`)
    await wait(250)
    const bp = session(dsn, `select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator')`)
    expect(await awaitLockWait(dsn)).toBe(true)
    const b = await bp
    await a
    expect(b.out.trim(), 'a done run is no longer cancellable').toBe('0')
    expect(runRow('status'), 'honest work is not retroactively erased').toBe('done')
    assertNoForbiddenStates()
  }, 60_000)
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · R10 — cancel vs approval decision', () => {
  beforeEach(() => {
    freshMigration()
    seedRun({ status: `'awaiting_approval'`, claim_id: `'${CLAIM}'`, attempts: '1' })
    run(dsn, ['-c', `insert into public.approvals (id, run_id, project_id, kind, status, content)
      values ('${APPR}','${RUN}','${PROJ}','article_publish','pending','{}')`])
  })
  const apprStatus = () => one(dsn, `select status from public.approvals where id='${APPR}'`)

  it('R10a — CANCEL FIRST: run cancelled, approval returned, resolver LOSES', async () => {
    const a = session(dsn, `begin; select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator'); select pg_sleep(1.2); commit;`)
    await wait(250)
    const bp = session(dsn, `select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','approved','looks good')`)
    expect(await awaitLockWait(dsn), 'the resolver must queue on the RUN row').toBe(true)
    const b = await bp
    await a
    expect(b.out.trim(), 'the loser must not publish').toBe('LOST')
    expect(runRow('status')).toBe('cancelled')
    expect(apprStatus(), 'returned — and NOT overwritten to approved').toBe('returned')
    assertNoForbiddenStates()
  }, 60_000)

  it('R10b — APPROVE FIRST: run done, approval approved, later cancel is a no-op', async () => {
    const a = session(dsn, `begin; select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','approved','looks good'); select pg_sleep(1.2); commit;`)
    await wait(250)
    const bp = session(dsn, `select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator')`)
    expect(await awaitLockWait(dsn)).toBe(true)
    const b = await bp
    await a
    expect(b.out.trim(), 'no retroactive cancellation').toBe('0')
    expect(runRow('status')).toBe('done')
    expect(apprStatus()).toBe('approved')
    assertNoForbiddenStates()
  }, 60_000)

  it('R10c — REJECT FIRST: run rejected, approval rejected, later cancel is a no-op', async () => {
    expect(one(dsn, `select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','rejected','no')`)).toBe('REJECTED')
    expect(runRow('status')).toBe('rejected')
    expect(apprStatus()).toBe('rejected')
    expect(one(dsn, `select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator')`)).toBe('0')
    assertNoForbiddenStates()
  })

  it('R10d — CANCEL vs REVISED: cancel first, the revision LOSES', async () => {
    const a = session(dsn, `begin; select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator'); select pg_sleep(1.2); commit;`)
    await wait(250)
    const bp = session(dsn, `select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','revised','please redo')`)
    expect(await awaitLockWait(dsn), 'revised takes the RUN lock too').toBe(true)
    const b = await bp
    await a
    expect(b.out.trim()).toBe('LOST')
    expect(apprStatus(), 'the returned approval is not overwritten').toBe('returned')
    assertNoForbiddenStates()
  }, 60_000)

  it('R10e — REVISED first, then cancel: revision is real, cancellation follows it', () => {
    expect(one(dsn, `select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','revised','please redo')`)).toBe('REVISED')
    expect(runRow('status'), 'a revision does not conclude the run').toBe('awaiting_approval')
    expect(apprStatus()).toBe('revised')
    // A later cancel is allowed to win — and closes the revised approval too.
    expect(one(dsn, `select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator')`)).toBe('1')
    expect(runRow('status')).toBe('cancelled')
    expect(apprStatus(), 'revised is an unresolved state, so it is returned').toBe('returned')
    assertNoForbiddenStates()
  })

  it('R10H — a NULL-project approval resolves under its run’s lineage', () => {
    // The real production shape: 12 of 13 approvals carry project_id NULL, and
    // the generic creation endpoint still inserts without one. The RUN is the
    // tenancy authority — it was matched on id + project_id + awaiting_approval
    // — so requiring the approval to repeat that project would refuse a row the
    // system legitimately produces.
    run(dsn, ['-c', `update public.approvals set project_id = null where id='${APPR}'`])
    expect(one(dsn, `select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','approved','looks good')`)).toBe('APPROVED')
    expect(runRow('status')).toBe('done')
    expect(apprStatus()).toBe('approved')
    assertNoForbiddenStates()
  })

  it('R10I — an explicitly DIFFERENT project is still refused', () => {
    // NULL-lineage tolerance must not become cross-project permission.
    run(dsn, ['-c', `insert into public.projects (id, slug, name)
      values ('22222222-2222-2222-2222-222222222222','beta','Beta') on conflict do nothing`])
    run(dsn, ['-c', `update public.approvals
      set project_id='22222222-2222-2222-2222-222222222222' where id='${APPR}'`])
    expect(one(dsn, `select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','approved','sneaky')`)).toBe('NOT_FOUND')
    expect(runRow('status'), 'the run is untouched').toBe('awaiting_approval')
    expect(apprStatus(), 'and so is the approval').toBe('pending')
    assertNoForbiddenStates()
  })

  it('R10f — an already-resolved approval is never overwritten', () => {
    run(dsn, ['-c', `update public.approvals set status='returned' where id='${APPR}'`])
    expect(one(dsn, `select public.resolve_approval(
      '${APPR}','${RUN}','${PROJ}','approved','sneaky')`)).toBe('ALREADY_RESOLVED')
    expect(apprStatus()).toBe('returned')
  })

  it('R10g — an approval from another run is refused', () => {
    expect(one(dsn, `select public.resolve_approval('${APPR}',
      '55555555-5555-5555-5555-55555555ffff','${PROJ}','approved','x')`)).toBe('LOST')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
d('G3C-3B · identity, resume and function metadata', () => {
  beforeEach(() => { freshMigration() })

  it('cancelling a pending action RELEASES its identity for a replacement', () => {
    const key = 'a'.repeat(64)
    seedRun({ status: `'pending'`, idempotency_key: `'${key}'` })
    expect(one(dsn, `select public.request_run_cancel(
      '${RUN}','${PROJ}','${ACTOR}','operator')`)).toBe('1')
    // The partial unique index excludes 'cancelled', so a replacement is legal.
    run(dsn, ['-c', `insert into public.runs (id, project_id, status, idempotency_key)
      values ('55555555-5555-5555-5555-5555555555aa','${PROJ}','pending','${key}')`])
    expect(one(dsn, `select count(*) from public.runs where idempotency_key='${key}'`)).toBe('2')
  })

  it('a manual requeue of a cancelled run COLLIDES with its replacement', () => {
    // Recorded, not silently swallowed: this is exactly why /api/runs/execute was
    // narrowed to failed→pending rather than taught to catch 23505.
    const key = 'b'.repeat(64)
    seedRun({ status: `'cancelled'`, idempotency_key: `'${key}'` })
    run(dsn, ['-c', `insert into public.runs (id, project_id, status, idempotency_key)
      values ('55555555-5555-5555-5555-5555555555bb','${PROJ}','pending','${key}')`])
    const e = query(dsn, `select public.request_run_cancel('${RUN}','${PROJ}','x','y')`)
    expect(e.length).toBe(1)   // the cancel itself is a no-op on a terminal row
    let sqlstate = ''
    try {
      run(dsn, ['-c', `update public.runs set status='pending' where id='${RUN}'`])
    } catch (err) { sqlstate = String(err).includes('runs_action_identity_uniq') ? '23505' : '' }
    expect(sqlstate, 'reviving a cancelled run beside its replacement is refused').toBe('23505')
  })

  it('the migration REFUSES to apply over an ownerless cancelled-pending row', () => {
    // The claim filter is only safe if that state is empty. Fail closed rather
    // than silently rewriting rows nobody has reasoned about.
    wipe(); restorePredecessor()
    seedRun({ status: `'pending'`, cancel_requested: 'true' })
    let msg = ''
    try { applyMigration() } catch (e) { msg = String(e) }
    expect(msg).toMatch(/already carry cancel_requested=true/)
    run(dsn, ['-c', `delete from public.runs`])
    applyMigration()
  })

  it('all five functions keep the required security posture', () => {
    const rows = query(dsn, `select n.nspname||'.'||p.proname,
        pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid),
        p.prosecdef::text, coalesce(array_to_string(p.proconfig,','),'none'),
        (select count(*) from pg_proc q join pg_namespace m on m.oid=q.pronamespace
          where q.proname=p.proname and m.nspname=n.nspname)::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='public' and p.proname in ('request_run_cancel','claim_runs',
             'release_stopped_run','resolve_approval'))
         or (n.nspname='omnira_cron' and p.proname='reap_stuck_runs')
      order by 1`)
    expect(rows.length, 'five functions, one overload each').toBe(5)
    for (const r of rows) {
      expect(r[3], `${r[0]} must stay SECURITY DEFINER`).toBe('true')
      expect(r[4], `${r[0]} must pin an empty search_path`).toBe('search_path=""')
      expect(r[5], `${r[0]} must have exactly one overload`).toBe('1')
    }
    const by = Object.fromEntries(rows.map(r => [r[0], r]))
    // ABI preservation — the three replaced functions keep name, args and result.
    expect(by['public.request_run_cancel'][1]).toBe('p_run_id uuid, p_project_id uuid, p_actor text, p_reason text')
    expect(by['public.request_run_cancel'][2], 'the integer ABI is preserved').toBe('integer')
    expect(by['public.claim_runs'][1]).toBe('p_limit integer, p_lease_seconds integer')
    expect(by['public.claim_runs'][2]).toBe('SETOF runs')
    expect(by['omnira_cron.reap_stuck_runs'][2]).toBe('integer')
    expect(by['public.release_stopped_run'][2]).toBe('text')
    expect(by['public.resolve_approval'][2]).toBe('text')
  })

  it('SECURITY: the new SECURITY DEFINER RPCs are NOT reachable by client roles', () => {
    // CREATE FUNCTION grants EXECUTE to PUBLIC by default, and this project's
    // `public` schema grants USAGE to anon and authenticated — so a new
    // SECURITY DEFINER function here is callable by unauthenticated clients
    // unless it is explicitly revoked. These two terminalize runs and resolve
    // approvals AS THE DEFINER, so that default is a privilege-escalation path.
    //
    // Catalog evidence, deliberately: asking has_function_privilege is what a
    // caller actually experiences. A migration-text pin would pass on a REVOKE
    // that was written but never took effect.
    for (const sig of ['public.release_stopped_run(uuid,uuid)',
                       'public.resolve_approval(uuid,uuid,uuid,text,text)']) {
      expect(one(dsn, `select has_function_privilege('anon','${sig}','EXECUTE')`),
        `anon must NOT execute ${sig}`).toBe('f')
      expect(one(dsn, `select has_function_privilege('authenticated','${sig}','EXECUTE')`),
        `authenticated must NOT execute ${sig}`).toBe('f')
      expect(one(dsn, `select has_function_privilege('service_role','${sig}','EXECUTE')`),
        `service_role MUST execute ${sig}`).toBe('t')
      // PUBLIC itself must hold nothing: an `=X/` entry would re-open it to
      // every present and future role.
      expect(one(dsn, `select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace,
        lateral aclexplode(p.proacl) a
        where n.nspname||'.'||p.proname = '${sig.split('(')[0]}'
          and a.grantee = 0`), `PUBLIC must hold no grant on ${sig}`).toBe('0')
    }
  })

  it('SECURITY: the REPLACED sensitive RPCs keep their restricted ACL', () => {
    // CREATE OR REPLACE preserves an existing explicit ACL — this proves the
    // replacement did not silently reset it to the permissive default.
    for (const sig of ['public.request_run_cancel(uuid,uuid,text,text)',
                       'public.claim_runs(integer,integer)']) {
      expect(one(dsn, `select has_function_privilege('anon','${sig}','EXECUTE')`), sig).toBe('f')
      expect(one(dsn, `select has_function_privilege('authenticated','${sig}','EXECUTE')`), sig).toBe('f')
      expect(one(dsn, `select has_function_privilege('service_role','${sig}','EXECUTE')`), sig).toBe('t')
    }
  })

  it('ABI: the defaulted trailing arguments survive the replacement', () => {
    // pg_get_function_identity_arguments OMITS defaults by design, so the
    // metadata test above cannot see this. Defaults are part of the practical
    // ABI: dropping them breaks a two-argument caller at runtime while every
    // static signal still says it is fine.
    const args = (fn: string) => one(dsn, `select pg_get_function_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='${fn}'`)
    const ndef = (fn: string) => one(dsn, `select p.pronargdefaults::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='${fn}'`)

    expect(args('request_run_cancel'))
      .toBe('p_run_id uuid, p_project_id uuid, p_actor text DEFAULT NULL::text, p_reason text DEFAULT NULL::text')
    expect(ndef('request_run_cancel'), 'two defaulted trailing args, as deployed').toBe('2')
    expect(args('claim_runs')).toBe('p_limit integer, p_lease_seconds integer DEFAULT 320')
    expect(ndef('claim_runs')).toBe('1')
    expect(args('resolve_approval')).toContain('p_notes text DEFAULT NULL::text')
    expect(ndef('resolve_approval'), 'p_notes is optional').toBe('1')
  })

  it('ABI: every TypeScript optional marker corresponds to a real DB default', () => {
    // The two must agree in BOTH directions: an optional type over a required
    // argument fails at runtime; a required type over a defaulted one is merely
    // wrong, but drifts.
    const types = readFileSync(join(process.cwd(), 'lib/supabase/database.types.ts'), 'utf8')
    const block = (name: string) => {
      const i = types.indexOf(`      ${name}: {`)
      return types.slice(i, types.indexOf('\n      }\n', i))
    }
    for (const fn of ['request_run_cancel', 'resolve_approval']) {
      const b = block(fn)
      const rows = query(dsn, `select a.argname, (a.i > p.pronargs - p.pronargdefaults)::text
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
        lateral unnest(p.proargnames) with ordinality as a(argname, i)
        where n.nspname='public' and p.proname='${fn}'`)
      expect(rows.length, `${fn} must expose named arguments`).toBeGreaterThan(0)
      for (const [arg, hasDefault] of rows) {
        const optional = new RegExp(`${arg}\\?:`).test(b)
        expect(optional, `${fn}.${arg}: type optional=${optional}, DB default=${hasDefault}`)
          .toBe(hasDefault === 'true')
      }
    }
  })

  it('the hand-synchronised RPC types match the INSTALLED function contracts', () => {
    // These two signatures were added to database.types.ts by targeted
    // synchronisation, not by regeneration: the repository's migration chain does
    // not apply from zero (68 of 77 fail on a greenfield database), so the
    // isolated schema is a partial fixture and regenerating from it would delete
    // ~70 tables' worth of types. This pin is what makes the hand-edit safe —
    // it compares the checked-in types against the ACTUAL installed functions,
    // so a drifting argument name or return type fails here rather than at
    // runtime.
    const types = readFileSync(join(process.cwd(), 'lib/supabase/database.types.ts'), 'utf8')
    const installed = Object.fromEntries(query(dsn, `select p.proname,
        pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('release_stopped_run','resolve_approval')`)
      .map(r => [r[0], { args: r[1], ret: r[2] }]))

    const block = (name: string) => {
      const i = types.indexOf(`      ${name}: {`)
      expect(i, `${name} must be present in database.types.ts`).toBeGreaterThan(-1)
      return types.slice(i, types.indexOf('\n      }\n', i))
    }
    const sqlToTs = (t: string) => (t === 'uuid' || t === 'text' ? 'string' : t)

    for (const [fn, meta] of Object.entries(installed)) {
      const b = block(fn)
      for (const arg of meta.args.split(',').map(a => a.trim())) {
        const [name, ...rest] = arg.split(/\s+/)
        expect(b, `${fn}: argument ${name} missing from the generated type`)
          .toMatch(new RegExp(`${name}\\??: ${sqlToTs(rest.join(' '))}`))
      }
      expect(b, `${fn}: return type must match the installed function`)
        .toContain(`Returns: ${sqlToTs(meta.ret)}`)
    }
    // Non-vacuity: both really were found and compared.
    expect(Object.keys(installed).sort()).toEqual(['release_stopped_run', 'resolve_approval'])
  })

  it('claim_runs keeps its G3C-2A default and lock order', () => {
    // The default is part of the ABI: callers pass one argument.
    expect(one(dsn, `select count(*) from public.claim_runs(10)`)).toBe('0')
    const src = one(dsn, `select regexp_replace(p.prosrc, '\\s+', ' ', 'g')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_runs'`)
    const work = src.indexOf('for update skip locked')
    const platform = src.indexOf('platform_config')
    const project = src.indexOf('from public.projects p where p.id = v_pid for share')
    expect(work).toBeGreaterThan(-1)
    expect(platform, 'work rows are locked before platform authority').toBeGreaterThan(work)
    expect(project, 'platform authority before project authority').toBeGreaterThan(platform)
    expect(src, 'and the cancellation filter is in the candidate predicate')
      .toContain('r.cancel_requested = false')
  })
})
