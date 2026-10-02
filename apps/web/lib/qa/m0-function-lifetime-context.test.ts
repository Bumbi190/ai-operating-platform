/**
 * M0 hotfix — the REAL `@vercel/functions` waitUntil reaches the request
 * context from where the governed stream actually runs.
 *
 * Vercel's runtime exposes the per-request context through
 * `globalThis[Symbol.for('@vercel/request-context')].get()`, backed by async
 * context, and `waitUntil` delegates to that context's `waitUntil`. This suite
 * installs such a context (the Vercel runtime itself is the only thing
 * simulated) and drives the real `withGovernedSpend` from inside a
 * `ReadableStream.start()` continuation — the shape of `/api/chat`, whose
 * provider stream begins after the route handler has already returned its
 * Response. It proves the registration lands in THAT request's context.
 *
 * It does not prove the Vercel platform honours `waitUntil` — that is the
 * preview proof.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

const settleSpend = vi.fn()
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: async () => ({ allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
    reservationId: 'res-ctx', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700, bindingScope: null }),
  markSpendDispatchIntent: async () => true,
  settleSpend: (...a: unknown[]) => settleSpend(...a),
  releaseSpend: async () => undefined,
  openOverrideReservation: async () => null,
}))
vi.mock('@/lib/governance/execution-stop', async (orig) => ({
  ...await orig<typeof import('@/lib/governance/execution-stop')>(),
  resolveExecutionStopForContract: async () => ({
    allowed: true, context: 'AUTONOMOUS', scopesEvaluated: ['PLATFORM_AUTOMATION'],
    resolution: 'RESOLVED', globalPaused: false, projectPaused: null, reason: null, observed: null,
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/cost/advisory-override', () => ({ recordAdvisoryOverride: async () => undefined }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const SYMBOL = Symbol.for('@vercel/request-context')
type RequestContext = { waitUntil: (p: Promise<unknown>) => void }
const requests = new AsyncLocalStorage<RequestContext>()
const g = globalThis as unknown as Record<symbol, unknown>

beforeEach(() => {
  vi.resetModules()
  settleSpend.mockReset().mockResolvedValue({ settled: true, result: 'settled', settledSek: 3, ceilingExceeded: false })
  g[SYMBOL] = { get: () => requests.getStore() }
})
afterEach(() => { delete g[SYMBOL]; delete process.env.VERCEL })

const governed = () => ({
  project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL,
  provider: 'anthropic', operation: 'Atlas Chat', estimatedSek: 3,
  ceilingBasis: 'token_window' as const, rates: { usd_sek: 10 },
})

/** A route handler: returns a streaming Response whose body starts the governed stream. */
async function handler(endStream: Promise<void>) {
  const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
  const { currentSpendMeter } = await import('@/lib/cost/spend-meter')
  const body = new ReadableStream<string>({
    async start(controller) {
      await withGovernedSpend(governed(), async () => {
        currentSpendMeter()?.settleAfter(endStream)
        return 'handle'
      })
      controller.enqueue('data: OK')
      await endStream
      controller.close()
    },
  })
  return new Response(body as unknown as BodyInit)
}

describe('the real waitUntil registers the streamed settlement in the live request context', () => {
  it('registration from inside ReadableStream.start() lands in THIS request\'s waitUntil', async () => {
    const registered: Promise<unknown>[] = []
    let end!: () => void
    const ended = new Promise<void>(r => { end = r })
    const res = await requests.run({ waitUntil: p => { registered.push(p) } }, () => handler(ended))
    const reader = res.body!.getReader()
    await reader.read()                                           // first chunk streamed before generation ends
    expect(registered).toHaveLength(1)
    expect(settleSpend).not.toHaveBeenCalled()
    end()
    await reader.read()                                           // response finished…
    await registered[0]                                           // …and the Function waits for this
    expect(settleSpend).toHaveBeenCalledWith('res-ctx', expect.objectContaining({ kind: 'estimate_unmetered' }))
  })

  it('two concurrent requests each register their own settlement in their own context', async () => {
    const a: Promise<unknown>[] = []
    const b: Promise<unknown>[] = []
    await Promise.all([
      requests.run({ waitUntil: p => { a.push(p) } }, () => handler(Promise.resolve())),
      requests.run({ waitUntil: p => { b.push(p) } }, () => handler(Promise.resolve())),
    ])
    await vi.waitFor(() => { expect(a).toHaveLength(1); expect(b).toHaveLength(1) })
  })

  it('on Vercel with NO request context, the lost registration is logged loudly instead of silently dropped', async () => {
    delete g[SYMBOL]
    process.env.VERCEL = '1'
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { keepFunctionAliveUntil } = await import('@/lib/cost/function-lifetime')
    expect(keepFunctionAliveUntil(Promise.resolve(), 'probe')).toBe(false)
    expect(err.mock.calls.flat().join(' ')).toMatch(/no Vercel request context while registering probe/)
    err.mockRestore()
  })
})
