/**
 * lib/atlas/delegation/principal-write.ts — the sanctioned write boundary for
 * Executive to Manager delegation.
 *
 * ORDERING RULE, unchanged from the Mission module: authenticate → establish
 * project authority → only then touch the privileged store. An unknown envelope
 * and a foreign-project envelope return one indistinguishable `not_permitted`,
 * so this boundary can never become an existence oracle.
 *
 * THE MISSION IS RE-ASKED EVERY TIME (§21.14). An envelope is not a token. It
 * is a claim about a Mission, and the Mission is the authority — so prepare,
 * decide, revoke and replan each resolve the live Mission through
 * `resolveMissionEvaluation`, the Mission module's single public evaluation
 * surface, and each fails closed when that surface says no. An envelope over a
 * cancelled, superseded, expired or unauthorized Mission is inert no matter
 * what its own row says.
 *
 * VERSION PINNING IS A HARD STOP (§21.15). An envelope prepared against Mission
 * version N is decided against version N or not at all. It never floats to N+1:
 * an amendment is exactly the event the Executive must see, and silently
 * carrying acceptance across it would make amendment meaningless.
 *
 * THE CALLER DOES NOT CHOOSE THE OUTCOME (§21.16). There is no `accept()` that
 * takes `accepted: true`. There is `decideDelegation`, which runs the §21.16
 * checks and appends whichever of accepted/rejected the checks produce. A human
 * with project access may ASK the Manager to decide; only the checks decide.
 *
 * ACTORS ARE NOT INTERCHANGEABLE (§21.19). The service role is not a human, a
 * human is not the Manager, and the Manager is not an Executive. Preparing and
 * revoking are Executive principal acts and record the acting user. Deciding
 * and replanning are Manager acts and record the Manager, never borrowing the
 * requesting human's identity to make the ledger look authoritative.
 *
 * NOTHING HERE EXECUTES ANYTHING. No task is created, no run is started, no
 * tool is called, no message is sent. §21.13 — the envelope's tool list is a
 * ceiling, and this module has no floor to stand on: it imports no runner,
 * dispatcher, executor or publisher.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveMissionEvaluation, type MissionReadArgs } from '@/lib/atlas/mission/principal-read'
import type { MissionEvaluation, MissionRequirement } from '@/lib/atlas/mission/types'
import { isTerminalMissionStatus } from '@/lib/atlas/mission/derive'
import type { MissionAvailability } from '@/lib/atlas/mission/capability'
import { registryAvailability, capabilityFindings } from './availability'
import { attenuate, envelopeIsContained, type AttenuationParent, type AttenuationViolation, type DelegationNarrowing } from './attenuate'
import { missionBoundHash } from './binding'
import { classifyChange, type ProposedChange } from './classify'
import {
  deriveDelegationState, isDecidable, MalformedDelegationError, MANAGER_ACTOR_ID,
  nextLineageSequence,
} from './derive'
import { createDelegationLedgerStore, DelegationConflictError, type DelegationLedgerStore } from './store'
import type {
  DelegationEnvelope,
  DelegationRecord,
  DelegationRejection,
  DelegationReplan,
  DelegationRevocationReason,
  DerivedDelegationState,
} from './types'

export type DelegationWriteStatus =
  | 'ok'
  | 'no_principal'
  /** Caller supplied the scope and does not own it — reveals nothing new. */
  | 'project_denied'
  /** Unknown OR foreign, deliberately indistinguishable. Never split these. */
  | 'not_permitted'
  | 'invalid_request'
  /** §21.14 — the parent Mission does not authorize movement right now. */
  | 'mission_not_authorized'
  /** §21.15 — the Mission moved to a new version; this envelope stays pinned. */
  | 'mission_version_changed'
  /**
   * §21.15 — the Mission's delegable bounds no longer hash to what this
   * envelope was cut from, at the SAME version number. Distinct from a version
   * change: the version says nothing moved, and the hash says something did.
   */
  | 'mission_bound_hash_changed'
  /** §6.39 — the requested envelope is not contained by the Mission. */
  | 'delegation_exceeds_mission'
  /** The act is not permitted from the envelope's current derived state. */
  | 'invalid_lifecycle'
  /** A competing decision won the race; the lineage is unchanged. */
  | 'conflict'
  /** The append landed and produced a lineage the invariants forbid. */
  | 'integrity_violation'
  | 'unavailable'

