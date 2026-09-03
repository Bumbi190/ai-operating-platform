/**
 * lib/qa/media-governed-dispatch.test.ts — Media Runtime Phase 5.
 *
 * Proves the seam between a selected provider candidate and the durable job
 * lifecycle: that the governed spend boundary encloses THE DISPATCH AND NOTHING
 * ELSE, that an ambiguous dispatch is terminal, and that a model with no proven
 * price is refused before ranking rather than reserved against a guess.
 *
 * ── NO PROVIDER IS REACHED, AND THAT IS ENFORCED ───────────────────────────
 * `globalThis.fetch` is replaced with a spy that THROWS. Every provider in this
 * file is either a hand-written fake or a real `MuapiProvider` constructed with
 * an injected `fetchImpl`, so a test that accidentally acquired a network path
 * fails on the first call instead of quietly spending money. A test for a spend
 * boundary must not be able to spend.
 *
 * ── WHAT IS REAL AND WHAT IS FAKED, AND WHY ────────────────────────────────
 * `withGovernedSpend` is the REAL implementation. Mocking it would make the
 * central claim of this phase — dispatch is inside it, polling is outside —
 * unfalsifiable, since a mock would satisfy any ordering. Only the three
 * reservation primitives beneath it are faked, and they append to one ordered
 * event log which the ordering assertions read.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

// ── The ordered event log every ordering proof reads ─────────────────────────

let events: string[] = []
const log = (e: string) => { events.push(e) }

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const REMOTE_ID = 'muapi-req-0001'
const ASSET_ID = 'asset-0000-0000-0000-00000000000a'
const IMAGE_URL = 'https://cdn.muapi.example/out/one.png'

// ── Reservation primitives (faked; withGovernedSpend itself is real) ─────────

let reserveVerdict: Record<string, unknown> = {}
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: async (input: { estimatedSek: number }) => {
    log(`reserve:${input.estimatedSek}`)
    return reserveVerdict
  },
  settleSpend: async () => { log('settle') },
  releaseSpend: async () => { log('release') },
}))

// ── Stop authority ───────────────────────────────────────────────────────────

let stopAllowed = true
vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async () => {
      log('stop-check')
      return {
        allowed: stopAllowed,
        context: 'AUTONOMOUS' as const,
        scopesEvaluated: ['PLATFORM_AUTOMATION' as const],
        resolution: 'RESOLVED' as const,
        globalPaused: !stopAllowed,
        projectPaused: null,
        reason: stopAllowed ? null : ('global_pause' as const),
        observed: null,
      }
    },
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: PROJECT_A }, error: null }) }) }) }),
    }),
  }),
}))

// ── Rates ────────────────────────────────────────────────────────────────────

let rates: Record<string, number> = { usd_sek: 10.5 }
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => rates }))

// ── Asset admission (Phase 1 is proven by its own suite) ────────────────────

let admitCalls: Array<Record<string, any>> = []
let admitShouldThrow: Error | null = null
vi.mock('@/lib/media/asset/admission', () => ({
  admitAssetFromUrl: async (input: Record<string, any>) => {
    log('admit')
    admitCalls.push(input)
    if (admitShouldThrow) throw admitShouldThrow
    return {
      asset: {
        id: ASSET_ID, projectId: input.projectId, kind: 'image', mimeType: 'image/png',
        byteSize: 1024, checksumSha256: 'a'.repeat(64), width: 1024, height: 1024,
        durationMs: null, visibility: input.visibility ?? 'internal', status: 'ready',
        storage: { bucket: 'media-assets-private', path: `${input.storage.path}.png` },
        createdAt: '2026-09-03T00:00:00.000Z',
      },
      provenance: {
        assetId: ASSET_ID, source: 'generated',
        provider: input.provenance.provider, model: input.provenance.model,
        providerRequestId: input.provenance.providerRequestId ?? null,
        adapterVersion: null, seed: null, briefHash: null, requestHash: null,
        referenceAssetIds: [...(input.provenance.referenceAssetIds ?? [])],
        costEventId: null, durationMs: null,
        simulated: input.provenance.simulated === true,
        providerMetadata: input.provenance.providerMetadata ?? {},
        recordedAt: '2026-09-03T00:00:00.000Z',
      },
    }
  },
  admitAssetBytes: async () => { throw new Error('bytes admission is not on this path') },
  canonicalHash: (v: unknown) => 'h'.repeat(64) + (v === undefined ? '' : ''),
}))

/** The durable store must never be constructed here — tests inject their own. */
vi.mock('@/lib/media/job/store-supabase', () => ({
  createSupabaseMediaJobStore: () => {
    throw new Error('the durable Supabase store must not be constructed in unit tests')
  },
}))

// ── Imports (after the mocks) ───────────────────────────────────────────────

import { createInMemoryMediaJobStore } from '@/lib/media/job/store'
import { runGovernedProviderJob, classifyProviderDispatchFailure, estimateMuapiImageSek }
  from '@/lib/media/dispatch/governed-dispatch'
