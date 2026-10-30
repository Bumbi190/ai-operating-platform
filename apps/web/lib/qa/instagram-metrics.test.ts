import { describe, expect, it } from 'vitest'
import { summarizeInstagramPerformance, type InstagramPostInsights } from '../content-growth/instagram-metrics'

const post = (id: string, views: number, reach: number | null, shares: number | null): InstagramPostInsights => ({
  id, brand: 'the-prompt', views, reach, shares, saves: 2, follows: 1,
})

describe('Instagram first-party metrics - project isolation and honest denominators', () => {
  it('calculates account-specific median and rates without raw-views bias', () => {
    const r = summarizeInstagramPerformance('the-prompt', [
      post('normal', 1000, 800, 8), post('hit', 3000, 2000, 120), post('low', 500, 0, 0),
    ])
    expect(r.medianViews).toBe(1000)
    expect(r.posts[1].viewMultiple).toBe(3)
    expect(r.posts[1].sharesPerReach).toBeCloseTo(0.06)
    expect(r.posts[2].sharesPerReach).toBeNull()
    expect(r.confidence).toBe('insufficient')
  })

  it('never invents unavailable reach or calculates a multiplier against zero', () => {
    const r = summarizeInstagramPerformance('the-prompt', [
      post('a', 0, null, null), post('b', 0, 0, 0),
    ])
    expect(r.medianViews).toBe(0)
    expect(r.posts[0].viewMultiple).toBeNull()
    expect(r.posts[0].sharesPerReach).toBeNull()
    expect(r.posts[1].savesPerReach).toBeNull()
    expect(summarizeInstagramPerformance('familje-stunden', []).medianViews).toBeNull()
  })

  it('rejects mixed brands, duplicate IDs, and negative or fabricated counts', () => {
    expect(() => summarizeInstagramPerformance('the-prompt', [
      post('a', 20, 10, 2), { ...post('b', 30, 20, 5), brand: 'familje-stunden' },
    ])).toThrow(/Mixed Instagram brand/)
    expect(() => summarizeInstagramPerformance('the-prompt', [
      post('same', 1, 1, 1), post('same', 2, 2, 2),
    ])).toThrow(/duplicate/)
    expect(() => summarizeInstagramPerformance('the-prompt', [post('bad', -1, 5, 2)])).toThrow(/views/)
    expect(() => summarizeInstagramPerformance('the-prompt', [post('bad', 3, NaN, 2)])).toThrow(/reach/)
  })

  it('never claims predictive confidence even with 30 observations', () => {
    const records = Array.from({ length: 30 }, (_, i) => post('id'+i, i * 10, 100, i))
    const r = summarizeInstagramPerformance('the-prompt', records)
    expect(r.confidence).toBe('descriptive')
    expect(r.sampleSize).toBe(30)
    expect(r.brand).toBe('the-prompt')
  })
})