export interface DelegationWriteResult {
  state: DerivedDelegationState | null
  status: DelegationWriteStatus
  /** Names the failed invariant. Never leaks a path or a foreign identifier. */
  detail?: string
  /** §6.39 — every containment failure, when that is why. */
  violations?: AttenuationViolation[]
  /** §21.17 — the typed grounds, when the Manager refused. */
  rejections?: DelegationRejection[]
  /** §21.24 — the classification, when a replan was recorded. */
  replan?: DelegationReplan
}

/**
 * The Manager's ledger identity.
 *
 * A constant, not a user id and not the service role. §21.19 — when the ledger
 * says the Manager accepted, that must be true of the Manager rather than of
 * whichever human happened to trigger the evaluation.
 *
 * Defined in the pure core and re-exported here, so the boundary that WRITES
 * the identity and the invariant that VALIDATES it can never drift apart.
 */
export { MANAGER_ACTOR_ID } from './derive'

interface CommonArgs {
  store?: DelegationLedgerStore
  /** Injected clock; production callers omit it. */
  now?: string
  /** Forwarded to the Mission module's evaluation seam; tests inject. */
  mission?: Pick<MissionReadArgs, 'store' | 'projectMode' | 'availability'>
}

const DENY = (
  status: DelegationWriteStatus,
  detail?: string,
  extra?: Partial<DelegationWriteResult>,
): DelegationWriteResult => ({
  state: null,
  status,
  ...(detail ? { detail } : {}),
  ...(extra ?? {}),
})

interface Principal { userId: string; allowedProjectIds: string[] }

/** Step 1 of the ordering rule. Nothing privileged runs before this resolves. */
async function authenticate(): Promise<Principal | DelegationWriteResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { state: null, status: 'no_principal' }
  return { userId: access.userId, allowedProjectIds: access.allowedProjectIds }
}

/** Every Mission fact an envelope may be cut from, and nothing else. */
export function parentFromMission(evaluation: MissionEvaluation): AttenuationParent {
  const s = evaluation.state
  return {
    missionId: s.missionId,
    projectId: s.projectId,
    version: s.version,
    objective: s.objective,
    expectedOutcome: s.expectedOutcome,
    deliverables: s.deliverables,
    successCriteria: s.successCriteria,
    inScope: s.inScope,
    outOfScope: s.outOfScope,
    constraints: s.constraints,
    authority: s.authority,
    allowedActions: s.allowedActions,
    forbiddenActions: s.forbiddenActions,
    tools: s.tools,
    dataScope: s.dataScope,
    budget: s.budget,
    deadline: s.deadline,
    approvalGates: s.approvalGates,
    escalationTriggers: s.escalationTriggers,
    stopConditions: s.stopConditions,
    reporting: s.reporting,
    dependencies: s.dependencies,
  }
}

/**
 * Resolve the live Mission and fail closed unless it authorizes movement NOW.
 *
 * The availability seam is the real registry check, not the unproven default:
 * this is the path §20.105 was waiting for, and a Manager deciding whether it
 * can do the work is exactly where the question belongs.
 */
async function liveMission(
  principal: Principal,
  missionId: string,
  args: CommonArgs,
  at: string,
): Promise<{ evaluation: MissionEvaluation; parent: AttenuationParent } | DelegationWriteResult> {
  const { evaluation, status } = await resolveMissionEvaluation(missionId, {
    ...args.mission,
    now: at,
    availability: args.mission?.availability ?? registryAvailability,
  })
  if (status === 'no_principal') return DENY('no_principal')
  if (status === 'unavailable') return DENY('unavailable')
  // Unknown mission and foreign mission collapse to one class, matching the
  // Mission module's own denial semantics.
  if (status !== 'ok' || !evaluation) return DENY('not_permitted')

  // Belt and braces: the Mission module already scoped this read, but the
  // delegation boundary states its own isolation rather than inheriting an
  // assumption from a module it does not control.
  if (!assertProjectAllowed(evaluation.state.projectId, principal.allowedProjectIds)) {
    return DENY('not_permitted')
  }

  // §21.27 — the Mission ended, so anything derived from it ended with it.
  // The predicate is the Mission domain's, not a local copy: EI-S1.4C-R1 kept
  // its own six-status list here, and the read boundary had none at all.
  if (isTerminalMissionStatus(evaluation.state.status)) {
    return DENY('mission_not_authorized', `mission_${evaluation.state.status}`)
  }
  if (!evaluation.authority.authorized) {
    return DENY('mission_not_authorized', evaluation.authority.reason)
  }
  return { evaluation, parent: parentFromMission(evaluation) }
}

