/**
 * Offline evidence gate for comparable Instagram observations.
 *
 * This is not an authorization check or a source of provider data. A trusted,
 * already authorized caller must establish account/project ownership and
 * publication/measurement provenance before marking a row caller_attested_provider_snapshot.
 * A mutable media_insights cache row alone cannot establish that provenance.
 * The source label is a caller assertion, NOT independent proof.
 * No I/O, predictions, selection of experiment winners or publication.
 */
export type InstagramObservationScope = Readonly<{
  projectId: string
  accountId: string
}>

export type InstagramObservation = InstagramObservationScope & Readonly<{
  postId: string
  source: 'caller_attested_provider_snapshot' | 'cache_only'
  // UTC epoch milliseconds from independently verified sources; null if unknown.
  publishedAtMs: number | null
  observedAtMs: number | null
  views: number | null
  reach: number | null
  saves: number | null
  shares: number | null
}>

export type InstagramObservationPolicy = Readonly<{
  nowMs: number
  minAgeHours: number
  maxAgeHours: number
  freshnessHours: number
  minimumPosts: number
}>

const HOUR_MS = 3_600_000
const validTime = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
const validId = (id: unknown): id is string =>
  typeof id === 'string' && id.length > 0 && id.trim() === id
const validHours = (n: number) =>
  Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER / HOUR_MS

/**
 * The caller chooses the same age window for every post (e.g. existing
 * experiment window 48â€“54h) and minimum sample. Freshness of a verified
 * observation is separate from measurement age: an older fixed-age snapshot
 * is still comparable, but must not be presented as current live data.
 * This gate returns coverage and sample IDs, not another median/rate model.
 * Meeting a pooled sample minimum is NOT readiness for an A/B comparison.
 * The existing variant comparator must still validate labels and per-variant
 * minimums. Rate-ineligible includes measured zero reach, not just missing data.
 */
export function assessInstagramObservationQuality(
  scope: InstagramObservationScope,
  observations: readonly InstagramObservation[],
  policy: InstagramObservationPolicy,
) {
  if (!validId(scope.projectId) || !validId(scope.accountId)) {
    throw new Error('Invalid Instagram observation scope')
  }
  if (!validTime(policy.nowMs) || !validHours(policy.minAgeHours) ||
      !validHours(policy.maxAgeHours) || policy.maxAgeHours < policy.minAgeHours ||
      !validHours(policy.freshnessHours) || !Number.isSafeInteger(policy.minimumPosts) ||
      policy.minimumPosts < 1) {
    throw new Error('Invalid Instagram observation policy')
  }

  const ids = new Set<string>()
  const viewSamplePostIds: string[] = []
  const engagementRateSamplePostIds: string[] = []
  const exclusions = { unverifiedSource: 0, invalidTime: 0, outsideAgeWindow: 0 }
  const freshness = { fresh: 0, stale: 0, unknown: 0 }
  let matchedAge = 0
  let missingViewsAtMatchedAge = 0
  let rateIneligibleAtMatchedAge = 0

  for (const row of observations) {
    if (row.projectId !== scope.projectId || row.accountId !== scope.accountId) {
      throw new Error('Mixed Instagram observation scopes')
    }
    if (!validId(row.postId) || ids.has(row.postId)) {
      throw new Error('Invalid or duplicate Instagram observation post ID')
    }
    ids.add(row.postId)
    for (const n of [row.views, row.reach, row.saves, row.shares]) {
      if (n !== null && (!Number.isSafeInteger(n) || n < 0)) {
        throw new Error('Invalid Instagram observation metric')
      }
    }
    if (row.source !== 'caller_attested_provider_snapshot') {
      exclusions.unverifiedSource++
      freshness.unknown++
      continue
    }
    const published = row.publishedAtMs
    const observed = row.observedAtMs
    if (!validTime(published) || !validTime(observed) ||
        published > observed || observed > policy.nowMs) {
      exclusions.invalidTime++
      freshness.unknown++
      continue
    }
    if (policy.nowMs - observed <= policy.freshnessHours * HOUR_MS) {
      freshness.fresh++
    } else {
      freshness.stale++
    }
    const ageMs = observed - published
    if (ageMs < policy.minAgeHours * HOUR_MS ||
        ageMs > policy.maxAgeHours * HOUR_MS) {
      exclusions.outsideAgeWindow++
      continue
    }
    matchedAge++
    if (row.views === null) missingViewsAtMatchedAge++
    else viewSamplePostIds.push(row.postId)
    if (row.reach === null || row.reach === 0 ||
        row.saves === null || row.shares === null) {
      rateIneligibleAtMatchedAge++
    } else {
      engagementRateSamplePostIds.push(row.postId)
    }
  }

  return {
    totalPosts: observations.length,
    matchedAge,
    exclusions,
    freshness,
    missingViewsAtMatchedAge,
    rateIneligibleAtMatchedAge,
    viewSamplePostIds,
    engagementRateSamplePostIds,
    viewSampleMeetsMinimum: viewSamplePostIds.length >= policy.minimumPosts,
    engagementRateSampleMeetsMinimum: engagementRateSamplePostIds.length >= policy.minimumPosts,
  }
}