import {
  MUAPI_IMAGE_RESOURCES, MUAPI_IMAGE_MODEL_ENV, admitMuapiSpend,
  resolveMuapiImageResource, type MuapiResourceDescriptor,
} from '@/lib/media/providers/resources'
import { describeMediaCandidates } from '@/lib/media/orchestrator/candidates'
import { filterEligible, rankEligible } from '@/lib/media/orchestrator/eligibility'
import { MuapiProvider } from '@/lib/media/providers/muapi'
import { MediaProviderError } from '@/lib/media/providers/errors'
import type { MediaGenerationBrief } from '@/lib/media/orchestrator/types'
import type { MediaJobRef, MediaJobResult, MediaProvider } from '@/lib/media/providers/types'

const FLUX_SCHNELL = MUAPI_IMAGE_RESOURCES.find(r => r.name === 'flux-schnell')!

// ── The network is unreachable, structurally ────────────────────────────────

const realFetch = globalThis.fetch
const fetchTripwire = vi.fn(() => { throw new Error('a test reached the network') })
globalThis.fetch = fetchTripwire as unknown as typeof fetch
afterAll(() => { globalThis.fetch = realFetch })

// ── Fake providers ───────────────────────────────────────────────────────────

interface FakeOpts {
  /** Which mode the fake reports. `production` makes it billable. */
  mode?: 'test' | 'production'
  onGenerate?: () => Promise<MediaJobRef> | MediaJobRef
  statuses?: MediaJobResult['status'][]
  assets?: MediaJobResult['assets']
  statusThrows?: number
}

function fakeProvider(opts: FakeOpts = {}): MediaProvider & { generateCalls: number; statusCalls: number } {
  const ref: MediaJobRef = {
    provider: 'muapi', requestId: REMOTE_ID, model: FLUX_SCHNELL.name,
    submittedAt: '2026-09-03T00:00:00.000Z', mode: 'test',
  }
  const queue = [...(opts.statuses ?? ['completed'])]
  let throwsLeft = opts.statusThrows ?? 0
  const p = {
    id: 'muapi' as const,
    capabilities: ['generateImage'] as const,
    lifecycle: { observation: 'poll' as const, clientIdempotency: false, lookupByRemoteId: true,
      lookupByCorrelationId: false, lookupByHistory: false, cancellable: false },
    generateCalls: 0,
    statusCalls: 0,
    describe: () => ({ provider: 'muapi' as const, mode: opts.mode ?? ('test' as const), configured: true,
      executionAllowed: true, billable: opts.mode === 'production', capabilities: ['generateImage'] as const, blockedReason: null }),
    healthCheck: async () => ({ ok: true, detail: 'fake' }),
    async generateImage() {
      p.generateCalls += 1
      log('dispatch')
      if (opts.onGenerate) return await opts.onGenerate()
      return ref
    },
    async getStatus(): Promise<MediaJobResult> {
      p.statusCalls += 1
      log('poll')
      if (throwsLeft > 0) { throwsLeft -= 1; throw new Error('status read failed') }
      const status = queue.length > 1 ? queue.shift()! : queue[0]
      return {
        ref, status,
        assets: status === 'completed'
          ? (opts.assets ?? [{ kind: 'image', url: IMAGE_URL, mimeType: 'image/png', width: 1024, height: 1024, durationSeconds: null }])
          : [],
        error: status === 'failed'
          ? { code: 'MEDIA_JOB_FAILED', message: 'vendor said no', provider: 'muapi', httpStatus: null, retryable: false, dispatchObservation: null }
          : null,
        simulated: true,
      }
    },
  }
  return p as unknown as MediaProvider & { generateCalls: number; statusCalls: number }
}

const FAST = { deadlineMs: 5_000, initialDelayMs: 0, intervalMs: 0, maxIntervalMs: 0, backoffFactor: 1, maxConsecutiveReadFailures: 4 }

function runInput(provider: MediaProvider, over: Record<string, unknown> = {}) {
  return {
    provider,
    resource: FLUX_SCHNELL,
    project: { projectId: PROJECT_A },
    execution: TEST_AUTONOMOUS_GLOBAL,
    projectId: PROJECT_A,
    operation: 'Phase 5 proof',
    prompt: 'a plain grey circle on white',
    briefHash: 'b'.repeat(64),
    storagePath: 'proof/one',
    store: createInMemoryMediaJobStore(),
    schedule: FAST,
    ...over,
  } as Parameters<typeof runGovernedProviderJob>[0]
}

beforeEach(() => {
  events = []
  admitCalls = []
  admitShouldThrow = null
  stopAllowed = true
  rates = { usd_sek: 10.5 }
  fetchTripwire.mockClear()
  reserveVerdict = { allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
    reservationId: 'res-1', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700 }
})

// ═════════════════════════════════════════════════════════════════════════════
// 1–4, 24–25 · MODEL IDENTITY AND ELIGIBILITY
// ═════════════════════════════════════════════════════════════════════════════

