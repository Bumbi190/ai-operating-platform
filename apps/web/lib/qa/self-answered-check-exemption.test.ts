/**
 * PR9h-2 — an action may not be gated on the observation it exists to make.
 *
 * PR9h deadlocked in production: `probe_anonymous_protected_access` answers
 * `anonymous_protected_access_denied`, that check is declared required, and the
 * pre-run evidence gate refused to create the run because the check had no
 * evidence — which only the run could have produced. No evidence ⇒ no run ⇒ no
 * evidence.
 *
 * The fix exempts exactly one check from the BLOCKING list: the one the
 * canonical mapping says this action answers. Everything else must still block,
 * and the exemption must not make the check look satisfied to anyone.
 *
 * These are behavioural tests against the real registry, the real adapters and
 * the real shipped definitions — not source-text assertions. `server-only` is
 * stubbed in vitest.config.ts, so the actual module is exercised. The mutation
 * tests at the end read source only where a behaviour cannot be observed from
 * the outside.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createWorkflowActionRun } from '../workflows/action-run'
import { checkAnsweredBy } from '../workflows/action-discovery'
import { summarizeSchedulingDecision } from '../workflows/action-scheduling'
import { findAdapter } from '../workflows/adapters/registry'
import { ACTION_REGISTRY } from '../workflows/action-registry'

const FS_DEF_KEY = 'familje-stunden.monthly-release'
const PROBE_DEF_KEY = 'omnira.probe-validation'
const PROBE_ACTION = 'probe_anonymous_protected_access'
const PROBE_CHECK = 'anonymous_protected_access_denied'

const defsDir = join(process.cwd(), 'lib/workflows/definitions')
const probeSpec = JSON.parse(readFileSync(join(defsDir, `${PROBE_DEF_KEY}.v1.json`), 'utf8'))
const fsSpec = JSON.parse(readFileSync(join(defsDir, `${FS_DEF_KEY}.v1.json`), 'utf8'))

// ── A fake Supabase client, chainable like the real one ─────────────────────

interface Fixture {
  defKey: string
  spec: unknown
  state: string
  evidence?: Record<string, unknown>[]
  priorRuns?: Record<string, unknown>[]
  status?: string
  executionPaused?: boolean
}

const INSTANCE_ID = '00000000-0000-4000-8000-00000000c0de'
const DEF_ID = '00000000-0000-4000-8000-0000000000de'

function fixtureInstance(defKey: string, state: string, status = 'active') {
  return {
    id: INSTANCE_ID, def_id: DEF_ID,
    def_key: defKey, def_version: 1, def_hash: 'a'.repeat(64),
    project_id: '00000000-0000-4000-8000-0000000000b1',
    instance_key: 'fixture-1', current_state: state, status,
    wake_at: null, last_tick_at: null, last_tick_outcome: null,
    created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
  }
}

/**
 * The EVIDENCE pin for one check.
 *
 * Not the action pin: PR9h-3 established that evidence is judged against the
 * `workflow.evidence` payload, which is per-check and does not include the
 * evidence rows — so it is stable, and a row can be stamped without moving what
 * it is judged against. The earlier version of this helper used the action
 * hash, which happened to agree with the pre-PR9h-3 gate and with nothing else.
 */
async function evidencePin(
  defKey: string, spec: unknown, state: string, checkKey: string,
): Promise<string> {
  const { computeEvidenceTargetHash } = await import('../workflows/attestation')
  return computeEvidenceTargetHash({
    instance: fixtureInstance(defKey, state) as never, spec: spec as never,
    state, checkKey, sourceCommit: null, artifactManifestHash: null,
  })
}

/** Evidence rows pinned to the target each of them is actually about. */
async function boundEvidence(
  defKey: string, spec: unknown, state: string, _actionKind: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  return Promise.all(rows.map(async r => ({
    ...r, target_hash: await evidencePin(defKey, spec, state, r.check_key as string),
  })))
}

