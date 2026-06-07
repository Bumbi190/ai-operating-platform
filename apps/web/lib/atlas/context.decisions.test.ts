/**
 * D1 — operator decision selection (selectActiveDecisions).
 *
 * Pure-function tests: latest-per-key supersession, newest-first ordering,
 * cap, truncation, and defensive handling. No DB.
 */
import { describe, it, expect } from 'vitest'
import { selectActiveDecisions } from './context'

const row = (key: string, value: string, updated_at: string, source = 'operator') =>
  ({ key, value, source, updated_at })

describe('selectActiveDecisions', () => {
  it('keeps only the latest row per key (supersession-by-key)', () => {
    const out = selectActiveDecisions([
      row('p1', 'old', '2026-06-01T00:00:00Z'),
      row('p1', 'new', '2026-06-06T00:00:00Z'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('new')
  })

  it('orders newest first', () => {
    const out = selectActiveDecisions([
      row('a', 'a', '2026-06-01T00:00:00Z'),
      row('b', 'b', '2026-06-06T00:00:00Z'),
    ])
    expect(out.map(d => d.key)).toEqual(['b', 'a'])
  })

  it('caps at 12 entries', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(`k${i}`, `v${i}`, `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`))
    expect(selectActiveDecisions(rows)).toHaveLength(12)
  })

  it('truncates long values to ~200 chars + ellipsis', () => {
    const long = 'x'.repeat(500)
    const [d] = selectActiveDecisions([row('k', long, '2026-06-06T00:00:00Z')])
    expect(d.text.length).toBe(201) // 200 + ellipsis char
    expect(d.text.endsWith('…')).toBe(true)
  })

  it('skips rows missing key or value, and handles empty/undefined input', () => {
    expect(selectActiveDecisions([])).toEqual([])
    // @ts-expect-error defensive: undefined input
    expect(selectActiveDecisions(undefined)).toEqual([])
    const out = selectActiveDecisions([
      row('', 'novalue', '2026-06-06T00:00:00Z'),
      row('k', '', '2026-06-06T00:00:00Z'),
      row('ok', 'kept', '2026-06-06T00:00:00Z'),
    ])
    expect(out.map(d => d.key)).toEqual(['ok'])
  })

  it('preserves source on the returned decision', () => {
    const [d] = selectActiveDecisions([row('k', 'v', '2026-06-06T00:00:00Z', 'incident-verification')])
    expect(d.source).toBe('incident-verification')
  })
})
