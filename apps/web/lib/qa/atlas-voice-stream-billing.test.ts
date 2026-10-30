import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({ rows: [] as { key: string; value: unknown }[], unavailable: false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: () => ({ select: async () => { if (s.unavailable) throw new Error('unavailable'); return { data: s.rows } } }),
}) }))
import { verifiedAtlasRealtimeRate, ATLAS_REALTIME_RATE_KEY } from '@/lib/cost/atlas-realtime-billing'
import { fixedUnitCeiling } from '@/lib/cost/spend-ceiling'
beforeEach(() => { s.rows = []; s.unavailable = false; vi.resetModules() })
afterEach(() => { vi.clearAllMocks() })
it.each([undefined, NaN, Infinity, -1, 0, 0.27, 0.47])('refuses invalid or below-verified book rate %s', value => {
  const rates = { usd_sek: 10, ...(value === undefined ? {} : { [ATLAS_REALTIME_RATE_KEY]: value }) }
  expect(verifiedAtlasRealtimeRate(rates)).toBeNull()
})
it('accepts the evidenced standard Starter bound and reserves two whole minutes', () => {
  const rates = { usd_sek: 10, [ATLAS_REALTIME_RATE_KEY]: 0.48 }
  expect(verifiedAtlasRealtimeRate(rates)).toBe(0.48)
  expect(fixedUnitCeiling(2 / 60, verifiedAtlasRealtimeRate(rates)!, rates, 'atlas-scribe-realtime:2minutes')).toMatchObject({ ok: true, sek: 0.16 })
})
it('allows a higher book rate rather than silently lowering a ceiling', () => {
  expect(verifiedAtlasRealtimeRate({ [ATLAS_REALTIME_RATE_KEY]: 1 })).toBe(1)
})
it.each([false, true])('canonical accessor supplies the verified distinct realtime book rate; unavailable=%s', async unavailable => {
  s.unavailable = unavailable
  const { getRates } = await import('@/lib/cost/rates')
  const rates = await getRates()
  expect(rates[ATLAS_REALTIME_RATE_KEY]).toBe(0.48)
  expect(rates.elevenlabs_scribe_v2_keyterms_usd_per_hour).toBe(0.27)
})
it.each([0.27, NaN, Infinity, -1])('a bad database override %s never becomes paid dispatch authority', async value => {
  s.rows = [{ key: ATLAS_REALTIME_RATE_KEY, value }]
  const { getRates } = await import('@/lib/cost/rates')
  expect(verifiedAtlasRealtimeRate(await getRates())).toBeNull()
})
