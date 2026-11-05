import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { readRealDealerMetricsV3 } from '@/lib/atlas/project-analytics/handlarborsen-real-dealer-v3'

const HB = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const now = new Date('2026-11-05T10:00:00.000Z')
const metrics = {
  companies_registered_total: { status: 'ok', value: 1 },
  companies_verified_total: { status: 'ok', value: 1 },
}
const payload = {
  status: 'ok', schema_version: 3, definition_id: 'handlarborsen-real-external-v3',
  data_scope: 'classified_real_external_dealers', observed_at: now.toISOString(),
  window_hours: 24, metrics, excluded_test_organisations: 8,
  excluded_internal_organisations: 2, unclassified_organisations: 0,
}
beforeEach(() => {
  vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', 't'.repeat(40))
  vi.stubEnv('CRON_SECRET', 'c'.repeat(40))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('classified external-dealer metrics v3', () => {
  it('blocks other projects without network', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await readRealDealerMetricsV3([])).toEqual({ status: 'unavailable', reason: 'not_permitted' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('reads only the explicit fixed v3 endpoint with no redirect, never v1/v2', async () => {
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json(payload))
    vi.stubGlobal('fetch', fetcher)
    const result = await readRealDealerMetricsV3([HB], now)
    expect(result).toMatchObject({ status: 'available', registered: 1, verified: 1,
      testOrganisations: 8, internalOrganisations: 2, unclassifiedOrganisations: 0 })
    expect(fetcher.mock.calls[0][0]).toBe('https://www.handlarborsen.se/api/internal/atlas-metrics?schema_version=3')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store' })
  })
  it('refuses v2, test-inclusive, or invalid counts rather than falling back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...payload, schema_version: 2 })))
    expect(await readRealDealerMetricsV3([HB], now)).toMatchObject({ status: 'unavailable', reason: 'invalid_contract' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...payload,
      metrics: { ...metrics, companies_registered_total: {status:'ok',value:11} },
      excluded_test_organisations: -1,
    })))
    expect(await readRealDealerMetricsV3([HB], now)).toMatchObject({ status: 'unavailable', reason: 'invalid_contract' })
  })
  it('does not interpret unsupported producer or unavailable token as zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })))
    expect(await readRealDealerMetricsV3([HB], now)).toMatchObject({ status: 'unavailable', reason: 'source_unavailable' })
    vi.stubEnv('HANDLARBORSEN_METRICS_TOKEN', '')
    expect(await readRealDealerMetricsV3([HB], now)).toMatchObject({ status: 'unavailable', reason: 'credential_unavailable' })
  })
})
