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
 * AUTHORITY BINDING IS DERIVED, NEVER CALLER-SUPPLIED (EI-S1.3B-R1). An earlier
 * revision let the caller pass the authorization target and action kind, so any
 * legitimate authorization in the same project — one granted to publish a single
 * unrelated article — could approve an unrelated autonomy decision. The binding
 * now comes from the decision itself (`binding.ts`): target `decision:<id>`
 * pinned to the material version hash, and a distinct action per authority act.
 * No security-sensitive component is an argument.
 *
 * EVERY AUTHORITY ACT NEEDS ITS OWN FRESH PROOF. Approving, amending, reversing
 * and superseding are four different permissions (§27.313 minimum authority);
 * none of them reuses `prior.authority`, which would prove only that someone was
 * once allowed to do something else.
 *
 * AUTHORITY IS PROVEN AT THE MOMENT OF THE ACT, then recorded immutably. §11.180
 * requires an active decision to explain itself as "approved under this authority
 * … and remains active until this review condition"; §11.44/§11.45 give the
 * decision its own duration. So a later authorization expiry does not retroactively
 * unmake the decision — it is a reason to review it.
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
import { bindingForState, type DecisionAct } from './binding'
import { buildDecisionRecord, newDecisionId, type BuildDecisionRecordInput } from './build'
import { deriveDecisionState, isLedgerMaterial } from './derive'
import { createDecisionLedgerStore, type DecisionLedgerStore } from './store'
import type {
  DecisionAlternative,
  DecisionAuthorityRecord,
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
  /** The referenced Authorization V1 proof is not effective for this exact act. */
  | 'authority_not_effective'
  /** The authorization's principal is not the acting caller (§11.39 provenance). */
  | 'authority_principal_mismatch'
  /** Successor missing, cross-project, or the decision itself (§11.56). */
  | 'invalid_successor'
  /** The act is not permitted from the decision's current state. */
  | 'invalid_lifecycle'
  /** §11.58 — completion needs a measured outcome, not an assumption. */
  | 'outcome_required'
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
  /**
   * Authorization V1 proof. The target and action it must satisfy are DERIVED
   * from the decision; the caller cannot choose or weaken them.
   */
  authorizationId: string
  rationale:   string
  review:      DecisionReviewCondition
  effectiveAt: string
  expiresAt?:  string | null
}

/** §11.59/§11.62 — a material amendment creating version N+1. */
export interface AmendDecisionArgs extends CommonArgs {
  decisionId:  string
  authorizationId: string
  reason:      string
  statement?:  string
  title?:      string
  materiality?: MaterialityDomain[]
  rationale:   string
  review:      DecisionReviewCondition
  effectiveAt: string
  expiresAt?:  string | null
  reversalConditions?: string[]
}

/** §11.57 — reversal needs its own current authority, not the approval's. */
export interface ReverseDecisionArgs extends CommonArgs {
  decisionId: string
  authorizationId: string
  reason:     string
}

export interface SettleDecisionArgs extends CommonArgs {
  decisionId: string
  reason:     string
}

