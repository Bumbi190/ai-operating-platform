/**
 * M0 — durable spend settlement: the TypeScript boundary.
 *
 * The SQL half (atomicity, staleness, races, privileges) is proven against real
 * PostgreSQL in `m0-durable-spend-sql.test.ts`. This suite proves what only the
 * application can get right: the ORDER around the final stop check, which path
 * releases and which settles, that a governed call's metered cost reaches the
 * durable settlement instead of the best-effort logger, and that streaming,
 * late and fire-and-forget costs can neither vanish nor double-count.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

// ── Recorded effects ─────────────────────────────────────────────────────────

const events: string[] = []
const reserveSpend = vi.fn()
const settleSpend = vi.fn()
const releaseSpend = vi.fn()
const markSpendDispatchIntent = vi.fn()
const openOverrideReservation = vi.fn()
const stopDecision = vi.fn()
const insert = vi.fn()

vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (...a: unknown[]) => { events.push('reserve'); return reserveSpend(...a) },
  settleSpend: (...a: unknown[]) => { events.push('settle'); return settleSpend(...a) },
  releaseSpend: (...a: unknown[]) => { events.push('release'); return releaseSpend(...a) },
  markSpendDispatchIntent: (...a: unknown[]) => { events.push('intent'); return markSpendDispatchIntent(...a) },
  openOverrideReservation: (...a: unknown[]) => { events.push('override'); return openOverrideReservation(...a) },
}))

vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async () => { events.push('stop-check'); return stopDecision() },
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'proj-1' }, error: null }) }) }) }),
      insert: (row: unknown) => { events.push(`insert:${table}`); return insert(table, row) },
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}))

vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10 }) }))

const CLEAR = {
  allowed: true, context: 'AUTONOMOUS' as const, scopesEvaluated: ['PLATFORM_AUTOMATION' as const],
  resolution: 'RESOLVED' as const, globalPaused: false, projectPaused: null, reason: null, observed: null,
}
const PAUSED = { ...CLEAR, allowed: false, globalPaused: true, reason: 'global_automation_paused' as const }
const ALLOWED = { allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
  reservationId: 'res-1', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700, bindingScope: null }
const SETTLED = { settled: true, result: 'settled', settledSek: 1, ceilingExceeded: false }

const input = (estimatedSek = 3) => ({
  project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL,
  provider: 'anthropic', operation: 'op', estimatedSek,
  ceilingBasis: 'token_window' as const, rates: { usd_sek: 10 },
})

async function load() {
  const gs = await import('@/lib/cost/governed-spend')
  const track = await import('@/lib/cost/track')
  const meter = await import('@/lib/cost/spend-meter')
  return { ...gs, ...track, ...meter }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  events.length = 0
  reserveSpend.mockResolvedValue(ALLOWED)
  settleSpend.mockResolvedValue(SETTLED)
  releaseSpend.mockResolvedValue(undefined)
  markSpendDispatchIntent.mockResolvedValue(true)
  openOverrideReservation.mockResolvedValue('res-override')
  stopDecision.mockReturnValue(CLEAR)
  insert.mockResolvedValue({ error: null })
})

// ── Ordering around the final stop check ─────────────────────────────────────

describe('M0 ordering: reserve → dispatch intent → FINAL stop check → provider → durable settlement', () => {
  it('records dispatch intent BEFORE the stop check and adds NOTHING between the stop check and the provider', async () => {
    const { withGovernedSpend } = await load()
    await withGovernedSpend(input(), async () => { events.push('provider'); return 'ok' })
    expect(events).toEqual(['reserve', 'intent', 'stop-check', 'provider', 'settle'])
  })

  it('the intent and the settlement carry the SAME dispatch token', async () => {
    const { withGovernedSpend } = await load()
    await withGovernedSpend(input(), async () => 'ok')
    const token = markSpendDispatchIntent.mock.calls[0][1]
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect(settleSpend).toHaveBeenCalledWith('res-1', expect.objectContaining({ dispatchToken: token }))
  })

  it('a stop refusal AFTER intent releases by token (proven not dispatched) and never calls the provider', async () => {
    const { withGovernedSpend } = await load()
    stopDecision.mockReturnValue(PAUSED)
    const provider = vi.fn()
    await expect(withGovernedSpend(input(), provider)).rejects.toMatchObject({ name: 'ExecutionStoppedError' })
    expect(provider).not.toHaveBeenCalled()
    expect(releaseSpend).toHaveBeenCalledWith('res-1', { dispatchToken: markSpendDispatchIntent.mock.calls[0][1] })
    expect(settleSpend).not.toHaveBeenCalled()
  })

  it('if dispatch intent cannot be recorded, the provider is NOT called and the stop check is never reached', async () => {
    const { withGovernedSpend } = await load()
    markSpendDispatchIntent.mockResolvedValue(false)
    const provider = vi.fn()
    await expect(withGovernedSpend(input(), provider)).rejects.toMatchObject({ reason: 'unavailable' })
    expect(provider).not.toHaveBeenCalled()
    expect(events).toEqual(['reserve', 'intent', 'release'])
    expect(releaseSpend).toHaveBeenCalledWith('res-1')          // no token: the pre-intent release
  })
})

// ── Settlement outcomes ──────────────────────────────────────────────────────

describe('M0 settlement: metered cost reaches the durable settlement, not the best-effort logger', () => {
  it('normal success: the adapter\'s logLlmCost becomes a METERED settlement row, and nothing is inserted best-effort', async () => {
    const { withGovernedSpend, logLlmCost } = await load()
    await withGovernedSpend(input(), async () => {
      await logLlmCost('claude-sonnet-4-6', { tokensIn: 1000, tokensOut: 500 }, { projectId: 'proj-1', agent: 'A' })
      return 'ok'
    })
    expect(insert).not.toHaveBeenCalled()
    const [, settlement] = settleSpend.mock.calls[0]
    expect(settlement.kind).toBe('metered')
    expect(settlement.rows).toHaveLength(1)
    expect(settlement.rows[0]).toMatchObject({ provider: 'anthropic', tokens_in: 1000, tokens_out: 500, agent: 'A' })
    expect(settlement.rows[0].cost_sek).toBeGreaterThan(0)
  })

  it('cost persistence failure: the call still returns, and the reservation is NOT released (it stays counted)', async () => {
    const { withGovernedSpend, logLlmCost } = await load()
    settleSpend.mockResolvedValue({ settled: false, result: 'failed', settledSek: null, ceilingExceeded: false })
    const out = await withGovernedSpend(input(), async () => {
      await logLlmCost('claude-sonnet-4-6', { tokensIn: 10, tokensOut: 10 })
      return 'answer'
    })
    expect(out).toBe('answer')
    expect(releaseSpend).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()                         // no best-effort fallback that could double-count
  })

  it('a successful call with no usage figure settles at the reserved upper bound (estimate_unmetered)', async () => {
    const { withGovernedSpend } = await load()
    await withGovernedSpend(input(7), async () => 'ok')
    expect(settleSpend).toHaveBeenCalledWith('res-1', expect.objectContaining({ kind: 'estimate_unmetered', rows: [] }))
  })

  it('AMBIGUOUS failure: never released; estimate_ambiguous when nothing was metered', async () => {
    const { withGovernedSpend } = await load()
    await expect(withGovernedSpend(input(), async () => { throw new Error('socket hang up') })).rejects.toThrow('socket hang up')
    expect(releaseSpend).not.toHaveBeenCalled()
    expect(settleSpend).toHaveBeenCalledWith('res-1', expect.objectContaining({ kind: 'estimate_ambiguous', rows: [] }))
  })

  it('AMBIGUOUS failure after usage was metered settles with the metered rows', async () => {
    const { withGovernedSpend, logLlmCost } = await load()
    await expect(withGovernedSpend(input(), async () => {
      await logLlmCost('claude-sonnet-4-6', { tokensIn: 5, tokensOut: 5 })
      throw new Error('parse failure after the provider did the work')
    })).rejects.toThrow('parse failure')
    expect(settleSpend.mock.calls[0][1]).toMatchObject({ kind: 'metered' })
    expect(settleSpend.mock.calls[0][1].rows).toHaveLength(1)
  })

  it('ProviderNotDispatchedError releases by token and settles nothing', async () => {
    const { withGovernedSpend, ProviderNotDispatchedError } = await load()
    const cause = new Error('401')
    await expect(withGovernedSpend(input(), async () => { throw new ProviderNotDispatchedError('refused', cause) }))
      .rejects.toBe(cause)
    expect(releaseSpend).toHaveBeenCalledWith('res-1', { dispatchToken: expect.any(String) })
    expect(settleSpend).not.toHaveBeenCalled()
  })

  it('a physical admission refusal releases by token and settles nothing', async () => {
    const { withGovernedSpend } = await load()
    const { PhysicalAdmissionRefusedError } = await import('@/lib/governance/execution-signal')
    const refusal = new PhysicalAdmissionRefusedError('CANCELLED', 'openai', 'cancelled')
    await expect(withGovernedSpend(input(), async () => { throw refusal })).rejects.toBe(refusal)
    expect(releaseSpend).toHaveBeenCalledWith('res-1', { dispatchToken: expect.any(String) })
    expect(settleSpend).not.toHaveBeenCalled()
  })
})

// ── Streaming ────────────────────────────────────────────────────────────────

describe('M0 streaming: the reservation settles when the cost is known, never before', () => {
  it('settlement waits for the stream lifetime, then settles with the real usage', async () => {
    const { withGovernedSpend, logLlmCost, currentSpendMeter } = await load()
    let finish!: () => void
    const ended = new Promise<void>(r => { finish = r })
    const handle = await withGovernedSpend(input(), async () => {
      const metered = ended.then(() => logLlmCost('claude-sonnet-4-6', { tokensIn: 40, tokensOut: 60 }))
      currentSpendMeter()?.settleAfter(metered)
      return 'stream-handle'
    })
    expect(handle).toBe('stream-handle')
    expect(settleSpend).not.toHaveBeenCalled()                  // not at handle return
    finish()
    await vi.waitFor(() => expect(settleSpend).toHaveBeenCalled())
    expect(settleSpend.mock.calls[0][1]).toMatchObject({ kind: 'metered' })
    expect(settleSpend.mock.calls[0][1].rows[0]).toMatchObject({ tokens_in: 40, tokens_out: 60 })
    expect(insert).not.toHaveBeenCalled()
  })

  it('a stream that dies without usage settles at the reserved upper bound (estimate_ambiguous)', async () => {
    const { withGovernedSpend, currentSpendMeter } = await load()
    let fail!: (e: Error) => void
    const died = new Promise<void>((_, rej) => { fail = rej })
    void died.catch(() => {})
    await withGovernedSpend(input(), async () => { currentSpendMeter()?.settleAfter(died); return 'h' })
    fail(new Error('stream aborted'))
    await vi.waitFor(() => expect(settleSpend).toHaveBeenCalled())
    expect(settleSpend.mock.calls[0][1]).toMatchObject({ kind: 'estimate_ambiguous', rows: [] })
    expect(releaseSpend).not.toHaveBeenCalled()
  })

  it('the Anthropic stream adapter registers its usage as the settlement lifetime', () => {
    const src = readFileSync(join(process.cwd(), 'lib/ai/anthropic.ts'), 'utf8')
    expect(src).toMatch(/currentSpendMeter\(\)\?\.settleAfter\(metered\)/)
    expect(src).not.toMatch(/void Promise\.resolve\(\)[\s\S]{0,400}logLlmCost/)
  })
})

// ── Late and fire-and-forget costs ───────────────────────────────────────────

describe('M0: late and fire-and-forget costs can neither vanish silently nor double-count', () => {
  it('a cost arriving after its governed settlement is refused, not inserted beside it', async () => {
    // The realistic late path: a DETACHED continuation started inside the
    // governed call (as the pre-M0 stream logger was) that completes after the
    // settlement. Async context follows the continuation, so it finds the now
    // closed meter. (A closure invoked later from the CALLER's context would not
    // — which is why the permanent guards below forbid priced logging outside
    // the governed adapters and any fire-and-forget logging at all.)
    const { withGovernedSpend, logLlmCost } = await load()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    let fire!: () => void
    const later = new Promise<void>(r => { fire = r })
    let lateDone!: Promise<void>
    await withGovernedSpend(input(), async () => {
      lateDone = later.then(() => logLlmCost('claude-sonnet-4-6', { tokensIn: 1, tokensOut: 1 }))
      return 'ok'
    })
    expect(settleSpend).toHaveBeenCalledTimes(1)
    fire()
    await lateDone
    expect(insert).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalledWith(expect.stringContaining('after its governed settlement'), expect.anything())
    err.mockRestore()
  })

  it('an UNGOVERNED cost (outside any governed call) is still written best-effort', async () => {
    const { logImageCost } = await load()
    await logImageCost(1, 'ideogram', { projectId: 'proj-1' })
    expect(insert).toHaveBeenCalledWith('cost_events', expect.objectContaining({ provider: 'ideogram', units: 1 }))
  })

  it('…and its failure is no longer ignored: supabase-js reports it in { error }', async () => {
    const { logImageCost } = await load()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    insert.mockResolvedValue({ error: { message: 'permission denied' } })
    await logImageCost(1, 'ideogram', { projectId: 'proj-1' })
    expect(err).toHaveBeenCalledWith(expect.stringContaining('insert FAILED'), expect.objectContaining({ error: 'permission denied' }))
    err.mockRestore()
  })

  it('the hero attribution row carries no amount', async () => {
    const { logCostAttribution } = await load()
    await logCostAttribution('ideogram', { projectId: 'proj-1', metadata: { assetId: 'a1' } })
    expect(insert).toHaveBeenCalledWith('cost_events', expect.objectContaining({
      cost_sek: 0, cost_usd: 0, metadata: expect.objectContaining({ attribution_only: true, assetId: 'a1' }),
    }))
  })

  it('nested governed calls each settle their OWN metered cost', async () => {
    const { withGovernedSpend, logLlmCost } = await load()
    reserveSpend.mockResolvedValueOnce({ ...ALLOWED, reservationId: 'outer' })
      .mockResolvedValueOnce({ ...ALLOWED, reservationId: 'inner' })
    await withGovernedSpend(input(), async () => {
      await withGovernedSpend(input(), async () => { await logLlmCost('claude-sonnet-4-6', { tokensIn: 2, tokensOut: 2 }); return 1 })
      await logLlmCost('claude-sonnet-4-6', { tokensIn: 9, tokensOut: 9 })
      return 2
    })
    const byId = Object.fromEntries(settleSpend.mock.calls.map(([id, s]) => [id, s]))
    expect(byId.inner.rows).toHaveLength(1); expect(byId.inner.rows[0].tokens_in).toBe(2)
    expect(byId.outer.rows).toHaveLength(1); expect(byId.outer.rows[0].tokens_in).toBe(9)
  })
})

// ── Advisory mode and replay ─────────────────────────────────────────────────

describe('M0: advisory overrides are accounted; replays never release another caller\'s spend', () => {
  it('an advisory-overridden budget refusal dispatches against an accounting-only reservation', async () => {
    const { withGovernedSpend } = await load()
    reserveSpend.mockResolvedValue({ ...ALLOWED, wouldAllow: false, advisoryOverride: true,
      reason: 'budget_exceeded', reservationId: 'res-refused' })
    await withGovernedSpend(input(), async () => 'ok')
    expect(markSpendDispatchIntent).toHaveBeenCalledWith('res-override', expect.any(String), 'token_window')
    expect(settleSpend).toHaveBeenCalledWith('res-override', expect.anything())
  })

  it('a spend that cannot be durably accounted is not made, even in advisory mode', async () => {
    const { withGovernedSpend } = await load()
    reserveSpend.mockResolvedValue({ ...ALLOWED, wouldAllow: false, advisoryOverride: true,
      reason: 'unavailable', reservationId: null })
    openOverrideReservation.mockResolvedValue(null)
    const provider = vi.fn()
    await expect(withGovernedSpend(input(), provider)).rejects.toMatchObject({ reason: 'unavailable' })
    expect(provider).not.toHaveBeenCalled()
  })

  it('an enforced REPLAY refusal does not release the reservation it names', async () => {
    const { withGovernedSpend } = await load()
    reserveSpend.mockResolvedValue({ ...ALLOWED, allowed: false, wouldAllow: false,
      reason: 'replay_in_flight', reservationId: 'someone-elses' })
    await expect(withGovernedSpend(input(), vi.fn())).rejects.toMatchObject({ reason: 'replay_in_flight' })
    expect(releaseSpend).not.toHaveBeenCalled()
  })

  it('a non-replay refusal still releases its own (already released) reservation as before', async () => {
    const { withGovernedSpend } = await load()
    reserveSpend.mockResolvedValue({ ...ALLOWED, allowed: false, wouldAllow: false,
      reason: 'budget_exceeded', reservationId: 'res-2' })
    await expect(withGovernedSpend(input(), vi.fn())).rejects.toMatchObject({ reason: 'budget_exceeded' })
    expect(releaseSpend).toHaveBeenCalledWith('res-2')
  })
})

// ── Permanent structural guards ──────────────────────────────────────────────

const ROOT = process.cwd()
function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap(name => {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) return name === 'qa' ? [] : sources(rel)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : []
  })
}

describe('M0 permanent guards', () => {
  const all = [...sources('lib'), ...sources('app')]

  it('priced cost logging happens ONLY inside the governed adapters (their run() bodies settle it)', () => {
    const GOVERNED = new Set([
      'lib/ai/anthropic.ts', 'lib/ai/openai-client.ts', 'lib/media/elevenlabs.ts', 'lib/media/image-client.ts',
    ])
    const callers = all.filter(f => f !== 'lib/cost/track.ts'
      && /\blog(Llm|Image|Voice)Cost\(/.test(readFileSync(join(ROOT, f), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')))
    expect(callers.filter(f => !GOVERNED.has(f))).toEqual([])
  })

  it('no priced cost is logged fire-and-forget', () => {
    const offenders = all.filter(f => /\bvoid\s+log(Llm|Image|Voice)Cost\(/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('withGovernedSpend: intent → stop check → run, with no await between the stop decision and the provider', () => {
    const gs = readFileSync(join(ROOT, 'lib/cost/governed-spend.ts'), 'utf8')
    const intent = gs.indexOf('await markSpendDispatchIntent(')
    const stop = gs.indexOf('const decision = await resolveExecutionStopForContract(')
    const metered = gs.indexOf('// ── M0 · THE CALL, METERED')
    const run = gs.indexOf('result = await runWithSpendMeter(meter, run)')
    expect(intent).toBeGreaterThan(-1)
    expect(intent).toBeLessThan(stop)
    expect(stop).toBeLessThan(metered)
    expect(metered).toBeLessThan(run)
    expect(gs.slice(metered, run)).not.toMatch(/\bawait\b/)
  })

  it('the cost-less settle is gone from the application', () => {
    for (const f of all) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/rpc\(\s*['"]budget_settle['"]/)
    }
  })

  it('track.ts inspects the insert result instead of discarding it', () => {
    const src = readFileSync(join(ROOT, 'lib/cost/track.ts'), 'utf8')
    expect(src).toMatch(/const \{ error \} = await db\.from\('cost_events'\)\.insert\(/)
  })
})
