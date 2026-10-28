import type { CandidateStatus, LeadCandidate } from './types'

/**
 * Review lifecycle. The terminal "go" state is `approved_for_outreach_review`:
 * it only makes a candidate ELIGIBLE to be considered by the existing Sales
 * pilot flow (which has its own draft + approval gates). Nothing here sends.
 */
const TRANSITIONS: Record<CandidateStatus, readonly CandidateStatus[]> = {
  needs_review: ['approved_for_outreach_review', 'rejected'],
  approved_for_outreach_review: ['rejected', 'suppressed'],
  rejected: ['needs_review'],
  duplicate: [],
  excluded: [],
  suppressed: [],
}

export interface ReviewDecision {
  candidate: LeadCandidate
  to: CandidateStatus
  reviewerId: string
  /** Explicit owner approval is per batch, never global. */
  batchId: string
}

export class LifecycleError extends Error {}

export function applyReview(d: ReviewDecision): LeadCandidate {
  if (!d.reviewerId || !d.batchId) throw new LifecycleError('reviewer and batch are required')
  const c = d.candidate
  if (c.exclusions.length > 0 && d.to === 'approved_for_outreach_review') {
    throw new LifecycleError('excluded candidates cannot be approved')
  }
  if (c.soleProprietor && d.to === 'approved_for_outreach_review') {
    throw new LifecycleError('sole proprietors need separate GDPR review before approval')
  }
  if (!TRANSITIONS[c.status].includes(d.to)) throw new LifecycleError(`invalid transition ${c.status} -> ${d.to}`)
  return { ...c, status: d.to }
}
