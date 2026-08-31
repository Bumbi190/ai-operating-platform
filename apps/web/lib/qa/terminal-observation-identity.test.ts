/**
 * PR9h-4 — a terminal observation must release its action identity.
 *
 * The seam classified a prior run by `attempts < max_attempts` and concluded
 * "the drain's own retry handles it". `claim_runs` selects `status = 'pending'`,
 * so a `done` run is never claimed again: a completed non-passing observation
 * held its identity forever and no explicit reschedule could ever produce a new
 * one.
 *
 * Releasing on terminal is necessary but NOT sufficient. The executor re-arms
 * the instance whenever a run finishes, so release alone would give
 * tick → create → finish → re-arm → tick, forever. Release therefore also
 * requires an explicit operator schedule recorded AFTER the prior run was
 * created. Both halves are tested here; either one alone is a defect.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { classifyPriorObservation, type PriorObservation } from '../workflows/action-identity'
import { ensureReadOnlyActionRuns } from '../workflows/action-scheduling'
import { computeEvidenceTargetHash } from '../workflows/attestation'
import { ACTION_OUTCOMES, type ActionOutcome } from '../workflows/action-outcome'

const PROBE_DEF_KEY = 'omnira.probe-validation'
const PROBE_ACTION = 'probe_anonymous_protected_access'
const PROBE_CHECK = 'anonymous_protected_access_denied'
const STATE = 'probe'
const INSTANCE_ID = '00000000-0000-4000-8000-00000000c0de'
const DEF_ID = '00000000-0000-4000-8000-0000000000de'

const probeSpec = JSON.parse(readFileSync(
  join(process.cwd(), `lib/workflows/definitions/${PROBE_DEF_KEY}.v1.json`), 'utf8'))

const instance = {
  id: INSTANCE_ID, def_id: DEF_ID, def_key: PROBE_DEF_KEY, def_version: 1,
  def_hash: 'a'.repeat(64), project_id: '00000000-0000-4000-8000-0000000000b1',
  instance_key: 'capability-validation-1', current_state: STATE, status: 'active',
  wake_at: null, last_tick_at: null, last_tick_outcome: null,
  created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
}

const PIN = computeEvidenceTargetHash({
  instance: instance as never, spec: probeSpec, state: STATE,
  checkKey: PROBE_CHECK, sourceCommit: null, artifactManifestHash: null,
})

const RUN_CREATED = '2026-01-02T10:00:00.000Z'
const BEFORE_RUN  = '2026-01-02T09:00:00.000Z'
const AFTER_RUN   = '2026-01-02T11:00:00.000Z'

function prior(over: Partial<PriorObservation> = {}): PriorObservation {
  return {
    id: 'd28b6aa5-deb4-4ac0-ae2d-af27f98df657', status: 'done',
    attempts: 1, max_attempts: 5, created_at: RUN_CREATED,
    action_outcome: 'FAILED', reconciliation_required: false, ...over,
  }
}

// ── The pure classifier ─────────────────────────────────────────────────────

describe('identity-holding vs identity-released', () => {
  it('releases a terminal FAILED run once explicitly rescheduled', () => {
    const d = classifyPriorObservation(prior(), AFTER_RUN)
    expect(d.holds).toBe(false)
    expect(d.reason).toBe('terminal_prior_released')
  })

  it('MUTATION — attempts left do NOT make a done run retryable', () => {
    // The exact production shape: done / FAILED / 1 of 5. claim_runs only ever
    // claims `pending`, so "the drain will retry it" was never true.
    const d = classifyPriorObservation(prior({ attempts: 1, max_attempts: 5 }), AFTER_RUN)
    expect(d.holds).toBe(false)
    const ident = readFileSync(join(process.cwd(), 'lib/workflows/action-identity.ts'), 'utf8')
    expect(ident).not.toMatch(/run_retryable/)
  })

  it('a spent budget does not block a fresh observation either', () => {
    expect(classifyPriorObservation(prior({ attempts: 5, max_attempts: 5 }), AFTER_RUN).holds)
      .toBe(false)
  })

  for (const status of ['pending', 'running']) {
    it(`holds while a run is ${status}`, () => {
      const d = classifyPriorObservation(prior({ status, action_outcome: null }), AFTER_RUN)
      expect(d.holds).toBe(true)
      expect(d.reason).toBe('active_run_exists')
    })
  }

  it('holds a pending run whose budget is spent, distinctly', () => {
    const d = classifyPriorObservation(
      prior({ status: 'pending', action_outcome: null, attempts: 5, max_attempts: 5 }), AFTER_RUN)
    expect(d.holds).toBe(true)
    expect(d.reason).toBe('attempt_budget_spent')
  })

  for (const outcome of ['UNKNOWN', 'PARTIAL', 'SUCCEEDED_EVIDENCE_PENDING'] as ActionOutcome[]) {
    it(`MUTATION — ${outcome} keeps its identity even though the row looks finished`, () => {
      const d = classifyPriorObservation(
        prior({ status: 'partial', action_outcome: outcome }), AFTER_RUN)
      expect(d.holds).toBe(true)
      expect(d.reason).toBe('ambiguity_reconciliation_required')
    })
  }

  it('MUTATION — reconciliation_required cannot be bypassed by a terminal outcome', () => {
    const d = classifyPriorObservation(
      prior({ action_outcome: 'FAILED', reconciliation_required: true }), AFTER_RUN)
    expect(d.holds).toBe(true)
    expect(d.reason).toBe('ambiguity_reconciliation_required')
  })

  it('MUTATION — no ambiguous outcome may appear in the released set', () => {
    // Defence in depth. Today the ambiguity check runs first, so listing an
    // ambiguous outcome as released would be unreachable — but it would come
    // alive the moment those two blocks were reordered, and it would come alive
    // silently. Guard the constant, not just the behaviour.
    const ident = readFileSync(join(process.cwd(), 'lib/workflows/action-identity.ts'), 'utf8')
    const released = ident.slice(ident.indexOf('const RELEASED_OUTCOMES'),
                                 ident.indexOf('const ACTIVE_STATUSES'))
    for (const ambiguous of ['UNKNOWN', 'PARTIAL', 'SUCCEEDED_EVIDENCE_PENDING']) {
      expect(released).not.toContain(`'${ambiguous}'`)
    }
    expect(released).toContain("'FAILED'")
  })

  it('holds anything it does not recognise — fails closed, and says so', () => {
    const d = classifyPriorObservation(
      prior({ status: 'done', action_outcome: null }), AFTER_RUN)
    expect(d.holds).toBe(true)
    expect(d.reason).toBe('unclassified_prior_run')
  })

  it('every declared outcome is classified deliberately', () => {
    // No outcome may fall through by accident: each is either held or released,
    // and the ambiguous ones are held.
    for (const outcome of ACTION_OUTCOMES) {
      const d = classifyPriorObservation(prior({ action_outcome: outcome }), AFTER_RUN)
      const ambiguous = ['UNKNOWN', 'PARTIAL', 'SUCCEEDED_EVIDENCE_PENDING'].includes(outcome)
      expect(d.holds).toBe(ambiguous)
    }
  })
})

// ── Release is not permission to loop ───────────────────────────────────────

describe('a released identity is spent by a human, not by the machine', () => {
  it('holds when no schedule has ever happened', () => {
    const d = classifyPriorObservation(prior(), null)
    expect(d.holds).toBe(true)
    expect(d.reason).toBe('awaiting_explicit_schedule')
  })

  it('MUTATION — the schedule that produced the run cannot authorise its successor', () => {
    // This is the whole loop guard. The executor re-arms after every run, so if
    // an older schedule counted, one operator request would mint observations
    // forever.
    expect(classifyPriorObservation(prior(), BEFORE_RUN).reason).toBe('awaiting_explicit_schedule')
    expect(classifyPriorObservation(prior(), RUN_CREATED).reason).toBe('awaiting_explicit_schedule')
    expect(classifyPriorObservation(prior(), AFTER_RUN).reason).toBe('terminal_prior_released')
  })

  it('only the operator endpoint can write the marker it reads', () => {
    // scheduler.wake_scheduled comes from workflow_schedule_wake, and that RPC
    // is reachable from exactly one route action.
    const store = readFileSync(join(process.cwd(), 'lib/workflows/store.ts'), 'utf8')
    expect(store).toMatch(/rpc\('workflow_schedule_wake'/)
    const sched = readFileSync(join(process.cwd(), 'lib/workflows/action-scheduling.ts'), 'utf8')
    expect(sched).toMatch(/EXPLICIT_SCHEDULE_CHECK = 'scheduler\.wake_scheduled'/)
    // The executor must never arm its own successor.
    const exec = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    expect(exec).not.toMatch(/scheduleWorkflowWake|workflow_schedule_wake/)
    const tick = readFileSync(join(process.cwd(), 'lib/workflows/tick.ts'), 'utf8')
    expect(tick).not.toMatch(/scheduleWorkflowWake|workflow_schedule_wake/)
  })
})

// ── End to end through the seam ─────────────────────────────────────────────

interface Fx { evidence?: Record<string, unknown>[]; priorRuns?: Record<string, unknown>[] }

function makeDb(f: Fx = {}) {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const def = { id: DEF_ID, def_key: PROBE_DEF_KEY, version: 1,
    def_hash: instance.def_hash, spec: probeSpec, created_at: instance.created_at }
  const resolve = (q: Record<string, any>) => {
    if (q._insert) return { data: { id: 'run-created-1' }, error: null }
    switch (q._table) {
      case 'workflow_instances': return { data: instance, error: null }
      case 'projects': return { data: { execution_paused: false }, error: null }
      case 'workflow_defs': return { data: def, error: null }
      case 'workflow_evidence': return { data: f.evidence ?? [], error: null }
      case 'runs': return { data: f.priorRuns ?? [], error: null }
      default: return { data: null, error: null }
    }
  }
  const db = { inserted, from(table: string) {
    const q: Record<string, any> = { _table: table, _insert: null }
    const self = () => q
    q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self
    q.insert = (r: Record<string, unknown>) => { q._insert = r; inserted.push({ table, row: r }); return q }
    q.maybeSingle = async () => resolve(q)
    q.single = async () => resolve(q)
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(q)).then(ok, bad)
    return q
  } }
  return { db, inserted }
}

const evRow = (checkKey: string, result: string, targetHash: string | null, at: string) => ({
  id: `ev-${checkKey}-${at}`, instance_id: INSTANCE_ID, state: STATE, check_key: checkKey,
  result, source: 'automated', detail: {}, recorded_at: at, producer: null,
  producer_type: null, observed_at: null, payload_hash: null, target_hash: targetHash,
  attestation: {},
})
const scheduleRow = (at: string) => evRow('scheduler.wake_scheduled', 'pass', null, at)
const terminalRun = (over: Record<string, unknown> = {}) => ({
  id: 'd28b6aa5-deb4-4ac0-ae2d-af27f98df657', status: 'done', attempts: 1, max_attempts: 5,
  created_at: RUN_CREATED, action_outcome: 'FAILED', reconciliation_required: false, ...over,
})

describe('the seam, end to end', () => {
  it('the production shape: blocked run + explicit reschedule → a NEW run', async () => {
    const { db, inserted } = makeDb({
      evidence: [evRow(PROBE_CHECK, 'blocked', null, '2026-01-02T10:01:00.000Z'),
                 scheduleRow(AFTER_RUN)],
      priorRuns: [terminalRun()],
    })
    const [d] = await ensureReadOnlyActionRuns(db as never, instance as never)
    expect(d.outcome).toBe('created')
    expect(d.reasonCode).toBe('terminal_prior_released')
    expect(inserted.map(i => i.table)).toEqual(['runs'])
  })

  it('the new run gets a FRESH attempt_group and never reopens the old run', async () => {
    const { db, inserted } = makeDb({
      evidence: [scheduleRow(AFTER_RUN)], priorRuns: [terminalRun()],
    })
    await ensureReadOnlyActionRuns(db as never, instance as never)
    const written = inserted.find(i => i.table === 'runs')!.row
    expect(written.attempt_group).toMatch(/^[0-9a-f-]{36}$/)
    expect(written.attempts).toBeUndefined()      // a new run, not attempt 2
    // Nothing UPDATEs a run in the seam.
    const sched = readFileSync(join(process.cwd(), 'lib/workflows/action-scheduling.ts'), 'utf8')
    expect(sched).not.toMatch(/from\('runs'\)[\s\S]{0,120}\.update\(/)
  })

  it('MUTATION — the same tick repeated without a new schedule creates nothing', async () => {
    // The loop this PR must not introduce: run finishes, executor re-arms, tick
    // runs again. The last schedule is older than the run, so nothing happens.
    const fx: Fx = { evidence: [scheduleRow(BEFORE_RUN)], priorRuns: [terminalRun()] }
    for (let i = 0; i < 3; i++) {
      const { db, inserted } = makeDb(fx)
      const [d] = await ensureReadOnlyActionRuns(db as never, instance as never)
      expect(d.outcome).toBe('identity_held')
      expect(d.reasonCode).toBe('awaiting_explicit_schedule')
      expect(inserted).toHaveLength(0)
    }
  })

  it('one explicit schedule authorises at most one fresh run', async () => {
    // Once run 2 exists (created after the schedule), the same schedule can no
    // longer release it.
    const run2Created = '2026-01-02T11:30:00.000Z'
    const { db, inserted } = makeDb({
      evidence: [scheduleRow(AFTER_RUN)],
      priorRuns: [terminalRun({ id: 'run-2', created_at: run2Created })],
    })
    const [d] = await ensureReadOnlyActionRuns(db as never, instance as never)
    expect(d.outcome).toBe('identity_held')
    expect(d.reasonCode).toBe('awaiting_explicit_schedule')
    expect(inserted).toHaveLength(0)
  })

  for (const [label, over] of [
    ['UNKNOWN', { status: 'partial', action_outcome: 'UNKNOWN' }],
    ['PARTIAL', { status: 'partial', action_outcome: 'PARTIAL' }],
    ['reconciliation_required', { reconciliation_required: true }],
  ] as [string, Record<string, unknown>][]) {
    it(`MUTATION — ${label} is not duplicated even with a fresh schedule`, async () => {
      const { db, inserted } = makeDb({
        evidence: [scheduleRow(AFTER_RUN)], priorRuns: [terminalRun(over)],
      })
      const [d] = await ensureReadOnlyActionRuns(db as never, instance as never)
      expect(d.outcome).toBe('identity_held')
      expect(d.reasonCode).toBe('ambiguity_reconciliation_required')
      expect(inserted).toHaveLength(0)
    })
  }
})

// ── Satisfaction still wins ─────────────────────────────────────────────────

describe('a satisfied check is answered before any run is examined', () => {
  it('current bound PASS → already_satisfied, even with a terminal run and a schedule', async () => {
    const { db, inserted } = makeDb({
      evidence: [evRow(PROBE_CHECK, 'pass', PIN, '2026-01-02T10:01:00.000Z'),
                 scheduleRow(AFTER_RUN)],
      priorRuns: [terminalRun()],
    })
    const [d] = await ensureReadOnlyActionRuns(db as never, instance as never)
    expect(d.outcome).toBe('already_satisfied')
    expect(d.reasonCode).toBe('already_recorded_pass')
    expect(inserted).toHaveLength(0)
  })

  it('MUTATION — unbound PASS does not block a fresh observation', async () => {
    const { db } = makeDb({
      evidence: [evRow(PROBE_CHECK, 'pass', null, '2026-01-02T10:01:00.000Z'),
                 scheduleRow(AFTER_RUN)],
      priorRuns: [terminalRun()],
    })
    const [d] = await ensureReadOnlyActionRuns(db as never, instance as never)
    expect(d.outcome).toBe('created')
  })

  it('MUTATION — stale PASS does not block a fresh observation', async () => {
    const { db } = makeDb({
      evidence: [evRow(PROBE_CHECK, 'pass', 'b'.repeat(64), '2026-01-02T10:01:00.000Z'),
                 scheduleRow(AFTER_RUN)],
      priorRuns: [terminalRun()],
    })
    const [d] = await ensureReadOnlyActionRuns(db as never, instance as never)
    expect(d.outcome).toBe('created')
  })

  it('satisfaction is asked BEFORE the run lifecycle, not after', () => {
    const sched = readFileSync(join(process.cwd(), 'lib/workflows/action-scheduling.ts'), 'utf8')
    // Inside ensureOne only — the type declarations above mention both names.
    const fn = sched.slice(sched.indexOf('async function ensureOne('))
    expect(fn.indexOf("outcome: 'already_satisfied'"))
      .toBeLessThan(fn.indexOf('classifyPriorObservation(prior'))
    expect(fn.indexOf("outcome: 'already_satisfied'")).toBeGreaterThan(-1)
  })
})

// ── Observability ───────────────────────────────────────────────────────────

describe('the audit row says which of these happened', () => {
  it('every disposition has a distinct, bounded reason code', () => {
    const codes = new Set<string>()
    for (const [p, sched] of [
      [prior({ status: 'running', action_outcome: null }), AFTER_RUN],
      [prior({ status: 'pending', action_outcome: null, attempts: 5 }), AFTER_RUN],
      [prior({ action_outcome: 'UNKNOWN', status: 'partial' }), AFTER_RUN],
      [prior(), BEFORE_RUN],
      [prior({ action_outcome: null }), AFTER_RUN],
      [prior(), AFTER_RUN],
    ] as [PriorObservation, string][]) {
      codes.add(classifyPriorObservation(p, sched).reason)
    }
    expect([...codes].sort()).toEqual([
      'active_run_exists', 'ambiguity_reconciliation_required', 'attempt_budget_spent',
      'awaiting_explicit_schedule', 'terminal_prior_released', 'unclassified_prior_run',
    ])
  })

  it('MUTATION — no reason code carries free text or an exception', () => {
    const sched = readFileSync(join(process.cwd(), 'lib/workflows/action-scheduling.ts'), 'utf8')
    const proj = sched.slice(sched.indexOf('export function summarizeSchedulingDecision'))
    expect(proj).not.toMatch(/detail: d\.detail/)
    expect(proj).toMatch(/reason_code: d\.reasonCode/)
  })
})
