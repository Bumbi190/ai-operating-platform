/**
 * Operator-only gate for a private, independent OpenViking retrieval cohort.
 *
 * This module NEVER executes retrieval, reads a vault, publishes documents,
 * writes M4 memory or changes an Atlas runtime setting. It checks that one
 * locally stored, prelabelled question set matches an already-validated,
 * immutable PROJECT publication. The caller is responsible for proving the
 * owner's publication approval and the question author's independence.
 *
 * Private question text stays only in the operator's private input file.
 * This module returns aggregate counts, reason CODES and one digest; never
 * original queries, document titles, paths or excerpts.
 */
import { sha256 } from '@/lib/architecture-knowledge/hash'
import { containsSecretShape } from '@/lib/atlas/knowledge/projection/secret-scan'
import type { PublishedCorpus } from './corpus'
import type { QuestionKind } from './quality-evaluation'

export const HELDOUT_PLAN_SCHEMA = 'atlas-openviking-heldout-plan-v1' as const
const HEX64 = /^[0-9a-f]{64}$/
const IDENT = /^[a-z0-9][a-z0-9_-]{2,79}$/
const MAX_CASES = 240

export interface HeldoutQuestion {
  id: string
  kind: QuestionKind
  question: string
  expectedIds: string[]
}

export interface HeldoutPlan {
  schemaVersion: typeof HELDOUT_PLAN_SCHEMA
  cohortId: string
  projectId: string
  projectSlug: string
  snapshotId: string
  /** Exactly the validated source IDs in the approved immutable snapshot. */
  sourceIds: string[]
  attestations: {
    /** Owner reviewed the projection publication, not just its JSON hashes. */
    ownerReviewedSourceApproval: boolean
    /** Someone independent of source authoring supplied the queries. */
    independentQuestionAuthor: boolean
    /** Queries were not used for ranking, prompt or model tuning. */
    heldOutFromTuning: boolean
    /** An operator labelled the expected source IDs against originals. */
    expectedSourcesReviewed: boolean
    /** Negative/foreign project labels were checked by the reviewer. */
    negativeScopeLabelsReviewed: boolean
  }
  questions: HeldoutQuestion[]
  /**
   * SHA256 of the ordered input fields excluding this lock, recorded before
   * any search. A digest detects later changes; it does NOT prove chronology,
   * author independence or permission by itself.
   */
  lock: { digest: string; lockedBeforeSearch: boolean }
}

export interface HeldoutReadiness {
  readyForOperatorCaptureReview: boolean
  runtimeActivationAuthorized: false
  /** Digests are audit identifiers, not proof of an operator approval. */
  expectedDigest: string | null
  reasonCodes: string[]
  counts: {
    sourceDocuments: number
    answerable: number
    unsupported: number
    foreignProject: number
    duplicateQuestions: number
    invalidQuestions: number
  }
}

const emptyCounts = () => ({
  sourceDocuments: 0, answerable: 0, unsupported: 0,
  foreignProject: 0, duplicateQuestions: 0, invalidQuestions: 0,
})

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(obj).length === keys.length && keys.every(k => Object.hasOwn(obj, k))
}

function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && IDENT.test(value)
}
function validSources(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 128 && value.every(
    id => typeof id === 'string' && id.length >= 4 && id.length <= 128,
  ) && new Set(value).size === value.length
}
function validQuestions(value: unknown): value is HeldoutQuestion[] {
  return Array.isArray(value) && value.length <= MAX_CASES && value.every(item => {
    if (!plainObject(item)
      || !exactKeys(item, ['id', 'kind', 'question', 'expectedIds'])
      || !validIdentity(item.id)
      || !['answerable', 'unsupported', 'foreign_project'].includes(String(item.kind))
      || typeof item.question !== 'string'
      || !Array.isArray(item.expectedIds)
      || item.expectedIds.length > 8
      || !item.expectedIds.every((id: unknown) => typeof id === 'string' && id.length <= 128)) return false
    return true
  })
}

function validShape(value: unknown): value is HeldoutPlan {
  if (!plainObject(value)
    || !exactKeys(value, [
      'schemaVersion', 'cohortId', 'projectId', 'projectSlug', 'snapshotId',
      'sourceIds', 'attestations', 'questions', 'lock',
    ])
    || value.schemaVersion !== HELDOUT_PLAN_SCHEMA
    || !validIdentity(value.cohortId)
    || !validIdentity(value.projectSlug)
    || typeof value.projectId !== 'string'
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.projectId)
    || typeof value.snapshotId !== 'string' || !HEX64.test(value.snapshotId)
    || !validSources(value.sourceIds)
    || !validQuestions(value.questions)
    || !plainObject(value.attestations)
    || !exactKeys(value.attestations, [
      'ownerReviewedSourceApproval', 'independentQuestionAuthor', 'heldOutFromTuning',
      'expectedSourcesReviewed', 'negativeScopeLabelsReviewed',
    ])
    || !Object.values(value.attestations).every(v => typeof v === 'boolean')
    || !plainObject(value.lock)
    || !exactKeys(value.lock, ['digest', 'lockedBeforeSearch'])
    || typeof value.lock.digest !== 'string'
    || typeof value.lock.lockedBeforeSearch !== 'boolean') return false
  return true
}

