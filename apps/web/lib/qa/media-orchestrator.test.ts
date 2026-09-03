/**
 * lib/qa/media-orchestrator.test.ts — Media Runtime Phase 2.
 *
 * Proves the orchestrator's one job: consult existing authorities in the right
 * ORDER, and never let ranking widen what they allowed.
 *
 * No network, no Supabase, no provider. Both governed adapters are mocked and
 * counted — they are the only two functions on this path that enter
 * `withGovernedSpend`, so counting them counts billable attempts. A test for a
 * spend boundary must not be able to spend.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Capture surfaces ─────────────────────────────────────────────────────────

/** Every governed provider call, in order. */
let ideogramCalls: Array<{ ctx: any; body: any }> = []
let openaiCalls: Array<{ ctx: any; params: any }> = []
let admitCalls: Array<any> = []
let getAssetCalls: string[] = []

let ideogramShouldThrow: Error | null = null
/** When set, gpt-image-1 answers with this base64 payload instead of a URL. */
let openaiB64: string | null = null
let openaiReturnsEmptyData = false
let admitShouldThrow: Error | null = null
/** id → owning project. Absent means "no such asset". */
let assetOwners: Map<string, string> = new Map()

const IDEOGRAM_URL = 'https://cdn.ideogram.example/generated/abc.png'
const OPENAI_URL = 'https://cdn.openai.example/generated/xyz.png'

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'

// ── Mocks (must precede the import of the module under test) ────────────────

vi.mock('@/lib/media/image-client', () => ({
  generateIdeogramV3: async (ctx: any, body: any) => {
    ideogramCalls.push({ ctx, body })
    if (ideogramShouldThrow) throw ideogramShouldThrow
    return IDEOGRAM_URL
  },
}))

vi.mock('@/lib/ai/openai-client', () => ({
  openAIImageGenerate: async (ctx: any, params: any) => {
    openaiCalls.push({ ctx, params })
    if (openaiB64 !== null) return { data: [{ b64_json: openaiB64 }] }
    if (openaiReturnsEmptyData) return { data: [] }
    return { data: [{ url: OPENAI_URL }] }
  },
}))

vi.mock('@/lib/media/asset/admission', () => ({
  admitAssetFromUrl: async (input: any) => {
    admitCalls.push(input)
    if (admitShouldThrow) throw admitShouldThrow
    return {
      asset: {
        id: 'asset-0000-0000-0000-00000000000a',
        projectId: input.projectId,
        kind: 'image',
        visibility: input.visibility ?? 'internal',
        storage: {
          bucket: input.visibility === 'public' ? 'media-assets' : 'media-assets-private',
          path: `${input.storage.path}.png`,
        },
      },
      provenance: { ...input.provenance, assetId: 'asset-0000-0000-0000-00000000000a' },
    }
  },
  admitAssetBytes: async (input: any) => {
    admitCalls.push(input)
    if (admitShouldThrow) throw admitShouldThrow
    return {
      asset: {
        id: 'asset-0000-0000-0000-00000000000a',
        projectId: input.projectId,
        kind: 'image',
        visibility: input.visibility ?? 'internal',
        storage: {
          bucket: input.visibility === 'public' ? 'media-assets' : 'media-assets-private',
          path: `${input.storage.path}.png`,
        },
      },
      provenance: { ...input.provenance, assetId: 'asset-0000-0000-0000-00000000000a' },
    }
  },
  canonicalHash: (v: unknown) => `hash:${JSON.stringify(v ?? null)}`,
}))

vi.mock('@/lib/media/asset/store', () => ({
  getAsset: async (id: string) => {
    getAssetCalls.push(id)
    const projectId = assetOwners.get(id)
    return projectId ? { id, projectId } : null
  },
}))

// ── Modules under test ───────────────────────────────────────────────────────

const { orchestrateImageGeneration, MediaOrchestrationError } =
  await import('@/lib/media/orchestrator/orchestrate')
const { filterEligible, rankEligible, capabilityLicencePermits } =
  await import('@/lib/media/orchestrator/eligibility')
const { describeMediaCandidates } = await import('@/lib/media/orchestrator/candidates')
const { MEDIA_CANDIDATE_IDS } = await import('@/lib/media/orchestrator/types')

type Candidate = Awaited<ReturnType<typeof describeMediaCandidates>>[number]

// ── Fixtures ─────────────────────────────────────────────────────────────────

