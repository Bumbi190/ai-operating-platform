/**
 * lib/atlas/decision-ledger/principal-write.ts — the sanctioned write boundary
 * for institutional decision history.
 *
 * ORDERING RULE (inherited from the EI-S1.3A-R1 lesson): authenticate →
 * establish project authority → only then touch the privileged store. Unknown
 * decision and foreign-project decision return one indistinguishable
 * `not_permitted`, so this boundary can never become a decision-id existence
 * oracle.
 *
 * AUTHORITY IS RESOLVED LIVE, NEVER COPIED. §11.39 requires the ledger to
 * identify the authority behind a decision, and §11.41 that "a decision
 * requiring approval is not effective until approval exists". Approving a
 * decision therefore resolves the referenced Authorization V1 proof through its
 * own sanctioned seam and requires it to be effective for the exact project,
 * target, version and action. The ledger stores the reference; it never stores
 * an `authorized: true` boolean that could drift away from a later revocation,
 * expiry, supersession or unverified condition.
 *
 * Nothing here executes anything. A ledger record is a commitment, never a
 * command: this module imports no tool, runner or action dispatcher.
 * `import 'server-only'` keeps it and the service-role store out of any client
 * bundle.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import type { AuthorizationTarget } from '@/lib/atlas/authorization/types'
import { buildDecisionRecord, newDecisionId, type BuildDecisionRecordInput } from './build'
import { deriveDecisionState, isLedgerMaterial } from './derive'
import { createDecisionLedgerStore, type DecisionLedgerStore } from './store'
import type {
  DecisionAlternative,
  DecisionConfidence,
  DecisionEvidenceReference,
  DecisionEvidenceSnapshot,
  DecisionOutcome,
  DecisionRecord,
  DecisionReviewCondition,
  DerivedDecisionState,
  MaterialityDomain,
} from './types'

export type DecisionWriteStatus =
  | 'ok'
  | 'no_principal'
  /** Caller supplied the scope and does not own it — reveals nothing new. */
  | 'project_denied'
  /**
   * Deliberately indistinguishable: the decision does not exist, OR it exists
   * in a project the caller cannot access. Never split these apart.
   */
  | 'not_permitted'
  | 'invalid_request'
  /** §11.18/§11.19 — not material enough to belong in the ledger. */
  | 'not_ledger_material'
  /** The referenced Authorization V1 proof is not effective for this decision. */
  | 'authority_not_effective'
  /** A competing transition won the race; the lineage is unchanged. */
  | 'conflict'
  | 'unavailable'

export interface DecisionWriteResult {
  state:  DerivedDecisionState | null
  status: DecisionWriteStatus
  /** Names the failed invariant or the authority reason. Never leaks a path. */
  detail?: string
}

interface CommonArgs {
  store?: DecisionLedgerStore
  /** Injected clock; production callers omit it. */
  now?: string
}

export interface ProposeDecisionArgs extends CommonArgs {
  projectId:   string
  title:       string
  statement:   string
  materiality: MaterialityDomain[]
  /** §11.24 — the Executive recommendation, kept separate from the decision. */
  recommendation?: string | null
  rationale?:  string | null
  evidence?:   DecisionEvidenceReference[]
  snapshot?:   DecisionEvidenceSnapshot | null
  alternatives?: DecisionAlternative[]
  confidence?: DecisionConfidence | null
  expectedImpact?: string | null
  reversalConditions?: string[]
  /** Open as a draft (§11.49) instead of a proposal (§11.50). */
  asDraft?: boolean
}

export interface ApproveDecisionArgs extends CommonArgs {
  decisionId:  string
  /** Authorization V1 proof. Resolved live; never trusted as a flag. */
  authorizationId: string
  /** The pinned target the authorization must cover. */
  authorizationTarget: AuthorizationTarget
  /** The action the authorization must grant. */
  authorizationActionKind: string
  rationale:   string
  review:      DecisionReviewCondition
  effectiveAt: string
  expiresAt?:  string | null
}

export interface SettleDecisionArgs extends CommonArgs {
  decisionId: string
  reason:     string
}

export interface SupersedeDecisionArgs extends CommonArgs {
  decisionId:   string
  supersededBy: string
  reason?:      string
}

export interface ObserveOutcomeArgs extends CommonArgs {
  decisionId: string
  outcome:    DecisionOutcome
}

export interface ReviewDecisionArgs extends CommonArgs {
  decisionId: string
  reviewNote: string
}

const DENY = (status: DecisionWriteStatus, detail?: string): DecisionWriteResult =>
  ({ state: null, status, ...(detail ? { detail } : {}) })

function isConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('23505') || message.toLowerCase().includes('duplicate key')
}

interface Principal { userId: string; allowedProjectIds: string[] }

