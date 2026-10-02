/**
 * M0 hotfix — a streamed governed call's settlement is part of the Function's
 * lifetime.
 *
 * Production, 2026-10-02 (reservation 3af0bad5…): a streamed Atlas chat
 * reserved, marked dispatch intent, streamed its reply and closed the response;
 * the metering chain had started, and `budget_settle_recorded` never reached
 * the database. The settlement was a detached promise, and Vercel froze the
 * Function once the response ended.
 *
 * These tests drive the REAL `withGovernedSpend`, the REAL governed Anthropic
 * adapter and the REAL runner stream path. Only the Vercel primitive is mocked,
 * at its package boundary (`@vercel/functions`), together with the budget RPCs,
 * the stop decision, physical admission and the provider SDK — none of which
 * decide WHEN settlement runs or WHAT is registered.
 *
 * What they cannot prove is a real Vercel freeze; that is the preview proof.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

// ── The Vercel primitive, mocked ONLY at its package boundary ────────────────
const waitUntil = vi.fn()
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => waitUntil(p) }))

// ── Budget RPCs, stop decision, physical admission ───────────────────────────
const reserveSpend = vi.fn()
const settleSpend = vi.fn()
const releaseSpend = vi.fn()
const markSpendDispatchIntent = vi.fn()
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (...a: unknown[]) => reserveSpend(...a),
  settleSpend: (...a: unknown[]) => settleSpend(...a),
  releaseSpend: (...a: unknown[]) => releaseSpend(...a),
  markSpendDispatchIntent: (...a: unknown[]) => markSpendDispatchIntent(...a),
  openOverrideReservation: async () => null,
}))
vi.mock('@/lib/governance/execution-stop', async (orig) => ({
  ...await orig<typeof import('@/lib/governance/execution-stop')>(),
  resolveExecutionStopForContract: async () => ({
    allowed: true, context: 'AUTONOMOUS', scopesEvaluated: ['PLATFORM_AUTOMATION'],
    resolution: 'RESOLVED', globalPaused: false, projectPaused: null, reason: null, observed: null,
  }),
}))
vi.mock('@/lib/governance/execution-signal', async (orig) => ({
  ...await orig<typeof import('@/lib/governance/execution-signal')>(),
  admitPhysicalRequest: async () => undefined,
  watchExecutionAuthority: () => ({
    signal: new AbortController().signal, dispose: () => {}, authorityUnavailable: false, abortReason: null,
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/cost/advisory-override', () => ({ recordAdvisoryOverride: async () => undefined }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10 }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'proj-1' }, error: null }) }) }) }),
      insert: async () => ({ error: null }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}))

// ── A controllable provider stream, shaped like the SDK's MessageStream ──────
interface Wire { end: (usage?: { input_tokens: number; output_tokens: number }) => void; die: (e: Error) => void }
const wires: Wire[] = []
function fakeStream() {
  let end!: (u?: { input_tokens: number; output_tokens: number }) => void
  let die!: (e: Error) => void
  const finished = new Promise<{ input_tokens: number; output_tokens: number } | undefined>((res, rej) => {
    end = res; die = rej
  })
  void finished.catch(() => {})
  wires.push({ end, die })
  return {
    async *[Symbol.asyncIterator]() {
      await finished
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'OK' } }
    },
    done: () => finished.then(() => undefined),
    finalMessage: () => finished.then(usage => {
      if (!usage) throw new Error('stream ended without a final message')
      return { content: [{ type: 'text', text: 'OK' }], usage }
    }),
  }
}
vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = {
      create: async () => ({ content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 10, output_tokens: 5 } }),
      stream: () => fakeStream(),
    }
  },
}))

const ALLOWED = (id = 'res-1') => ({ allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
  reservationId: id, budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700, bindingScope: null })
const SETTLED = { settled: true, result: 'settled', settledSek: 1, ceilingExceeded: false }
const FAILED = { settled: false, result: 'failed', settledSek: null, ceilingExceeded: false }

const governed = (estimatedSek = 3) => ({
  project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL,
  provider: 'anthropic', operation: 'op', estimatedSek,
  ceilingBasis: 'token_window' as const, rates: { usd_sek: 10 },
})

const unhandled: unknown[] = []
const onUnhandled = (e: unknown) => { unhandled.push(e) }

beforeEach(() => {
  vi.clearAllMocks()
  waitUntil.mockReset()                                          // a throwing registration must not leak
  vi.resetModules()
  wires.length = 0
  unhandled.length = 0
  process.on('unhandledRejection', onUnhandled)
  process.env.ANTHROPIC_API_KEY = 'test-key'
  reserveSpend.mockResolvedValue(ALLOWED())
  markSpendDispatchIntent.mockResolvedValue(true)
  settleSpend.mockResolvedValue(SETTLED)
  releaseSpend.mockResolvedValue(undefined)
})
afterEach(() => { process.off('unhandledRejection', onUnhandled) })

/** The single promise registered with the Function lifetime. */
function registered(): Promise<unknown> {
  expect(waitUntil).toHaveBeenCalledTimes(1)
  return waitUntil.mock.calls[0][0]
}

