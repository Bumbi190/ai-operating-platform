import { describe, expect, it, vi } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { leadFinderReadinessApi } from '@/lib/handlarborsen/lead-finder/api'
import { buildExclusionIndex, entriesFromSalesContactData } from '@/lib/handlarborsen/lead-finder/exclusions'
import { FIXTURE_RECORDS, ORG, withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { assertPlacesAllowed, PlacesDisabledError, toStorablePlaceRef } from '@/lib/handlarborsen/lead-finder/google-places-policy'
import { normalizeCompanyName, normalizeOrgnr } from '@/lib/handlarborsen/lead-finder/identity'
import { applyReview, LifecycleError } from '@/lib/handlarborsen/lead-finder/lifecycle'
import { buildPreview, MAX_PREVIEW_CANDIDATES } from '@/lib/handlarborsen/lead-finder/pipeline'
import { getReadiness } from '@/lib/handlarborsen/lead-finder/readiness'
import {
  assertScbLiveBaseUrl, createScbPageFetcher, mapLegalEntity, mapWorkplace, normalizeSni, ScbContractError, ScbLiveSearchDisabledError, ScbNetworkError,
} from '@/lib/handlarborsen/lead-finder/scb-client'
import { paginateScb, requireScbApiKey, ScbHttpError, ScbKeyMissingError } from '@/lib/handlarborsen/lead-finder/scb-source'
import type { ExistingEntry, Provenance, ScbRegisterRecord } from '@/lib/handlarborsen/lead-finder/types'

const provenance: Provenance = { source: 'fixture', retrievedAt: '2026-10-27T00:00:00Z', query: 'fixture' }
const existingEntries: ExistingEntry[] = [
  { kind: 'declined', orgnr: ORG.declined },
  { kind: 'pilot_contact', companyName: 'Epsilon Bil Aktiebolag' },
  { kind: 'suppressed', companyName: 'ZETA FORDON' },
]
const run = (records = FIXTURE_RECORDS, limit?: number) =>
  buildPreview(records, { existing: buildExclusionIndex(existingEntries), provenance, limit })

describe('identity', () => {
  it('accepts valid orgnr incl. 12-digit 16-prefix and rejects bad checksum', () => {
    expect(normalizeOrgnr(ORG.alpha)).toBe(ORG.alpha)
    expect(normalizeOrgnr(`16${ORG.alpha.slice(0, 6)}-${ORG.alpha.slice(6)}`)).toBe(ORG.alpha)
    expect(normalizeOrgnr(ORG.alpha.slice(0, 9) + ((Number(ORG.alpha[9]) + 1) % 10))).toBeNull()
    expect(normalizeOrgnr('abc')).toBeNull()
  })
  it('normalizes legal suffixes and diacritics', () => {
    expect(normalizeCompanyName('Bilhuset Åkerlund & Söner AB')).toBe(normalizeCompanyName('bilhuset akerlund och soner Aktiebolag'))
  })
})

describe('preview pipeline', () => {
  const report = run()
  const byName = (n: string) => report.candidates.find((c) => c.name === n)

  it('is a dry run that never triggers outreach', () => {
    expect(report.dryRun).toBe(true)
    expect(report.outreachTriggered).toBe(false)
    expect(report.candidates.every((c) => c.contactData === null)).toBe(true)
  })
  it('folds workplaces of one orgnr into one candidate and skips repeated pages', () => {
    const alpha = report.candidates.filter((c) => c.orgnr === ORG.alpha)
    expect(alpha).toHaveLength(1)
    expect(alpha[0].workplaces.map((w) => w.cfar)).toEqual(['1001', '1002'])
    expect(report.skipped).toEqual({ invalidOrgnr: 1, duplicateWorkplaces: 1 })
  })
  it('excludes declined, pilot, suppressed, inactive, wrong segment and out-of-region', () => {
    const reasons = (org: string) => report.candidates.find((c) => c.orgnr === org)
    expect(reasons(ORG.declined)?.exclusions).toContain('declined')
    expect(reasons(ORG.pilot)?.exclusions).toContain('pilot_contact')
    expect(reasons(ORG.suppressed)?.status).toBe('suppressed')
    expect(reasons(ORG.inactive)?.exclusions).toContain('inactive')
    expect(reasons(ORG.wrongSegment)?.exclusions).toContain('not_target_segment')
    expect(reasons(ORG.wholesaleOutside)?.exclusions).toContain('out_of_region')
  })
  it('keeps eligible candidates in needs_review, ranked by score', () => {
    const review = report.candidates.filter((c) => c.status === 'needs_review')
    expect(review.map((c) => c.orgnr).sort()).toEqual([ORG.alpha, ORG.beta, ORG.gamma].sort())
    // sni 40 + region 30 + active 10 + legal entity 10
    expect(byName('Testbil Alfa AB')?.score).toBe(90)
  })
  it('excludes sole proprietors from the review queue for GDPR review', () => {
    const sole = report.candidates.find((c) => c.soleProprietor)!
    expect(sole.status).toBe('excluded')
    expect(sole.exclusions).toContain('sole_proprietor_gdpr_review')
    expect(report.candidates.filter((c) => c.status === 'needs_review').some((c) => c.soleProprietor)).toBe(false)
  })
  it('minimizes sole proprietor data', () => {
    const sole = report.candidates.find((c) => c.soleProprietor)!
    expect(sole.orgnr).toBeNull()
    expect(sole.name).toBe('')
    expect(JSON.stringify(report)).not.toContain(ORG.sole)
    expect(JSON.stringify(report)).not.toContain('Testsson')
  })
  it('caps eligible candidates at 50', () => {
    const many: ScbRegisterRecord[] = Array.from({ length: 80 }, (_, i) => ({
      orgnr: withCheckDigit(String(556100000 + i)), name: `Syntetisk Bil ${i} AB`, cfar: String(i), sniCodes: ['47.811'], countyCode: '12', active: true,
    }))
    const r = run(many, 500)
    expect(r.candidates.filter((c) => c.status === 'needs_review')).toHaveLength(MAX_PREVIEW_CANDIDATES)
  })
  it('maps sales_contacts jsonb to exclusions without keeping the mailbox', () => {
    const entries = entriesFromSalesContactData({ companyName: 'Foo Bil AB', email: 'x@foo.se', history: 'contacted', suppressed: false, excluded: false })
    expect(entries).toEqual([{ kind: 'contacted', companyName: 'Foo Bil AB', domain: 'foo.se' }])
    expect(JSON.stringify(entries)).not.toContain('x@')
  })
})

describe('review lifecycle', () => {
  const [ok] = run().candidates.filter((c) => c.status === 'needs_review')
  it('requires reviewer and batch', () => {
    expect(() => applyReview({ candidate: ok, to: 'approved_for_outreach_review', reviewerId: '', batchId: 'b' })).toThrow(LifecycleError)
  })
  it('approves a clean candidate only into the review-eligible state', () => {
    const a = applyReview({ candidate: ok, to: 'approved_for_outreach_review', reviewerId: 'u', batchId: 'b' })
    expect(a.status).toBe('approved_for_outreach_review')
  })
  it('refuses excluded and sole-proprietor approval', () => {
    const r = run()
    for (const c of r.candidates.filter((x) => x.exclusions.length || x.soleProprietor)) {
      expect(() => applyReview({ candidate: c, to: 'approved_for_outreach_review', reviewerId: 'u', batchId: 'b' })).toThrow(LifecycleError)
    }
  })
})

describe('paginateScb', () => {
  const rec = (i: number): ScbRegisterRecord => ({ orgnr: String(i), name: 'x', sniCodes: [] })
  const clock = () => {
    let t = 0
    return { now: () => t, sleep: vi.fn(async (ms: number) => { t += ms }) }
  }
  it('follows cursors and spaces requests <= 4/s', async () => {
    const c = clock()
    const stamps: number[] = []
    const fetchPage = vi.fn(async ({ cursor }: { cursor: string | null }) => {
      stamps.push(c.now())
      const n = cursor ? Number(cursor) : 0
      return { rows: [rec(n)], nextCursor: n < 3 ? String(n + 1) : null }
    })
    const r = await paginateScb(fetchPage, { ...c, maxPages: 10 })
    expect(r.rows).toHaveLength(4)
    expect(r.truncated).toBe(false)
    for (let i = 1; i < stamps.length; i++) expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(250)
  })
  it('clamps page size to 5000 and requests/sec to 4', async () => {
    const c = clock()
    const fetchPage = vi.fn(async (_: { cursor: string | null; pageSize: number }) => ({ rows: [], nextCursor: null }))
    await paginateScb(fetchPage, { ...c, pageSize: 99999, requestsPerSecond: 50 })
    expect(fetchPage.mock.calls[0][0].pageSize).toBe(5000)
  })
  it('rejects pageSize <= 0 and requestsPerSecond <= 0 before any request', async () => {
    const c = clock()
    const fetchPage = vi.fn(async () => ({ rows: [], nextCursor: null }))
    for (const pageSize of [0, -1, Number.NaN]) {
      await expect(paginateScb(fetchPage, { ...c, pageSize })).rejects.toThrow(RangeError)
    }
    for (const requestsPerSecond of [0, -4, Number.NaN]) {
      await expect(paginateScb(fetchPage, { ...c, requestsPerSecond })).rejects.toThrow(RangeError)
    }
    expect(fetchPage).not.toHaveBeenCalled()
  })
  it('retries 429/5xx with backoff then succeeds, honours Retry-After', async () => {
    const c = clock()
    let calls = 0
    const fetchPage = async () => {
      if (++calls === 1) throw new ScbHttpError(429, 2000)
      if (calls === 2) throw new ScbHttpError(503)
      return { rows: [rec(1)], nextCursor: null }
    }
    const r = await paginateScb(fetchPage, c)
    expect(r.rows).toHaveLength(1)
    expect(c.sleep).toHaveBeenCalledWith(2000)
  })
  it('does not retry 4xx other than 429, and gives up after maxRetries', async () => {
    const c = clock()
    const f401 = vi.fn(async () => { throw new ScbHttpError(401) })
    await expect(paginateScb(f401, c)).rejects.toThrow(ScbHttpError)
    expect(f401).toHaveBeenCalledTimes(1)
    const f500 = vi.fn(async () => { throw new ScbHttpError(500) })
    await expect(paginateScb(f500, { ...c, maxRetries: 2 })).rejects.toThrow(ScbHttpError)
    expect(f500).toHaveBeenCalledTimes(3)
  })
  it('stops at maxPages and reports truncation', async () => {
    const c = clock()
    const r = await paginateScb(async () => ({ rows: [rec(1)], nextCursor: 'more' }), { ...c, maxPages: 2 })
    expect(r.pages).toBe(2)
    expect(r.truncated).toBe(true)
  })
})

describe('SCB AFR HTTP adapter (mocked, no live requests)', () => {
  const KEY = 'test-key-never-logged'
  const BASE = 'https://scb.example.test'
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
  const ae = (extra: Record<string, unknown> = {}) => ({
    cfarNr: 1001, peOrgNr: ORG.alpha, ben: 'Testbil Alfa AB',
    primarNaringsgren: { rangordning: 1, naringsgren: '47811' },
    belagenhetsadress: { lan: '12', kommun: '1280', bPostOrt: 'MALMÖ' },
    ...extra,
  })
  const make = (fetchImpl: typeof fetch, over: Partial<Parameters<typeof createScbPageFetcher>[0]> = {}) =>
    createScbPageFetcher({ source: 'arbetsstallen', sni: '47.811', baseUrl: BASE, apiKey: KEY, fetchImpl, ...over })

  it('normalizes SNI both ways', () => {
    expect(normalizeSni('47811')).toBe('47.811')
    expect(normalizeSni('47.811')).toBe('47.811')
    expect(normalizeSni(' 46 711 ')).toBe('46.711')
    expect(normalizeSni('47')).toBe('47')
    expect(normalizeSni('4')).toBeNull()
    expect(normalizeSni('abc')).toBeNull()
    expect(normalizeSni('478111')).toBeNull()
    expect(normalizeSni(undefined)).toBeNull()
  })

  it('requests the documented AE path, query and X-API-Key header', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ pagination: { hasMore: false, limit: 500 }, arbetsstallen: [ae()] }))
    const page = await make(f)({ cursor: null, pageSize: 500 })
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toBe(`${BASE}/v1/arbetsstallen/naringsgren/47811?limit=500`)
    expect((init!.headers as Record<string, string>)['X-API-Key']).toBe(KEY)
    expect(init!.method).toBe('GET')
    expect(page.nextCursor).toBeNull()
    expect(page.rows[0]).toEqual({
      orgnr: ORG.alpha, name: 'Testbil Alfa AB', cfar: '1001', legalForm: null, sniCodes: ['47.811'],
      countyCode: '12', municipalityCode: '1280', city: 'MALMÖ',
    })
  })

  it('requests the documented JE path and maps jes', async () => {
    const f = vi.fn<typeof fetch>(async () => json({
      pagination: { hasMore: false },
      jes: [{ peOrgNr: ORG.beta, namn: 'Testgross AB', jurform: '49', lanSate: '12', kommunSate: '1281', postAdress: { postOrt: 'LUND' }, primarNaringsgren: { naringsgren: '46711' } }],
    }))
    const page = await make(f, { source: 'juridiskaenheter', sni: '46711' })({ cursor: '77', pageSize: 10 })
    expect(String(f.mock.calls[0][0])).toBe(`${BASE}/v1/juridiskaenheter/naringsgren/46711?limit=10&cursorId=77`)
    expect(page.rows[0]).toEqual({
      orgnr: ORG.beta, name: 'Testgross AB', cfar: null, legalForm: '49', sniCodes: ['46.711'],
      countyCode: '12', municipalityCode: '1281', city: 'LUND',
    })
  })

  it('maps missing/odd fields safely instead of guessing', () => {
    expect(mapWorkplace({})).toEqual({ orgnr: '', name: '', cfar: null, legalForm: null, sniCodes: [], countyCode: null, municipalityCode: null, city: null })
    expect(mapWorkplace(ae({ belagenhetsadress: { lan: 'Skåne' }, cfarNr: 'x', primarNaringsgren: { naringsgren: 'n/a' } }))).toMatchObject({
      countyCode: null, cfar: null, sniCodes: [],
    })
    expect(mapWorkplace(ae({ belagenhetsadress: { lan: '1' } })).countyCode).toBe('01')
    expect(mapLegalEntity({ orgNr: ORG.gamma }).orgnr).toBe(ORG.gamma)
    expect(() => mapWorkplace('nope')).toThrow(ScbContractError)
    expect(() => mapLegalEntity(null)).toThrow(ScbContractError)
  })

  it('follows pagination.nextCursorId via paginateScb until hasMore is false', async () => {
    const pages = [
      { pagination: { hasMore: true, nextCursorId: 11 }, arbetsstallen: [ae({ cfarNr: 1 })] },
      { pagination: { hasMore: true, nextCursorId: 22 }, arbetsstallen: [ae({ cfarNr: 2 })] },
      { pagination: { hasMore: false }, arbetsstallen: [ae({ cfarNr: 3 })] },
    ]
    let i = 0
    const f = vi.fn<typeof fetch>(async () => json(pages[i++]))
    let t = 0
    const r = await paginateScb(make(f), { pageSize: 1, maxPages: 10, now: () => t, sleep: async (ms) => { t += ms } })
    expect(r.rows.map((x) => x.cfar)).toEqual(['1', '2', '3'])
    expect(r.truncated).toBe(false)
    expect(f.mock.calls.map(([u]) => new URL(String(u)).searchParams.get('cursorId'))).toEqual([null, '11', '22'])
  })

  it('rejects malformed responses and bad cursors as contract errors', async () => {
    const bad = async (body: unknown, cursor: string | null = null) =>
      make(vi.fn<typeof fetch>(async () => json(body)))({ cursor, pageSize: 5 })
    await expect(bad([])).rejects.toThrow(ScbContractError)
    await expect(bad({ pagination: { hasMore: false } })).rejects.toThrow(ScbContractError) // no collection
    await expect(bad({ pagination: { hasMore: false }, jes: [] })).rejects.toThrow(ScbContractError) // wrong key for AE
    await expect(bad({ arbetsstallen: [] })).rejects.toThrow(ScbContractError) // no pagination
    await expect(bad({ pagination: { hasMore: 'yes' }, arbetsstallen: [] })).rejects.toThrow(ScbContractError)
    await expect(bad({ pagination: { hasMore: true }, arbetsstallen: [] })).rejects.toThrow(ScbContractError) // no cursor
    await expect(bad({ pagination: { hasMore: true, nextCursorId: -1 }, arbetsstallen: [] })).rejects.toThrow(ScbContractError)
    await expect(bad({ pagination: { hasMore: true, nextCursorId: 1.5 }, arbetsstallen: [] })).rejects.toThrow(ScbContractError)
    await expect(bad({ pagination: { hasMore: true, nextCursorId: 2 ** 31 }, arbetsstallen: [] })).rejects.toThrow(ScbContractError)
    await expect(bad({ pagination: { hasMore: true, nextCursorId: 5 }, arbetsstallen: [] }, '5')).rejects.toThrow(ScbContractError) // not advancing
    await expect(bad({ pagination: { hasMore: false }, arbetsstallen: [1] })).rejects.toThrow(ScbContractError)
    await expect(make(vi.fn<typeof fetch>(async () => new Response('<html>', { status: 200 })))({ cursor: null, pageSize: 5 })).rejects.toThrow(ScbContractError)
    await expect(bad({ pagination: { hasMore: false }, arbetsstallen: [] }, 'abc')).rejects.toThrow(RangeError)
    await expect(bad({ pagination: { hasMore: false }, arbetsstallen: [] }, '99999999999')).rejects.toThrow(RangeError)
  })

  it('rejects out-of-range page sizes and bad config before any request', async () => {
    const f = vi.fn<typeof fetch>()
    for (const pageSize of [0, 5001, 1.5]) await expect(make(f)({ cursor: null, pageSize })).rejects.toThrow(RangeError)
    expect(() => make(f, { sni: 'x' })).toThrow(RangeError)
    expect(() => make(f, { baseUrl: 'http://scb.example.test' })).toThrow(RangeError)
    expect(() => make(f, { baseUrl: 'not a url' })).toThrow(RangeError)
    expect(() => make(f, { version: '1/../x' })).toThrow(RangeError)
    expect(f).not.toHaveBeenCalled()
  })

  it('maps HTTP failures to ScbHttpError with Retry-After, retried only for 429/5xx', async () => {
    const respond = (status: number, headers: Record<string, string> = {}) =>
      make(vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ title: 'x', detail: KEY }), { status, headers: { 'content-type': 'application/problem+json', ...headers } })))
    await expect(respond(429, { 'retry-after': '3' })({ cursor: null, pageSize: 5 })).rejects.toMatchObject({ name: 'ScbHttpError', status: 429, retryAfterMs: 3000 })
    await expect(respond(429, { 'retry-after': '99999' })({ cursor: null, pageSize: 5 })).rejects.toMatchObject({ retryAfterMs: 60_000 })
    await expect(respond(503)({ cursor: null, pageSize: 5 })).rejects.toMatchObject({ status: 503, retryAfterMs: undefined })
    // problem+json bodies are never copied into errors
    const err = await respond(401)({ cursor: null, pageSize: 5 }).catch((e) => e as Error)
    expect(err).toBeInstanceOf(ScbHttpError)
    if (!(err instanceof Error)) throw new Error('expected an Error')
    expect(`${err.message}${err.stack}`).not.toContain(KEY)

    const c = { t: 0 }
    let calls = 0
    const f = vi.fn<typeof fetch>(async () => (++calls < 3 ? new Response('{}', { status: 503 }) : json({ pagination: { hasMore: false }, arbetsstallen: [ae()] })))
    const r = await paginateScb(make(f), { now: () => c.t, sleep: async (ms) => { c.t += ms } })
    expect(r.rows).toHaveLength(1)
    expect(f).toHaveBeenCalledTimes(3)
    const f401 = vi.fn<typeof fetch>(async () => new Response('{}', { status: 401 }))
    await expect(paginateScb(make(f401), { now: () => 0, sleep: async () => {} })).rejects.toThrow(ScbHttpError)
    expect(f401).toHaveBeenCalledTimes(1)
  })

  it('network failure is a key-free ScbNetworkError', async () => {
    const f = vi.fn<typeof fetch>(async () => { throw new TypeError(`connect failed, headers ${KEY}`) })
    const err = await make(f)({ cursor: null, pageSize: 5 }).catch((e) => e as Error)
    expect(err).toBeInstanceOf(ScbNetworkError)
    if (!(err instanceof Error)) throw new Error('expected an Error')
    expect(`${err.message}${err.stack}${String((err as { cause?: unknown }).cause)}`).not.toContain(KEY)
  })

  it('missing API key fails before any request', () => {
    const f = vi.fn<typeof fetch>()
    const prev = process.env.SCB_API_KEY
    delete process.env.SCB_API_KEY
    try {
      expect(() => createScbPageFetcher({ source: 'arbetsstallen', sni: '47811', baseUrl: BASE, fetchImpl: f })).toThrow(ScbKeyMissingError)
    } finally {
      if (prev !== undefined) process.env.SCB_API_KEY = prev
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('real client only accepts the bare https://apiafr.scb.se origin (key never sent elsewhere)', () => {
    expect(() => assertScbLiveBaseUrl('https://apiafr.scb.se')).not.toThrow()
    expect(() => assertScbLiveBaseUrl('https://apiafr.scb.se/')).not.toThrow()
    for (const bad of [
      'http://apiafr.scb.se', 'https://evil.example', 'https://apiafr.scb.se.evil.example',
      'https://apiafr.scb.se@evil.example', 'https://user:pw@apiafr.scb.se', 'https://apiafr.scb.se:8443',
      'https://apiafr.scb.se/v1', 'https://apiafr.scb.se/?x=1', 'https://apiafr.scb.se/#frag', 'https://apiafr.scb.se#',
      'https://apiafr.scb.se.', 'https://scb.example.test', 'not a url',
    ]) expect(() => assertScbLiveBaseUrl(bad), bad).toThrow(RangeError)
  })

  it('redirects are never followed by the SCB request', async () => {
    const f = vi.fn<typeof fetch>(async () => json({ pagination: { hasMore: false }, arbetsstallen: [] }))
    await make(f)({ cursor: null, pageSize: 5 })
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })

  it('live search stays disabled without an injected fetch', () => {
    expect(() => createScbPageFetcher({ source: 'arbetsstallen', sni: '47811', baseUrl: BASE, apiKey: KEY })).toThrow(ScbLiveSearchDisabledError)
  })
})

describe('safety gates', () => {
  it('missing SCB key fails before any call and never echoes a value', () => {
    expect(() => requireScbApiKey({})).toThrow(ScbKeyMissingError)
    expect(() => requireScbApiKey({ SCB_API_KEY: '  ' })).toThrow(ScbKeyMissingError)
    const r = getReadiness({ SCB_API_KEY: 'secret-value' })
    expect(JSON.stringify(r)).not.toContain('secret-value')
    expect(r.scbKeyConfigured).toBe(true)
    expect(r.scbContractVerified).toBe(true)
    expect(r.scbLiveSearchApproved).toBe(false)
    expect(r.liveSearchAvailable).toBe(false) // key + contract are not enough without explicit approval
    expect(r.persistence).toBe('schema_created_import_disabled') // migration exists, import remains gated
  })
  it('Google Places is disabled even when flagged and only Place IDs are storable', () => {
    expect(() => assertPlacesAllowed({})).toThrow(PlacesDisabledError)
    expect(() => assertPlacesAllowed({ HB_LEADFINDER_GOOGLE_PLACES_ENABLED: 'true' })).toThrow(PlacesDisabledError)
    expect(toStorablePlaceRef({ placeId: 'ChIJabcdefghij', name: 'X', phone: '1' })).toEqual({ placeId: 'ChIJabcdefghij' })
    expect(toStorablePlaceRef({ name: 'X' })).toBeNull()
  })
})

describe('readiness route', () => {
  const call = (access: Parameters<typeof leadFinderReadinessApi>[1]['resolveAccess'], method = 'GET') =>
    leadFinderReadinessApi(new Request('http://x/api', { method }), { resolveAccess: access, env: {} })
  it('401 unauthenticated, 403 wrong project, 405 non-GET', async () => {
    expect((await call(async () => ({ ok: false, status: 401 }))).status).toBe(401)
    expect((await call(async () => ({ ok: true, userId: 'u', allowedProjectIds: ['other'] }))).status).toBe(403)
    expect((await call(async () => ({ ok: true, userId: 'u', allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] }), 'POST')).status).toBe(405)
  })
  it('200 for the project owner with no secrets and no live search', async () => {
    const res = await call(async () => ({ ok: true, userId: 'u', allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.readiness.liveSearchAvailable).toBe(false)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})
