/**
 * Canonical transport shapes for the Decision HTTP surface (EI-HTTP-DTO-01).
 *
 * The Decision authority binding includes the material structures below, so
 * their exact shape is what a human authorization is bound to. The domain's
 * `validateEvidence`, `validateSnapshot`, `validateAlternatives`,
 * `validateReview` and `validateOutcome` check selected properties and then
 * return the caller's original object or array — correct for trusted callers,
 * insufficient for HTTP.
 */
import type {
  DecisionAlternative, DecisionConfidence, DecisionEvidenceReference,
  DecisionEvidenceSnapshot, DecisionOutcome, DecisionOutcomeStatus,
  DecisionReviewCondition, DecisionReviewTrigger, MaterialityDomain,
} from '@/lib/atlas/decision-ledger/types'
import { arrayOf, bool, enumOf, f, objectOf, optNull, str, type Parser } from './canonicalize'

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const exact = <T extends true>(_ok: T) => undefined

const MATERIALITY = [
  'strategy', 'authority', 'autonomy', 'money', 'risk', 'customers', 'brand',
  'project_mode', 'roadmap', 'major_architecture', 'external_action_policy',
  'organizational_commitments',
] as const
exact<Exact<(typeof MATERIALITY)[number], MaterialityDomain>>(true)

const CONFIDENCE = ['low', 'medium', 'high'] as const
exact<Exact<(typeof CONFIDENCE)[number], DecisionConfidence>>(true)

const REVIEW_TRIGGERS = [
  'time_based', 'outcome_based', 'threshold_based', 'incident_based', 'mode_change_based',
] as const
exact<Exact<(typeof REVIEW_TRIGGERS)[number], DecisionReviewTrigger>>(true)

const OUTCOME_STATUS = [
  'not_yet_measurable', 'on_track', 'mixed', 'successful', 'unsuccessful',
  'inconclusive', 'harmful', 'superseded_before_evaluation',
] as const
exact<Exact<(typeof OUTCOME_STATUS)[number], DecisionOutcomeStatus>>(true)

export const materiality: Parser<MaterialityDomain[]> = arrayOf(enumOf(MATERIALITY))
export const confidence: Parser<DecisionConfidence> = enumOf(CONFIDENCE)

/**
 * `DecisionEvidenceReference` — kind, ref, label, observedAt, scope.
 * `kind` is a free string in the domain type, so it is not enum-checked here;
 * inventing a vocabulary the domain does not enforce would be a new business
 * rule rather than transport adjudication.
 */
export const evidenceReference: Parser<DecisionEvidenceReference> =
  objectOf<DecisionEvidenceReference>({
    kind: f(str), ref: f(str), label: f(str), observedAt: f(str), scope: f(str),
  })

const measurement = objectOf<{ label: string; value: string }>({
  label: f(str), value: f(str),
})

export const snapshot: Parser<DecisionEvidenceSnapshot> =
  objectOf<DecisionEvidenceSnapshot>({
    capturedAt: f(str), measurements: f(arrayOf(measurement)),
    dataFreshness: f(str), knownGaps: f(arrayOf(str)),
  })

export const alternative: Parser<DecisionAlternative> =
  objectOf<DecisionAlternative>({
    label: f(str), summary: f(str), rejected: f(bool),
    // Domain type is `string | null` and NOT optional, so the key is required
    // and null is legal — mirrored exactly rather than loosened.
    rejectionReason: { parser: v => (v === null ? null : str(v)) },
  })

export const reviewCondition: Parser<DecisionReviewCondition> =
  objectOf<DecisionReviewCondition>({
    trigger: f(enumOf(REVIEW_TRIGGERS)), description: f(str),
    dueAt: { parser: v => (v === null ? null : str(v)) },
  })

export const outcome: Parser<DecisionOutcome> =
  objectOf<DecisionOutcome>({
    status: f(enumOf(OUTCOME_STATUS)), summary: f(str), observedAt: f(str),
    evidence: f(arrayOf(evidenceReference)),
  })

// Re-exported so an adapter can compose parsers through a single import.
export { arrayOf, nullable, isRejected } from './canonicalize'
/** `string[]` — reversalConditions. */
export const arrayOfStr: Parser<string[]> = arrayOf(str)
