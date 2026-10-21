import type { HistoryAnalysis, HistoryRecord } from './handlarborsen-competitor-history-core'
import { HISTORY_SOURCE_IDS } from './handlarborsen-competitor-history-core'

/**
 * Only verified, persisted history is eligible for a 'last saved' label.
 * A manual, unsaved page scan must never masquerade as a historical record.
 */
export function latestSavedCompetitorObservation(
  history: HistoryAnalysis | null,
  sourceId: string,
): HistoryRecord | null {
  if (history?.status !== 'ok' || !HISTORY_SOURCE_IDS.includes(sourceId)) return null
  let latest: HistoryRecord | null = null
  for (const row of history.observations) {
    if (row.sourceId === sourceId && (!latest || row.checkedAt > latest.checkedAt)) latest = row
  }
  return latest
}

/** ISO UTC date labels, without local-time rollover or invented timestamps. */
export function savedCompetitorDay(record: HistoryRecord): { date: string; label: string } {
  const day = record.checkedAt.slice(0, 10)
  const parsed = new Date(day + 'T00:00:00.000Z')
  return {
    date: day,
    label: new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(parsed),
  }
}
