/**
 * lib/atlas/decision-ledger/build.ts — pure construction and validation of
 * decision records.
 *
 * Separated from the write boundary so every canonical rule is testable with no
 * database, no session and no clock. The shell adds only what this module
 * cannot do safely: the authenticated human principal, the project-access
 * check, and live resolution of the Authorization V1 proof.
 */

import { randomUUID } from 'node:crypto'
import { MalformedDecisionLineageError } from './types'
import type {
  DecisionAlternative,
  DecisionAuthorityRecord,
  DecisionConfidence,
  DecisionEvidenceReference,
  DecisionEvidenceSnapshot,
  DecisionOutcome,
  DecisionRecord,
  DecisionRecordType,
  DecisionReviewCondition,
  MaterialityDomain,
} from './types'

/** §11.19 — the canonical materiality domains. Nothing outside this list. */
export const MATERIALITY_DOMAINS: readonly MaterialityDomain[] = [
  'strategy', 'authority', 'autonomy', 'money', 'risk', 'customers', 'brand',
  'project_mode', 'roadmap', 'major_architecture', 'external_action_policy',
  'organizational_commitments',
] as const

function requireText(value: unknown, invariant: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MalformedDecisionLineageError(invariant)
  }
  return value
}

function requireIsoTime(value: string, invariant: string): string {
  if (Number.isNaN(Date.parse(value))) throw new MalformedDecisionLineageError(invariant)
  return value
}

function validateMateriality(domains: MaterialityDomain[]): MaterialityDomain[] {
  // §11.18 — routine activity must not enter the ledger, so materiality has to
  // be positively declared and drawn from the canonical list.
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new MalformedDecisionLineageError('materiality-required')
  }
  const seen = new Set<string>()
  for (const domain of domains) {
    if (!MATERIALITY_DOMAINS.includes(domain)) {
      throw new MalformedDecisionLineageError('materiality-domain-canonical', domain)
    }
    if (seen.has(domain)) throw new MalformedDecisionLineageError('materiality-domain-unique', domain)
    seen.add(domain)
  }
  return domains
}

function validateEvidence(evidence: DecisionEvidenceReference[]): DecisionEvidenceReference[] {
  for (const item of evidence) {
    requireText(item?.kind, 'evidence-kind-required')
    requireText(item?.ref, 'evidence-ref-required')
    // §11.27 — linked evidence preserves timestamp and scope.
    requireIsoTime(requireText(item?.observedAt, 'evidence-observed-at-required'), 'evidence-observed-at-valid')
    requireText(item?.scope, 'evidence-scope-required')
  }
  return evidence
}

function validateSnapshot(snapshot: DecisionEvidenceSnapshot | null): DecisionEvidenceSnapshot | null {
  if (!snapshot) return null
  requireIsoTime(requireText(snapshot.capturedAt, 'snapshot-captured-at-required'), 'snapshot-captured-at-valid')
  requireText(snapshot.dataFreshness, 'snapshot-data-freshness-required')
  if (!Array.isArray(snapshot.knownGaps)) throw new MalformedDecisionLineageError('snapshot-known-gaps-required')
  return snapshot
}

function validateAlternatives(alternatives: DecisionAlternative[]): DecisionAlternative[] {
  for (const alternative of alternatives) {
    requireText(alternative?.label, 'alternative-label-required')
    requireText(alternative?.summary, 'alternative-summary-required')
    // §11.32 — a rejected alternative must say why it was rejected.
    if (alternative.rejected) requireText(alternative.rejectionReason, 'rejected-alternative-requires-reason')
  }
  return alternatives
}

function validateReview(review: DecisionReviewCondition | null): DecisionReviewCondition | null {
  if (!review) return null
  requireText(review.description, 'review-description-required')
  if (review.trigger === 'time_based') {
    requireIsoTime(requireText(review.dueAt, 'time-based-review-requires-due-date'), 'review-due-at-valid')
  }
  return review
}

function validateOutcome(outcome: DecisionOutcome | null): DecisionOutcome | null {
  if (!outcome) return null
  requireText(outcome.summary, 'outcome-summary-required')
  requireIsoTime(requireText(outcome.observedAt, 'outcome-observed-at-required'), 'outcome-observed-at-valid')
  // §11.97 — outcome evidence is required; a claimed outcome needs support.
  // The one exception is the explicit UNKNOWN, which asserts nothing.
  if (outcome.status !== 'not_yet_measurable' && outcome.evidence.length === 0) {
    throw new MalformedDecisionLineageError('outcome-requires-evidence', outcome.status)
  }
  validateEvidence(outcome.evidence)
  return outcome
}

export interface BuildDecisionRecordInput {
  type:        DecisionRecordType
  decisionId:  string
  projectId:   string
  /** Server-derived human identity. Never taken from an untrusted caller. */
  principalId: string
  occurredAt:  string
  recordId?:   string
  version:     number

