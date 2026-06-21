/**
 * Tests for lib/atlas/score.ts + lib/atlas/source-authority.ts.
 *
 * Score Engine v1 is a pure synchronous function. No mocks needed for
 * computeScore — we construct ScoreInput directly. The source-authority
 * module is tested in isolation (also no mocks; it's a pure data lookup
 * wrapped in Promise.resolve).
 *
 * Pins the v1 design contract:
 *   • Pure: same input → identical output, no I/O.
 *   • Subset-tolerant: works with any subset of dimensions whose input
 *     data is present. Missing dimensions land in `excluded`.
 *   • Weights renormalize over included dimensions.
 *   • Versioned: SCORE_ENGINE_VERSION is stamped on the producer side.
 *   • Audit trail: each dimension carries rawData.
 */

import { describe, it, expect } from 'vitest'

import {
  loadAuthorityMap,
  DEFAULT_AUTHORITY,
} from '@/lib/atlas/source-authority'

import {
  computeScore,
  SCORE_ENGINE_VERSION,
  type ScoreInput,
  type SourceObservation,
} from '@/lib/atlas/score'

// ── Helpers ────────────────────────────────────────────────────────────────
function source(name: string, url = 'https://x.example'): SourceObservation {
  return { name, url, observedAt: '2026-06-18T08:00:00Z' }
}