function makeDb(f: Fixture) {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const instance = fixtureInstance(f.defKey, f.state, f.status ?? 'active')
  const def = {
    id: instance.def_id, def_key: f.defKey, version: 1,
    def_hash: instance.def_hash, spec: f.spec, created_at: instance.created_at,
  }
  const resolve = (q: Record<string, unknown>) => {
    if (q._insert) return { data: { id: 'run-created-1' }, error: null }
    switch (q._table) {
      case 'workflow_instances': return { data: instance, error: null }
      case 'projects': return { data: { execution_paused: f.executionPaused ?? false }, error: null }
      case 'workflow_defs': return { data: def, error: null }
      case 'workflow_evidence': return { data: f.evidence ?? [], error: null }
      case 'runs': return { data: f.priorRuns ?? [], error: null }
      default: return { data: null, error: null }
    }
  }
  const db = {
    inserted,
    from(table: string) {
      const q: Record<string, unknown> & Record<string, any> = { _table: table, _insert: null }
      const self = () => q
      q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self
      q.insert = (row: Record<string, unknown>) => { q._insert = row; inserted.push({ table, row }); return q }
      q.maybeSingle = async () => resolve(q)
      q.single = async () => resolve(q)
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(q)).then(ok, bad)
      return q
    },
  }
  return { db, inserted, instance }
}

/** One evidence row shaped like the store returns it. */
function evidenceRow(checkKey: string, state: string, result: string) {
  return {
    id: `ev-${checkKey}`, instance_id: INSTANCE_ID,
    state, check_key: checkKey, result, source: 'automated', detail: {},
    recorded_at: '2026-01-02T00:00:00.000Z', producer: null, producer_type: null,
    observed_at: null, payload_hash: null, target_hash: null, attestation: {},
  }
}

function requiredChecksAt(defKey: string, state: string): string[] {
  const adapter = findAdapter(defKey)
  return (adapter?.attestableChecks() ?? [])
    .filter(c => c.state === state && c.required).map(c => c.check_key).sort()
}

// ── The deadlock this PR exists to break ────────────────────────────────────

