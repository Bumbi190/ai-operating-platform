/**
 * lib/qa/ideogram-dispatch-certainty.test.ts — Phase 5B-1.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * `generateIdeogramV3` claimed `ProviderNotDispatchedError` for EVERY thrown
 * `fetch`. That is a POSITIVE claim — "I can prove nothing was billed" — and a
 * socket reset or a fired deadline cannot support it. `lib/ai/anthropic.ts` says
 * so in as many words about its own guard: "a timeout, a 5xx or an aborted
 * socket is NOT here on purpose".
 *
 * It cost two things at once:
 *   1. `withGovernedSpend` RELEASED the reservation for a render that may have
 *      run and been billed.
 *   2. the failure read as transient, so the writer-fallback retry rendered a
 *      SECOND paid image.
 *
 * ── WHAT IS REAL HERE ──────────────────────────────────────────────────────
 * The real `generateIdeogramV3`, the real `withGovernedSpend`, the real
 * `classifyTransportFailure`, the real `withRetry`, and the real
 * `dispatchedGenerationIsNotRetryable`. Only the socket and the reservation
 * primitives are faked — so "was the reservation released or settled" and "how
 * many renders happened" are both measured, not asserted about.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const IDEOGRAM_URL = 'https://cdn.ideogram.example/hero.png'

/** Every POST to Ideogram. This is the paid-render count. */
let renders: string[] = []
/** Reservation lifecycle, in order: what actually happened to the budget. */
let spendEvents: string[] = []
let stopAllowed = true

// SPREADS THE REAL MODULE. A factory listing only the three primitives breaks
// the moment anything on the path imports a fourth export — `estimateImageSek`,
// which `generateIdeogramV3` calls to price the render. Same trap that bit
// article-hero-image.test.ts in Phase 5B-0; same fix.
vi.mock('@/lib/cost/budget-gate', async (orig) => ({
  ...(await orig<typeof import('@/lib/cost/budget-gate')>()),
  reserveSpend: async () => { spendEvents.push('reserve'); return {
    allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
    reservationId: 'res-1', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700 } },
  settleSpend:  async () => { spendEvents.push('settle') },
  releaseSpend: async () => { spendEvents.push('release') },
}))

vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async () => ({
      allowed: stopAllowed, context: 'AUTONOMOUS' as const,
      scopesEvaluated: ['PLATFORM_AUTOMATION' as const], resolution: 'RESOLVED' as const,
      globalPaused: !stopAllowed, projectPaused: null,
      reason: stopAllowed ? null : ('global_automation_paused' as const), observed: null,
    }),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: PROJECT_A }, error: null }) }) }) }) }),
  }),
}))

vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10.5, ideogram_v3_usd_per_image: 0.08 }) }))
vi.mock('@/lib/cost/track', () => ({ logImageCost: async () => undefined, logLlmCost: async () => undefined }))

import { withRetry } from '@/lib/media/retry'
import { generateIdeogramV3 } from '@/lib/media/image-client'
import { ProviderDispatchUnknownError } from '@/lib/media/job/dispatch'
import { ProviderNotDispatchedError } from '@/lib/cost/governed-spend'
import { ExecutionStoppedError } from '@/lib/governance/execution-stop'
import { dispatchedGenerationIsNotRetryable, generationMayAlreadyHaveDispatched }
  from '@/lib/media/orchestrator/retry-authority'
import { stopIsNotRetryable } from '@/lib/governance/execution-dispatch'

// ── The socket ──────────────────────────────────────────────────────────────

type Mode =
  | 'ok'                 // 200 with a url
  | 'reject_400'         // vendor answered no
  | 'rate_limited_429'   // vendor answered no, but retryable by policy
  | 'ambiguous_500'      // gateway 5xx — may have rendered
  | 'econnreset'         // socket died mid-flight
  | 'dns'                // provably never left the machine
  | 'abort'              // our own deadline fired
  | 'ok_no_url'          // 2xx, unusable body