  title:       string
  statement:   string
  recommendation?: string | null
  rationale?:  string | null
  materiality: MaterialityDomain[]
  authority?:  DecisionAuthorityRecord | null
  evidence?:   DecisionEvidenceReference[]
  snapshot?:   DecisionEvidenceSnapshot | null
  alternatives?: DecisionAlternative[]
  confidence?: DecisionConfidence | null
  expectedImpact?: string | null
  effectiveAt?: string | null
  expiresAt?:  string | null
  review?:     DecisionReviewCondition | null
  reversalConditions?: string[]
  supersededBy?: string | null
  outcome?:    DecisionOutcome | null
  reviewNote?: string | null
  reason?:     string | null
  /** Lifecycle generation this act was derived from; 0 for an opening act. */
  lifecycleGeneration: number
}

export function buildDecisionRecord(input: BuildDecisionRecordInput): DecisionRecord {
  requireText(input.decisionId, 'decision-id-required')
  requireText(input.projectId, 'project-scope-required')
  requireText(input.principalId, 'principal-required')
  requireText(input.title, 'title-required')
  // §11.23 — the commitment itself, clear enough to interpret consistently.
  requireText(input.statement, 'statement-required')
  requireIsoTime(input.occurredAt, 'occurred-at-valid')
  if (!Number.isInteger(input.lifecycleGeneration) || input.lifecycleGeneration < 0) {
    throw new MalformedDecisionLineageError('lifecycle-generation-non-negative')
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new MalformedDecisionLineageError('version-positive-integer')
  }

  const materiality = validateMateriality(input.materiality)
  const evidence = validateEvidence(input.evidence ?? [])
  const snapshot = validateSnapshot(input.snapshot ?? null)
  const alternatives = validateAlternatives(input.alternatives ?? [])
  const review = validateReview(input.review ?? null)
  const outcome = validateOutcome(input.outcome ?? null)

  if (input.effectiveAt) requireIsoTime(input.effectiveAt, 'effective-at-valid')
  if (input.expiresAt) {
    requireIsoTime(input.expiresAt, 'expires-at-valid')
    const from = input.effectiveAt ?? input.occurredAt
    if (Date.parse(input.expiresAt) <= Date.parse(from)) {
      throw new MalformedDecisionLineageError('expiry-after-effective')
    }
  }

  if (input.type === 'approved') {
    // §11.39/§11.41 — authority is mandatory, and V1 proves it with an
    // Authorization V1 reference rather than a copied boolean.
    const authority = input.authority
    if (!authority) throw new MalformedDecisionLineageError('approval-requires-authority')
    requireText(authority.authorizationId, 'approval-requires-authorization-reference')
    requireText(authority.principalId, 'approval-requires-authority-principal')
    requireText(authority.actionKind, 'approval-requires-authority-action')
    requireText(authority.boundVersionHash, 'approval-requires-bound-version')
    requireIsoTime(requireText(authority.authorityActAt, 'approval-requires-authority-time'), 'authority-act-at-valid')
    if (authority.basis !== 'founder_owner') {
      throw new MalformedDecisionLineageError('authority-basis-canonical', authority.basis)
    }
    // §11.26 — the rationale explains why the final decision was made.
    requireText(input.rationale, 'approval-requires-rationale')
    // §11.46 — every material decision has a review date or condition.
    if (!review) throw new MalformedDecisionLineageError('approval-requires-review-condition')
    requireIsoTime(requireText(input.effectiveAt, 'approval-requires-effective-date'), 'effective-at-valid')
  }

  if (input.type === 'rejected' || input.type === 'deferred') {
    // §11.53/§11.54 — a rejection preserves its reason, a deferral its cause.
    requireText(input.reason, `${input.type}-requires-reason`)
  }
  if (input.type === 'amended' || input.type === 'reversed') {
    requireText(input.reason, `${input.type}-requires-reason`)
  }
  if (input.type === 'superseded') {
    requireText(input.supersededBy, 'supersede-requires-successor')
  }
  if (input.type === 'outcome_observed' && !outcome) {
    throw new MalformedDecisionLineageError('outcome-record-requires-outcome')
  }
  if (input.type === 'reviewed') {
    requireText(input.reviewNote, 'review-record-requires-note')
  }

  return {
    recordId:   input.recordId ?? randomUUID(),
    decisionId: input.decisionId,
    type:       input.type,
    occurredAt: input.occurredAt,
    projectId:  input.projectId,
    principalId: input.principalId,
    title:      input.title,
    statement:  input.statement,
    recommendation: input.recommendation ?? null,
    rationale:  input.rationale ?? null,
    materiality,
    authority:  input.authority ?? null,
    evidence,
    snapshot,
    alternatives,
    confidence: input.confidence ?? null,
    expectedImpact: input.expectedImpact ?? null,
    effectiveAt: input.effectiveAt ?? null,
    expiresAt:  input.expiresAt ?? null,
    review,
    reversalConditions: input.reversalConditions ?? [],
    supersededBy: input.supersededBy ?? null,
    version:    input.version,
    outcome,
    reviewNote: input.reviewNote ?? null,
    reason:     input.reason ?? null,
    lifecycleGeneration: input.lifecycleGeneration,
  }
}

export function newDecisionId(): string {
  return randomUUID()
}
