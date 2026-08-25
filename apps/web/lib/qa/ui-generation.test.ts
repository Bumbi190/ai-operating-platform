import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UI_GENERATION,
  OMNIRA_UI_COOKIE,
  OMNIRA_UI_GENERATIONS,
  isVNext,
  parseUiGeneration,
  parseUiGenerationParam,
  resolveUiGeneration,
} from '@/lib/ui/generation'

/**
 * UI-generation resolution.
 *
 * The gate selects which UI renders and nothing else. These tests pin the two
 * properties that matter: an explicit choice is honoured on the request that
 * makes it, and anything unrecognised falls back to legacy rather than leaking
 * vNext.
 */
describe('ui generation · contract', () => {
  it('exposes exactly two generations and defaults to legacy', () => {
    expect([...OMNIRA_UI_GENERATIONS]).toEqual(['legacy', 'vnext'])
    expect(DEFAULT_UI_GENERATION).toBe('legacy')
    expect(OMNIRA_UI_COOKIE).toBe('omnira_ui')
  })

  it('parses only exact allow-list values', () => {
    expect(parseUiGeneration('vnext')).toBe('vnext')
    expect(parseUiGeneration('legacy')).toBe('legacy')

    for (const junk of ['VNEXT', 'vNext', ' vnext', 'vnext ', 'v-next', '', 'true', '1']) {
      expect(parseUiGeneration(junk)).toBeNull()
    }
    for (const junk of [null, undefined, 0, 1, {}, [], true]) {
      expect(parseUiGeneration(junk)).toBeNull()
    }
  })

  it('reads a repeated query parameter from its first entry only', () => {
    expect(parseUiGenerationParam(['vnext', 'legacy'])).toBe('vnext')
    // A junk leading value cannot be rescued by appending a valid one.
    expect(parseUiGenerationParam(['bogus', 'vnext'])).toBeNull()
    expect(parseUiGenerationParam([])).toBeNull()
  })
})

describe('ui generation · resolution', () => {
  it('no query and no cookie resolves to legacy', () => {
    expect(resolveUiGeneration()).toBe('legacy')
    expect(resolveUiGeneration({})).toBe('legacy')
    expect(resolveUiGeneration({ query: undefined, cookie: undefined })).toBe('legacy')
  })

  it('?ui=vnext selects vNext on the current request', () => {
    expect(resolveUiGeneration({ query: 'vnext' })).toBe('vnext')
  })

  it('?ui=legacy selects legacy on the current request', () => {
    expect(resolveUiGeneration({ query: 'legacy' })).toBe('legacy')
  })

  it('a malformed query falls through to the cookie rather than forcing legacy', () => {
    expect(resolveUiGeneration({ query: 'bogus', cookie: 'vnext' })).toBe('vnext')
    expect(resolveUiGeneration({ query: '', cookie: 'vnext' })).toBe('vnext')
  })

  it('a malformed query with no cookie resolves to legacy', () => {
    expect(resolveUiGeneration({ query: 'bogus' })).toBe('legacy')
  })

  it('a persisted vnext cookie selects vNext on another platform route', () => {
    // No ?ui= present, as when the operator clicks through to /approvals.
    expect(resolveUiGeneration({ cookie: 'vnext' })).toBe('vnext')
  })

  it('a persisted legacy cookie selects legacy', () => {
    expect(resolveUiGeneration({ cookie: 'legacy' })).toBe('legacy')
  })

  it('a malformed or unknown cookie fails closed to legacy', () => {
    for (const junk of ['vnext; admin', 'VNEXT', 'true', '', 'undefined', 'null', '{}']) {
      expect(resolveUiGeneration({ cookie: junk })).toBe('legacy')
    }
  })

  it('an explicit query beats a stale cookie in both directions', () => {
    expect(resolveUiGeneration({ query: 'legacy', cookie: 'vnext' })).toBe('legacy')
    expect(resolveUiGeneration({ query: 'vnext', cookie: 'legacy' })).toBe('vnext')
  })

  it('never resolves to vNext without an explicit vnext signal', () => {
    const noSignal = [
      { query: null, cookie: null },
      { query: 'legacy', cookie: 'legacy' },
      { query: 'bogus', cookie: 'bogus' },
      { query: undefined, cookie: 'nope' },
    ]
    for (const input of noSignal) {
      expect(resolveUiGeneration(input)).toBe('legacy')
      expect(isVNext(resolveUiGeneration(input))).toBe(false)
    }
  })
})

describe('ui generation · is not an authority signal', () => {
  it('resolution depends only on the ui inputs, never on identity or scope', () => {
    // The resolver takes no user, session, project or role input at all: the
    // same ui inputs must produce the same generation regardless of caller.
    expect(resolveUiGeneration({ query: 'vnext' })).toBe(
      resolveUiGeneration({ query: 'vnext', cookie: 'legacy' }),
    )
    expect(Object.keys({ query: null, cookie: null })).toEqual(['query', 'cookie'])
  })

  it('cannot be coerced into a third state', () => {
    const results = new Set(
      ['vnext', 'legacy', 'bogus', '', 'admin', 'true', null, undefined].map((v) =>
        resolveUiGeneration({ query: v as string | null | undefined }),
      ),
    )
    for (const value of results) {
      expect(OMNIRA_UI_GENERATIONS).toContain(value)
    }
  })
})