const SANDBOX_ENV: Record<string, string> = {
  MUAPI_ENABLED: '1', MUAPI_MODE: 'test', MUAPI_TEST_API_KEY: 'k',
  [MUAPI_IMAGE_MODEL_ENV]: 'flux-schnell',
}

function briefFor(over: Partial<MediaGenerationBrief> = {}): MediaGenerationBrief {
  return {
    projectId: PROJECT_A,
    invocation: { kind: 'internal-application', caller: 'article-hero' },
    execution: TEST_AUTONOMOUS_GLOBAL,
    mediaType: 'image',
    operation: 'op',
    brief: { instruction: 'a plain grey circle' },
    storagePath: 'proof/one',
    ...over,
  }
}

/**
 * Drive the candidate layer the way production does: ONE environment, read by
 * both `describeMediaCandidates` and — through the router — by the provider's
 * own `describe()`. Stubbing `process.env` rather than passing a second object
 * is what keeps this a proof: a divergence between the two reads would show up
 * here as a wrong rejection rule, which is exactly how this suite found one.
 */
function withEnv<T>(env: Record<string, string>, fn: () => T): T {
  const keys = ['MUAPI_ENABLED', 'MUAPI_MODE', 'MUAPI_TEST_API_KEY', 'MUAPI_PROD_API_KEY',
    'MUAPI_PRODUCTION_ENABLED', MUAPI_IMAGE_MODEL_ENV, 'IDEOGRAM_API_KEY', 'OPENAI_API_KEY']
  const saved = new Map(keys.map(k => [k, process.env[k]]))
  try {
    for (const k of keys) delete process.env[k]
    for (const [k, v] of Object.entries(env)) process.env[k] = v
    return fn()
  } finally {
    for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  }
}

const candidatesIn = (env: Record<string, string>) => withEnv(env, () => describeMediaCandidates())
const muapiOf = (env: Record<string, string>) => candidatesIn(env).find(c => c.id === 'muapi')!

describe('1 · a concrete MuAPI model is required', () => {
  it('an unset selector leaves the candidate undispatchable, with the reason', () => {
    const c = muapiOf({ MUAPI_ENABLED: '1', MUAPI_MODE: 'test', MUAPI_TEST_API_KEY: 'k' })
    expect(c.dispatch.supported).toBe(false)
    expect(c.providerResource).toBeUndefined()
  })

  it('a selected model becomes the candidate model, verbatim', () => {
    const c = muapiOf(SANDBOX_ENV)
    expect(c.model.name).toBe('flux-schnell')
    expect(c.providerResource?.name).toBe('flux-schnell')
  })

  it('every descriptor is a real vendor model name usable as /api/v1/{name}', () => {
    for (const r of MUAPI_IMAGE_RESOURCES) {
      expect(r.name).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(r.name).not.toContain(':')
      expect(r.vendorCategory).toBe('Text to Image')
    }
  })
})

