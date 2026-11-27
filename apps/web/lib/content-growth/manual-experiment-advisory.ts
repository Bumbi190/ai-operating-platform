/**
 * Offline, manually labelled experiment adapter. The authorized caller must
 * independently bind the brand, project, account, experiment, roster and
 * provider snapshots. These labels are assertions, not authorization or proof.
 * Reuses the observation gate and existing descriptive A/B comparator.
 */
import {
  assessInstagramObservationQuality,
  type InstagramObservation,
  type InstagramObservationScope,
} from './instagram-observation-quality'
import {
  EVALUATION_MIN_PER_VARIANT,
  TARGET_COMPARISON_AGE_HOURS,
  reviewInstagramVariants,
  type InstagramVariantObservation,
} from './instagram-experiments'
import type { GrowthBrand } from './instagram-metrics'

type ExperimentScope = InstagramObservationScope & Readonly<{
  brand: GrowthBrand
  experimentId: string
}>
type ManualVariantLabel = ExperimentScope & Readonly<{
  postId: string
  variant: 'A' | 'B'
  source: 'caller_attested_manual_label'
}>

const MAX_POSTS = 200
const HOUR_MS = 3_600_000
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(id)

export function assessManualInstagramExperiment(
  scope: ExperimentScope,
  labels: readonly ManualVariantLabel[],
  snapshots: readonly InstagramObservation[],
  nowMs: number,
) {
  if (!scope || !validId(scope.projectId) || !validId(scope.accountId) ||
      !validId(scope.experimentId) ||
      (scope.brand !== 'the-prompt' && scope.brand !== 'familje-stunden')) {
    throw new Error('Invalid experiment scope')
  }
  if (!Array.isArray(labels) || !Array.isArray(snapshots) ||
      labels.length > MAX_POSTS || snapshots.length > MAX_POSTS ||
      labels.length !== snapshots.length) {
    throw new Error('Invalid or incomplete experiment roster')
  }
  const byPost = new Map<string, 'A' | 'B'>()
  for (const label of labels) {
    if (!label || label.projectId !== scope.projectId ||
        label.accountId !== scope.accountId || label.brand !== scope.brand ||
        label.experimentId !== scope.experimentId ||
        label.source !== 'caller_attested_manual_label' ||
        !validId(label.postId) || byPost.has(label.postId) ||
        (label.variant !== 'A' && label.variant !== 'B')) {
      throw new Error('Invalid, duplicate or mixed manual label')
    }
    byPost.set(label.postId, label.variant)
  }
  for (const snapshot of snapshots) {
    if (!snapshot || !validId(snapshot.postId) || !byPost.has(snapshot.postId)) {
      throw new Error('Snapshot outside labelled roster')
    }
  }
  const coverage = assessInstagramObservationQuality(scope, snapshots, {
    nowMs,
    minAgeHours: TARGET_COMPARISON_AGE_HOURS,
    maxAgeHours: TARGET_COMPARISON_AGE_HOURS + 6,
    freshnessHours: 7 * 24,
    minimumPosts: EVALUATION_MIN_PER_VARIANT * 2,
  })
  const eligible = new Set(coverage.engagementRateSamplePostIds)
  // Never silently discard a bad measurement from an assigned roster.
  // The existing comparator will withhold rates if any row is ineligible.
  const rows: InstagramVariantObservation[] = snapshots.map(row => ({
    postId: row.postId,
    brand: scope.brand,
    variant: byPost.get(row.postId)!,
    measuredAtAgeHours: eligible.has(row.postId)
      ? (row.observedAtMs! - row.publishedAtMs!) / HOUR_MS : null,
    reach: row.reach,
    saves: row.saves,
    shares: row.shares,
  }))
  // Prevent imprecise pooled integer counts in the existing comparator.
  // No need to aggregate ineligible rows because rates will be withheld.
  if (eligible.size === rows.length) {
    for (const variant of ['A', 'B'] as const) {
      for (const metric of ['reach', 'saves', 'shares'] as const) {
        let total = 0
        for (const row of rows) {
          if (row.variant !== variant) continue
          total += row[metric]!
          if (!Number.isSafeInteger(total)) throw new Error('Unsafe pooled count')
        }
      }
    }
  }
  return {
    evidence: 'caller_attested_not_independently_verified' as const,
    review: reviewInstagramVariants(scope.brand, rows),
    rosterSize: rows.length,
    eligibleCount: eligible.size,
    freshness: coverage.freshness,
    // Historical fixed-age measurements may be comparable without being fresh.
    requiresHumanReview: true as const,
    authorizesPublication: false as const,
    performancePrediction: false as const,
  }
}