describe('C — the self-answered required check no longer blocks its own action', () => {
  it('declares the probe check as REQUIRED — the exemption is not a downgrade', () => {
    // If this ever reads false, the deadlock was "fixed" by weakening the
    // catalogue instead, which is exactly what PR9h-2 was told not to do.
    const check = findAdapter(PROBE_DEF_KEY)!.attestableChecks()
      .find(c => c.check_key === PROBE_CHECK && c.state === 'probe')
    expect(check).toBeDefined()
    expect(check!.required).toBe(true)
    expect(requiredChecksAt(PROBE_DEF_KEY, 'probe')).toEqual([PROBE_CHECK])
  })

  it('creates the run with NO evidence recorded at all', async () => {
    const { db } = makeDb({ defKey: PROBE_DEF_KEY, spec: probeSpec, state: 'probe' })
    const result = await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: PROBE_ACTION })
    expect(result.ok).toBe(true)
  })

  it('the exempted check is NOT marked satisfied — creation writes no evidence', async () => {
    const { db, inserted } = makeDb({ defKey: PROBE_DEF_KEY, spec: probeSpec, state: 'probe' })
    await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: PROBE_ACTION })
    // The ONLY table written is `runs`. No synthesized evidence, no transition.
    expect(inserted.map(i => i.table)).toEqual(['runs'])
    expect(inserted.some(i => i.table === 'workflow_evidence')).toBe(false)
    expect(inserted.some(i => i.table === 'workflow_transitions')).toBe(false)
  })

  it('the check remains unsatisfied afterwards — the verdict is untouched', async () => {
    const { db } = makeDb({ defKey: PROBE_DEF_KEY, spec: probeSpec, state: 'probe' })
    await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: PROBE_ACTION })
    const { summarizeStateEvidence } = await import('../workflows/evidence-consumption')
    const declared = findAdapter(PROBE_DEF_KEY)!.attestableChecks()
    // Same inputs the gate saw: still no evidence rows.
    const summary = summarizeStateEvidence(declared, 'probe', [], () => 'h'.repeat(64))
    expect(summary.satisfied).not.toContain(PROBE_CHECK)
    expect(summary.allSatisfied).toBe(false)
    const verdict = summary.verdicts.find(v => v.check_key === PROBE_CHECK)!
    expect(verdict.satisfies).toBe(false)
  })

  it('a recorded BLOCKED result — bound to the current target — still does not satisfy', async () => {
    // The expected PR9h outcome. Bound, current, and correctly NOT satisfying:
    // a blocked probe must never let a release gate through.
    const { summarizeStateEvidence } = await import('../workflows/evidence-consumption')
    const declared = findAdapter(PROBE_DEF_KEY)!.attestableChecks()
    const rows = await boundEvidence(PROBE_DEF_KEY, probeSpec, 'probe', PROBE_ACTION,
      [evidenceRow(PROBE_CHECK, 'probe', 'blocked')])
    const { evidenceTargetHashFor } = await import('../workflows/evidence-binding')
    const summary = summarizeStateEvidence(declared, 'probe', rows as never,
      evidenceTargetHashFor(fixtureInstance(PROBE_DEF_KEY, 'probe') as never,
        probeSpec as never, 'probe', rows as never))
    const verdict = summary.verdicts.find(v => v.check_key === PROBE_CHECK)!
    expect(verdict.binding).toBe('current')      // it really was judged, not skipped
    expect(verdict.satisfaction).toBe('blocked')
    expect(verdict.satisfies).toBe(false)
    expect(summary.allSatisfied).toBe(false)
  })

  it('a recorded PASS result — bound — does satisfy, so the fixture proves both ways', async () => {
    const { summarizeStateEvidence } = await import('../workflows/evidence-consumption')
    const declared = findAdapter(PROBE_DEF_KEY)!.attestableChecks()
    const rows = await boundEvidence(PROBE_DEF_KEY, probeSpec, 'probe', PROBE_ACTION,
      [evidenceRow(PROBE_CHECK, 'probe', 'pass')])
    const { evidenceTargetHashFor } = await import('../workflows/evidence-binding')
    const summary = summarizeStateEvidence(declared, 'probe', rows as never,
      evidenceTargetHashFor(fixtureInstance(PROBE_DEF_KEY, 'probe') as never,
        probeSpec as never, 'probe', rows as never))
    expect(summary.satisfied).toContain(PROBE_CHECK)
    expect(summary.allSatisfied).toBe(true)
  })

  it('a recorded FAIL result does not become pass', async () => {
    const { summarizeStateEvidence } = await import('../workflows/evidence-consumption')
    const declared = findAdapter(PROBE_DEF_KEY)!.attestableChecks()
    const rows = await boundEvidence(PROBE_DEF_KEY, probeSpec, 'probe', PROBE_ACTION,
      [evidenceRow(PROBE_CHECK, 'probe', 'fail')])
    const { evidenceTargetHashFor } = await import('../workflows/evidence-binding')
    const summary = summarizeStateEvidence(declared, 'probe', rows as never,
      evidenceTargetHashFor(fixtureInstance(PROBE_DEF_KEY, 'probe') as never,
        probeSpec as never, 'probe', rows as never))
    expect(summary.satisfied).not.toContain(PROBE_CHECK)
    expect(summary.failing).toContain(PROBE_CHECK)
  })
})

// ── D — unrelated required checks must still block. Mandatory. ──────────────

