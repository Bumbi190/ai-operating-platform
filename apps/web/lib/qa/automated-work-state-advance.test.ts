/**
 * PR9i — crossing a state whose own work is finished.
 *
 * The gap this closes: `isAutoAdvanceable` is false whenever a state declares
 * work, and `advanceAuthorizedWorkflow` returns `not_gated` when there is no
 * human gate. An ungated work-bearing state therefore had no advance path at
 * all — no state in either shipped definition is `isAutoAdvanceable`, so that
 * path is unreachable in production.
 *
 * The two dangers this file is mostly about:
 *   • VACUOUS COMPLETION. `scheduled_release` declares work ("wait until the
 *     release instant") and declares NO required check, so "all required checks
 *     satisfied" is trivially true and it would advance past the release.
 *   • AUTHORITY CREEP. Completion authority must never become execution
 *     authority, and must never substitute for a human gate.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { advanceCompletedWorkflowState } from '../workflows/advance-completed'
import { computeEvidenceTargetHash } from '../workflows/attestation'
import { registeredActionsAt } from '../workflows/action-discovery'
import { findAdapter } from '../workflows/adapters/registry'
import { parseWorkflowSpec } from '../workflows/spec'

const FS = 'familje-stunden.monthly-release'
const PV = 'omnira.probe-validation'
const PROBE_CHECK = 'anonymous_protected_access_denied'
const INSTANCE_ID = '00000000-0000-4000-8000-00000000c0de'
const DEF_ID = '00000000-0000-4000-8000-0000000000de'

/**
 * Parsed, not raw. `workflow_defs.spec` stores the PARSED spec — `initial_state`
 * and the reachability chain are derived by `parseWorkflowSpec`, not present in
 * the JSON file. Feeding the raw file here would make every history look
 * malformed to `deriveCurrentState`.
 */
function loadSpec(defKey: string) {
  const raw = JSON.parse(readFileSync(
    join(process.cwd(), `lib/workflows/definitions/${defKey}.v1.json`), 'utf8'))
  const parsed = parseWorkflowSpec(raw)
  if (!parsed.ok) throw new Error(`${defKey} does not parse: ${parsed.errors.join('; ')}`)
  return parsed.spec
}
const spec: Record<string, ReturnType<typeof loadSpec>> = { [FS]: loadSpec(FS), [PV]: loadSpec(PV) }