/** Step 1 of the ordering rule. Nothing privileged runs before this resolves. */
async function authenticate(): Promise<Principal | DecisionWriteResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return DENY('no_principal')
  return { userId: access.userId, allowedProjectIds: access.allowedProjectIds }
}

async function persist(
  store: DecisionLedgerStore,
  input: BuildDecisionRecordInput,
  at: string,
): Promise<DecisionWriteResult> {
  let record: DecisionRecord
  try {
    record = buildDecisionRecord(input)
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'invalid')
  }
  try {
    await store.append(record)
  } catch (error) {
    return isConflict(error) ? DENY('conflict') : DENY('unavailable')
  }
  try {
    return { state: deriveDecisionState(await store.lineage(record.decisionId), { at }), status: 'ok' }
  } catch {
    return DENY('unavailable')
  }
}

/**
 * Open a decision (§11.49 draft or §11.50 proposal). Authorizes nothing — a
 * proposal is not a decision (§10.3), and neither governs behaviour.
 *
 * Retry semantics: retry-SAFE, NOT idempotent. Each call mints a new decision
 * id, so a retry opens a second draft/proposal. Harmless — nothing is decided
 * or authorized by opening one — but it is not deduplication.
 */
export async function proposeDecision(args: ProposeDecisionArgs): Promise<DecisionWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal
  if (!assertProjectAllowed(args.projectId, principal.allowedProjectIds)) return DENY('project_denied')

  // §11.18 — routine activity does not belong in the ledger.
  if (!isLedgerMaterial({ materiality: args.materiality ?? [] })) return DENY('not_ledger_material')

  const store = args.store ?? createDecisionLedgerStore()
  const occurredAt = args.now ?? new Date().toISOString()

  return persist(store, {
    type: args.asDraft ? 'drafted' : 'proposed',
    decisionId: newDecisionId(),
    projectId: args.projectId,
    principalId: principal.userId,
    occurredAt,
    version: 1,
    title: args.title,
    statement: args.statement,
    recommendation: args.recommendation,
    rationale: args.rationale,
    materiality: args.materiality,
    evidence: args.evidence,
    snapshot: args.snapshot,
    alternatives: args.alternatives,
    confidence: args.confidence,
    expectedImpact: args.expectedImpact,
    reversalConditions: args.reversalConditions,
  }, occurredAt)
}

/** Load an existing lineage after authenticating, enforcing scope from the chain. */
async function openLineage(
  principal: Principal,
  store: DecisionLedgerStore,
  decisionId: string,
  at: string,
): Promise<{ state: DerivedDecisionState; records: DecisionRecord[] } | DecisionWriteResult> {
  let records: DecisionRecord[]
  try {
    records = await store.lineage(decisionId)
  } catch {
    return DENY('unavailable')
  }
  // Unknown and foreign share one denial class — no existence oracle.
  if (records.length === 0) return DENY('not_permitted')
  if (!assertProjectAllowed(records[0].projectId, principal.allowedProjectIds)) return DENY('not_permitted')

  try {
    return { state: deriveDecisionState(records, { at }), records }
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'malformed')
  }
}

/**
 * Approve a decision (§11.51) under a live Authorization V1 proof.
 *
 * The authorization must be effective for this exact project, target version
 * and action at this moment. Expired, revoked, superseded, conditionally
 * unverified, wrong-project, wrong-version and wrong-action proofs all deny —
 * because effectiveness is resolved through the authorization seam rather than
 * copied into the ledger.
 */
export async function approveDecision(args: ApproveDecisionArgs): Promise<DecisionWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal

  const store = args.store ?? createDecisionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  const opened = await openLineage(principal, store, args.decisionId, at)
  if ('status' in opened) return opened
  const prior = opened.state

  // §11.41 — a decision requiring approval is not effective until approval
  // exists. Resolve the proof live, scoped to this decision's own project.
  const authority = await isAuthorizationEffective(
    args.authorizationId,
    {
      projectId:  prior.projectId,
      target:     args.authorizationTarget,
      actionKind: args.authorizationActionKind,
    },
    { now: at },
  )
  if (!authority.effective) {
    return DENY('authority_not_effective', `${authority.status}:${authority.reason}`)
  }

  return persist(store, {
    type: 'approved',
    decisionId: args.decisionId,
    projectId: prior.projectId,
    principalId: principal.userId,
    occurredAt: at,
    version: prior.version,
    title: prior.title,
    statement: prior.statement,
    recommendation: prior.recommendation,
    rationale: args.rationale,
    materiality: prior.materiality,
    authority: {
      basis: 'founder_owner',
      authorizationId: args.authorizationId,
      principalId: principal.userId,
    },
    evidence: prior.evidence,
    snapshot: prior.snapshot,
    alternatives: prior.alternatives,
    confidence: prior.confidence,
    expectedImpact: prior.expectedImpact,
    effectiveAt: args.effectiveAt,
    expiresAt: args.expiresAt ?? null,
    review: args.review,
    reversalConditions: prior.reversalConditions,
  }, at)
}

