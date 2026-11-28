/**
 * Offline, caller-attested creative quality rubric. Not a prediction,
 * factual verification, release gate, or authorization. Keep the existing
 * media quality evaluator and all project-specific gates authoritative.
 */
export const CREATIVE_RUBRIC_VERSION = 'creative-quality-advisory-v1' as const
export const CREATIVE_CRITERIA = Object.freeze({
  hook: Object.freeze({ evidence: 'opening_review', check: 'Opening identifies a concrete subject and viewer stakes.' } as const),
  clarity: Object.freeze({ evidence: 'script_review', check: 'Message and sequence are understandable without unnecessary complexity.' } as const),
  relevance: Object.freeze({ evidence: 'brief_review', check: 'Content fits the approved audience, project brief and purpose.' } as const),
  cta: Object.freeze({ evidence: 'brief_review', check: 'Any call to action is truthful and brief-appropriate; no CTA is acceptable when appropriate.' } as const),
  visual_readability: Object.freeze({ evidence: 'render_review', check: 'Rendered text and focal subject are readable in the intended viewing format.' } as const),
  source_support: Object.freeze({ evidence: 'source_review', check: 'Material claims are supported by the reviewed source; no invented proof.' } as const),
} as const)
export type CreativeCriterion = keyof typeof CREATIVE_CRITERIA
type EvidenceKind = typeof CREATIVE_CRITERIA[CreativeCriterion]['evidence']
type Rating = 'needs_work' | 'partial' | 'meets' | 'unknown'
type ReviewStatus = 'reported_pass' | 'reported_block' | 'unknown'
type Scope = { projectId: string; revisionId: string }
type Assessment = Scope & { criterion: CreativeCriterion; rating: Rating; evidence: EvidenceKind | null }
type Input = Scope & { assessments: readonly Assessment[]; existingGate: ReviewStatus }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const keys = Object.keys(CREATIVE_CRITERIA) as CreativeCriterion[]
const points = { needs_work: 0, partial: 1, meets: 2 } as const
function validScope(s: Scope): boolean {
  return !!s && typeof s.projectId === 'string' && UUID.test(s.projectId)
    && typeof s.revisionId === 'string' && UUID.test(s.revisionId)
}
function sameScope(a: Scope, b: Scope): boolean {
  return validScope(a) && a.projectId === b.projectId && a.revisionId === b.revisionId
}

/**
 * Caller must independently bind opaque IDs to the authorized project and
 * exact artifact revision, and attest the relevant review actually occurred.
 * No trust is established merely by an ID, evidence label, or reported gate.
 * Equal-weight ordinal points are descriptive; do not compare as performance.
 */
export function assessCreativeQuality(expected: Scope, input: Input) {
  if (!validScope(expected) || !sameScope(input, expected)) throw new Error('Invalid or mixed creative scope')
  if (!['reported_pass', 'reported_block', 'unknown'].includes(input.existingGate)) {
    throw new Error('Invalid reported gate status')
  }
  if (!Array.isArray(input.assessments) || input.assessments.length > keys.length) {
    throw new Error('Invalid assessment collection')
  }
  const ratings = new Map<CreativeCriterion, Rating>()
  for (const a of input.assessments as readonly Assessment[]) {
    if (!sameScope(a, expected)) throw new Error('Invalid or mixed assessment scope')
    if (typeof a.criterion !== 'string' || !Object.hasOwn(CREATIVE_CRITERIA, a.criterion)
      || ratings.has(a.criterion)) throw new Error('Invalid or duplicate criterion')
    if (!['needs_work', 'partial', 'meets', 'unknown'].includes(a.rating)) throw new Error('Invalid rating')
    if (a.evidence !== (a.rating === 'unknown' ? null : CREATIVE_CRITERIA[a.criterion].evidence)) {
      throw new Error('Wrong evidence kind for criterion')
    }
    ratings.set(a.criterion, a.rating)
  }
  const criteria = keys.map(criterion => {
    const rating = ratings.get(criterion) ?? 'unknown'
    return {
      criterion, rating, points: rating === 'unknown' ? null : points[rating],
      reviewCheck: CREATIVE_CRITERIA[criterion].check,
      evidenceKind: rating === 'unknown' ? null : CREATIVE_CRITERIA[criterion].evidence,
    }
  })
  const assessedCount = criteria.filter(c => c.points !== null).length
  const sourceRating = ratings.get('source_support') ?? 'unknown'
  return {
    version: CREATIVE_RUBRIC_VERSION,
    projectId: expected.projectId, revisionId: expected.revisionId,
    evidenceTrust: 'caller_attested' as const,
    criteria, assessedCount, totalCriteria: keys.length,
    // No extrapolation or imputation from partial evidence.
    advisoryPoints: assessedCount === keys.length ? criteria.reduce((sum, c) => sum + (c.points ?? 0), 0) : null,
    maximumPoints: 12,
    reportedExistingGate: input.existingGate,
    // Conservative indicator: unknown or blocked reported gates also raise concern.
    factualReviewConcern: sourceRating !== 'meets' || input.existingGate !== 'reported_pass',
    purpose: 'editorial_advice_only' as const,
    authorizesPublication: false as const,
    predictsPerformance: false as const,
  }
}
