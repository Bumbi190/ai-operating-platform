import { describe, expect, it, vi } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { leadFinderScbProbeApi, SCB_PROBE_CONFIRMATION } from '@/lib/handlarborsen/lead-finder/scb-probe'
import type { ScbRegisterRecord } from '@/lib/handlarborsen/lead-finder/types'

const owner = async () => ({ ok: true as const, userId: 'owner', allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] })
const env = { VERCEL_ENV: 'preview', HB_LEADFINDER_SCB_PREVIEW_ENABLED: 'true', SCB_API_KEY: 'secret-value' }
const rows: ScbRegisterRecord[] = [
  { orgnr: '5560000000', name: 'Malmö Bil Ett AB', cfar: '1001', sniCodes: ['47.811'], countyCode: '12', municipalityCode: '1280', city: 'MALMÖ' },
  { orgnr: '5560000001', name: 'Malmö Bil Två AB', cfar: '1002', sniCodes: ['47.811'], countyCode: '12', municipalityCode: '1280', city: 'MALMÖ' },
  { orgnr: '5560000002', name: 'Lund Bil AB', cfar: '1003', sniCodes: ['47.811'], countyCode: '12', municipalityCode: '1281', city: 'LUND' },
  { orgnr: '5560000003', name: 'Malmö Verkstad AB', cfar: '1004', sniCodes: ['95.310'], countyCode: '12', municipalityCode: '1280', city: 'MALMÖ' },
]

function request(body: unknown = { confirmation: SCB_PROBE_CONFIRMATION }, extra: RequestInit = {}) {
  return new Request('https://preview.example/api/atlas/handlarborsen/lead-finder/scb-probe', {
    method: 'POST',
    headers: { origin: 'https://preview.example', 'content-type': 'application/json', ...(extra.headers ?? {}) },
    body: JSON.stringify(body),
    ...extra,
  })
}

describe('Handlarbörsen SCB Preview probe', () => {
  it('fails closed in production and when the explicit Preview flag is absent', async () => {
    const search = vi.fn(async () => ({ rows, pages: 1, truncated: false }))
    expect((await leadFinderScbProbeApi(request(), { env: { ...env, VERCEL_ENV: 'production' }, resolveAccess: owner, search })).status).toBe(404)
    expect((await leadFinderScbProbeApi(request(), { env: { SCB_API_KEY: 'secret-value', VERCEL_ENV: 'preview' }, resolveAccess: owner, search })).status).toBe(404)
    expect(search).not.toHaveBeenCalled()
  })

  it('requires same origin, JSON, exact owner project and exact confirmation', async () => {
    const search = vi.fn(async () => ({ rows, pages: 1, truncated: false }))
    expect((await leadFinderScbProbeApi(new Request('https://preview.example/api', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: SCB_PROBE_CONFIRMATION }) }), { env, resolveAccess: owner, search })).status).toBe(403)
    expect((await leadFinderScbProbeApi(new Request('https://preview.example/api', { method: 'POST', headers: { origin: 'https://preview.example', 'content-type': 'text/plain' }, body: '{}' }), { env, resolveAccess: owner, search })).status).toBe(415)
    expect((await leadFinderScbProbeApi(request(), { env, resolveAccess: async () => ({ ok: false as const, status: 401 as const }), search })).status).toBe(401)
    expect((await leadFinderScbProbeApi(request(), { env, resolveAccess: async () => ({ ok: true as const, userId: 'owner', allowedProjectIds: ['other'] }), search })).status).toBe(403)
    expect((await leadFinderScbProbeApi(request({ confirmation: 'wrong' }), { env, resolveAccess: owner, search })).status).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })

  it('returns only Malmö SNI 47.811 samples and never exposes secrets or contact authority', async () => {
    const search = vi.fn(async () => ({ rows, pages: 1, truncated: false }))
    const res = await leadFinderScbProbeApi(request(), { env, resolveAccess: owner, search })
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
      persisted: false,
      contactability: 'BLOCKED_PENDING_VERIFICATION',
      outreachReady: false,
    })
    expect(body.sample.map((x: { name: string }) => x.name)).toEqual(['Malmö Bil Ett AB', 'Malmö Bil Två AB'])
    expect(JSON.stringify(body)).not.toContain('secret-value')
    expect(JSON.stringify(body)).not.toContain('5560000000')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('caps the visible sample at five and maps provider failure to a generic 503', async () => {
    const many: ScbRegisterRecord[] = Array.from({ length: 8 }, (_, i) => ({
      orgnr: `55600000${i}0`,
      name: `Malmö Bil ${i}`,
      cfar: String(2000 + i),
      sniCodes: ['47.811'],
      countyCode: '12',
      municipalityCode: '1280',
      city: 'MALMÖ',
    }))
    const ok = await leadFinderScbProbeApi(request(), { env, resolveAccess: owner, search: async () => ({ rows: many, pages: 1, truncated: false }) })
    expect((await ok.json()).sample).toHaveLength(5)
    const failed = await leadFinderScbProbeApi(request(), { env, resolveAccess: owner, search: async () => { throw new Error('provider detail must not escape') } })
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ status: 'unavailable' })
  })
})
