import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { csvField } from '@/lib/handlarborsen/lead-finder/offline-vetting'
import { STATUS_AUDIT_EXPORT_COLUMNS } from '@/lib/handlarborsen/lead-finder/status-audit'
import { buildImportIntake } from '@/lib/handlarborsen/lead-finder/import-intake'
import { buildLocalReview } from '@/lib/handlarborsen/lead-finder/local-review'
import { buildResearchQueue, evaluateLeadEvidence, type ResearchJob } from '@/lib/handlarborsen/lead-finder/lead-research'
import { runLeadResearch } from '@/lib/handlarborsen/lead-finder/lead-research-worker'
import type { ImportProjectRow } from '@/lib/handlarborsen/lead-finder/import-api'
import {
  TAVILY_MAX_RESPONSE_BYTES, TAVILY_SEARCH_URL, makeTavilyResearchAdapter,
} from '@/lib/handlarborsen/lead-finder/tavily-research-adapter'
import {
  RESEARCH_CONFIRMATION, leadFinderResearchApi, type LeadFinderResearchDeps,
} from '@/lib/handlarborsen/lead-finder/research-api'
import {
  HandlarborsenResearchResults, parseResearchResponse,
} from '@/components/platform/vnext/HandlarborsenResearchResults'

const KEY = 'tvly-synthetic-key-0000'
const NOW = () => new Date('2026-10-28T10:00:00Z')
const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// ---------------------------------------------------------------- synthetic fixtures
type Col = (typeof STATUS_AUDIT_EXPORT_COLUMNS)[number]
type Rec = Record<Col, string>
function synthetic(): Rec[] {
  const rows: Rec[] = []
  for (let i = 0; i < 89; i++) {
    const inactive = i >= 83
    const restricted = i === 10
    rows.push({
      legalCompanyName: `Firma${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} Test ${i} AB`,
      orgnr: withCheckDigit('55600' + String(1000 + i).padStart(4, '0')),
      city: 'Teststad', sni: '47.811', scbStatusCode: inactive ? '9' : '1',
      scbStatusClass: inactive ? 'NOT_ACTIVE_PER_SCB' : 'ACTIVE_PER_SCB_NOT_MARKETING_APPROVAL',
      legalFormCode: i === 5 ? '31' : '49', legalFormLabel: i === 5 ? 'Handelsbolag, kommanditbolag' : 'Aktiebolag',
      reklamCode: restricted ? '2' : '1', epostCode: restricted ? '2' : '1', telefonCode: restricted ? '2' : '1',
      marketingReview: restricted ? 'RESTRICTION_MANUAL_REVIEW' : 'NO_SCB_RESTRICTION_SIGNAL_NOT_PERMISSION',
      priorContactReview: i === 20 ? 'KNOWN_PRIOR_CONTACT' : 'NO_MATCH_IN_PARTIAL_HISTORY',
      legalIdentityReview: 'JE_IDENTITY_CONFIRMED', manual_review_only: 'true', NOT_CONTACTABLE: 'true', historyCoverage: 'PARTIAL',
    })
  }
  return rows
}
const CSV = [STATUS_AUDIT_EXPORT_COLUMNS.join(','), ...synthetic().map(r => STATUS_AUDIT_EXPORT_COLUMNS.map(c => csvField(r[c])).join(','))].join('\r\n') + '\r\n'
const SUMMARY = JSON.stringify({
  sourceRows: 90, reviewedLegalEntities: 89, excludedPhysicalPersons: 1, activePerScb: 83, notActivePerScb: 6,
  scbRestrictionRows: 1, emailRestricted: 1, reklamRestricted: 1, phoneRestricted: 1, knownPriorContacts: 1, unknownPriorContacts: 88,
  outreachReady: 0, contactability: 'BLOCKED_PENDING_VERIFICATION', sourceCoverage: 'PARTIAL', sourceStatus: 'OFFLINE_CORRECTED_FROM_SCB_CODEBOOKS',
})
const intake = buildImportIntake(CSV, SUMMARY)
if (!intake.ok) throw new Error('fixture invalid')
const DIGEST = intake.value.aggregate.digest
const state = buildLocalReview(CSV, SUMMARY)
if (state.status !== 'ready') throw new Error('fixture invalid')
const queue = buildResearchQueue(state.review)
if (queue.status !== 'ready') throw new Error('fixture invalid')
const JOBS = queue.jobs
const JOB: ResearchJob = JOBS[0]
const dashed = (orgnr: string) => orgnr.slice(0, 6) + '-' + orgnr.slice(6)

