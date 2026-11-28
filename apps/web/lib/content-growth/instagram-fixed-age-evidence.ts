/**
 * Synthetic-only prototype for retaining and selecting fixed-age Instagram evidence.
 *
 * This is NOT a collector, store, authorization boundary or proof of provenance.
 * No live adapter may label a cache row as a refresh receipt. A future separately
 * approved server integration must establish original publication time, account/
 * binding at capture, provider measurement time and append-only receipt provenance.
 * This module does not emit caller_attested_provider_snapshot or dashboard inputs.
 */
import { TARGET_COMPARISON_AGE_HOURS } from './instagram-experiments'

const HOUR = 3_600_000
const MIN_AGE = TARGET_COMPARISON_AGE_HOURS * HOUR
const MAX_AGE = (TARGET_COMPARISON_AGE_HOURS + 6) * HOUR
const MAX_POSTS = 200
const MAX_RECEIPTS = 800
const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v)
const time = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const metric = (v: unknown): v is number | null => v === null || time(v)

type Scope = Readonly<{ projectId: string; accountId: string; bindingId: string }>
type EnrolledPost = Scope & Readonly<{ postId: string; publishedAtMs: number | null }>
type Receipt = Scope & Readonly<{
  receiptId: string
  postId: string
  origin: 'synthetic_refresh' | 'cache_only' | 'account_level'
  publishedAtMs: number | null
  observedAtMs: number | null
  views: number | null
  reach: number | null
  saves: number | null
  shares: number | null
}>
type Selection = Readonly<{
  receiptId: string
  publishedAtMs: number
  observedAtMs: number
  views: number | null
  reach: number | null
  saves: number | null
  shares: number | null
}>
type PostResult = Readonly<{
  postId: string
  status: 'selected_candidate' | 'publication_time_unknown' |
    'window_not_complete' | 'missing_at_cutoff' | 'ambiguous_earliest'
  candidate: Selection | null
}>
const validScope = (s: Scope): boolean =>
  !!s && id(s.projectId) && id(s.accountId) && id(s.bindingId)
const sameScope = (a: Scope, b: Scope): boolean =>
  validScope(a) && a.projectId === b.projectId && a.accountId === b.accountId && a.bindingId === b.bindingId

/**
 * Input is a complete caller-supplied synthetic roster of actually published posts
 * (not A/B assignments). Planned/cancelled entries require separate reconciliation.
 * Cutoff is explicit, inclusive and no later than the synthetic evaluation clock.
 * Select the earliest in-window receipt, irrespective of metric values or input order.
 * Equal earliest timestamps are ambiguous; don't pick a convenient winner.
 * Unknown metrics remain null. Every enrolled post appears in the result.
 * No conversion to production observations or authorization is performed.
 */
export function selectSyntheticFixedAgeEvidence(
  scope: Scope,
  enrolled: readonly EnrolledPost[],
  receipts: readonly Receipt[],
  cutoffMs: number,
  evaluatedAtMs: number,
) {
  if (!validScope(scope) || !time(cutoffMs) || !time(evaluatedAtMs) || cutoffMs > evaluatedAtMs) {
    throw new Error('Invalid synthetic evidence scope or clock')
  }
  if (!Array.isArray(enrolled) || enrolled.length > MAX_POSTS ||
      !Array.isArray(receipts) || receipts.length > MAX_RECEIPTS) {
    throw new Error('Invalid synthetic evidence collection')
  }

  const roster = new Map<string, EnrolledPost>()
  for (const post of enrolled as readonly EnrolledPost[]) {
    if (!sameScope(post, scope) || !id(post.postId) || roster.has(post.postId) ||
        (post.publishedAtMs !== null && (!time(post.publishedAtMs) || post.publishedAtMs > cutoffMs))) {
      throw new Error('Invalid, duplicate or mixed enrolled post')
    }
    roster.set(post.postId, post)
  }

  const seen = new Set<string>()
  const matches = new Map<string, Receipt[]>()
  const excluded = { untrustedOrigin: 0, unknownTime: 0, outsideAge: 0, afterCutoff: 0 }
  for (const receipt of receipts as readonly Receipt[]) {
    if (!sameScope(receipt, scope) || !id(receipt.receiptId) || seen.has(receipt.receiptId) ||
        !id(receipt.postId) || !roster.has(receipt.postId) ||
        !['synthetic_refresh', 'cache_only', 'account_level'].includes(receipt.origin)) {
      throw new Error('Invalid, duplicate or mixed synthetic receipt')
    }
    seen.add(receipt.receiptId)
    if (![receipt.views, receipt.reach, receipt.saves, receipt.shares].every(metric) ||
        (receipt.publishedAtMs !== null && !time(receipt.publishedAtMs)) ||
        (receipt.observedAtMs !== null && (!time(receipt.observedAtMs) || receipt.observedAtMs > evaluatedAtMs))) {
      throw new Error('Invalid synthetic receipt metrics or time')
    }
    if (receipt.origin !== 'synthetic_refresh') {
      excluded.untrustedOrigin++
      continue
    }
    const post = roster.get(receipt.postId)!
    // A receipt must agree with the independently supplied publication record.
    // A conflicting known publication time is an integrity failure, not a filter.
    if (receipt.publishedAtMs !== null && post.publishedAtMs !== null &&
        receipt.publishedAtMs !== post.publishedAtMs) {
      throw new Error('Conflicting synthetic publication time')
    }
    if (receipt.publishedAtMs === null || receipt.observedAtMs === null || post.publishedAtMs === null) {
      excluded.unknownTime++
      continue
    }
    if (receipt.observedAtMs < post.publishedAtMs) throw new Error('Observation before publication')
    if (receipt.observedAtMs > cutoffMs) {
      excluded.afterCutoff++
      continue
    }
    const age = receipt.observedAtMs - post.publishedAtMs
    if (age < MIN_AGE || age > MAX_AGE) {
      excluded.outsideAge++
      continue
    }
    const list = matches.get(receipt.postId) ?? []
    list.push(receipt)
    matches.set(receipt.postId, list)
  }

  const posts: PostResult[] = []
  for (const [postId, post] of roster) {
    const eligible = matches.get(postId) ?? []
    if (post.publishedAtMs === null) {
      posts.push({ postId, status: 'publication_time_unknown', candidate: null })
    } else if (!eligible.length) {
      posts.push({ postId, status: cutoffMs - post.publishedAtMs < MAX_AGE
        ? 'window_not_complete' : 'missing_at_cutoff', candidate: null })
    } else {
      // Non-null by the eligibility checks above.
      const earliest = Math.min(...eligible.map(r => r.observedAtMs!))
      const first = eligible.filter(r => r.observedAtMs === earliest)
      if (first.length !== 1) {
        posts.push({ postId, status: 'ambiguous_earliest', candidate: null })
        continue
      }
      const r = first[0]
      posts.push({ postId, status: 'selected_candidate', candidate: {
        receiptId: r.receiptId, publishedAtMs: post.publishedAtMs, observedAtMs: earliest,
        views: r.views, reach: r.reach, saves: r.saves, shares: r.shares,
      } })
    }
  }

  return {
    mode: 'synthetic_only' as const,
    evidence: 'not_verified' as const,
    posts,
    enrolledCount: roster.size,
    selectedCount: posts.filter(p => p.status === 'selected_candidate').length,
    excluded,
    requiresTrustedSource: true as const,
    authorizesPilot: false as const,
    authorizesPublication: false as const,
  }
}