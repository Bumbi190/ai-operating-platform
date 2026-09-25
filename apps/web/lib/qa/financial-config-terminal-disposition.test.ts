/**
 * Phase 3A, part two — CONFIGURATION OFF TERMINATES THE CLAIMED RUN.
 *
 * ── THE DEFECT THIS FILE EXISTS TO PIN ──────────────────────────────────────
 * The decoupling seam first filed `spend_enforcement_required` and
 * `financial_execution_disabled` under `TEMPORARY_BLOCKERS`, reasoning that
 * "configuration may be turned on later, so the run should wait". That reasoning
 * is wrong under the durable-run admission contract, and wrong silently:
 *
 *     claim_runs admits only `pending` rows with `attempts < max_attempts`,
 *     and increments `attempts` on admission. Nothing on the requeue path
 *     compensates that increment.
 *
 * A FINANCIAL action has `maxAttempts = 1`. So the requeue is a one-way trip:
 *
 *     pending attempts=0/max=1 → claim → running attempts=1
 *       → config blocker → back to pending attempts=1/max=1
 *       → `1 < 1` is false → NEVER CLAIMABLE AGAIN
 *
 * Not running, not rejected, and invisible to the drain forever. The row is
 * stranded. This is the same R7 violation the executor's own G3C-3B comment
 * records for project pause — fixed there by routing through
 * `checkpointClaimedRun` + `settleRefusal`, which DO compensate the attempt. A
 * config blocker has no such compensation, so it must not borrow that path.
 *
 * ── THE MODEL THESE TESTS PIN ───────────────────────────────────────────────
 * READINESS: the blocker is CONFIGURATION, not drift — `terminal` stays false,
 *            because the approved act still exists and the pin is unchanged.
 * EXECUTOR:   the blocker is TERMINAL for THIS claimed run — rejected before
 *            dispatch, no provider call, no spend, no evidence write. When
 *            configuration is safe again a NEW run is bound through the normal
 *            authority path, which still has to be effective.
 *
 * Those two statements are consistent, not contradictory: `terminal` is a fact
 * about the READINESS DATA, and executor disposition is a separate decision.
 *
 * ── WHY READINESS IS STUBBED HERE, AND WHERE IT IS NOT ──────────────────────
 * The ruling's executor case is "readiness returns ONLY either/both config
 * blockers and canonical checkpoint authority is otherwise clear", so this file
 * feeds readiness that exact input. That the REAL readiness produces these
 * blockers from these flags — against the real predicates and the real policy
 * table — is proven behaviourally in `spend-financial-decoupling.test.ts` §10/§11.
 * The two files are halves of one chain; neither alone is the proof.
 *
 * The blocker list is asserted EXACTLY, not by substring. A fixture that
 * accidentally carried a second blocker would make `every()` false and the run
 * would be rejected for an unrelated reason — passing while proving nothing.
 * That is not hypothetical: an earlier revision of this file did exactly that,
 * and the mutation check below is what exposed it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))

/** Readiness, controllable per test. */
const ready = vi.fn()
/** The pre-dispatch contract, controllable per test. */
const stillAuthorized = vi.fn()
vi.mock('@/lib/workflows/action-run', async orig => ({
  ...(await orig<typeof import('@/lib/workflows/action-run')>()),
  assertWorkflowActionReady: (...a: unknown[]) => ready(...a),
  assertWorkflowActionStillAuthorized: (...a: unknown[]) => stillAuthorized(...a),
}))
/** The governance checkpoint, controllable per test. */
const checkpoint = vi.fn()
vi.mock('@/lib/governance/run-execution-checkpoint', async orig => ({
  ...(await orig<typeof import('@/lib/governance/run-execution-checkpoint')>()),
  checkpointClaimedRun: (...a: unknown[]) => checkpoint(...a),
}))
vi.mock('@/lib/workflows/store', async orig => ({
  ...(await orig<typeof import('@/lib/workflows/store')>()),
  readInstance: async () => INSTANCE,
  readDefinitionById: async () => DEFINITION,
  listEvidence: async () => [],
  recordEvidence: async () => ({}),
}))

const { executeWorkflowAction } = await import('@/lib/workflows/action-executor')

type Row = Record<string, unknown>

const NOW = '2026-09-25T12:00:00.000Z'
const CLAIM = 'claim-3a'
const HASH = 'a'.repeat(64)

const INSTANCE = {
  id: 'inst-1', project_id: 'proj-1', instance_key: 'observing',
  def_key: 'omnira.execution-proof', def_version: 1, def_hash: HASH,
  def_id: 'def-1', current_state: 'observing', status: 'active',
}
const DEFINITION = { def_key: 'omnira.execution-proof', version: 1, spec: { canonical: {} } }