const tavily = (results: unknown[], init?: ResponseInit) =>
  new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
const officialHit = (orgnr: string, extra: Record<string, unknown> = {}) => ({
  title: 'Provbil Exempel',
  url: 'https://www.exempelbil.se/om-oss',
  content: `Provbil AB, org.nr ${dashed(orgnr)}. Vi säljer begagnade personbilar. Ring 08-123 456 78 eller mejla info@exempelbil.se, se https://www.exempelbil.se/lager`,
  ...extra,
})
const okFetch = () => vi.fn(async (_url: string, init: RequestInit) => {
  const orgnr = /(\d{10})/.exec(JSON.parse(String(init.body)).query)![1]
  return tavily([officialHit(orgnr)])
})

// ---------------------------------------------------------------- adapter
describe('Tavily adapter: one fixed, bounded basic search per job', () => {
  it('posts once to the fixed endpoint with basic cost settings and the key only in the header', async () => {
    const fetchImpl = okFetch()
    const adapter = makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW })
    await adapter.collect(JOB, new AbortController().signal)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(TAVILY_SEARCH_URL)
    expect(url).toBe('https://api.tavily.com/search')
    expect(url).not.toContain(KEY)
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    expect(String(init.body)).not.toContain(KEY)
    expect(JSON.parse(String(init.body))).toEqual({
      query: expect.stringContaining(JOB.orgnr), search_depth: 'basic', max_results: 3,
      include_answer: false, include_raw_content: false, include_images: false,
    })
  })

  it('refuses a missing or malformed key', () => {
    for (const key of [undefined, '', '   ', 'short', 'has space in key', 'line\nbreak-key-0000']) {
      expect(() => makeTavilyResearchAdapter({ key, fetchImpl: okFetch() })).toThrow('tavily_key_missing')
    }
  })

  it('bounds output, strips markup/contacts and never promotes a search snippet to official evidence', async () => {
    const long = 'Vi säljer begagnade bilar. ' + 'Mycket text om verksamheten '.repeat(60)
    const fetchImpl = vi.fn(async () => tavily([
      officialHit(JOB.orgnr, { content: `<b>${dashed(JOB.orgnr)}</b> ${long} 070-123 45 67 info@exempelbil.se https://x.example.se/a` }),
      { url: 'https://www.allabolag.se/foretag', title: 'x', content: `Org.nr ${dashed(JOB.orgnr)} bilar till salu` },
      { url: 'https://www.annanbil.se/', title: 'x', content: 'Vi säljer begagnade bilar utan organisationsnummer.' },
      { url: 'https://www.fjarde.se/', title: 'x', content: 'Fjärde resultatet bilar till salu' },
    ]))
    const adapter = makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW })
    const obs = await adapter.collect(JOB, new AbortController().signal) as Record<string, unknown>[]
    expect(obs).toHaveLength(2) // unrelated third hit is filtered before classification
    for (const o of obs) {
      const ex = String(o.excerpt)
      expect(ex.length).toBeLessThanOrEqual(160)
      expect(ex).not.toMatch(/[<>@]|https?:|www\.|\d{6}/)
      expect(o.observedOn).toBe('2026-10-28')
    }
    expect(obs.map(o => o.sourceKind)).toEqual(['search_snippet', 'search_snippet'])
    expect(obs.every(o => !('orgnrOnPage' in o))).toBe(true)
    const verdict = evaluateLeadEvidence(JOB, obs)
    expect(verdict).toMatchObject({ classification: 'NEEDS_FURTHER_RESEARCH', identityVerified: false, officialSite: null, outreachReady: false, contactProposal: null })
  })

  it('ignores forged proof and contact fields supplied by the search result', async () => {
    const fetchImpl = vi.fn(async () => tavily([officialHit(JOB.orgnr, {
      sourceKind: 'official_company_site', orgnrOnPage: JOB.orgnr,
      generalBusinessEmail: 'info@exempelbil.se',
      switchboardPhone: '08-12345678', phoneLabel: 'company switchboard',
    })]))
    const observations = await makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW })
      .collect(JOB, new AbortController().signal) as Record<string, unknown>[]
    expect(observations).toHaveLength(1)
    expect(observations[0].sourceKind).toBe('search_snippet')
    expect(observations[0]).not.toHaveProperty('orgnrOnPage')
    expect(observations[0]).not.toHaveProperty('generalBusinessEmail')
    expect(observations[0]).not.toHaveProperty('switchboardPhone')
    expect(evaluateLeadEvidence(JOB, observations)).toMatchObject({
      classification: 'NEEDS_FURTHER_RESEARCH', identityVerified: false,
      officialSite: null, contactProposal: null, outreachReady: false,
    })
  })

  it('never marks a directory or marketplace official, even with orgnr and sale evidence', async () => {
    const hosts = ['https://www.allabolag.se/x', 'https://www.facebook.com/x', 'https://www.blocket.se/x', 'https://www.bytbil.com/x']
    const fetchImpl = vi.fn(async () => tavily(hosts.map(url => officialHit(JOB.orgnr, { url }))))
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW }).collect(JOB, new AbortController().signal) as { sourceKind: string }[]
    expect(obs.every(o => o.sourceKind !== 'official_company_site')).toBe(true)
    expect(evaluateLeadEvidence(JOB, obs).classification).toBe('NEEDS_FURTHER_RESEARCH')
  })

  it('refuses localhost, IP, credentialed, http and port URLs', async () => {
    const bad = ['https://localhost/a', 'https://127.0.0.1/a', 'https://192.168.0.1/a', 'http://www.exempelbil.se/a',
      'https://user:pw@www.exempelbil.se/a', 'https://www.exempelbil.se:8443/a', 'https://intranet.internal/a', 'javascript:alert(1)']
    const fetchImpl = vi.fn(async () => tavily(bad.map(url => officialHit(JOB.orgnr, { url }))))
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW }).collect(JOB, new AbortController().signal)
    expect(obs).toEqual([])
  })

  it('does not trust a mismatching orgnr', async () => {
    const other = withCheckDigit('559999999')
    const fetchImpl = vi.fn(async () => tavily([officialHit(other)]))
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW }).collect(JOB, new AbortController().signal) as { sourceKind: string }[]
    expect(obs).toEqual([]) // a different company's orgnr is not a valid lead clue
  })

  it('filters generic car-marketplace hits for an inkasso-named legal entity', async () => {
    const job = { ...JOB, legalName: 'EXEMPEL INKASSO AB' }
    const results = [
      { title: 'Bilweb – bilar till salu', url: 'https://bilweb.se/', content: 'Utforska tusentals Volvo, Kia och Audi till salu.' },
      { title: 'Sälj företagsbil genom kvd.se', url: 'https://www.kvd.se/', content: 'Hitta din nästa bil.' },
      { title: 'Bytbil – nya annonser', url: 'https://www.bytbil.com/', content: 'Begagnade bilar i hela Sverige.' },
    ]
    const fetchImpl = vi.fn(async () => tavily(results))
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW })
      .collect(job, new AbortController().signal)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(obs).toEqual([])
    expect(evaluateLeadEvidence(job, obs)).toMatchObject({
      classification: 'NEEDS_FURTHER_RESEARCH', reasons: ['no_observations'],
      identityVerified: false, outreachReady: false,
    })
  })

  it('never treats a similarly named group company as the exact Swedish legal entity', async () => {
    const job = { ...JOB, legalName: 'Semler Retail Filial' }
    const hits = [
      { title: 'Semler Premium Sweden AB', url: 'https://semler.dk/en/business-areas/semler-mobility-premium',
        content: 'Large showroom and new cars for sale in Stockholm.' },
      { title: job.legalName, url: 'https://www.allabolag.se/foretag/fel-bolag',
        content: 'Organisationsnummer 5560201369, bilar till salu' },
    ]
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl: vi.fn(async () => tavily(hits)), now: NOW })
      .collect(job, new AbortController().signal)
    expect(obs).toEqual([])
  })

  it('keeps company-specific directory profiles without claiming that zero listings means car sales', async () => {
    const job = { ...JOB, legalName: 'AutoHub Sverige AB' }
    const hits = [
      { title: 'AutoHub Sverige', url: 'https://www.car.info/sv-se/company/autohub-sverige-17439204',
        content: 'Har just nu 0 aktuella bilannonser med bilar till salu. Adress: Mörarp.' },
      { title: 'AutoHub Sverige AB', url: 'https://www.allabolag.se/foretag/autohub-sverige-ab',
        content: 'Företaget erbjuder logistik och konsulttjänster inom motorbranschen.' },
    ]
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl: vi.fn(async () => tavily(hits)), now: NOW })
      .collect(job, new AbortController().signal) as { observedBusinessIndicators: string[]; sourceKind: string }[]
    expect(obs).toHaveLength(2)
    expect(obs.every(o => o.sourceKind === 'search_snippet')).toBe(true)
    expect(obs.every(o => !o.observedBusinessIndicators.includes('cars_for_sale'))).toBe(true)
    expect(obs.every(o => !o.observedBusinessIndicators.includes('vehicle_stock_listings'))).toBe(true)
    expect(evaluateLeadEvidence(job, obs).identityVerified).toBe(false)
  })

  it('still keeps matched sale signals from specific company pages without granting contact permission', async () => {
    const job = { ...JOB, legalName: 'Rönnbärs Bilhandel AB' }
    const hits = [{ title: 'Rönnbärs Bilhandel AB | vårt utbud', url: 'https://bilhandlare.test-bil.se/lager',
      content: 'Vi säljer begagnade personbilar i vår bilhall.' }]
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl: vi.fn(async () => tavily(hits)), now: NOW })
      .collect(job, new AbortController().signal) as { observedBusinessIndicators: string[] }[]
    expect(obs).toHaveLength(1)
    expect(obs[0].observedBusinessIndicators).toContain('cars_for_sale')
    expect(evaluateLeadEvidence(job, obs)).toMatchObject({
      classification: 'NEEDS_FURTHER_RESEARCH', identityVerified: false, outreachReady: false,
    })
  })

  it('rejects a conflicting organisation number even if the title has the target name', async () => {
    const other = withCheckDigit('559999999')
    const hits = [{ title: JOB.legalName, url: 'https://www.allabolag.se/foretag/annan',
      content: `Organisationsnummer ${dashed(other)}. Vi säljer begagnade bilar.` }]
    const obs = await makeTavilyResearchAdapter({ key: KEY, fetchImpl: vi.fn(async () => tavily(hits)), now: NOW })
      .collect(JOB, new AbortController().signal)
    expect(obs).toEqual([])
  })

  it('fails closed on error status, oversized or invalid responses, and never retries', async () => {
    const run = async (response: () => Response) => {
      const fetchImpl = vi.fn(async () => response())
      await expect(makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW }).collect(JOB, new AbortController().signal)).rejects.toThrow()
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
    await run(() => new Response('{}', { status: 500 }))
    await run(() => new Response('{}', { status: 302, headers: { location: 'https://evil.example.se' } }))
    await run(() => new Response('not json', { status: 200 }))
    await run(() => new Response(JSON.stringify({ results: 'x' }), { status: 200 }))
    await run(() => new Response('x'.repeat(TAVILY_MAX_RESPONSE_BYTES + 1), { status: 200 }))
    await run(() => new Response('{}', { status: 200, headers: { 'content-length': String(TAVILY_MAX_RESPONSE_BYTES + 1) } }))
  })

  it('allows one request per company and at most five per instance', async () => {
    const fetchImpl = okFetch()
    const adapter = makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW })
    const signal = new AbortController().signal
    await adapter.collect(JOBS[0], signal)
    await expect(adapter.collect(JOBS[0], signal)).rejects.toThrow('request_budget_exceeded')
    for (const j of JOBS.slice(1)) await adapter.collect(j, signal)
    const sixth = { ...JOBS[0], id: 'research:' + withCheckDigit('559999998'), orgnr: withCheckDigit('559999998') }
    await expect(adapter.collect(sixth, signal)).rejects.toThrow('request_budget_exceeded')
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

  it('does not leak the key when the transport fails', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error(`boom ${KEY}`) })
    const run = await runLeadResearch({ review: state.review, adapter: makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW }) })
    expect(JSON.stringify(run)).not.toContain(KEY)
    expect(run.status === 'completed' && run.results.every(r => r.reasons.includes('adapter_failed'))).toBe(true)
  })
})

