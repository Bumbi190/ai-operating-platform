/**
 * PR9g — carrying out a human's decision to cross a gate.
 *
 * The distinction this file defends is narrow and load-bearing: the scheduler
 * may EXECUTE a move a human granted; it may never DECIDE one. Every guard below
 * exists so that difference cannot erode.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const adv = readFileSync(join(process.cwd(), 'lib/workflows/advance.ts'), 'utf8')
const tick = readFileSync(join(process.cwd(), 'lib/workflows/tick.ts'), 'utf8')
const gateSql = readFileSync(join(process.cwd(),
  'supabase/migrations/20260829_workflow_gate_authorization.sql'), 'utf8')

// ── Authority is derived, never supplied ────────────────────────────────────

describe('nothing about authority comes from a caller', () => {
  it('MUTATION — no gate status, authorization id or target hash is an input', () => {
    const sig = adv.slice(adv.indexOf('export async function advanceAuthorizedWorkflow'),
                          adv.indexOf('const now ='))
    for (const forbidden of ['authorizationId:', 'gateStatus', 'targetVersionHash', 'force', 'skip']) {
      expect(sig).not.toContain(forbidden)
    }
    expect(adv).toMatch(/const gate = await systemDeriveWorkflowGate\(db, instance\.id/)
  })

  it('advances only on a derived authorized gate', () => {
    expect(adv).toMatch(/!gate\.canAdvance \|\| gate\.status !== 'authorized' \|\| !gate\.authorizationId/)
  })

  it('MUTATION — the tick only calls it for an authorized outcome', () => {
    expect(tick).toMatch(/evaluation\.outcome === 'authorized_ready' \|\| evaluation\.outcome === 'ready_for_transition'/)
  })

  it('never writes current_state directly', () => {
    expect(adv).not.toMatch(/current_state:\s/)
    expect(adv).not.toMatch(/\.update\(/)
    expect(adv).toMatch(/await appendTransition\(db, \{/)
  })
})

// ── One grant, one move ─────────────────────────────────────────────────────

describe('a grant is spent exactly once', () => {
  it('the target id is instance:state, so it stops matching after the move', async () => {
    const { workflowGateTargetId } = await import('../workflows/gate')
    expect(workflowGateTargetId('i', 'planning')).toBe('i:planning')
    expect(workflowGateTargetId('i', 'content_generation')).not.toBe(workflowGateTargetId('i', 'planning'))
  })

  it('MUTATION — SQL independently pins instance+state, so a grant cannot cross two gates', () => {
    expect(gateSql).toMatch(/a\.target_id = p_instance_id::text \|\| ':' \|\| p_from_state/)
    expect(gateSql).toMatch(/a\.target_type = 'workflow_gate'/)
    expect(gateSql).toMatch(/a\.expires_at > now\(\)/)
    expect(gateSql).toMatch(/event_type in \('denied', 'revoked', 'superseded', 'expired'\)/)
  })

  it('the append passes the derived authorization to SQL for re-validation', () => {
    expect(adv).toMatch(/authorizationId: gate\.authorizationId/)
  })
})

// ── A grant does not override evidence ──────────────────────────────────────

describe('required evidence still blocks', () => {
  it('MUTATION — a grant cannot skip an unsatisfied REQUIRED check', () => {
    expect(adv).toMatch(/outcome: 'evidence_incomplete'/)
    expect(adv).toMatch(/c\.state === from && c\.required/)
    expect(adv).toMatch(/authorized crossing the gate, not skipping the work/)
  })

  it('release_instant_computed is informational for planning, so it gates nothing', async () => {
    const { FAMILJE_STUNDEN_CHECKS } = await import('../workflows/adapters/familje-stunden/checks')
    const c = FAMILJE_STUNDEN_CHECKS.find(
      x => x.check_key === 'release_instant_computed' && x.state === 'planning')
    expect(c).toBeDefined()
    expect(c!.required).toBe(false)
  })

  it('planning declares no other check, so nothing else can block it', async () => {
    const { FAMILJE_STUNDEN_CHECKS } = await import('../workflows/adapters/familje-stunden/checks')
    const planning = FAMILJE_STUNDEN_CHECKS.filter(c => c.state === 'planning')
    expect(planning.map(c => c.check_key)).toEqual(['release_instant_computed'])
    expect(planning.filter(c => c.required)).toHaveLength(0)
  })
})

// ── Canonical shape ─────────────────────────────────────────────────────────

describe('the canonical definition decides the destination', () => {
  it('planning is gated and its successor is content_generation', () => {
    const def = JSON.parse(readFileSync(join(process.cwd(),
      'lib/workflows/definitions/familje-stunden.monthly-release.v1.json'), 'utf8'))
    const s = def.states.find((x: { id: string }) => x.id === 'planning')
    expect(s.human_gate.required).toBe(true)
    expect(s.human_gate.approver).toBe('editor')
    expect(s.next_state).toBe('content_generation')
  })

  it('the destination is read from the definition, never chosen', () => {
    expect(adv).toMatch(/to: state\.next_state/)
    expect(adv).not.toMatch(/to:\s*['"]/)
  })

  it('an ungated state is left to the existing auto-advance question', () => {
    expect(adv).toMatch(/state\.human_gate\.required !== true/)
    expect(adv).toMatch(/outcome: 'not_gated'/)
  })

  it('a terminal state is refused', () => {
    expect(adv).toMatch(/!state\.next_state/)
    expect(adv).toMatch(/outcome: 'no_successor'/)
  })
})

// ── Fail closed ─────────────────────────────────────────────────────────────

describe('fail closed', () => {
  it('refuses a paused project and an inactive instance', () => {
    expect(adv).toMatch(/project\?\.execution_paused === true/)
    expect(adv).toMatch(/instance\.status !== 'active'/)
  })

  it('MUTATION — a refused append does not fake success', () => {
    expect(adv).toMatch(/outcome: 'append_refused'/)
    const c = adv.slice(adv.indexOf('} catch (e) {'), adv.indexOf("outcome: 'advanced'"))
    expect(c).not.toMatch(/outcome: 'advanced'/)
  })

  it('every non-advanced outcome returns before writing', () => {
    const appendAt = adv.indexOf('await appendTransition(db, {')
    for (const o of ['instance_not_active', 'project_paused', 'not_gated',
                     'no_successor', 'not_authorized', 'evidence_incomplete']) {
      expect(adv.indexOf(`outcome: '${o}'`), o).toBeLessThan(appendAt)
    }
  })

  it('performs no execution of any kind', () => {
    for (const forbidden of [/fetch\(/, /createWorkflowActionRun/, /executeWorkflowAction/,
                             /reserveSpend/, /grantAuthorization/, /atlas_authorizations/]) {
      expect(adv).not.toMatch(forbidden)
    }
  })
})

// ── Stops at the next gate ──────────────────────────────────────────────────

describe('it stops at the next gate', () => {
  it('13 of the 19 states are gate-required, so each of those needs its own grant', () => {
    type St = { id: string; next_state: string | null; automated_actions: string[]
                verification: string[]; human_gate: { required: boolean } }
    const def = JSON.parse(readFileSync(join(process.cwd(),
      'lib/workflows/definitions/familje-stunden.monthly-release.v1.json'), 'utf8'))
    const states = def.states as St[]
    expect(states).toHaveLength(19)
    expect(states.filter(s => s.human_gate.required === true)).toHaveLength(13)
  })

  it('the 6 ungated states are STILL not auto-advanceable', async () => {
    // They carry declared automated_actions or verification, so PR3's
    // fail-closed isAutoAdvanceable yields zero states — this PR does not
    // change that, and advanceAuthorizedWorkflow returns not_gated for them.
    const { autoAdvanceableStates } = await import('../workflows/schedule')
    const { loadVendoredDefinitions } = await import('../workflows/definitions')
    const spec = loadVendoredDefinitions()
      .find(d => d.def_key === 'familje-stunden.monthly-release')!.spec
    expect(autoAdvanceableStates(spec)).toEqual([])
  })

  it('MUTATION — the tick creates no authorization to keep going', () => {
    expect(tick).not.toMatch(/grantAuthorization|requestWorkflowAuthorization|appendAuthorizationEvent/)
  })

  it('an advance re-evaluates once rather than looping', () => {
    // The new state has a different gate, different prerequisites and different
    // evidence; one immediate re-look, then normal backoff.
    expect(tick).toMatch(
      /\(advance\?\.outcome === 'advanced' \|\| completion\?\.outcome === 'advanced'\) \? now/)
    expect(tick).toMatch(/: nextWakeAt\)/)
  })

  it('records what it did in the tick outcome', () => {
    expect(tick).toMatch(/gate_advance: advance/)
  })
})

// ── Policy boundary ─────────────────────────────────────────────────────────

describe('this is the workflow gate, not the legacy policy gate', () => {
  it('touches neither H1 flag', () => {
    for (const src of [adv, tick]) {
      expect(src).not.toMatch(/H1_POLICY_GATE|H1_SPEND_GATE/)
    }
  })

  it('does not claim to solve policy_class', () => {
    expect(adv).not.toMatch(/policy_class/)
  })
})
