import { describe, expect, it, vi } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { ORG, withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { leadFinderScbProbeApi, SCB_PROBE_CONFIRMATION } from '@/lib/handlarborsen/lead-finder/scb-probe'
import { evaluateScbCompany } from '@/lib/handlarborsen/lead-finder/scb-status-policy'
import type { KnownContacts } from '@/lib/handlarborsen/lead-finder/known-contacts'
import type { ScbRegisterRecord } from '@/lib/handlarborsen/lead-finder/types'

const owner = async () => ({ ok: true as const, userId: 'owner', allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] })
const env = { VERCEL_ENV: 'preview', HB_LEADFINDER_SCB_PREVIEW_ENABLED: 'true', SCB_API_KEY: 'secret-value' }
const rows: ScbRegisterRecord[] = [
  { orgnr: ORG.alpha, name: 'Malmö Bil Ett', cfar: '1001', sniCodes: ['47.811'], countyCode: '12', municipalityCode: '1280', city: 'MALMÖ' },
  { orgnr: ORG.beta, name: 'Malmö Bil Två', cfar: '1002', sniCodes: ['47.811'], countyCode: '12', municipalityCode: '1280', city: 'MALMÖ' },
  { orgnr: ORG.gamma, name: 'Lund Bil', cfar: '1003', sniCodes: ['47.811'], countyCode: '12', municipalityCode: '1281', city: 'LUND' },
  { orgnr: ORG.wrongSegment, name: 'Malmö Verkstad', cfar: '1004', sniCodes: ['95.310'], countyCode: '12', municipalityCode: '1280', city: 'MALMÖ' },
]

function request(body: unknown = { confirmation: SCB_PROBE_CONFIRMATION }, extra: RequestInit = {}) {
  return new Request('https://preview.example/api/atlas/handlarborsen/lead-finder/scb-probe', {
    method: 'POST',
    headers: { origin: 'https://preview.example', 'content-type': 'application/json', ...(extra.headers ?? {}) },
    body: JSON.stringify(body),
    ...extra,
  })
}

const legalName = (orgnr: string) => orgnr === ORG.beta ? 'Bilhuset Beta AB' : 'Testbil Alfa AB'
const reviewLegalEntity = async (orgnr: string) => evaluateScbCompany({
  expectedOrgnr: orgnr,
  je: { peOrgNr: `16${orgnr}`, namn: legalName(orgnr), ftgStat: '1', jurform: '49' },
})
const known: KnownContacts = {
  status: 'ready',
  count: 1,
  entries: [{ kind: 'contacted', orgnr: ORG.beta, companyName: 'Bilhuset Beta AB', domain: null }],
  source: 'omnira_sales_contacts',
  externalPilotRegistryConnected: false,
}
const deps = {
  env,
  resolveAccess: owner,
  reviewLegalEntity,
  loadKnownContacts: async () => known,
  sleep: async () => {},
}