/** Load an envelope lineage after authenticating, scoping from the chain itself. */
async function openEnvelope(
  principal: Principal,
  store: DelegationLedgerStore,
  envelopeId: string,
): Promise<{ state: DerivedDelegationState; records: DelegationRecord[] } | DelegationWriteResult> {
  let records: DelegationRecord[]
  try {
    records = await store.lineage(envelopeId)
  } catch {
    return DENY('unavailable')
  }
  if (records.length === 0) return DENY('not_permitted')
  if (!assertProjectAllowed(records[0].projectId, principal.allowedProjectIds)) {
    return DENY('not_permitted')
  }
  try {
    return { state: deriveDelegationState(records), records }
  } catch (error) {
    if (error instanceof MalformedDelegationError) return DENY('integrity_violation', error.message)
    return DENY('invalid_request', 'malformed')
  }
}

/** authenticate → project authority → lineage. Shared by every act on an envelope. */
async function openFor(
  args: CommonArgs & { envelopeId: string },
): Promise<
  | { principal: Principal; store: DelegationLedgerStore; at: string; prior: DerivedDelegationState; records: DelegationRecord[] }
  | DelegationWriteResult
> {
  const principal = await authenticate()
  if ('status' in principal) return principal

  const store = args.store ?? createDelegationLedgerStore()
  const at = args.now ?? new Date().toISOString()

  const opened = await openEnvelope(principal, store, args.envelopeId)
  if ('status' in opened) return opened
  return { principal, store, at, prior: opened.state, records: opened.records }
}

/** Append, then re-derive from the real lineage. Never trust the write blindly. */
async function commit(
  store: DelegationLedgerStore,
  record: DelegationRecord,
  priorRecords: DelegationRecord[],
): Promise<DelegationWriteResult> {
  // Preflight: fold the candidate through the pure core BEFORE the append, so
  // an act that would corrupt the lineage never reaches the table at all.
  try {
    deriveDelegationState([...priorRecords, record])
  } catch (error) {
    return DENY('invalid_lifecycle', error instanceof Error ? error.message : 'malformed')
  }

  try {
    await store.append(record)
  } catch (error) {
    if (error instanceof DelegationConflictError) return DENY('conflict')
    return DENY('unavailable')
  }

  let after: DelegationRecord[]
  try {
    after = await store.lineage(record.envelopeId)
  } catch {
    return DENY('unavailable')
  }
  try {
    return { state: deriveDelegationState(after), status: 'ok' }
  } catch (error) {
    // The row is permanent and a retry cannot help. §29.7 — institutional
    // history needs a human, not a silent recovery.
    return DENY('integrity_violation', error instanceof Error ? error.message : 'malformed')
  }
}

const newId = () => crypto.randomUUID()

/**
 * §21.15 — does this envelope's pin still describe the live Mission?
 *
 * TWO CHECKS, NOT ONE. The version number answers "did the Mission move to a
 * new commitment", and the bound hash answers "does that version still say what
 * this envelope was cut from". EI-S1.4C-R1 shipped the hash as provenance only,
 * so a stored row whose `missionBoundHash` disagreed with the live Mission was
 * still accepted and still reported usable as long as the version matched — the
 * hash was written, carried and never consulted. A pin nobody reads is a
 * comment, so it is read here on every operational use.
 */
function pinBroken(
  pinnedVersion: number,
  pinnedHash: string,
  parent: AttenuationParent,
): DelegationWriteStatus | null {
  if (pinnedVersion !== parent.version) return 'mission_version_changed'
  if (pinnedHash !== missionBoundHash(parent)) return 'mission_bound_hash_changed'
  return null
}

// Prepare (Executive)

export interface PrepareDelegationArgs extends CommonArgs {
  missionId: string
  /** Optional narrowing. Omitted fields inherit the Mission's bounds whole. */
  narrowing?: DelegationNarrowing
  note?: string
}

