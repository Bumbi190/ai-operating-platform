/**
 * PR9g-2 — the scheduler's verifier for appendTransition.
 *
 * appendTransition's DEFAULT verifier resolves the ledger through
 * `principal-read`, a session-scoped path. Correct for a human crossing a gate
 * from the UI; wrong for the tick, which is a cron with no session — the read
 * fails closed and a legitimately authorized transition is refused. That is
 * exactly what happened in production: gate `authorized`, append `refused`.
 *
 * The fix supplies the system path PR3 already built. It must be NARROWER than
 * the default, never more permissive.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sys = readFileSync(join(process.cwd(), 'lib/workflows/system-authorization.ts'), 'utf8')
const adv = readFileSync(join(process.cwd(), 'lib/workflows/advance.ts'), 'utf8')
const store = readFileSync(join(process.cwd(), 'lib/workflows/store.ts'), 'utf8')

/** Guards judge CODE: these modules' headers explain the session/system split. */
const stripComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const sysCode = stripComments(sys)

/** The verifier body alone — not the exports that follow it. */
const verifierBody = (() => {
  const from = sysCode.indexOf('export const systemAuthorizationVerifier')
  return sysCode.slice(from, sysCode.indexOf('\n}', from))
})()

// ── Wiring ──────────────────────────────────────────────────────────────────

describe('the scheduler path uses the system verifier', () => {
  it('MUTATION — advance must pass verifyAuthorization explicitly', () => {
    // Removing this argument silently restores the session verifier, which is
    // the production bug this PR fixes.
    expect(adv).toMatch(/verifyAuthorization: systemAuthorizationVerifier/)
    const call = adv.slice(adv.indexOf('await appendTransition(db, {'),
                           adv.indexOf('} catch (e) {', adv.indexOf('await appendTransition(db, {')))
    expect(call).toMatch(/verifyAuthorization/)
  })

  it('the gate derivation and the verifier use the SAME system path', () => {
    expect(adv).toMatch(/systemAuthorizationVerifier, systemDeriveWorkflowGate/)
    expect(adv).not.toMatch(/assertWorkflowAuthorizationValid/)
  })
})

// ── The default verifier is untouched ───────────────────────────────────────

describe('the session verifier is unchanged', () => {
  it('appendTransition still defaults to the principal-scoped verifier', () => {
    expect(store).toMatch(/const verify = input\.verifyAuthorization \?\? defaultVerifier/)
    expect(store).toMatch(/assertWorkflowAuthorizationValid/)
  })

  it('MUTATION — there is no shared permissive verifier', () => {
    // Two paths, two verifiers. A single "works for both" verifier would mean
    // the session path silently gained system reach, or vice versa.
    expect(store).not.toMatch(/systemAuthorizationVerifier/)
    // Comment-stripped: the header NAMES principal-read to explain why the
    // scheduler must not use it. The code must not import it.
    expect(sysCode).not.toMatch(/principal-read|principal-write|resolveProjectAccess/)
    expect(sys).toMatch(/principal-read/)      // …and the explanation survives
  })

  it('an absent verifier still means the DEFAULT, never "skip"', () => {
    expect(store).toMatch(/There is no way to switch it OFF/)
    expect(store).not.toMatch(/verifyAuthorization === false|skipAuthorization/)
  })
})

// ── Security properties ─────────────────────────────────────────────────────

