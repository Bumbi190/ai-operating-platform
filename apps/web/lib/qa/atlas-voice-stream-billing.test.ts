import { expect, it } from 'vitest'
import { verifiedAtlasRealtimeRate, ATLAS_REALTIME_RATE_KEY } from '@/lib/cost/atlas-realtime-billing'
it('cannot turn public prices or a database value into unverified account billing authority', () => {
  for (const value of [undefined, NaN, -1, 0, 0.27, 0.48, 1, 1000]) {
    const rates = { usd_sek: 10, ...(value === undefined ? {} : { [ATLAS_REALTIME_RATE_KEY]: value }) }
    expect(verifiedAtlasRealtimeRate(rates)).toBeNull()
  }
})