/**
 * §21.12 — cut a bounded envelope from an exact Mission version.
 *
 * The caller supplies narrowings and nothing else. Project, mission, version,
 * objective and every inherited prohibition come from the Mission, so there is
 * no field a caller could restate into something wider.
 */
export async function prepareDelegation(
  args: PrepareDelegationArgs,
): Promise<DelegationWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal

  const store = args.store ?? createDelegationLedgerStore()
  const at = args.now ?? new Date().toISOString()

  const live = await liveMission(principal, args.missionId, args, at)
  if ('status' in live) return live

  const result = attenuate(live.parent, args.narrowing ?? {}, 'manager')
  if (!result.ok) {
    return DENY('delegation_exceeds_mission', 'containment', { violations: result.violations })
  }

  const envelopeId = newId()
  const boundHash = missionBoundHash(live.parent)
  const envelope: DelegationEnvelope = {
    ...result.envelope,
    envelopeId,
    missionBoundHash: boundHash,
  }

  const record: DelegationRecord = {
    recordId: newId(),
    envelopeId,
    projectId: live.parent.projectId,
    actType: 'delegation.prepared',
    occurredAt: at,
    missionId: live.parent.missionId,
    missionVersion: live.parent.version,
    missionBoundHash: boundHash,
    envelope,
    rejections: [],
    replan: null,
    // §21.19 — the human who cut the envelope, recorded as themselves.
    actorKind: 'executive_principal',
    actorId: principal.userId,
    note: args.note ?? null,
    revokedReason: null,
    // The opening act of a lineage that does not yet exist.
    lineageSequence: nextLineageSequence([]),
  }

  return commit(store, record, [])
}

// Decide (Manager)

/**
 * §21.16 — the Manager's acceptance checks.
 *
 * Every reason below is decided by deterministic code reading structured data.
 * No model is consulted, because a model that can be persuaded to accept is not
 * a boundary. The Mission module's own readiness computation is reused rather
 * than reimplemented: two independent opinions about whether a Mission is ready
 * would eventually disagree, and the Mission's is authoritative.
 */
const REQUIREMENT_TO_REASON: Partial<Record<MissionRequirement, DelegationRejection['reason']>> = {
  objective: 'objective_ambiguous',
  success_criteria: 'objective_ambiguous',
  authority: 'authority_insufficient',
  current_authorization: 'authority_insufficient',
  tools: 'tool_unavailable',
  tool_availability: 'tool_unavailable',
  data_scope: 'data_unavailable',
  data_availability: 'data_unavailable',
  dependencies: 'dependency_unavailable',
  deadline: 'deadline_infeasible',
  deadline_expired: 'deadline_infeasible',
  stop_condition: 'escalation_missing',
  approval_gate: 'escalation_missing',
  gate_blocked: 'constraint_conflict',
  gate_unresolved: 'constraint_conflict',
  gate_conflict: 'constraint_conflict',
  unresolved_blocker: 'dependency_unavailable',
  project_mode_changed: 'mission_not_current',
  project_mode_not_operational: 'mission_not_current',
  project: 'project_mismatch',
}

/**
 * Run the §21.16 checks against an envelope and its live Mission.
 *
 * Pure with respect to the ledger: it reads and returns grounds, and appends
 * nothing. Exported so the checks can be exercised directly, and so a caller
 * can preview a decision without recording one.
 */
