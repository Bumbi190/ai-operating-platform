/**
 * G3A — the stop authority's DECISION semantics, and the structural invariants
 * that keep it the only authority.
 *
 * The SQL suite (`unified-stop-authority-sql.test.ts`) proves the database side.
 * This one proves the composition rules in TypeScript, where the fail-closed
 * behaviour lives, plus a set of source pins for the properties that are easy to
 * lose silently in a later refactor — a second global boolean, a client-supplied
 * actor, a setter creeping onto a read surface.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveExecutionStop, operatorActor,
  setPlatformAutomationStop, setProjectExecutionStop,
} from '@/lib/governance/execution-stop'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
/** Comment-stripped, line-joined — a pin must not be satisfiable by prose. */
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ')

const PROJECT = '11111111-1111-1111-1111-111111111111'

type StateRow = {
  global_paused: boolean
  global_paused_at: string | null
  global_paused_reason: string | null
  project_requested: boolean
  project_found: boolean
  project_paused: boolean | null
  project_paused_at: string | null
  project_paused_reason: string | null
}

function stateRow(over: Partial<StateRow> = {}): StateRow {
  return {
    global_paused: false, global_paused_at: null, global_paused_reason: null,
    project_requested: false, project_found: false, project_paused: null,
    project_paused_at: null, project_paused_reason: null, ...over,
  }
}

/** Minimal db double: only `.rpc` is ever reached by the resolver. */
function db(rpc: (fn: string, args: Record<string, unknown>) => unknown): SupabaseClient {
  return { rpc: async (fn: string, args: Record<string, unknown>) => rpc(fn, args) } as unknown as SupabaseClient
}
const returns = (row: StateRow | null) => db(() => ({ data: row ? [row] : [], error: null }))
const fails = (message: string) => db(() => ({ data: null, error: { message } }))
const throws = (message: string) => db(() => { throw new Error(message) })

// ── A. The truth table ──────────────────────────────────────────────────────

describe('resolveExecutionStop · AUTONOMOUS composes both scopes by AND', () => {
  const cases: [string, Partial<StateRow>, boolean, string | null][] = [
    ['clear / clear',   { project_found: true, project_paused: false }, true,  null],
    ['clear / paused',  { project_found: true, project_paused: true },  false, 'project_execution_paused'],
    ['paused / clear',  { global_paused: true, project_found: true, project_paused: false },
      false, 'global_automation_paused'],
    ['paused / paused', { global_paused: true, project_found: true, project_paused: true },
      false, 'global_automation_paused'],
  ]

  for (const [label, over, allowed, reason] of cases) {
    it(`${label} → allowed=${allowed}`, async () => {
      const d = await resolveExecutionStop(
        returns(stateRow({ project_requested: true, ...over })),
        { context: 'AUTONOMOUS', projectId: PROJECT })
      expect(d.allowed).toBe(allowed)
      expect(d.reason).toBe(reason)
      expect(d.scopesEvaluated).toEqual(['PLATFORM_AUTOMATION', 'PROJECT_EXECUTION'])
    })
  }

  it('reports the BROADER authority first when both are paused', async () => {
    // Telling an operator "project X is paused" while the whole platform is
    // stopped sends them to fix the wrong thing.
    const d = await resolveExecutionStop(
      returns(stateRow({ global_paused: true, project_requested: true,
                         project_found: true, project_paused: true })),
      { context: 'AUTONOMOUS', projectId: PROJECT })
    expect(d.reason).toBe('global_automation_paused')
  })

  it('evaluates only the platform scope when no project is named', async () => {
    const d = await resolveExecutionStop(returns(stateRow()), { context: 'AUTONOMOUS' })
    expect(d.scopesEvaluated).toEqual(['PLATFORM_AUTOMATION'])
    expect(d.allowed).toBe(true)
    expect(d.projectPaused).toBeNull()
  })
})

// ── B. Fail-closed, and its limits ──────────────────────────────────────────

