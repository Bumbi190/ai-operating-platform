/**
 * lib/qa/media-orchestration-retry-authority.test.ts — Phase 5B-0.
 *
 * ── THE DEFECT THIS PINS ───────────────────────────────────────────────────
 * `lib/media/job/lifecycle.ts` guarantees that an ambiguous dispatch is never
 * automatically repeated. That guarantee holds INSIDE `runMediaJob` and stops at
 * the orchestrator's edge: a caller that wraps `orchestrateImageGeneration` in a
 * retry loop re-enters from the top, mints a NEW media job, and dispatches
 * again — never consulting the state machine, because from outside it is one
 * function that threw.
 *
 * `lib/article/hero-image.ts` is that caller. So this suite drives the retry
 * loop for real and counts what actually reached the wire.
 *
 * ── HOW MUCH OF THIS IS REAL ───────────────────────────────────────────────
 * Everything on the path under test:
 *
 *   real `withRetry`            (article-hero-image.test.ts stubs it; here it must run)
 *   real `orchestrateImageGeneration`, `filterEligible`, `describeMediaCandidates`
 *   real `MuapiProvider` and its transport classification
 *   real `runMediaJob`, `lifecycle.ts`, the in-memory store contract
 *   real `withGovernedSpend`
 *
 * Only the LEAVES are faked: the socket, the database, and the reservation
 * primitives. In particular the ambiguous dispatch is produced by throwing a
 * genuine `ECONNRESET` out of `fetch`, so the UNKNOWN under test is classified
 * by the shipping adapter rather than hand-constructed.
 *
 * ── THE GATE IS SIMULATED OPEN, ON PURPOSE ─────────────────────────────────
 * `DURABLE_MEDIA_JOB_STORE_AVAILABLE` is `false` in production, which is the
 * only reason the defect is unreachable today. A test that respected the flag
 * would prove nothing, because the candidate would be filtered out before
 * dispatch. So the flag is stubbed TRUE here — this suite is the proof that the
 * path is safe on the day it flips, which is the question that matters.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const ASSET_ID = 'asset-0000-0000-0000-00000000000a'

// ── Counters every assertion reads ──────────────────────────────────────────

/** Every outbound HTTP attempt. This IS the provider dispatch count. */
let fetchCalls: string[] = []
/** Every reservation taken. */
let reservations: number[] = []
/** Every orchestration entry, counted OUTSIDE the retry loop. */
let orchestrationCalls = 0
let admitCalls: Record<string, any>[] = []
let admitShouldThrow: Error | null = null
/** Fail `store.create` this many more times — the one provably safe retry class. */
let createFailuresRemaining = 0
/** Every SHIPPED-BRIDGE (Ideogram) generation. A paid render, today. */
let ideogramCalls = 0

// ── The durable gate, simulated open ────────────────────────────────────────

vi.mock('@/lib/media/job/store', async (orig) => {
  const actual = await orig<typeof import('@/lib/media/job/store')>()
  return { ...actual, DURABLE_MEDIA_JOB_STORE_AVAILABLE: true }
})

// ── The store: real in-memory contract, one shared instance per test ────────

let jobStore: ReturnType<typeof import('@/lib/media/job/store').createInMemoryMediaJobStore>
vi.mock('@/lib/media/job/store-supabase', () => ({
  createSupabaseMediaJobStore: () => ({
    ...jobStore,
    create: async (input: Parameters<typeof jobStore.create>[0]) => {
      if (createFailuresRemaining > 0) {
        createFailuresRemaining -= 1
        return { ok: false as const, refusal: 'write_failed' as const, detail: 'durable store unavailable' }
      }
      return jobStore.create(input)
    },
    read:        (...a: Parameters<typeof jobStore.read>) => jobStore.read(...a),
    transition:  (...a: Parameters<typeof jobStore.transition>) => jobStore.transition(...a),
    recordAdmission: (...a: Parameters<typeof jobStore.recordAdmission>) => jobStore.recordAdmission(...a),
    listUnresolved:  (...a: Parameters<typeof jobStore.listUnresolved>) => jobStore.listUnresolved(...a),
    recordReconciliation: (...a: Parameters<typeof jobStore.recordReconciliation>) => jobStore.recordReconciliation(...a),
  }),
}))

// ── Spend primitives (withGovernedSpend itself is REAL) ────────────────────

vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: async (input: { estimatedSek: number }) => {
    reservations.push(input.estimatedSek)
    return { allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
      reservationId: `res-${reservations.length}`, budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700 }
  },
  settleSpend: async () => undefined,
  releaseSpend: async () => undefined,
}))

vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async () => ({
      allowed: true, context: 'AUTONOMOUS' as const, scopesEvaluated: ['PLATFORM_AUTOMATION' as const],
      resolution: 'RESOLVED' as const, globalPaused: false, projectPaused: null, reason: null, observed: null,
    }),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: PROJECT_A }, error: null }) }) }) }) }),
  }),
}))

vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10.5 }) }))

/**
 * The SHIPPED bridge adapter. Counted, never called for real.
 *
 * `generateIdeogramV3` already wraps `withGovernedSpend` internally, so each
 * entry here is one reserved, dispatched and settled render — i.e. one charge.
 */
vi.mock('@/lib/media/image-client', () => ({
  generateIdeogramV3: async () => { ideogramCalls += 1; return 'https://cdn.ideogram.example/hero.png' },
}))

vi.mock('@/lib/media/asset/admission', async (orig) => {
  const actual = await orig<typeof import('@/lib/media/asset/admission')>()
  return {
    ...actual,
    admitAssetFromUrl: async (input: Record<string, any>) => {
      admitCalls.push(input)
      if (admitShouldThrow) throw admitShouldThrow
      return {
        asset: { id: ASSET_ID, projectId: input.projectId, kind: 'image', mimeType: 'image/png',
          byteSize: 10, checksumSha256: 'a'.repeat(64), width: 1, height: 1, durationMs: null,
          visibility: input.visibility ?? 'internal', status: 'ready',
          storage: { bucket: 'media-assets', path: `${input.storage.path}.png` },
          createdAt: '2026-09-03T00:00:00.000Z' },
        provenance: { assetId: ASSET_ID, source: 'generated', provider: input.provenance.provider,
          model: input.provenance.model, providerRequestId: input.provenance.providerRequestId ?? null,
          adapterVersion: null, seed: null, briefHash: null, requestHash: null, referenceAssetIds: [],
          costEventId: null, durationMs: null, simulated: true,
          providerMetadata: input.provenance.providerMetadata ?? {}, recordedAt: '2026-09-03T00:00:00.000Z' },
      }
    },
  }
})

// ── Imports (after the mocks) ──────────────────────────────────────────────

import { withRetry } from '@/lib/media/retry'
import { createInMemoryMediaJobStore } from '@/lib/media/job/store'
import { orchestrateImageGeneration, MediaOrchestrationError } from '@/lib/media/orchestrator/orchestrate'
import {
  dispatchedGenerationIsNotRetryable,
  generationMayAlreadyHaveDispatched,
} from '@/lib/media/orchestrator/retry-authority'
import { MediaJobError } from '@/lib/media/job/run'
import type { MediaGenerationBrief } from '@/lib/media/orchestrator/types'

// ── The socket ──────────────────────────────────────────────────────────────

type FetchMode = 'econnreset' | 'accept_then_complete' | 'reject_4xx'
let fetchMode: FetchMode = 'econnreset'

