import { describe, expect, it } from 'vitest'
import { articleReadTimeoutMs } from '@/lib/media/article-read-policy'
import { failedQualityScore, parseQualityScore, shouldRegenerate } from '@/lib/media/quality-evaluation'

describe('The Prompt optional article enrichment', () => {
  it.each([
    'https://www.wired.com', 'https://www.wired.com/', 'https://wired.com/news',
    'https://wired.com/ai/', 'https://wired.com/search?q=ai', 'not-a-url',
    'file:///tmp/story', 'https://user:pass@wired.com/news/story',
  ])('does not spend time or dispatch a homepage/invalid URL: %s', url => {
    expect(articleReadTimeoutMs(url, 12_000)).toBe(0)
  })
  it('uses bounded time for concrete articles, preserving the editorial budget', () => {
    const url = 'https://www.wired.com/story/some-reported-ai-news/'
    expect(articleReadTimeoutMs(url, 1_000)).toBe(6_000)
    expect(articleReadTimeoutMs(url, 24_000)).toBe(4_000)
    expect(articleReadTimeoutMs(url, 27_000)).toBe(0)
    expect(articleReadTimeoutMs(url, 30_000)).toBe(0)
    expect(articleReadTimeoutMs(null, 0)).toBe(0)
  })
})

describe('The Prompt editorial fail-closed regression', () => {
  it('blocks unparseable, truncated, and incomplete model results', () => {
    for (const raw of ['', '{"hook_strength": 9', '{"hook_strength":9}', 'not-json']) {
      const result = parseQualityScore(raw)
      expect(result.passed).toBe(false)
      expect(result.overall).toBe(0)
      expect(shouldRegenerate(result)).toBe(true)
    }
  })
  it('cannot pass a low-factual-safety script just because the model says passed', () => {
    const result = parseQualityScore(JSON.stringify({
      hook_strength: 9, retention_score: 9, visual_relevance: 9,
      shareability: 9, discussion_potential: 9, hallucination_risk: 3,
      passed: true, verdict: 'synthetic', weak_spots: [],
    }))
    expect(result.passed).toBe(false)
    expect(shouldRegenerate(result)).toBe(true)
  })
  it('preserves manual review on timeout and malformed responses', () => {
    expect(shouldRegenerate(failedQualityScore('Synthetic timeout'))).toBe(true)
  })
})
