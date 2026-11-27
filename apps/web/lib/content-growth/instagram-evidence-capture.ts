/**
 * Unmounted server-only integration boundary for The Prompt.
 * No network, persistence, credential resolution, logging or publication.
 * Future trusted server callers must supply metadata from the ORIGINAL existing
 * successful dispatch/fetch, not from cache, channel-state or request input.
 * A local request/response interval is NOT a provider publication timestamp
 * or proof of provider-side metric freshness. Outputs remain unverified
 * retention candidates and must never be relabelled as provider snapshots.
 * No active flow reads the flag or calls this module yet.
 */
import 'server-only'
import type { InstagramCredential } from '@/lib/media/social-credentials'
import type { InsightFetchResult, MediaInsight } from '@/lib/media/insights'
import { TARGET_COMPARISON_AGE_HOURS } from './instagram-experiments'

type Scope = Readonly<Pick<InstagramCredential, 'projectId' | 'bindingId' | 'accountId' | 'platform'>>
type Window = Readonly<{ startMs: number; endMs: number }>
type Gate = Readonly<{
  // Explicit server configuration, not user input. Absence is OFF.
  enabled?: boolean
  projectSlug: 'ai-media-automation'
  scope: Scope
  enrollment: Window
}>
type PublicationEvent = Scope & Readonly<{
  scriptId: string
  mediaId: string
  // Stable identity assigned by the future trusted acquisition source.
  acquisitionId: string
  origin: 'existing_media_publish_response' | 'recovered' | 'already_published' | 'cache' | 'unknown'
  dispatchAttempts: number
  dryRun: boolean
  recovered: boolean
  skipped: boolean
  needsVerification: boolean
  previousMediaId: string | null
  persistedMediaId: string | null
  request: Window
  nowMs: number
}>
type MeasurementEvent = Scope & Readonly<{
  scriptId: string
  mediaId: string
  acquisitionId: string
  origin: 'existing_insights_response' | 'cache' | 'account_snapshot' | 'unknown'
  // True only for metrics normalized from the same successful response,
  // not merged with another acquisition. No raw payload is used here.
  singleResponseMetrics: boolean
  request: Window
  nowMs: number
  result: Pick<InsightFetchResult, 'ok' | 'metrics'>
}>
type PublicationCandidate = Readonly<{
  kind: 'publication_interval_candidate'
  evidence: 'unverified_local_interval'
  projectId: string
  bindingId: string
  accountId: string
  platform: 'instagram'
  scriptId: string
  mediaId: string
  acquisitionId: string
  startMs: number
  endMs: number
}>
type Refusal = Readonly<{
  status: 'disabled' | 'invalid_scope' | 'untrusted_origin' | 'invalid_identity' |
    'invalid_interval' | 'outside_enrollment' | 'outside_age_window' | 'invalid_metrics' | 'unavailable'
  candidate: null
  authorizesPilot: false
  authorizesPublication: false
}>
const refuse = (status: Refusal['status']): Refusal => ({ status, candidate: null, authorizesPilot: false, authorizesPublication: false })
const HOUR = 3_600_000
const MIN_AGE = TARGET_COMPARISON_AGE_HOURS * HOUR
const MAX_AGE = (TARGET_COMPARISON_AGE_HOURS + 6) * HOUR
// Bounds on local timestamp uncertainty, not provider latency guarantees.
const MAX_PUBLICATION_INTERVAL_MS = 120_000
const MAX_MEASUREMENT_INTERVAL_MS = 60_000
const uuid = (v: unknown): v is string => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) &&
  v !== '00000000-0000-0000-0000-000000000000'
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v)
const account = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)
const time = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const windowValid = (w: Window | null | undefined): w is Window =>
  !!w && time(w.startMs) && time(w.endMs) && w.endMs >= w.startMs
const scopeValid = (s: Scope | null | undefined): s is Scope =>
  !!s && s.platform === 'instagram' && uuid(s.projectId) && uuid(s.bindingId) && account(s.accountId)
const scopeMatch = (s: Scope, expected: Scope) =>
  scopeValid(s) && s.projectId === expected.projectId && s.bindingId === expected.bindingId && s.accountId === expected.accountId
const gateValid = (g: Gate): boolean =>
  g.projectSlug === 'ai-media-automation' && scopeValid(g.scope) && windowValid(g.enrollment) &&
  g.enrollment.endMs > g.enrollment.startMs
const requestValid = (w: Window, nowMs: number, maxMs: number) =>
  windowValid(w) && time(nowMs) && w.endMs <= nowMs && w.endMs-w.startMs <= maxMs
const inEnrollment = (w: Window, g: Gate) =>
  w.startMs >= g.enrollment.startMs && w.endMs < g.enrollment.endMs