/**
 * A FINANCIAL run already CLAIMED and already at `attempts == max_attempts`,
 * which is the state the stranding depends on: any requeue here is the last one.
 */
const runFor = (over: Row = {}): Row => ({
  id: 'run-1', project_id: 'proj-1', status: 'running', claim_id: CLAIM,
  cancel_requested: false, workflow_instance_id: 'inst-1',
  workflow_from_state: 'observing', action_kind: 'proof_governed_effect',
  action_class: 'FINANCIAL', target_version_hash: HASH, attempt_group: 'grp-1',
  authorization_id: 'auth-1',
  attempts: 1, max_attempts: 1,
  ...over,
})

/** Every `runs` UPDATE, in order — the durable final state, captured. */
const updates: Row[] = []

const fakeDb = {
  from: () => ({
    update: (payload: Row) => {
      updates.push(payload)
      const res = { data: [{ id: 'run-1' }], error: null }
      const chain = { eq: () => chain, select: () => Promise.resolve(res) }
      return chain
    },
    select: () => {
      const c = { eq: () => c, maybeSingle: async () => ({ data: null }) }
      return c
    },
  }),
  rpc: async () => ({ data: null, error: null }),
} as never

const SAVED: Record<string, string | undefined> = {}
const FLAGS = ['H1_SPEND_GATE', 'H1_FINANCIAL_EXECUTION'] as const

function setFlags(spend: boolean, financial: boolean): void {
  for (const f of FLAGS) if (!(f in SAVED)) SAVED[f] = process.env[f]
  if (spend) process.env.H1_SPEND_GATE = '1'; else delete process.env.H1_SPEND_GATE
  if (financial) process.env.H1_FINANCIAL_EXECUTION = '1'
  else delete process.env.H1_FINANCIAL_EXECUTION
}

/** Readiness refusing with EXACTLY this blocker list, and nothing else. */
const blockedBy = (...blockers: string[]) => ready.mockResolvedValue({
  ready: false, blockers, terminal: false, detail: blockers.join(', '),
})
const readinessClear = () => ready.mockResolvedValue({
  ready: true, blockers: [], terminal: false, detail: 'ok',
})

const exec = (over: Row = {}) =>
  executeWorkflowAction(fakeDb, runFor(over) as never, CLAIM, NOW)

const finalUpdate = () => updates[updates.length - 1]
/** `side_effect_summary` is a JSON object; the blockers are read structurally. */
const summaryOf = (u = finalUpdate()) => (u?.side_effect_summary ?? {}) as {
  refusal?: string; disposition?: string; blockers?: string[]
}

beforeEach(() => {
  for (const f of FLAGS) delete process.env[f]
  updates.length = 0
  ready.mockReset(); stillAuthorized.mockReset(); checkpoint.mockReset()
  readinessClear()
  checkpoint.mockResolvedValue({ allowed: true })
  stillAuthorized.mockResolvedValue({ allowed: true })
})

afterEach(() => {
  for (const f of FLAGS) {
    if (SAVED[f] === undefined) delete process.env[f]
    else process.env[f] = SAVED[f]
  }
})

// ── §8 · the four-case executor matrix ──────────────────────────────────────