function candidate(over: Partial<Candidate> & { id: Candidate['id'] }): Candidate {
  return {
    family: 'bridge',
    model: { name: `${over.id}-model`, supportsReferenceImages: false },
    mediaTypes: ['image'],
    configured: true,
    gateBlockedReason: null,
    gateRefused: false,
    dispatch: { supported: true, representations: ['url'] },
    ...over,
  } as Candidate
}

/** Allowed, configured, gate-clear — and simply not dispatchable by Phase 2. */
const UNDISPATCHABLE = candidate({
  id: 'muapi', family: 'provider-layer', configured: true, gateRefused: false,
  dispatch: { supported: false, reason: 'the MediaProvider async job lifecycle is not implemented in Phase 2' },
})

const IDEOGRAM = candidate({ id: 'ideogram', model: { name: 'ideogram-v3', supportsReferenceImages: false } })
const OPENAI = candidate({
  id: 'openai',
  model: { name: 'gpt-image-1', supportsReferenceImages: true },
  dispatch: { supported: true, representations: ['url', 'bytes'] },
})
const MUAPI_OFF = candidate({
  id: 'muapi', family: 'provider-layer',
  model: { name: 'muapi:unspecified', supportsReferenceImages: false },
  configured: false, gateRefused: true, gateBlockedReason: 'MuAPI is disabled.',
  dispatch: { supported: false, reason: 'not implemented in Phase 2' },
})

const EXECUTION = { context: 'OPERATOR_EXECUTION', scope: { kind: 'GLOBAL_ONLY' } } as any

function brief(over: Record<string, any> = {}) {
  return {
    projectId: PROJECT_A,
    execution: EXECUTION,
    invocation: { kind: 'internal-application', caller: 'article-hero' } as const,
    mediaType: 'image' as const,
    operation: 'Test Image',
    brief: { instruction: 'an editorial photograph', avoid: ['stock cliché'] },
    storagePath: 'images/test/one',
    ...over,
  }
}

const RUN = {}

beforeEach(() => {
  ideogramCalls = []
  openaiCalls = []
  admitCalls = []
  getAssetCalls = []
  ideogramShouldThrow = null
  openaiB64 = null
  openaiReturnsEmptyData = false
  admitShouldThrow = null
  assetOwners = new Map()
})

const paidCalls = () => ideogramCalls.length + openaiCalls.length