/** A well-formed history: open at the entry state, then advance to `target`. */
function chainTo(defKey: string, target: string) {
  const s = spec[defKey]
  const out: Record<string, unknown>[] = []
  let seq = 1
  let cur: string | null = s.initial_state
  out.push({ id: 't1', seq: seq++, instance_id: INSTANCE_ID, from_state: null,
    to_state: cur, reason: 'open', actor: 'test', evidence_ref: null,
    authorization_id: null, occurred_at: '2026-01-01T00:00:00.000Z' })
  while (cur && cur !== target) {
    const st = s.states.find(x => x.id === cur)
    if (!st?.next_state) throw new Error(`no path from ${s.initial_state} to ${target}`)
    out.push({ id: `t${seq}`, seq, instance_id: INSTANCE_ID, from_state: cur,
      to_state: st.next_state, reason: 'advance', actor: 'test', evidence_ref: null,
      authorization_id: null, occurred_at: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z` })
    seq += 1
    cur = st.next_state
  }
  return out
}

function inst(defKey: string, state: string, over: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID, def_id: DEF_ID, def_key: defKey, def_version: 1,
    def_hash: 'a'.repeat(64), project_id: '00000000-0000-4000-8000-0000000000b1',
    instance_key: defKey === PV ? 'capability-validation-1' : '2099-01',
    current_state: state, status: 'active', wake_at: null, last_tick_at: null,
    last_tick_outcome: null, created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
    ...over,
  }
}

interface Fx {
  evidence?: Record<string, unknown>[]
  runs?: Record<string, unknown>[]
  transitions?: Record<string, unknown>[]
  paused?: boolean
  appendError?: Error
}

function makeDb(instance: Record<string, unknown>, defKey: string, f: Fx = {}) {
  const calls: { table: string; op: string; row?: Record<string, unknown> }[] = []
  const rpcs: { name: string; args: Record<string, unknown> }[] = []
  const def = { id: DEF_ID, def_key: defKey, version: 1,
    def_hash: instance.def_hash, spec: spec[defKey], created_at: instance.created_at }
  const transitions = f.transitions ?? chainTo(defKey, instance.current_state as string)
  const resolve = (q: Record<string, any>) => {
    if (q._insert) { calls.push({ table: q._table, op: 'insert', row: q._insert }); return { data: { id: 'x' }, error: null } }
    if (q._update) { calls.push({ table: q._table, op: 'update', row: q._update }); return { data: null, error: null } }
    switch (q._table) {
      case 'workflow_instances': return { data: instance, error: null }
      case 'projects': return { data: { execution_paused: f.paused ?? false }, error: null }
      case 'workflow_defs': return { data: def, error: null }
      case 'workflow_evidence': return { data: f.evidence ?? [], error: null }
      case 'workflow_transitions': return { data: transitions, error: null }
      case 'runs': return { data: f.runs ?? [], error: null }
      default: return { data: null, error: null }
    }
  }
  const db = {
    calls, rpcs,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args })
      if (f.appendError) return { data: null, error: { message: f.appendError.message } }
      return { data: { id: 'tr-2', seq: 2, instance_id: INSTANCE_ID,
        from_state: args.p_from_state, to_state: args.p_to_state, reason: args.p_reason,
        actor: args.p_actor, evidence_ref: null, authorization_id: args.p_authorization_id,
        occurred_at: '2026-01-03T00:00:00.000Z' }, error: null }
    },
    from(table: string) {
      const q: Record<string, any> = { _table: table, _insert: null, _update: null }
      const self = () => q
      q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self
      q.insert = (r: Record<string, unknown>) => { q._insert = r; return q }
      q.update = (r: Record<string, unknown>) => { q._update = r; return q }
      q.maybeSingle = async () => resolve(q)
      q.single = async () => resolve(q)
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(q)).then(ok, bad)
      return q
    },
  }
  return { db, calls, rpcs }
}

function pin(defKey: string, state: string, checkKey: string, meta: Record<string, string> = {}) {
  return computeEvidenceTargetHash({
    instance: inst(defKey, state) as never, spec: spec[defKey], state, checkKey,
    sourceCommit: meta.source_commit ?? null,
    artifactManifestHash: meta.artifact_manifest_hash ?? null,
  })
}

function ev(defKey: string, state: string, checkKey: string, result: string,
            over: Record<string, unknown> = {}) {
  const attestation = (over.attestation ?? {}) as Record<string, string>
  return {
    id: `ev-${checkKey}`, instance_id: INSTANCE_ID, state, check_key: checkKey, result,
    source: 'automated', detail: {}, recorded_at: '2026-01-02T00:00:00.000Z',
    producer: null, producer_type: null, observed_at: null, payload_hash: null,
    target_hash: pin(defKey, state, checkKey, attestation), attestation: {},
    ...over,
  }
}

const terminalRun = (over: Record<string, unknown> = {}) => ({
  id: 'run-1', status: 'done', attempts: 1, max_attempts: 5,
  created_at: '2026-01-02T00:00:00.000Z', action_outcome: 'SUCCEEDED',
  reconciliation_required: false, ...over,
})

/** The probe fixture in its production-equivalent, complete shape. */
function completeProbe(f: Fx = {}) {
  return makeDb(inst(PV, 'probe'), PV, {
    evidence: [ev(PV, 'probe', PROBE_CHECK, 'pass')],
    runs: [terminalRun()],
    ...f,
  })
}

// ── J. The probe: the production-safe validation case ──────────────────────

describe('J — omnira.probe-validation / probe', () => {
  it('advances exactly once, appending one transition with NO authorization', async () => {
    const { db, rpcs } = completeProbe()
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('advanced')
    expect(r.fromState).toBe('probe')
    expect(r.toState).toBe('complete')
    expect(r.reasonCode).toBeNull()
    const appends = rpcs.filter(c => c.name === 'workflow_append_transition')
    expect(appends).toHaveLength(1)
    expect(appends[0].args.p_authorization_id).toBeNull()
    expect(appends[0].args.p_from_state).toBe('probe')
    expect(appends[0].args.p_to_state).toBe('complete')
  })

  it('creates NO run and writes NO evidence — it only appends', async () => {
    const { db, calls } = completeProbe()
    await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(calls.filter(c => c.op === 'insert')).toHaveLength(0)
    expect(calls.filter(c => c.op === 'update')).toHaveLength(0)
  })

  it('needs no fresh observation — the existing bound PASS is the authority', async () => {
    // No new run is created, so nothing reaches the network.
    const { db, rpcs } = completeProbe()
    await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(rpcs.map(r => r.name)).toEqual(['workflow_append_transition'])
  })

  it('the probe state really is the shape this test assumes', () => {
    const s = spec[PV].states.find(x => x.id === 'probe')!
    expect(s).toBeDefined()
    expect(s.human_gate.required).toBe(false)
    expect(s.next_state).toBe('complete')
    expect(registeredActionsAt(PV, 'probe')).toEqual(['probe_anonymous_protected_access'])
    const req = findAdapter(PV)!.attestableChecks().filter(c => c.state === 'probe' && c.required)
    expect(req.map(c => c.check_key)).toEqual([PROBE_CHECK])
  })
})

// ── A. The zero-check fail-open, closed ────────────────────────────────────

describe('A — a state that cannot describe completion is never complete', () => {
  it('MUTATION — scheduled_release refuses with no_completion_criteria', async () => {
    // Its declared work is "wait until the release instant" and it declares no
    // check. Vacuous satisfaction would advance it past the release itself.
    const { db, rpcs } = makeDb(inst(FS, 'scheduled_release'), FS, { transitions: chainTo(FS, 'scheduled_release') })
    const r = await advanceCompletedWorkflowState(db as never, inst(FS, 'scheduled_release') as never)
    expect(r.outcome).toBe('no_completion_criteria')
    expect(rpcs).toHaveLength(0)
  })

  it('the fixture is real: scheduled_release declares work and zero checks', () => {
    const s = spec[FS].states.find(x => x.id === 'scheduled_release')!
    expect(s).toBeDefined()
    expect(s.human_gate.required).toBe(false)
    expect(s.automated_actions.length + s.verification.length).toBeGreaterThan(0)
    const req = findAdapter(FS)!.attestableChecks()
      .filter(c => c.state === 'scheduled_release' && c.required)
    expect(req).toHaveLength(0)
  })
})

// ── L. Human-gated states are refused, every one of them ───────────────────

describe('L — no human-gated state may be advanced by completion', () => {
  const gated = spec[FS].states
    .filter(s => s.human_gate.required === true && s.next_state !== null)
    .map(s => s.id)

  it('the definition really has 13 of them', () => {
    expect(gated).toHaveLength(13)
  })

  for (const state of gated) {
    it(`refuses ${state}`, async () => {
      const { db, rpcs } = makeDb(inst(FS, state), FS, { transitions: chainTo(FS, state) })
      const r = await advanceCompletedWorkflowState(db as never, inst(FS, state) as never)
      expect(r.outcome).toBe('human_gate_present')
      expect(rpcs).toHaveLength(0)
    })
  }
})

// ── M. Terminal states ─────────────────────────────────────────────────────

describe('M — terminal states go nowhere', () => {
  for (const [defKey, state] of [[FS, 'complete'], [PV, 'complete']] as [string, string][]) {
    it(`${defKey}/${state} refuses`, async () => {
      const { db, rpcs } = makeDb(inst(defKey, state), defKey, {
        transitions: chainTo(defKey, state),
      })
      const r = await advanceCompletedWorkflowState(db as never, inst(defKey, state) as never)
      expect(r.outcome).toBe('terminal_state')
      expect(rpcs).toHaveLength(0)
    })
  }
})

// ── G. Evidence: only canonical satisfaction advances ──────────────────────

describe('G — evidence semantics', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['unbound PASS',   { target_hash: null },            'required_evidence_incomplete'],
    ['stale PASS',     { target_hash: 'b'.repeat(64) },  'required_evidence_incomplete'],
    ['bound BLOCKED',  { result: 'blocked' },            'required_evidence_blocked'],
    ['bound FAIL',     { result: 'fail' },               'required_evidence_failed'],
    ['wrong provenance', { source: 'attested', producer: 'x', producer_type: 'ci',
                          payload_hash: 'c'.repeat(64) }, 'required_evidence_incomplete'],
  ]
  for (const [label, over, expected] of cases) {
    it(`${label} refuses with ${expected}`, async () => {
      const { db, rpcs } = completeProbe({
        evidence: [ev(PV, 'probe', PROBE_CHECK, 'pass', over)],
      })
      const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
      expect(r.outcome).toBe(expected)
      expect(r.blockingCheckKeys).toEqual([PROBE_CHECK])
      expect(rpcs).toHaveLength(0)
    })
  }

  it('missing evidence refuses', async () => {
    const { db, rpcs } = completeProbe({ evidence: [] })
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('required_evidence_incomplete')
    expect(rpcs).toHaveLength(0)
  })

  it('MUTATION — no raw column shortcut exists in the module', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/advance-completed.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const raw of [/\.result === 'pass'/, /\.eq\('result'/, /result:\s*'pass'/]) {
      expect(code).not.toMatch(raw)
    }
    expect(code).toMatch(/evidenceTargetHashFor\(instance, def\.spec, from, rows\)/)
  })
})

// ── C. Action lifecycle, via the PR9h-4 classifier ─────────────────────────

describe('C — declared work must be finished', () => {
  const blocking: [string, Record<string, unknown>, string][] = [
    ['pending',  { status: 'pending', action_outcome: null }, 'action_still_active'],
    ['running',  { status: 'running', action_outcome: null }, 'action_still_active'],
    ['UNKNOWN',  { status: 'partial', action_outcome: 'UNKNOWN' }, 'ambiguity_reconciliation_required'],
    ['PARTIAL',  { status: 'partial', action_outcome: 'PARTIAL' }, 'ambiguity_reconciliation_required'],
    ['SUCCEEDED_EVIDENCE_PENDING', { status: 'partial', action_outcome: 'SUCCEEDED_EVIDENCE_PENDING' },
      'ambiguity_reconciliation_required'],
    ['reconciliation_required', { reconciliation_required: true }, 'ambiguity_reconciliation_required'],
    ['unclassified', { status: 'done', action_outcome: null }, 'ambiguity_reconciliation_required'],
  ]
  for (const [label, over, expected] of blocking) {
    it(`${label} blocks the advance even with satisfying evidence`, async () => {
      const { db, rpcs } = completeProbe({ runs: [terminalRun(over)] })
      const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
      expect(r.outcome).toBe(expected)
      expect(rpcs).toHaveLength(0)
    })
  }

  it('terminal SUCCEEDED + current bound evidence permits the advance', async () => {
    const { db } = completeProbe({ runs: [terminalRun()] })
    expect((await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)).outcome)
      .toBe('advanced')
  })

  it('terminal FAILED + unsatisfied evidence gets its own reason code', async () => {
    const { db, rpcs } = completeProbe({
      runs: [terminalRun({ action_outcome: 'FAILED' })],
      evidence: [ev(PV, 'probe', PROBE_CHECK, 'blocked')],
    })
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('action_failed_without_satisfying_evidence')
    expect(rpcs).toHaveLength(0)
  })

  it('MUTATION — there is no second lifecycle classifier', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/advance-completed.ts'), 'utf8')
    expect(src).toMatch(/classifyPriorObservation\(prior, null\)/)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const reimpl of [/status === 'pending'/, /status === 'running'/,
                          /=== 'UNKNOWN'/, /=== 'PARTIAL'/]) {
      expect(code).not.toMatch(reimpl)
    }
  })
})

// ── D. Completion authority is not execution authority ─────────────────────

describe('D — this module can never perform work', () => {
  const src = readFileSync(join(process.cwd(), 'lib/workflows/advance-completed.ts'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('MUTATION — never reads automated_actions prose', () => {
    expect(code).not.toMatch(/automated_actions/)
    expect(code).not.toMatch(/\.verification\b/)
    expect(code).toMatch(/registeredActionsAt\(instance\.def_key, from\)/)
  })

  it('MUTATION — creates no run and calls no executor or provider', () => {
    for (const forbidden of [/createWorkflowActionRun/, /executeWorkflowAction/,
                             /from\('runs'\)[\s\S]{0,120}\.insert\(/, /fetch\(/,
                             /ensureReadOnlyActionRuns/]) {
      expect(code).not.toMatch(forbidden)
    }
  })

  it('MUTATION — never updates current_state directly', () => {
    expect(code).not.toMatch(/current_state\s*:/)
    expect(code).not.toMatch(/\.update\(/)
    expect(code).not.toMatch(/workflow_instances'\)[\s\S]{0,120}\.update/)
    // appendTransition is the ONLY mutation path.
    expect(code).toMatch(/await appendTransition\(db, \{/)
    expect((code.match(/appendTransition\(/g) ?? [])).toHaveLength(1)
  })

  it('edge_deploy, the ungated state whose prose is a deploy, cannot execute it', async () => {
    const { db, calls, rpcs } = makeDb(inst(FS, 'edge_deploy'), FS, { transitions: chainTo(FS, 'edge_deploy') })
    const r = await advanceCompletedWorkflowState(db as never, inst(FS, 'edge_deploy') as never)
    expect(r.outcome).toBe('required_evidence_incomplete')
    expect(calls.filter(c => c.op !== 'select')).toHaveLength(0)
    expect(rpcs).toHaveLength(0)
    // And no action is registered there, so nothing could have been run anyway.
    expect(registeredActionsAt(FS, 'edge_deploy')).toEqual([])
  })
})

// ── K. Familje-Stunden ungated states all park today ───────────────────────

describe('K — every ungated FS work state still parks', () => {
  const expected: Record<string, string> = {
    pdf_build: 'required_evidence_incomplete',
    ebook_build: 'required_evidence_incomplete',
    edge_deploy: 'required_evidence_incomplete',
    scheduled_release: 'no_completion_criteria',
    post_release_qa: 'required_evidence_incomplete',
  }
  for (const [state, outcome] of Object.entries(expected)) {
    it(`${state} → ${outcome}`, async () => {
      const { db, rpcs } = makeDb(inst(FS, state), FS, { transitions: chainTo(FS, state) })
      const r = await advanceCompletedWorkflowState(db as never, inst(FS, state) as never)
      expect(r.outcome).toBe(outcome)
      expect(rpcs).toHaveLength(0)
    })
  }

  it('PR9i does NOT make the real monthly release executable', () => {
    // Not one of the five has a registered action that could produce its checks.
    for (const state of Object.keys(expected)) {
      expect(registeredActionsAt(FS, state)).toEqual([])
    }
  })
})

// ── E/F. Transition authority and fencing ──────────────────────────────────

describe('E/F — the append, and the race', () => {
  it('passes authorizationId null — no human decision is invented', async () => {
    const { db, rpcs } = completeProbe()
    await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(rpcs[0].args.p_authorization_id).toBeNull()
  })

  it('CAS: the loser of a race appends nothing and fails closed', async () => {
    // The RPC compares stored current_state to p_from_state under FOR UPDATE and
    // raises serialization_failure. Simulated here; the SQL is asserted below.
    const { db, rpcs } = completeProbe({
      appendError: new Error('workflow_append_transition: stale transition — instance is "complete" not "probe"'),
    })
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.outcome).toBe('append_refused')
    expect(r.detail).toMatch(/stale transition/)
    expect(rpcs.filter(c => c.name === 'workflow_append_transition')).toHaveLength(1)
  })

  it('two concurrent advances produce exactly one transition', async () => {
    // Both reach the append; the second is refused by the CAS.
    let appended = 0
    const mk = () => {
      const { db } = completeProbe()
      const inner = db.rpc.bind(db)
      ;(db as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
        if (name === 'workflow_append_transition') {
          if (appended > 0) return { data: null, error: { message: 'stale transition' } }
          appended += 1
        }
        return inner(name, args)
      }
      return db
    }
    const [a, b] = await Promise.all([
      advanceCompletedWorkflowState(mk() as never, inst(PV, 'probe') as never),
      advanceCompletedWorkflowState(mk() as never, inst(PV, 'probe') as never),
    ])
    expect(appended).toBe(1)
    expect([a.outcome, b.outcome].filter(o => o === 'advanced')).toHaveLength(1)
    expect([a.outcome, b.outcome].filter(o => o === 'append_refused')).toHaveLength(1)
  })

  it('the SQL really is a locked compare-and-swap', () => {
    const sql = readFileSync(join(process.cwd(),
      'supabase/migrations/20260829_workflow_instance_core.sql'), 'utf8')
    expect(sql).toMatch(/from public\.workflow_instances where id = p_instance_id for update/)
    expect(sql).toMatch(/i\.current_state is distinct from p_from_state/)
    expect(sql).toMatch(/serialization_failure/)
  })

  it('SQL demands an authorization only for a GATED from-state', () => {
    const sql = readFileSync(join(process.cwd(),
      'supabase/migrations/20260829_workflow_gate_authorization.sql'), 'utf8')
    expect(sql).toMatch(/if gated and is_advance then/)
    // So a null authorization on an UNGATED state is accepted by design.
    expect(sql).toMatch(/gated\s*:?=\s*coalesce\(\(from_json -> 'human_gate' ->> 'required'\)/)
  })
})

// ── H. Eligibility guards and parking ──────────────────────────────────────

describe('H — eligibility and parking', () => {
  it('an inactive instance refuses', async () => {
    const i = inst(PV, 'probe', { status: 'closed' })
    const { db, rpcs } = makeDb(i, PV, { evidence: [ev(PV, 'probe', PROBE_CHECK, 'pass')] })
    expect((await advanceCompletedWorkflowState(db as never, i as never)).outcome)
      .toBe('inactive_instance')
    expect(rpcs).toHaveLength(0)
  })

  it('a paused project refuses', async () => {
    const { db, rpcs } = completeProbe({ paused: true })
    expect((await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)).outcome)
      .toBe('project_paused')
    expect(rpcs).toHaveLength(0)
  })

  it('verification findings can only refuse, never permit', async () => {
    const { db, rpcs } = completeProbe()
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never,
      { verificationFindings: ['something:fail'] })
    expect(r.outcome).toBe('adapter_verification_blocked')
    expect(rpcs).toHaveLength(0)
    // And an empty list grants nothing on its own — a refusing fixture still refuses.
    const blocked = completeProbe({ evidence: [] })
    expect((await advanceCompletedWorkflowState(blocked.db as never, inst(PV, 'probe') as never,
      { verificationFindings: [] })).outcome).toBe('required_evidence_incomplete')
  })

  it('MUTATION — no caller may supply a completion, gate or successor', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/advance-completed.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const f of [/options\.gateStatus/, /options\.complete/, /options\.toState/,
                     /options\.nextState/, /options\.evidence\b/, /options\.authorizationId/,
                     /\bforce\b\s*[:=]/]) {
      expect(code).not.toMatch(f)
    }
    const opts = code.slice(code.indexOf('options: {'), code.indexOf('} = {}') + 5)
    expect(opts.split(';').filter(x => x.includes('?:'))).toHaveLength(2)
  })

  it('reason codes are a closed, bounded vocabulary', async () => {
    const { db } = completeProbe({ evidence: [] })
    const r = await advanceCompletedWorkflowState(db as never, inst(PV, 'probe') as never)
    expect(r.blockingCheckKeys.length).toBeLessThanOrEqual(10)
    expect(typeof r.reasonCode).toBe('string')
  })
})

// ── I. Tick integration: delegation only ───────────────────────────────────

describe('I — the tick delegates and does not re-decide', () => {
  const tick = readFileSync(join(process.cwd(), 'lib/workflows/tick.ts'), 'utf8')
  const code = tick.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('calls the module and reimplements none of its clauses', () => {
    expect(code).toMatch(/advanceCompletedWorkflowState\(db, instance, \{/)
    // Completion clauses specifically. `human_gate.required` legitimately
    // appears in the tick to decide whether to DERIVE a gate at all — that is
    // gate evaluation, not a reimplementation of the completion contract.
    // Completion clauses specifically. `human_gate.required` and
    // `attestableChecks` legitimately appear in the tick for gate derivation and
    // its own evidence summary — both predate PR9i and are not the completion
    // contract. What must NOT appear is any clause this module owns.
    for (const clause of [/no_completion_criteria/, /classifyPriorObservation/,
                          /registeredActionsAt/, /checkPrerequisites/,
                          /required_evidence_/, /action_still_active/]) {
      expect(code).not.toMatch(clause)
    }
  })

  it('never runs both advance paths for the same tick', () => {
    expect(code).toMatch(/const advancedByGate = advance\?\.outcome === 'advanced'/)
    expect(code).toMatch(/if \(!advancedByGate && !createdAction/)
  })

  it('records a bounded completion outcome, never free text', () => {
    expect(code).toMatch(/completion_advance: completion/)
    expect(code).toMatch(/reason_code: completion\.reasonCode/)
    expect(code).not.toMatch(/detail: completion\.detail/)
  })

  it('a completed advance re-evaluates once rather than looping', () => {
    expect(code).toMatch(
      /\(advance\?\.outcome === 'advanced' \|\| completion\?\.outcome === 'advanced'\) \? now/)
  })
})
