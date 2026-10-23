import { describe, expect, it } from 'vitest'
import { summarizeInstagramPerformance, type GrowthBrand } from '../content-growth/instagram-metrics'
import {
  suggestInstagramExperiment,
  reviewInstagramVariants,
  type InstagramVariantObservation,
} from '../content-growth/instagram-experiments'

const NOW = new Date('2026-10-23T08:00:00Z')
const posts = (brand: GrowthBrand, n: number) => summarizeInstagramPerformance(brand, Array.from({ length: n }, (_, i) => ({
  id: brand + '-' + i, brand, views: i + 10, reach: 100, saves: 2, shares: 1, follows: null,
})))

const observations = (brand: GrowthBrand): InstagramVariantObservation[] =>
  Array.from({ length: 6 }, (_, i) => ({
    postId: brand + '-' + i, brand, variant: i < 3 ? 'A' : 'B',
    measuredAtAgeHours: 48, reach: i < 3 ? 100 : 200, saves: i < 3 ? 10 : 10, shares: i < 3 ? 2 : 4,
  }))

describe('Atlas Instagram experimental proposals are advisory only', () => {
  it('does not claim family growth conclusions from two posts', () => {
    const result = suggestInstagramExperiment('familje-stunden', posts('familje-stunden', 2), '2026-10-23T07:00:00Z', NOW)
    expect(result.kind).toBe('collect_baseline')
    expect(result.action).toContain('4 ytterligare')
    expect(result.reviewRequired).toBe(true)
    expect(result.rationale).toContain('för litet')
    expect(result.title).not.toContain('bäst')
  })

  it('proposes a truthful English hook test only from account-specific data', () => {
    const result = suggestInstagramExperiment('the-prompt', posts('the-prompt', 30), '2026-10-23T07:00:00Z', NOW)
    expect(result.kind).toBe('manual_review')
    expect(result.action).toContain('tre med den verifierade nyheten först')
    expect(result.measurement).toContain('48-timmarsfönster')
    expect(result.measurement).toContain('Märk A/B manuellt')
    expect(result.reviewRequired).toBe(true)
  })

  it('uses a separate Swedish family concept at a sufficient sample size', () => {
    const result = suggestInstagramExperiment('familje-stunden', posts('familje-stunden', 9), '2026-10-23T07:00:00Z', NOW)
    expect(result.action).toContain('Nova/Plings')
    expect(result.measurement).toContain('spårbar attribution')
    expect(result.action).not.toContain('AI-nyhetsvideos')
  })

  it('refuses fresh growth claims for old or unknown data', () => {
    const result = suggestInstagramExperiment('the-prompt', posts('the-prompt', 35), '2026-10-01T00:00:00Z', NOW)
    expect(result.kind).toBe('refresh_data')
    expect(suggestInstagramExperiment('the-prompt', posts('the-prompt', 35), null, NOW).kind).toBe('refresh_data')
  })

  it('fails closed on cross-brand summaries', () => {
    expect(() => suggestInstagramExperiment('familje-stunden', posts('the-prompt', 40), null, NOW)).toThrow(/Mixed/)
  })
})

describe('Atlas manually-tagged Instagram A/B review', () => {
  it('requires at least three observations of each variant', () => {
    const result = reviewInstagramVariants('the-prompt', observations('the-prompt').slice(0, 4))
    expect(result.status).toBe('insufficient')
  })

  it('refuses different measurement ages and unknown reach', () => {
    const a = observations('the-prompt')
    expect(reviewInstagramVariants('the-prompt', a.map((p, i) => i === 0 ? { ...p, measuredAtAgeHours: 10 } : p)).status).toBe('not_comparable')
    expect(reviewInstagramVariants('the-prompt', a.map((p, i) => i === 1 ? { ...p, reach: null } : p)).status).toBe('not_comparable')
  })

  it('compares verified pooled rates without declaring a winner or significance', () => {
    const result = reviewInstagramVariants('the-prompt', observations('the-prompt'))
    expect(result.status).toBe('descriptive')
    if (result.status !== 'descriptive') throw new Error('expected descriptive')
    expect(result.aSaveRate).toBeCloseTo(0.1)
    expect(result.bSaveRate).toBeCloseTo(0.05)
    expect(result.aShareRate).toBeCloseTo(0.02)
    expect(result.bShareRate).toBeCloseTo(0.02)
    expect(result.note).toContain('inte ett kausalt')
    expect(Object.keys(result)).not.toContain('winner')
  })

  it('rejects cross-project and repeated post IDs even if metric totals look good', () => {
    const a = observations('the-prompt')
    expect(() => reviewInstagramVariants('the-prompt', [...a.slice(0, 5), { ...a[5], brand: 'familje-stunden' }])).toThrow(/Mixed/)
    expect(() => reviewInstagramVariants('the-prompt', [...a.slice(0, 5), { ...a[5], postId: a[0].postId }])).toThrow(/Duplicate/)
    expect(() => reviewInstagramVariants('the-prompt', [...a.slice(0, 5), { ...a[5], shares: -1 }])).toThrow(/Invalid/)
  })
})
