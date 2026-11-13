import { describe, expect, it } from 'vitest'
import { parseQualityScore, shouldRegenerate } from './quality'

const good = {
  hook_strength: 9, retention_score: 9, visual_relevance: 8,
  shareability: 8, discussion_potential: 8, hallucination_risk: 9,
  overall: 10, passed: true, verdict: 'Source-grounded', weak_spots: [],
}

describe('The Prompt editorial quality guard', () => {
  it('fails closed on prose or safety warnings instead of JSON', () => {
    const score = parseQualityScore('⚠️ **PUBLICATION WARNING**: source needs verification')
    expect(score.passed).toBe(false)
    expect(score.overall).toBe(0)
    expect(shouldRegenerate(score)).toBe(true)
  })

  it('rejects incomplete JSON even if the model says passed', () => {
    expect(parseQualityScore('{"passed":true,"overall":10}').passed).toBe(false)
  })

  it('recomputes scores and cannot be tricked by an inflated overall', () => {
    const score = parseQualityScore(JSON.stringify({ ...good, hook_strength: 3 }))
    expect(score.overall).toBe(7.2)
    expect(score.passed).toBe(false)
  })

  it('respects a model rejection even if all numbers are high', () => {
    expect(parseQualityScore(JSON.stringify({ ...good, passed: false })).passed).toBe(false)
  })

  it('accepts fenced JSON only after checking all thresholds', () => {
    const fence = String.fromCharCode(96).repeat(3)
    const score = parseQualityScore(fence + 'json\n' + JSON.stringify(good) + '\n' + fence)
    expect(score.overall).toBe(8.4)
    expect(score.passed).toBe(true)
    expect(shouldRegenerate(score)).toBe(false)
  })
})
