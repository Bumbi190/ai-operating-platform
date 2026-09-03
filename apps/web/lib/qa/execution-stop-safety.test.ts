/**
 * PR9a — execution stop-safety.
 *
 * The load-bearing tests here are the ones that read the MIGRATION TEXT. The
 * kill switch and fencing collide on a single function body: the stale
 * 20260606_killswitch_cancel.sql adds the pause filter while silently dropping
 * claim_id stamping, because it predates the fencing migration. Applying it would
 * have looked like progress and disabled fencing in the same statement.
 *
 * So "claim_runs still stamps claim_id" is not a detail worth asserting once —
 * it is the specific regression this PR exists to avoid, and it is asserted
 * against the migration that ships.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260830_execution_stop_safety.sql')
const sql = readFileSync(MIGRATION, 'utf8')

/**
 * Guards that assert "this migration does not do X" must read CODE, not comments.
 * This migration's header explains at length why the stale kill-switch file must
 * never be replayed — naming it, as it should. A guard that fired on that
 * explanation would push a future author to delete the warning rather than keep
 * the property. Same discipline as the PR8 mutation guards: strip comments, then
 * assert harder.
 */
const sqlCode = sql.replace(/--.*$/gm, '')

/** The claim_runs body as it ships, isolated from the rest of the migration. */
const claimRunsBody = (() => {
  const from = sql.indexOf('create or replace function public.claim_runs')
  const to = sql.indexOf('revoke all on function public.claim_runs', from)
  expect(from).toBeGreaterThan(-1)
  expect(to).toBeGreaterThan(from)
  return sql.slice(from, to)
})()

// ── E. Fencing preservation ─────────────────────────────────────────────────