const realFetch = globalThis.fetch
globalThis.fetch = (async (url: unknown) => {
  const u = String(url)
  fetchCalls.push(u)
  if (u.includes('/predictions/')) {
    return new Response(JSON.stringify({ status: 'completed', outputs: [{ url: 'https://cdn.muapi.example/o.png' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (fetchMode === 'econnreset') {
    // A genuine mid-flight reset: the vendor MAY have accepted and begun work.
    const e: any = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e
  }
  if (fetchMode === 'reject_4xx') return new Response('bad prompt', { status: 400 })
  return new Response(JSON.stringify({ request_id: 'muapi-req-0001' }),
    { status: 200, headers: { 'content-type': 'application/json' } })
}) as unknown as typeof fetch
afterAll(() => { globalThis.fetch = realFetch })

// ── Environment: MuAPI is the ONLY eligible candidate ──────────────────────

const ENV_KEYS = ['MUAPI_ENABLED', 'MUAPI_MODE', 'MUAPI_TEST_API_KEY', 'MUAPI_IMAGE_MODEL',
  'IDEOGRAM_API_KEY', 'OPENAI_API_KEY']
let savedEnv = new Map<string, string | undefined>()

function brief(over: Partial<MediaGenerationBrief> = {}): MediaGenerationBrief {
  return {
    projectId: PROJECT_A,
    invocation: { kind: 'internal-application', caller: 'article-hero' },
    execution: TEST_AUTONOMOUS_GLOBAL,
    mediaType: 'image',
    operation: 'Article Hero Image',
    brief: { instruction: 'a plain grey circle on white' },
    visibility: 'public',
    storagePath: 'hero/one',
    ...over,
  }
}

/**
 * The article-hero call, reproduced exactly: the REAL retry primitive, the REAL
 * orchestrator, and the same options `hero-image.ts` passes.
 */
async function heroRetryLoop(b = brief()) {
  return withRetry(
    () => { orchestrationCalls += 1; return orchestrateImageGeneration(b) },
    { attempts: 2, label: 'orchestrated brief hero', isPermanent: dispatchedGenerationIsNotRetryable() },
  )
}

/** The SAME loop with the pre-fix behaviour, to show the defect was real. */
async function heroRetryLoopUnguarded(b = brief()) {
  return withRetry(
    () => { orchestrationCalls += 1; return orchestrateImageGeneration(b) },
    { attempts: 2, label: 'orchestrated brief hero', baseMs: 1 },
  )
}

beforeEach(() => {
  fetchCalls = []; reservations = []; orchestrationCalls = 0; ideogramCalls = 0
  admitCalls = []; admitShouldThrow = null; createFailuresRemaining = 0
  fetchMode = 'econnreset'
  jobStore = createInMemoryMediaJobStore()
  savedEnv = new Map(ENV_KEYS.map(k => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  process.env.MUAPI_ENABLED = '1'
  process.env.MUAPI_MODE = 'test'
  process.env.MUAPI_TEST_API_KEY = 'sandbox-key'
  process.env.MUAPI_IMAGE_MODEL = 'flux-schnell'
})

afterAll(() => {
  for (const [k, v] of savedEnv) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
})

// ═════════════════════════════════════════════════════════════════════════════
// The regression
// ═════════════════════════════════════════════════════════════════════════════

describe('an ambiguous dispatch is not repeated by the article retry loop', () => {
  it('THE DEFECT IS REAL — without the rule, the loop dispatches TWICE', async () => {
    const err = await heroRetryLoopUnguarded().catch(e => e)
    expect(err).toBeInstanceOf(MediaJobError)
    // Two full orchestrations, two media jobs, two reservations, two sockets.
    expect(orchestrationCalls).toBe(2)
    expect(fetchCalls.length).toBe(2)
    expect(jobStore.all().length).toBe(2)
    expect(reservations.length).toBe(2)
  })

  it('WITH the rule: exactly ONE provider dispatch', async () => {
    const err = await heroRetryLoop().catch(e => e)
    expect(err).toBeInstanceOf(MediaJobError)
    expect(err.failure).toBe('dispatch_unknown')
    expect(fetchCalls.length).toBe(1)
  })

  it('the orchestrator is entered exactly ONCE', async () => {
    await heroRetryLoop().catch(() => {})
    expect(orchestrationCalls).toBe(1)
  })

  it('exactly ONE media job exists', async () => {
    await heroRetryLoop().catch(() => {})
    expect(jobStore.all().length).toBe(1)
  })

  it('exactly ONE spend reservation was taken', async () => {
    await heroRetryLoop().catch(() => {})
    expect(reservations).toEqual([0])
  })

  it('the job stays UNKNOWN and awaits a human', async () => {
    await heroRetryLoop().catch(() => {})
    const job = jobStore.all()[0]
    expect(job.state).toBe('UNKNOWN')
    expect(job.dispatchObservation).toBe('response_lost')
    expect(job.reconciliationRequired).toBe(true)
  })

  it('UNKNOWN is not converted to FAILED, and is not swallowed', async () => {
    const err = await heroRetryLoop().catch(e => e)
    expect(jobStore.all()[0].state).toBe('UNKNOWN')
    expect(err.reconciliationRequired).toBe(true)
    expect(err.dispatched).toBe(true)
  })

  it('no fallback provider runs — the eligible set is not widened by failure', async () => {
    await heroRetryLoop().catch(() => {})
    // Only MuAPI is configured, and only MuAPI was called. A second candidate
    // appearing here would mean failure widened eligibility.
    expect(jobStore.all().map(j => j.provider)).toEqual(['muapi'])
    expect(fetchCalls.every(u => u.includes('muapi'))).toBe(true)
  })

  it('the ambiguous classification came from the REAL adapter, not the test', async () => {
    // ECONNRESET is deliberately absent from the adapter's proven-safe list, so
    // this observation is the shipping code's judgement about a real socket.
    await heroRetryLoop().catch(() => {})
    expect(jobStore.all()[0].dispatchObservation).toBe('response_lost')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// The call site actually uses it
// ═════════════════════════════════════════════════════════════════════════════

describe('the article hero call site carries the authority', () => {
  const ROOT = process.cwd()
  const src = () => readFileSync(join(ROOT, 'lib/article/hero-image.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  it('the orchestrated hero retry passes the dispatch-authority predicate', () => {
    const body = src()
    const i = body.indexOf('orchestrateImageGeneration(')
    expect(i).toBeGreaterThan(-1)
    // The options object follows the orchestration call in the same withRetry.
    expect(body.slice(i)).toMatch(/isPermanent:\s*dispatchedGenerationIsNotRetryable\(/)
  })

  it('REGRESSION — the guard detects a call site that drops it', () => {
    const stripped = src().replace(/isPermanent:\s*dispatchedGenerationIsNotRetryable\(\),?/, '')
    const i = stripped.indexOf('orchestrateImageGeneration(')
    expect(stripped.slice(i)).not.toMatch(/isPermanent:\s*dispatchedGenerationIsNotRetryable\(/)
  })

  it('every production withRetry around the orchestrator carries it', () => {
    // A future second caller must not reintroduce the hole. Scans runtime source.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    let out = ''
    try {
      out = execFileSync('grep', ['-rl', 'orchestrateImageGeneration', `${ROOT}/lib`, `${ROOT}/app`], { encoding: 'utf8' })
    } catch { /* no matches */ }
    const files = out.trim().split('\n').filter(Boolean)
      .filter(f => !f.includes('/qa/') && !f.includes('/orchestrator/'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const body = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
      if (!/withRetry\s*\(/.test(body)) continue
      expect(body, `${f} retries orchestration without the dispatch authority`)
        .toMatch(/dispatchedGenerationIsNotRetryable/)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Controls — retry is NOT disabled
// ═════════════════════════════════════════════════════════════════════════════

describe('SAFE retry classes still retry (the rule did not disable retrying)', () => {
  it('a failure BEFORE the durable record is written retries — nothing was sent', async () => {
    // `store.create` failing leaves the job at PENDING_DISPATCH, the one state
    // `mayAutomaticallyDispatch` permits. First attempt fails locally, second
    // succeeds and dispatches once.
    createFailuresRemaining = 1
    fetchMode = 'accept_then_complete'
    const out = await heroRetryLoop().catch(e => e)
    expect(orchestrationCalls).toBe(2)     // the loop DID retry
    expect(fetchCalls.filter(u => !u.includes('/predictions/')).length).toBe(1) // one dispatch total
    expect(out.asset?.id).toBe(ASSET_ID)   // and it succeeded
  })

  it('the predicate has NO opinion on an ordinary transient error', () => {
    expect(generationMayAlreadyHaveDispatched(new Error('socket hang up'))).toBe(false)
  })

  it('the composed rule still honours the existing status-text heuristic', () => {
    const p = dispatchedGenerationIsNotRetryable()
    expect(p(new Error('provider said 400 bad request'))).toBe(true)   // permanent, as before
    expect(p(new Error('provider said 429 slow down'))).toBe(false)    // retryable, as before
    expect(p(new Error('temporary glitch'))).toBe(false)               // retryable, as before
  })

  it('a pre-dispatch orchestration refusal stays retryable', () => {
    const noProvider = new MediaOrchestrationError({
      code: 'NO_ELIGIBLE_PROVIDER', message: 'nothing eligible',
    })
    expect(generationMayAlreadyHaveDispatched(noProvider)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Asset admission failure — CASE 5
// ═════════════════════════════════════════════════════════════════════════════

describe('a provider success whose admission fails is never regenerated', () => {
  beforeEach(() => { fetchMode = 'accept_then_complete' })

  it('admission failure does NOT start a second generation', async () => {
    admitShouldThrow = new Error('storage unavailable')
    const err = await heroRetryLoop().catch(e => e)
    expect(err).toBeInstanceOf(MediaJobError)
    expect(err.failure).toBe('asset_admission_failed')
    expect(orchestrationCalls).toBe(1)
    expect(fetchCalls.filter(u => !u.includes('/predictions/')).length).toBe(1)
    expect(jobStore.all().length).toBe(1)
    // The vendor's success is a fact and is not rewritten by Omnira's problem.
    expect(jobStore.all()[0].state).toBe('SUCCEEDED')
  })

  it('the BRIDGE family is covered by the same rule', () => {
    // `orchestrate.ts` has reported this since Phase 2, on the shipped Ideogram
    // path — so this half of the fix is live today, not only after the gate.
    const admissionFailed = new MediaOrchestrationError({
      code: 'ASSET_ADMISSION_FAILED', message: 'bytes exist, admission failed',
      providerDispatched: true,
    })
    expect(generationMayAlreadyHaveDispatched(admissionFailed)).toBe(true)
    const resultInvalid = new MediaOrchestrationError({
      code: 'PROVIDER_RESULT_INVALID', message: 'no url', providerDispatched: true,
    })
    expect(generationMayAlreadyHaveDispatched(resultInvalid)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// The SHIPPED bridge path — a live duplicate-charge risk, not a future one
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ideogram only: no MuAPI credential, so the provider-layer candidate is not
 * eligible and the orchestrator selects the bridge family — exactly the
 * configuration production runs in today.
 */
function bridgeOnlyEnv() {
  for (const k of ENV_KEYS) delete process.env[k]
  process.env.IDEOGRAM_API_KEY = 'ideogram-key'
}

describe('the shipped Ideogram path never regenerates after a paid render', () => {
  it('ASSET_ADMISSION_FAILED → exactly ONE paid render, ONE orchestration', async () => {
    bridgeOnlyEnv()
    admitShouldThrow = new Error('supabase storage unavailable')

    const err = await heroRetryLoop().catch(e => e)

    expect(err).toBeInstanceOf(MediaOrchestrationError)
    expect(err.code).toBe('ASSET_ADMISSION_FAILED')
    expect(err.providerDispatched).toBe(true)
    // THE POINT: the bytes were rendered and billed once. A second render would
    // buy a second image for an article that already has one.
    expect(ideogramCalls).toBe(1)
    expect(orchestrationCalls).toBe(1)
    // No async job was created — this is the synchronous family.
    expect(jobStore.all().length).toBe(0)
    // And no other candidate ran instead.
    expect(fetchCalls.length).toBe(0)
  })

  it('WITHOUT the rule the same failure renders TWICE — the defect is live today', async () => {
    bridgeOnlyEnv()
    admitShouldThrow = new Error('supabase storage unavailable')

    await heroRetryLoopUnguarded().catch(() => {})

    expect(orchestrationCalls).toBe(2)
    expect(ideogramCalls).toBe(2)
  })

  it('a healthy bridge render still succeeds, once', async () => {
    bridgeOnlyEnv()
    const out = await heroRetryLoop()
    expect(out.asset.id).toBe(ASSET_ID)
    expect(out.selection.candidate).toBe('ideogram')
    expect(ideogramCalls).toBe(1)
    expect(orchestrationCalls).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// A definite vendor rejection
// ═════════════════════════════════════════════════════════════════════════════

describe('a vendor 4xx does not become a second dispatch', () => {
  it('remote_rejected is terminal for the automatic loop', async () => {
    fetchMode = 'reject_4xx'
    const err = await heroRetryLoop().catch(e => e)
    expect(err).toBeInstanceOf(MediaJobError)
    expect(err.failure).toBe('dispatch_definite_failure')
    // The vendor answered and did no work — but a fresh attempt is a DELIBERATE
    // act per `classifyMediaRetry('FAILED')`, not something a loop may take.
    expect(fetchCalls.length).toBe(1)
    expect(orchestrationCalls).toBe(1)
    expect(jobStore.all()[0].state).toBe('FAILED')
    expect(jobStore.all()[0].dispatchObservation).toBe('remote_rejected')
  })
})