// ---------------------------------------------------------------- route handler
const OWNER = 'user-owner-1'
const project = (over: Partial<ImportProjectRow> = {}): ImportProjectRow => ({
  id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen', owner_id: OWNER, executionPaused: false, ...over,
})
function harness(over: Partial<LeadFinderResearchDeps> = {}, fetchImpl = okFetch()) {
  const getAdapter = vi.fn(() => makeTavilyResearchAdapter({ key: KEY, fetchImpl, now: NOW }))
  const deps: LeadFinderResearchDeps = {
    env: { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', HB_LEADFINDER_RESEARCH_ENABLED: 'true', TAVILY_API_KEY: KEY },
    getUser: async () => ({ id: OWNER }),
    loadProject: async () => project(),
    isHandlarborsenProject: () => true,
    getAdapter,
    ...over,
  }
  return { deps, getAdapter, fetchImpl }
}
const goodBody = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ csv: CSV, summary: SUMMARY, digest: DIGEST, confirmation: RESEARCH_CONFIRMATION, ...extra })
const req = (body: string, headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://atlas.test/api/atlas/handlarborsen/lead-finder/research', {
    method, body: method === 'POST' ? body : undefined,
    headers: { origin: 'https://atlas.test', 'content-type': 'application/json', ...headers },
  })