describe('unresolvable state', () => {
  it('AUTONOMOUS refuses when the state cannot be read', async () => {
    for (const bad of [fails('connection reset'), throws('boom'), returns(null)]) {
      const d = await resolveExecutionStop(bad, { context: 'AUTONOMOUS', projectId: PROJECT })
      expect(d.allowed).toBe(false)
      expect(d.reason).toBe('stop_state_unavailable')
      expect(d.resolution).toBe('UNRESOLVED')
      expect(d.globalPaused).toBeNull()
    }
  })

  it('a requested-but-MISSING project is unknown, never "clear"', async () => {
    // The dangerous shape: project_found=false coalesced to project_paused=false
    // would read as a green light derived from a failed lookup.
    const d = await resolveExecutionStop(
      returns(stateRow({ project_requested: true, project_found: false, project_paused: null })),
      { context: 'AUTONOMOUS', projectId: PROJECT })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('stop_state_unavailable')
    expect(d.projectPaused).toBeNull()
  })

  it('a project failure does NOT take the platform offline', async () => {
    // The same database, the same instant: one project unresolvable, and a
    // platform-scoped decision that is unaffected by it. A per-project lookup
    // failure must stay scoped to that project.
    const oneBadProject = db((_fn, args) => {
      const id = args.p_project_id
      if (id === PROJECT) return { data: [stateRow({ project_requested: true, project_found: false })], error: null }
      return { data: [stateRow({ project_requested: id !== null, project_found: id !== null, project_paused: false })], error: null }
    })
    expect((await resolveExecutionStop(oneBadProject,
      { context: 'AUTONOMOUS', projectId: PROJECT })).allowed).toBe(false)
    expect((await resolveExecutionStop(oneBadProject,
      { context: 'AUTONOMOUS' })).allowed).toBe(true)
    expect((await resolveExecutionStop(oneBadProject,
      { context: 'AUTONOMOUS', projectId: '22222222-2222-2222-2222-222222222222' })).allowed).toBe(true)
  })
})

// ── C. The operator is not locked out ───────────────────────────────────────

describe('OPERATOR_INTERACTIVE is reported to, never enforced against', () => {
  it('is allowed even while everything is paused', async () => {
    // The console that lifts the pause is served by the paused platform. An
    // authority that refuses interactive calls while paused has no recovery
    // path short of direct database access.
    const d = await resolveExecutionStop(
      returns(stateRow({ global_paused: true, global_paused_reason: 'incident 42',
                         project_requested: true, project_found: true, project_paused: true })),
      { context: 'OPERATOR_INTERACTIVE', projectId: PROJECT })
    expect(d.allowed).toBe(true)
    expect(d.reason).toBeNull()
    // ...and still SEES the state, so the UI can say so.
    expect(d.globalPaused).toBe(true)
    expect(d.projectPaused).toBe(true)
    expect(d.observed?.globalPausedReason).toBe('incident 42')
  })

  it('is allowed even when the state cannot be read at all', async () => {
    const d = await resolveExecutionStop(fails('db down'), { context: 'OPERATOR_INTERACTIVE' })
    expect(d.allowed).toBe(true)
    expect(d.resolution).toBe('UNRESOLVED')
    expect(d.reason).toBeNull()
  })
})

// ── D. Reasons are policy codes, not diagnostics ────────────────────────────

describe('refusal reasons', () => {
  it('never carry raw database text', async () => {
    const leak = 'duplicate key value violates unique constraint "pg_class_relname_nsp_index"'
    const d = await resolveExecutionStop(fails(leak), { context: 'AUTONOMOUS' })
    expect(d.reason).toBe('stop_state_unavailable')
    expect(JSON.stringify(d)).not.toContain('duplicate key')
    expect(JSON.stringify(d)).not.toContain('pg_class')
  })

  it('come from a closed set', async () => {
    const allowed = new Set(['global_automation_paused', 'project_execution_paused',
                             'stop_state_unavailable'])
    const seen = new Set<string>()
    for (const over of [{ global_paused: true }, { project_found: true, project_paused: true },
                        { project_found: false }]) {
      const d = await resolveExecutionStop(
        returns(stateRow({ project_requested: true, ...over })),
        { context: 'AUTONOMOUS', projectId: PROJECT })
      if (d.reason) seen.add(d.reason)
    }
    expect([...seen].every(r => allowed.has(r))).toBe(true)
    expect(seen.size).toBe(3)
  })
})

// ── E. Actor provenance ─────────────────────────────────────────────────────

describe('operatorActor', () => {
  it('derives a namespaced actor from the authenticated id', () => {
    expect(operatorActor('abc-123')).toBe('user:abc-123')
  })
  it('refuses to mint an anonymous actor', () => {
    // A blank actor would satisfy "an actor was recorded" while recording nobody.
    expect(() => operatorActor('')).toThrow()
    expect(() => operatorActor('   ')).toThrow()
  })
})