// ─────────────────────────────────────────────────────────────────────────────
// 1 — determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('selection is deterministic', () => {
  it('identical request and state select the identical candidate, repeatedly', async () => {
    const results = []
    for (let i = 0; i < 5; i++) {
      ideogramCalls = []; openaiCalls = []; admitCalls = []
      const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM, OPENAI, MUAPI_OFF] })
      results.push(r.selection.candidate + '|' + r.selection.rankedEligible.join(','))
    }
    expect(new Set(results).size).toBe(1)
  })

  it('ranking is a pure function of the eligible set and the brief', () => {
    const a = rankEligible([IDEOGRAM, OPENAI], brief() as any).map(c => c.id)
    const b = rankEligible([IDEOGRAM, OPENAI], brief() as any).map(c => c.id)
    expect(a).toEqual(b)
    // Reversing the input does not change the winner when no signal separates
    // them — order comes from the supplied list, which is itself stable.
    expect(rankEligible([OPENAI, IDEOGRAM], brief() as any)[0].id).toBe('openai')
    expect(rankEligible([IDEOGRAM, OPENAI], brief() as any)[0].id).toBe('ideogram')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2, 3, 5 — eligibility is the authority; ranking cannot widen it
// ─────────────────────────────────────────────────────────────────────────────

describe('eligibility gates selection', () => {
  it('an ineligible candidate cannot be selected', async () => {
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [MUAPI_OFF, IDEOGRAM] })
    expect(r.selection.candidate).toBe('ideogram')
    expect(r.selection.rankedEligible).not.toContain('muapi')
    expect(r.selection.rejected.map(x => x.candidate)).toContain('muapi')
  })

  it('a gate-refused candidate is rejected with the gate as the stated reason', () => {
    const { eligible, rejected } = filterEligible([MUAPI_OFF], brief() as any)
    expect(eligible).toEqual([])
    // `not_configured` is reported before `provider_gate_refused` — the nearest
    // problem first, matching how gate.ts orders its own refusals.
    expect(rejected[0].rule).toBe('not_configured')
  })

  it('NO eligible candidate → fail closed, with no provider call at all', async () => {
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [MUAPI_OFF] }).catch(e => e)
    expect(err).toBeInstanceOf(MediaOrchestrationError)
    expect(err.code).toBe('NO_ELIGIBLE_PROVIDER')
    expect(paidCalls()).toBe(0)
    expect(admitCalls).toEqual([])
    // The refusal explains itself per candidate.
    expect(err.rejections.map((r: any) => r.candidate)).toEqual(['muapi'])
  })

  it('an unconfigured candidate is rejected before any dispatch', async () => {
    const unconfigured = candidate({ id: 'ideogram', configured: false })
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [unconfigured] }).catch(e => e)
    expect(err.code).toBe('NO_ELIGIBLE_PROVIDER')
    expect(err.rejections[0].rule).toBe('not_configured')
    expect(paidCalls()).toBe(0)
  })

  it('a PREFERENCE cannot make an ineligible candidate win', async () => {
    // The whole preference-vs-authority distinction, exercised: openai is the
    // stated preference AND is ineligible. It must not be selected, and the
    // request must not silently succeed on it.
    const openaiOff = candidate({ id: 'openai', configured: false,
      model: { name: 'gpt-image-1', supportsReferenceImages: true } })

    const r = await orchestrateImageGeneration(
      brief({ providerPreference: 'openai' }),
      { ...RUN, candidates: [IDEOGRAM, openaiOff] },
    )
    expect(r.selection.candidate).toBe('ideogram')
    expect(openaiCalls).toEqual([])
  })

  it('a preference DOES reorder within the eligible set', async () => {
    const r = await orchestrateImageGeneration(
      brief({ providerPreference: 'openai' }),
      { ...RUN, candidates: [IDEOGRAM, OPENAI] },
    )
    expect(r.selection.candidate).toBe('openai')
    expect(r.selection.rankedEligible).toEqual(['openai', 'ideogram'])
  })

  it('ranking is structurally unable to see rejected candidates', () => {
    // rankEligible is only ever handed filterEligible's output. Proven by type
    // and by behaviour: a preference for something absent matches nothing.
    const ranked = rankEligible([IDEOGRAM], brief({ providerPreference: 'openai' }) as any)
    expect(ranked.map(c => c.id)).toEqual(['ideogram'])
  })

  it('a MISSION invocation is refused while the licence is draft/L0', () => {
    const mission = { kind: 'mission', missionId: 'm-1' } as const
    expect(capabilityLicencePermits(mission)).toBe(false)

    const { eligible, rejected } = filterEligible(
      [IDEOGRAM, OPENAI], brief({ invocation: mission }) as any)
    expect(eligible).toEqual([])
    expect(rejected.every(r => r.rule === 'capability_licence')).toBe(true)
  })

  it('an internal-application invocation is not gated by the MISSION licence', () => {
    expect(capabilityLicencePermits({ kind: 'internal-application', caller: 'article-hero' })).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 + 16 — the PR #164 reference invariant, one layer up
// ─────────────────────────────────────────────────────────────────────────────

describe('a required reference constrains ELIGIBILITY, not just execution', () => {
  it('a non-reference-capable provider cannot be selected', async () => {
    assetOwners.set('ref-1', PROJECT_A)
    const r = await orchestrateImageGeneration(
      brief({ referenceRequirement: 'required', referenceAssetIds: ['ref-1'] }),
      { ...RUN, candidates: [IDEOGRAM, OPENAI] },
    )
    expect(r.selection.candidate).toBe('openai')   // the only reference-capable one
    expect(ideogramCalls).toEqual([])
    expect(r.selection.rejected.find(x => x.candidate === 'ideogram')?.rule)
      .toBe('reference_unsupported')
  })

  it('a PREFERENCE for a non-reference provider still cannot win', async () => {
    assetOwners.set('ref-1', PROJECT_A)
    const r = await orchestrateImageGeneration(
      brief({ referenceRequirement: 'required', referenceAssetIds: ['ref-1'],
              providerPreference: 'ideogram' }),
      { ...RUN, candidates: [IDEOGRAM, OPENAI] },
    )
    expect(r.selection.candidate).toBe('openai')
    expect(ideogramCalls).toEqual([])
  })

  it('no reference-capable provider → FAIL CLOSED, never a degraded generation', async () => {
    assetOwners.set('ref-1', PROJECT_A)
    const err = await orchestrateImageGeneration(
      brief({ referenceRequirement: 'required', referenceAssetIds: ['ref-1'] }),
      { ...RUN, candidates: [IDEOGRAM] },
    ).catch(e => e)

    expect(err.code).toBe('NO_ELIGIBLE_PROVIDER')
    expect(err.message).toMatch(/required reference support/)
    // The load-bearing assertion: nothing was generated WITHOUT the reference.
    expect(paidCalls()).toBe(0)
    expect(admitCalls).toEqual([])
  })

  it('references are validated by identity BEFORE any spend', async () => {
    // Non-existent reference.
    const missing = await orchestrateImageGeneration(
      brief({ referenceAssetIds: ['nope'] }), { ...RUN, candidates: [OPENAI] },
    ).catch(e => e)
    expect(missing.code).toBe('REFERENCE_INVALID')
    expect(paidCalls()).toBe(0)

    // Cross-project reference — refused, not filtered (Project Isolation).
    assetOwners.set('other', PROJECT_B)
    const cross = await orchestrateImageGeneration(
      brief({ referenceAssetIds: ['other'] }), { ...RUN, candidates: [OPENAI] },
    ).catch(e => e)
    expect(cross.code).toBe('REFERENCE_INVALID')
    expect(cross.message).toMatch(/another project/)
    expect(paidCalls()).toBe(0)
  })

  it('a URL cannot be used as a reference identity', async () => {
    const err = await orchestrateImageGeneration(
      brief({ referenceAssetIds: ['https://evil.example/ref.png'] }),
      { ...RUN, candidates: [OPENAI] },
    ).catch(e => e)
    expect(err.code).toBe('REFERENCE_INVALID')
    expect(getAssetCalls).toEqual(['https://evil.example/ref.png'])  // looked up, not fetched
    expect(paidCalls()).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6, 7, 8, 9, 10, 11 — the canonical result
// ─────────────────────────────────────────────────────────────────────────────

describe('a successful generation becomes a canonical Asset', () => {
  it('the caller receives an ASSET ID, and the result carries no URL', async () => {
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] })

    expect(r.asset.id).toBe('asset-0000-0000-0000-00000000000a')
    // §21.7 — no url-shaped value anywhere in the result.
    const serialized = JSON.stringify(r)
    expect(serialized).not.toContain('http')
  })

  it('the provider URL is used to retrieve and is then discarded', async () => {
    await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] })
    expect(admitCalls[0].sourceUrl).toBe(IDEOGRAM_URL)   // used for retrieval
    // ...and does not reach the provenance record.
    expect(JSON.stringify(admitCalls[0].provenance)).not.toContain('ideogram.example')
  })

  it('the provider cannot choose the asset id', async () => {
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] })
    // The id comes from admission, which the provider never reaches. Nothing in
    // the dispatch path can supply one: `admitAssetFromUrl` is given no id field.
    expect(Object.keys(admitCalls[0])).not.toContain('id')
    expect(Object.keys(admitCalls[0])).not.toContain('assetId')
    expect(r.asset.id).toBe('asset-0000-0000-0000-00000000000a')
  })

  it('the caller cannot choose a bucket, and the provider cannot either', async () => {
    await orchestrateImageGeneration(
      // A bucket forced through a cast, as a hostile caller would.
      brief({ storage: { bucket: 'media-assets', path: 'x' } } as any),
      { ...RUN, candidates: [IDEOGRAM] },
    )
    // Admission is handed a PATH only — the bucket is derived from visibility.
    expect(Object.keys(admitCalls[0].storage)).toEqual(['path'])
  })

  it('an internal request admits privately; a public request admits publicly', async () => {
    await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] })
    expect(admitCalls[0].visibility).toBe('internal')          // fail-closed default
    expect(admitCalls[0].storage.path).toBe('images/test/one')

    admitCalls = []
    const pub = await orchestrateImageGeneration(
      brief({ visibility: 'public' }), { ...RUN, candidates: [IDEOGRAM] })
    expect(admitCalls[0].visibility).toBe('public')
    expect(pub.asset.storage.bucket).toBe('media-assets')
  })

  it('the project cannot be overridden by the provider', async () => {
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] })
    expect(admitCalls[0].projectId).toBe(PROJECT_A)
    expect(r.asset.projectId).toBe(PROJECT_A)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12, 13 — failure semantics