export interface SupersedeDecisionArgs extends CommonArgs {
  decisionId:   string
  /** Must be an existing decision in the same project, and not this one. */
  supersededBy: string
  authorizationId: string
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
 * Resolve the authority for ONE act, at the moment of the act.
 *
 * The binding is computed from the decision, never from an argument, so an
 * authorization granted for something else — another decision, another version,
 * another act — cannot be presented here. §11.39 provenance additionally
 * requires the authorization's own principal to be the acting human: a
 * service-role or Atlas-initiated call carrying someone else's grant is not
 * that human exercising authority, so it is refused rather than recorded under
 * their name.
 */
async function proveAuthority(
  principal: Principal,
  authorizationId: string,
  state: DerivedDecisionState,
  act: DecisionAct,
  at: string,
): Promise<DecisionAuthorityRecord | DecisionWriteResult> {
  const binding = bindingForState(state, act)
  const authority = await isAuthorizationEffective(
    authorizationId,
    { projectId: binding.projectId, target: binding.target, actionKind: binding.actionKind },
    { now: at },
  )
  if (!authority.effective || !authority.state) {
    return DENY('authority_not_effective', `${authority.status}:${authority.reason}`)
  }
  if (authority.state.principalId !== principal.userId) {
    return DENY('authority_principal_mismatch')
  }
  // Pinned now, immutable forever: §11.180 lets an active decision explain
  // itself from its own record, without re-reading live authorization state.
  return {
    basis: 'founder_owner',
    authorizationId,
    principalId: authority.state.principalId,
    actionKind: binding.actionKind,
    boundVersionHash: binding.target.versionHash,
    approvedAt: at,
  }
}

/** The decision content an appended act carries forward unchanged. */
function carryForward(prior: DerivedDecisionState) {
  return {
    projectId:   prior.projectId,
    version:     prior.version,
    title:       prior.title,
    statement:   prior.statement,
    recommendation: prior.recommendation,
    rationale:   prior.rationale,
    materiality: prior.materiality,
    evidence:    prior.evidence,
    snapshot:    prior.snapshot,
    alternatives: prior.alternatives,
    confidence:  prior.confidence,
    expectedImpact: prior.expectedImpact,
    effectiveAt: prior.effectiveAt,
    expiresAt:   prior.expiresAt,
    review:      prior.review,
    reversalConditions: prior.reversalConditions,
  }
}

/** authenticate → project authority → lineage. Shared by every act below. */
async function openFor(
  args: CommonArgs & { decisionId: string },
): Promise<
  | { principal: Principal; store: DecisionLedgerStore; at: string; prior: DerivedDecisionState; records: DecisionRecord[] }
  | DecisionWriteResult
> {
  const principal = await authenticate()
  if ('status' in principal) return principal

  const store = args.store ?? createDecisionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  const opened = await openLineage(principal, store, args.decisionId, at)
  if ('status' in opened) return opened
  return { principal, store, at, prior: opened.state, records: opened.records }
}

/**
 * Approve a decision (§11.51) under a live Authorization V1 proof bound to this
 * exact decision version and to the approve act specifically.
 *
 * Approval is a moment, not a lease. Once proven, the approval stands on its own
 * record: a later expiry or revocation of the authorization is a reason to
 * review the decision (§11.47), not a retroactive unmaking of it. The decision's
 * own `expiresAt` and review condition govern how long it remains in force
 * (§11.44, §11.45, §11.55, §11.180).
 */
export async function approveDecision(args: ApproveDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { principal, store, at, prior } = open

  // §11.41 — a decision requiring approval is not effective until approval exists.
  const authority = await proveAuthority(principal, args.authorizationId, prior, 'approve', at)
  if ('status' in authority) return authority

  return persist(store, {
    ...carryForward(prior),
    type: 'approved',
    decisionId: args.decisionId,
    principalId: principal.userId,
    occurredAt: at,
    rationale: args.rationale,
    authority,
    effectiveAt: args.effectiveAt,
    expiresAt: args.expiresAt ?? null,
    review: args.review,
  }, at)
}

/**
 * §11.59/§11.62 — a material amendment creates version N+1 under its OWN fresh
 * authority. The grant is pinned to the version being amended, so an
 * authorization obtained for an earlier version cannot silently license a later,
 * different change; and the approve grant cannot license an amendment at all.
 * Version N stays in the immutable lineage (§11.63).
 */
export async function amendDecision(args: AmendDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { principal, store, at, prior } = open

  const authority = await proveAuthority(principal, args.authorizationId, prior, 'amend', at)
  if ('status' in authority) return authority

  const materiality = args.materiality ?? prior.materiality
  if (!isLedgerMaterial({ materiality })) return DENY('not_ledger_material')

  return persist(store, {
    ...carryForward(prior),
    type: 'amended',
    decisionId: args.decisionId,
    principalId: principal.userId,
    occurredAt: at,
    version: prior.version + 1,
    title: args.title ?? prior.title,
    statement: args.statement ?? prior.statement,
    materiality,
    rationale: args.rationale,
    authority,
    effectiveAt: args.effectiveAt,
    expiresAt: args.expiresAt ?? null,
    review: args.review,
    reversalConditions: args.reversalConditions ?? prior.reversalConditions,
    reason: args.reason,
  }, at)
}

/** Append a settling act that carries the prior decision content forward. */
function transition(type: 'rejected' | 'deferred') {
  return async (args: SettleDecisionArgs): Promise<DecisionWriteResult> => {
    const open = await openFor(args)
    if ('status' in open) return open
    const { principal, store, at, prior } = open

    return persist(store, {
      ...carryForward(prior),
      type,
      decisionId: args.decisionId,
      principalId: principal.userId,
      occurredAt: at,
      authority: prior.authority,
      reason: args.reason,
    }, at)
  }
}

/** §11.53 — rejected; must not authorize action. Preserves the original proposal. */
export const rejectDecision = transition('rejected')
/** §11.54 — deferred; must not disappear. */
export const deferDecision = transition('deferred')

/**
 * §11.57 — actively undo an approved decision, distinct from expiration.
 *
 * Reversal is an exercise of authority in its own right, so it needs its own
 * current proof. `prior.authority` shows only that someone was once allowed to
 * approve this — reusing it would let a stale or revoked approval grant, or an
 * unattended Atlas call, undo a standing institutional commitment. Both
 * authority acts survive on their own records.
 */
export async function reverseDecision(args: ReverseDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { principal, store, at, prior } = open

  const authority = await proveAuthority(principal, args.authorizationId, prior, 'reverse', at)
  if ('status' in authority) return authority

  return persist(store, {
    ...carryForward(prior),
    type: 'reversed',
    decisionId: args.decisionId,
    principalId: principal.userId,
    occurredAt: at,
    authority,
    reason: args.reason,
  }, at)
}

/**
 * §11.58 — a finite outcome has been REACHED, which is an observation, not a
 * claim. Completion therefore requires a measured outcome already in the
 * lineage: the explicit UNKNOWN (`not_yet_measurable`) asserts nothing and
 * cannot close a decision, which would otherwise let "we stopped paying
 * attention" masquerade as "this finished".
 *
 * Not an authority act — nothing new is authorized by acknowledging a finish —
 * so it takes no authorization and carries the approval provenance forward.
 */
export async function completeDecision(args: SettleDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { principal, store, at, prior, records } = open

  const measured = records.some(
    record => record.type === 'outcome_observed'
      && record.outcome != null
      && record.outcome.status !== 'not_yet_measurable',
  )
  if (!measured) return DENY('outcome_required')

  return persist(store, {
    ...carryForward(prior),
    type: 'completed',
    decisionId: args.decisionId,
    principalId: principal.userId,
    occurredAt: at,
    authority: prior.authority,
    outcome: prior.outcome,
    reason: args.reason,
  }, at)
}

/**
 * §11.56 — replaced by a newer decision; the relationship is explicit and must
 * be real. An unverified successor id would turn the ledger's own lineage into
 * fiction, so the successor must exist, live in the same project, not be this
 * decision, and not already be superseded by this one (which would close a
 * cycle and leave neither decision governing).
 *
 * A missing successor and a successor in another project deny identically —
 * this must not become a cross-project decision-id oracle.
 */
export async function supersedeDecision(args: SupersedeDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { principal, store, at, prior, records } = open

  if (args.supersededBy === args.decisionId) return DENY('invalid_successor', 'self')

  let successor: DecisionRecord[]
  try {
    successor = await store.lineage(args.supersededBy)
  } catch {
    return DENY('unavailable')
  }
  if (successor.length === 0) return DENY('invalid_successor', 'unknown_or_foreign')
  if (successor[0].projectId !== prior.projectId) return DENY('invalid_successor', 'unknown_or_foreign')

  // A cycle: the proposed successor was itself superseded by this decision.
  const successorSupersededBy = successor
    .filter(record => record.type === 'superseded')
    .map(record => record.supersededBy)
  if (successorSupersededBy.includes(args.decisionId)) return DENY('invalid_successor', 'cycle')

  const authority = await proveAuthority(principal, args.authorizationId, prior, 'supersede', at)
  if ('status' in authority) return authority

  return persist(store, {
    ...carryForward(prior),
    type: 'superseded',
    decisionId: args.decisionId,
    principalId: principal.userId,
    occurredAt: at,
    authority,
    supersededBy: args.supersededBy,
    reason: args.reason ?? 'Superseded by a newer decision.',
  }, at)
}

/** Statuses a decision must have reached before an outcome can be meaningful. */
const OUTCOME_ELIGIBLE = new Set([
  'approved', 'active', 'expired', 'completed', 'reversed', 'superseded',
])

/**
 * §11.96 — record what actually happened. Appends; never overwrites the original
 * decision or its expected impact. An outcome in another project is impossible
 * here: scope comes from the decision's own lineage.
 *
 * A decision that never took effect has no outcome to observe. Attaching one to
 * a draft, proposal, rejection or deferral would fabricate consequences for a
 * commitment that was never made, and would corrupt §8.4 calibration by scoring
 * decisions that never ran.
 */
export async function observeOutcome(args: ObserveOutcomeArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { principal, store, at, prior } = open

  if (!OUTCOME_ELIGIBLE.has(prior.status)) return DENY('invalid_lifecycle', prior.status)

  return persist(store, {
    ...carryForward(prior),
    type: 'outcome_observed',
    decisionId: args.decisionId,
    principalId: principal.userId,
    occurredAt: at,
    authority: prior.authority,
    outcome: args.outcome,
  }, at)
}

/**
 * §11.102 — record a lesson from review. Lessons accumulate; they never rewrite
 * the reasoning that was recorded at decision time. Chapter 12 owns the full
 * review and decay architecture and is not implemented here.
 */
export async function recordDecisionReview(args: ReviewDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { principal, store, at, prior } = open

  return persist(store, {
    ...carryForward(prior),
    type: 'reviewed',
    decisionId: args.decisionId,
    principalId: principal.userId,
    occurredAt: at,
    authority: prior.authority,
    reviewNote: args.reviewNote,
  }, at)
}