describe('the system verifier is read-only and strictly scoped', () => {
  it('MUTATION — the system ledger reader cannot append', () => {
    expect(sys).toMatch(/export type LedgerReader = Pick<AuthorizationEventStore, 'history' \| 'byTarget'>/)
    expect(sys).toMatch(/return \{ history: store\.history\.bind\(store\), byTarget: store\.byTarget\.bind\(store\) \}/)
    // `append` is absent from the TYPE, so this path cannot grant by mistake.
    expect(sys).not.toMatch(/\.append\(/)
    expect(sys).not.toMatch(/requestAuthorization|grantAuthorization/)
  })

  it('re-derives live state; takes no authority from the caller', () => {
    expect(verifierBody).toMatch(/await systemDeriveWorkflowGate\(db as WorkflowDb, instanceId\)/)
    // The only caller input used is the id being CHECKED, never a status.
    expect(verifierBody).not.toMatch(/gateStatus|targetVersionHash|force|assume/)
  })

  it('scopes the ledger read by project AND target id', () => {
    expect(sys).toMatch(/ledger\.byTarget\(instance\.project_id, WORKFLOW_GATE_TARGET_TYPE, target\.targetId\)/)
  })

  it('judges the chain against target hash, project, action kind and time', () => {
    expect(sys).toMatch(/isEffectiveNow\(chain, \{\s*at,\s*target,\s*projectId: instance\.project_id,\s*actionKind: WORKFLOW_GATE_ACTION_KIND,/)
  })

  it('MUTATION — an unreadable ledger is a refusal, never an open gate', () => {
    expect(sys).toMatch(/Unreadable ledger is never "no gate"\. Fail closed\./)
    expect(sys).toMatch(/effective: false, reason: 'malformed_chain'/)
  })

  it('requires the cited grant to be the one that opens the gate', () => {
    // Without this a transition could cite authorization A while actually being
    // carried by unrelated grant B — a decision the ledger never recorded.
    const v = verifierBody
    expect(v).toMatch(/gate\.authorizationId !== authorizationId/)
    expect(v).toMatch(/is not the one supplied/)
  })

  it('MUTATION — a permissive always-true verifier would fail these', () => {
    const v = verifierBody
    expect(v).toMatch(/gate\.status !== 'authorized' \|\| !gate\.canAdvance/)
    // valid:true appears exactly once, after every guard.
    expect([...v.matchAll(/valid: true/g)]).toHaveLength(1)
    expect(v.indexOf('valid: true')).toBeGreaterThan(v.indexOf('gate.authorizationId !== authorizationId'))
  })

  it('a derivation failure is malformed, not authorized', () => {
    const v = verifierBody
    expect(v).toMatch(/catch \(e\) \{[\s\S]{0,220}valid: false, status: 'malformed'/)
  })
})

// ── The gate cannot be reused across states ─────────────────────────────────

describe('a grant remains bound to one state', () => {
  it('the target id is instance:state, recomputed per current state', async () => {
    const { workflowGateTargetId } = await import('../workflows/gate')
    expect(workflowGateTargetId('i', 'planning')).not.toBe(workflowGateTargetId('i', 'content_generation'))
    // systemDeriveWorkflowGate always derives from instance.current_state.
    expect(sys).toMatch(/state: instance\.current_state/)
  })

  it('SQL re-validates the same pin independently of TypeScript', () => {
    const gateSql = readFileSync(join(process.cwd(),
      'supabase/migrations/20260829_workflow_gate_authorization.sql'), 'utf8')
    expect(gateSql).toMatch(/a\.target_id = p_instance_id::text \|\| ':' \|\| p_from_state/)
    expect(gateSql).toMatch(/a\.expires_at > now\(\)/)
  })
})

// ── Advance semantics unchanged ─────────────────────────────────────────────

describe('advance semantics are otherwise unchanged', () => {
  it('still never writes current_state and still appends exactly once', () => {
    expect(adv).not.toMatch(/current_state:\s/)
    expect(adv).not.toMatch(/\.update\(/)
    expect([...adv.matchAll(/await appendTransition\(/g)]).toHaveLength(1)
  })

  it('still refuses when a required check is unsatisfied', () => {
    expect(adv).toMatch(/outcome: 'evidence_incomplete'/)
    const appendAt = adv.indexOf('await appendTransition(db, {')
    expect(adv.indexOf("outcome: 'evidence_incomplete'")).toBeLessThan(appendAt)
  })

  it('still refuses a paused project, inactive instance and unauthorized gate', () => {
    const appendAt = adv.indexOf('await appendTransition(db, {')
    for (const o of ['project_paused', 'instance_not_active', 'not_authorized']) {
      expect(adv.indexOf(`outcome: '${o}'`), o).toBeLessThan(appendAt)
    }
  })

  it('touches no flag and no executable action', () => {
    for (const f of [/H1_POLICY_GATE/, /H1_SPEND_GATE/, /createWorkflowActionRun/, /fetch\(/]) {
      expect(adv).not.toMatch(f)
      expect(sys).not.toMatch(f)
    }
  })
})