describe('Handlarbörsen SCB Preview probe', () => {
  it('fails closed in production and when the explicit Preview flag is absent', async () => {
    const search = vi.fn(async () => ({ rows, pages: 1, truncated: false }))
    expect((await leadFinderScbProbeApi(request(), { ...deps, env: { ...env, VERCEL_ENV: 'production' }, search })).status).toBe(404)
    expect((await leadFinderScbProbeApi(request(), { ...deps, env: { SCB_API_KEY: 'secret-value', VERCEL_ENV: 'preview' }, search })).status).toBe(404)
    expect(search).not.toHaveBeenCalled()
  })

  it('requires same origin, JSON, exact owner project and exact confirmation', async () => {
    const search = vi.fn(async () => ({ rows, pages: 1, truncated: false }))
    expect((await leadFinderScbProbeApi(new Request('https://preview.example/api', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: SCB_PROBE_CONFIRMATION }) }), { ...deps, search })).status).toBe(403)
    expect((await leadFinderScbProbeApi(new Request('https://preview.example/api', { method: 'POST', headers: { origin: 'https://preview.example', 'content-type': 'text/plain' }, body: '{}' }), { ...deps, search })).status).toBe(415)
    expect((await leadFinderScbProbeApi(request(), { ...deps, resolveAccess: async () => ({ ok: false as const, status: 401 as const }), search })).status).toBe(401)
    expect((await leadFinderScbProbeApi(request(), { ...deps, resolveAccess: async () => ({ ok: true as const, userId: 'owner', allowedProjectIds: ['other'] }), search })).status).toBe(403)
    expect((await leadFinderScbProbeApi(request({ confirmation: 'wrong' }), { ...deps, search })).status).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })

  it('enriches five or fewer Malmö rows with legal identity and partial known-contact history without exposing identifiers', async () => {
    const search = vi.fn(async () => ({ rows, pages: 1, truncated: false }))
    const res = await leadFinderScbProbeApi(request(), { ...deps, search })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(search).toHaveBeenCalledOnce()
    expect(body).toMatchObject({
      status: 'ok',
      source: 'scb_foretagsregistret',
      query: { source: 'arbetsstallen', sni: '47.811', municipalityCode: '1280', municipality: 'Malmö' },
      pages: 1,
      scannedRows: 4,
      matchCount: 2,
      knownOmniraContacts: 1,
      historyCoverage: 'omnira_plus_documented_partial',
      externalPilotRegistryConnected: false,
      persisted: false,
      contactability: 'BLOCKED_PENDING_VERIFICATION',
      outreachReady: false,
    })
    expect(body.legalReviews).toHaveLength(2)
    expect(body.legalReviews[0]).toMatchObject({
      workplaceName: 'Malmö Bil Ett',
      legalCompanyName: 'Testbil Alfa AB',
      scbStatusClass: 'ACTIVE_PER_SCB',
      legalFormClass: 'AB',
      historyMatches: [],
      manualReviewOnly: true,
      outreachReady: false,
    })
    expect(body.legalReviews[1].historyMatches).toContain('already_contacted')
    expect(JSON.stringify(body)).not.toContain('secret-value')
    expect(JSON.stringify(body)).not.toContain(ORG.alpha)
    expect(JSON.stringify(body)).not.toContain(ORG.beta)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('pages the bounded fourteen-match result set in fixed batches of five', async () => {
    const many: ScbRegisterRecord[] = Array.from({ length: 12 }, (_, i) => ({
      orgnr: withCheckDigit(`55620000${i}`),
      name: `Malmö Bil ${i}`,
      cfar: String(3000 + i),
      sniCodes: ['47.811'],
      countyCode: '12',
      municipalityCode: '1280',
      city: 'MALMÖ',
    }))
    const reviewed: string[] = []
    const res = await leadFinderScbProbeApi(request({ confirmation: SCB_PROBE_CONFIRMATION, offset: 5 }), {
      ...deps,
      search: async () => ({ rows: many, pages: 1, truncated: false }),
      reviewLegalEntity: async orgnr => {
        reviewed.push(orgnr)
        return evaluateScbCompany({ expectedOrgnr: orgnr, je: { peOrgNr: `16${orgnr}`, namn: 'Testbolag AB', ftgStat: '1', jurform: '49' } })
      },
      sleep: async () => {},
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.offset).toBe(5)
    expect(body.matchCount).toBe(12)
    expect(body.legalReviews).toHaveLength(5)
    expect(body.legalReviews[0].workplaceCfar).toBe('3005')
    expect(reviewed).toHaveLength(5)
    expect((await leadFinderScbProbeApi(request({ confirmation: SCB_PROBE_CONFIRMATION, offset: 15 }), {
      ...deps, search: async () => ({ rows: many, pages: 1, truncated: false }),
    })).status).toBe(400)
  })

  it('caps legal lookups at five and maps source or legal-entity failure to a generic 503', async () => {
    const many: ScbRegisterRecord[] = Array.from({ length: 8 }, (_, i) => ({
      orgnr: withCheckDigit(`55610000${i}`),
      name: `Malmö Bil ${i}`,
      cfar: String(2000 + i),
      sniCodes: ['47.811'],
      countyCode: '12',
      municipalityCode: '1280',
      city: 'MALMÖ',
    }))
    const reviewed: string[] = []
    const ok = await leadFinderScbProbeApi(request(), {
      ...deps,
      search: async () => ({ rows: many, pages: 1, truncated: false }),
      reviewLegalEntity: async orgnr => {
        reviewed.push(orgnr)
        return evaluateScbCompany({ expectedOrgnr: orgnr, je: { peOrgNr: `16${orgnr}`, namn: 'Testbolag AB', ftgStat: '1', jurform: '49' } })
      },
    })
    expect((await ok.json()).legalReviews).toHaveLength(5)
    expect(reviewed).toHaveLength(5)
    const sourceFailed = await leadFinderScbProbeApi(request(), { ...deps, search: async () => { throw new Error('provider detail must not escape') } })
    expect(sourceFailed.status).toBe(503)
    expect(await sourceFailed.json()).toEqual({ status: 'unavailable' })
    const jeFailed = await leadFinderScbProbeApi(request(), { ...deps, search: async () => ({ rows, pages: 1, truncated: false }), reviewLegalEntity: async () => { throw new Error('secret provider detail') } })
    expect(jeFailed.status).toBe(503)
    expect(await jeFailed.json()).toEqual({ status: 'unavailable' })
  })
})
