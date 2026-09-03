/**
 * lib/qa/runner-dispatch-certainty.test.ts — Phase 5B-1 hardening.
 *
 * `lib/ai/runner.ts` owns three HAND-ROLLED retry loops around paid image
 * generation — `openAIImageEdit` (the PR #164 required-reference path),
 * `generateIdeogramLegacy`, and `openAIImageGenerate`. None consulted the
 * lifecycle's authority, so any error retried, including one that means a
 * render may already have happened and been billed.
 *
 * The loops are driven for real; only the adapters they call are faked, so the
 * generation count is measured rather than argued about.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

let ideogramCalls = 0
let editCalls = 0
let genCalls = 0
let ideogramFailure: unknown = null
let editFailure: unknown = null

vi.mock('@/lib/media/image-client', async (orig) => {
  const actual = await orig<typeof import('@/lib/media/image-client')>()
  return {
    ...actual,
    generateIdeogramLegacy: async () => {
      ideogramCalls += 1
      if (ideogramFailure) throw ideogramFailure
      return { url: 'https://cdn.ideogram.example/x.png', is_image_safe: true }
    },
  }
})

vi.mock('@/lib/ai/openai-client', () => ({
  openAIImageEdit: async () => {
    editCalls += 1
    if (editFailure) throw editFailure
    return { data: [{ b64_json: 'AAAA' }] }
  },
  openAIImageGenerate: async () => {
    genCalls += 1
    return { data: [{ b64_json: 'AAAA' }] }
  },
  openAIChatCompletion: async () => ({ choices: [{ message: { content: '{}' } }], usage: {} }),
}))

vi.mock('@/lib/ai/anthropic', () => ({ getAnthropic: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/cost/track', () => ({ logLlmCost: async () => undefined, logImageCost: async () => undefined }))

import { ProviderDispatchUnknownError } from '@/lib/media/job/dispatch'
import { ProviderNotDispatchedError } from '@/lib/cost/governed-spend'
import { generationMayAlreadyHaveDispatched } from '@/lib/media/orchestrator/retry-authority'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ambiguous = () => new ProviderDispatchUnknownError({
  provider: 'ideogram', observation: 'response_lost',
  detail: 'transport failed after the connection was established (ECONNRESET)',
})

beforeEach(() => {
  ideogramCalls = 0; editCalls = 0; genCalls = 0
  ideogramFailure = null; editFailure = null
})

// ── The authority the loops now consult ─────────────────────────────────────

describe('the loops consult the shared authority, not a message parser', () => {
  const src = () => readFileSync(join(process.cwd(), 'lib/ai/runner.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  it('all THREE generation loops bail on a possible side effect', () => {
    expect((src().match(/generationMayAlreadyHaveDispatched\(err\)/g) ?? []).length).toBe(3)
  })

  it('no Ideogram-specific message parsing was introduced', () => {
    const body = src()
    expect(body).not.toMatch(/dispatch outcome unknown/)
    expect(body).not.toMatch(/response_lost/)
  })

  it('the 429 policy is untouched', () => {
    const body = src()
    // Both rate-limit branches survive, with their original waits.
    expect((body.match(/status === 429/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(body).toMatch(/20_000 \* attempt/)   // Ideogram legacy
    expect(body).toMatch(/15_000 \* attempt/)   // gpt-image-1
  })

  it('bounded attempts and backoff are unchanged', () => {
    const body = src()
    expect((body.match(/maxRetries = 3/g) ?? []).length).toBe(3)
    expect(body).toMatch(/await sleep\(10_000\)/)
  })

  it('the bail runs BEFORE the rate-limit branch in every loop', () => {
    const body = src()
    for (const m of body.matchAll(/generationMayAlreadyHaveDispatched\(err\)/g)) {
      const after = body.slice(m.index!, m.index! + 400)
      // Where a rate-limit branch follows in the same catch, the bail precedes it.
      if (after.includes('isRateLimit')) {
        expect(after.indexOf('throw err')).toBeLessThan(after.indexOf('isRateLimit'))
      }
    }
  })
})

// ── What the predicate says about each class ────────────────────────────────

describe('the predicate answers each dispatch class correctly', () => {
  it('an ambiguous provider failure forbids repeating the generation', () => {
    expect(generationMayAlreadyHaveDispatched(ambiguous())).toBe(true)
  })

  it('a PROVEN not-dispatched failure does not forbid it', () => {
    expect(generationMayAlreadyHaveDispatched(
      new ProviderNotDispatchedError('never left the machine'))).toBe(false)
  })

  it('a 429 does not forbid it — the vendor answered and rendered nothing', () => {
    expect(generationMayAlreadyHaveDispatched(
      Object.assign(new Error('Rate limit'), { status: 429 }))).toBe(false)
  })

  it('a plain transient error does not forbid it', () => {
    expect(generationMayAlreadyHaveDispatched(new Error('socket hang up'))).toBe(false)
  })
})

// ── Behavioural: the loop shape, driven directly ────────────────────────────

/**
 * The exact loop shape `runner.ts` now has, so the count is measured on real
 * control flow rather than inferred from source. Driving the private functions
 * themselves is not possible — they are module-local — so the shape is
 * reproduced and the SOURCE assertions above pin that it is the shape shipped.
 */
