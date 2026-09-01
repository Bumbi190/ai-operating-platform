/**
 * G3C-2B — structural guards for the external dispatch boundary, plus the
 * boundary helper's own behaviour.
 *
 * The behavioural suite proves what happens at runtime. These pin the shape, so
 * a later refactor cannot quietly reopen what this slice closed: an assertion
 * hoisted out of a retry callback, a legacy global-only helper returning as the
 * authority, a row's project swapped back for the billing slug.
 */

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
/** Comment-stripped and line-joined: a pin must not be satisfiable by prose. */
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ')

/** The routes G3C-2B took ownership of. */
const DISPATCH_ROUTES = [
  'app/api/media/cron/step4/route.ts',
  'app/api/media/cron/publish/route.ts',
  'app/api/media/cron/youtube/route.ts',
  'app/api/media/cron/reply-comments/route.ts',
]

describe('G1 · every targeted external write has a canonical dispatch boundary', () => {
  it.each(DISPATCH_ROUTES)('%s calls assertExecutionDispatchAllowed', rel => {
    expect(code(rel)).toContain('assertExecutionDispatchAllowed')
  })

  it('the boundary is imported from the canonical module, never re-implemented', () => {
    for (const rel of DISPATCH_ROUTES) {
      expect(code(rel), `${rel} must use the shared helper`)
        .toMatch(/from '@\/lib\/governance\/execution-dispatch'/)
    }
  })
})

describe('G2 · no targeted route relies only on a route-entry preflight', () => {
  it('a route that preflights ALSO asserts at dispatch', () => {
    // `resolveExecutionEligibility` is explicitly an optimisation whose answer
    // must not be carried forward. Using it as the only check would recreate the
    // exact stale-read this slice removed.
    for (const rel of DISPATCH_ROUTES) {
      const body = code(rel)
      if (!body.includes('resolveExecutionEligibility')) continue
      expect(body, `${rel} preflights but must still assert per attempt`)
        .toContain('assertExecutionDispatchAllowed')
    }
  })

  it('publish keeps its preflight strictly BEFORE the row is claimed', () => {
    const body = code('app/api/media/cron/publish/route.ts')
    const preflight = body.indexOf('resolveExecutionEligibility')
    const claim = body.indexOf("status: 'publishing'")
    expect(preflight, 'preflight present').toBeGreaterThan(-1)
    expect(claim, 'claim present').toBeGreaterThan(-1)
    expect(preflight, 'do not claim work a stop already forbids').toBeLessThan(claim)
  })
})