/** Lets every queued microtask and timer-free continuation run. */
const drain = () => new Promise(r => setTimeout(r, 0))

/** Whether a promise is still pending after the queue drains. */
async function isPending(p: Promise<unknown>): Promise<boolean> {
  let done = false
  void p.then(() => { done = true }, () => { done = true })
  await drain()
  return !done
}

async function anthropicStream() {
  const { getAnthropic } = await import('@/lib/ai/anthropic')
  return getAnthropic({ project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, operation: 'Atlas Chat' })
    .messages.stream({ model: 'claude-sonnet-4-6', max_tokens: 1200, messages: [{ role: 'user', content: 'Hej' }] })
}

// ── The Anthropic stream adapter ─────────────────────────────────────────────

describe('streamed settlement is registered with the Function lifetime (Anthropic adapter)', () => {
  it('the stream handle returns WITHOUT awaiting generation, and the settlement is registered before it returns', async () => {
    const handle = await anthropicStream()
    expect(handle).toBeDefined()
    expect(wires).toHaveLength(1)                                  // generation still in flight
    expect(waitUntil).toHaveBeenCalledTimes(1)                     // registered at handle return
    expect(settleSpend).not.toHaveBeenCalled()                     // …and nothing settled yet
    expect(await isPending(registered())).toBe(true)
  })

  it('settlement cannot happen before the stream ends, and DOES happen after: metered with the real usage', async () => {
    await anthropicStream()
    await drain()
    expect(settleSpend).not.toHaveBeenCalled()
    wires[0].end({ input_tokens: 120, output_tokens: 3 })
    await registered()
    expect(settleSpend).toHaveBeenCalledTimes(1)
    const [id, settlement] = settleSpend.mock.calls[0]
    expect(id).toBe('res-1')
    expect(settlement).toMatchObject({ kind: 'metered', dispatchToken: markSpendDispatchIntent.mock.calls[0][1] })
    expect(settlement.rows[0]).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-4-6', tokens_in: 120, tokens_out: 3 })
  })

  it('waitUntil receives EXACTLY the durable settlement: it resolves only once settleSpend has finished', async () => {
    let finishSettle!: (v: typeof SETTLED) => void
    settleSpend.mockReturnValue(new Promise(r => { finishSettle = r }))
    await anthropicStream()
    wires[0].end({ input_tokens: 1, output_tokens: 1 })
    await vi.waitFor(() => expect(settleSpend).toHaveBeenCalled())
    expect(await isPending(registered())).toBe(true)               // RPC still in flight → Function must stay alive
    finishSettle(SETTLED)
    await expect(registered()).resolves.toBeUndefined()
  })

  it('a stream that dies mid-flight settles estimate_ambiguous — registered, never released, no unhandled rejection', async () => {
    await anthropicStream()
    wires[0].die(Object.assign(new Error('socket hang up'), { name: 'APIConnectionError' }))
    await registered()
    expect(settleSpend.mock.calls[0][1]).toMatchObject({ kind: 'estimate_ambiguous', rows: [] })
    expect(releaseSpend).not.toHaveBeenCalled()
    await drain()
    expect(unhandled).toEqual([])
  })

  it('a settlement RPC failure leaves the reservation held: the registered promise resolves, logs, and nothing is released', async () => {
    settleSpend.mockResolvedValue(FAILED)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await anthropicStream()
    wires[0].end({ input_tokens: 1, output_tokens: 1 })
    await expect(registered()).resolves.toBeUndefined()
    expect(releaseSpend).not.toHaveBeenCalled()
    expect(err.mock.calls.flat().join(' ')).toMatch(/streamed settlement did not complete; reservation res-1 stays held/)
    err.mockRestore()
  })

  it('even a THROWING settlement cannot reject the registered promise (no unhandled rejection)', async () => {
    settleSpend.mockRejectedValue(new Error('network down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await anthropicStream()
    wires[0].end({ input_tokens: 1, output_tokens: 1 })
    await expect(registered()).resolves.toBeUndefined()
    await drain()
    expect(unhandled).toEqual([])
    expect(releaseSpend).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('a failing registration cannot turn a successful stream into an application error', async () => {
    waitUntil.mockImplementation(() => { throw new Error('no request context') })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handle = await anthropicStream()                          // still returned
    expect(handle).toBeDefined()
    wires[0].end({ input_tokens: 1, output_tokens: 1 })
    await vi.waitFor(() => expect(settleSpend).toHaveBeenCalled()) // the work still runs where the process lives
    expect(err.mock.calls.flat().join(' ')).toMatch(/could not register stream settlement of reservation res-1/)
    err.mockRestore()
  })
})

// ── withGovernedSpend directly: the three settlement branches ────────────────

describe('every streamed settlement branch is the registered promise', () => {
  it('a stream lifetime that completes with no usage settles estimate_unmetered', async () => {
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    const { currentSpendMeter } = await import('@/lib/cost/spend-meter')
    let end!: () => void
    const lifetime = new Promise<void>(r => { end = r })
    await withGovernedSpend(governed(), async () => { currentSpendMeter()?.settleAfter(lifetime); return 'h' })
    expect(settleSpend).not.toHaveBeenCalled()
    end()
    await registered()
    expect(settleSpend.mock.calls[0][1]).toMatchObject({ kind: 'estimate_unmetered', rows: [] })
  })

  it('non-streaming governed spend settles inline and NEVER needs waitUntil', async () => {
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    await withGovernedSpend(governed(), async () => 'ok')
    expect(settleSpend).toHaveBeenCalledTimes(1)
    expect(waitUntil).not.toHaveBeenCalled()
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    await getAnthropic({ project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL })
      .messages.create({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [{ role: 'user', content: 'x' }] })
    expect(settleSpend).toHaveBeenCalledTimes(2)
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('nested governed calls stay isolated: the inner stream settles ITS reservation with ITS usage', async () => {
    reserveSpend.mockResolvedValueOnce(ALLOWED('res-outer')).mockResolvedValueOnce(ALLOWED('res-inner'))
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    const { getAnthropic } = await import('@/lib/ai/anthropic')
    await withGovernedSpend(governed(), async () => {
      await getAnthropic({ project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL })
        .messages.stream({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [{ role: 'user', content: 'x' }] })
      return 'outer'
    })
    // The outer call (not a stream) settled inline with nothing metered.
    expect(settleSpend.mock.calls[0]).toEqual(['res-outer', expect.objectContaining({ kind: 'estimate_unmetered', rows: [] })])
    wires[0].end({ input_tokens: 7, output_tokens: 2 })
    await registered()
    expect(settleSpend.mock.calls[1][0]).toBe('res-inner')
    expect(settleSpend.mock.calls[1][1]).toMatchObject({ kind: 'metered' })
    expect(settleSpend.mock.calls[1][1].rows).toHaveLength(1)
  })
})

// ── The runner stream path ───────────────────────────────────────────────────

describe('the runner stream path reaches the registered lifecycle', () => {
  it('runStep(onChunk) streams, registers the settlement, and it settles metered after the stream ends', async () => {
    const { runStep } = await import('@/lib/ai/runner')
    const chunks: string[] = []
    const step = runStep({
      execution: TEST_AUTONOMOUS_GLOBAL, systemPrompt: 's', userMessage: 'u',
      model: 'claude-sonnet-4-6', maxTokens: 500, cost: { projectId: 'proj-1', operation: 'Run Step' },
    }, c => chunks.push(c))
    await vi.waitFor(() => expect(wires).toHaveLength(1))
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(settleSpend).not.toHaveBeenCalled()
    wires[0].end({ input_tokens: 50, output_tokens: 1 })
    await step
    await registered()
    expect(chunks).toEqual(['OK'])
    expect(settleSpend.mock.calls[0][1]).toMatchObject({ kind: 'metered' })
    expect(settleSpend.mock.calls[0][1].rows[0]).toMatchObject({ tokens_in: 50, tokens_out: 1 })
  })
})

// ── Permanent guards ─────────────────────────────────────────────────────────

describe('permanent guards', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')

  it('withGovernedSpend has no unregistered fire-and-forget settlement', () => {
    const gs = src('lib/cost/governed-spend.ts')
    expect(gs).not.toMatch(/void\s+lifetime\.then/)
    expect(gs).not.toMatch(/void\s+settleWithWhatIsKnown/)
    expect(gs).toMatch(/keepFunctionAliveUntil\(durableSettlement,/)
  })

  it('the lifetime primitive is Vercel\'s waitUntil, a DIRECT runtime dependency (not transitive)', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.dependencies['@vercel/functions']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(src('lib/cost/function-lifetime.ts')).toMatch(/import \{ waitUntil \} from '@vercel\/functions'/)
  })
})