export function delegationRejectionGrounds(
  envelope: DelegationEnvelope,
  parent: AttenuationParent,
  evaluation: MissionEvaluation,
  at: string,
  /**
   * What the capability source actually proved for THIS envelope's tools and
   * data. Passed in rather than recomputed: EI-S1.4C-R1 first wired the
   * registry's own logic in here directly, which made the Manager's §21.16 tool
   * check un-injectable and — because no tool registry exists — permanently
   * unable to accept any envelope that declared a tool. The Manager must decide
   * against the same source the Mission will later be judged by, or acceptance
   * and activation answer to two different truths.
   */
  proven: MissionAvailability,
): DelegationRejection[] {
  const grounds: DelegationRejection[] = []
  const push = (r: DelegationRejection) => {
    if (!grounds.some(g => g.reason === r.reason && g.subject === r.subject)) grounds.push(r)
  }

  // §21.15 — pinned version must still be the Mission's current version.
  if (envelope.missionVersion !== parent.version) {
    push({ reason: 'mission_not_current', subject: `v${envelope.missionVersion}`, detail: `mission is now v${parent.version}` })
  }
  if (envelope.projectId !== parent.projectId) {
    push({ reason: 'project_mismatch', subject: envelope.projectId, detail: null })
  }

  // §6.39 — re-prove containment. A stored row is never authority on its own.
  for (const v of envelopeIsContained(parent, envelope)) {
    push({ reason: 'delegation_exceeds_mission', subject: `${v.field}:${v.element}`, detail: v.rule })
  }

  // §21.16 "Objective is unambiguous" — structurally, not semantically. An
  // empty objective, no deliverable and no success criterion leave the Manager
  // nothing to aim at or to be judged against.
  if (envelope.objective.trim().length === 0) {
    push({ reason: 'objective_ambiguous', subject: 'objective', detail: 'empty' })
  }
  if (envelope.successCriteria.length === 0 && envelope.deliverables.length === 0) {
    push({ reason: 'objective_ambiguous', subject: 'success_criteria', detail: 'none declared' })
  }

  // §21.16 "Authority is sufficient" — being asked to produce something with no
  // permitted action is not a hard task, it is an impossible one.
  if (envelope.allowedActions.length === 0 && envelope.deliverables.length > 0) {
    push({ reason: 'authority_insufficient', subject: 'allowedActions', detail: 'none granted' })
  }

  // §21.16 "Constraints do not contradict" — an action both permitted and
  // prohibited has no correct behaviour, so the Manager refuses rather than
  // choosing one reading.
  const forbidden = new Set(envelope.forbiddenActions.map(a => a.action))
  for (const a of envelope.allowedActions) {
    if (forbidden.has(a.action)) {
      push({ reason: 'constraint_conflict', subject: a.action, detail: 'both allowed and forbidden' })
    }
  }

  // §21.16 "Deadline is feasible" — a deadline already in the past is not a
  // schedule risk, it is an arithmetic impossibility.
  if (envelope.deadline !== null) {
    const due = Date.parse(envelope.deadline)
    if (!Number.isFinite(due)) {
      push({ reason: 'deadline_infeasible', subject: envelope.deadline, detail: 'unparseable' })
    } else if (due <= Date.parse(at)) {
      push({ reason: 'deadline_infeasible', subject: envelope.deadline, detail: 'already passed' })
    }
  }

  // §21.16 "Escalation path exists" — work that cannot escalate cannot report a
  // blocker, and §20.87 forbids silent blockage.
  if (envelope.escalationTriggers.length === 0) {
    push({ reason: 'escalation_missing', subject: 'escalationTriggers', detail: 'none declared' })
  }

  // §21.16 "Required tools exist. Required data is reachable." The real check,
  // answered by the injected source. `capabilityFindings` is used only to NAME
  // which subject failed, so a rejection points at a specific tool or resource
  // instead of shrugging at the whole envelope.
  if (!proven.tools || !proven.data) {
    const findings = capabilityFindings({ tools: envelope.tools, dataScope: envelope.dataScope })
    for (const f of findings) {
      if (f.kind === 'tool' && proven.tools) continue
      if (f.kind === 'data' && proven.data) continue
      push({
        reason: f.kind === 'tool' ? 'tool_unavailable' : 'data_unavailable',
        subject: f.subject,
        detail: f.reason,
      })
    }
    // The source refused something the registry heuristics cannot name.
    if (!proven.tools && !findings.some(f => f.kind === 'tool')) {
      push({ reason: 'tool_unavailable', subject: 'tools', detail: 'source_unproven' })
    }
    if (!proven.data && !findings.some(f => f.kind === 'data')) {
      push({ reason: 'data_unavailable', subject: 'dataScope', detail: 'source_unproven' })
    }
  }

  // §21.16 "Dependencies are available" — a hard dependency with no recorded
  // observation is unproven, and unproven is not available.
  for (const requirement of evaluation.readiness.missing) {
    // Capability gaps are answered above against THIS envelope's narrowed
    // tools and data. The Mission's own readiness speaks about the Mission's
    // full set, which a narrowed envelope is not required to cover, so those
    // two requirements are deliberately not re-mapped here.
    if (requirement === 'tool_availability' || requirement === 'data_availability') continue
    if (requirement === 'tools' || requirement === 'data_scope') continue
    const reason = REQUIREMENT_TO_REASON[requirement]
    if (reason) push({ reason, subject: requirement, detail: 'mission readiness' })
  }

  return grounds
}