describe('G3 · the assertion lives INSIDE the retry callback', () => {
  /**
   * The subtlest regression available here. `withRetry` sleeps between attempts,
   * and a pause can commit during that sleep. Authorising once outside the
   * callback would let attempt 2 fly after the stop — the check would look
   * present and be worthless.
   */
  it('publish authorises inside each withRetry callback, not around it', () => {
    const body = code('app/api/media/cron/publish/route.ts')
    // Every withRetry whose callback performs an external write must open with
    // the assertion. Matching `withRetry(async () => { await assert…` pins that.
    const inside = body.match(
      /withRetry\(\s*async \(\) => \{ await assertExecutionDispatchAllowed/g) ?? []
    expect(inside.length,
      'each of create_container / media_publish / post_reel must re-authorise')
      .toBeGreaterThanOrEqual(3)
  })

  it('no targeted route authorises immediately BEFORE a withRetry call', () => {
    // The anti-pattern, written out: assert(…) then withRetry(() => write()).
    for (const rel of DISPATCH_ROUTES) {
      expect(code(rel), `${rel} must not hoist the assertion out of the retry`)
        .not.toMatch(/assertExecutionDispatchAllowed\([^;]*\); await withRetry\(\(\) =>/)
    }
  })

  it('stop is composed as non-retryable rather than forking the retry primitive', () => {
    const body = code('app/api/media/cron/publish/route.ts')
    expect(body).toContain('stopIsNotRetryable')
    // The generic primitive stays provider-neutral: it must not learn about
    // governance types.
    expect(code('lib/media/retry.ts'), 'retry.ts stays governance-agnostic')
      .not.toMatch(/ExecutionStopped|execution-stop|execution-dispatch/)
  })
})

describe('G4 · the legacy global-only helper is no longer an authority', () => {
  it('no runtime module calls checkAutomationPaused', () => {
    const offenders: string[] = []
    for (const rel of runtimeFiles()) {
      if (rel === 'lib/media/safeguards.ts') continue          // its definition
      if (/checkAutomationPaused\s*\(/.test(code(rel))) offenders.push(rel)
    }
    expect(offenders,
      'a raw global-only read may never be the authority for a project-bound write')
      .toEqual([])
  })

  it('no targeted route imports it', () => {
    for (const rel of DISPATCH_ROUTES) {
      expect(code(rel), `${rel} must not import the legacy helper`)
        .not.toMatch(/import[^;]*checkAutomationPaused/)
    }
  })

  it('no targeted route reads a raw stop column', () => {
    for (const rel of DISPATCH_ROUTES) {
      expect(code(rel), `${rel} must not implement stop policy locally`)
        .not.toMatch(/automation_paused|execution_paused/)
    }
  })
})

describe('G5 · the row’s project binds execution, not the billing slug', () => {
  it('the pipeline routes select project_id', () => {
    for (const rel of ['app/api/media/cron/step4/route.ts',
                       'app/api/media/cron/publish/route.ts',
                       'app/api/media/cron/youtube/route.ts']) {
      expect(code(rel), `${rel} must load the row's own project`)
        .toMatch(/project_id/)
    }
  })

  it('execution scope is built from the row, never from MEDIA_PIPELINE_PROJECT', () => {
    for (const rel of [...DISPATCH_ROUTES, 'app/api/media/cron/step3/route.ts']) {
      const body = code(rel)
      expect(body, `${rel} must not scope execution to the billing project`)
        .not.toMatch(/scope: projectScope\(MEDIA_PIPELINE_PROJECT\)/)
    }
  })

  it('step3 binds the row it already loaded', () => {
    // The latent defect: `projectId` was destructured from the script and then
    // discarded for the billing slug. Every script sits in that one project
    // today, so the two coincided and nothing failed.
    const body = code('app/api/media/cron/step3/route.ts')
    expect(body).toContain('project_id: projectId')
    expect(body).toContain('scope: projectScope({ projectId })')
  })

  it('billing attribution is still present — only authority moved', () => {
    expect(code('app/api/media/cron/step3/route.ts'),
      'G3C-2B must not change who pays').toContain('MEDIA_PIPELINE_PROJECT')
  })
})

describe('G6 · a stop is never converted into an external failure', () => {
  it('publish models a stop as its own channel result, not a ChannelFail', () => {
    const body = code('app/api/media/cron/publish/route.ts')
    expect(body).toMatch(/type ChannelStopped/)
    expect(body).toMatch(/stopped: true/)
    // The deferral branch must run BEFORE the failure accounting, or the counter
    // moves before anyone notices it should not have.
    const deferral = body.indexOf("status: 'deferred_by_stop'")
    const failure = body.indexOf('handlePublishFailure(')
    expect(deferral).toBeGreaterThan(-1)
    expect(failure).toBeGreaterThan(-1)
    expect(deferral, 'defer before any failure accounting').toBeLessThan(failure)
  })

  it('each targeted route distinguishes a stop in its catch', () => {
    for (const rel of DISPATCH_ROUTES) {
      expect(code(rel), `${rel} must recognise a stop as control flow`)
        .toContain('isExecutionStopped')
    }
  })

  it('a stopped channel is never "settled" — the work is deferred, not finished', () => {
    expect(code('app/api/media/cron/publish/route.ts'))
      .toMatch(/function isSettled[^}]*if \(isStopped\(r\)\) return false/)
  })
})

describe('G7 · read-only reconciliation stays available while stopped', () => {
  it('step4 does not gate render polling behind dispatch authorisation', () => {
    // Over-stopping is its own failure: the kill switch must not stop the system
    // from learning what already-running work did.
    const body = code('app/api/media/cron/step4/route.ts')
    const poll = body.indexOf('getLambdaRenderProgress(')
    const firstAssert = body.indexOf('assertExecutionDispatchAllowed(')
    expect(poll).toBeGreaterThan(-1)
    expect(firstAssert, 'the first assertion must come after the read').toBeGreaterThan(poll)
  })

  it('Instagram container status and published-media lookups stay unguarded', () => {
    const body = code('app/api/media/cron/publish/route.ts')
    for (const readOnly of ['getContainerStatus(', 'resolvePublishedMedia(']) {
      const i = body.indexOf(readOnly)
      expect(i, `${readOnly} present`).toBeGreaterThan(-1)
      const before = body.slice(Math.max(0, i - 220), i)
      expect(before, `${readOnly} is reconciliation, not execution`)
        .not.toContain('assertExecutionDispatchAllowed')
    }
  })

  it('operator alerts are not placed behind the kill switch', () => {
    // Otherwise pressing stop could silence the notification explaining why
    // everything stopped.
    expect(code('lib/media/alert.ts'))
      .not.toMatch(/assertExecutionDispatchAllowed|resolveExecutionEligibility/)
  })
})

describe('G8 · the G3C-1 paid boundary is untouched', () => {
  it('governed-spend still re-decides freshly and releases on refusal', () => {
    const body = code('lib/cost/governed-spend.ts')
    expect(body).toContain('resolveExecutionStopForContract')
    expect(body).toContain('releaseSpend(verdict.reservationId)')
    expect(body).toContain('throw new ExecutionStoppedError')
  })

  it('the dispatch helper does not reach into the billing verdict', () => {
    const body = code('lib/governance/execution-dispatch.ts')
    expect(body).not.toMatch(/reserveSpend|settleSpend|releaseSpend|verdict/)
  })

  it('the dispatch helper owns no truth table', () => {
    const body = code('lib/governance/execution-dispatch.ts')
    expect(body).not.toMatch(/automation_paused|execution_paused/)
    expect(body, 'it must ask the authority, not re-derive it')
      .toContain('resolveExecutionStopForContract')
  })
})

/** Every runtime .ts under app/ and lib/, excluding tests and fixtures. */
function runtimeFiles(): string[] {
  const { execSync } = require('node:child_process') as typeof import('node:child_process')
  return execSync(
    "find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts'",
    { cwd: process.cwd(), encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)
}

// ─── The helper's own behaviour ──────────────────────────────────────────────

vi.mock('server-only', () => ({}))

const stopRow = (over: Record<string, unknown> = {}) => ({
  global_paused: false, global_paused_at: null, global_paused_reason: null,
  project_requested: true, project_found: true, project_paused: false,
  project_paused_at: null, project_paused_reason: null, ...over,
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: [(globalThis as Record<string, unknown>).__stopRow], error: null }),
  }),
}))
vi.mock('@/lib/cost/governed-spend', () => ({
  resolveGovernedProjectId: async (ref: { projectId?: string }) =>
    ref.projectId ? { ok: true, projectId: ref.projectId } : { ok: false },
}))

