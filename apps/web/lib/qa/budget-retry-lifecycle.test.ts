/**
 * G2 correction — what a retry ACTUALLY does through the governed boundary.
 *
 * ── WHY THIS SUITE EXISTS ───────────────────────────────────────────────────
 * The first cut of G2 activated stable idempotency keys at `step2` with the
 * comment "the second attempt REUSES the first reservation". That claim was
 * never executed, and it was wrong.
 *
 * `withRetry` sits OUTSIDE `withGovernedSpend`, so by the time attempt 2 begins,
 * attempt 1 has already finished its reservation lifecycle — settled on an
 * ambiguous failure, released on a provable non-dispatch. A stable key therefore
 * makes attempt 2 a REFUSAL (`replay_settled` / `replay_released`), which does
 * not reuse the reservation: it destroys the retry and replaces a retryable 503
 * with a spend refusal the caller cannot act on.
 *
 * These tests drive the real stack — `withRetry` → `generateVoiceover` →
 * `withGovernedSpend` → reserve/settle/release — against a reservation store
 * that mirrors the SQL state machine proven in `budget-scopes-sql.test.ts`.
 * They exist so the architecture is held to the measured lifecycle rather than
 * to a comment, and so that re-activating keys without a dispatch-claim design
 * fails loudly here first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TEST_OPERATOR_EXECUTION_GLOBAL, TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

// ── A reservation store with the SQL's semantics ─────────────────────────────
type Status = 'open' | 'settled' | 'released'
interface Row { id: string; status: Status; project: string; provider: string; operation: string; est: number }

const store = new Map<string, Row>()
let seq = 0
const reserveCalls: { key?: string; reason: string }[] = []

function verdict(over: Record<string, unknown>) {
  return {
    allowed: false, wouldAllow: false, advisoryOverride: false, reason: 'ok',
    reservationId: null, budgetSek: 100, committedSek: 0, reservedSek: 0,
    headroomSek: 100, bindingScope: 'project_daily', ...over,
  }
}

const reserveSpend = vi.fn(async (input: any) => {
  const key: string | undefined = input.idempotencyKey
  if (key && store.has(key)) {
    const r = store.get(key)!
    // identity binding, as the SQL does it
    if (r.project !== input.projectId || r.provider !== input.provider
        || r.operation !== input.operation || input.estimatedSek > r.est) {
      const v = verdict({ reason: 'replay_identity_mismatch', reservationId: r.id })
      reserveCalls.push({ key, reason: v.reason as string }); return v
    }
    const reason = r.status === 'open' ? 'replay_in_flight'
      : r.status === 'settled' ? 'replay_settled' : 'replay_released'
    const v = verdict({ reason, reservationId: r.id })
    reserveCalls.push({ key, reason }); return v
  }
  const id = `res-${++seq}`
  if (key) store.set(key, { id, status: 'open', project: input.projectId,
                            provider: input.provider, operation: input.operation, est: input.estimatedSek })
  reserveCalls.push({ key, reason: 'ok' })
  return verdict({ allowed: true, wouldAllow: true, reason: 'ok', reservationId: id })
})

const settleSpend = vi.fn(async (id: string | null) => {
  for (const r of store.values()) if (r.id === id && r.status === 'open') r.status = 'settled'
})
const releaseSpend = vi.fn(async (id: string | null) => {
  for (const r of store.values()) if (r.id === id && r.status === 'open') r.status = 'released'
})

vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (a: any) => reserveSpend(a),
  settleSpend: (a: any) => settleSpend(a),
  releaseSpend: (a: any) => releaseSpend(a),
  estimateVoiceSek: async () => 1,
}))
// G3C-1: the paid boundary now resolves the canonical stop authority immediately
// before dispatch. These suites are about SPEND lifecycle, not stop policy, so
// the authority is stubbed to "clear" — the stop behaviour itself is proven in
// governed-dispatch-stop.test.ts, which stubs it the other way.
vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async () => ({
      allowed: true, context: 'AUTONOMOUS' as const,
      scopesEvaluated: ['PLATFORM_AUTOMATION' as const],
      resolution: 'RESOLVED' as const,
      globalPaused: false, projectPaused: null, reason: null, observed: null,
    }),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit: () => ({
    maybeSingle: async () => ({ data: { id: 'proj-1' }, error: null }) }) }) }) }) }),
}))
vi.mock('@/lib/cost/track', () => ({
  logVoiceCost: async () => {},
  getRates: async () => ({ usd_sek: 10.5, elevenlabs_usd_per_1k_chars: 0.24 }),
}))
vi.mock('server-only', () => ({}))

const KEYED = { projectSlug: 'p' } as const

async function runVoiceover(fetchImpl: () => any, key?: string) {
  const { generateVoiceover } = await import('@/lib/media/elevenlabs')
  const { withRetry } = await import('@/lib/media/retry')
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  let error: any = null
  try {
    await withRetry(() => generateVoiceover('hello', TEST_AUTONOMOUS_GLOBAL, 'victoria', KEYED, key),
      { attempts: 2, baseMs: 1, label: 'test' })
  } catch (e) { error = e }
  return error
}

const ok = () => Promise.resolve({
  ok: true, status: 200,
  json: async () => ({ audio_base64: Buffer.from('x').toString('base64'),
    alignment: { characters: ['x'], character_start_times_seconds: [0], character_end_times_seconds: [1] } }),
})
const transportFail = () => Promise.reject(new Error('ECONNRESET'))
const http4xx = () => Promise.resolve({ ok: false, status: 401, text: async () => 'unauthorized' })
const http5xx = () => Promise.resolve({ ok: false, status: 503, text: async () => 'unavailable' })
const ambiguous = () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('socket hang up') } })

beforeEach(() => {
  store.clear(); seq = 0; reserveCalls.length = 0
  vi.clearAllMocks()
  process.env.ELEVENLABS_API_KEY = 'test-key'
})

describe('reservation lifecycle per failure class (no key — shipped behaviour)', () => {
  it('E · success settles exactly once and never releases', async () => {
    expect(await runVoiceover(ok)).toBeNull()
    expect(settleSpend).toHaveBeenCalledTimes(1)
    expect(releaseSpend).not.toHaveBeenCalled()
  })

  it('A · a transport failure RELEASES — nothing was billed', async () => {
    await runVoiceover(transportFail)
    expect(releaseSpend).toHaveBeenCalled()
    expect(settleSpend).not.toHaveBeenCalled()
  })

  it('B · a provider 4xx releases, and withRetry does not retry a permanent error', async () => {
    await runVoiceover(http4xx)
    expect(releaseSpend).toHaveBeenCalled()
    expect(settleSpend).not.toHaveBeenCalled()
    expect(reserveCalls).toHaveLength(1)          // no second attempt
  })

  it('C · a provider 5xx SETTLES (it may have been billed) and is still retried', async () => {
    await runVoiceover(http5xx)
    // 5xx is >= 500, so it is NOT a provable non-dispatch: the reservation
    // settles rather than handing budget back for a call that may have run.
    expect(settleSpend).toHaveBeenCalled()
    expect(releaseSpend).not.toHaveBeenCalled()
    // The retry then takes its OWN reservation, which is the honest accounting:
    // two attempts that may each have cost money are two reservations.
    expect(reserveCalls.map(c => c.reason)).toEqual(['ok', 'ok'])
    expect(reserveCalls.every(c => c.key === undefined)).toBe(true)
  })

  it('D · an ambiguous failure after dispatch SETTLES — budget is not handed back', async () => {
    await runVoiceover(ambiguous)
    expect(settleSpend).toHaveBeenCalled()
    expect(releaseSpend).not.toHaveBeenCalled()
  })
})

describe('THE MEASURED REASON KEYS STAY DORMANT', () => {
  it('a stable key turns a retryable 5xx into a SPEND REFUSAL, not a reuse', async () => {
    const { spendIdempotencyKey } = await import('@/lib/cost/spend-identity')
    const key = spendIdempotencyKey({ project: KEYED, provider: 'elevenlabs',
      operation: 'generateVoiceover', subject: 'script-1' })
    const err = await runVoiceover(http5xx, key)

    // Attempt 1 settled. Attempt 2 therefore does NOT reuse the reservation.
    expect(reserveCalls.map(c => c.reason)).toEqual(['ok', 'replay_settled'])
    // And the caller no longer sees the real 503 it could have retried.
    expect(err?.name).toBe('SpendRefusedError')
    expect(String(err?.message)).toContain('replay_settled')
  })

  it('a stable key turns a transport failure into a spend refusal too', async () => {
    const { spendIdempotencyKey } = await import('@/lib/cost/spend-identity')
    const key = spendIdempotencyKey({ project: KEYED, provider: 'elevenlabs',
      operation: 'generateVoiceover', subject: 'script-2' })
    // 4xx is permanent so it never retries; use a transport failure, which does.
    const err = await runVoiceover(transportFail, key)
    expect(reserveCalls.map(c => c.reason)).toEqual(['ok', 'replay_released'])
    expect(err?.name).toBe('SpendRefusedError')
  })

  it('GUARD — no shipped call site passes an idempotency key', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = process.cwd()
    const offenders: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(join(root, d))) {
        const rel = `${d}/${e}`
        if (statSync(join(root, rel)).isDirectory()) {
          if (e === 'qa' || e === 'node_modules') continue
          walk(rel); continue
        }
        if (!/\.tsx?$/.test(e) || /\.test\.tsx?$/.test(e)) continue
        const src = readFileSync(join(root, rel), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
        // Minting a key, or handing a subject to a helper that mints one.
        if (/spendIdempotencyKey\s*\(/.test(src) && rel !== 'lib/cost/spend-identity.ts') offenders.push(rel)
      }
    }
    walk('app'); walk('lib')
    // ideogram.ts holds the dormant plumbing; no CALLER supplies its subject.
    expect(offenders).toEqual(['lib/media/ideogram.ts'])
    const ideogram = readFileSync(join(root, 'lib/media/ideogram.ts'), 'utf8')
    expect(ideogram).toMatch(/spendSubject\?: string/)
    const callers = ['app/api/media/cron/step2/route.ts', 'app/api/media/cron/step3/route.ts']
    for (const c of callers) {
      const src = readFileSync(join(root, c), 'utf8')
      expect(src, `${c} must not pass a spend subject until a dispatch claim exists`)
        .not.toMatch(/generateNewsImages\([^)]*script\.id/)
    }
  })
})