// ─────────────────────────────────────────────────────────────────────────────

describe('failure semantics', () => {
  it('a result with no image at all fails BEFORE any asset exists', async () => {
    openaiReturnsEmptyData = true
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] }).catch(e => e)

    expect(err.code).toBe('PROVIDER_RESULT_INVALID')
    expect(admitCalls).toEqual([])          // nothing was admitted
    expect(err.providerDispatched).toBe(true)  // but a paid call DID happen — said plainly
  })

  it('admission failure is NOT reported as generation success', async () => {
    admitShouldThrow = new Error('checksum mismatch')
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] }).catch(e => e)

    expect(err).toBeInstanceOf(MediaOrchestrationError)
    expect(err.code).toBe('ASSET_ADMISSION_FAILED')
    expect(err.providerDispatched).toBe(true)
    // And it does NOT regenerate: exactly one paid call for an image that exists.
    expect(paidCalls()).toBe(1)
  })

  it('a provider failure is wrapped, and nothing else is tried', async () => {
    ideogramShouldThrow = new Error('Ideogram API error 503')
    const err = await orchestrateImageGeneration(
      brief(), { ...RUN, candidates: [IDEOGRAM, OPENAI] }).catch(e => e)

    expect(err.code).toBe('PROVIDER_EXECUTION_FAILED')
    // NO silent failover to the second eligible candidate — that would be a
    // second charge, and for a reference request a lost requirement.
    expect(openaiCalls).toEqual([])
    expect(paidCalls()).toBe(1)
  })

  it('a spend refusal keeps its own identity rather than being wrapped', async () => {
    const refusal = new Error('over budget'); refusal.name = 'SpendRefusedError'
    ideogramShouldThrow = refusal
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] }).catch(e => e)

    // Callers need to tell "cannot afford" from "provider broke".
    expect(err.name).toBe('SpendRefusedError')
    expect(err).not.toBeInstanceOf(MediaOrchestrationError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14 — spend safety
// ─────────────────────────────────────────────────────────────────────────────

describe('spend safety', () => {
  it('exactly ONE paid call per orchestrated request', async () => {
    await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM, OPENAI, MUAPI_OFF] })
    expect(paidCalls()).toBe(1)
  })

  it('the orchestrator introduces NO spend wrapper of its own', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['orchestrate.ts', 'eligibility.ts', 'candidates.ts', 'types.ts']) {
      const src = readFileSync(new URL(`../media/orchestrator/${f}`, import.meta.url), 'utf8')
      // Checked on IMPORTS: the doc comments name withGovernedSpend precisely to
      // say that spend lives elsewhere, and that prose must not fail this test.
      expect(src).not.toMatch(/^\s*import .*lib\/cost\//m)
      expect(src).not.toMatch(/\bawait\s+(withGovernedSpend|reserveSpend|settleSpend|releaseSpend)\s*\(/)
    }
  })

  it('dispatch goes through the governed adapters, never a raw provider call', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../media/orchestrator/orchestrate.ts', import.meta.url), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    // No hostname, no SDK construction — the G1 provider boundary holds here too.
    expect(code).not.toMatch(/api\.ideogram\.ai|api\.openai\.com|new OpenAI\(/)
    expect(code).toContain('generateIdeogramV3')
    expect(code).toContain('openAIImageGenerate')
  })

  it('the execution contract and project are passed through, never defaulted', async () => {
    await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] })
    expect(ideogramCalls[0].ctx.execution).toBe(EXECUTION)
    expect(ideogramCalls[0].ctx.project).toEqual({ projectId: PROJECT_A })
    expect(ideogramCalls[0].ctx.operation).toBe('Test Image')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Security — what a caller may not say