function canonicalInput(plan: HeldoutPlan): string {
  // Reconstruct fields, never hash arbitrary unexpected nested attributes.
  // Original private questions affect the digest but are never returned.
  return JSON.stringify({
    schemaVersion: plan.schemaVersion,
    cohortId: plan.cohortId,
    projectId: plan.projectId,
    projectSlug: plan.projectSlug,
    snapshotId: plan.snapshotId,
    sourceIds: plan.sourceIds,
    attestations: {
      ownerReviewedSourceApproval: plan.attestations.ownerReviewedSourceApproval,
      independentQuestionAuthor: plan.attestations.independentQuestionAuthor,
      heldOutFromTuning: plan.attestations.heldOutFromTuning,
      expectedSourcesReviewed: plan.attestations.expectedSourcesReviewed,
      negativeScopeLabelsReviewed: plan.attestations.negativeScopeLabelsReviewed,
    },
    questions: plan.questions.map(q => ({
      id: q.id, kind: q.kind, question: q.question, expectedIds: q.expectedIds,
    })),
  })
}

export function heldoutPlanDigest(raw: unknown): string | null {
  if (!validShape(raw)) return null
  return sha256(canonicalInput(raw))
}

/**
 * Requires a validated PublishedCorpus from parseCorpus, not a client-supplied
 * project label. Still does NOT grant any permission to query or publish.
 */
export function checkHeldoutReadiness(raw: unknown, corpus: PublishedCorpus | null): HeldoutReadiness {
  const counts = emptyCounts()
  if (!validShape(raw)) {
    return {
      readyForOperatorCaptureReview: false, runtimeActivationAuthorized: false,
      expectedDigest: null, reasonCodes: ['plan_schema_invalid'], counts,
    }
  }
  const plan = raw
  const reasons: string[] = []
  const expectedDigest = sha256(canonicalInput(plan))
  counts.sourceDocuments = corpus?.documents.length ?? 0

  if (!corpus) reasons.push('validated_corpus_missing')
  else {
    if (corpus.projectId !== plan.projectId
      || corpus.projectSlug !== plan.projectSlug || corpus.snapshotId !== plan.snapshotId) {
      reasons.push('snapshot_scope_mismatch')
    }
    const ids = corpus.documents.map(d => d.id)
    if (new Set(ids).size !== ids.length
      || ids.length !== plan.sourceIds.length
      || !ids.every(id => plan.sourceIds.includes(id))) {
      reasons.push('source_set_mismatch')
    }
  }
  if (counts.sourceDocuments < 8) reasons.push('insufficient_approved_project_sources')
  if (!plan.attestations.ownerReviewedSourceApproval) reasons.push('source_approval_requires_owner_review')
  if (!plan.attestations.independentQuestionAuthor || !plan.attestations.heldOutFromTuning)
    reasons.push('independent_held_out_questions_not_attested')
  if (!plan.attestations.expectedSourcesReviewed) reasons.push('answer_source_labels_not_reviewed')
  if (!plan.attestations.negativeScopeLabelsReviewed) reasons.push('negative_scope_labels_not_reviewed')

  const ids = new Set(plan.sourceIds)
  const questionIds = new Set<string>()
  const normalizedQuestions = new Set<string>()
  for (const item of plan.questions) {
    if (item.kind === 'answerable') counts.answerable++
    else if (item.kind === 'unsupported') counts.unsupported++
    else counts.foreignProject++

    const folded = item.question.normalize('NFC').trim().toLocaleLowerCase('sv-SE')
      .replace(/\s+/g, ' ')
    if (normalizedQuestions.has(folded) || questionIds.has(item.id)) counts.duplicateQuestions++
    normalizedQuestions.add(folded)
    questionIds.add(item.id)

    if (item.question.trim().length < 8 || item.question.length > 500
      || containsSecretShape(item.question)
      || new Set(item.expectedIds).size !== item.expectedIds.length
      || !item.expectedIds.every(id => ids.has(id))
      || (item.kind === 'answerable' ? item.expectedIds.length === 0
        : item.expectedIds.length !== 0)) {
      counts.invalidQuestions++
    }
  }
  if (counts.duplicateQuestions) reasons.push('duplicate_questions')
  if (counts.invalidQuestions) reasons.push('question_or_source_label_invalid')
  if (counts.answerable < 30) reasons.push('too_few_answerable_questions')
  if (counts.unsupported < 10) reasons.push('too_few_unsupported_questions')
  if (counts.foreignProject < 8) reasons.push('too_few_foreign_project_cases')
  if (!plan.lock.lockedBeforeSearch || plan.lock.digest !== expectedDigest)
    reasons.push('question_set_not_immutably_locked')

  return {
    readyForOperatorCaptureReview: reasons.length === 0,
    runtimeActivationAuthorized: false,
    expectedDigest, reasonCodes: reasons, counts,
  }
}
