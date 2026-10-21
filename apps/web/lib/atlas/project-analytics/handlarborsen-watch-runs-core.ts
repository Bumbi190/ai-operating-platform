import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'

export const WATCH_RUN_KIND = 'known_sources_weekly' as const
export const WATCH_RUN_LEASE_SECONDS = 180
export const WATCH_RUN_HTTP_CAP = 10
export const validWatchUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)

export function weeklyWatchPeriod(now: Date): string | null {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const date = new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date.toISOString().slice(0, 10)
}
export function validWatchPeriod(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1
}

export type WatchFinish = {
  id: string; claimToken: string; expectedRevision: 1
  state: 'succeeded' | 'failed'
  outcome: 'verified' | 'source_unavailable' | 'gate_refused' | 'cancelled'
  httpRequestCount: number; evidenceDigest: string | null
}
export function validWatchFinish(value: unknown): value is WatchFinish {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (!validWatchUuid(v.id) || !validWatchUuid(v.claimToken) || v.expectedRevision !== 1
    || !Number.isInteger(v.httpRequestCount) || Number(v.httpRequestCount) < 0 || Number(v.httpRequestCount) > WATCH_RUN_HTTP_CAP) return false
  const digest = v.evidenceDigest === null || (typeof v.evidenceDigest === 'string' && /^[a-f0-9]{64}$/.test(v.evidenceDigest))
  if (!digest) return false
  if (v.state === 'succeeded') return v.outcome === 'verified' && v.evidenceDigest !== null
  if (v.state !== 'failed') return false
  if (v.outcome === 'source_unavailable') return true
  return (v.outcome === 'gate_refused' || v.outcome === 'cancelled') && v.httpRequestCount === 0 && v.evidenceDigest === null
}

export type WatchRunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'uncertain'
const outcomes = ['queued','existing','claimed','already_running','busy','blocked_review','not_current_period',
  'not_found','finished','already_finished','conflict','stale_claim','uncertain'] as const
export type WatchRunOutcome = typeof outcomes[number]
export type WatchRunReceipt = Readonly<{
  id: string; periodStart: string; state: WatchRunState; revision: number; httpRequestCount: number | null
}>
export type WatchJournalResult =
  | {status: 'disabled' | 'invalid' | 'unknown'; executionAllowed: false}
  | {status: 'ok'; outcome: WatchRunOutcome; run: WatchRunReceipt | null; executionAllowed: false}
export const unknownWatchResult = (): WatchJournalResult => ({status:'unknown', executionAllowed:false})

/** No claim token, raw database fields or execution permission crosses this boundary. */
export function parseWatchRunReply(raw: unknown, expected: {id?: string; period?: string; outcomes?: readonly WatchRunOutcome[]} = {}): WatchJournalResult {
  const unknown = unknownWatchResult
  if (!raw || typeof raw !== 'object') return unknown()
  const value = raw as Record<string, unknown>
  if (!outcomes.includes(value.outcome as WatchRunOutcome)) return unknown()
  const outcome = value.outcome as WatchRunOutcome
  if (expected.outcomes && !expected.outcomes.includes(outcome)) return unknown()
  if (outcome === 'not_found') return value.run === null
    ? {status:'ok', outcome, run:null, executionAllowed:false} : unknown()
  if (!value.run || typeof value.run !== 'object') return unknown()
  const run = value.run as Record<string, unknown>
  if (run.project_id !== HANDLARBORSEN_PROJECT_ID || run.kind !== WATCH_RUN_KIND || !validWatchUuid(run.id)
    || !validWatchPeriod(run.period_start) || (expected.id && run.id !== expected.id)
    || (expected.period && run.period_start !== expected.period)) return unknown()
  const state = run.status as WatchRunState
  const revision = state === 'queued' ? 0 : state === 'running' ? 1
    : ['succeeded','failed','uncertain'].includes(state) ? 2 : -1
  if (revision < 0 || run.revision !== revision) return unknown()
  const terminal = state === 'succeeded' || state === 'failed'
  if (terminal ? !Number.isInteger(run.http_request_count) || Number(run.http_request_count) < 0 || Number(run.http_request_count) > WATCH_RUN_HTTP_CAP
    : run.http_request_count !== null) return unknown()
  if ((outcome === 'queued' && state !== 'queued') || (outcome === 'claimed' && state !== 'running')
    || (outcome === 'already_running' && state !== 'running')
    || (['finished','already_finished'].includes(outcome) && !terminal)
    || (outcome === 'uncertain' && state !== 'uncertain')) return unknown()
  return {status:'ok', outcome, run:{id:run.id, periodStart:run.period_start, state,
    revision, httpRequestCount:run.http_request_count as number | null}, executionAllowed:false}
}
