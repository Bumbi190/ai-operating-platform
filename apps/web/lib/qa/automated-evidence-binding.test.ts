/**
 * PR9h-3 — automated observations must be pinned to what they are about.
 *
 * The executor wrote its evidence with `target_hash = NULL`. `evaluateCheck`
 * requires `binding === 'current'`, so an unbound row satisfies nothing — a real
 * PASS would have been recorded, counted by the scheduler's raw `result='pass'`
 * query as "already satisfied", and then never satisfied anything. The workflow
 * would have parked forever on a passing observation.
 *
 * Two pins exist and they are not interchangeable:
 *   `workflow.evidence`  per check, stable — what evidence is about
 *   `workflow.action`    includes the evidence rows — what an action may do
 * Pinning evidence to a run's action hash would be wrong twice: wrong kind, and
 * self-invalidating the moment the row is appended. These tests pin the
 * distinction so it cannot be "simplified" away.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { recordEvidence } from '../workflows/store'
import { ensureReadOnlyActionRuns } from '../workflows/action-scheduling'
import { summarizeStateEvidence } from '../workflows/evidence-consumption'
import { computeEvidenceTargetHash } from '../workflows/attestation'
import { evidenceTargetHashFor } from '../workflows/evidence-binding'
import { findAdapter } from '../workflows/adapters/registry'

const PROBE_DEF_KEY = 'omnira.probe-validation'
const PROBE_ACTION = 'probe_anonymous_protected_access'
const PROBE_CHECK = 'anonymous_protected_access_denied'
const STATE = 'probe'

const INSTANCE_ID = '00000000-0000-4000-8000-00000000c0de'
const DEF_ID = '00000000-0000-4000-8000-0000000000de'
const RUN_ID = '00000000-0000-4000-8000-0000000000f1'

const probeSpec = JSON.parse(readFileSync(
  join(process.cwd(), `lib/workflows/definitions/${PROBE_DEF_KEY}.v1.json`), 'utf8'))

const instance = {
  id: INSTANCE_ID, def_id: DEF_ID, def_key: PROBE_DEF_KEY, def_version: 1,
  def_hash: 'a'.repeat(64), project_id: '00000000-0000-4000-8000-0000000000b1',
  instance_key: 'capability-validation-1', current_state: STATE, status: 'active',
  wake_at: null, last_tick_at: null, last_tick_outcome: null,
  created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
}

/** The pin a correctly-bound observation must carry. */
const CORRECT_PIN = computeEvidenceTargetHash({
  instance: instance as never, spec: probeSpec, state: STATE,
  checkKey: PROBE_CHECK, sourceCommit: null, artifactManifestHash: null,
})

interface DbOptions {
  run?: Record<string, unknown> | null
  evidence?: Record<string, unknown>[]
  priorRuns?: Record<string, unknown>[]
}

function makeDb(o: DbOptions = {}) {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const def = {
    id: DEF_ID, def_key: PROBE_DEF_KEY, version: 1,
    def_hash: instance.def_hash, spec: probeSpec, created_at: instance.created_at,
  }
  const defaultRun = {
    workflow_instance_id: INSTANCE_ID, workflow_from_state: STATE,
    action_kind: PROBE_ACTION, target_version_hash: 'f'.repeat(64),
  }
  const run = o.run === undefined ? defaultRun : o.run
  const resolve = (q: Record<string, any>) => {
    if (q._insert) {
      return { data: { ...q._insert, id: 'ev-new', recorded_at: '2026-01-03T00:00:00.000Z' }, error: null }
    }
    switch (q._table) {
      case 'workflow_instances': return { data: instance, error: null }
      case 'projects': return { data: { execution_paused: false }, error: null }
      case 'workflow_defs': return { data: def, error: null }
      case 'workflow_evidence': return { data: o.evidence ?? [], error: null }
      case 'runs': return { data: q._single ? run : (o.priorRuns ?? []), error: null }
      default: return { data: null, error: null }
    }
  }
  const db = {
    inserted,
    from(table: string) {
      const q: Record<string, any> = { _table: table, _insert: null, _single: false }
      const self = () => q
      q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self
      q.insert = (row: Record<string, unknown>) => {
        q._insert = row; inserted.push({ table, row }); return q
      }
      q.maybeSingle = async () => { q._single = true; return resolve(q) }
      q.single = async () => { q._single = true; return resolve(q) }
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(q)).then(ok, bad)
      return q
    },
  }
  return { db, inserted }
}