function makeInput(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    contentId:       'content-uuid-test',
    publishedAt:     '2026-06-15T10:00:00Z',
    sources:         [source('Bloomberg'), source('Reuters'), source('Wired')],
    category:        'business',
    sourceAuthority: { Bloomberg: 95, Reuters: 92, Wired: 85 },
    ...over,
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  source-authority
// ──────────────────────────────────────────────────────────────────────────
describe('source-authority — loadAuthorityMap', () => {
  it('1. returns mapped authority for known sources (case-insensitive)', async () => {
    const map = await loadAuthorityMap(['Bloomberg', 'reuters', 'WIRED'])
    expect(map['Bloomberg']).toBe(95)
    expect(map['reuters']).toBe(92)
    expect(map['WIRED']).toBe(85)
  })

  it('2. falls back to DEFAULT_AUTHORITY for unknown sources', async () => {
    const map = await loadAuthorityMap(['Some Random Substack'])
    expect(map['Some Random Substack']).toBe(DEFAULT_AUTHORITY)
    expect(DEFAULT_AUTHORITY).toBe(50)
  })

  it('3. preserves the caller-provided casing as the map key', async () => {
    const map = await loadAuthorityMap(['BLOOMBERG'])
    // value resolved via case-insensitive lookup, key remains as provided
    expect(Object.keys(map)).toEqual(['BLOOMBERG'])
    expect(map['BLOOMBERG']).toBe(95)
  })

  it('4. returns an empty map for empty input', async () => {
    const map = await loadAuthorityMap([])
    expect(map).toEqual({})
  })

  it('5. handles a mix of known and unknown sources independently', async () => {
    const map = await loadAuthorityMap(['Reuters', 'unknownsource', 'OpenAI Blog'])
    expect(map['Reuters']).toBe(92)
    expect(map['unknownsource']).toBe(DEFAULT_AUTHORITY)
    expect(map['OpenAI Blog']).toBe(90)
  })
})

// ──────────────────────────────────────────────────────────────────────────
//  Score Engine — happy path
// ──────────────────────────────────────────────────────────────────────────
describe('computeScore — happy path with both dimensions', () => {
  it('6. returns a ScorePayload with value in [0,100], 2 dimensions, excluded=[]', () => {
    const result = computeScore(makeInput())
    expect(result.value).toBeGreaterThanOrEqual(0)
    expect(result.value).toBeLessThanOrEqual(100)
    expect(result.dimensions).toHaveLength(2)
    expect(result.dimensions.map((d) => d.name).sort()).toEqual(['source_authority', 'source_count'])
    expect(result.excluded).toEqual([])
  })

  it('7. weights of included dimensions sum to exactly 1.0 after renormalization', () => {
    const result = computeScore(makeInput())
    const sum = result.dimensions.reduce((s, d) => s + d.weight, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('8. deterministic — same input twice produces identical output', () => {
    const a = computeScore(makeInput())
    const b = computeScore(makeInput())
    expect(a).toEqual(b)
  })

  it('9. source_authority dimension = average of looked-up authority values', () => {
    const result = computeScore(makeInput())
    const auth = result.dimensions.find((d) => d.name === 'source_authority')!
    // mean(95, 92, 85) = 90.666… → rounded to 91
    expect(auth.value).toBe(91)
    expect(auth.rawData.sourceCount).toBe(3)
  })

  it('10. source_count dimension = min(100, distinct_sources * 10)', () => {
    // 3 distinct sources → 30
    const result = computeScore(makeInput())
    const count = result.dimensions.find((d) => d.name === 'source_count')!
    expect(count.value).toBe(30)
    expect(count.rawData.distinctSources).toBe(3)
  })

  it('11. source_count saturates at 100 for 10+ distinct sources', () => {
    const manySources: SourceObservation[] = Array.from({ length: 15 }).map((_, i) =>
      source(`Source${i}`),
    )
    const auth: Record<string, number> = {}
    for (let i = 0; i < 15; i++) auth[`Source${i}`] = 70

    const result = computeScore(makeInput({ sources: manySources, sourceAuthority: auth }))
    const count = result.dimensions.find((d) => d.name === 'source_count')!
    expect(count.value).toBe(100)
  })

  it('12. each dimension carries rawData for audit', () => {
    const result = computeScore(makeInput())
    for (const d of result.dimensions) {
      expect(d.rawData).toBeDefined()
      expect(Object.keys(d.rawData).length).toBeGreaterThan(0)
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
//  Score Engine — subset tolerance (zero sources)
// ──────────────────────────────────────────────────────────────────────────
describe('computeScore — graceful subset handling', () => {
  it('13. empty sources → both dimensions excluded, value=0', () => {
    const result = computeScore(makeInput({ sources: [] }))
    expect(result.dimensions).toEqual([])
    expect(result.excluded.sort()).toEqual(['source_authority', 'source_count'])
    expect(result.value).toBe(0)
  })

  it('14. unknown source name uses internal fallback authority (50) without throwing', () => {
    const result = computeScore(makeInput({
      sources:         [source('Unknown Source')],
      sourceAuthority: {},  // caller forgot to pre-load — engine must still work
    }))
    expect(result.dimensions).toHaveLength(2)
    const auth = result.dimensions.find((d) => d.name === 'source_authority')!
    expect(auth.value).toBe(50)
  })
})

// ──────────────────────────────────────────────────────────────────────────
//  Score Engine — version and shape contracts
// ──────────────────────────────────────────────────────────────────────────
describe('computeScore — version + output shape contracts', () => {
  it('15. SCORE_ENGINE_VERSION matches the v1.0.0 commitment', () => {
    expect(SCORE_ENGINE_VERSION).toBe('score-engine-1.0.0')
  })

  it('16. ScorePayload value is an integer (rounded), 0-100', () => {
    const result = computeScore(makeInput())
    expect(Number.isInteger(result.value)).toBe(true)
    expect(result.value).toBeGreaterThanOrEqual(0)
    expect(result.value).toBeLessThanOrEqual(100)
  })

  it('17. dimensions[].value is integer; dimensions[].weight is fractional [0,1]', () => {
    const result = computeScore(makeInput())
    for (const d of result.dimensions) {
      expect(Number.isInteger(d.value)).toBe(true)
      expect(d.weight).toBeGreaterThan(0)
      expect(d.weight).toBeLessThanOrEqual(1)
    }
  })

  it('18. excluded[] is stable-ordered (source_authority then source_count)', () => {
    // When both are excluded, expect ['source_authority', 'source_count']
    const r = computeScore(makeInput({ sources: [] }))
    expect(r.excluded).toEqual(['source_authority', 'source_count'])
  })
})