export interface DecideDelegationArgs extends CommonArgs {
  envelopeId: string
  note?: string
}

/**
 * §21.16/§21.17 — the Manager decides.
 *
 * There is no parameter here that selects the outcome. The caller asks; the
 * checks answer; the answer is appended. That is what makes acceptance mean
 * something: an accepted envelope in this ledger is one whose conditions were
 * actually verified, not one whose caller passed the right flag.
 */
export async function decideDelegation(
  args: DecideDelegationArgs,
): Promise<DelegationWriteResult> {
  const opened = await openFor(args)
  if ('status' in opened) return opened
  const { principal, store, at, prior, records } = opened

  // §21.18 — an envelope is decided once. A second decision would contradict a
  // contract both sides already relied on.
  if (!isDecidable(prior)) {
    return DENY('invalid_lifecycle', `already_${prior.status}`)
  }

  const live = await liveMission(principal, prior.missionId, args, at)
  if ('status' in live) {
    // A Mission that no longer authorizes is not a Manager refusal; it is the
    // envelope losing its ground. Reported as such rather than blamed on the
    // Manager's judgement.
    return live
  }

  // §21.15 — pinning is a hard stop before anything else is considered.
  const broken = pinBroken(prior.missionVersion, prior.missionBoundHash, live.parent)
  if (broken) {
    return DENY(broken, `pinned_v${prior.missionVersion}_now_v${live.parent.version}`)
  }

  // The Manager asks the SAME capability source the Mission is judged by, about
  // the envelope's own (possibly narrowed) tools and data, under this Mission's
  // exact identity.
  const source = args.mission?.availability ?? registryAvailability
  let proven: MissionAvailability
  try {
    proven = await source({
      projectId: prior.projectId,
      missionId: prior.missionId,
      missionVersion: prior.missionVersion,
      tools: prior.envelope.tools,
      dataScope: prior.envelope.dataScope,
    })
  } catch {
    proven = { tools: false, data: false }
  }

  const grounds = delegationRejectionGrounds(prior.envelope, live.parent, live.evaluation, at, proven)
  const accepted = grounds.length === 0

  const record: DelegationRecord = {
    recordId: newId(),
    envelopeId: prior.envelopeId,
    projectId: prior.projectId,
    actType: accepted ? 'delegation.accepted' : 'delegation.rejected',
    occurredAt: at,
    missionId: prior.missionId,
    missionVersion: prior.missionVersion,
    missionBoundHash: prior.missionBoundHash,
    envelope: null,
    rejections: grounds,
    replan: null,
    // §21.19 — the Manager decided. The requesting human's id is deliberately
    // NOT written here: they asked, they did not accept.
    actorKind: 'manager',
    actorId: MANAGER_ACTOR_ID,
    note: args.note ?? null,
    revokedReason: null,
    // Claimed from the exact lineage this decision was made against.
    lineageSequence: nextLineageSequence(records),
  }

  const result = await commit(store, record, records)
  if (result.status === 'ok' && !accepted) return { ...result, rejections: grounds }
  return result
}

// Revoke (Executive)

export interface RevokeDelegationArgs extends CommonArgs {
  envelopeId: string
  reason: DelegationRevocationReason
  note?: string
}

/**
 * §21.27 — withdraw an envelope.
 *
 * Revocation does not touch the Mission. It ends one delegation, and §21.17's
 * rule that a refusal never fails the Mission applies equally here.
 */