function row(result: string, targetHash: string | null, checkKey = PROBE_CHECK) {
  return {
    id: `ev-${checkKey}-${result}`, instance_id: INSTANCE_ID, state: STATE,
    check_key: checkKey, result, source: 'automated', detail: {},
    recorded_at: '2026-01-02T00:00:00.000Z', producer: null, producer_type: null,
    observed_at: null, payload_hash: null, target_hash: targetHash, attestation: {},
  }
}

const declared = () => findAdapter(PROBE_DEF_KEY)!.attestableChecks()

function verdictFor(rows: Record<string, unknown>[]) {
  return summarizeStateEvidence(declared(), STATE, rows as never,
    evidenceTargetHashFor(instance as never, probeSpec, STATE, rows as never))
    .verdicts.find(v => v.check_key === PROBE_CHECK)!
}

// ── Automated binding ───────────────────────────────────────────────────────

describe('an automated observation is pinned from its bound run', () => {
  const observation = { instanceId: INSTANCE_ID, state: STATE, checkKey: PROBE_CHECK,
    result: 'blocked' as const, source: 'automated' as const, observation: { runId: RUN_ID } }

  it('writes the evidence pin, and it is the one the readers recompute', async () => {
    const { db, inserted } = makeDb()
    await recordEvidence(db as never, observation)
    const written = inserted.find(i => i.table === 'workflow_evidence')!.row
    expect(written.target_hash).toBe(CORRECT_PIN)
    expect(written.target_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is NOT the run action hash — a different kind of pin entirely', async () => {
    const { db, inserted } = makeDb()
    await recordEvidence(db as never, observation)
    const written = inserted.find(i => i.table === 'workflow_evidence')!.row
    // The fixture run carries ffff… as its action hash. Nothing may copy it.
    expect(written.target_hash).not.toBe('f'.repeat(64))
  })

  it('stays automated and never becomes attested', async () => {
    const { db, inserted } = makeDb()
    await recordEvidence(db as never, observation)
    const written = inserted.find(i => i.table === 'workflow_evidence')!.row
    expect(written.source).toBe('automated')
    expect(written.producer).toBeNull()
    expect(written.producer_type).toBeNull()
    expect(written.payload_hash).toBeNull()
    expect(written.attestation).toEqual({})
  })

  it('MUTATION — a caller-supplied hash is impossible, not merely ignored', async () => {
    const { db, inserted } = makeDb()
    await recordEvidence(db as never, {
      ...observation,
      observation: { runId: RUN_ID, targetHash: 'e'.repeat(64) },
    } as never)
    const written = inserted.find(i => i.table === 'workflow_evidence')!.row
    expect(written.target_hash).toBe(CORRECT_PIN)
    expect(written.target_hash).not.toBe('e'.repeat(64))
    // And the type carries no such field at all.
    const src = readFileSync(join(process.cwd(), 'lib/workflows/store.ts'), 'utf8')
    const iface = src.slice(src.indexOf('export interface RecordEvidenceInput'),
                            src.indexOf('* Append one verification record'))
    const obs = iface.slice(iface.indexOf('observation?:'))
    expect(obs).not.toMatch(/targetHash/)
    expect(obs).toMatch(/runId: string/)
  })

  it('refuses a run bound to a different instance', async () => {
    const { db } = makeDb({ run: { workflow_instance_id: 'someone-else',
      workflow_from_state: STATE, action_kind: PROBE_ACTION, target_version_hash: 'f'.repeat(64) } })
    await expect(recordEvidence(db as never, observation)).rejects.toThrow(/different workflow instance/)
  })

  it('refuses a run bound to a different state', async () => {
    const { db } = makeDb({ run: { workflow_instance_id: INSTANCE_ID,
      workflow_from_state: 'complete', action_kind: PROBE_ACTION, target_version_hash: 'f'.repeat(64) } })
    await expect(recordEvidence(db as never, observation)).rejects.toThrow(/different workflow state/)
  })

  it('refuses a run whose action does not answer this check', async () => {
    const { db } = makeDb({ run: { workflow_instance_id: INSTANCE_ID,
      workflow_from_state: STATE, action_kind: 'compute_release_instant',
      target_version_hash: 'f'.repeat(64) } })
    await expect(recordEvidence(db as never, observation)).rejects.toThrow(/does not answer/)
  })

  it('refuses a run with no action binding, and an unknown run', async () => {
    const unbound = makeDb({ run: { workflow_instance_id: INSTANCE_ID,
      workflow_from_state: STATE, action_kind: PROBE_ACTION, target_version_hash: null } })
    await expect(recordEvidence(unbound.db as never, observation)).rejects.toThrow(/no action binding/)
    const missing = makeDb({ run: null })
    await expect(recordEvidence(missing.db as never, observation)).rejects.toThrow(/no such action run/)
  })

  it('the executor passes the run and nothing else', () => {
    const exec = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    expect(exec).toMatch(/observation: \{ runId: run\.id \}/)
    // MUTATION — never from handler output, never from the provider.
    expect(exec).not.toMatch(/observation: \{[^}]*output\./)
    expect(exec).not.toMatch(/targetHash: output/)
    expect(exec).toMatch(/source: 'automated'/)
  })
})

// ── Satisfaction semantics (unchanged rules, now reachable) ────────────────

describe('satisfaction rules are unchanged', () => {
  it('bound PASS satisfies', () => {
    const v = verdictFor([row('pass', CORRECT_PIN)])
    expect(v.binding).toBe('current')
    expect(v.satisfies).toBe(true)
  })

  it('bound BLOCKED does not satisfy', () => {
    const v = verdictFor([row('blocked', CORRECT_PIN)])
    expect(v.binding).toBe('current')
    expect(v.satisfaction).toBe('blocked')
    expect(v.satisfies).toBe(false)
  })

  it('bound FAIL does not satisfy', () => {
    const v = verdictFor([row('fail', CORRECT_PIN)])
    expect(v.binding).toBe('current')
    expect(v.satisfaction).toBe('failed')
    expect(v.satisfies).toBe(false)
  })

  it('unbound PASS does not satisfy', () => {
    const v = verdictFor([row('pass', null)])
    expect(v.satisfaction).toBe('unbound')
    expect(v.satisfies).toBe(false)
  })

  it('stale-hash PASS does not satisfy', () => {
    const v = verdictFor([row('pass', 'b'.repeat(64))])
    expect(v.satisfaction).toBe('stale')
    expect(v.satisfies).toBe(false)
  })
})

// ── Scheduler ───────────────────────────────────────────────────────────────

describe('the seam asks the canonical question', () => {
  const schedule = (evidence: Record<string, unknown>[], priorRuns: Record<string, unknown>[] = []) =>
    ensureReadOnlyActionRuns(makeDb({ evidence, priorRuns }).db as never, instance as never)

  it('unbound PASS does NOT count as already_satisfied', async () => {
    const [d] = await schedule([row('pass', null)])
    expect(d.outcome).toBe('created')
  })

  it('stale PASS does NOT count as already_satisfied', async () => {
    const [d] = await schedule([row('pass', 'b'.repeat(64))])
    expect(d.outcome).toBe('created')
  })

  it('current bound PASS DOES count as already_satisfied', async () => {
    const [d] = await schedule([row('pass', CORRECT_PIN)])
    expect(d.outcome).toBe('already_satisfied')
    expect(d.reasonCode).toBe('already_recorded_pass')
  })

  it('blocked evidence permits a new observation', async () => {
    const [d] = await schedule([row('blocked', CORRECT_PIN)])
    expect(d.outcome).toBe('created')
  })

  it('no duplicate run while a matching run is open', async () => {
    const [d] = await schedule([row('blocked', CORRECT_PIN)],
      [{ id: RUN_ID, status: 'running', attempts: 1, max_attempts: 5,
         created_at: '2026-01-02T00:00:00.000Z', action_outcome: null,
         reconciliation_required: false }])
    expect(d.outcome).toBe('already_scheduled')
    expect(d.reasonCode).toBe('active_run_exists')
  })
})

// ── Legacy and attestation ──────────────────────────────────────────────────

describe('nothing historical is rewritten', () => {
  it('MUTATION — no migration touches existing evidence', () => {
    const dir = join(process.cwd(), 'supabase/migrations')
    for (const f of readdirSync(dir).filter(f => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '')
      expect(sql).not.toMatch(/update\s+public\.workflow_evidence\s+set/i)
      expect(sql).not.toMatch(/delete\s+from\s+public\.workflow_evidence/i)
    }
  })

  it('evidence is append-only in the database, so a pin cannot be edited later', () => {
    const core = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260829_workflow_instance_core.sql'), 'utf8')
    expect(core).toMatch(/create trigger workflow_evidence_no_update/)
    expect(core).toMatch(/create trigger workflow_evidence_no_delete/)
  })

  it('no code path updates an evidence row', () => {
    for (const f of ['lib/workflows/store.ts', 'lib/workflows/action-executor.ts',
                     'lib/workflows/action-scheduling.ts', 'lib/workflows/tick.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src).not.toMatch(/from\('workflow_evidence'\)[\s\S]{0,80}\.update\(/)
    }
  })
})

describe('attestation stays exactly as it was', () => {
  const attestation = {
    producer: 'ci', producerType: 'ci', observedAt: '2026-01-02T00:00:00.000Z',
    payloadHash: 'c'.repeat(64), targetHash: 'd'.repeat(64), metadata: { source_commit: 'abc' },
  }

  it('an attested row still binds through its envelope', async () => {
    const { db, inserted } = makeDb()
    await recordEvidence(db as never, {
      instanceId: INSTANCE_ID, state: STATE, checkKey: PROBE_CHECK,
      result: 'pass', source: 'attested', attestation,
    } as never)
    const written = inserted.find(i => i.table === 'workflow_evidence')!.row
    expect(written.target_hash).toBe('d'.repeat(64))
    expect(written.producer).toBe('ci')
    expect(written.payload_hash).toBe('c'.repeat(64))
  })

  it('MUTATION — an observation cannot claim attested provenance', async () => {
    const base = { instanceId: INSTANCE_ID, state: STATE, checkKey: PROBE_CHECK, result: 'pass' as const }
    await expect(recordEvidence(makeDb().db as never,
      { ...base, source: 'attested', observation: { runId: RUN_ID } } as never))
      .rejects.toThrow(/only valid for automated/)
    await expect(recordEvidence(makeDb().db as never,
      { ...base, source: 'automated', observation: { runId: RUN_ID }, attestation } as never))
      .rejects.toThrow(/both an observation and an attestation/)
    await expect(recordEvidence(makeDb().db as never,
      { ...base, source: 'automated', attestation } as never))
      .rejects.toThrow(/must not carry an attestation envelope/)
  })

  it('no authorization or human identity is synthesized anywhere on this path', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/store.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function recordEvidence'),
                         src.indexOf('/** Evidence for one instance'))
    expect(fn).not.toMatch(/atlas_authorizations|authorization_id|actor|granted_by/)
    expect(fn).toMatch(/observationTargetHash = automatedObservationTargetHash\(/)
  })
})

// ── The two pins must not be confused again ────────────────────────────────

describe('MUTATION — the evidence pin and the action pin stay distinct', () => {
  it('the evidence payload does not include evidence rows', async () => {
    const { evidenceTargetPayload } = await import('../workflows/attestation')
    const payload = evidenceTargetPayload({
      instance: instance as never, spec: probeSpec, state: STATE,
      checkKey: PROBE_CHECK, sourceCommit: null, artifactManifestHash: null,
    })
    expect(payload.kind).toBe('workflow.evidence')
    expect(payload).not.toHaveProperty('evidence')
    // Stable: appending a row must not move it.
    expect(computeEvidenceTargetHash({
      instance: instance as never, spec: probeSpec, state: STATE,
      checkKey: PROBE_CHECK, sourceCommit: null, artifactManifestHash: null,
    })).toBe(CORRECT_PIN)
  })

  it('the three readers all use the shared pin, not the action hash', () => {
    for (const f of ['lib/workflows/tick.ts', 'lib/workflows/action-run.ts',
                     'lib/workflows/action-scheduling.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src).toMatch(/evidenceTargetHashFor\(/)
    }
    const run = readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')
    const gate = run.slice(run.indexOf('// 7) required evidence'), run.indexOf('// 8) a FINANCIAL'))
    expect(gate).not.toMatch(/\(\) => target\.versionHash/)
  })

  it('a future compute_release_instant would bind the same way', () => {
    // PR9E regression: the historical release_instant_computed row stays
    // unbound, but nothing about the write path is action-kind specific.
    const exec = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    const start = exec.indexOf('await recordEvidence(')
    const write = exec.slice(start, exec.indexOf('} catch', start))
    expect(write).toMatch(/checkKey: output\.checkKey/)
    expect(write).toMatch(/observation: \{ runId: run\.id \}/)
    expect(write).not.toMatch(/compute_release_instant|probe_anonymous/)
  })
})
