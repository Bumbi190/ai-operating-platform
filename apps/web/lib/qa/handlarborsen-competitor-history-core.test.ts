import { describe, expect, it } from 'vitest'
import {
  HISTORY_SOURCE_IDS,
  evaluateCompetitorHistory,
  type HistoryRecord,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'

const now = new Date('2026-10-14T11:50:00.000Z')
const observation = (
  date: string,
  title: string | null,
  sourceId = 'auto1',
  status = title === null ? 'robots_unavailable' : 'metadata_checked',
): HistoryRecord => ({ sourceId, checkedAt: date, status, title })

const a = observation('2026-10-12T10:00:00.000Z', 'Automotive market')
const b = observation('2026-10-14T10:00:00.000Z', 'Automotive market updated')

describe('bounded competitor observation history', () => {
  it('is fixed to three Handlarbudet and three newer official sources', () => {
    expect(HISTORY_SOURCE_IDS).toHaveLength(6)
    expect(Object.isFrozen(HISTORY_SOURCE_IDS)).toBe(true)
    expect(new Set(HISTORY_SOURCE_IDS).size).toBe(6)
    expect(HISTORY_SOURCE_IDS).toContain('auto1')
    expect(HISTORY_SOURCE_IDS).toContain('autoproff')
    expect(HISTORY_SOURCE_IDS).toContain('bca')
  })
  it('shows no invented trends or plans without two verified observations', () => {
    const empty = evaluateCompetitorHistory([], now)
    expect(empty).toMatchObject({
      status: 'ok', observedDays: 0, successfullyObservedSources: 0,
      comparisons: [], proposals: [],
    })
    const first = evaluateCompetitorHistory([a], now)
    expect(first.status).toBe('ok')
    if (first.status !== 'ok') return
    expect(first.comparisons).toEqual([{
      sourceId: 'auto1', kind: 'first', from: null,
      to: a.checkedAt, reason: 'first_observation',
    }])
    expect(first.proposals).toEqual([])
  })
  it('detects a title difference but never turns it into an executable action or product claim', () => {
    const result = evaluateCompetitorHistory([b, a], now)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.comparisons.find(c => c.kind === 'changed')).toMatchObject({
      sourceId: 'auto1', from: a.checkedAt, to: b.checkedAt,
      daysBetween: 2, reason: 'two_successful_observations',
    })
    expect(result.daily).toEqual([
      { date: '2026-10-12', checked: 1, verifiedTitles: 1, unavailableSources: 0, comparablePairs: 0, changedTitles: 0 },
      { date: '2026-10-14', checked: 1, verifiedTitles: 1, unavailableSources: 0, comparablePairs: 1, changedTitles: 1 },
    ])
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0]).toMatchObject({
      sourceId: 'auto1', status: 'review_only', executable: false,
      observedBefore: a.checkedAt, observedAfter: b.checkedAt,
    })
    expect(result.proposals[0].evidence).toEqual([
      { checkedAt: a.checkedAt, title: a.title },
      { checkedAt: b.checkedAt, title: b.title },
    ])
    expect(result.proposals[0].prompt).not.toMatch(/konkurrenten har lanserat|garanterat/)
  })
  it('distinguishes identical verified titles from unknown and failed checks', () => {
    const same = evaluateCompetitorHistory([
      a, observation('2026-10-14T10:00:00.000Z', 'Automotive market'),
    ], now)
    expect(same.status).toBe('ok')
    if (same.status !== 'ok') return
    expect(same.comparisons.at(-1)?.kind).toBe('unchanged')
    expect(same.proposals).toEqual([])
    const missing = evaluateCompetitorHistory([
      a,
      observation('2026-10-13T10:00:00.000Z', null),
      b,
    ], now)
    expect(missing.status).toBe('ok')
    if (missing.status !== 'ok') return
    expect(missing.comparisons.map(x => x.kind)).toEqual(['first', 'unavailable', 'unavailable'])
    expect(missing.proposals).toHaveLength(0)
  })
  it('never crosses sources when comparing different sites', () => {
    const result = evaluateCompetitorHistory([a, observation(b.checkedAt, 'Different title', 'autoproff')], now)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.comparisons.map(c => c.kind)).toEqual(['first', 'first'])
    expect(result.proposals).toEqual([])
  })
  it('rejects invalid, spoofed, duplicated and future history rows', () => {
    expect(evaluateCompetitorHistory([a, { ...a }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, sourceId: 'untrusted.example' }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, checkedAt: '2026-10-15T01:00:00.000Z' }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, checkedAt: '2026-08-01T10:00:00.000Z' }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, checkedAt: '2026-10-14 10:00' }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, title: '<script>unsafe</script>' }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, title: 'x'.repeat(161) }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, title: null }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory([{ ...a, status: 'robots_denied' }], now).status).toBe('invalid')
    expect(evaluateCompetitorHistory(Array.from({ length: 181 }, () => a), now).status).toBe('invalid')
  })
  it('treats separate calendar days as distinct but prevents two records for one day and source', () => {
    const doubled = evaluateCompetitorHistory([
      a, observation('2026-10-12T12:00:00.000Z', 'Revised same day'),
    ], now)
    expect(doubled).toMatchObject({ status: 'invalid', reason: 'duplicate_day' })
    const accepted = evaluateCompetitorHistory([
      a, observation('2026-10-12T12:00:00.000Z', 'Other', 'bca'),
    ], now)
    expect(accepted.status).toBe('ok')
  })
})