/** Append a settling or closing act that carries the prior decision content forward. */
function transition(
  type: 'rejected' | 'deferred' | 'reversed' | 'completed' | 'superseded',
) {
  return async (args: SettleDecisionArgs & { supersededBy?: string }): Promise<DecisionWriteResult> => {
    const principal = await authenticate()
    if ('status' in principal) return principal

    const store = args.store ?? createDecisionLedgerStore()
    const at = args.now ?? new Date().toISOString()

    const opened = await openLineage(principal, store, args.decisionId, at)
    if ('status' in opened) return opened
    const prior = opened.state

    return persist(store, {
      type,
      decisionId: args.decisionId,
      projectId: prior.projectId,
      principalId: principal.userId,
      occurredAt: at,
      version: prior.version,
      title: prior.title,
      statement: prior.statement,
      recommendation: prior.recommendation,
      rationale: prior.rationale,
      materiality: prior.materiality,
      authority: prior.authority,
      evidence: prior.evidence,
      snapshot: prior.snapshot,
      alternatives: prior.alternatives,
      confidence: prior.confidence,
      expectedImpact: prior.expectedImpact,
      effectiveAt: prior.effectiveAt,
      expiresAt: prior.expiresAt,
      review: prior.review,
      reversalConditions: prior.reversalConditions,
      supersededBy: args.supersededBy ?? null,
      reason: args.reason,
    }, at)
  }
}

/** §11.53 — rejected; must not authorize action. Preserves the original proposal. */
export const rejectDecision = transition('rejected')
/** §11.54 — deferred; must not disappear. */
export const deferDecision = transition('deferred')
/** §11.57 — actively undone, distinct from expiration. */
export const reverseDecision = transition('reversed')
/** §11.58 — finite outcome reached. */
export const completeDecision = transition('completed')

/** §11.56 — replaced by a newer decision; the relationship is explicit. */
export async function supersedeDecision(args: SupersedeDecisionArgs): Promise<DecisionWriteResult> {
  return transition('superseded')({
    decisionId: args.decisionId,
    reason: args.reason ?? 'Superseded by a newer decision.',
    supersededBy: args.supersededBy,
    store: args.store,
    now: args.now,
  })
}

/**
 * §11.96 — record what actually happened. Appends; never overwrites the
 * original decision or its expected impact. An outcome in another project is
 * impossible here: scope comes from the decision's own lineage.
 */
export async function observeOutcome(args: ObserveOutcomeArgs): Promise<DecisionWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal

  const store = args.store ?? createDecisionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  const opened = await openLineage(principal, store, args.decisionId, at)
  if ('status' in opened) return opened
  const prior = opened.state

  return persist(store, {
    type: 'outcome_observed',
    decisionId: args.decisionId,
    projectId: prior.projectId,
    principalId: principal.userId,
    occurredAt: at,
    version: prior.version,
    title: prior.title,
    statement: prior.statement,
    recommendation: prior.recommendation,
    rationale: prior.rationale,
    materiality: prior.materiality,
    authority: prior.authority,
    evidence: prior.evidence,
    snapshot: prior.snapshot,
    alternatives: prior.alternatives,
    confidence: prior.confidence,
    expectedImpact: prior.expectedImpact,
    effectiveAt: prior.effectiveAt,
    expiresAt: prior.expiresAt,
    review: prior.review,
    reversalConditions: prior.reversalConditions,
    outcome: args.outcome,
  }, at)
}

/**
 * §11.102 — record a lesson from review. Lessons accumulate; they never rewrite
 * the reasoning that was recorded at decision time. Chapter 12 owns the full
 * review and decay architecture and is not implemented here.
 */
export async function recordDecisionReview(args: ReviewDecisionArgs): Promise<DecisionWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal

  const store = args.store ?? createDecisionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  const opened = await openLineage(principal, store, args.decisionId, at)
  if ('status' in opened) return opened
  const prior = opened.state

  return persist(store, {
    type: 'reviewed',
    decisionId: args.decisionId,
    projectId: prior.projectId,
    principalId: principal.userId,
    occurredAt: at,
    version: prior.version,
    title: prior.title,
    statement: prior.statement,
    recommendation: prior.recommendation,
    rationale: prior.rationale,
    materiality: prior.materiality,
    authority: prior.authority,
    evidence: prior.evidence,
    snapshot: prior.snapshot,
    alternatives: prior.alternatives,
    confidence: prior.confidence,
    expectedImpact: prior.expectedImpact,
    effectiveAt: prior.effectiveAt,
    expiresAt: prior.expiresAt,
    review: prior.review,
    reversalConditions: prior.reversalConditions,
    reviewNote: args.reviewNote,
  }, at)
}
