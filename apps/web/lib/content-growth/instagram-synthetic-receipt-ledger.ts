/**
 * Unmounted, in-memory SYNTHETIC retention model. No persistence, I/O, provider
 * provenance, trusted clock, authentication, database transaction or pilot authority.
 * The complete roster, exact observation timestamps and availability clock below
 * are fixture assertions ONLY. Unknown/interval-only timestamps are not promoted.
 * Reuse the existing fixed-age selector; never create production observations.
 */
import { selectSyntheticFixedAgeEvidence } from './instagram-fixed-age-evidence'
import { TARGET_COMPARISON_AGE_HOURS } from './instagram-experiments'

type Scope = Parameters<typeof selectSyntheticFixedAgeEvidence>[0]
type Receipt = Parameters<typeof selectSyntheticFixedAgeEvidence>[2][number]
type Enrollment = Scope & Readonly<{
  entryId: string
  state: 'published' | 'cancelled' | 'unpublished' | 'planned'
  postId: string | null
  publishedAtMs: number | null
}>
type Retained = Readonly<{ receipt: Receipt; recordedAtMs: number }>
type AppendStatus = 'retained' | 'replay' | 'not_eligible' | 'after_cutoff' | 'sealed'

const HOUR = 3_600_000
const MAX_AGE = (TARGET_COMPARISON_AGE_HOURS + 6) * HOUR
const MIN_AGE = TARGET_COMPARISON_AGE_HOURS * HOUR
const MAX_ENTRIES = 200
const MAX_RECEIPTS = 800
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(x)
const time = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const metric = (x: unknown) => x === null || time(x)
const validScope = (s: Scope) => !!s && id(s.projectId) && id(s.accountId) && id(s.bindingId)
const sameScope = (s: Scope, expected: Scope) =>
  validScope(s) && s.projectId === expected.projectId && s.accountId === expected.accountId && s.bindingId === expected.bindingId

/**
 * Simulate retention against a fixed, already reconciled synthetic roster.
 * Unresolved planned entries or unknown publication timestamps block creation.
 * No enrollment mutation or early finalization. The final availability cutoff
 * is last actual published time +54h (or enrollment end for an empty cohort).
 * Finalization requires enrollment closed AND strictly after inclusive cutoff.
 * This is NOT proof that the supplied roster is complete or the clock genuine.
 */