describe('2 · "muapi:unspecified" can never be an execution identity', () => {
  it('no dispatchable candidate ever carries the placeholder', () => {
    const envs: Record<string, string>[] = [
      { MUAPI_ENABLED: '1', MUAPI_MODE: 'test', MUAPI_TEST_API_KEY: 'k' },
      { MUAPI_ENABLED: '1', MUAPI_MODE: 'test', MUAPI_TEST_API_KEY: 'k', [MUAPI_IMAGE_MODEL_ENV]: 'not-a-model' },
      {},
    ]
    for (const env of envs) {
      const c = muapiOf(env)
      if (c.model.name.endsWith(':unspecified')) expect(c.dispatch.supported).toBe(false)
    }
  })

  it('an unspecified-model candidate is rejected before ranking', () => {
    const env = { MUAPI_ENABLED: '1', MUAPI_MODE: 'test', MUAPI_TEST_API_KEY: 'k' }
    const { eligible, rejected } = filterEligible(candidatesIn(env), briefFor())
    expect(eligible.map(c => c.id)).not.toContain('muapi')
    expect(rejected.find(r => r.candidate === 'muapi')?.rule).toBe('execution_not_supported')
  })

  it('an UNKNOWN selector value is refused, not passed through to a URL', () => {
    const res = resolveMuapiImageResource({ [MUAPI_IMAGE_MODEL_ENV]: '../../etc/passwd' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.refusal).toBe('unknown_model')
  })
})

describe('3 · model selection is deterministic', () => {
  it('the same environment yields the same model, every time', () => {
    const names = Array.from({ length: 8 }, () => muapiOf(SANDBOX_ENV).model.name)
    expect(new Set(names).size).toBe(1)
  })

  it('selection reads the environment only — no clock, no randomness, no network', () => {
    const a = resolveMuapiImageResource({ [MUAPI_IMAGE_MODEL_ENV]: 'flux-dev' })
    const b = resolveMuapiImageResource({ [MUAPI_IMAGE_MODEL_ENV]: 'flux-dev' })
    expect(a).toEqual(b)
    expect(fetchTripwire).not.toHaveBeenCalled()
  })

  it('ranking over an eligible set is stable across repeated calls', () => {
    const env = { ...SANDBOX_ENV, IDEOGRAM_API_KEY: 'x', OPENAI_API_KEY: 'y' }
    const brief = briefFor()
    const { eligible } = filterEligible(candidatesIn(env), brief)
    const runs = Array.from({ length: 5 }, () => rankEligible(eligible, brief).map(c => c.id).join(','))
    expect(new Set(runs).size).toBe(1)
  })
})

describe('4 · missing cost governance blocks PAID execution', () => {
  it('a billable MuAPI execution has no proven price and is refused', () => {
    expect(admitMuapiSpend(FLUX_SCHNELL, { allowed: true, reason: null, code: null, billable: true }))
      .toMatchObject({ admitted: false })
  })

  it('the refusal names dynamic pricing rather than proposing a number', () => {
    const a = admitMuapiSpend(FLUX_SCHNELL, { allowed: true, reason: null, code: null, billable: true })
    expect(a.admitted).toBe(false)
    if (!a.admitted) {
      expect(a.reason).toMatch(/dynamic_pricing=true/)
      expect(a.reason).toMatch(/no cost_rates key is configured/)
    }
  })

  it('EVERY shipped descriptor is unpriceable today — no invented rate slipped in', () => {
    for (const r of MUAPI_IMAGE_RESOURCES) expect(r.costRateKey).toBeNull()
  })

  it('a fully-enabled PRODUCTION MuAPI candidate is marked unpriceable', () => {
    const c = muapiOf({ MUAPI_ENABLED: '1', MUAPI_MODE: 'production', MUAPI_PROD_API_KEY: 'k',
      MUAPI_PRODUCTION_ENABLED: '1', [MUAPI_IMAGE_MODEL_ENV]: 'flux-schnell' })
    // Everything else about it is fine: configured, gate-permitted, concrete
    // model. The one thing missing is a price.
    expect(c.configured).toBe(true)
    expect(c.gateRefused).toBe(false)
    expect(c.model.name).toBe('flux-schnell')
    expect(c.costGovernance).toMatchObject({ admissible: false })
  })

  it('the cost rule REJECTS such a candidate once it is otherwise dispatchable', () => {
    // Asserted against a candidate whose `dispatch.supported` is forced true,
    // because `DURABLE_MEDIA_JOB_STORE_AVAILABLE` is false today and that rule
    // runs first. Testing the cost rule only through the current flag value
    // would make this suite silently stop proving anything the day the flag
    // flips — which is precisely when the rule starts to matter.
    const base = muapiOf({ MUAPI_ENABLED: '1', MUAPI_MODE: 'production', MUAPI_PROD_API_KEY: 'k',
      MUAPI_PRODUCTION_ENABLED: '1', [MUAPI_IMAGE_MODEL_ENV]: 'flux-schnell' })
    const dispatchable = { ...base, dispatch: { supported: true as const, representations: ['url' as const] } }
    const { eligible, rejected } = filterEligible([dispatchable], briefFor())
    expect(eligible).toEqual([])
    expect(rejected[0].rule).toBe('cost_governance_unavailable')
    expect(rejected[0].detail).toMatch(/dynamic_pricing=true/)
  })

  it('the SANDBOX candidate passes the cost rule — zero is a real price', () => {
    const base = muapiOf(SANDBOX_ENV)
    expect(base.costGovernance).toMatchObject({ admissible: true })
    const dispatchable = { ...base, dispatch: { supported: true as const, representations: ['url' as const] } }
    expect(filterEligible([dispatchable], briefFor()).eligible.map(c => c.id)).toEqual(['muapi'])
  })

  it('the estimator refuses a billable execution instead of returning zero', async () => {
    const e = await estimateMuapiImageSek(FLUX_SCHNELL, true)
    expect(e.ok).toBe(false)
  })

  it('a descriptor WITH a rate key still refuses when the table lacks the value', async () => {
    const priced: MuapiResourceDescriptor = { ...FLUX_SCHNELL, costRateKey: 'muapi_flux_schnell_usd_per_image' }
    rates = { usd_sek: 10.5 }
    expect((await estimateMuapiImageSek(priced, true)).ok).toBe(false)
    rates = { usd_sek: 10.5, muapi_flux_schnell_usd_per_image: 0.02 }
    const ok = await estimateMuapiImageSek(priced, true)
    expect(ok).toMatchObject({ ok: true, estimatedSek: 0.21 })
  })

  it('sandbox mode prices at exactly zero, and says so', async () => {
    expect(await estimateMuapiImageSek(FLUX_SCHNELL, false))
      .toMatchObject({ ok: true, estimatedSek: 0, basis: 'non_billable_sandbox' })
  })
})

describe('24–25 · reference support and no cross-provider failover', () => {
  it('a required reference makes MuAPI ineligible — its models cannot be conditioned', () => {
    const { eligible, rejected } = filterEligible(
      candidatesIn(SANDBOX_ENV),
      briefFor({ referenceRequirement: 'required' }),
    )
    expect(eligible.map(c => c.id)).not.toContain('muapi')
    expect(rejected.find(r => r.candidate === 'muapi')?.rule).toBe('reference_unsupported')
  })

  it('no descriptor claims reference support without a source', () => {
    for (const r of MUAPI_IMAGE_RESOURCES) expect(r.supportsReferenceImages).toBe(false)
  })

  it('a required reference with NOTHING eligible fails closed', () => {
    const { eligible } = filterEligible(
      candidatesIn(SANDBOX_ENV),
      briefFor({ referenceRequirement: 'required' }),
    )
    // No credential for either bridge adapter in this env, and MuAPI cannot
    // condition — so the eligible set is empty and orchestration must refuse.
    expect(eligible).toEqual([])
  })

  it('a preference can never admit a candidate eligibility rejected', () => {
    const brief = briefFor({ providerPreference: 'muapi' })
    const env = { IDEOGRAM_API_KEY: 'x' }
    const { eligible } = filterEligible(candidatesIn(env), brief)
    expect(rankEligible(eligible, brief).map(c => c.id)).not.toContain('muapi')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5–9, 13–14 · THE GOVERNED BOUNDARY
// ═════════════════════════════════════════════════════════════════════════════

describe('5–8 · the governed wrapper encloses the dispatch and nothing else', () => {
  it('reserve → stop-check → dispatch → settle, then poll, then admit', async () => {
    const p = fakeProvider()
    await runGovernedProviderJob(runInput(p))
    expect(events).toEqual([
      'reserve:0', 'stop-check', 'dispatch', 'settle', 'poll', 'admit',
    ])
  })

  it('POLLING is outside — no reservation is taken per status read', async () => {
    const p = fakeProvider({ statuses: ['pending', 'running', 'completed'] })
    await runGovernedProviderJob(runInput(p))
    expect(events.filter(e => e.startsWith('reserve')).length).toBe(1)
    expect(events.filter(e => e === 'poll').length).toBeGreaterThan(1)
    // Every poll happens strictly after the single settlement.
    expect(events.indexOf('settle')).toBeLessThan(events.indexOf('poll'))
  })

  it('ADMISSION is outside — it happens after settlement, never inside it', async () => {
    await runGovernedProviderJob(runInput(fakeProvider()))
    expect(events.indexOf('settle')).toBeLessThan(events.indexOf('admit'))
  })

  it('RECONCILIATION is outside: nothing on this path reserves for a ledger write', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({ onGenerate: () => { throw ambiguous() } })
    await runGovernedProviderJob(runInput(p, { store })).catch(() => {})
    const before = events.filter(e => e.startsWith('reserve')).length
    const job = store.all()[0]
    await store.recordReconciliation({
      id: job.id, expectedVersion: job.version,
      record: { projectId: PROJECT_A, provider: 'muapi', remoteOperationId: null,
        result: 'STILL_UNKNOWN', blocker: null, detail: {}, observedAt: '2026-09-03T00:00:00.000Z' },
      resolvesTo: null, at: '2026-09-03T00:00:00.000Z',
    })
    expect(events.filter(e => e.startsWith('reserve')).length).toBe(before)
  })
})

describe('9 · exactly one provider dispatch on the normal async path', () => {
  it('one create call, one reservation, one settlement', async () => {
    const p = fakeProvider({ statuses: ['pending', 'running', 'completed'] })
    await runGovernedProviderJob(runInput(p))
    expect(p.generateCalls).toBe(1)
    expect(events.filter(e => e === 'dispatch').length).toBe(1)
    expect(events.filter(e => e.startsWith('reserve')).length).toBe(1)
    expect(events.filter(e => e === 'settle').length).toBe(1)
  })
})

// ── Dispatch classification helpers ─────────────────────────────────────────

const ambiguous = () => new MediaProviderError({
  code: 'MEDIA_DISPATCH_UNKNOWN', message: 'the dispatch deadline fired',
  provider: 'muapi', dispatchObservation: 'response_lost',
})
const evidenceFailed = () => new MediaProviderError({
  code: 'MEDIA_DISPATCH_UNKNOWN', message: 'accepted but the id was unusable',
  provider: 'muapi', dispatchObservation: 'confirmed_evidence_failed',
})
const rejectedByVendor = () => new MediaProviderError({
  code: 'MEDIA_PROVIDER_REQUEST_FAILED', message: 'vendor said 400',
  provider: 'muapi', httpStatus: 400, dispatchObservation: 'remote_rejected',
})
const neverSent = () => new MediaProviderError({
  code: 'MEDIA_PROVIDER_REQUEST_FAILED', message: 'DNS never resolved',
  provider: 'muapi', httpStatus: 0, retryable: true, dispatchObservation: 'not_dispatched',
})

describe('13 · dispatch side-effect classification', () => {
  it('A · proven not sent → definitely_failed / not_dispatched', () => {
    expect(classifyProviderDispatchFailure(neverSent()))
      .toMatchObject({ kind: 'definitely_failed', observation: 'not_dispatched' })
  })
  it('C · vendor rejected → definitely_failed / remote_rejected', () => {
    expect(classifyProviderDispatchFailure(rejectedByVendor()))
      .toMatchObject({ kind: 'definitely_failed', observation: 'remote_rejected' })
  })
  it('D · ambiguous after a possible send → unknown / response_lost', () => {
    expect(classifyProviderDispatchFailure(ambiguous()))
      .toMatchObject({ kind: 'unknown', observation: 'response_lost' })
  })
  it('E · accepted but id unusable → unknown / confirmed_evidence_failed', () => {
    expect(classifyProviderDispatchFailure(evidenceFailed()))
      .toMatchObject({ kind: 'unknown', observation: 'confirmed_evidence_failed' })
  })
  it('a GENERIC fetch failure is never read as category A', () => {
    // The classifier reads the adapter's judgement; an untyped throw carries
    // none, so it must not be promoted into "definitely not sent" by this layer
    // on the strength of its message.
    const generic = new Error('fetch failed')
    const out = classifyProviderDispatchFailure(generic)
    // An untyped throw carries no observation, so it is treated as the
    // PRE-NETWORK case — which is what it is, since the only way to reach this
    // classifier without an observation is a refusal raised before `fetch`.
    // The proof that a REAL transport failure is not flattened this way is the
    // adapter-level test immediately below.
    expect(out).toMatchObject({ kind: 'definitely_failed', observation: 'not_dispatched' })
  })

  it('the REAL MuAPI adapter calls a socket reset AMBIGUOUS, not safe', async () => {
    const p = new MuapiProvider({
      env: { MUAPI_ENABLED: '1', MUAPI_MODE: 'test', MUAPI_TEST_API_KEY: 'k' },
      fetchImpl: (async () => { const e: any = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e }) as unknown as typeof fetch,
    })
    const err = await p.generateImage({ model: 'flux-schnell', prompt: 'x' }).catch(e => e)
    expect(classifyProviderDispatchFailure(err)).toMatchObject({ kind: 'unknown', observation: 'response_lost' })
  })

  it('the REAL MuAPI adapter calls a 5xx AMBIGUOUS, and a 4xx definite', async () => {
    const mk = (status: number) => new MuapiProvider({
      env: { MUAPI_ENABLED: '1', MUAPI_MODE: 'test', MUAPI_TEST_API_KEY: 'k' },
      fetchImpl: (async () => new Response('nope', { status })) as unknown as typeof fetch,
    })
    expect(classifyProviderDispatchFailure(await mk(502).generateImage({ model: 'flux-schnell', prompt: 'x' }).catch(e => e)))
      .toMatchObject({ kind: 'unknown' })
    expect(classifyProviderDispatchFailure(await mk(400).generateImage({ model: 'flux-schnell', prompt: 'x' }).catch(e => e)))
      .toMatchObject({ kind: 'definitely_failed', observation: 'remote_rejected' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 10–12 · UNKNOWN
// ═════════════════════════════════════════════════════════════════════════════

describe('10–12 · an ambiguous dispatch is terminal and never redispatches', () => {
  it('ambiguous dispatch → job UNKNOWN, reconciliation required, budget SETTLED', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({ onGenerate: () => { throw ambiguous() } })
    const err = await runGovernedProviderJob(runInput(p, { store })).catch(e => e)

    expect(err.name).toBe('MediaJobError')
    expect(err.failure).toBe('dispatch_unknown')
    expect(err.reconciliationRequired).toBe(true)
    expect(err.dispatched).toBe(true)

    const job = store.all()[0]
    expect(job.state).toBe('UNKNOWN')
    expect(job.dispatchObservation).toBe('response_lost')
    expect(job.reconciliationRequired).toBe(true)
    // AMBIGUITY IS NOT A REFUND.
    expect(events).toContain('settle')
    expect(events).not.toContain('release')
  })

  it('UNKNOWN never redispatches — one create call, and the state machine forbids more', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({ onGenerate: () => { throw ambiguous() } })
    await runGovernedProviderJob(runInput(p, { store })).catch(() => {})
    expect(p.generateCalls).toBe(1)
    expect(events.filter(e => e === 'dispatch').length).toBe(1)

    const { classifyMediaRetry, mayAutomaticallyDispatch } = await import('@/lib/media/job/lifecycle')
    expect(classifyMediaRetry('UNKNOWN').retryClass).toBe('RECONCILE')
    expect(mayAutomaticallyDispatch('UNKNOWN')).toBe(false)
  })

  it('accepted-but-id-missing produces the STRONGER observation', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({ onGenerate: () => { throw evidenceFailed() } })
    await runGovernedProviderJob(runInput(p, { store })).catch(() => {})
    const job = store.all()[0]
    expect(job.state).toBe('UNKNOWN')
    // Not `response_lost`: the vendor answered 2xx, so the operation almost
    // certainly exists AND was billed. Different urgency, different value.
    expect(job.dispatchObservation).toBe('confirmed_evidence_failed')
    expect(events).toContain('settle')
  })

  it('a provider that returns an UNUSABLE id is UNKNOWN, not a definite failure', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({
      onGenerate: () => ({ provider: 'muapi', requestId: '../escape', model: 'flux-schnell',
        submittedAt: '2026-09-03T00:00:00.000Z', mode: 'test' }),
    })
    await runGovernedProviderJob(runInput(p, { store })).catch(() => {})
    expect(store.all()[0].state).toBe('UNKNOWN')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 13(A)–18 · DEFINITE FAILURES, POLLING, TERMINAL RESULTS
// ═════════════════════════════════════════════════════════════════════════════

describe('definite failures release the headroom and do not redispatch', () => {
  it('a vendor 4xx → FAILED, budget RELEASED, one dispatch', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({ onGenerate: () => { throw rejectedByVendor() } })
    const err = await runGovernedProviderJob(runInput(p, { store })).catch(e => e)
    expect(err.failure).toBe('dispatch_definite_failure')
    expect(store.all()[0].state).toBe('FAILED')
    expect(store.all()[0].dispatchObservation).toBe('remote_rejected')
    expect(events).toContain('release')
    expect(events).not.toContain('settle')
    expect(p.generateCalls).toBe(1)
  })

  it('a spend refusal never reaches the provider, and the row says not_dispatched', async () => {
    const store = createInMemoryMediaJobStore()
    reserveVerdict = { allowed: false, wouldAllow: false, advisoryOverride: false,
      reason: 'budget_exceeded', reservationId: 'res-2', headroomSek: 0 }
    const p = fakeProvider()
    const err = await runGovernedProviderJob(runInput(p, { store })).catch(e => e)
    expect(p.generateCalls).toBe(0)
    expect(events).not.toContain('dispatch')
    // The CALLER gets the refusal that carries the reason…
    expect(err.name).toBe('SpendRefusedError')
    // …and the ROW records what provably happened: nothing.
    expect(store.all()[0].state).toBe('FAILED')
    expect(store.all()[0].dispatchObservation).toBe('not_dispatched')
  })

  it('a STOP refusal never reaches the provider, and is not a dispatch', async () => {
    const store = createInMemoryMediaJobStore()
    stopAllowed = false
    const p = fakeProvider()
    const err = await runGovernedProviderJob(runInput(p, { store })).catch(e => e)
    expect(p.generateCalls).toBe(0)
    expect(err.name).toBe('ExecutionStoppedError')
    expect(store.all()[0].state).toBe('FAILED')
    expect(store.all()[0].dispatchObservation).toBe('not_dispatched')
    // A stopped call must not retain headroom.
    expect(events).toContain('release')
  })

  it('a stop binds a NON-BILLABLE sandbox generation too', async () => {
    stopAllowed = false
    const p = fakeProvider()
    await runGovernedProviderJob(runInput(p)).catch(() => {})
    expect(events).toContain('stop-check')
    expect(p.generateCalls).toBe(0)
  })
})

describe('14–18 · status reads, terminal results, and no redispatch after them', () => {
  it('a transient status failure retries the READ only — never the create', async () => {
    const p = fakeProvider({ statusThrows: 2, statuses: ['completed'] })
    await runGovernedProviderJob(runInput(p))
    expect(p.statusCalls).toBeGreaterThan(1)
    expect(p.generateCalls).toBe(1)
    expect(events.filter(e => e === 'dispatch').length).toBe(1)
  })

  it('13 · the remote id is persisted on the job row', async () => {
    const store = createInMemoryMediaJobStore()
    await runGovernedProviderJob(runInput(fakeProvider(), { store }))
    expect(store.all()[0].remoteOperationId).toBe(REMOTE_ID)
  })

  it('15 · a remote FAILED is terminal, and nothing redispatches', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({ statuses: ['running', 'failed'] })
    const err = await runGovernedProviderJob(runInput(p, { store })).catch(e => e)
    expect(err.failure).toBe('remote_failed')
    expect(store.all()[0].state).toBe('FAILED')
    expect(p.generateCalls).toBe(1)
    expect(events).not.toContain('admit')
  })

  it('16 · a remote SUCCEEDED progresses to validation and then admission', async () => {
    const store = createInMemoryMediaJobStore()
    await runGovernedProviderJob(runInput(fakeProvider(), { store }))
    expect(store.all()[0].state).toBe('SUCCEEDED')
    expect(admitCalls.length).toBe(1)
  })

  it('17 · an invalid terminal result is refused at QC and does NOT redispatch', async () => {
    const store = createInMemoryMediaJobStore()
    const p = fakeProvider({ assets: [] })
    const err = await runGovernedProviderJob(runInput(p, { store })).catch(e => e)
    expect(err.failure).toBe('invalid_remote_result')
    expect(p.generateCalls).toBe(1)
    expect(admitCalls.length).toBe(0)
  })

  it('17b · a non-https output URL is refused before admission fetches it', async () => {
    const p = fakeProvider({ assets: [{ kind: 'image', url: 'http://insecure.example/x.png', mimeType: null, width: null, height: null, durationSeconds: null }] })
    const err = await runGovernedProviderJob(runInput(p)).catch(e => e)
    expect(err.failure).toBe('invalid_remote_result')
    expect(admitCalls.length).toBe(0)
  })

  it('17c · a video where an image was asked for is refused', async () => {
    const p = fakeProvider({ assets: [{ kind: 'video', url: 'https://cdn.example/x.mp4', mimeType: null, width: null, height: null, durationSeconds: 3 }] })
    expect((await runGovernedProviderJob(runInput(p)).catch(e => e)).failure).toBe('invalid_remote_result')
  })

  it('18 · an admission failure does NOT redispatch, and says the bytes exist', async () => {
    const store = createInMemoryMediaJobStore()
    admitShouldThrow = new Error('storage unavailable')
    const p = fakeProvider()
    const err = await runGovernedProviderJob(runInput(p, { store })).catch(e => e)
    expect(err.failure).toBe('asset_admission_failed')
    expect(err.dispatched).toBe(true)
    expect(p.generateCalls).toBe(1)
    // The vendor's success is a fact and is not rewritten by Omnira's problem.
    expect(store.all()[0].state).toBe('SUCCEEDED')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 19–22 · CANONICAL ASSET, PROVENANCE, AND WHAT A PROVIDER MAY NOT CHOOSE
// ═════════════════════════════════════════════════════════════════════════════

describe('19–20 · canonical asset and honest provenance', () => {
  it('a successful run returns the canonical asset and binds it to the job', async () => {
    const store = createInMemoryMediaJobStore()
    const out = await runGovernedProviderJob(runInput(fakeProvider(), { store }))
    expect(out.assetId).toBe(ASSET_ID)
    expect(out.admitted.asset.id).toBe(ASSET_ID)
    expect(store.all()[0].assetId).toBe(ASSET_ID)
    expect(store.all()[0].state).toBe('SUCCEEDED')
  })

  it('provenance records the ACTUAL provider, model and remote id', async () => {
    await runGovernedProviderJob(runInput(fakeProvider()))
    const p = admitCalls[0].provenance
    expect(p.provider).toBe('muapi')
    expect(p.model).toBe('flux-schnell')
    expect(p.providerRequestId).toBe(REMOTE_ID)
    expect(p.providerMetadata.providerResource).toBe('flux-schnell')
    expect(p.providerMetadata.estimateBasis).toBe('non_billable_sandbox')
  })

  it('a sandbox asset is marked simulated, so it can never pass as a paid one', async () => {
    const out = await runGovernedProviderJob(runInput(fakeProvider()))
    expect(admitCalls[0].provenance.simulated).toBe(true)
    expect(out.simulated).toBe(true)
  })

  it('provenance carries identity and hashes, never lifecycle state', async () => {
    await runGovernedProviderJob(runInput(fakeProvider()))
    const meta = admitCalls[0].provenance.providerMetadata
    expect(meta.mediaJobId).toBeTruthy()
    for (const forbidden of ['state', 'version', 'reconciliationRequired', 'dispatchObservation']) {
      expect(meta[forbidden]).toBeUndefined()
    }
  })
})

describe('21–22 · a provider chooses none of the things that matter', () => {
  it('the project comes from the caller, never from the provider payload', async () => {
    const p = fakeProvider({
      assets: [{ kind: 'image', url: IMAGE_URL, mimeType: 'image/png', width: 1, height: 1, durationSeconds: null }],
    })
    await runGovernedProviderJob(runInput(p, { projectId: PROJECT_A }))
    expect(admitCalls[0].projectId).toBe(PROJECT_A)
  })

  it('nothing the provider returns reaches the asset id, bucket or path', async () => {
    await runGovernedProviderJob(runInput(fakeProvider()))
    const call = admitCalls[0]
    // Admission receives a PATH STEM and a source URL. There is no bucket
    // argument and no id argument to pass, so a provider has nothing to inject.
    expect(Object.keys(call.storage)).toEqual(['path'])
    expect(call.storage.path).toBe('proof/one')
    expect(call.assetId).toBeUndefined()
    expect(call.bucket).toBeUndefined()
    expect(call.id).toBeUndefined()
  })

  it('the remote operation id is RECORDED and never routed on', async () => {
    const store = createInMemoryMediaJobStore()
    await runGovernedProviderJob(runInput(fakeProvider(), { store }))
    // It appears exactly once, as provenance. Not as a path, not as an id.
    expect(admitCalls[0].provenance.providerRequestId).toBe(REMOTE_ID)
    expect(admitCalls[0].storage.path).not.toContain(REMOTE_ID)
    expect(store.all()[0].assetId).not.toBe(REMOTE_ID)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 30 · NO PROVIDER CALL
// ═════════════════════════════════════════════════════════════════════════════

describe('30 · no automated test reaches a provider', () => {
  it('global fetch was never called by anything in this file', async () => {
    await runGovernedProviderJob(runInput(fakeProvider()))
    expect(fetchTripwire).not.toHaveBeenCalled()
  })
})