describe('D — an unrelated required check still refuses the run', () => {
  // Real production shape: familje-stunden/approval_release declares THREE
  // required checks, one of which the probe answers and two of which it does
  // not. This is the state the canonical release path actually reaches.
  const AT_APPROVAL = requiredChecksAt(FS_DEF_KEY, 'approval_release')

  it('the fixture state really does mix answered and unrelated required checks', () => {
    expect(AT_APPROVAL).toContain(PROBE_CHECK)
    expect(AT_APPROVAL.length).toBeGreaterThan(1)
  })

  it('refuses, and names ONLY the unrelated checks as blocking', async () => {
    const { db, inserted } = makeDb({ defKey: FS_DEF_KEY, spec: fsSpec, state: 'approval_release' })
    const result = await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: PROBE_ACTION })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal).toBe('evidence_not_satisfied')
    const expected = AT_APPROVAL.filter(k => k !== PROBE_CHECK)
    expect([...(result.blockingCheckKeys ?? [])]).toEqual(expected)
    // The self-answered check is exempt from BLOCKING, not from existing.
    expect(result.blockingCheckKeys).not.toContain(PROBE_CHECK)
    // And nothing was created.
    expect(inserted).toHaveLength(0)
  })

  it('reports EVERY unrelated required check, not just the first', async () => {
    const { db } = makeDb({ defKey: FS_DEF_KEY, spec: fsSpec, state: 'approval_release' })
    const result = await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: PROBE_ACTION })
    if (result.ok) throw new Error('expected refusal')
    expect(result.blockingCheckKeys!.length).toBe(AT_APPROVAL.length - 1)
  })

  it('creates the run once — and only once — the unrelated checks are satisfied', async () => {
    const satisfied = await boundEvidence(FS_DEF_KEY, fsSpec, 'approval_release', PROBE_ACTION,
      AT_APPROVAL.filter(k => k !== PROBE_CHECK).map(k => evidenceRow(k, 'approval_release', 'pass')))
    const { db } = makeDb({
      defKey: FS_DEF_KEY, spec: fsSpec, state: 'approval_release', evidence: satisfied,
    })
    const result = await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: PROBE_ACTION })
    // Its own check is still absent; the others now pass. This is the shape the
    // canonical release path reaches, so the deadlock is fixed there too.
    expect(result.ok).toBe(true)
  })

  it('MUTATION — one unsatisfied unrelated check is enough to refuse', async () => {
    const unrelated = AT_APPROVAL.filter(k => k !== PROBE_CHECK)
    // Satisfy all but the first.
    const partial = await boundEvidence(FS_DEF_KEY, fsSpec, 'approval_release', PROBE_ACTION,
      unrelated.slice(1).map(k => evidenceRow(k, 'approval_release', 'pass')))
    const { db } = makeDb({
      defKey: FS_DEF_KEY, spec: fsSpec, state: 'approval_release', evidence: partial,
    })
    const result = await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: PROBE_ACTION })
    if (result.ok) throw new Error('expected refusal')
    expect(result.blockingCheckKeys).toEqual([unrelated[0]])
  })
})

// ── The exemption is keyed by action kind and nothing else ──────────────────

describe('an action can exempt only its OWN check', () => {
  it('the canonical mapping is the only source', () => {
    expect(checkAnsweredBy(PROBE_ACTION)).toBe(PROBE_CHECK)
    expect(checkAnsweredBy('compute_release_instant')).toBe('release_instant_computed')
  })

  it('a DIFFERENT action cannot exempt the probe check', async () => {
    // compute_release_instant is a real registered action; the check it answers
    // is not this state's. It must be blocked by a check it does not answer.
    const { db } = makeDb({ defKey: PROBE_DEF_KEY, spec: probeSpec, state: 'probe' })
    const result = await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: 'compute_release_instant' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal).toBe('evidence_not_satisfied')
    expect(result.blockingCheckKeys).toEqual([PROBE_CHECK])
  })

  it('an unknown action kind exempts nothing and is refused before the gate', async () => {
    const { db } = makeDb({ defKey: PROBE_DEF_KEY, spec: probeSpec, state: 'probe' })
    const result = await createWorkflowActionRun(db as never,
      { instanceId: INSTANCE_ID, actionKind: 'not_a_real_action' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal).toBe('unknown_action_kind')
    expect(checkAnsweredBy('not_a_real_action')).toBeNull()
  })

  it('MUTATION — inherited object properties must not resolve to a check', () => {
    // A plain-object map would return Function for these, and `?? null` would
    // not catch it. The mapping is a Map precisely so they are null.
    for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
      expect(checkAnsweredBy(key)).toBeNull()
    }
  })

  it('MUTATION — an extra field on the input cannot buy an exemption', async () => {
    // The real attack shape: a caller that names the check it wants excused.
    // compute_release_instant does not answer the probe check, so if anything
    // in `input` could widen the exemption, this would be created.
    const { db, inserted } = makeDb({ defKey: PROBE_DEF_KEY, spec: probeSpec, state: 'probe' })
    const result = await createWorkflowActionRun(db as never, {
      instanceId: INSTANCE_ID, actionKind: 'compute_release_instant',
      exemptCheckKey: PROBE_CHECK, checkKey: PROBE_CHECK,
      blockingCheckKeys: [], requiredKeys: [], skipEvidence: true,
    } as never)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.refusal).toBe('evidence_not_satisfied')
    expect(result.blockingCheckKeys).toEqual([PROBE_CHECK])
    expect(inserted).toHaveLength(0)
  })

  it('MUTATION — the exemption cannot be supplied by the caller', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
    const gate = src.slice(src.indexOf('// 7) required evidence'), src.indexOf('// 8) a FINANCIAL'))
    // Exactly one source of the exemption, and it takes the action kind.
    expect(gate).toMatch(/checkAnsweredBy\(input\.actionKind\)/)
    expect(gate.match(/checkAnsweredBy\(/g)).toHaveLength(1)
    // `input` is read EXACTLY once in the whole gate, and that read is
    // actionKind. A cast such as `(input as {...}).exemptCheckKey` is caught by
    // this even though it does not literally spell `input.exempt`.
    const inputReads = gate.match(/\binput\b/g) ?? []
    expect(inputReads).toHaveLength(1)
    expect(gate).toMatch(/checkAnsweredBy\(input\.actionKind\)/)
  })

  it('MUTATION — exempting every check would make the gate dead code', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
    const gate = src.slice(src.indexOf('// 7) required evidence'), src.indexOf('// 8) a FINANCIAL'))
    // The blocking list is unmet MINUS the single self-answered key, and the
    // refusal is still driven by it being non-empty.
    expect(gate).toMatch(/const blocking = unmet\.filter\(v => v\.check_key !== selfAnswered\)/)
    expect(gate).toMatch(/if \(blocking\.length > 0\)/)
    // Never a blanket bypass.
    expect(gate).not.toMatch(/unmet\s*=\s*\[\]/)
    expect(gate).not.toMatch(/requiredKeys\s*=\s*new Set\(\)/)
  })

  it('MUTATION — the exempted check is never written as pass', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
    expect(src).not.toMatch(/from\('workflow_evidence'\)/)
    expect(src).not.toMatch(/recordEvidence|record_evidence/)
    expect(src).not.toMatch(/result:\s*'pass'/)
  })
})