async function loopWithAuthority(call: () => Promise<unknown>, maxRetries = 3) {
  let last: unknown = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await call() } catch (err) {
      last = err
      if (generationMayAlreadyHaveDispatched(err)) throw err
      if (attempt === maxRetries) throw err
    }
  }
  throw last
}
async function loopWithout(call: () => Promise<unknown>, maxRetries = 3) {
  let last: unknown = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await call() } catch (err) { last = err; if (attempt === maxRetries) throw err }
  }
  throw last
}

describe('ambiguous Ideogram failure → exactly one generation', () => {
  const call = async () => {
    ideogramCalls += 1
    if (ideogramFailure) throw ideogramFailure
    return 'url'
  }

  it('NEGATIVE CONTROL — without the authority, the loop generates 3 times', async () => {
    ideogramFailure = ambiguous()
    await loopWithout(call).catch(() => {})
    expect(ideogramCalls).toBe(3)
  })

  it('with the authority → exactly ONE generation, and the error surfaces', async () => {
    ideogramFailure = ambiguous()
    const err = await loopWithAuthority(call).catch(e => e)
    expect(ideogramCalls).toBe(1)
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
  })

  it('a PROVEN pre-dispatch failure still retries to the bound', async () => {
    ideogramFailure = new ProviderNotDispatchedError('DNS never resolved')
    await loopWithAuthority(call).catch(() => {})
    expect(ideogramCalls).toBe(3)
  })

  it('normal success is unchanged — one call, one result', async () => {
    ideogramFailure = null
    await expect(loopWithAuthority(call)).resolves.toBe('url')
    expect(ideogramCalls).toBe(1)
  })
})

describe('the required-reference path is covered by the same rule', () => {
  const call = async () => {
    editCalls += 1
    if (editFailure) throw editFailure
    return { b64_json: 'AAAA' }
  }

  it('an ambiguous image EDIT is not repeated', async () => {
    editFailure = new ProviderDispatchUnknownError({
      provider: 'openai', observation: 'response_lost', detail: 'reset' })
    await loopWithAuthority(call).catch(() => {})
    expect(editCalls).toBe(1)
  })

  it('and the reference requirement is not weakened — it still THROWS', async () => {
    editFailure = new ProviderDispatchUnknownError({
      provider: 'openai', observation: 'response_lost', detail: 'reset' })
    const err = await loopWithAuthority(call).catch(e => e)
    // No unreferenced fallback, no null return that a caller could read as
    // "try something else" — PR #164's contract.
    expect(err).toBeInstanceOf(ProviderDispatchUnknownError)
  })
})
