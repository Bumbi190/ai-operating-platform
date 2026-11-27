/**
 * Offline dashboard projection for future Atlas Operations integration.
 * NOT an authentication or data-fetching boundary. Only a server-side caller
 * with independently authorized project/account/brand binding may supply data.
 * This candidate is not wired into the existing page or reader.
 */
import { assessInstagramObservationQuality, type InstagramObservation } from './instagram-observation-quality'
import { summarizeReferenceFormat } from './reference-format-observations'
import { assessCreativeQuality } from './creative-quality-advisory'
import { assessManualInstagramExperiment } from './manual-experiment-advisory'
import { BASELINE_MIN_POSTS, TARGET_COMPARISON_AGE_HOURS } from './instagram-experiments'
import type { GrowthBrand } from './instagram-metrics'

type Scope = { projectId: string; accountId: string; brand: GrowthBrand }
type Inputs = {
  observations?: readonly InstagramObservation[]
  reference?: { capture: Parameters<typeof summarizeReferenceFormat>[1]; observations: Parameters<typeof summarizeReferenceFormat>[2] }
  creative?: Parameters<typeof assessCreativeQuality>[1]
  experiment?: { experimentId: string; labels: Parameters<typeof assessManualInstagramExperiment>[1]; snapshots: Parameters<typeof assessManualInstagramExperiment>[2] }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const absent = () => ({ status: 'not_supplied' as const })
export function projectGrowthDashboard(
  allowedProjectIds: readonly string[], scope: Scope, input: Inputs, nowMs: number,
) {
  // Deny without inspecting the payload. This is a supplemental scope check,
  // not proof that caller-supplied allowedProjectIds is authentic.
  if (!Array.isArray(allowedProjectIds) || !scope || !id(scope.projectId) ||
      !allowedProjectIds.includes(scope.projectId)) return null
  if (typeof scope.accountId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(scope.accountId) ||
      (scope.brand !== 'the-prompt' && scope.brand !== 'familje-stunden') ||
      !input || typeof input !== 'object' || Array.isArray(input) ||
      !Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('Invalid dashboard scope or input')
  const accountScope = { projectId: scope.projectId, accountId: scope.accountId }
  const rows = input.observations
  if (rows !== undefined && (!Array.isArray(rows) || rows.length > 200)) throw new Error('Invalid dashboard observations')
  const a = rows === undefined ? null : assessInstagramObservationQuality(accountScope, rows, {
    nowMs, minAgeHours: TARGET_COMPARISON_AGE_HOURS,
    maxAgeHours: TARGET_COMPARISON_AGE_HOURS + 6, freshnessHours: 7 * 24, minimumPosts: BASELINE_MIN_POSTS,
  })
  const r = input.reference === undefined ? null : summarizeReferenceFormat(scope.projectId, input.reference.capture, input.reference.observations)
  const q = input.creative === undefined ? null : assessCreativeQuality(
    { projectId: scope.projectId, revisionId: input.creative.revisionId }, input.creative)
  const e = input.experiment === undefined ? null : assessManualInstagramExperiment(
    { ...accountScope, brand: scope.brand, experimentId: input.experiment.experimentId },
    input.experiment.labels, input.experiment.snapshots, nowMs)
  const comparison = e?.review
  // Never forward source identifiers, raw rows, arbitrary payload text, or
  // comparator notes that imply independent verification.
  return {
    mode: 'offline_advisory' as const,
    evidence: 'caller_attested_not_independently_verified' as const,
    brand: scope.brand,
    analytics: a === null ? absent() : {
      status: 'assessed' as const, totalPosts: a.totalPosts, matchedAge: a.matchedAge,
      viewsSample: a.viewSamplePostIds.length, engagementSample: a.engagementRateSamplePostIds.length,
      freshness: a.freshness, exclusions: a.exclusions,
      missingViewsAtMatchedAge: a.missingViewsAtMatchedAge, rateIneligibleAtMatchedAge: a.rateIneligibleAtMatchedAge,
    },
    reference: r === null ? absent() : {
      status: 'assessed' as const, capturedFrames: r.capturedFrameCount,
      reviewedFrames: r.frameCountWithRecordedObservations,
      hypotheses: r.features.map(f => ({ feature: f.feature, hypothesis: f.hypothesis })),
      audioEvidence: r.audioEvidence, performanceEvidence: r.performanceEvidence, rightsStatus: r.rightsStatus,
    },
    quality: q === null ? absent() : {
      status: 'assessed' as const, assessedCount: q.assessedCount, totalCriteria: q.totalCriteria,
      advisoryPoints: q.advisoryPoints, maximumPoints: q.maximumPoints,
      criteria: q.criteria.map(c => ({ criterion: c.criterion, rating: c.rating })),
      reportedExistingGate: q.reportedExistingGate, factualReviewConcern: q.factualReviewConcern,
    },
    learning: !e || !comparison ? absent() : {
      status: 'assessed' as const, comparisonStatus: comparison.status, rosterSize: e.rosterSize,
      eligibleCount: e.eligibleCount, freshness: e.freshness,
      aPosts: comparison.aPosts, bPosts: comparison.bPosts,
      rates: comparison.status === 'descriptive' ? {
        aSaveRate: comparison.aSaveRate, bSaveRate: comparison.bSaveRate,
        aShareRate: comparison.aShareRate, bShareRate: comparison.bShareRate,
      } : null,
    },
    requiresHumanReview: true as const,
    authorizesPublication: false as const,
    predictsPerformance: false as const,
  }
}
