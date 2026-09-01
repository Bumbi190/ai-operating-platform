/**
 * G3C-1 — the paid provider boundary refuses a stopped dispatch.
 *
 * ── THE GAP THIS CLOSES ────────────────────────────────────────────────────
 * `withGovernedSpend` used to do: resolve billing project → reserve budget →
 * run() → settle. Nothing between the reservation and `run()` consulted either
 * stop authority, so an operator pause could COMMIT and the very next provider
 * dispatch would still go out. Every stop check lived in TypeScript, one round
 * trip earlier — the same stale-read shape G3B closed in SQL.
 *
 * ── WHAT THESE TESTS PIN ───────────────────────────────────────────────────
 * Ordering (reserve → FRESH stop decision → release-or-run), the refusal
 * lifecycle (release, never settle, never dispatch), and — the load-bearing one
 * — that BILLING ATTRIBUTION IS NOT STOP AUTHORITY. `PLATFORM_COMPAT_PROJECT`
 * and `MEDIA_PIPELINE_PROJECT` resolve to the SAME slug, so deriving scope from
 * the billing lookup would take Atlas offline whenever the media project is
 * paused.
 *
 * ── THE IN-FLIGHT CONTRACT, STATED HONESTLY ────────────────────────────────
 * The final decision is the DISPATCH AUTHORIZATION POINT. An external HTTP call
 * cannot join a PostgreSQL transaction, so a stop committed after an allowed
 * decision does NOT retroactively cancel that attempt — it must stop the NEXT
 * safe boundary. Nothing here claims "no packet after pause commit"; that would
 * need a durable dispatch claim, which stays deferred.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StopDecision } from '@/lib/governance/execution-stop'

// ── the spend ledger, observed ──────────────────────────────────────────────
let reserveCalls: unknown[] = []
let settleCalls: unknown[] = []
let releaseCalls: unknown[] = []
let releaseThrows = false
let reserveAllowed = true

vi.mock('server-only', () => ({}))

vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: async (args: unknown) => {
    reserveCalls.push(args)
    return reserveAllowed
      ? { allowed: true, reason: 'ok', reservationId: 'res-1', headroomSek: 700 }
      : { allowed: false, reason: 'budget_exceeded', reservationId: 'res-x', headroomSek: 0 }
  },
  settleSpend:  async (id: string, sek: number) => { settleCalls.push({ id, sek }) },
  releaseSpend: async (id: string) => {
    releaseCalls.push(id)
    if (releaseThrows) throw new Error('release exploded')
  },
}))

// Billing-project resolution must actually succeed, so the compat-slug test
// exercises the real path: slug resolves, and the stop authority is STILL asked
// about GLOBAL_ONLY rather than about the resolved project.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({ maybeSingle: async () => ({ data: { id: 'resolved-billing-id' }, error: null }) }),
          maybeSingle: async () => ({ data: { id: 'resolved-billing-id' }, error: null }),
        }),
      }),
    }),
  }),
}))

// ── the stop authority, controlled ──────────────────────────────────────────
// The resolver is stubbed rather than the database, so these tests are about the
// BOUNDARY's behaviour given a decision. The decision logic itself is proven in
// unified-stop-authority.test.ts.
let stopDecision: StopDecision
let contractsSeen: unknown[] = []
let projectRefsResolved: unknown[] = []
let resolvedProjectIds: (string | null)[] = []

vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async (
      _db: unknown, contract: unknown, resolveProjectId: (r: unknown) => Promise<string | null>,
    ) => {
      contractsSeen.push(contract)
      const c = contract as { scope: { kind: string; project?: unknown } }
      // Exercise the resolver callback so a test can see WHICH ref was resolved.
      if (c.scope.kind === 'PROJECT') {
        projectRefsResolved.push(c.scope.project)
        // Record what the boundary's resolver ACTUALLY returns for this ref.
        // Asserting only on the contract would miss a boundary that ignores the
        // ref and hands back the billing id instead — which is precisely the
        // mistake this separation exists to prevent. Found by mutation.
        resolvedProjectIds.push(await resolveProjectId(c.scope.project))
      }
      return stopDecision
    },
  }
})

const allowedDecision = (): StopDecision => ({
  allowed: true, context: 'AUTONOMOUS', scopesEvaluated: ['PLATFORM_AUTOMATION'],
  resolution: 'RESOLVED', globalPaused: false, projectPaused: null,
  reason: null, observed: null,
})
const refusedDecision = (
  reason: 'global_automation_paused' | 'project_execution_paused' | 'stop_state_unavailable',
  context: 'AUTONOMOUS' | 'OPERATOR_EXECUTION' | 'OPERATOR_INTERACTIVE' = 'AUTONOMOUS',
): StopDecision => ({
  allowed: false, context, scopesEvaluated: ['PLATFORM_AUTOMATION', 'PROJECT_EXECUTION'],
  resolution: reason === 'stop_state_unavailable' ? 'UNRESOLVED' : 'RESOLVED',
  globalPaused: reason === 'global_automation_paused',
  projectPaused: reason === 'project_execution_paused',
  reason, observed: null,
})

async function boundary() { return import('@/lib/cost/governed-spend') }

// A provider call that records whether it was ever reached.
let dispatches = 0
const provider = async () => { dispatches += 1; return 'provider-result' }

beforeEach(() => {
  reserveCalls = []; settleCalls = []; releaseCalls = []
  contractsSeen = []; projectRefsResolved = []; resolvedProjectIds = []
  releaseThrows = false; reserveAllowed = true; dispatches = 0
  stopDecision = allowedDecision()
  vi.resetModules()
})

const AUTONOMOUS_GLOBAL = { context: 'AUTONOMOUS' as const, scope: { kind: 'GLOBAL_ONLY' as const } }
const INTERACTIVE_GLOBAL = { context: 'OPERATOR_INTERACTIVE' as const, scope: { kind: 'GLOBAL_ONLY' as const } }
const OPERATOR_GLOBAL = { context: 'OPERATOR_EXECUTION' as const, scope: { kind: 'GLOBAL_ONLY' as const } }

const spend = async (execution: unknown, project: unknown = { projectId: 'bill-1' }) => {
  const { withGovernedSpend } = await boundary()
  return withGovernedSpend(
    { project, execution, provider: 'anthropic', operation: 'op', estimatedSek: 1 } as never,
    provider,
  )
}

// ── A. The behavioural matrix ───────────────────────────────────────────────

describe('G3C-1 · dispatch matrix', () => {
  it('clear → reserve, stop allowed, provider runs, settle', async () => {
    await expect(spend(AUTONOMOUS_GLOBAL)).resolves.toBe('provider-result')
    expect(reserveCalls).toHaveLength(1)
    expect(dispatches).toBe(1)
    expect(settleCalls).toHaveLength(1)
    expect(releaseCalls).toHaveLength(0)
  })

  it('AUTONOMOUS + global paused → release, NO dispatch, NO settle', async () => {
    stopDecision = refusedDecision('global_automation_paused')
    const { ExecutionStoppedError } = await import('@/lib/governance/execution-stop')
    await expect(spend(AUTONOMOUS_GLOBAL)).rejects.toBeInstanceOf(ExecutionStoppedError)
    expect(reserveCalls).toHaveLength(1)      // the reservation DID happen…
    expect(releaseCalls).toEqual(['res-1'])   // …and was given back
    expect(dispatches).toBe(0)                // the provider was never called
    expect(settleCalls).toHaveLength(0)       // and nothing was charged
  })

  it('OPERATOR_EXECUTION + global paused → refused; a click is not an exemption', async () => {
    stopDecision = refusedDecision('global_automation_paused', 'OPERATOR_EXECUTION')
    await expect(spend(OPERATOR_GLOBAL)).rejects.toThrow(/global_automation_paused/)
    expect(dispatches).toBe(0)
    expect(releaseCalls).toEqual(['res-1'])
  })

  it('OPERATOR_INTERACTIVE + global paused → the STOP allows it', async () => {
    // Assistance stays available: the console that lifts a pause is served by
    // the paused platform. Budget governance is unaffected and still applies.
    stopDecision = { ...allowedDecision(), context: 'OPERATOR_INTERACTIVE', globalPaused: true }
    await expect(spend(INTERACTIVE_GLOBAL)).resolves.toBe('provider-result')
    expect(dispatches).toBe(1)
    expect(settleCalls).toHaveLength(1)
  })

  it('project paused → release, NO dispatch', async () => {
    stopDecision = refusedDecision('project_execution_paused')
    await expect(spend({ context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: 'exec-1' } } }))
      .rejects.toThrow(/project_execution_paused/)
    expect(dispatches).toBe(0)
    expect(releaseCalls).toEqual(['res-1'])
  })

  it('unresolved stop state → refused for BOTH enforcing contexts', async () => {
    for (const ctx of [AUTONOMOUS_GLOBAL, OPERATOR_GLOBAL]) {
      reserveCalls = []; releaseCalls = []; settleCalls = []; dispatches = 0
      stopDecision = refusedDecision('stop_state_unavailable', ctx.context)
      await expect(spend(ctx)).rejects.toThrow(/stop_state_unavailable/)
      expect(dispatches, `${ctx.context} must not dispatch`).toBe(0)
      expect(releaseCalls).toEqual(['res-1'])
      expect(settleCalls).toHaveLength(0)
    }
  })

  it('a BUDGET refusal short-circuits before the stop is ever consulted', async () => {
    // Budget and stop are different authorities. A budget refusal already
    // prevents dispatch, so there is nothing for the stop to decide.
    reserveAllowed = false
    const { SpendRefusedError } = await boundary()
    await expect(spend(AUTONOMOUS_GLOBAL)).rejects.toBeInstanceOf(SpendRefusedError)
    expect(contractsSeen).toHaveLength(0)
    expect(dispatches).toBe(0)
  })
})

// ── B. Ordering ─────────────────────────────────────────────────────────────

describe('G3C-1 · ordering', () => {
  it('the stop is decided AFTER reservation and BEFORE dispatch', async () => {
    const order: string[] = []
    stopDecision = allowedDecision()
    const { withGovernedSpend } = await boundary()
    await withGovernedSpend(
      { project: { projectId: 'b' }, execution: AUTONOMOUS_GLOBAL,
        provider: 'anthropic', operation: 'op', estimatedSek: 1 } as never,
      async () => { order.push('dispatch'); return 1 },
    )
    // reserve happened (observed via the ledger), then the contract was seen,
    // then the provider ran.
    expect(reserveCalls).toHaveLength(1)
    expect(contractsSeen).toHaveLength(1)
    expect(order).toEqual(['dispatch'])
  })

  it('the decision is FRESH — resolved once per invocation, never cached', async () => {
    // Two calls must ask twice. A cached decision would reintroduce exactly the
    // stale-read window this slice exists to close.
    await spend(AUTONOMOUS_GLOBAL)
    await spend(AUTONOMOUS_GLOBAL)
    expect(contractsSeen).toHaveLength(2)
  })
})

// ── C. Billing is not authority (P0) ────────────────────────────────────────

describe('G3C-1 · billing attribution is NOT stop authority', () => {
  it('compat billing does not create project scope', async () => {
    // Atlas is billed to the media slug for historical attribution. If scope
    // were derived from billing, pausing the media project would take Atlas
    // offline — an operator lockout produced by an accounting decision.
    stopDecision = { ...allowedDecision(), context: 'OPERATOR_INTERACTIVE' }
    await expect(spend(INTERACTIVE_GLOBAL, { projectSlug: 'ai-media-automation' }))
      .resolves.toBe('provider-result')
    // The authority was asked about GLOBAL_ONLY, never about the billed project.
    expect(contractsSeen[0]).toMatchObject({ scope: { kind: 'GLOBAL_ONLY' } })
    expect(projectRefsResolved).toHaveLength(0)
    expect(dispatches).toBe(1)
  })

  it('the EXECUTION project is the one evaluated, not the billed one', async () => {
    await spend(
      { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: 'exec-Y' } } },
      { projectId: 'bill-X' },
    )
    // The resolver saw Y. X never reached the authority.
    expect(projectRefsResolved).toEqual([{ projectId: 'exec-Y' }])
    expect(JSON.stringify(contractsSeen)).not.toContain('bill-X')
    // …AND resolved Y, not the billing id. A boundary that ignored the ref and
    // returned `resolved.projectId` satisfies the line above and fails here.
    expect(resolvedProjectIds).toEqual(['exec-Y'])
    expect(resolvedProjectIds).not.toContain('resolved-billing-id')
  })

  it('billing X paused / execution Y clear → dispatch proceeds', async () => {
    stopDecision = allowedDecision()   // Y is clear; X is irrelevant here
    await expect(spend(
      { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: 'exec-Y' } } },
      { projectId: 'paused-X' },
    )).resolves.toBe('provider-result')
    expect(dispatches).toBe(1)
  })

  it('billing X clear / execution Y paused → refused because Y is the scope', async () => {
    stopDecision = refusedDecision('project_execution_paused')
    await expect(spend(
      { context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: 'exec-Y' } } },
      { projectId: 'clear-X' },
    )).rejects.toThrow(/project_execution_paused/)
    expect(dispatches).toBe(0)
  })
})

// ── D. Release semantics ────────────────────────────────────────────────────

describe('G3C-1 · reservation release on stop', () => {
  it('a FAILED release still refuses the dispatch', async () => {
    // The dangerous shape: "release failed, so carry on into run()". A failed
    // release is an accounting problem; dispatching anyway is a governance
    // failure. The reservation ages out through normal stale handling instead.
    stopDecision = refusedDecision('global_automation_paused')
    releaseThrows = true
    await expect(spend(AUTONOMOUS_GLOBAL)).rejects.toThrow(/global_automation_paused/)
    expect(releaseCalls).toEqual(['res-1'])   // it was attempted
    expect(dispatches).toBe(0)                // and the provider still never ran
    expect(settleCalls).toHaveLength(0)
  })

  it('the error carries stable codes and no database internals', async () => {
    stopDecision = refusedDecision('project_execution_paused')
    try {
      await spend({ context: 'AUTONOMOUS', scope: { kind: 'PROJECT', project: { projectId: 'p' } } })
      throw new Error('should have refused')
    } catch (e) {
      const err = e as { name: string; reason: string; context: string; scopeKind: string; message: string }
      expect(err.name).toBe('ExecutionStoppedError')
      expect(err.reason).toBe('project_execution_paused')
      expect(err.context).toBe('AUTONOMOUS')
      expect(err.scopeKind).toBe('PROJECT')
      for (const leak of ['supabase', 'PGRST', 'relation', 'password', 'select ']) {
        expect(err.message.toLowerCase()).not.toContain(leak)
      }
    }
  })

  it('an ExecutionStoppedError is NOT a SpendRefusedError', async () => {
    // Different authorities answering different questions. A caller that cannot
    // tell them apart cannot retry correctly or explain itself to an operator.
    stopDecision = refusedDecision('global_automation_paused')
    const { SpendRefusedError } = await boundary()
    const { ExecutionStoppedError } = await import('@/lib/governance/execution-stop')
    await expect(spend(AUTONOMOUS_GLOBAL)).rejects.toBeInstanceOf(ExecutionStoppedError)
    await expect(spend(AUTONOMOUS_GLOBAL)).rejects.not.toBeInstanceOf(SpendRefusedError)
  })
})

// ── E. Retries re-authorize ─────────────────────────────────────────────────

describe('G3C-1 · an outer retry re-authorizes', () => {
  it('attempt 1 dispatches; a pause between attempts stops attempt 2', async () => {
    // Omnira's retry wrappers sit OUTSIDE this boundary, so every attempt
    // re-enters it and takes a FRESH decision. This is the property that makes
    // "pause now, and the next attempt does not go out" true.
    const { withGovernedSpend } = await boundary()
    const call = () => withGovernedSpend(
      { project: { projectId: 'b' }, execution: AUTONOMOUS_GLOBAL,
        provider: 'anthropic', operation: 'op', estimatedSek: 1 } as never,
      async () => { dispatches += 1; throw new Error('503 retryable') },
    )

    stopDecision = allowedDecision()
    await expect(call()).rejects.toThrow('503 retryable')
    expect(dispatches).toBe(1)

    // The operator pauses between attempts.
    stopDecision = refusedDecision('global_automation_paused')
    await expect(call()).rejects.toThrow(/global_automation_paused/)

    // ATTEMPT 2 NEVER REACHED THE PROVIDER.
    expect(dispatches).toBe(1)
    expect(contractsSeen).toHaveLength(2)   // both attempts asked
  })
})
