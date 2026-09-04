/**
 * lib/qa/execution-authorization-runtime.test.ts — Phase 2B-2.5.
 *
 * The runtime consumer the `workflow_execution` target never had, and the
 * readiness split that decides which authorization semantics an action gets.
 *
 * These exist because two deliberate falsifications passed without them:
 * removing the readiness split, and making a missing grant acceptable. Both are
 * the difference between "an effect is authorized" and "an effect happens", so
 * an untested version of either is worse than none.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const effective = vi.fn()
vi.mock('@/lib/atlas/authorization/principal-read', async orig => ({
  ...(await orig<typeof import('@/lib/atlas/authorization/principal-read')>()),
  isAuthorizationEffective: (...a: unknown[]) => effective(...a),
}))

const { assertExecutionAuthorized } =
  await import('@/lib/workflows/effect/execution-authorization-runtime')
const { WORKFLOW_EXECUTION_TARGET_TYPE, WORKFLOW_EXECUTION_ACTION_KIND } =
  await import('@/lib/workflows/effect/execution-authorization')
const { WORKFLOW_GATE_TARGET_TYPE } = await import('@/lib/workflows/gate')
const { ACTION_CLASS_POLICY } = await import('@/lib/workflows/action-target')

const H = (c: string) => c.repeat(64)
const QUERY = {
  authorizationId: 'auth-1',
  projectId: 'proj-1',
  instanceId: 'inst-1',
  defKey: 'omnira.execution-proof',
  defVersion: 1,
  defHash: H('a'),
  state: 'effect',
  actionKind: 'proof_governed_effect',
  actionClass: 'FINANCIAL' as const,
  targetVersionHash: H('b'),
  attemptGroup: 'grp-1',
}

beforeEach(() => {
  effective.mockReset()
  effective.mockResolvedValue({ status: 'ok', effective: true, reason: 'effective', state: null })
})

describe('an effect needs a grant that names it', () => {
  it('accepts a live, matching execution grant', async () => {
    const v = await assertExecutionAuthorized(QUERY)
    expect(v.valid).toBe(true)
    expect(v.refusal).toBeNull()
  })

  it('MUTATION — a missing grant is a refusal, never a pass', async () => {
    for (const id of [null, undefined, '']) {
      const v = await assertExecutionAuthorized({ ...QUERY, authorizationId: id })
      expect(v.valid, String(id)).toBe(false)
      expect(v.refusal, String(id)).toBe('missing')
      // And the ledger was never consulted — absence is decided here.
      expect(effective).not.toHaveBeenCalled()
    }
  })

  it('MUTATION — it queries the EXECUTION target, never the gate target', async () => {
    await assertExecutionAuthorized(QUERY)
    const [, query] = effective.mock.calls[0] as [string, Record<string, any>]
    expect(query.target.targetType).toBe(WORKFLOW_EXECUTION_TARGET_TYPE)
    expect(query.target.targetType).not.toBe(WORKFLOW_GATE_TARGET_TYPE)
    expect(query.actionKind).toBe(WORKFLOW_EXECUTION_ACTION_KIND)
    expect(query.actionKind).not.toBe('workflow.gate.advance')
  })

  it('MUTATION — a changed input identity produces a different target', async () => {
    await assertExecutionAuthorized(QUERY)
    await assertExecutionAuthorized({ ...QUERY, targetVersionHash: H('c') })
    const [a, b] = effective.mock.calls.map(c => (c[1] as any).target.versionHash)
    expect(a).not.toBe(b)
  })

  it('MUTATION — a fresh attempt_group produces a different target', async () => {
    await assertExecutionAuthorized(QUERY)
    await assertExecutionAuthorized({ ...QUERY, attemptGroup: 'grp-2' })
    const [a, b] = effective.mock.calls.map(c => (c[1] as any).target.versionHash)
    expect(a).not.toBe(b)
  })

  it('an ineffective grant is refused, with the ledger reason carried', async () => {
    effective.mockResolvedValue({ status: 'ok', effective: false, reason: 'revoked', state: null })
    const v = await assertExecutionAuthorized(QUERY)
    expect(v.valid).toBe(false)
    expect(v.refusal).toBe('not_effective')
    expect(v.reason).toMatch(/revoked/)
  })

  it('an unreadable chain fails closed', async () => {
    effective.mockResolvedValue({ status: 'not_found', effective: false, reason: 'x', state: null })
    const v = await assertExecutionAuthorized(QUERY)
    expect(v.valid).toBe(false)
    expect(v.refusal).toBe('malformed')
  })

  it('the project is carried, so a grant cannot cross projects', async () => {
    await assertExecutionAuthorized(QUERY)
    expect((effective.mock.calls[0][1] as any).projectId).toBe('proj-1')
  })
})

// ── The readiness split ─────────────────────────────────────────────────────

describe('readiness chooses authorization semantics by family', () => {
  const src = () => readFileSync(join(process.cwd(), 'lib/workflows/action-run.ts'), 'utf8')

  it('MUTATION — a governed effect is routed to the execution validator', () => {
    const body = src()
    expect(body).toMatch(
      /executor_family === 'governed_effect'[\s\S]{0,900}assertExecutionAuthorized\(/)
  })

  it('MUTATION — the gate resolver remains the path for everything else', () => {
    const body = src()
    // The else branch still calls the legacy validator, untouched.
    expect(body).toMatch(/else \{[\s\S]{0,300}assertWorkflowAuthorizationValid\(/)
  })

  it('the split lives inside requiresAuthorization, so READ_ONLY never reaches it', () => {
    const body = src()
    const block = body.slice(body.indexOf('if (policy?.requiresAuthorization)'),
                             body.indexOf('// Re-derive the target from today'))
    expect(block).toMatch(/assertExecutionAuthorized/)
    expect(block).toMatch(/assertWorkflowAuthorizationValid/)
    // READ_ONLY sets requiresAuthorization false, so neither runs for it.
    expect(ACTION_CLASS_POLICY.READ_ONLY.requiresAuthorization).toBe(false)
  })

  it('readiness reads attempt_group, which the execution target binds', () => {
    expect(src()).toMatch(/attempt_group/)
  })
})