export function createSyntheticReceiptLedger(
  inputScope: Scope, enrollment: readonly Enrollment[], startMs: number, endMs: number,
) {
  if (!validScope(inputScope) || !time(startMs) || !time(endMs) || endMs <= startMs ||
      !Array.isArray(enrollment) || enrollment.length > MAX_ENTRIES) {
    throw new Error('Invalid synthetic ledger scope or enrollment window')
  }
  const scope = Object.freeze({ projectId: inputScope.projectId, accountId: inputScope.accountId, bindingId: inputScope.bindingId })
  const entryIds = new Set<string>()
  const published = new Map<string, number>()
  const roster: Enrollment[] = []
  for (const e of enrollment as readonly Enrollment[]) {
    if (!sameScope(e, scope) || !id(e.entryId) || entryIds.has(e.entryId)) throw new Error('Invalid, duplicate or mixed enrollment')
    entryIds.add(e.entryId)
    if (e.state === 'published') {
      if (!id(e.postId) || published.has(e.postId) || !time(e.publishedAtMs) ||
          e.publishedAtMs < startMs || e.publishedAtMs >= endMs) {
        throw new Error('Published entry requires unique post and known original time within enrollment')
      }
      published.set(e.postId, e.publishedAtMs)
    } else if ((e.state !== 'cancelled' && e.state !== 'unpublished') ||
        e.postId !== null || e.publishedAtMs !== null) {
      throw new Error('Unreconciled or invalid enrollment entry')
    }
    roster.push(Object.freeze({ ...scope, entryId: e.entryId, state: e.state, postId: e.postId, publishedAtMs: e.publishedAtMs }))
  }
  const cutoffMs = published.size ? Math.max(...published.values()) + MAX_AGE : endMs
  if (!time(cutoffMs) || cutoffMs === Number.MAX_SAFE_INTEGER) throw new Error('Invalid evidence cutoff')
  const retained = new Map<string, Retained>()
  let lastClock = startMs
  let halt: 'conflicting_replay' | 'capacity_exceeded' | null = null
  let sealed: ReturnType<typeof buildReport> | null = null

  function advanceClock(at: number) {
    if (!time(at) || at < lastClock) throw new Error('Invalid or backwards simulated availability clock')
    lastClock = at
  }

  function append(input: Receipt, recordedAtMs: number): AppendStatus {
    advanceClock(recordedAtMs)
    if (sealed) return 'sealed'
    if (halt) throw new Error('Synthetic ledger halted: ' + halt)
    if (!sameScope(input, scope) || !id(input.receiptId) || !id(input.postId) ||
        !published.has(input.postId) || !['synthetic_refresh', 'cache_only', 'account_level'].includes(input.origin) ||
        ![input.views, input.reach, input.saves, input.shares].every(metric) ||
        (input.publishedAtMs !== null && !time(input.publishedAtMs)) ||
        (input.observedAtMs !== null && (!time(input.observedAtMs) || input.observedAtMs > recordedAtMs))) {
      throw new Error('Invalid or mixed synthetic receipt')
    }
    // Fixed field set; no raw payload or arbitrary extra metadata is retained.
    const r: Receipt = Object.freeze({
      ...scope, receiptId: input.receiptId, postId: input.postId, origin: input.origin,
      publishedAtMs: input.publishedAtMs, observedAtMs: input.observedAtMs,
      views: input.views, reach: input.reach, saves: input.saves, shares: input.shares,
    })
    const prior = retained.get(r.receiptId)
    if (prior) {
      // recordedAt is assigned by this simulated store. Exact acquisition replay
      // cannot overwrite the first availability time or consume more capacity.
      if (JSON.stringify(prior.receipt) === JSON.stringify(r)) return 'replay'
      halt = 'conflicting_replay'
      throw new Error('Conflicting acquisition replay; ledger halted')
    }
    if (recordedAtMs > cutoffMs) return 'after_cutoff'
    if (r.origin !== 'synthetic_refresh' || r.publishedAtMs === null || r.observedAtMs === null) return 'not_eligible'
    if (r.publishedAtMs !== published.get(r.postId) || r.observedAtMs < r.publishedAtMs) {
      throw new Error('Conflicting original publication or observation time')
    }
    const age = r.observedAtMs - r.publishedAtMs
    if (age < MIN_AGE || age > MAX_AGE) return 'not_eligible'
    if (retained.size >= MAX_RECEIPTS) {
      halt = 'capacity_exceeded'
      throw new Error('Synthetic receipt cap reached; ledger halted')
    }
    retained.set(r.receiptId, Object.freeze({ receipt: r, recordedAtMs }))
    return 'retained'
  }

  function buildReport() {
    const selected = selectSyntheticFixedAgeEvidence(scope,
      [...published].map(([postId, publishedAtMs]) => ({ ...scope, postId, publishedAtMs })),
      [...retained.values()].map(r => r.receipt), cutoffMs, lastClock)
    const posts = Object.freeze(selected.posts.map(p => Object.freeze({
      ...p, candidate: p.candidate && Object.freeze({ ...p.candidate }),
      recordedAtMs: p.candidate ? retained.get(p.candidate.receiptId)!.recordedAtMs : null,
    })))
    return Object.freeze({
      mode: 'synthetic_memory_only' as const, evidence: 'not_verified' as const,
      cutoffMs, finalizedAtMs: lastClock,
      // Reconciled caller-supplied roster, not independently proven completeness.
      roster: Object.freeze([...roster]), posts,
      publishedCount: published.size,
      cancelledCount: roster.filter(e => e.state === 'cancelled').length,
      unpublishedCount: roster.filter(e => e.state === 'unpublished').length,
      retainedCount: retained.size, selectedCount: selected.selectedCount,
      requiresTrustedSource: true as const, authorizesPilot: false as const, authorizesPublication: false as const,
    })
  }

  function finalize(atMs: number) {
    advanceClock(atMs)
    if (sealed) return sealed
    if (halt) throw new Error('Synthetic ledger halted: ' + halt)
    if (atMs < endMs || atMs <= cutoffMs) throw new Error('Enrollment or inclusive evidence window not closed')
    sealed = buildReport()
    return sealed
  }

  // No raw maps/arrays escape; this is intentionally single-process only.
  return Object.freeze({ cutoffMs, append, finalize })
}