describe('research route: every gate is closed before a single search credit is spent', () => {
  const refusals: [string, Partial<LeadFinderResearchDeps> | null, () => Request, number][] = [
    ['preview flag off', { env: { HB_LEADFINDER_RESEARCH_ENABLED: 'true', TAVILY_API_KEY: KEY } }, () => req(goodBody()), 404],
    ['research flag off', { env: { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', TAVILY_API_KEY: KEY } }, () => req(goodBody()), 404],
    ['research flag not exactly true', { env: { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', HB_LEADFINDER_RESEARCH_ENABLED: '1', TAVILY_API_KEY: KEY } }, () => req(goodBody()), 404],
    ['production environment is never searchable', { env: { VERCEL_ENV: 'production', HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', HB_LEADFINDER_RESEARCH_ENABLED: 'true', TAVILY_API_KEY: KEY } }, () => req(goodBody()), 404],
    ['no key', { env: { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', HB_LEADFINDER_RESEARCH_ENABLED: 'true' } }, () => req(goodBody()), 404],
    ['blank key', { env: { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', HB_LEADFINDER_RESEARCH_ENABLED: 'true', TAVILY_API_KEY: '  ' } }, () => req(goodBody()), 404],
    ['wrong method', null, () => req('', {}, 'GET'), 405],
    ['wrong origin', null, () => req(goodBody(), { origin: 'https://evil.test' }), 403],
    ['missing origin', null, () => req(goodBody(), { origin: '' }), 403],
    ['wrong content type', null, () => req(goodBody(), { 'content-type': 'text/plain' }), 415],
    ['no session user', { getUser: async () => null }, () => req(goodBody()), 401],
    ['not the owner', { loadProject: async () => null }, () => req(goodBody()), 403],
    ['project owner mismatch', { loadProject: async () => project({ owner_id: 'someone-else' }) }, () => req(goodBody()), 403],
    ['wrong project id', { loadProject: async () => project({ id: 'other-project' }) }, () => req(goodBody()), 403],
    ['not a handlarborsen project', { isHandlarborsenProject: () => false }, () => req(goodBody()), 403],
    ['paused project', { loadProject: async () => project({ executionPaused: true }) }, () => req(goodBody()), 409],
    ['auth lookup throws', { getUser: async () => { throw new Error('db') } }, () => req(goodBody()), 503],
    ['declared body too large', null, () => req(goodBody(), { 'content-length': '999999' }), 413],
    ['streamed body too large', null, () => req(JSON.stringify({ csv: 'x'.repeat(200_000) })), 413],
    ['invalid json', null, () => req('{nope'), 400],
    ['extra field', null, () => req(goodBody({ mode: 'preview' })), 400],
    ['missing digest', null, () => req(JSON.stringify({ csv: CSV, summary: SUMMARY, confirmation: RESEARCH_CONFIRMATION })), 400],
    ['malformed digest', null, () => req(goodBody({ digest: 'ABC' })), 400],
    ['wrong confirmation', null, () => req(goodBody({ confirmation: 'UNDERSOK 5 FORETAG' })), 400],
    ['digest not matching source', null, () => req(goodBody({ digest: 'a'.repeat(64) })), 422],
    ['tampered csv', null, () => req(goodBody({ csv: CSV.replace('Teststad', 'Annanstad') })), 422],
    ['bad summary', null, () => req(goodBody({ summary: '{}' })), 422],
  ]
  it.each(refusals)('%s -> %s without creating the adapter or calling fetch', async (_name, over, build, status) => {
    const h = harness(over ?? {})
    const res = await leadFinderResearchApi(build(), h.deps)
    expect(res.status).toBe(status)
    expect(h.getAdapter).not.toHaveBeenCalled()
    expect(h.fetchImpl).not.toHaveBeenCalled()
    const text = await res.text()
    expect(text).not.toContain(KEY)
    expect(text).not.toContain('Firma')
    expect(text).not.toContain('Teststad')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('runs exactly five basic searches and returns sanitized, blocked, cited results', async () => {
    const h = harness()
    const res = await leadFinderResearchApi(req(goodBody()), h.deps)
    expect(res.status).toBe(200)
    expect(h.getAdapter).toHaveBeenCalledTimes(1)
    expect(h.fetchImpl).toHaveBeenCalledTimes(5)
    for (const [url] of h.fetchImpl.mock.calls) expect(url).toBe('https://api.tavily.com/search')
    const text = await res.text()
    const data = JSON.parse(text)
    expect(text).not.toContain(KEY)
    expect(text).not.toMatch(/@|<\w/)
    expect(text).not.toContain('08-123')
    expect(data).toMatchObject({ status: 'researched', calls: 5, preliminary: true, outreachReady: false, contactability: 'BLOCKED_PENDING_VERIFICATION' })
    expect(data.results).toHaveLength(5)
    expect(data.results.map((r: { orgnr: string }) => r.orgnr)).toEqual(JOBS.map(j => j.orgnr))
    for (const r of data.results) {
      expect(r).toMatchObject({ outreachReady: false, contactability: 'BLOCKED_PENDING_VERIFICATION', classification: 'NEEDS_FURTHER_RESEARCH', identityVerified: false })
      expect(r).not.toHaveProperty('contactProposal')
      expect(r.evidence[0].sourceUrl).toMatch(/^https:\/\/www\.exempelbil\.se\//)
      expect(r.evidence[0].sourceKind).toBe('search_snippet')
      expect(r.evidence[0].excerpt.length).toBeLessThanOrEqual(160)
    }
  })

  it('maps adapter failure to a generic 503 with no detail', async () => {
    const h = harness({}, vi.fn(async () => { throw new Error(`secret ${KEY}`) }))
    const res = await leadFinderResearchApi(req(goodBody()), h.deps)
    const text = await res.text()
    expect(res.status).toBe(200) // per-job failures are reported as research gaps, never as raw errors
    expect(text).not.toContain(KEY)
    expect(text).not.toContain('secret')
    expect(JSON.parse(text).results.every((r: { classification: string }) => r.classification === 'NEEDS_FURTHER_RESEARCH')).toBe(true)
    const broken = harness({ getAdapter: () => { throw new Error('tavily_key_missing') } })
    expect((await leadFinderResearchApi(req(goodBody()), broken.deps)).status).toBe(503)
  })
})

// ---------------------------------------------------------------- UI + static
describe('owner UI and static guarantees', () => {
  it('renders only validated results with blocked status and safe links', () => {
    const parsed = parseResearchResponse({
      status: 'researched', outreachReady: false,
      results: [{
        orgnr: JOB.orgnr, companyName: 'Provbolag AB', city: 'Teststad', classification: 'NEEDS_FURTHER_RESEARCH',
        reasons: ['no_official_site'], outreachReady: false, contactability: 'BLOCKED_PENDING_VERIFICATION',
        evidence: [
          { sourceUrl: 'https://www.exempelbil.se/om', sourceKind: 'search_snippet', observedOn: '2026-10-28', excerpt: 'Vi säljer begagnade personbilar.', indicators: ['cars_for_sale'] },
          { sourceUrl: 'javascript:alert(1)', sourceKind: 'search_snippet', observedOn: '2026-10-28', excerpt: 'farlig' },
          { sourceUrl: 'https://127.0.0.1/x', sourceKind: 'search_snippet', observedOn: '2026-10-28', excerpt: 'ip' },
        ],
      }],
    })
    expect(parsed).not.toBeNull()
    expect(parsed![0].evidence).toHaveLength(1)
    const html = renderToStaticMarkup(React.createElement(HandlarborsenResearchResults, { results: parsed! }))
    expect(html).toContain('Ej kontaktbar')
    expect(html).toContain('Sökutdrag nämner bilhandel')
    expect(html).toContain('Behöver mer research')
    expect(html).toContain('href="https://www.exempelbil.se/om"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).not.toMatch(/javascript:|127\.0\.0\.1|mailto:|<form|type="submit"/)
  })

  it('explains filtered generic sources instead of displaying unrelated car-sale claims', () => {
    const noSpecificEvidence = parseResearchResponse({
      status: 'researched', outreachReady: false,
      results: [{
        orgnr: JOB.orgnr, companyName: 'Exempel Inkasso AB', city: 'Teststad',
        classification: 'NEEDS_FURTHER_RESEARCH', reasons: ['no_observations'],
        outreachReady: false, contactability: 'BLOCKED_PENDING_VERIFICATION', evidence: [],
      }],
    })
    expect(noSpecificEvidence).not.toBeNull()
    const html = renderToStaticMarkup(React.createElement(HandlarborsenResearchResults, { results: noSpecificEvidence! }))
    expect(html).toContain('Inga företagsspecifika sökutdrag hittades')
    expect(html).toContain('Generella annonser räknas inte som belägg')
    expect(html).not.toContain('Sökutdrag nämner bilhandel')
    expect(html).toContain('Ej kontaktbar')
  })

  it('rejects server payloads that claim outreach readiness or are malformed', () => {
    expect(parseResearchResponse(null)).toBeNull()
    expect(parseResearchResponse({ status: 'researched', outreachReady: true, results: [] })).toBeNull()
    expect(parseResearchResponse({ status: 'researched', outreachReady: false, results: new Array(6).fill({}) })).toBeNull()
    expect(parseResearchResponse({ status: 'researched', outreachReady: false, results: [{ orgnr: '1', classification: 'X' }] })).toBeNull()
  })

  it('wires the button only behind researchEnabled and never adds send, approve, store or schedule paths', () => {
    const control = src('../../components/platform/vnext/HandlarborsenScbImportControl.tsx')
    const results = src('../../components/platform/vnext/HandlarborsenResearchResults.tsx')
    expect(control).toContain('researchEnabled && preview && review')
    expect(control).toContain('Undersök 5 företag (max 5 sökkrediter)')
    expect(control).toContain("RESEARCH_CONFIRMATION = 'UNDERSÖK 5 FÖRETAG'")
    expect(control.match(/fetch\(/g)).toHaveLength(2)
    for (const text of [control, results]) {
      expect(text).not.toMatch(/mailto:|sendMail|\/send|(?:localStorage|sessionStorage)\s*(?:\.|\[)|setInterval\s*\(|\bcron\s*\(|\bapprove\s*\(|Godkänn för/i)
    }
    expect(src('../../components/platform/vnext/HandlarborsenLeadFinder.tsx')).toContain('researchEnabled={researchEnabled}')
    const page = src('../../app/(platform)/projects/[slug]/lead-finder/page.tsx')
    expect(page).toMatch(/researchEnabled = importFlag && process\.env\.VERCEL_ENV !== 'production' && process\.env\.HB_LEADFINDER_RESEARCH_ENABLED === 'true'/)
    // The flag assignment sits inside the verified-owner branch.
    expect(page.indexOf('researchEnabled = importFlag')).toBeGreaterThan(page.indexOf('if (!ownerError && ownedProject)'))
  })

  it('keeps the server side free of admin clients, writes, schedulers and arbitrary fetches', () => {
    const route = src('../../app/api/atlas/handlarborsen/lead-finder/research/route.ts')
    const api = src('../handlarborsen/lead-finder/research-api.ts')
    const adapter = src('../handlarborsen/lead-finder/tavily-research-adapter.ts')
    for (const text of [route, api, adapter]) {
      expect(text).not.toMatch(/createAdminClient|\.insert\(|\.update\(|\.upsert\(|\.delete\(|console\./)
    }
    expect(adapter.match(/fetchImpl\(/g)).toHaveLength(1)
    expect(adapter).not.toMatch(/retry|setInterval|setTimeout/i)
    expect(adapter).toContain("'https://api.tavily.com/search'")
    expect(route).toContain('export async function POST')
    expect(route).not.toMatch(/export (?:async )?function (?:GET|PUT|PATCH|DELETE)/)
    expect(src('../../../../docs/handlarborsen-lead-finder.md')).toContain('HB_LEADFINDER_RESEARCH_ENABLED')
  })
})