export async function revokeDelegation(
  args: RevokeDelegationArgs,
): Promise<DelegationWriteResult> {
  const opened = await openFor(args)
  if ('status' in opened) return opened
  // §21.19 — ONE identity for one institutional act. `openFor` already
  // authenticated and used that principal to scope the lineage; resolving it a
  // second time here opened a window where the session could change between the
  // authorization and the append, so the row would name a principal who never
  // passed the isolation check that let the read through.
  const { principal, store, at } = opened
  let prior = opened.prior
  let records = opened.records

  // §21.27 — REVOCATION IS AUTHORITY NARROWING, so losing a race must never be
  // reported as success, and must never be silently dropped.
  //
  // A concurrent replan claims the position this revocation was aiming at. The
  // replan does not enlarge authority — it only records a classification — so
  // the right answer is to revoke at the NEXT position rather than to fail: the
  // Executive asked for the delegation to stop, and a Manager's bookkeeping
  // must not be able to defeat that by winning a millisecond.
  //
  // The retry re-reads the lineage and re-checks the lifecycle every time, so a
  // concurrent REVOCATION is correctly seen as `already_revoked` instead of
  // being written twice. It uses the principal established by `openFor` and
  // NEVER re-authenticates: the session that passed the isolation check is the
  // session that gets recorded (§21.19). Bounded, because an unbounded retry
  // against a hostile writer is a spin, and after the bound the caller is told
  // plainly that the revocation did NOT happen.
  const ATTEMPTS = 3
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (prior.status === 'revoked') return DENY('invalid_lifecycle', 'already_revoked')
    if (prior.status === 'rejected') return DENY('invalid_lifecycle', 'already_rejected')

    const record: DelegationRecord = {
      recordId: newId(),
      envelopeId: prior.envelopeId,
      projectId: prior.projectId,
      actType: 'delegation.revoked',
      occurredAt: at,
      missionId: prior.missionId,
      missionVersion: prior.missionVersion,
      missionBoundHash: prior.missionBoundHash,
      envelope: null,
      rejections: [],
      replan: null,
      actorKind: 'executive_principal',
      actorId: principal.userId,
      note: args.note ?? null,
      revokedReason: args.reason,
      lineageSequence: nextLineageSequence(records),
    }

    const result = await commit(store, record, records)
    if (result.status !== 'conflict') return result

    // Someone claimed the position. Re-read and try the next one.
    const reopened = await openEnvelope(principal, store, args.envelopeId)
    if ('status' in reopened) return reopened
    prior = reopened.state
    records = reopened.records
  }

  // Exhausted. The revocation did NOT happen, and says so.
  return DENY('conflict', 'revocation_not_appended')
}

// Replan (Manager)

export interface RecordReplanArgs extends CommonArgs {
  envelopeId: string
  change: ProposedChange
}

/**
 * §21.20–§21.26 — classify a Manager-side change and record the classification.
 *
 * Recording is not permission. An operational change is recorded because the
 * Executive is entitled to see how work is being sequenced; a material change
 * is recorded as a REFERRAL, and this function is where it stops. Nothing here
 * grants the change, and nothing here executes it.
 */
export async function recordDelegationReplan(
  args: RecordReplanArgs,
): Promise<DelegationWriteResult> {
  const opened = await openFor(args)
  if ('status' in opened) return opened
  const { principal, store, at, prior, records } = opened

  // §21.20 — replanning is something done with accepted work.
  if (prior.status !== 'accepted') return DENY('invalid_lifecycle', `not_accepted_${prior.status}`)

  // §21.27 — an envelope whose Mission no longer authorizes cannot be replanned
  // under, however operational the change looks in isolation.
  const live = await liveMission(principal, prior.missionId, args, at)
  if ('status' in live) return live
  const replanPinBroken = pinBroken(prior.missionVersion, prior.missionBoundHash, live.parent)
  if (replanPinBroken) {
    return DENY(replanPinBroken, `pinned_v${prior.missionVersion}_now_v${live.parent.version}`)
  }

  const replan = classifyChange(prior.envelope, args.change)

  const record: DelegationRecord = {
    recordId: newId(),
    envelopeId: prior.envelopeId,
    projectId: prior.projectId,
    actType: replan.changeClass === 'operational_change'
      ? 'delegation.replan.operational'
      : 'delegation.replan.referred',
    occurredAt: at,
    missionId: prior.missionId,
    missionVersion: prior.missionVersion,
    missionBoundHash: prior.missionBoundHash,
    envelope: null,
    rejections: [],
    replan,
    actorKind: 'manager',
    actorId: MANAGER_ACTOR_ID,
    note: null,
    revokedReason: null,
    lineageSequence: nextLineageSequence(records),
  }

  const result = await commit(store, record, records)
  if (result.status === 'ok') return { ...result, replan }
  return result
}