// ── Safety: nothing else about binding changed ──────────────────────────────

describe('no other gate moved', () => {
  const src = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')

  it('authorization is still demanded by policy, unchanged', () => {
    expect(src).toMatch(/if \(policy\.requiresAuthorization\) \{/)
    expect(src).toMatch(/assertWorkflowAuthorizationValid\(db, instance\.id, input\.authorizationId\)/)
    expect(src).toMatch(/refusal: 'target_hash_mismatch'/)
    // The exemption lives after authorization, so it cannot influence it.
    expect(src.indexOf('requiresAuthorization')).toBeLessThan(src.indexOf('selfAnswered'))
  })

  it('spend enforcement is still demanded, unchanged', () => {
    expect(src).toMatch(/if \(policy\.requiresSpendEnforcement && !isSpendGateEnforced\(\)\)/)
    expect(src).toMatch(/refusal: 'spend_enforcement_required'/)
  })

  it('the class is still derived from the registry, never from the caller', () => {
    expect(src).toMatch(/const canonical = lookupAction\(input\.actionKind\)/)
    expect(src).toMatch(/const actionClass: ActionClass = canonical\.action_class/)
    expect(src).not.toMatch(/input\.actionClass/)
  })

  it('TRIPWIRE — every action that can claim an exemption is READ_ONLY', () => {
    // Not a prohibition on ever mapping a write, but a deliberate stop: the
    // exemption would then apply to a write, and that deserves its own review
    // rather than arriving as a silent consequence of an unrelated edit.
    for (const kind of ['compute_release_instant', PROBE_ACTION]) {
      expect(checkAnsweredBy(kind)).not.toBeNull()
      expect(ACTION_REGISTRY[kind as keyof typeof ACTION_REGISTRY].action_class).toBe('READ_ONLY')
    }
    const mapped = Object.keys(ACTION_REGISTRY).filter(k => checkAnsweredBy(k) !== null)
    expect(mapped.sort()).toEqual(['compute_release_instant', PROBE_ACTION].sort())
  })

  it('no write-capable action became executable', async () => {
    const executor = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    const handlers = executor.slice(executor.indexOf('HANDLERS'))
    for (const writeKind of ['upload', 'deploy', 'publish', 'send', 'delete', 'purchase']) {
      expect(handlers.slice(0, 400)).not.toMatch(new RegExp(`${writeKind}\\w*:\\s*\\w`))
    }
  })

  it('binding still performs no transition', () => {
    expect(src).not.toMatch(/appendTransition|workflow_append_transition|advanceAuthorizedWorkflow/)
  })
})

// ── E — the refusal is legible from the audit row alone ─────────────────────

describe('E — refusal detail is persisted, bounded and safe', () => {
  const base = {
    actionKind: PROBE_ACTION, outcome: 'refused' as const, stage: 'binding' as const,
    reasonCode: 'evidence_not_satisfied' as const,
    blockingCheckKeys: ['b_check', 'a_check'],
    detail: 'evidence_not_satisfied: 2 required check(s) not satisfied',
  }

  it('persists reason_code, blocking_check_keys, action kind and stage', () => {
    const out = summarizeSchedulingDecision(base)
    expect(out.reason_code).toBe('evidence_not_satisfied')
    expect(out.blocking_check_keys).toEqual(['b_check', 'a_check'])
    expect(out.kind).toBe(PROBE_ACTION)
    expect(out.stage).toBe('binding')
    expect(out.outcome).toBe('refused')
  })

  it('MUTATION — free-text detail is NEVER persisted', () => {
    const out = summarizeSchedulingDecision({
      ...base, detail: 'Bearer sk-live-SECRET at /Users/x/app.ts:1:1\n  at Object.<anonymous>',
    })
    expect(Object.keys(out).sort()).toEqual(
      ['blocking_check_keys', 'kind', 'outcome', 'reason_code', 'stage'])
    expect(JSON.stringify(out)).not.toContain('SECRET')
    expect(JSON.stringify(out)).not.toContain('Bearer')
    expect(JSON.stringify(out)).not.toContain('at Object')
    expect('detail' in out).toBe(false)
  })

  it('bounds the number of keys and the length of each', () => {
    const out = summarizeSchedulingDecision({
      ...base,
      blockingCheckKeys: Array.from({ length: 50 }, (_, i) => `k${i}`.padEnd(500, 'x')),
    })
    expect(out.blocking_check_keys).toHaveLength(10)
    for (const k of out.blocking_check_keys) expect(k.length).toBeLessThanOrEqual(80)
    expect(JSON.stringify(out).length).toBeLessThan(1200)
  })

  it('a successful scheduling row stays valid and carries no refusal', () => {
    const out = summarizeSchedulingDecision({
      actionKind: PROBE_ACTION, outcome: 'created', stage: 'binding',
      reasonCode: null, blockingCheckKeys: [], detail: 'bound run created',
    })
    expect(out.outcome).toBe('created')
    expect(out.reason_code).toBeNull()
    expect(out.blocking_check_keys).toEqual([])
  })

  it('MUTATION — the tick must not go back to dropping the reason', () => {
    const tick = readFileSync(join(process.cwd(), 'lib/workflows/tick.ts'), 'utf8')
    expect(tick).toMatch(/scheduled_actions: scheduled\.map\(summarizeSchedulingDecision\)/)
    // The shape PR9h shipped, which is what made the production refusal opaque.
    expect(tick).not.toMatch(/\{ kind: d\.actionKind, outcome: d\.outcome \}/)
  })

  it('every scheduling decision carries a stage and a reason code', () => {
    const sched = readFileSync(join(process.cwd(), 'lib/workflows/action-scheduling.ts'), 'utf8')
    const returns = sched.match(/outcome: '(created|already_satisfied|already_scheduled|identity_held|attempts_exhausted|no_action_declared|refused)'/g) ?? []
    expect(returns.length).toBeGreaterThanOrEqual(7)
    // Every return site names both fields; count them rather than trusting review.
    expect((sched.match(/stage: '/g) ?? []).length).toBeGreaterThanOrEqual(returns.length)
    expect((sched.match(/reasonCode:/g) ?? []).length).toBeGreaterThanOrEqual(returns.length)
  })

  it('blocking keys reaching the row come from the adapter catalogue, not the caller', () => {
    const sched = readFileSync(join(process.cwd(), 'lib/workflows/action-scheduling.ts'), 'utf8')
    expect(sched).toMatch(/blockingCheckKeys: created\.blockingCheckKeys \?\? \[\]/)
    const run = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
    expect(run).toMatch(/const blockingCheckKeys = blocking\.map\(v => v\.check_key\)\.sort\(\)/)
  })
})