describe('mutation wrappers', () => {
  it('surface `changed` so a repeat is distinguishable from a transition', async () => {
    const r = await setPlatformAutomationStop(
      db(() => ({ data: [{ changed: false, previous_paused: true, new_paused: true, event_id: null }], error: null })),
      { paused: true, actor: 'user:x' })
    expect(r).toEqual({ changed: false, previousPaused: true, newPaused: true, eventId: null })
  })

  it('pass the actor through to the RPC and never default it', async () => {
    let seen: Record<string, unknown> = {}
    await setProjectExecutionStop(db((_fn, args) => {
      seen = args
      return { data: [{ changed: true, previous_paused: false, new_paused: true, event_id: 'e1' }], error: null }
    }), { projectId: PROJECT, paused: true, actor: 'user:abc' })
    expect(seen.p_actor).toBe('user:abc')
    expect(seen.p_project_id).toBe(PROJECT)
  })

  it('throw rather than reporting success when the RPC fails', async () => {
    await expect(setPlatformAutomationStop(fails('nope'), { paused: true, actor: 'user:x' }))
      .rejects.toThrow()
  })
})

// ── F. Structural invariants ────────────────────────────────────────────────

describe('one authority, not two', () => {
  it('no second global stop boolean was introduced', () => {
    const mig = src('supabase/migrations/20260831_unified_stop_authority.sql')
    // The ledger records transitions of the EXISTING flags. A new boolean column
    // on platform_config or projects would be a second source of truth.
    expect(mig).not.toMatch(/alter table public\.platform_config\s+add column/i)
    expect(mig).not.toMatch(/alter table public\.projects\s+add column/i)
    expect(mig).toMatch(/automation_paused/)
    expect(mig).toMatch(/execution_paused/)
  })

  it('the global flag is not copied into projects', () => {
    const mig = src('supabase/migrations/20260831_unified_stop_authority.sql')
    // A fan-out write of the global flag onto project rows can partially fail and
    // leave projects stopped that nobody stopped.
    expect(mig).not.toMatch(/update public\.projects[\s\S]{0,200}automation_paused/)
  })

  it('the unaudited TypeScript writer is gone', () => {
    const safeguards = src('lib/media/safeguards.ts')
    expect(safeguards).not.toContain('export async function setAutomationPaused')
    // ...and no direct platform_config write took its place.
    expect(code('lib/media/safeguards.ts'))
      .not.toMatch(/from\('platform_config'\)\s*\.update/)
  })

  it('the legacy SQL setter is retired without CASCADE', () => {
    const mig = src('supabase/migrations/20260831_unified_stop_authority.sql')
    expect(mig).toMatch(/drop function if exists public\.set_project_execution_paused\(uuid, boolean, text\);/)
    expect(mig).not.toMatch(/drop function[^;]*cascade/i)
  })

  it('applied migration history was not edited', () => {
    // These are already deployed; rewriting them would make the ledger describe
    // text that never ran.
    expect(src('supabase/migrations/20260830_execution_stop_safety.sql'))
      .toContain('create or replace function public.set_project_execution_paused')
    expect(src('supabase/migrations/20260829_workflow_scheduler_project_pause.sql'))
      .toContain('execution_paused')
  })
})

describe('operator control is authority, not a callable tool', () => {
  const actions = code('app/actions/automation.ts')

  it('both surfaces authenticate before mutating', () => {
    expect(src('app/actions/automation.ts')).toContain("'use server'")
    expect((actions.match(/getUser\(\)/g) ?? []).length).toBe(2)
    expect((actions.match(/redirect\('\/login'\)/g) ?? []).length).toBe(2)
  })

  it('the actor is server-derived and cannot be supplied by the caller', () => {
    expect(actions).toContain('operatorActor(user.id)')
    // No exported action takes an actor parameter.
    expect(actions).not.toMatch(/export async function \w+\([^)]*actor/)
  })

  it('project pause is ownership-gated on the existing boundary', () => {
    expect(actions).toContain('getAllowedProjectIds')
    expect(actions).toContain('assertProjectAllowed')
  })

  it('resume grants nothing', () => {
    // Pause/resume move one boolean. Anything that could revive an
    // authorization, advance workflow state or create a run would make resume a
    // privilege escalation rather than the removal of a block.
    for (const f of ['atlas_authorizations', 'workflow_append_transition',
                     'workflow_rearm', 'budget_reserve', "from('runs')",
                     '.insert(', '.update(']) {
      expect(actions, `server actions must not touch ${f}`).not.toContain(f)
    }
  })
})

