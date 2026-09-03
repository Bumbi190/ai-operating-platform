/**
 * lib/qa/elevenlabs-dispatch-certainty.test.ts — Phase 5B-1 hardening.
 *
 * The same defect `image-client.ts` had, in the voice and sound paths:
 * `ProviderNotDispatchedError` was claimed for EVERY thrown `fetch`. With a 30s
 * `AbortSignal.timeout` on the request, the case that claim cannot support was
 * the routine one — and it cost twice: the reservation was released for audio
 * that may have been billed, and the caller synthesised again.
 *
 * The real `withGovernedSpend` runs here, so "released or settled" is measured.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

const PROJECT_A = '11111111-1111-4111-8111-111111111111'

let calls: string[] = []
let spend: string[] = []

vi.mock('@/lib/cost/budget-gate', async (orig) => ({
  ...(await orig<typeof import('@/lib/cost/budget-gate')>()),
  reserveSpend: async () => { spend.push('reserve'); return {
    allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
    reservationId: 'res-1', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700 } },
  settleSpend:  async () => { spend.push('settle') },
  releaseSpend: async () => { spend.push('release') },
}))

vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return { ...actual, resolveExecutionStopForContract: async () => ({
    allowed: true, context: 'AUTONOMOUS' as const, scopesEvaluated: ['PLATFORM_AUTOMATION' as const],
    resolution: 'RESOLVED' as const, globalPaused: false, projectPaused: null, reason: null, observed: null }) }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit: () => ({
    maybeSingle: async () => ({ data: { id: PROJECT_A }, error: null }) }) }) }) }) }),
}))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10.5, elevenlabs_usd_per_1k_chars: 0.24 }) }))
vi.mock('@/lib/cost/track', () => ({ logVoiceCost: async () => undefined, logLlmCost: async () => undefined, logImageCost: async () => undefined }))

import { withRetry } from '@/lib/media/retry'
import { generateVoiceover } from '@/lib/media/elevenlabs'
import { ProviderDispatchUnknownError } from '@/lib/media/job/dispatch'
import { dispatchedGenerationIsNotRetryable } from '@/lib/media/orchestrator/retry-authority'

type Mode = 'ok' | 'dns' | 'econnreset' | 'abort' | 'reject_400' | 'ambiguous_500'
let mode: Mode = 'ok'

const VOICE_OK = JSON.stringify({
  audio_base64: Buffer.from('fake-audio').toString('base64'),
  alignment: { characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [1] },
})

const realFetch = globalThis.fetch
globalThis.fetch = (async (url: unknown) => {
  calls.push(String(url))
  switch (mode) {
    case 'ok':            return new Response(VOICE_OK, { status: 200, headers: { 'content-type': 'application/json' } })
    case 'reject_400':    return new Response('bad voice', { status: 400 })
    case 'ambiguous_500': return new Response('bad gateway', { status: 502 })
    case 'dns':        { const e: any = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e }
    case 'econnreset': { const e: any = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e }
    case 'abort':      { const e: any = new Error('aborted'); e.name = 'TimeoutError'; throw e }
  }
}) as unknown as typeof fetch
afterAll(() => { globalThis.fetch = realFetch })

let attempts = 0
/** The step2 loop, reproduced exactly as the route now calls it. */
const voiceLoop = () => withRetry(
  () => { attempts += 1; return generateVoiceover('hello', TEST_AUTONOMOUS_GLOBAL, 'victoria', { projectId: PROJECT_A }) },
  { attempts: 2, label: 'ElevenLabs voice', baseMs: 1,
    isPermanent: dispatchedGenerationIsNotRetryable() },
)
/** The same loop as it was before this patch. */
const voiceLoopUnguarded = () => withRetry(
  () => { attempts += 1; return generateVoiceover('hello', TEST_AUTONOMOUS_GLOBAL, 'victoria', { projectId: PROJECT_A }) },
  { attempts: 2, label: 'ElevenLabs voice', baseMs: 1 },
)

beforeEach(() => {
  calls = []; spend = []; attempts = 0; mode = 'ok'
  process.env.ELEVENLABS_API_KEY = 'el-key'
})

describe('ElevenLabs voice — dispatch certainty', () => {
  it('1. normal success → 1 provider call', async () => {
    const r = await voiceLoop()
    expect(calls.length).toBe(1)
    expect(r.audioBuffer.byteLength).toBeGreaterThan(0)
    expect(spend).toEqual(['reserve', 'settle'])
  })

  it('2. DNS is positively proven → retry allowed, budget RELEASED each time', async () => {
    mode = 'dns'
    await voiceLoop().catch(() => {})
    expect(attempts).toBe(2)
    expect(spend).toEqual(['reserve', 'release', 'reserve', 'release'])
  })

  it('3. ECONNRESET → exactly 1 provider call, budget SETTLED', async () => {
    mode = 'econnreset'
    const err = await voiceLoop().catch(e => e)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(calls.length).toBe(1)
    expect(attempts).toBe(1)
    expect(spend).toEqual(['reserve', 'settle'])
  })

  it('4. a fired deadline → exactly 1 provider call', async () => {
    mode = 'abort'
    const err = await voiceLoop().catch(e => e)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(calls.length).toBe(1)
    expect(spend).toEqual(['reserve', 'settle'])
  })

  it('5. 5xx → exactly 1 provider call, budget SETTLED', async () => {
    mode = 'ambiguous_500'
    const err = await voiceLoop().catch(e => e)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
    expect(calls.length).toBe(1)
    expect(spend).toEqual(['reserve', 'settle'])
  })

  it('8. a 4xx is proven not-synthesised → RELEASED, and retryable', async () => {
    mode = 'reject_400'
    await voiceLoop().catch(() => {})
    expect(spend.filter(e => e === 'release').length).toBeGreaterThanOrEqual(1)
    expect(spend).not.toContain('settle')
  })

  it('NEGATIVE CONTROL — without the authority, ECONNRESET synthesises TWICE', async () => {
    mode = 'econnreset'
    await voiceLoopUnguarded().catch(() => {})
    expect(attempts).toBe(2)
    expect(calls.length).toBe(2)
  })

  it('NEGATIVE CONTROL — without the authority, a 5xx synthesises TWICE', async () => {
    mode = 'ambiguous_500'
    await voiceLoopUnguarded().catch(() => {})
    expect(calls.length).toBe(2)
  })

  it('the OLD claim would have released budget for possibly-billed audio', async () => {
    // The precise integrity bug: before the fix an ECONNRESET released. Now it
    // settles, so the estimate stays counted against the budget.
    mode = 'econnreset'
    await voiceLoop().catch(() => {})
    expect(spend).not.toContain('release')
  })
})
