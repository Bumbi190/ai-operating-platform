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
 * The gate selects which UI renders and nothing else. These tests pin the
 * properties that matter after the vNext default rollout: an explicit choice is
 * honoured on the request that makes it, legacy is reachable only through an
 * explicit legacy signal, anything unrecognised resolves to the production
 * default rather than inventing a state, and nothing here depends on identity.
 */
describe('ui generation · contract', () => {
  it('exposes exactly two generations and defaults to vnext', () => {
    expect([...OMNIRA_UI_GENERATIONS]).toEqual(['legacy', 'vnext'])
    expect(DEFAULT_UI_GENERATION).toBe('vnext')
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
  it('no query and no cookie resolves to vnext', () => {
    expect(resolveUiGeneration()).toBe('vnext')
    expect(resolveUiGeneration({})).toBe('vnext')
    expect(resolveUiGeneration({ query: undefined, cookie: undefined })).toBe('vnext')
  })

  it('?ui=vnext selects vNext on the current request', () => {
    expect(resolveUiGeneration({ query: 'vnext' })).toBe('vnext')
  })

  it('?ui=legacy selects legacy on the current request', () => {
    expect(resolveUiGeneration({ query: 'legacy' })).toBe('legacy')
  })

  it('a malformed query falls through to the cookie rather than to the default', () => {
    // The cookie is a real, previously-expressed preference: junk in the query
    // must not silently discard it in either direction.
    expect(resolveUiGeneration({ query: 'bogus', cookie: 'vnext' })).toBe('vnext')
    expect(resolveUiGeneration({ query: '', cookie: 'vnext' })).toBe('vnext')
    expect(resolveUiGeneration({ query: 'bogus', cookie: 'legacy' })).toBe('legacy')
    expect(resolveUiGeneration({ query: '', cookie: 'legacy' })).toBe('legacy')
  })

  it('a malformed query with no cookie resolves to the production default', () => {
    expect(resolveUiGeneration({ query: 'bogus' })).toBe('vnext')
  })

  it('a persisted vnext cookie selects vNext on another platform route', () => {
    // No ?ui= present, as when the operator clicks through to /approvals.
    expect(resolveUiGeneration({ cookie: 'vnext' })).toBe('vnext')
  })

  it('a persisted legacy cookie selects legacy', () => {
    expect(resolveUiGeneration({ cookie: 'legacy' })).toBe('legacy')
  })

  it('a malformed or unknown cookie resolves to the production default', () => {
    for (const junk of ['vnext; admin', 'VNEXT', 'true', '', 'undefined', 'null', '{}']) {
      expect(resolveUiGeneration({ cookie: junk })).toBe('vnext')
    }
  })

  it('an explicit query beats a stale cookie in both directions', () => {
    expect(resolveUiGeneration({ query: 'legacy', cookie: 'vnext' })).toBe('legacy')
    expect(resolveUiGeneration({ query: 'vnext', cookie: 'legacy' })).toBe('vnext')
  })

  it('resolves to the production default whenever no valid signal is present', () => {
    const noSignal = [
      { query: null, cookie: null },
      { query: 'bogus', cookie: 'bogus' },
      { query: undefined, cookie: 'nope' },
      { query: '', cookie: '' },
    ]
    for (const input of noSignal) {
      expect(resolveUiGeneration(input)).toBe('vnext')
      expect(isVNext(resolveUiGeneration(input))).toBe(true)
    }
  })

  it('reaches legacy only through an explicit legacy signal', () => {
    // Rollback stays deliberate rather than accidental. This is the mirror of
    // the pre-rollout guarantee: junk can no more downgrade a request than it
    // could previously upgrade one.
    expect(resolveUiGeneration({ query: 'legacy' })).toBe('legacy')
    expect(resolveUiGeneration({ cookie: 'legacy' })).toBe('legacy')
    expect(resolveUiGeneration({ query: 'legacy', cookie: 'legacy' })).toBe('legacy')

    for (const junk of ['LEGACY', 'Legacy', ' legacy', 'legacy ', 'old', 'v1', 'true', '']) {
      expect(resolveUiGeneration({ query: junk })).toBe('vnext')
      expect(resolveUiGeneration({ cookie: junk })).toBe('vnext')
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
