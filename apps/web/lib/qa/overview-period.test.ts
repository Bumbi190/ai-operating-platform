import { describe, it, expect } from 'vitest'
import { stockholmPeriod } from '@/lib/overview/period'
describe('Stockholm overview periods', () => {
  it('counts calendar days through spring DST', () => {
    const p = stockholmPeriod(7, new Date('2026-03-30T10:00:00Z'))
    expect(p.dayKeys).toEqual([
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30'
    ])
    expect(p.startIso).toBe('2026-03-23T23:00:00.000Z')
    expect(p.endIso).toBe('2026-03-30T22:00:00.000Z')
  })
  it('counts autumn DST and a 30 day cross-month interval', () => {
    const p = stockholmPeriod(7, new Date('2026-10-27T10:00:00Z'))
    expect(p.startIso).toBe('2026-10-20T22:00:00.000Z')
    expect(p.endIso).toBe('2026-10-27T23:00:00.000Z')
    expect(
      stockholmPeriod(30, new Date('2026-10-02T23:10:00Z')).dayKeys
    ).toHaveLength(30)
    expect(
      stockholmPeriod(30, new Date('2026-10-02T23:10:00Z')).dayKeys.at(-1)
    ).toBe('2026-10-03')
  })
})