import { assertExecutionDispatchAllowed, stopIsNotRetryable, isExecutionStopped }
  from '@/lib/governance/execution-dispatch'
import { ExecutionStoppedError, projectScope, GLOBAL_ONLY } from '@/lib/governance/execution-stop'

const PROJECT = '11111111-1111-1111-1111-111111111111'
const contract = (scope = projectScope({ projectId: PROJECT })) =>
  ({ context: 'AUTONOMOUS' as const, scope })

describe('assertExecutionDispatchAllowed', () => {
  it('returns silently when nothing is stopped', async () => {
    ;(globalThis as Record<string, unknown>).__stopRow = stopRow()
    await expect(assertExecutionDispatchAllowed(contract())).resolves.toBeUndefined()
  })

  it('throws ExecutionStoppedError carrying the stable reason on a PROJECT pause', async () => {
    ;(globalThis as Record<string, unknown>).__stopRow = stopRow({ project_paused: true })
    await expect(assertExecutionDispatchAllowed(contract()))
      .rejects.toMatchObject({ name: 'ExecutionStoppedError', reason: 'project_execution_paused' })
  })

  it('a GLOBAL pause stops autonomous external writes too', async () => {
    ;(globalThis as Record<string, unknown>).__stopRow = stopRow({ global_paused: true })
    await expect(assertExecutionDispatchAllowed(contract(GLOBAL_ONLY)))
      .rejects.toMatchObject({ reason: 'global_automation_paused' })
  })

  it('the message carries the target labels but no operator prose', async () => {
    ;(globalThis as Record<string, unknown>).__stopRow = stopRow({
      project_paused: true, project_paused_reason: 'vendor breach, do not publish',
    })
    try {
      await assertExecutionDispatchAllowed(contract(), { system: 'instagram', operation: 'media_publish' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ExecutionStoppedError)
      const msg = (e as Error).message
      expect(msg).toContain('instagram/media_publish')
      expect(msg, 'operator-authored text must not reach the message')
        .not.toContain('vendor breach')
    }
  })
})

describe('stopIsNotRetryable', () => {
  const stopped = new ExecutionStoppedError({
    reason: 'project_execution_paused', context: 'AUTONOMOUS', scopeKind: 'PROJECT',
    decision: { allowed: false, context: 'AUTONOMOUS', scopesEvaluated: [], resolution: 'RESOLVED',
                globalPaused: false, projectPaused: true, reason: 'project_execution_paused', observed: null },
  })

  it('classifies a stop as permanent so the retry loop exits at once', () => {
    expect(stopIsNotRetryable()(stopped)).toBe(true)
  })

  it('composes with, rather than replacing, an existing rule', () => {
    const metaRule = (e: unknown) => (e as Error).message.includes('401')
    const composed = stopIsNotRetryable(metaRule)
    expect(composed(stopped), 'stop still exits').toBe(true)
    expect(composed(new Error('401 bad token')), 'the existing rule survives').toBe(true)
    expect(composed(new Error('429 rate limited')), 'transient stays retryable').toBe(false)
  })

  it('isExecutionStopped narrows only governance stops', () => {
    expect(isExecutionStopped(stopped)).toBe(true)
    expect(isExecutionStopped(new Error('meta exploded'))).toBe(false)
  })
})