let mode: Mode = 'ok'

const realFetch = globalThis.fetch
globalThis.fetch = (async (url: unknown) => {
  renders.push(String(url))
  switch (mode) {
    case 'ok':       return new Response(JSON.stringify({ data: [{ url: IDEOGRAM_URL }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    case 'ok_no_url':return new Response(JSON.stringify({ data: [{}] }), { status: 200, headers: { 'content-type': 'application/json' } })
    case 'reject_400':       return new Response('bad prompt', { status: 400 })
    case 'rate_limited_429': return new Response('slow down', { status: 429 })
    case 'ambiguous_500':    return new Response('bad gateway', { status: 502 })
    case 'econnreset': { const e: any = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e }
    case 'dns':        { const e: any = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e }
    case 'abort':      { const e: any = new Error('The operation was aborted'); e.name = 'AbortError'; throw e }
  }
}) as unknown as typeof fetch
afterAll(() => { globalThis.fetch = realFetch })

const CTX = {
  execution: TEST_AUTONOMOUS_GLOBAL,
  project: { projectId: PROJECT_A },
  operation: 'Article Hero Image',
}

/** The writer-fallback loop, reproduced exactly as `hero-image.ts` calls it. */
let attempts = 0
async function writerFallbackLoop() {
  return withRetry(
    () => { attempts += 1; return generateIdeogramV3(CTX, { prompt: 'a grey circle' }) },
    { attempts: 2, label: 'Ideogram hero', baseMs: 1,
      isPermanent: stopIsNotRetryable(dispatchedGenerationIsNotRetryable()) },
  )
}

/** The SAME loop as it was before this patch — the negative control. */
async function writerFallbackLoopUnguarded() {
  return withRetry(
    () => { attempts += 1; return generateIdeogramV3(CTX, { prompt: 'a grey circle' }) },
    { attempts: 2, label: 'Ideogram hero', baseMs: 1 },
  )
}

beforeEach(() => {
  renders = []; spendEvents = []; attempts = 0; stopAllowed = true; mode = 'ok'
  process.env.IDEOGRAM_API_KEY = 'ideogram-key'
})

// ═════════════════════════════════════════════════════════════════════════════
// Transport certainty at the adapter
// ═════════════════════════════════════════════════════════════════════════════

describe('the adapter only claims "not dispatched" when it can prove it', () => {
  it('DNS failure IS provable → ProviderNotDispatchedError, budget RELEASED', async () => {
    mode = 'dns'
    const err = await generateIdeogramV3(CTX, { prompt: 'x' }).catch(e => e)
    // withGovernedSpend rethrows the CAUSE for a not-dispatched claim.
    expect(err).not.toBeInstanceOf(ProviderDispatchUnknownError)
    expect(spendEvents).toEqual(['reserve', 'release'])
  })

  it('ECONNRESET is NOT provable → ambiguous, budget SETTLED', async () => {
    mode = 'econnreset'
    const err = await generateIdeogramV3(CTX, { prompt: 'x' }).catch(e => e)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(err.observation).toBe('response_lost')
    // AMBIGUITY IS NOT A REFUND.
    expect(spendEvents).toEqual(['reserve', 'settle'])
  })

  it('a fired deadline is NOT provable → ambiguous, budget SETTLED', async () => {
    mode = 'abort'
    const err = await generateIdeogramV3(CTX, { prompt: 'x' }).catch(e => e)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(spendEvents).toEqual(['reserve', 'settle'])
  })

  it('a 4xx IS the vendor answering → not dispatched, budget RELEASED', async () => {
    mode = 'reject_400'
    await generateIdeogramV3(CTX, { prompt: 'x' }).catch(e => e)
    expect(spendEvents).toEqual(['reserve', 'release'])
  })

  it('a 5xx is NOT an answer about the work → ambiguous, budget SETTLED', async () => {
    mode = 'ambiguous_500'
    const err = await generateIdeogramV3(CTX, { prompt: 'x' }).catch(e => e)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(spendEvents).toEqual(['reserve', 'settle'])
  })

  it('2xx with no URL → the render happened and cannot be named', async () => {
    mode = 'ok_no_url'
    const err = await generateIdeogramV3(CTX, { prompt: 'x' }).catch(e => e)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(err.observation).toBe('confirmed_evidence_failed')
    expect(spendEvents).toEqual(['reserve', 'settle'])
  })

  it('REGRESSION — no branch names a vendor status as proof of safety by text', () => {
    const src = readFileSync(join(process.cwd(), 'lib/media/image-client.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    // The old shape was `if (res.status < 500)`. Both call sites now defer to the
    // shared rule, so a future edit cannot quietly widen "safe" again.
    expect(src).not.toMatch(/res\.status\s*<\s*500/)
    expect((src.match(/statusProvesNotCreated\(/g) ?? []).length).toBe(2)
    expect((src.match(/classifyTransportFailure\(/g) ?? []).length).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TASK 11 — the bridge safety matrix, through the real retry boundary
// ═════════════════════════════════════════════════════════════════════════════

describe('bridge safety matrix — exactly one paid render', () => {
  it('1. normal success → 1 render', async () => {
    mode = 'ok'
    await expect(writerFallbackLoop()).resolves.toBe(IDEOGRAM_URL)
    expect(renders.length).toBe(1)
    expect(attempts).toBe(1)
  })

  it('2. explicit permanent rejection (400) → 1 render', async () => {
    mode = 'reject_400'
    await writerFallbackLoop().catch(() => {})
    expect(renders.length).toBe(1)
  })

  it('3. ambiguous 5xx → 1 render, and the error still surfaces', async () => {
    mode = 'ambiguous_500'
    const err = await writerFallbackLoop().catch(e => e)
    expect(renders.length).toBe(1)
    expect(attempts).toBe(1)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(spendEvents).toEqual(['reserve', 'settle'])
  })

  it('4. ambiguous transport loss (ECONNRESET) → 1 render', async () => {
    mode = 'econnreset'
    const err = await writerFallbackLoop().catch(e => e)
    expect(renders.length).toBe(1)
    expect(attempts).toBe(1)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
  })

  it('4b. a fired deadline → 1 render', async () => {
    mode = 'abort'
    await writerFallbackLoop().catch(() => {})
    expect(renders.length).toBe(1)
  })

  it('6. provider result invalid after dispatch (2xx, no URL) → 1 render', async () => {
    mode = 'ok_no_url'
    await writerFallbackLoop().catch(() => {})
    expect(renders.length).toBe(1)
  })

  it('7. a PROVEN pre-dispatch failure still retries', async () => {
    mode = 'dns'
    await writerFallbackLoop().catch(() => {})
    // Nothing was ever sent, so a fresh attempt is safe — and existing policy
    // allows it. Two attempts, and neither could have been billed.
    expect(attempts).toBe(2)
    expect(spendEvents).toEqual(['reserve', 'release', 'reserve', 'release'])
  })

  it('7b. a missing credential retries — it never reaches the boundary', async () => {
    delete process.env.IDEOGRAM_API_KEY
    await writerFallbackLoop().catch(() => {})
    expect(attempts).toBe(2)
    expect(renders.length).toBe(0)
    expect(spendEvents).toEqual([])
    process.env.IDEOGRAM_API_KEY = 'ideogram-key'
  })

  it('a 429 stays retryable — existing policy is unchanged', async () => {
    mode = 'rate_limited_429'
    await writerFallbackLoop().catch(() => {})
    // The vendor answered and rendered nothing, so this is the safe class.
    expect(attempts).toBe(2)
    expect(spendEvents).toEqual(['reserve', 'release', 'reserve', 'release'])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Negative controls — the tests fail if the fix is removed
// ═════════════════════════════════════════════════════════════════════════════

describe('NEGATIVE CONTROLS — the old behaviour, demonstrated', () => {
  it('without the authority, an ambiguous 5xx renders TWICE', async () => {
    mode = 'ambiguous_500'
    await writerFallbackLoopUnguarded().catch(() => {})
    expect(attempts).toBe(2)
    expect(renders.length).toBe(2)
  })

  it('without the authority, a lost socket renders TWICE', async () => {
    mode = 'econnreset'
    await writerFallbackLoopUnguarded().catch(() => {})
    expect(renders.length).toBe(2)
  })

  it('removing the structured ambiguity makes the predicate blind', () => {
    // Proves the assertion is load-bearing: a plain Error carrying the same
    // words gets no opinion, which is exactly why the type was needed.
    expect(generationMayAlreadyHaveDispatched(
      new Error('Ideogram API error 502: bad gateway'))).toBe(false)
    expect(generationMayAlreadyHaveDispatched(new ProviderDispatchUnknownError({
      provider: 'ideogram', observation: 'response_lost', detail: 'x' }))).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TASK 10 — ExecutionStopped
// ═════════════════════════════════════════════════════════════════════════════

describe('an operator pause ends the loop instead of being asked twice', () => {
  it('a STOP produces zero renders and zero second attempts', async () => {
    stopAllowed = false
    const err = await writerFallbackLoop().catch(e => e)
    expect(err).toBeInstanceOf(ExecutionStoppedError)
    expect(attempts).toBe(1)
    expect(renders.length).toBe(0)
    // Reserved, then released by the stop path — headroom is not retained.
    expect(spendEvents).toEqual(['reserve', 'release'])
  })

  it('without the composition, the same pause is asked TWICE', async () => {
    stopAllowed = false
    await writerFallbackLoopUnguarded().catch(() => {})
    expect(attempts).toBe(2)
    expect(renders.length).toBe(0)
  })

  it('stop authority stays STRONGER than the generic rule', () => {
    const composed = stopIsNotRetryable(dispatchedGenerationIsNotRetryable())
    const stop = new ExecutionStoppedError({
      reason: 'global_automation_paused', context: 'AUTONOMOUS', scopeKind: 'GLOBAL_ONLY',
      decision: {} as never,
    })
    expect(composed(stop)).toBe(true)
    // …and the composition did not lose either of the other two rules.
    expect(composed(new ProviderDispatchUnknownError({
      provider: 'ideogram', observation: 'response_lost', detail: 'x' }))).toBe(true)
    expect(composed(new Error('provider said 400'))).toBe(true)
    expect(composed(new Error('provider said 429'))).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Both hero call sites carry it
// ═════════════════════════════════════════════════════════════════════════════

describe('hero-image.ts guards BOTH retry loops', () => {
  const body = () => readFileSync(join(process.cwd(), 'lib/article/hero-image.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  it('every withRetry in the hero path passes the composed authority', () => {
    const src = body()
    const loops = (src.match(/withRetry\(/g) ?? []).length
    const guards = (src.match(/isPermanent:\s*stopIsNotRetryable\(dispatchedGenerationIsNotRetryable\(\)\)/g) ?? []).length
    expect(loops).toBeGreaterThan(0)
    expect(guards).toBe(loops)
  })

  it('the writer fallback specifically is guarded', () => {
    const src = body()
    const i = src.indexOf('generateNewsImage(')
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(i, i + 600)).toMatch(/dispatchedGenerationIsNotRetryable/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Scope
// ═════════════════════════════════════════════════════════════════════════════

describe('the ambiguity type is provider-neutral and carries no spend authority', () => {
  it('names no vendor and imports nothing that could spend', () => {
    const src = readFileSync(join(process.cwd(), 'lib/media/job/dispatch.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    for (const forbidden of [/withGovernedSpend/, /reserveSpend|settleSpend|releaseSpend/,
      /ideogram/i, /muapi/i, /elevenlabs/i]) {
      expect(code).not.toMatch(forbidden)
    }
  })
})