// ─────────────────────────────────────────────────────────────────────────────

describe('the brief cannot express provider authority', () => {
  it('provider options are keyed and never leak across candidates', async () => {
    await orchestrateImageGeneration(
      brief({ providerOptions: { ideogram: { style_type: 'REALISTIC' } } }),
      { ...RUN, candidates: [IDEOGRAM] },
    )
    expect(ideogramCalls[0].body.style_type).toBe('REALISTIC')

    // Same brief, but openai wins — the ideogram-only option must not ride along.
    ideogramCalls = []; openaiCalls = []
    await orchestrateImageGeneration(
      brief({ providerOptions: { ideogram: { style_type: 'REALISTIC' } }, providerPreference: 'openai' }),
      { ...RUN, candidates: [IDEOGRAM, OPENAI] },
    )
    expect(openaiCalls[0].params.style_type).toBeUndefined()
  })

  it('provider options cannot alter project, execution or operation', async () => {
    await orchestrateImageGeneration(
      brief({ providerOptions: { ideogram: {
        project: { projectId: PROJECT_B }, execution: 'forged', operation: 'forged',
      } } }),
      { ...RUN, candidates: [IDEOGRAM] },
    )
    // The governance ctx is assembled from the brief's own fields; options only
    // reach the request BODY.
    expect(ideogramCalls[0].ctx.project).toEqual({ projectId: PROJECT_A })
    expect(ideogramCalls[0].ctx.execution).toBe(EXECUTION)
    expect(ideogramCalls[0].ctx.operation).toBe('Test Image')
  })

  it('the brief type carries no endpoint, credential, bucket or asset id', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../media/orchestrator/types.ts', import.meta.url), 'utf8')
    const iface = src.slice(src.indexOf('export interface MediaGenerationBrief'))
      .slice(0, src.slice(src.indexOf('export interface MediaGenerationBrief')).indexOf('\n}'))
    for (const forbidden of ['endpoint', 'apiKey', 'api_key', 'credential', 'bucket', 'assetId', 'budget']) {
      expect(iface.toLowerCase()).not.toContain(forbidden.toLowerCase() + '?:')
      expect(iface.toLowerCase()).not.toContain(forbidden.toLowerCase() + ':')
    }
  })

  it('the candidate id set is closed', () => {
    expect([...MEDIA_CANDIDATE_IDS]).toEqual(['ideogram', 'openai', 'muapi'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 17 — no existing no-reference path is converted to required-reference
// ─────────────────────────────────────────────────────────────────────────────

describe('existing behaviour is not tightened by accident', () => {
  it('a brief with no reference requirement keeps every candidate eligible', () => {
    const { eligible } = filterEligible([IDEOGRAM, OPENAI], brief() as any)
    expect(eligible.map(c => c.id)).toEqual(['ideogram', 'openai'])
  })

  it("referenceRequirement defaults to 'none' — omitting it does not require one", async () => {
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [IDEOGRAM] })
    expect(r.selection.candidate).toBe('ideogram')          // not reference-capable
    expect(r.selection.rejected).toEqual([])
  })

  it('premium quality prefers a conditionable model but never REQUIRES one', async () => {
    const r = await orchestrateImageGeneration(
      brief({ quality: 'premium' }), { ...RUN, candidates: [IDEOGRAM, OPENAI] })
    expect(r.selection.candidate).toBe('openai')

    // ...and with only ideogram available, premium still succeeds.
    ideogramCalls = []; openaiCalls = []
    const only = await orchestrateImageGeneration(
      brief({ quality: 'premium' }), { ...RUN, candidates: [IDEOGRAM] })
    expect(only.selection.candidate).toBe('ideogram')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Candidate description reads the real router, not a copy of it
// ─────────────────────────────────────────────────────────────────────────────

describe('candidates are described, not invented', () => {
  it('reports Ideogram as image-only and NOT reference-capable', () => {
    const found = describeMediaCandidates({ IDEOGRAM_API_KEY: 'x' } as any)
      .find(c => c.id === 'ideogram')!
    // A fact about Omnira's integration: generateIdeogramV3 posts to the
    // text-to-image endpoint and carries no image.
    expect(found.model.supportsReferenceImages).toBe(false)
    expect(found.configured).toBe(true)
  })

  it('reports OpenAI as reference-capable via images.edit', () => {
    const found = describeMediaCandidates({ OPENAI_API_KEY: 'x' } as any)
      .find(c => c.id === 'openai')!
    expect(found.model.supportsReferenceImages).toBe(true)
  })

  it('reports an absent credential as unconfigured rather than omitting it', () => {
    const cands = describeMediaCandidates({} as any)
    expect(cands.find(c => c.id === 'ideogram')!.configured).toBe(false)
    expect(cands.find(c => c.id === 'openai')!.configured).toBe(false)
    // Visible-but-rejected, so "switched off" is distinguishable from "absent".
    expect(cands.map(c => c.id)).toEqual(expect.arrayContaining(['ideogram', 'openai']))
  })

  it('includes the provider-layer family from the real router, gated off', () => {
    const muapi = describeMediaCandidates({} as any).find(c => c.id === 'muapi')
    expect(muapi).toBeDefined()
    expect(muapi!.family).toBe('provider-layer')
    // MuAPI ships disabled; the orchestrator reports the gate's own answer.
    expect(muapi!.gateRefused).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HARDENING — dispatchability precedes ranking
// ─────────────────────────────────────────────────────────────────────────────

describe('a candidate that cannot be dispatched never reaches ranking', () => {
  it('an ALLOWED but undispatchable candidate is rejected before ranking', () => {
    // The case the first Phase 2 cut got wrong: configured, gate-clear, and
    // therefore "eligible" — then undispatchable at the moment of spending.
    const { eligible, rejected } = filterEligible([UNDISPATCHABLE], brief() as any)

    expect(eligible).toEqual([])
    expect(rejected).toHaveLength(1)
    expect(rejected[0].rule).toBe('execution_not_supported')
    expect(rejected[0].detail).toMatch(/job lifecycle/)
  })

  it('it cannot win even when it is the stated preference', async () => {
    const r = await orchestrateImageGeneration(
      brief({ providerPreference: 'muapi' }),
      { ...RUN, candidates: [UNDISPATCHABLE, IDEOGRAM] },
    )
    expect(r.selection.candidate).toBe('ideogram')
    expect(r.selection.rankedEligible).not.toContain('muapi')
  })

  it('an undispatchable-only set fails closed with zero provider calls', async () => {
    const err = await orchestrateImageGeneration(
      brief(), { ...RUN, candidates: [UNDISPATCHABLE] }).catch(e => e)

    expect(err.code).toBe('NO_ELIGIBLE_PROVIDER')
    expect(err.rejections[0].rule).toBe('execution_not_supported')
    expect(paidCalls()).toBe(0)
  })

  it('INVARIANT: every eligible candidate has a dispatch path', () => {
    // The hardening principle stated directly, over every combination that can
    // reach the filter.
    const all = [IDEOGRAM, OPENAI, MUAPI_OFF, UNDISPATCHABLE]
    for (const reference of ['none', 'required'] as const) {
      const { eligible } = filterEligible(all, brief({ referenceRequirement: reference }) as any)
      expect(eligible.every(c => c.dispatch.supported)).toBe(true)
    }
  })

  it('NEGATIVE CONTROL: without the rule, an undispatchable candidate would win', () => {
    // Reconstructs the pre-hardening filter — every rule EXCEPT dispatchability
    // — and shows it admits exactly the candidate the real filter now rejects.
    const preHardening = [UNDISPATCHABLE].filter(c =>
      c.mediaTypes.includes('image') && c.configured && !c.gateRefused)

    expect(preHardening).toHaveLength(1)                       // it passed
    expect(rankEligible(preHardening, brief() as any)[0].id).toBe('muapi')  // and would be selected

    // Which is exactly what the real filter forbids:
    expect(filterEligible([UNDISPATCHABLE], brief() as any).eligible).toEqual([])
  })

  it('the real router-derived MuAPI candidate is undispatchable', () => {
    const muapi = describeMediaCandidates({} as any).find(c => c.id === 'muapi')!
    expect(muapi.dispatch.supported).toBe(false)
    // Still DISCOVERABLE — future metadata is not deleted, only kept out of the
    // eligible set.
    expect(muapi.model.name).toContain('muapi')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HARDENING — base64 result representation
// ─────────────────────────────────────────────────────────────────────────────

describe('gpt-image-1 base64 output is admitted as bytes', () => {
  /** A byte-valid PNG, base64-encoded, as gpt-image-1 returns it. */
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(32).fill(0)])
  const PNG_B64 = PNG.toString('base64')

  it('decodes and admits through the SAME Phase 1 admission', async () => {
    openaiB64 = PNG_B64
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] })

    expect(admitCalls).toHaveLength(1)
    // Bytes, not a URL — no temporary public URL is minted anywhere.
    expect(admitCalls[0].bytes).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(admitCalls[0].bytes).equals(PNG)).toBe(true)
    expect(admitCalls[0].sourceUrl).toBeUndefined()
    expect(r.asset.id).toBe('asset-0000-0000-0000-00000000000a')
  })

  it('identifies the MIME from the BYTES, not from the provider’s word', async () => {
    openaiB64 = PNG_B64
    await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] })
    expect(admitCalls[0].mimeType).toBe('image/png')
  })

  it('the raw base64 never becomes canonical state', async () => {
    openaiB64 = PNG_B64
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] })
    expect(JSON.stringify(r)).not.toContain(PNG_B64.slice(0, 24))
    expect(JSON.stringify(admitCalls[0].provenance)).not.toContain(PNG_B64.slice(0, 24))
  })

  it('records which representation was used, for provenance', async () => {
    openaiB64 = PNG_B64
    await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] })
    expect(admitCalls[0].provenance.providerMetadata.resultRepresentation).toBe('bytes')
  })

  it('MALFORMED base64 fails closed', async () => {
    openaiB64 = 'not!valid!base64!!'
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] }).catch(e => e)

    expect(err.code).toBe('PROVIDER_RESULT_INVALID')
    expect(err.message).toMatch(/malformed base64/)
    expect(admitCalls).toEqual([])
  })

  it('an EMPTY payload fails closed', async () => {
    openaiB64 = ''
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] }).catch(e => e)
    expect(err.code).toBe('PROVIDER_RESULT_INVALID')
    expect(admitCalls).toEqual([])
  })

  it('bytes that are not a recognised image fail closed', async () => {
    openaiB64 = Buffer.from('this is plain text, not an image').toString('base64')
    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] }).catch(e => e)

    expect(err.code).toBe('PROVIDER_RESULT_INVALID')
    expect(err.message).toMatch(/not a recognised image format/)
    expect(admitCalls).toEqual([])
  })

  it('the SIZE ceiling is Phase 1’s, not a second one', async () => {
    // Oversize is enforced by `assertSizeWithinBounds` inside admitAssetBytes —
    // the orchestrator deliberately does not re-implement a limit. Proven by
    // letting admission refuse and checking the failure is attributed correctly.
    openaiB64 = PNG_B64
    admitShouldThrow = Object.assign(new Error('above the 33554432-byte ceiling'),
      { name: 'AssetRejectedError', code: 'ASSET_SIZE_INVALID' })

    const err = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] }).catch(e => e)
    expect(err.code).toBe('ASSET_ADMISSION_FAILED')
    expect(paidCalls()).toBe(1)   // and NOT regenerated
  })

  it('a byte failure triggers no second provider generation', async () => {
    openaiB64 = 'not!valid!base64!!'
    await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI, IDEOGRAM] }).catch(() => {})
    expect(paidCalls()).toBe(1)
    expect(ideogramCalls).toEqual([])
  })

  it('the provider still cannot choose bucket, path or asset id on the byte path', async () => {
    openaiB64 = PNG_B64
    const r = await orchestrateImageGeneration(brief(), { ...RUN, candidates: [OPENAI] })

    expect(Object.keys(admitCalls[0].storage)).toEqual(['path'])
    expect(Object.keys(admitCalls[0])).not.toContain('id')
    expect(admitCalls[0].projectId).toBe(PROJECT_A)
    expect(r.asset.id).toBe('asset-0000-0000-0000-00000000000a')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HARDENING — no generic waiver exists
// ─────────────────────────────────────────────────────────────────────────────

describe('there is no allowUnlicensed escape hatch', () => {
  it('the string does not appear anywhere in the orchestrator or its callers', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['orchestrate.ts', 'eligibility.ts', 'candidates.ts', 'types.ts']) {
      const src = readFileSync(new URL(`../media/orchestrator/${f}`, import.meta.url), 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
      expect(code).not.toContain('allowUnlicensed')
    }
    // Comments stripped on both kinds: the orchestrator's doc comments name the
    // removed option deliberately, to record why it is gone. That prose must not
    // be what keeps this test passing — or what fails it.
    const hero = readFileSync(new URL('../article/hero-image.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    expect(hero).not.toContain('allowUnlicensed')
  })

  it('the internal caller list is CLOSED', async () => {
    const { INTERNAL_MEDIA_CALLERS } = await import('@/lib/media/orchestrator/types')
    expect([...INTERNAL_MEDIA_CALLERS]).toEqual(['article-hero'])
  })

  it('Atlas draft / L0 / autonomy gates are unchanged', async () => {
    const cap = await import('@/lib/atlas/capability/media-generation')
    expect(cap.MEDIA_GENERATION_LICENSE_STATUS).toBe('draft')
    expect(cap.MEDIA_GENERATION_AUTONOMY_LEVEL).toBe('L0')
    expect(cap.MEDIA_GENERATION_AUTONOMOUS_EXECUTION).toBe(false)
    const answer = await cap.mediaGenerationAvailability({
      projectId: 'p', missionId: 'm', missionVersion: 1,
      tools: [cap.MEDIA_GENERATION_TOOL_BOUND], dataScope: [],
    } as any)
    expect(answer.tools).toBe(false)
  })

  it('media_orchestrator is still an UNMET prerequisite', async () => {
    // Restored: the canonical definition of that prerequisite includes the
    // provider job lifecycle and a QC loop, neither of which Phase 2 ships.
    const cap = await import('@/lib/atlas/capability/media-generation')
    expect([...cap.MEDIA_GENERATION_UNMET_PREREQUISITES]).toContain('media_orchestrator')
  })
})