describe('the operator controls are reachable and honest', () => {
  const toggle = code('components/platform/ProjectPauseToggle.tsx')

  it('the project control goes through the audited server action only', () => {
    expect(toggle).toContain('toggleProjectExecutionPause')
    // No client-side database access, and above all no actor invented here.
    expect(toggle).not.toContain('createClient')
    expect(toggle).not.toContain('supabase')
    expect(toggle).not.toContain('actor')
  })

  it('the project control reports failure instead of silently no-opping', () => {
    // A stop control that swallows its error and settles back to the new visual
    // state tells the operator the system stopped when it did not.
    expect(toggle).toContain('r.ok')
    expect(toggle).toContain('forbidden')
  })

  it('both scopes are actually mounted somewhere an operator can reach', () => {
    expect(code('app/(platform)/projects/[slug]/page.tsx')).toContain('<ProjectPauseToggle')
    expect(code('app/(platform)/system/page.tsx')).toContain('<PauseToggle')
  })

  it('the two scopes have SEPARATE controls', () => {
    // One button that "pauses things" would hide which authority is being
    // exercised, and resuming the wrong scope then looks like a no-op.
    expect(code('components/platform/PauseToggle.tsx')).not.toContain('toggleProjectExecutionPause')
    expect(toggle).not.toContain('toggleAutomationPause')
  })
})

describe('the read model reads', () => {
  const route = code('app/api/system/stop-authority/route.ts')

  it('calls no setter and no other write RPC', () => {
    for (const writer of ['stop_set_platform_automation', 'stop_set_project_execution',
                          'budget_reserve', 'budget_settle', 'budget_release',
                          'claim_runs', 'request_run_cancel', 'workflow_rearm',
                          'set_project_execution_paused']) {
      expect(route, `read model must not call ${writer}`).not.toContain(writer)
    }
    expect(route).not.toMatch(/\.update\(|\.insert\(|\.delete\(|\.upsert\(/)
  })

  it('is session-authenticated and owner-scoped', () => {
    expect(route).toContain('resolveProjectAccess')
    expect(route).toContain('access.allowedProjectIds')
  })

  it('resolves through the same resolver the runtime uses', () => {
    // A status surface with its own copy of the composition rule is a surface
    // that can disagree with enforcement.
    expect(route).toContain('resolveExecutionStop')
    expect(route).not.toMatch(/automation_paused|execution_paused/)
  })
})

describe('G1/G2 boundaries are not weakened', () => {
  it('the spend boundary couples to stop ONLY through the canonical authority (G1+G3)', () => {
    // ── WHAT CHANGED, AND WHY ──────────────────────────────────────────────
    // G3-F-001 originally said this file must contain NO stop coupling at all,
    // and that was right at the time: the danger was a naive
    // `if (automation_paused) refuse` here, which would turn an automation kill
    // switch into an operator lockout, because the operator's own interactive
    // calls spend too.
    //
    // G3C-1 removes that danger a better way — the boundary asks the canonical
    // authority with an EXPLICIT execution context, so an interactive call is
    // allowed while an autonomous one is refused. The blanket prohibition would
    // now forbid the very mechanism that makes that distinction possible, so it
    // is REPLACED rather than preserved.
    //
    // The new rule is narrower and stronger: coupling is permitted, but only
    // through the one authority. No second policy may grow here.
    const gs = code('lib/cost/governed-spend.ts')

    // ALLOWED — the canonical entry point.
    expect(gs, 'the boundary must resolve stops through the canonical authority')
      .toContain('resolveExecutionStopForContract')

    // FORBIDDEN — any local re-implementation of the policy.
    for (const t of [
      'automation_paused',        // raw global flag
      'execution_paused',         // raw project flag
      'checkAutomationPaused',    // the legacy helper
      "from('platform_config')",  // direct stop-row read
      "rpc('stop_state'",         // the read model used as local policy
    ]) {
      expect(gs, `governed-spend must not implement stop policy itself (${t})`)
        .not.toContain(t)
    }

    // FORBIDDEN — inventing or defaulting the context it was handed.
    expect(gs, 'the boundary must never default the execution context')
      .not.toMatch(/execution\s*\?\?|context:\s*'(AUTONOMOUS|OPERATOR_)/)

    // The ORIGINAL G1 spend invariants survive this evolution untouched.
    for (const t of ['reserveSpend', 'settleSpend', 'releaseSpend', 'resolveGovernedProjectId']) {
      expect(gs, `G1 invariant lost: ${t}`).toContain(t)
    }
    // Reservation still precedes dispatch, and the stop check sits between them.
    expect(gs.indexOf('reserveSpend'))
      .toBeLessThan(gs.indexOf('resolveExecutionStopForContract'))
  })

  it('the stop authority contains no spend or provider logic', () => {
    const stop = code('lib/governance/execution-stop.ts')
    for (const t of ['budget_reserve', 'withGovernedSpend', 'anthropic', 'openai']) {
      expect(stop).not.toContain(t)
    }
  })
})
