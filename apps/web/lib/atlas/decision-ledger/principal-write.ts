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
 * ONE PIPELINE FOR EVERY ACT (EI-S1.3B-R2):
 *
 *   authenticate
 *   → open lineage (project authority from the chain's own recorded scope)
 *   → lifecycle gate on the derived prior state
 *   → build the CANDIDATE record — the exact row that will be appended
 *   → compute the authorization binding FROM THAT CANDIDATE
 *   → prove Authorization V1 for that binding, and that its principal is the
 *     acting human
 *   → preflight: fold [...lineage, candidate] through the pure core
 *   → verify the candidate's binding still hashes to what was proven
 *   → append
 *
 * Two earlier failures are what shaped this order.
 *
 * THE BINDING MUST COVER THE ACT, NOT THE STATE BEFORE IT. R1 derived the
 * binding from the pre-act decision, so terms supplied afterwards — an
 * approval's expiry and review condition, an amendment's new statement and
 * scope, a supersession's successor — were never authorized. §11.41 requires
 * the approval record to reference "Conditions. Edited terms."; §11.62 requires
 * a material amendment to go through "the applicable decision process". Both
 * demand that the human commit to the exact resulting act. See `binding.ts`.
 *
 * NOTHING MAY BE APPENDED BEFORE IT IS VALIDATED. R1 appended first and derived
 * afterwards, so an invalid transition — rejecting an active decision, reversing
 * a proposal — was permanently written to an append-only table and only then
 * reported as an error. The pure fold now runs on the prospective lineage before
 * the irreversible step. Unique indexes serialize races; they do not validate
 * semantics, and cannot substitute for this.
 *
 * EVERY AUTHORITY ACT NEEDS ITS OWN FRESH PROOF. Approve, amend, reject, defer,
 * reverse and supersede are six distinct permissions (§27.313 minimum
 * authority). None reuses `prior.authority`, which would prove only that someone
 * was once allowed to do something else.
 *
 * AUTHORITY IS PROVEN AT THE MOMENT OF THE ACT, then recorded immutably. §11.180
 * requires an active decision to explain itself as "approved under this authority
 * … and remains active until this review condition"; §11.44/§11.45 give the
 * decision its own duration. A later authorization expiry does not retroactively
 * unmake the decision — it is a reason to review it (§11.47).
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
import {
  authorityBindingHash,
  bindingForCandidate,
  DECISION_ACTION,
  type DecisionAct,
  type DecisionAuthorizationBinding,
} from './binding'
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
  DecisionStatus,
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
  /** Successor missing, not a decision, cross-project, self, or cyclic (§11.56). */
  | 'invalid_successor'
  /** The act is not permitted from the decision's current state. */
  | 'invalid_lifecycle'
  /** §11.58 — completion needs a measured outcome, not an assumption. */
  | 'outcome_required'
  /** §11.58 — completion follows "successful execution AND review". */
  | 'review_required'
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

/**
 * The terms of one authority act. Everything here is bound into the
 * authorization: none of it can change after the human said yes.
 */
export interface ApproveDecisionArgs extends CommonArgs {
  decisionId:  string
  /**
   * Authorization V1 proof. What it must cover is DERIVED from the candidate
   * approved record; the caller cannot choose or weaken it.
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

/** §11.53 — rejection records "Authority rejecting it", so it needs its own proof. */
export interface SettleDecisionArgs extends CommonArgs {
  decisionId: string
  authorizationId: string
  reason:     string
}

/** §11.57 — reversal needs its own current authority, not the approval's. */
export type ReverseDecisionArgs = SettleDecisionArgs

/** §11.58 — completion observes a finish; it authorizes nothing new. */
export interface CompleteDecisionArgs extends CommonArgs {
  decisionId: string
  reason:     string
}

export interface SupersedeDecisionArgs extends CommonArgs {
  decisionId:   string
  /** An existing APPROVED or ACTIVE decision in the same project (§11.56). */
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

/** The act content a caller's arguments produce, before identity and clock. */
type CandidateInput = Omit<BuildDecisionRecordInput, 'principalId' | 'occurredAt' | 'baseRecordCount'>

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
  if (!access.ok) return { state: null, status: 'no_principal' }
  return { userId: access.userId, allowedProjectIds: access.allowedProjectIds }
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

// ── Lifecycle transition matrix (§§11.49–11.58) ───────────────────────────────
//
// Legal SOURCE states for each act, evaluated against the state derived at the
// moment of the act — so `approved` (accepted, effective date possibly in the
// future, §11.51) is distinguished from `active` (currently governing, §11.52).
// Anything not listed is refused. Fail closed.

const LEGAL_SOURCE: Record<string, ReadonlySet<DecisionStatus>> = {
  // §11.51 — an authorized actor accepts an open decision.
  approved:  new Set(['draft', 'proposed', 'deferred']),
  // §11.53 — a rejected proposal; nothing decided may be un-decided this way.
  rejected:  new Set(['draft', 'proposed', 'deferred']),
  // §11.54 — delay an open decision. A settled one is not delayed, it is done.
  deferred:  new Set(['draft', 'proposed']),
  // §11.62 — amend a live commitment. History (§11.60) is not amended.
  amended:   new Set(['approved', 'active']),
  // §11.57 — actively undo a decision that stands. Undoing an expired decision
  // is meaningless: "Reversal is different from expiration."
  reversed:  new Set(['approved', 'active']),
  // §11.56 — replace a decision that is still in force, or one whose window has
  // closed but whose commitment a newer decision now restates.
  superseded: new Set(['approved', 'active', 'expired']),
  // §11.58 — "After successful execution and review". Something must have run,
  // so a future-effective `approved` decision cannot complete.
  completed: new Set(['active', 'expired']),
  // §11.96 — an outcome needs consequences to observe; `superseded before
  // evaluation` is an explicit canonical outcome status, so a closed decision
  // may still receive one.
  outcome_observed: new Set(['active', 'expired', 'completed', 'reversed', 'superseded']),
  // §11.102 — a lesson may be recorded about any decision, including a rejected
  // one. Learning is never gated on the answer having been yes.
  reviewed: new Set([
    'draft', 'proposed', 'approved', 'active', 'rejected',
    'deferred', 'expired', 'superseded', 'reversed', 'completed',
  ]),
}

/**
 * §11.51 vs §11.52 — did this decision ever actually take effect?
 *
 * The derived status name alone is not enough: a decision reversed the day
 * after approval but before its future effective date is `reversed`, and never
 * governed anything. An outcome or a completion for it would be fiction.
 */
function tookEffect(prior: DerivedDecisionState, at: string): boolean {
  return prior.effectiveAt != null && Date.parse(prior.effectiveAt) <= Date.parse(at)
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

/**
 * Validate a prospective act and, if it needs authority, prove it — then append.
 *
 * The candidate is built ONCE from `input`. The only field added after the
 * authorization is checked is `authority` itself, which `binding.ts` excludes
 * from the bound projection by construction; the equality check below turns that
 * argument into an enforced invariant rather than a comment.
 */
async function commitAct(
  context: { principal: Principal; store: DecisionLedgerStore; at: string; records: DecisionRecord[] },
  input: CandidateInput,
  authority: { authorizationId: string; act: DecisionAct } | null,
): Promise<DecisionWriteResult> {
  const { principal, store, at, records } = context

  const base: BuildDecisionRecordInput = {
    ...input,
    principalId: principal.userId,
    occurredAt: at,
    baseRecordCount: records.length,
  }

  let candidate: DecisionRecord
  try {
    // A candidate for an authority act cannot be built with its authority yet —
    // the authority is computed FROM it. Build the content first; the proof is
    // attached below and re-verified against this same content.
    candidate = buildDecisionRecord(
      authority ? { ...base, authority: PROVISIONAL_AUTHORITY(authority.act) } : base,
    )
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'invalid')
  }

  let final = candidate
  let proven: DecisionAuthorizationBinding | null = null

  if (authority) {
    const binding = bindingForCandidate(candidate, authority.act)
    const resolved = await isAuthorizationEffective(
      authority.authorizationId,
      { projectId: binding.projectId, target: binding.target, actionKind: binding.actionKind },
      { now: at },
    )
    if (!resolved.effective || !resolved.state) {
      return DENY('authority_not_effective', `${resolved.status}:${resolved.reason}`)
    }
    // §11.39/§11.40 — "This prevents authority from being assumed
    // retrospectively." An Atlas or service-role call carrying someone else's
    // grant is not that human exercising authority.
    if (resolved.state.principalId !== principal.userId) {
      return DENY('authority_principal_mismatch')
    }
    const record: DecisionAuthorityRecord = {
      basis: 'founder_owner',
      authorizationId: authority.authorizationId,
      principalId: resolved.state.principalId,
      actionKind: binding.actionKind,
      boundVersionHash: binding.target.versionHash,
      authorityActAt: at,
    }
    final = { ...candidate, authority: record }
    proven = binding

    // The act that gets appended must hash to exactly what was authorized.
    if (authorityBindingHash(final) !== proven.target.versionHash) {
      return DENY('invalid_request', 'authority-binding-drift')
    }
  }

  // PREFLIGHT. The pure core is the authority on what a lineage may contain, and
  // it runs before the irreversible step — never after it.
  try {
    deriveDecisionState([...records, final], { at })
  } catch (error) {
    return DENY('invalid_lifecycle', error instanceof Error ? error.message : 'malformed')
  }

  try {
    await store.append(final)
  } catch (error) {
    return isConflict(error) ? DENY('conflict') : DENY('unavailable')
  }
  try {
    return { state: deriveDecisionState(await store.lineage(final.decisionId), { at }), status: 'ok' }
  } catch {
    return DENY('unavailable')
  }
}

/**
 * Structural placeholder so a candidate carrying an authority act can be built
 * and hashed before its proof exists. Excluded from the bound projection, and
 * never appended: `commitAct` replaces it with the resolved proof and refuses if
 * the content hash moved.
 */
const PROVISIONAL_AUTHORITY = (act: DecisionAct): DecisionAuthorityRecord => ({
  basis: 'founder_owner',
  authorizationId: 'pending',
  principalId: 'pending',
  actionKind: DECISION_ACTION[act],
  boundVersionHash: 'pending',
  authorityActAt: '1970-01-01T00:00:00.000Z',
})

type ActArgs =
  | ({ act: 'approve' } & Omit<ApproveDecisionArgs, 'authorizationId'>)
  | ({ act: 'amend' } & Omit<AmendDecisionArgs, 'authorizationId'>)
  | ({ act: 'reject' | 'defer' | 'reverse' } & Omit<SettleDecisionArgs, 'authorizationId'>)
  | ({ act: 'supersede' } & Omit<SupersedeDecisionArgs, 'authorizationId'>)

/**
 * Build the candidate act's content from the caller's terms and the prior state.
 *
 * SHARED deliberately: `prepareDecisionAct` shows a human the binding this
 * produces, and the act functions bind against it. One function means the two
 * cannot drift, so what was shown is what is enforced.
 */
function planFor(
  args: ActArgs,
  prior: DerivedDecisionState,
): { input: CandidateInput } | DecisionWriteResult {
  const carried = carryForward(prior)
  switch (args.act) {
    case 'approve':
      return { input: {
        ...carried,
        type: 'approved',
        decisionId: args.decisionId,
        rationale: args.rationale,
        effectiveAt: args.effectiveAt,
        expiresAt: args.expiresAt ?? null,
        review: args.review,
      } }
    case 'amend': {
      const materiality = args.materiality ?? prior.materiality
      // §11.18 — an amendment must still be ledger-material.
      if (!isLedgerMaterial({ materiality })) return DENY('not_ledger_material')
      return { input: {
        ...carried,
        type: 'amended',
        decisionId: args.decisionId,
        version: prior.version + 1,
        title: args.title ?? prior.title,
        statement: args.statement ?? prior.statement,
        materiality,
        rationale: args.rationale,
        effectiveAt: args.effectiveAt,
        expiresAt: args.expiresAt ?? null,
        review: args.review,
        reversalConditions: args.reversalConditions ?? prior.reversalConditions,
        reason: args.reason,
      } }
    }
    case 'supersede':
      return { input: {
        ...carried,
        type: 'superseded',
        decisionId: args.decisionId,
        supersededBy: args.supersededBy,
        reason: args.reason ?? 'Superseded by a newer decision.',
      } }
    default:
      return { input: {
        ...carried,
        type: args.act === 'reject' ? 'rejected' : args.act === 'defer' ? 'deferred' : 'reversed',
        decisionId: args.decisionId,
        reason: args.reason,
      } }
  }
}

function gate(prior: DerivedDecisionState, type: string): DecisionWriteResult | null {
  const legal = LEGAL_SOURCE[type]
  if (!legal || !legal.has(prior.status)) return DENY('invalid_lifecycle', prior.status)
  return null
}

/**
 * What authorization would this act require?
 *
 * A human cannot meaningfully authorize an act they have not been shown, and
 * the binding is a hash of the act's exact content — so the caller preparing an
 * approval request needs the same candidate the write path will build. This
 * returns it WITHOUT appending anything: same authentication, same project
 * authority, same lifecycle gate, same candidate construction, no write.
 *
 * It is the only supported way to obtain a Decision Ledger binding. Nothing
 * about the returned binding is caller-controlled — changing the terms changes
 * the binding, which is the entire point.
 */
export async function prepareDecisionAct(
  args: ActArgs,
): Promise<{ binding: DecisionAuthorizationBinding | null; status: DecisionWriteStatus; detail?: string }> {
  const open = await openFor(args)
  if ('status' in open) return { binding: null, status: open.status, detail: open.detail }
  const { prior, principal, at, records } = open

  const plan = planFor(args, prior)
  if ('status' in plan) return { binding: null, status: plan.status, detail: plan.detail }

  const refused = gate(prior, plan.input.type)
  if (refused) return { binding: null, status: refused.status, detail: refused.detail }

  try {
    const candidate = buildDecisionRecord({
      ...plan.input,
      authority: PROVISIONAL_AUTHORITY(args.act),
      principalId: principal.userId,
      occurredAt: at,
      baseRecordCount: records.length,
    })
    return { binding: bindingForCandidate(candidate, args.act), status: 'ok' }
  } catch (error) {
    return { binding: null, status: 'invalid_request', detail: error instanceof Error ? error.message : 'invalid' }
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
  const at = args.now ?? new Date().toISOString()

  return commitAct({ principal, store, at, records: [] }, {
    type: args.asDraft ? 'drafted' : 'proposed',
    decisionId: newDecisionId(),
    projectId: args.projectId,
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
  }, null)
}

/**
 * Approve a decision (§11.51) under an Authorization V1 proof bound to the exact
 * approved record — its rationale, effective date, expiry and review condition
 * included (§11.41, "Conditions. Edited terms.").
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
  const { prior } = open

  const refused = gate(prior, 'approved')
  if (refused) return refused

  const plan = planFor({ ...args, act: 'approve' }, prior)
  if ('status' in plan) return plan
  return commitAct(open, plan.input, { authorizationId: args.authorizationId, act: 'approve' })
}

/**
 * §11.59/§11.62 — a material amendment creates version N+1 under its OWN fresh
 * authority, bound to the CONTENT OF N+1. An amendment authorized as "widen the
 * trial to 30 days" cannot append "and remove the review condition": those hash
 * differently, so the grant does not cover the second act.
 *
 * Version N stays in the immutable lineage (§11.63). §11.61's non-material
 * corrections are deliberately not funded in V1 — every amendment here is
 * material and takes the full decision process.
 */
export async function amendDecision(args: AmendDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  const refused = gate(prior, 'amended')
  if (refused) return refused

  const plan = planFor({ ...args, act: 'amend' }, prior)
  if ('status' in plan) return plan
  return commitAct(open, plan.input, { authorizationId: args.authorizationId, act: 'amend' })
}

/**
 * §11.53 — reject a proposal. "A rejected decision should preserve: Original
 * proposal. Recommendation. AUTHORITY REJECTING IT. Reason if supplied." Canon
 * names the authority explicitly, so rejection is an authority act with its own
 * `decision.reject` permission, bound to the recorded reason.
 */
export async function rejectDecision(args: SettleDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  const refused = gate(prior, 'rejected')
  if (refused) return refused

  const plan = planFor({ ...args, act: 'reject' }, prior)
  if ('status' in plan) return plan
  return commitAct(open, plan.input, { authorizationId: args.authorizationId, act: 'reject' })
}

/**
 * §11.54 — defer. Canon lists a deferral's required contents without naming an
 * authority, unlike the adjacent §11.53. That absence is not an exemption, and
 * §11.39 requires the ledger to identify the authority behind a decision, so V1
 * fails closed and requires a `decision.defer` proof. Deferred decisions must
 * not disappear; they may be taken up again later.
 */
export async function deferDecision(args: SettleDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  const refused = gate(prior, 'deferred')
  if (refused) return refused

  const plan = planFor({ ...args, act: 'defer' }, prior)
  if ('status' in plan) return plan
  return commitAct(open, plan.input, { authorizationId: args.authorizationId, act: 'defer' })
}

/**
 * §11.57 — actively undo a decision that stands, distinct from expiration.
 *
 * Reversal is an exercise of authority in its own right, so it needs its own
 * current proof bound to the decision, its version AND the recorded reason —
 * §11.57 preserves "Reason for reversal. Authority. Evidence." `prior.authority`
 * shows only that someone was once allowed to approve this; reusing it would let
 * a stale approval grant, or an unattended Atlas call, undo a standing
 * institutional commitment. Both authority acts survive on their own records.
 *
 * "Affected missions" and "Recovery requirements" (§11.57) belong to Mission
 * architecture, which Stage 1 does not fund; no field exists to bind, and none
 * is invented here.
 */
export async function reverseDecision(args: ReverseDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  const refused = gate(prior, 'reversed')
  if (refused) return refused

  const plan = planFor({ ...args, act: 'reverse' }, prior)
  if ('status' in plan) return plan
  return commitAct(open, plan.input, { authorizationId: args.authorizationId, act: 'reverse' })
}

/**
 * §11.58 — "After successful execution and review, the decision may be
 * completed." Canon names both conditions, so completion requires:
 *
 *   • that the decision actually took effect — a future-effective `approved`
 *     decision has executed nothing (§11.51);
 *   • a MEASURED outcome in the lineage — `not_yet_measurable` asserts nothing
 *     (§11.96), and letting it close a decision would dress "we stopped paying
 *     attention" up as "this finished";
 *   • a recorded review (§11.102), which is the second half of the sentence.
 *
 * Not an authority act: acknowledging a finish authorizes nothing new, so it
 * takes no authorization and carries the approval provenance forward.
 */
export async function completeDecision(args: CompleteDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior, records, at } = open

  const refused = gate(prior, 'completed')
  if (refused) return refused
  if (!tookEffect(prior, at)) return DENY('invalid_lifecycle', 'never_effective')

  const measured = records.some(
    record => record.type === 'outcome_observed'
      && record.outcome != null
      && record.outcome.status !== 'not_yet_measurable',
  )
  if (!measured) return DENY('outcome_required')

  const reviewed = records.some(record => record.type === 'reviewed')
  if (!reviewed) return DENY('review_required')

  return commitAct(open, {
    ...carryForward(prior),
    type: 'completed',
    decisionId: args.decisionId,
    authority: prior.authority,
    outcome: prior.outcome,
    reason: args.reason,
  }, null)
}

/** How far the successor chain is walked before a supersession is refused. */
const SUCCESSOR_CHAIN_LIMIT = 64

/**
 * §11.56 — "A decision becomes superseded when replaced by a NEWER DECISION."
 *
 * A draft, a proposal, a rejected candidate and a deferred candidate are not
 * decisions (§11.49, §11.50, §11.53, §10.3), so none of them may replace one:
 * accepting a proposal as a successor would let a decision be retired by
 * something nobody ever authorized. The successor must itself be an approved or
 * active decision in the same project.
 *
 * The chain is then walked to the limit above. A cycle — A→B→C→A — leaves every
 * decision in it superseded and none of them governing, which is a hole in the
 * institutional record rather than a history. Missing or unreadable links deny.
 *
 * A missing successor, a successor in another project and a successor that is
 * not a decision deny identically: this must not become a cross-project
 * decision-id oracle.
 */
export async function supersedeDecision(args: SupersedeDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { store, at, prior } = open

  const refused = gate(prior, 'superseded')
  if (refused) return refused

  if (args.supersededBy === args.decisionId) return DENY('invalid_successor', 'self')

  // Bounded, deterministic, fail-closed walk of the replacement chain. Not a
  // graph engine: one pointer per decision, one visited set, a hard limit.
  //
  // Checked BEFORE the successor's own lifecycle, because a cycle is a fact
  // about the graph and reporting it as "not a decision" would hide it. In
  // practice the lifecycle rule below already makes cycles unreachable — a
  // superseded decision can never be a successor — but that leaves the graph
  // unguarded if the rule is ever relaxed, and defence in depth is cheap here.
  const visited = new Set<string>([args.decisionId])
  let successorState: DerivedDecisionState | null = null
  let cursor: string | null = args.supersededBy
  for (let step = 0; cursor; step += 1) {
    if (step >= SUCCESSOR_CHAIN_LIMIT) return DENY('invalid_successor', 'chain_too_long')
    if (visited.has(cursor)) return DENY('invalid_successor', 'cycle')
    visited.add(cursor)
    let state: DerivedDecisionState
    try {
      const chain = await store.lineage(cursor)
      if (chain.length === 0) {
        // A dangling link deeper in the chain is history we cannot read; only
        // the immediate successor's absence is a rejection of THIS act.
        if (step === 0) return DENY('invalid_successor', 'unknown_or_foreign')
        break
      }
      if (chain[0].projectId !== prior.projectId) return DENY('invalid_successor', 'unknown_or_foreign')
      state = deriveDecisionState(chain, { at })
    } catch {
      return DENY('invalid_successor', 'unknown_or_foreign')
    }
    if (step === 0) successorState = state
    cursor = state.supersededBy
  }
  if (!successorState || (successorState.status !== 'approved' && successorState.status !== 'active')) {
    return DENY('invalid_successor', 'successor_not_a_decision')
  }

  const plan = planFor({ ...args, act: 'supersede' }, prior)
  if ('status' in plan) return plan
  return commitAct(open, plan.input, { authorizationId: args.authorizationId, act: 'supersede' })
}

/**
 * §11.96 — record what actually happened. Appends; never overwrites the original
 * decision or its expected impact. An outcome in another project is impossible
 * here: scope comes from the decision's own lineage.
 *
 * A decision that never took effect has no outcome to observe. §11.51 lets an
 * approved decision sit with a future effective date, so the status name alone
 * is not the test — the effective date must actually have passed. Attaching an
 * outcome to a commitment that never ran would fabricate consequences and
 * corrupt §8.4 calibration by scoring decisions that never executed.
 */
export async function observeOutcome(args: ObserveOutcomeArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior, at } = open

  const refused = gate(prior, 'outcome_observed')
  if (refused) return refused
  if (!tookEffect(prior, at)) return DENY('invalid_lifecycle', 'never_effective')

  return commitAct(open, {
    ...carryForward(prior),
    type: 'outcome_observed',
    decisionId: args.decisionId,
    authority: prior.authority,
    outcome: args.outcome,
  }, null)
}

/**
 * §11.102 — record a lesson from review. Lessons accumulate; they never rewrite
 * the reasoning that was recorded at decision time. A lesson may be drawn from
 * any decision, including one that was rejected — §11.99/§11.100 keep decision
 * quality and outcome quality separate. Chapter 12 owns the full review and
 * decay architecture and is not implemented here.
 */
export async function recordDecisionReview(args: ReviewDecisionArgs): Promise<DecisionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  const refused = gate(prior, 'reviewed')
  if (refused) return refused

  return commitAct(open, {
    ...carryForward(prior),
    type: 'reviewed',
    decisionId: args.decisionId,
    authority: prior.authority,
    reviewNote: args.reviewNote,
  }, null)
}