describe('§8 · a closed configuration prerequisite REJECTS the claimed run', () => {
  it('the fixture is honest: readiness clear travels PAST the flag layer', async () => {
    // Without this anchor a rejection below could be trivially true, and an early
    // return would hide itself. With readiness clear the run must reach the
    // pre-dispatch contract — so the three refusals below are known to come from
    // the blockers this file fed in, not from an earlier gate.
    setFlags(true, true)
    readinessClear()
    // Make pre-dispatch refuse, so the run stops there rather than wandering into
    // the governed-effect branch where a provider fixture would be needed.
    stillAuthorized.mockResolvedValue({
      allowed: false, refusal: 'STOPPED', reason: 'platform automation is paused',
    })
    const r = await exec()

    expect(stillAuthorized, 'readiness clear must reach the pre-dispatch contract')
      .toHaveBeenCalled()
    expect(r.refusal).not.toBe('not_ready')
    expect(summaryOf().blockers ?? []).not.toContain('spend_enforcement_required')
    expect(summaryOf().blockers ?? []).not.toContain('financial_execution_disabled')
  })

  it('CASE A — spend OFF, financial OFF → permanent, durable state rejected', async () => {
    setFlags(false, false)
    blockedBy('spend_enforcement_required')
    const r = await exec()

    expect(r.refusal).toBe('not_ready')
    expect(r.disposition).toBe('permanent')
    // THE assertion: rejected, NOT pending. Pending here is the strand.
    expect(finalUpdate()?.status).toBe('rejected')
    // …and the blocker list is EXACTLY the config blocker, so the disposition was
    // decided by it and not by some other member of the list.
    expect(summaryOf().blockers).toEqual(['spend_enforcement_required'])
  })

  it('CASE B — spend ON, financial OFF → permanent, durable state rejected', async () => {
    setFlags(true, false)
    blockedBy('financial_execution_disabled')
    const r = await exec()

    expect(r.refusal).toBe('not_ready')
    expect(r.disposition).toBe('permanent')
    expect(finalUpdate()?.status).toBe('rejected')
    expect(summaryOf().blockers).toEqual(['financial_execution_disabled'])
  })

  it('CASE C — spend OFF, financial ON → permanent, durable state rejected', async () => {
    setFlags(false, true)
    blockedBy('spend_enforcement_required')
    const r = await exec()

    expect(r.refusal).toBe('not_ready')
    expect(r.disposition).toBe('permanent')
    expect(finalUpdate()?.status).toBe('rejected')
    expect(summaryOf().blockers).toEqual(['spend_enforcement_required'])
  })

  it('BOTH blockers together → still permanent, not requeued', async () => {
    setFlags(false, false)
    blockedBy('spend_enforcement_required', 'financial_execution_disabled')
    const r = await exec()

    expect(r.disposition).toBe('permanent')
    expect(finalUpdate()?.status).toBe('rejected')
  })

  it('CASE D — both ON → no config refusal, and the flag layer grants nothing', async () => {
    setFlags(true, true)
    readinessClear()
    checkpoint.mockResolvedValue({
      allowed: false, refusal: 'STOPPED', detail: 'platform automation is paused',
    })
    const r = await exec()

    expect(r.refusal).not.toBe('not_ready')
    expect(summaryOf().blockers ?? []).not.toContain('spend_enforcement_required')
    expect(summaryOf().blockers ?? []).not.toContain('financial_execution_disabled')
  })

  it('no configuration case ever requeues, dispatches or synthesizes evidence', async () => {
    for (const blocker of ['spend_enforcement_required', 'financial_execution_disabled']) {
      updates.length = 0
      blockedBy(blocker)
      const r = await exec()

      expect(r.executed, blocker).toBe(false)
      // Nothing dispatched: the outcome is DECLARED, not inferred.
      expect(finalUpdate()?.action_outcome, blocker).toBe('REJECTED')
      expect(finalUpdate()?.finished_at, blocker).toBe(NOW)
      expect(finalUpdate()?.claimed_at, blocker).toBeNull()
      expect(finalUpdate()?.lease_until, blocker).toBeNull()
      for (const u of updates) {
        expect(u.status, `${blocker} must never requeue`).not.toBe('pending')
      }
    }
  })

  it('the real-money kind is dispositioned identically', async () => {
    // `generate_monthly_story` is the effect that actually spends. It must not
    // have a different refusal path from the registry's proof action.
    setFlags(false, false)
    blockedBy('spend_enforcement_required')
    const r = await exec({ action_kind: 'generate_monthly_story' })

    expect(r.refusal).toBe('not_ready')
    expect(r.disposition).toBe('permanent')
    expect(finalUpdate()?.status).toBe('rejected')
  })
})

// ── §9 · the attempt-stranding regression ───────────────────────────────────

