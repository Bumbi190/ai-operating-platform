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

/**
 * The symbols that put a packet on the wire. This is the inventory that matters:
 * a hardcoded list of ROUTES is what let step3 escape the first time — it starts
 * a Remotion render and was filed under "latent scope bug", so it never entered
 * the four-route list and nothing noticed. Deriving the set from the calls
 * themselves means a new caller anywhere fails this suite until it is guarded.
 */
const EXTERNAL_WRITE_SYMBOLS = [
  'startLambdaRender',    // new remote compute
  'createReelContainer',  // Meta container
  'publishContainer',     // Instagram publish
  'postReelToFacebook',   // Facebook publish
  'uploadShort',          // YouTube publish
  'postReelToInstagram',  // Instagram publish (operator route)
]

describe('G1 · every external write in the tree has a canonical dispatch boundary', () => {
  it('every external write CALL SITE has its own authorization', () => {
    /**
     * Counted, not merely present. Two weaker forms of this guard were tried and
     * both let a live mutation through:
     *
     *   • `body.includes('assertExecutionDispatchAllowed')` — satisfied by the
     *     leftover IMPORT after the only call was deleted;
     *   • file-granular presence — satisfied by Instagram's assertion while
     *     Facebook's, in the same file, was gone.
     *
     * One authorization per external write is the invariant that actually holds
     * per call site.
     */
    const offenders: string[] = []
    for (const rel of runtimeFiles()) {
      const body = code(rel)
      // The module that DEFINES the primitive is the primitive, not a caller.
      const writes = EXTERNAL_WRITE_SYMBOLS.flatMap(sym =>
        new RegExp(`export (async )?function ${sym}`).test(body)
          ? []
          : (body.match(new RegExp(`\\b${sym}\\s*\\(`, 'g')) ?? []).map(() => sym))
      if (writes.length === 0) continue
      const asserts = (body.match(/assertExecutionDispatchAllowed\s*\(/g) ?? []).length
      if (asserts < writes.length) {
        offenders.push(`${rel}: ${writes.length} external write(s) [${
          [...new Set(writes)].join(', ')}] but ${asserts} authorization(s)`)
      }
    }
    expect(offenders,
      'each external write must cross the boundary — one channel’s check does '
      + 'not cover another’s').toEqual([])
  })

  it('the inventory itself is non-empty and finds the known callers', () => {
    // Guards against the guard silently matching nothing.
    const callers = runtimeFiles().filter(rel => {
      const body = code(rel)
      return EXTERNAL_WRITE_SYMBOLS.some(sym =>
        new RegExp(`\\b${sym}\\s*\\(`).test(body)
        && !new RegExp(`export (async )?function ${sym}`).test(body))
    })
    expect(callers.length, 'the scan must actually find call sites')
      .toBeGreaterThanOrEqual(5)
    for (const known of ['app/api/media/cron/step3/route.ts',
                         'app/api/media/cron/step4/route.ts',
                         'app/api/media/render/start/route.ts',
                         'app/api/media/cron/autonomous/route.ts']) {
      expect(callers, `${known} must be inside the inventory`).toContain(known)
    }
  })

  it('no governance assertion is parked behind an unreachable branch', () => {
    // The G1 scan proves the assertion is PRESENT. Presence is not effect: a
    // neutered `if (false) await assert(...)` satisfies a symbol search while
    // dispatching freely. Banning the dead-code form closes that gap for every
    // caller, including the ones with no behavioural test of their own.
    const offenders: string[] = []
    for (const rel of runtimeFiles()) {
      const body = code(rel)
      if (!body.includes('assertExecutionDispatchAllowed')) continue
      if (/(if \(\s*false\s*\)|&&\s*false|false\s*&&)[^;]{0,120}assertExecutionDispatchAllowed/.test(body)
          || /assertExecutionDispatchAllowed[^;]{0,200}\|\|\s*true/.test(body)) {
        offenders.push(rel)
      }
    }
    expect(offenders, 'a disabled guard is worse than none — it looks present')
      .toEqual([])
  })

  it('the boundary is imported from the canonical module, never re-implemented', () => {
    for (const rel of DISPATCH_ROUTES) {
      expect(code(rel), `${rel} must use the shared helper`)
        .toMatch(/from '@\/lib\/governance\/execution-dispatch'/)
    }
  })
})

describe('G1b · every render-start is authorised per attempt', () => {
  it('step3 asserts INSIDE its retry callback, not around it', () => {
    const body = code('app/api/media/cron/step3/route.ts')
    expect(body,
      'attempt 1 can fail, the pause can commit during backoff, attempt 2 must re-ask')
      .toMatch(/withRetry\(\s*async \(\) => \{ await assertExecutionDispatchAllowed/)
    expect(body).toContain('stopIsNotRetryable()')
  })

  it('step3 does not authorise outside the retry', () => {
    expect(code('app/api/media/cron/step3/route.ts'))
      .not.toMatch(/assertExecutionDispatchAllowed\([^;]*\); const \{ renderId/)
  })

  it('every render-start caller binds the row’s project, never the billing slug', () => {
    for (const rel of ['app/api/media/cron/step3/route.ts',
                       'app/api/media/cron/step4/route.ts',
                       'app/api/media/render/start/route.ts',
                       'app/api/media/cron/autonomous/route.ts']) {
      expect(code(rel), `${rel} must not scope execution to the billing project`)
        .not.toMatch(/scope: projectScope\(MEDIA_PIPELINE_PROJECT\)/)
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
    // The latent defect: the row's project was loaded and then discarded for the
    // billing slug. Every script sits in that one project today, so the two
    // coincided and nothing failed — until a second project produces media.
    const body = code('app/api/media/cron/step3/route.ts')
    expect(body).toContain('scope: projectScope({ projectId: script.project_id')
    // One contract, reused by both the paid image fallback and the render.
    expect(body).toMatch(/const execution: ExecutionContract/)
    expect(body).toContain('generateNewsImages(newsTitle, scriptText, 8, execution)')
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

// ─── G9 · a deferred channel must remain reachable ───────────────────────────

describe('G9 · partial success is never terminalised', () => {
  /**
   * Guarding a channel is only half the job. Both multi-channel routes refused
   * Facebook correctly and then marked the whole script `published` — which the
   * operator route rejects on the next request and the cron queue never selects.
   * "Deferred" silently became "abandoned".
   *
   * autonomous is pinned structurally rather than behaviourally: its pipeline
   * runs news-hunt → script → voice → images → render-poll → publish, and
   * standing all of that up to exercise one branch would be a worse test than
   * this one. The cross-route continuation it hands off to IS proven
   * behaviourally, in publish-channel-independence.
   */
  it('autonomous returns the row to the queue instead of marking it published', () => {
    const body = code('app/api/media/cron/autonomous/route.ts')
    const deferral = body.indexOf('if (fbDeferredReason)')
    expect(deferral, 'the deferral branch must exist').toBeGreaterThan(-1)
    const branch = body.slice(deferral, deferral + 600)
    expect(branch, 'hand the row back to the canonical publish queue')
      .toContain("status: 'approved'")
    expect(branch, 'and it must return before the terminal write')
      .toContain("status: 'deferred_by_stop'")
    // The terminal write must come AFTER the deferral branch returns.
    const terminal = body.indexOf("update({ status: 'published' })")
    expect(terminal, 'terminal write present').toBeGreaterThan(-1)
    expect(terminal, 'a deferred run must never reach it').toBeGreaterThan(deferral)
  })

  it('autonomous persists Instagram BEFORE Facebook is authorised', () => {
    // Otherwise a stop between the channels loses the completed publication, and
    // the resumed run would publish Instagram a second time.
    const body = code('app/api/media/cron/autonomous/route.ts')
    const igPersist = body.indexOf('instagram_media_id: igResult.mediaId')
    const fbAssert = body.indexOf("system: 'facebook', operation: 'post_reel'")
    expect(igPersist, 'Instagram success is persisted').toBeGreaterThan(-1)
    expect(fbAssert, 'Facebook is authorised separately').toBeGreaterThan(-1)
    expect(igPersist, 'persist first, authorise second').toBeLessThan(fbAssert)
  })

  it('the operator route decides completion by channel ids, not by status', () => {
    const body = code('app/api/media/publish/instagram/route.ts')
    expect(body).toContain('igAlreadyDone')
    expect(body).toContain('fbAlreadyDone')
    expect(body, 'the coarse status check alone would strand a pending channel')
      .not.toMatch(/if \(script\.status === 'published'\) \{ return new Response\('Already published'/)
  })

  it('the operator route only terminalises when every channel is done', () => {
    const body = code('app/api/media/publish/instagram/route.ts')
    expect(body).toContain('everyChannelDone')
    expect(body, 'otherwise restore the status the operator started from')
      .toContain('{ status: originalStatus }')
  })

  it('autonomous render deferral does not escape as a server fault', () => {
    const body = code('app/api/media/cron/autonomous/route.ts')
    const assertIdx = body.indexOf("system: 'remotion-lambda', operation: 'start_render'")
    expect(assertIdx).toBeGreaterThan(-1)
    const around = body.slice(Math.max(0, assertIdx - 400), assertIdx + 600)
    expect(around, 'an uncaught stop would surface as a 500').toContain('isExecutionStopped')
    expect(around).toContain("status: 'deferred_by_stop'")
  })
})
