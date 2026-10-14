import { EVIDENCE } from './handlarborsen-competitors'
import { COMPETITOR_SITES } from './handlarborsen-competitor-landscape'

/**
 * Pure, project-limited history analysis. No storage, network, scheduling, LLM,
 * permissions or execution. It accepts only checked, dated source metadata.
 * A title difference is NEVER evidence of a product launch, price change or
 * current commercial offering.
 */
export const HISTORY_SOURCE_IDS: readonly string[] = Object.freeze([
  ...EVIDENCE.map(x => x.id),
  ...COMPETITOR_SITES.map(x => x.id),
])
export const HISTORY_RULE_VERSION = 'hb-competitors-history-0.1.0'

export type HistoryRecord = Readonly<{
  sourceId: string
  checkedAt: string
  status: string
  title: string | null
}>
export type TitleComparison =
  | Readonly<{
      kind: 'first' | 'unavailable'
      sourceId: string
      from: null
      to: string
      reason: 'first_observation' | 'failed_check'
    }>
  | Readonly<{
      kind: 'changed' | 'unchanged'
      sourceId: string
      from: string
      to: string
      previousTitle: string
      currentTitle: string
      daysBetween: number
      reason: 'two_successful_observations'
    }>
/** Values for a real chart: an absent day is never filled with invented zeroes. */
export type HistoryDay = Readonly<{
  date: string
  checked: number
  verifiedTitles: number
  unavailableSources: number
  comparablePairs: number
  changedTitles: number
}>

export type ReviewProposal = Readonly<{
  id: string
  sourceId: string
  title: string
  prompt: string
  observedBefore: string
  observedAfter: string
  evidence: readonly [{ checkedAt: string; title: string }, { checkedAt: string; title: string }]
  status: 'review_only'
  executable: false
}>
export type HistoryAnalysis =
  | Readonly<{ status: 'invalid'; reason: 'invalid_observation' | 'duplicate_day' | 'out_of_range' }>
  | Readonly<{
      status: 'ok'
      observations: readonly HistoryRecord[]
      comparisons: readonly TitleComparison[]
      daily: readonly HistoryDay[]
      proposals: readonly ReviewProposal[]
      sourceCount: number
      successfullyObservedSources: number
      observedDays: number
    }>

const safeDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const statuses = new Set([
  'metadata_checked', 'robots_denied', 'robots_unavailable', 'redirect_refused',
  'http_error', 'invalid_content_type', 'too_large', 'metadata_missing', 'fetch_failed',
])
const idSet = new Set(HISTORY_SOURCE_IDS)
const MAX_HISTORY = 180 // 30 days * six fixed sources; bounded input memory
const MAX_DAYS = 30

function validate(row: HistoryRecord, now: Date): boolean {
  if (!row || !idSet.has(row.sourceId) || !statuses.has(row.status)) return false
  if (typeof row.checkedAt !== 'string' || !safeDate.test(row.checkedAt)) return false
  const at = Date.parse(row.checkedAt)
  const current = now.getTime()
  if (!Number.isFinite(at) || new Date(at).toISOString() !== row.checkedAt) {
    // ISO strings with canonical milliseconds are required for stable audit.
    return false
  }
  if (at > current || at < current - MAX_DAYS * 86400000) return false
  if (row.status !== 'metadata_checked') return row.title === null
  return typeof row.title === 'string' && row.title.trim() === row.title
    && row.title.length > 0 && row.title.length <= 160
    && !/[<>\u0000-\u001f\u007f-\u009f]/.test(row.title)
}

function daysBetween(from: string, to: string) {
  const day1 = Date.parse(from.slice(0, 10) + 'T00:00:00.000Z')
  const day2 = Date.parse(to.slice(0, 10) + 'T00:00:00.000Z')
  return Math.round((day2 - day1) / 86400000)
}

export function evaluateCompetitorHistory(
  input: readonly HistoryRecord[],
  now: Date,
): HistoryAnalysis {
  if (!Number.isFinite(now.getTime()) || !Array.isArray(input) || input.length > MAX_HISTORY)
    return { status: 'invalid', reason: 'out_of_range' }
  if (input.some(row => !validate(row, now)))
    return { status: 'invalid', reason: 'invalid_observation' }

  const seen = new Set<string>()
  for (const row of input) {
    const key = row.sourceId + '/' + row.checkedAt.slice(0, 10)
    if (seen.has(key)) return { status: 'invalid', reason: 'duplicate_day' }
    seen.add(key)
  }
  const sorted = [...input].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId) || a.checkedAt.localeCompare(b.checkedAt))
  const comparisons: TitleComparison[] = []
  const proposals: ReviewProposal[] = []
  for (const sourceId of HISTORY_SOURCE_IDS) {
    const sourceRows = sorted.filter(row => row.sourceId === sourceId)
    sourceRows.forEach((current, i) => {
      const prior = sourceRows[i - 1]
      const to = current.checkedAt
      if (!prior) {
        comparisons.push({ kind: 'first', sourceId, from: null, to, reason: 'first_observation' })
        return
      }
      if (prior.status !== 'metadata_checked' || current.status !== 'metadata_checked'
        || !prior.title || !current.title) {
        comparisons.push({ kind: 'unavailable', sourceId, from: null, to, reason: 'failed_check' })
        return
      }
      const kind = prior.title === current.title ? 'unchanged' : 'changed'
      comparisons.push({
        kind, sourceId, from: prior.checkedAt, to,
        previousTitle: prior.title, currentTitle: current.title,
        daysBetween: daysBetween(prior.checkedAt, to),
        reason: 'two_successful_observations',
      })
      if (kind !== 'changed') return
      proposals.push({
        id: HISTORY_RULE_VERSION + ':' + sourceId + ':' + to.slice(0, 10),
        sourceId,
        title: 'Granska en förändrad sidrubrik',
        prompt: 'Kontrollera manuellt om den ändrade publika rubriken motsvarar någon faktisk förändring. Be om pilotfeedback innan en produktåtgärd övervägs.',
        observedBefore: prior.checkedAt,
        observedAfter: to,
        evidence: [
          { checkedAt: prior.checkedAt, title: prior.title },
          { checkedAt: to, title: current.title },
        ],
        status: 'review_only',
        executable: false,
      })
    })
  }
  const daily = [...new Set(sorted.map(row => row.checkedAt.slice(0, 10)))]
    .sort()
    .map(date => {
      const onDay = sorted.filter(row => row.checkedAt.startsWith(date))
      const comparablePairs = comparisons.filter(
        row => row.to.startsWith(date) && (row.kind === 'changed' || row.kind === 'unchanged'),
      )
      return {
        date,
        checked: onDay.length,
        verifiedTitles: onDay.filter(row => row.status === 'metadata_checked').length,
        unavailableSources: onDay.filter(row => row.status !== 'metadata_checked').length,
        comparablePairs: comparablePairs.length,
        changedTitles: comparablePairs.filter(row => row.kind === 'changed').length,
      }
    })
  return {
    status: 'ok',
    observations: sorted,
    comparisons,
    daily,
    proposals,
    sourceCount: HISTORY_SOURCE_IDS.length,
    successfullyObservedSources: new Set(sorted.filter(row => row.status === 'metadata_checked').map(row => row.sourceId)).size,
    observedDays: new Set(sorted.map(row => row.checkedAt.slice(0, 10))).size,
  }
}