describe('§9 · why a config refusal must never be requeued', () => {
  const bare = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const execSrc = () => bare('lib/workflows/action-executor.ts')

  it('fails if either config blocker is re-added to TEMPORARY_BLOCKERS', () => {
    // The regression the ruling asks for. Re-adding one is otherwise a SILENT
    // change — the code still compiles, the behaviour suite still passes (the
    // terminal guard below still catches it), and the only symptom is rows that
    // never come back. So the membership itself is pinned, forcing a reviewed
    // decision rather than an inherited accident.
    const src = execSrc()
    const from = src.indexOf('const TEMPORARY_BLOCKERS = [')
    expect(from, 'the temporary-blocker list must exist').toBeGreaterThan(-1)
    const list = src.slice(from, src.indexOf(']', from))
    expect(list).not.toContain('spend_enforcement_required')
    expect(list).not.toContain('financial_execution_disabled')
  })

  it('pins the canonical admission contract that makes the requeue fatal', () => {
    // Pinned from the repository's own migration, and verified against the LIVE
    // `claim_runs` definition during Phase 3A — the two agree. If any of these
    // stops being true, the reasoning in TEMPORARY_BLOCKERS is stale and this
    // disposition decision has to be re-derived rather than inherited.
    const sql = readFileSync(join(process.cwd(),
      'supabase/migrations/20260903120000_durable_cancellation_reaper.sql'), 'utf8')
    expect(sql, 'only pending rows are claimable').toMatch(/r\.status = 'pending'/)
    expect(sql, 'only rows under their attempt budget are claimable')
      .toMatch(/r\.attempts < r\.max_attempts/)
    expect(sql, 'admission CONSUMES an attempt').toMatch(/r\.attempts \+ 1/)
    // …and the requeue write does not give the attempt back.
    const executor = execSrc()
    const requeue = executor.slice(executor.indexOf("status: 'pending'"))
    expect(requeue.slice(0, 120), 'a requeue must not compensate the attempt')
      .not.toMatch(/attempts/)
  })

  it('FINANCIAL really is maxAttempts 1, so one requeue is the last', async () => {
    const { ACTION_CLASS_POLICY } = await import('@/lib/workflows/action-target')
    expect(ACTION_CLASS_POLICY.FINANCIAL.maxAttempts).toBe(1)
  })

  it('the terminal declaration exists and is non-empty', () => {
    // An empty list would mean the guard had been dropped rather than satisfied.
    const src = execSrc()
    const from = src.indexOf('const CONFIG_TERMINAL_BLOCKERS = [')
    expect(from, 'the terminal list must exist').toBeGreaterThan(-1)
    const list = src.slice(from, src.indexOf(']', from))
    expect(list).toContain('spend_enforcement_required')
    expect(list).toContain('financial_execution_disabled')
  })

  it('the terminal guard is checked BEFORE the retryable branch', () => {
    // Ordering is the enforcement: the terminal check must run first, so the
    // temporary branch can never claim a config blocker whatever the list holds.
    const src = execSrc()
    const terminal = src.indexOf('blockers.some(b => CONFIG_TERMINAL_BLOCKERS.includes(b))')
    const retryable = src.indexOf('blockers.every(b => TEMPORARY_BLOCKERS.includes(b))')
    expect(terminal).toBeGreaterThan(-1)
    expect(retryable).toBeGreaterThan(-1)
    expect(terminal, 'terminal must be decided before retryable').toBeLessThan(retryable)
  })

  it('the config blockers are NOT drift either — readiness and disposition differ', () => {
    // The distinction the ruling turns on, pinned so neither half is "fixed" by
    // breaking the other: not drift (so `terminal` stays false and the run is not
    // reported as an authority failure) AND not retryable (so it is not requeued).
    //
    // The closing bracket is found AFTER the `= [`, not after the declaration
    // start: `ActionReadinessBlocker[]` contains a `]` of its own, and anchoring
    // on the declaration start captures an EMPTY slice — which would make every
    // assertion below pass while proving nothing. The membership check that
    // follows is what stops that from being possible again.
    const src = bare('lib/workflows/action-run.ts')
    const from = src.indexOf('const DRIFT: ActionReadinessBlocker[] = [')
    const open = src.indexOf('= [', from)
    expect(from, 'the drift declaration must exist').toBeGreaterThan(-1)
    expect(open, 'the drift initializer must exist').toBeGreaterThan(from)
    const drift = src.slice(open, src.indexOf(']', open))
    expect(drift, 'the slice must be the real list, not empty').toContain('target_drifted')
    expect(drift).not.toContain('spend_enforcement_required')
    expect(drift).not.toContain('financial_execution_disabled')
  })
})

// ── §10 · a rejected run frees its identity ─────────────────────────────────

describe('§10 · a rejected run releases its action identity for a deliberate rebind', () => {
  it('the canonical partial index excludes exactly cancelled and rejected', () => {
    // CITED, not re-proven here. `workflow-action-binding.test.ts` pins the index
    // predicate from the migration, and `durable-cancellation-sql.test.ts` proves
    // against real PostgreSQL that a terminal row frees the key while reviving
    // beside a replacement raises 23505. Re-asserting that SQL would duplicate an
    // existing proof; what THIS file adds is which status the disposition lands on.
    const binding = readFileSync(
      join(process.cwd(), 'lib', 'qa', 'workflow-action-binding.test.ts'), 'utf8')
    expect(binding, 'the index predicate must stay pinned somewhere permanent')
      .toMatch(/status not in \\\('cancelled','rejected'\\\)/)
    const sqlSuite = readFileSync(
      join(process.cwd(), 'lib', 'qa', 'durable-cancellation-sql.test.ts'), 'utf8')
    expect(sqlSuite, 'and stay proven against real PostgreSQL')
      .toMatch(/runs_action_identity_uniq/)
  })

  it('so a config refusal rejects — one of the two excluded statuses', async () => {
    setFlags(true, false)
    blockedBy('financial_execution_disabled')
    await exec()
    expect(finalUpdate()?.status).toBe('rejected')
    expect(['cancelled', 'rejected']).toContain(String(finalUpdate()?.status))
  })
})