describe('the kill switch does not regress fencing', () => {
  it('claim_runs still stamps a fresh claim_id on every claim', () => {
    expect(claimRunsBody).toMatch(/claim_id\s*=\s*gen_random_uuid\(\)/)
  })

  it('MUTATION — the stale legacy body (pause filter, no fencing) is rejected', () => {
    // Verbatim shape of 20260606_killswitch_cancel.sql's claim_runs: it has the
    // kill switch and NO claim_id. If this ever passed our assertions, fencing
    // would be off in production and nothing would say so.
    const legacy = `
      create or replace function public.claim_runs(p_limit int, p_lease_seconds int default 280)
      returns setof public.runs language plpgsql security definer set search_path to '' as $$
      begin
        return query
        update public.runs r set
          status='running', claimed_at=now(), started_at=coalesce(r.started_at, now()),
          lease_until=now()+make_interval(secs=>p_lease_seconds), attempts=r.attempts+1
        where r.id in (
          select ru.id from public.runs ru
          where ru.status='pending' and ru.attempts < ru.max_attempts
            and not exists (select 1 from public.projects p
                            where p.id=ru.project_id and p.execution_paused=true)
          order by ru.created_at for update skip locked limit p_limit)
        returning r.*;
      end $$;`
    // The legacy body satisfies the kill switch...
    expect(legacy).toMatch(/execution_paused/)
    // ...and fails the fencing assertion, which is the whole point.
    expect(legacy).not.toMatch(/claim_id\s*=\s*gen_random_uuid\(\)/)
  })

  it('MUTATION — a body with fencing but no pause filter is rejected', () => {
    // The inverse mistake: today's production function. Passing fencing is not
    // sufficient; the pause predicate must be there too.
    const current = `
      update public.runs r set status='running', claim_id=gen_random_uuid()
      where r.id in (select id from public.runs where status='pending'
                     and attempts<max_attempts order by created_at
                     for update skip locked limit p_limit) returning r.*;`
    expect(current).toMatch(/claim_id\s*=\s*gen_random_uuid\(\)/)
    expect(current).not.toMatch(/execution_paused/)
  })

  it('never replays the stale migration', () => {
    // A migration that sourced or re-ran the old file would reintroduce the bug.
    // The header names the stale file deliberately; the CODE must not touch it.
    expect(sql).toMatch(/20260606_killswitch_cancel/i)      // documented…
    expect(sqlCode).not.toMatch(/20260606_killswitch_cancel/i)   // …never executed
    expect(sqlCode).not.toMatch(/\\i\s|\bsource\s+['"]/i)
  })

  it('preserves every pre-existing claim semantic', () => {
    for (const required of [
      /status\s*=\s*'running'/,          // terminal claim state
      /claimed_at\s*=\s*now\(\)/,
      /started_at\s*=\s*coalesce/,       // first start wins across retries
      /lease_until\s*=\s*now\(\)\s*\+\s*make_interval/,
      /attempts\s*=\s*r\.attempts\s*\+\s*1/,
      /for update skip locked/,
      /order by ru\.created_at/,         // FIFO preserved
      /limit p_limit/,
      /ru\.attempts\s*<\s*ru\.max_attempts/,
      /ru\.status\s*=\s*'pending'/,      // excludes cancelled/rejected/done/failed
    ]) expect(claimRunsBody).toMatch(required)
  })

  it('keeps the DEFAULT 280 parameter — Postgres cannot drop it in create-or-replace', () => {
    // Omitting it fails the migration outright with 42P13. Found by the pre-apply
    // rollback test, not by reading the code.
    expect(claimRunsBody).toMatch(/p_lease_seconds\s+int\s+default\s+280/i)
  })

  it('stays security definer and service_role-only', () => {
    expect(claimRunsBody).toMatch(/security definer/)
    expect(claimRunsBody).toMatch(/set search_path to ''/)
    expect(sql).toMatch(/revoke all on function public\.claim_runs\(int, int\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.claim_runs\(int, int\) to service_role/)
  })
})

// ── D. Kill switch ──────────────────────────────────────────────────────────

describe('project kill switch', () => {
  it('filters paused projects with a null-safe NOT EXISTS, not a join', () => {
    const predicate = claimRunsBody.replace(/--.*$/gm, '').replace(/\s+/g, ' ')
    expect(predicate).toMatch(
      /and not exists \( select 1 from public\.projects p where p\.id = ru\.project_id and p\.execution_paused = true \)/)
  })

  it('uses the same predicate shape as the workflow claim path', () => {
    // Two claim paths reading one switch differently is how an operator ends up
    // half-stopped, which is exactly the state PR9a found production in.
    // Both claim paths must read one switch the same way. Two paths reading it
    // differently is how production ended up half-stopped.
    const norm = (t: string) => t.replace(/--.*$/gm, '').replace(/\s+/g, ' ')
    const shape = /not exists \( select 1 from public\.projects p where p\.id = \w+\.project_id and p\.execution_paused = true \)/
    expect(norm(readFileSync(join(process.cwd(),
      // workflow_claim_due's pause predicate lives in the continuation migration;
      // _project_pause.sql only adds the columns it reads.
      'supabase/migrations/20260829_workflow_scheduled_continuation.sql'), 'utf8'))).toMatch(shape)
    expect(norm(claimRunsBody)).toMatch(shape)
  })

  it('the setter is idempotent and preserves the original pause instant', () => {
    const body = sql.slice(sql.indexOf('function public.set_project_execution_paused'))
    // Re-pausing must not restamp paused_at, or "since when" becomes unanswerable.
    expect(body).toMatch(/paused_at\s*=\s*case when p_paused\s*\n?\s*then coalesce\(paused_at, now\(\)\)/)
    expect(body).toMatch(/where id = p_project_id/)      // never touches other projects
  })

  it('pause freezes rather than cancels', () => {
    // Conflating the two would make pause destructive; recovery from a wrong
    // pause must be `unpause`, not `re-create everything you killed`.
    const body = sql.slice(sql.indexOf('function public.set_project_execution_paused'))
    expect(body).not.toMatch(/update public\.runs/)
    expect(body).not.toMatch(/status\s*=\s*'cancelled'/)
  })
})

// ── C. Cancellation ─────────────────────────────────────────────────────────

describe('run cancellation', () => {
  it('request_run_cancel is tenancy-guarded and status-guarded', () => {
    const body = sql.slice(sql.indexOf('function public.request_run_cancel'))
    expect(body).toMatch(/and project_id = p_project_id/)               // no cross-tenant cancel
    expect(body).toMatch(/status in \('pending', 'running'\)/)          // terminal runs untouched
    expect(body).toMatch(/get diagnostics n = row_count/)               // caller can tell 0 from 1
  })

  it('records who and why', () => {
    expect(sql).toMatch(/add column if not exists cancel_reason/)
    expect(sql).toMatch(/add column if not exists cancelled_by/)
  })

  it('requests cancellation — it never applies a terminal status itself', () => {
    // Only the owning executor may write the terminal row, fenced on claim_id.
    const body = sql.slice(sql.indexOf('function public.request_run_cancel'),
                           sql.indexOf('function public.set_project_execution_paused'))
    expect(body).not.toMatch(/status\s*=\s*'cancelled'/)
  })

  it('the route reports enforcement honestly, not just persistence', async () => {
    const route = readFileSync(join(process.cwd(), 'app/api/runs/[id]/cancel/route.ts'), 'utf8')
    // The original bug: `{ok:true, status:'cancel_requested'}` regardless of
    // whether anything would act on it. The first fix reported
    // `cancel_requested_not_enforced` while H1_CANCEL was off.
    //
    // G3C-3A changes the underlying truth rather than the wording: the canonical
    // post-claim checkpoint reads cancel_requested unconditionally, so a
    // persisted request IS now enforced and `true` is the honest answer. What
    // must never regress is the DISTINCTION — `ok` is persistence, `enforced` is
    // action — and the refusal to overclaim a remote cancellation.
    expect(route).toMatch(/enforced: true/)
    expect(route).toMatch(/request_run_cancel/)
    // G3C-3B: `persisted` is gone because the pre-read branch that needed it is
    // gone. The RPC's ROW COUNT is now the mutation truth, and the route must
    // never report success without it — that was the lost-cancellation defect.
    expect(route, 'the row count is the mutation truth')
      .toMatch(/const mutated = Number\(affected\) > 0/)
    expect(route, 'and a zero-row non-cancelled outcome is a conflict, not success')
      .toMatch(/status: 'already_terminal'/)
    expect(route, 'the latency contract stays explicit')
      .toMatch(/next safe boundary/)
    expect(route, 'and it must not claim a remote cancellation')
      .toMatch(/not remotely cancelled/)
  })

  it('honours cancel at claim time and between steps', async () => {
    const drain = readFileSync(join(process.cwd(), 'app/api/runs/drain/route.ts'), 'utf8')
    const exec = readFileSync(join(process.cwd(), 'lib/ai/workflow-executor.ts'), 'utf8')
    // G3C-3B removed the H1_CANCEL-gated duplicate from the drain. Cancellation
    // at drain entry now has exactly ONE decision — the canonical checkpoint —
    // and it is unconditional, so pinning the old flag-gated branch would pin the
    // very duplication that was removed.
    expect(drain, 'no second, flag-gated cancel truth may return to the drain')
      .not.toMatch(/isCancelEnabled\(\)\s*&&\s*run\.cancel_requested/)
    expect(drain, 'the canonical checkpoint decides it').toMatch(/checkpointClaimedRun\(/)
    // G3C-3B removed the H1_CANCEL-gated cooperative check from the executor
    // too. It was inert only because the flag is unset — enabling it would have
    // let it PREEMPT the canonical checkpoint and collapse a failed lifecycle
    // write back into FENCED. Pinning it now would pin the duplication that was
    // removed, so pin what replaced it: one unconditional boundary per step,
    // settled through the canonical mapping.
    expect(exec, 'no second, flag-gated cancel truth may return to the executor')
      .not.toMatch(/isCancelEnabled\(\)\s*&&\s*await isCancelRequested/)
    expect(exec, 'the canonical checkpoint decides every step').toMatch(/checkpointClaimedRun\(/)
    expect(exec, 'and its refusals settle through the one mapping').toMatch(/settleRefusal\(/)
    // and the terminal write is still fenced like every other executing-run write
    expect(drain).toMatch(/fencedRunUpdate\(db, run\.id, run\.claim_id/)
  })
})

// ── F. Flag observability ───────────────────────────────────────────────────

describe('effective flag state is observable without leaking secrets', () => {
  it('reports booleans only', async () => {
    const { executionSafetyFlags } = await import('../ai/execution-flags')
    const prev = { ...process.env }
    try {
      process.env.H1_FENCING = '1'; process.env.H1_CANCEL = '1'
      process.env.H1_POLICY_GATE = '0'; delete process.env.H1_UNIFIED_EXECUTOR
      process.env.H1_SPEND_GATE = '1'
      const f = executionSafetyFlags()
      expect(f).toEqual({ fencing: true, cancel: true, policy_gate: false,
                          unified_executor: false, spend_gate: true })
      for (const v of Object.values(f)) expect(typeof v).toBe('boolean')
    } finally { process.env = prev }
  })

  it('derives from the runtime predicates, not a second env read', () => {
    // If this module re-read the env itself it could report a fiction while the
    // runtime behaved differently.
    const src = readFileSync(join(process.cwd(), 'lib/ai/execution-flags.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).toMatch(/isFencingEnabled/)
    expect(code).toMatch(/isCancelEnabled/)
    // The two stop-safety flags must NOT be re-read here — that is what would let
    // this surface report a fiction while the runtime behaved differently.
    expect(code).not.toMatch(/H1_FENCING/)
    expect(code).not.toMatch(/H1_CANCEL\b/)
  })

  it('never returns a raw env value from the endpoint', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/system/execution-safety/route.ts'), 'utf8')
    expect(route).not.toMatch(/process\.env\.[A-Z]/)
    expect(route).toMatch(/executionSafetyFlags\(\)/)
  })

  it('flags fencing/cancel off as unsafe, and treats behaviour flags separately', async () => {
    const { unsafeExecutionFlags } = await import('../ai/execution-flags')
    const base = { policy_gate: true, unified_executor: true, spend_gate: true }
    expect(unsafeExecutionFlags({ ...base, fencing: false, cancel: true }))
      .toEqual(['fencing_disabled'])
    expect(unsafeExecutionFlags({ ...base, fencing: true, cancel: false }))
      .toEqual(['cancel_disabled'])
    // policy_gate/unified_executor off is a behaviour choice, not a stop-safety
    // defect. spend_gate off IS surfaced (PR9b) — an unenforced budget reads as
    // a budget, so "we are only observing" has to be visible.
    expect(unsafeExecutionFlags({ fencing: true, cancel: true, policy_gate: false,
                                  unified_executor: false, spend_gate: true }))
      .toEqual([])
    expect(unsafeExecutionFlags({ ...base, fencing: true, cancel: true, spend_gate: false }))
      .toEqual(['spend_gate_advisory_only'])
  })
})

// ── H. Re-arm ───────────────────────────────────────────────────────────────

describe('workflow re-arm: permission, never execution', () => {
  const body = sql.slice(sql.indexOf('function public.workflow_rearm'))

  it('only moves wake_at, idempotently', () => {
    expect(body).toMatch(/wake_at = least\(coalesce\(w\.wake_at, 'infinity'::timestamptz\), now\(\)\)/)
  })

  it('creates no transition, no run and no execution', () => {
    expect(body).not.toMatch(/insert into public\.workflow_transitions/)
    expect(body).not.toMatch(/insert into public\.runs/)
    expect(body).not.toMatch(/current_state\s*=/)      // reads it; never writes it
    expect(body).not.toMatch(/status\s*=\s*'/)
  })

  it('refuses a closed instance, a paused project, and a grant for another state', () => {
    expect(body).toMatch(/inst\.status <> 'active'/)
    expect(body).toMatch(/p\.execution_paused = true/)
    expect(body).toMatch(/a\.target_id = p_instance_id::text \|\| ':' \|\| inst\.current_state/)
    expect(body).toMatch(/a\.project_id = inst\.project_id/)
  })

  it('mirrors the append-time grant predicate', () => {
    // Same liveness rules as workflow_append_transition, as a boolean not an
    // exception — so re-arm can never be more permissive than the gate itself.
    expect(body).toMatch(/a\.event_type = 'granted'/)
    expect(body).toMatch(/a\.expires_at > now\(\)/)
    expect(body).toMatch(/a\.target_type = 'workflow_gate'/)
    expect(body).toMatch(/event_type in \('denied', 'revoked', 'superseded', 'expired'\)/)
  })

  it('is not a trigger on the authority ledger', () => {
    expect(sql).not.toMatch(/create\s+trigger/i)
    expect(sql).not.toMatch(/on public\.atlas_authorizations/i)
  })

  it('lives on the workflow route, never inside the authority ledger route', () => {
    // The Executive authority routes are import-allowlisted so they cannot grow
    // subsystem dependencies. Wiring re-arm there tripped that guard — correctly.
    // Coupling the ledger to the scheduler is the exact shape "approval is
    // permission, not execution" forbids, so re-arm is a WORKFLOW action.
    const authz = readFileSync(join(process.cwd(),
      'app/api/atlas/executive/authorization/route.ts'), 'utf8')
    expect(authz).not.toMatch(/rearm/i)
    expect(authz).not.toMatch(/supabase\/admin/)

    const gate = readFileSync(join(process.cwd(), 'app/api/workflows/gate/route.ts'), 'utf8')
    expect(gate).toMatch(/rearmForAuthorization/)
    expect(gate).toMatch(/'rearm'/)
  })

  it('the re-arm action is authenticated and project-scoped like every gate action', () => {
    const gate = readFileSync(join(process.cwd(), 'app/api/workflows/gate/route.ts'), 'utf8')
    const rearmAt = gate.indexOf("if (action === 'rearm')")
    // The ownership gate and 404-on-foreign check must both precede it.
    expect(gate.indexOf('resolveProjectAccess')).toBeLessThan(rearmAt)
    expect(gate.indexOf('assertProjectAllowed')).toBeLessThan(rearmAt)
  })

  it('the module cannot execute anything', async () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/rearm.ts'), 'utf8')
    for (const forbidden of [/appendTransition/, /instantiate/, /executeRunSteps/, /claim_runs/, /from\('runs'\)/]) {
      expect(src).not.toMatch(forbidden)
    }
  })
})

// ── I. Heartbeat ────────────────────────────────────────────────────────────

describe('heartbeat coverage', () => {
  const hb = readFileSync(join(process.cwd(), 'app/api/media/cron/heartbeat/route.ts'), 'utf8')

  it('monitors the workflow tick on the runs_drain pattern', () => {
    expect(hb).toMatch(/key: 'workflow_tick'.*jobs: \['omnira_workflow_tick'\].*intervalMin: 1.*graceMin: 5/)
  })

  it('keeps the existing per-minute monitors intact', () => {
    expect(hb).toMatch(/key: 'runs_drain'.*intervalMin: 1, graceMin: 5/)
    expect(hb).toMatch(/key: 'runs_reaper'.*intervalMin: 1, graceMin: 5/)
  })

  it('registers exactly one writer per key', () => {
    const keys = [...hb.matchAll(/key: '([a-z_]+)'/g)].map(m => m[1])
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('workflow_tick')
  })
})

// ── J. Stuck / cancel observability ─────────────────────────────────────────

describe('execution-safety status surface', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/system/execution-safety/route.ts'), 'utf8')

  it('reports the conditions that mean the stop path is broken', () => {
    expect(route).toMatch(/runs_running_past_lease/)
    expect(route).toMatch(/cancel_requested_not_honoured/)
    expect(route).toMatch(/paused_project_has_claimable_runs/)
  })

  it('is read-only and project-scoped', () => {
    expect(route).toMatch(/resolveProjectAccess/)
    expect(route).toMatch(/\.in\('project_id', ids\)/)
    for (const w of [/\.update\(/, /\.insert\(/, /\.delete\(/, /\.upsert\(/]) {
      expect(route).not.toMatch(w)
    }
    // PR9b added a read RPC here, so the blanket ban on .rpc( was replaced with
    // an ALLOWLIST rather than dropped — the guard now names exactly which
    // functions this surface may call, which is stricter than before. Every one
    // must be read-only; budget_reserve/settle/release are writes and must never
    // appear on a status endpoint.
    const rpcs = [...route.matchAll(/\.rpc\('(\w+)'/g)].map(m => m[1])
    expect(rpcs.every(fn => fn === 'budget_headroom')).toBe(true)
    // Comment-stripped: the route's own prose explains what claim_runs does, and
    // a guard that fired on the explanation would push a future author to delete
    // it rather than keep the property.
    const routeCode = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const writer of ['budget_reserve', 'budget_settle', 'budget_release',
                          'claim_runs', 'request_run_cancel', 'set_project_execution_paused',
                          'workflow_rearm']) {
      expect(routeCode).not.toContain(writer)
    }
  })
})