const metric = (n: unknown): n is number | null | undefined =>
  n === null || n === undefined || (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
const fields = (s: Scope) => ({ projectId:s.projectId, bindingId:s.bindingId, accountId:s.accountId, platform:'instagram' as const })

/** Called only after existing channel persistence succeeds. A first-attempt
 * response is necessary but not sufficient to establish original publication.
 * Do not use channelCompletedAt, shared published_at, or a recovery timestamp.
 * Read is lazy so disabled mode does not access provider result or scope data.
 */
export function prepareInstagramPublicationCandidate(gate: Gate | null | undefined, read: () => PublicationEvent) {
  if (gate?.enabled !== true) return refuse('disabled')
  try {
    if (!gateValid(gate)) return refuse('invalid_scope')
    const e = read()
    if (!scopeMatch(e,gate.scope)) return refuse('invalid_scope')
    if (e.origin !== 'existing_media_publish_response' || e.dispatchAttempts !== 1 ||
        e.dryRun !== false || e.recovered !== false || e.skipped !== false ||
        e.needsVerification !== false || e.previousMediaId !== null) return refuse('untrusted_origin')
    if (!uuid(e.scriptId) || !identifier(e.mediaId) || !identifier(e.acquisitionId) ||
        e.persistedMediaId !== e.mediaId) return refuse('invalid_identity')
    if (!requestValid(e.request,e.nowMs,MAX_PUBLICATION_INTERVAL_MS)) return refuse('invalid_interval')
    if (!inEnrollment(e.request,gate)) return refuse('outside_enrollment')
    const candidate: PublicationCandidate = Object.freeze({
      kind:'publication_interval_candidate', evidence:'unverified_local_interval',
      ...fields(gate.scope), scriptId:e.scriptId, mediaId:e.mediaId, acquisitionId:e.acquisitionId,
      startMs:e.request.startMs, endMs:e.request.endMs,
    })
    return { status:'candidate_only' as const, candidate, authorizesPilot:false as const, authorizesPublication:false as const }
  } catch { return refuse('unavailable') }
}

/** Use the same-response normalized metrics from the existing fetch, not its
 * mutable cache. The interval arithmetic only describes LOCAL acquisition ages.
 * For every possible publication/measurement instant, age must fit 48–54h:
 * lower = acquisition start - publication end; upper = acquisition end - publication start.
 * Even when it fits, actual provenance and provider metric freshness are unverified.
 * Caller-supplied candidate is not authenticated by this check.
 */
export function prepareInstagramMeasurementCandidate(
  gate: Gate | null | undefined, publication: PublicationCandidate | null, read: () => MeasurementEvent,
) {
  if (gate?.enabled !== true) return refuse('disabled')
  try {
    if (!gateValid(gate)) return refuse('invalid_scope')
    if (!publication || publication.kind!=='publication_interval_candidate' ||
        publication.evidence!=='unverified_local_interval' || !scopeMatch(publication,gate.scope) ||
        !uuid(publication.scriptId) || !identifier(publication.mediaId) ||
        !identifier(publication.acquisitionId) ||
        !windowValid(publication) || publication.endMs-publication.startMs>MAX_PUBLICATION_INTERVAL_MS ||
        !inEnrollment(publication,gate)) return refuse('invalid_identity')
    const e=read()
    if (!scopeMatch(e,gate.scope)) return refuse('invalid_scope')
    if (e.scriptId!==publication.scriptId || e.mediaId!==publication.mediaId ||
        !identifier(e.acquisitionId) || e.acquisitionId===publication.acquisitionId) return refuse('invalid_identity')
    if (e.origin!=='existing_insights_response' || e.singleResponseMetrics!==true ||
        e.result?.ok!==true || !e.result.metrics || typeof e.result.metrics!=='object' ||
        Array.isArray(e.result.metrics)) return refuse('untrusted_origin')
    if (!requestValid(e.request,e.nowMs,MAX_MEASUREMENT_INTERVAL_MS) ||
        e.request.startMs<publication.endMs) return refuse('invalid_interval')
    const lowerAgeMs=e.request.startMs-publication.endMs
    const upperAgeMs=e.request.endMs-publication.startMs
    if (lowerAgeMs<MIN_AGE || upperAgeMs>MAX_AGE) return refuse('outside_age_window')
    const m: MediaInsight=e.result.metrics
    const {views,reach,saved,shares}=m
    if (![views,reach,saved,shares].every(metric)) return refuse('invalid_metrics')
    // No recordedAt: durable availability must come from the actual store.
    return {
      status:'candidate_only' as const,
      candidate:Object.freeze({
        kind:'measurement_interval_candidate' as const, evidence:'unverified_local_interval' as const,
        ...fields(gate.scope), scriptId:e.scriptId, mediaId:e.mediaId,
        publicationAcquisitionId:publication.acquisitionId, acquisitionId:e.acquisitionId,
        requestStartMs:e.request.startMs, responseEndMs:e.request.endMs,
        lowerAgeMs,upperAgeMs,views:views??null,reach:reach??null,saves:saved??null,shares:shares??null,
        providerFreshness:'unknown' as const, requiresTrustedSource:true as const,
      }),
      authorizesPilot:false as const, authorizesPublication:false as const,
    }
  } catch { return refuse('unavailable') }
}