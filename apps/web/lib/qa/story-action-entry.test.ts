import { afterEach, describe, expect, it, vi } from 'vitest'
import { findVendoredDefinition } from '../workflows/definitions'
import { createWorkflowActionRun, assertWorkflowActionReady } from '../workflows/action-run'
import { computeWorkflowActionTarget } from '../workflows/action-target'
import { automatedObservationTargetHash } from '../workflows/evidence-binding'
import { findAdapter } from '../workflows/adapters/registry'
import { bindRpcFake } from './bind-rpc-fake'

// Only the authorization boundary is simulated. These tests verify entry
// ordering/argument preservation, not the grant ledger or a paid dispatch.
const authorize = vi.hoisted(() => vi.fn(async () => ({ valid: true, reason: 'fixture grant' })))
vi.mock('../workflows/effect/execution-authorization-runtime', () => ({ assertExecutionAuthorized: authorize }))
const definition = findVendoredDefinition('familje-stunden.monthly-release', 2)!
const instance = {
  id: '00000000-0000-4000-8000-00000000c0de', def_id: 'definition',
  def_key: definition.def_key, def_version: 2, def_hash: definition.def_hash,
  project_id: '00000000-0000-4000-8000-0000000000b1', instance_key: '2026-10',
  current_state: 'content_generation', status: 'active', wake_at: null,
  last_tick_at: null, last_tick_outcome: null, created_at: '2026-10-01T00:00:00Z', closed_at: null,
} as const
type Row = Record<string, any>
function fixture(evidence: Row[] = [], run?: Row) {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const tables: Record<string, unknown> = {
    workflow_instances: instance, projects: { execution_paused: false },
    workflow_defs: { id: instance.def_id, def_key: definition.def_key, version: 2,
      def_hash: definition.def_hash, spec: definition.spec, created_at: instance.created_at },
    workflow_evidence: evidence, runs: run ?? [],
  }
  return { inserted, db: {
    rpc: bindRpcFake(inserted),
    from(table: string) {
      let columns = '*'
      const resolve = () => {
        let data = tables[table] ?? null
        // Enforce the selected columns: a permissive fake hid the missing
        // attempt_group projection in readiness.
        if (table === 'runs' && run && columns !== '*') {
          data = Object.fromEntries(columns.split(',').map(c => c.trim()).map(c => [c, run[c]]))
        }
        return { data, error: null }
      }
      const q: Row = {}
      q.select = (value: string) => { columns = value; return q }
      q.eq = q.not = q.order = q.limit = () => q
      q.single = q.maybeSingle = async () => resolve()
      q.then = (ok: (value: unknown) => unknown) => Promise.resolve(resolve()).then(ok)
      return q
    },
  } }
}
function generated(changes: Row = {}): Row {
  return { id: 'generated', instance_id: instance.id, state: instance.current_state,
    check_key: 'story_generated', source: 'automated', result: 'pass', detail: {},
    recorded_at: instance.created_at, producer: null, producer_type: null, payload_hash: null,
    observed_at: null, attestation: {},
    target_hash: automatedObservationTargetHash(instance, definition.spec, instance.current_state, 'story_generated'),
    ...changes }
}
afterEach(() => { vi.unstubAllEnvs(); authorize.mockClear() })
describe('real story action entry with canonical catalogue', () => {
  it('generation reaches the closed spend gate without requiring future outputs', async () => {
    vi.stubEnv('H1_SPEND_GATE', '0')
    const { db, inserted } = fixture()
    const result = await createWorkflowActionRun(db, { instanceId: instance.id,
      actionKind: 'generate_monthly_story', authorizationId: 'fixture', attemptGroup: 'attempt-one' })
    expect(result).toMatchObject({ ok: false, refusal: 'spend_enforcement_required' })
    expect(inserted).toEqual([])
  })
  it('generation still needs an execution grant', async () => {
    const { db } = fixture()
    expect(await createWorkflowActionRun(db, { instanceId: instance.id, actionKind: 'generate_monthly_story' }))
      .toMatchObject({ ok: false, refusal: 'authorization_not_effective' })
  })
  it.each([[], [generated({ target_hash: 'stale' })], [generated({ source: 'attested' })],
    [generated({ result: 'fail' })]].map(rows => ({ rows })))('validation refuses absent or invalid generation evidence: %j', async ({ rows }) => {
    const { db, inserted } = fixture(rows)
    expect(await createWorkflowActionRun(db, { instanceId: instance.id, actionKind: 'validate_monthly_story' }))
      .toMatchObject({ ok: false, refusal: 'evidence_not_satisfied', blockingCheckKeys: ['story_generated'] })
    expect(inserted).toEqual([])
  })
  it('validation can bind before storyboard attestation, without writing evidence', async () => {
    const { db, inserted } = fixture([generated()])
    expect(await createWorkflowActionRun(db, { instanceId: instance.id, actionKind: 'validate_monthly_story' }))
      .toMatchObject({ ok: true })
    expect(inserted.map(row => row.table)).toEqual(['runs', 'run_autonomy_decisions'])
  })
  it('readiness preserves the exact approved attempt group', async () => {
    vi.stubEnv('H1_SPEND_GATE', '1'); vi.stubEnv('H1_FINANCIAL_EXECUTION', '1')
    const target = computeWorkflowActionTarget({ instance, spec: definition.spec,
      state: instance.current_state, actionKind: 'generate_monthly_story', actionClass: 'FINANCIAL',
      sideEffectTarget: null, evidence: [], declaredCheckKeys: findAdapter(instance.def_key)!.attestableChecks()
        .filter(c => c.state === instance.current_state).map(c => c.check_key) })
    const { db } = fixture([], { id: 'run', project_id: instance.project_id, status: 'queued',
      cancel_requested: false, workflow_instance_id: instance.id, workflow_def_hash: instance.def_hash,
      workflow_from_state: instance.current_state, action_kind: 'generate_monthly_story', action_class: 'FINANCIAL',
      target_version_hash: target.versionHash, authorization_id: 'fixture', attempt_group: 'attempt-one' })
    expect(await assertWorkflowActionReady(db, 'run')).toMatchObject({ ready: true })
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ attemptGroup: 'attempt-one' }))
  })
})
