/**
 * lib/atlas/mission/principal-write.ts — the sanctioned write boundary for
 * Executive Mission Briefs.
 *
 * ORDERING RULE: authenticate → establish project authority → only then touch
 * the privileged store. Unknown mission and foreign-project mission return one
 * indistinguishable `not_permitted`, so this boundary can never become a
 * mission-id existence oracle.
 *
 * ONE PIPELINE FOR EVERY ACT:
 *
 *   authenticate
 *   → open lineage (project authority from the chain's own recorded scope)
 *   → lifecycle gate on the derived prior state
 *   → build the CANDIDATE record — the exact row that will be appended
 *   → compute the authorization binding FROM THAT CANDIDATE
 *   → prove Authorization V1 for that binding, and that its principal is the
 *     acting human
 *   → preflight: fold [...lineage, candidate] through the pure core
 *   → verify the candidate still hashes to what was proven
 *   → append
 *
 * MISSION AUTHORITY IS AN OPERATIONAL GATE. A decision's approval is past tense
 * and stands forever (§11.180). A mission's approval governs whether THIS
 * version may move toward execution, and §20.75 expires it on material change.
 * So every authority act re-proves authority against live Authorization V1
 * state, an amendment drops the mission back to `proposed` (see `derive.ts`),
 * and `principal-read.ts` re-evaluates operational authority on every read.
 * The Decision Ledger's "approval stands forever" rule is deliberately NOT
 * copied here.
 *
 * Nothing here executes anything. A Mission Brief is a bounded contract, never
 * a command: this module imports no tool, runner, dispatcher, Manager or
 * workflow. `import 'server-only'` keeps it and the service-role store out of
 * any client bundle.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import {
  bindingForMissionCandidate,
  MISSION_ACTION,
  missionBindingHash,
  type MissionAct,
  type MissionAuthorizationBinding,
} from './binding'
import { buildMissionRecord, newMissionId, type BuildMissionRecordInput } from './build'
import {
  deriveMissionState,
  missionCompletionGaps,
  missionLifecycleGenerationOf,
} from './derive'
import { createMissionLedgerStore, type MissionLedgerStore } from './store'
import type {
  DerivedMissionState,
  MissionAuthorityRecord,
  MissionBlocker,
  MissionClosure,
  MissionDecisionReference,
  MissionEvidence,
  MissionProgressReport,
  MissionRecord,
  MissionRequirement,
} from './types'

export type MissionWriteStatus =
  | 'ok'
  | 'no_principal'
  /** Caller supplied the scope and does not own it — reveals nothing new. */
  | 'project_denied'
  /**
   * Deliberately indistinguishable: the mission does not exist, OR it exists in
   * a project the caller cannot access. Never split these apart.
   */
  | 'not_permitted'
  | 'invalid_request'
  /** The referenced Authorization V1 proof is not effective for this exact act. */
  | 'authority_not_effective'
  /** The authorization's principal is not the acting caller (§20.55). */
  | 'authority_principal_mismatch'
  /** The act is not permitted from the mission's current state. */
  | 'invalid_lifecycle'
  /** §20.106 — activation requirements are incomplete; the mission stays inactive. */
  | 'activation_incomplete'
  /** §20.92 — completion evidence, criteria or review are missing. */
  | 'completion_incomplete'
  /** §20.137 — the governing decision is missing, foreign, or no longer suitable. */
  | 'governing_decision_invalid'
  /** A competing transition won the race; the lineage is unchanged. */
  | 'conflict'
  /**
   * The append succeeded and the resulting lineage is one the invariants say
   * cannot exist. Distinct from `unavailable`: the record is permanent, a retry
   * cannot help, and institutional history needs a human.
   */
  | 'integrity_violation'
  | 'unavailable'

export interface MissionWriteResult {
  state:  DerivedMissionState | null
  status: MissionWriteStatus
  /** Names the failed invariant or the authority reason. Never leaks a path. */
  detail?: string
  /** §20.106 — which canonical requirements were missing, when that is why. */
  missing?: MissionRequirement[]
}

interface CommonArgs {
  store?: MissionLedgerStore
  /** Injected clock; production callers omit it. */
  now?: string
}

/** The §20.244 brief content a caller supplies when opening or amending. */
export interface MissionBriefInput {
  title:            BuildMissionRecordInput['title']
  missionType:      BuildMissionRecordInput['missionType']
  executiveOwner:   BuildMissionRecordInput['executiveOwner']
  missionOwner?:    BuildMissionRecordInput['missionOwner']
  objective:        BuildMissionRecordInput['objective']
  strategicContext?: BuildMissionRecordInput['strategicContext']
  expectedOutcome?: BuildMissionRecordInput['expectedOutcome']
  deliverables?:    BuildMissionRecordInput['deliverables']
  successCriteria?: BuildMissionRecordInput['successCriteria']
  inScope?:         BuildMissionRecordInput['inScope']
  outOfScope?:      BuildMissionRecordInput['outOfScope']
  constraints?:     BuildMissionRecordInput['constraints']
  budget?:          BuildMissionRecordInput['budget']
  authority?:       BuildMissionRecordInput['authority']
  authoritySource?: BuildMissionRecordInput['authoritySource']
  allowedActions?:  BuildMissionRecordInput['allowedActions']
  forbiddenActions?: BuildMissionRecordInput['forbiddenActions']
  tools?:           BuildMissionRecordInput['tools']
  dataScope?:       BuildMissionRecordInput['dataScope']
  dependencies?:    BuildMissionRecordInput['dependencies']
  assumptions?:     BuildMissionRecordInput['assumptions']
  risks?:           BuildMissionRecordInput['risks']
  approvalGates?:   BuildMissionRecordInput['approvalGates']
  deadline?:        BuildMissionRecordInput['deadline']
  reporting?:       BuildMissionRecordInput['reporting']
  escalationTriggers?: BuildMissionRecordInput['escalationTriggers']
  stopConditions?:  BuildMissionRecordInput['stopConditions']
  pauseConditions?: BuildMissionRecordInput['pauseConditions']
  completionConditions?: BuildMissionRecordInput['completionConditions']
  evidenceRequirements?: BuildMissionRecordInput['evidenceRequirements']
  /** §20.137 — only when a Decision Ledger decision IS the authority source. */
  decisionRef?:     MissionDecisionReference | null
}

export interface OpenMissionArgs extends CommonArgs, MissionBriefInput {
  projectId: string
  /** Open as a draft (§20.99) instead of a proposal (§20.98). */
  asDraft?: boolean
}

/**
 * Authority-act arguments. The target, version and action the authorization
 * must satisfy are DERIVED from the candidate; the caller cannot choose or
 * weaken any of them.
 */
export interface ApproveMissionArgs extends CommonArgs {
  missionId: string
  authorizationId: string
}
export interface ActivateMissionArgs extends CommonArgs {
  missionId: string
  authorizationId: string
}
export interface AmendMissionArgs extends CommonArgs, Partial<MissionBriefInput> {
  missionId: string
  authorizationId: string
  reason: string
}
export interface CancelMissionArgs extends CommonArgs {
  missionId: string
  authorizationId: string
  reason: string
}
export interface SupersedeMissionArgs extends CommonArgs {
  missionId: string
  supersededBy: string
  authorizationId: string
  reason?: string
}

/** Non-authority operational acts. */
export interface PauseMissionArgs extends CommonArgs { missionId: string; reason: string }
export interface ResumeMissionArgs extends CommonArgs { missionId: string }
export interface CloseMissionArgs extends CommonArgs {
  missionId: string
  closure: MissionClosure
  /** §20.94 — close as partially complete instead of complete. */
  partial?: boolean
}
export interface FailMissionArgs extends CommonArgs { missionId: string; reason: string }
export interface ArchiveMissionArgs extends CommonArgs { missionId: string }

/** Annotations. None advances the lifecycle generation. */
export interface ReportProgressArgs extends CommonArgs { missionId: string; report: MissionProgressReport }
export interface RaiseBlockerArgs extends CommonArgs { missionId: string; blocker: MissionBlocker }
export interface ClearBlockerArgs extends CommonArgs { missionId: string; blockerId: string }
export interface RecordEvidenceArgs extends CommonArgs { missionId: string; evidence: MissionEvidence }
export interface ReviewMissionArgs extends CommonArgs { missionId: string; reviewNote: string }

/** The act content a caller's arguments produce, before identity and clock. */
type CandidateInput = Omit<BuildMissionRecordInput, 'principalId' | 'occurredAt' | 'lifecycleGeneration'>

const DENY = (status: MissionWriteStatus, detail?: string, missing?: MissionRequirement[]): MissionWriteResult =>
  ({ state: null, status, ...(detail ? { detail } : {}), ...(missing ? { missing } : {}) })

function isConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('23505') || message.toLowerCase().includes('duplicate key')
}

interface Principal { userId: string; allowedProjectIds: string[] }

/** Step 1 of the ordering rule. Nothing privileged runs before this resolves. */
async function authenticate(): Promise<Principal | MissionWriteResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { state: null, status: 'no_principal' }
  return { userId: access.userId, allowedProjectIds: access.allowedProjectIds }
}

/** Load an existing lineage after authenticating, enforcing scope from the chain. */
async function openLineage(
  principal: Principal,
  store: MissionLedgerStore,
  missionId: string,
  at: string,
): Promise<{ state: DerivedMissionState; records: MissionRecord[] } | MissionWriteResult> {
  let records: MissionRecord[]
  try {
    records = await store.lineage(missionId)
  } catch {
    return DENY('unavailable')
  }
  // Unknown and foreign share one denial class — no existence oracle.
  if (records.length === 0) return DENY('not_permitted')
  if (!assertProjectAllowed(records[0].projectId, principal.allowedProjectIds)) return DENY('not_permitted')

  try {
    return { state: deriveMissionState(records, { at }), records }
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'malformed')
  }
}

/** authenticate → project authority → lineage. Shared by every act below. */
async function openFor(
  args: CommonArgs & { missionId: string },
): Promise<
  | { principal: Principal; store: MissionLedgerStore; at: string; prior: DerivedMissionState; records: MissionRecord[] }
  | MissionWriteResult
> {
  const principal = await authenticate()
  if ('status' in principal) return principal

  const store = args.store ?? createMissionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  const opened = await openLineage(principal, store, args.missionId, at)
  if ('status' in opened) return opened
  return { principal, store, at, prior: opened.state, records: opened.records }
}

/** Carry the current mission content forward onto the next act. */
function carryForward(prior: DerivedMissionState) {
  return {
    projectId:   prior.projectId,
    version:     prior.version,
    title:       prior.title,
    missionType: prior.missionType,
    executiveOwner: prior.executiveOwner,
    missionOwner: prior.missionOwner,
    objective:   prior.objective,
    strategicContext: prior.strategicContext,
    expectedOutcome: prior.expectedOutcome,
    deliverables: prior.deliverables,
    successCriteria: prior.successCriteria,
    inScope:     prior.inScope,
    outOfScope:  prior.outOfScope,
    constraints: prior.constraints,
    budget:      prior.budget,
    authority:   prior.authority,
    authoritySource: prior.authoritySource,
    allowedActions: prior.allowedActions,
    forbiddenActions: prior.forbiddenActions,
    tools:       prior.tools,
    dataScope:   prior.dataScope,
    dependencies: prior.dependencies,
    assumptions: prior.assumptions,
    risks:       prior.risks,
    approvalGates: prior.approvalGates,
    deadline:    prior.deadline,
    reporting:   prior.reporting,
    escalationTriggers: prior.escalationTriggers,
    stopConditions: prior.stopConditions,
    pauseConditions: prior.pauseConditions,
    completionConditions: prior.completionConditions,
    evidenceRequirements: prior.evidenceRequirements,
    decisionRef: prior.decisionRef,
  }
}

/**
 * Structural placeholder so a candidate carrying an authority act can be built
 * and hashed before its proof exists. Excluded from the bound projection, and
 * never appended: `commitAct` replaces it with the resolved proof and refuses
 * if the content hash moved.
 */
const PROVISIONAL_AUTHORITY = (act: MissionAct): MissionAuthorityRecord => ({
  authorizationId: 'pending',
  principalId: 'pending',
  actionKind: MISSION_ACTION[act],
  boundVersionHash: 'pending',
  authorityActAt: '1970-01-01T00:00:00.000Z',
})

/**
 * Validate a prospective act and, if it needs authority, prove it — then append.
 *
 * The candidate is built ONCE from `input`. The only field added after the
 * authorization is checked is `authorityRecord` itself, which `binding.ts`
 * excludes from the bound projection by construction; the equality check below
 * turns that argument into an enforced invariant rather than a comment.
 */
async function commitAct(
  context: { principal: Principal; store: MissionLedgerStore; at: string; records: MissionRecord[] },
  input: CandidateInput,
  authority: { authorizationId: string; act: MissionAct } | null,
): Promise<MissionWriteResult> {
  const { principal, store, at, records } = context

  const base: BuildMissionRecordInput = {
    ...input,
    principalId: principal.userId,
    occurredAt: at,
    // Lifecycle acts only. An unrelated progress report or blocker appended
    // between two writers' reads must NOT hand them different keys.
    lifecycleGeneration: missionLifecycleGenerationOf(records),
  }

  let candidate: MissionRecord
  try {
    candidate = buildMissionRecord(
      authority ? { ...base, authorityRecord: PROVISIONAL_AUTHORITY(authority.act) } : base,
    )
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'invalid')
  }

  let final = candidate
  let proven: MissionAuthorizationBinding | null = null

  if (authority) {
    const binding = bindingForMissionCandidate(candidate, authority.act)
    const resolved = await isAuthorizationEffective(
      authority.authorizationId,
      { projectId: binding.projectId, target: binding.target, actionKind: binding.actionKind },
      { now: at },
    )
    if (!resolved.effective || !resolved.state) {
      return DENY('authority_not_effective', `${resolved.status}:${resolved.reason}`)
    }
    // §20.55 — no implied authority. A service-role or Atlas-initiated call
    // carrying someone else's grant is not that human exercising authority.
    if (resolved.state.principalId !== principal.userId) {
      return DENY('authority_principal_mismatch')
    }
    const record: MissionAuthorityRecord = {
      authorizationId: authority.authorizationId,
      principalId: resolved.state.principalId,
      actionKind: binding.actionKind,
      boundVersionHash: binding.target.versionHash,
      authorityActAt: at,
    }
    final = { ...candidate, authorityRecord: record }
    proven = binding

    // The act that gets appended must hash to exactly what was authorized.
    if (missionBindingHash(final) !== proven.target.versionHash) {
      return DENY('invalid_request', 'authority-binding-drift')
    }
  }

  // PREFLIGHT. The pure core is the authority on what a lineage may contain, and
  // it runs before the irreversible step — never after it.
  try {
    deriveMissionState([...records, final], { at })
  } catch (error) {
    return DENY('invalid_lifecycle', error instanceof Error ? error.message : 'malformed')
  }

  try {
    await store.append(final)
  } catch (error) {
    return isConflict(error) ? DENY('conflict') : DENY('unavailable')
  }

  // Readback is VERIFICATION, not derivation of the answer.
  let persisted: MissionRecord[]
  try {
    persisted = await store.lineage(final.missionId)
  } catch {
    return DENY('unavailable')
  }
  try {
    return { state: deriveMissionState(persisted, { at }), status: 'ok' }
  } catch (error) {
    // The candidate passed the pure core moments ago and the database accepted
    // it, yet the resulting lineage is one the invariants say cannot exist. On
    // an append-only table with UPDATE and DELETE rejected by trigger, that is
    // institutional history corruption — not an availability blip — and calling
    // it `unavailable` would invite a retry that cannot help.
    const invariant = error instanceof Error ? error.message : 'malformed'
    console.error('[atlas-mission-ledger] LEDGER INTEGRITY VIOLATION', {
      missionId: final.missionId,
      recordId: final.recordId,
      recordType: final.type,
      lifecycleGeneration: final.lifecycleGeneration,
      invariant,
    })
    return DENY('integrity_violation', invariant)
  }
}

// ── Planning seam ─────────────────────────────────────────────────────────────

type ActArgs =
  | ({ act: 'approve' } & Omit<ApproveMissionArgs, 'authorizationId'>)
  | ({ act: 'activate' } & Omit<ActivateMissionArgs, 'authorizationId'>)
  | ({ act: 'amend' } & Omit<AmendMissionArgs, 'authorizationId'>)
  | ({ act: 'cancel' } & Omit<CancelMissionArgs, 'authorizationId'>)
  | ({ act: 'supersede' } & Omit<SupersedeMissionArgs, 'authorizationId'>)

/**
 * Build the candidate act's content from the caller's terms and the prior state.
 *
 * SHARED deliberately: `prepareMissionAct` shows a human the binding this
 * produces, and the act functions bind against it. One function means the two
 * cannot drift, so what was shown is what is enforced.
 */
function planFor(args: ActArgs, prior: DerivedMissionState): CandidateInput {
  const carried = carryForward(prior)
  switch (args.act) {
    case 'approve':
      return { ...carried, type: 'approved', missionId: args.missionId }
    case 'activate':
      return { ...carried, type: 'activated', missionId: args.missionId }
    case 'amend':
      return {
        ...carried,
        type: 'amended',
        missionId: args.missionId,
        // §20.126 — a material amendment creates a new version.
        version: prior.version + 1,
        title: args.title ?? carried.title,
        missionType: args.missionType ?? carried.missionType,
        executiveOwner: args.executiveOwner ?? carried.executiveOwner,
        missionOwner: args.missionOwner ?? carried.missionOwner,
        objective: args.objective ?? carried.objective,
        strategicContext: args.strategicContext ?? carried.strategicContext,
        expectedOutcome: args.expectedOutcome ?? carried.expectedOutcome,
        deliverables: args.deliverables ?? carried.deliverables,
        successCriteria: args.successCriteria ?? carried.successCriteria,
        inScope: args.inScope ?? carried.inScope,
        outOfScope: args.outOfScope ?? carried.outOfScope,
        constraints: args.constraints ?? carried.constraints,
        budget: args.budget ?? carried.budget,
        authority: args.authority ?? carried.authority,
        authoritySource: args.authoritySource ?? carried.authoritySource,
        allowedActions: args.allowedActions ?? carried.allowedActions,
        forbiddenActions: args.forbiddenActions ?? carried.forbiddenActions,
        tools: args.tools ?? carried.tools,
        dataScope: args.dataScope ?? carried.dataScope,
        dependencies: args.dependencies ?? carried.dependencies,
        assumptions: args.assumptions ?? carried.assumptions,
        risks: args.risks ?? carried.risks,
        approvalGates: args.approvalGates ?? carried.approvalGates,
        deadline: args.deadline ?? carried.deadline,
        reporting: args.reporting ?? carried.reporting,
        escalationTriggers: args.escalationTriggers ?? carried.escalationTriggers,
        stopConditions: args.stopConditions ?? carried.stopConditions,
        pauseConditions: args.pauseConditions ?? carried.pauseConditions,
        completionConditions: args.completionConditions ?? carried.completionConditions,
        evidenceRequirements: args.evidenceRequirements ?? carried.evidenceRequirements,
        decisionRef: args.decisionRef ?? carried.decisionRef,
        reason: args.reason,
      }
    case 'cancel':
      return { ...carried, type: 'cancelled', missionId: args.missionId, reason: args.reason }
    case 'supersede':
      return {
        ...carried,
        type: 'superseded',
        missionId: args.missionId,
        supersededBy: args.supersededBy,
        reason: args.reason ?? 'Superseded by a newer mission.',
      }
  }
}

/**
 * What authorization would this act require?
 *
 * A human cannot meaningfully authorize an act they have not been shown, and
 * the binding is a hash of the act's exact content — so the caller preparing an
 * approval request needs the same candidate the write path will build. This
 * returns it WITHOUT appending anything: same authentication, same project
 * authority, same candidate construction, no write.
 *
 * It is the only supported way to obtain a Mission binding. Nothing about the
 * returned binding is caller-controlled — changing the terms changes the
 * binding, which is the entire point.
 */
export async function prepareMissionAct(
  args: ActArgs,
): Promise<{ binding: MissionAuthorizationBinding | null; status: MissionWriteStatus; detail?: string }> {
  const open = await openFor(args)
  if ('status' in open) return { binding: null, status: open.status, detail: open.detail }
  const { prior, principal, at, records } = open

  try {
    const candidate = buildMissionRecord({
      ...planFor(args, prior),
      authorityRecord: PROVISIONAL_AUTHORITY(args.act),
      principalId: principal.userId,
      occurredAt: at,
      lifecycleGeneration: missionLifecycleGenerationOf(records),
    })
    return { binding: bindingForMissionCandidate(candidate, args.act), status: 'ok' }
  } catch (error) {
    return { binding: null, status: 'invalid_request', detail: error instanceof Error ? error.message : 'invalid' }
  }
}

// ── Acts ──────────────────────────────────────────────────────────────────────

/**
 * Open a mission (§20.99 draft or §20.98 proposal).
 *
 * Authorizes nothing. §20.99 is explicit: "A Draft Mission grants no execution
 * authority." Creating a mission is not authorizing one, and no code path here
 * lets it become one.
 */
export async function openMission(args: OpenMissionArgs): Promise<MissionWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal
  if (!assertProjectAllowed(args.projectId, principal.allowedProjectIds)) return DENY('project_denied')

  const store = args.store ?? createMissionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  return commitAct({ principal, store, at, records: [] }, {
    type: args.asDraft ? 'drafted' : 'proposed',
    missionId: newMissionId(),
    projectId: args.projectId,
    version: 1,
    title: args.title,
    missionType: args.missionType,
    executiveOwner: args.executiveOwner,
    missionOwner: args.missionOwner,
    objective: args.objective,
    strategicContext: args.strategicContext,
    expectedOutcome: args.expectedOutcome,
    deliverables: args.deliverables,
    successCriteria: args.successCriteria,
    inScope: args.inScope,
    outOfScope: args.outOfScope,
    constraints: args.constraints,
    budget: args.budget,
    authority: args.authority,
    authoritySource: args.authoritySource,
    allowedActions: args.allowedActions,
    forbiddenActions: args.forbiddenActions,
    tools: args.tools,
    dataScope: args.dataScope,
    dependencies: args.dependencies,
    assumptions: args.assumptions,
    risks: args.risks,
    approvalGates: args.approvalGates,
    deadline: args.deadline,
    reporting: args.reporting,
    escalationTriggers: args.escalationTriggers,
    stopConditions: args.stopConditions,
    pauseConditions: args.pauseConditions,
    completionConditions: args.completionConditions,
    evidenceRequirements: args.evidenceRequirements,
    decisionRef: args.decisionRef,
  }, null)
}

/** Submit a draft for review (§20.98). Grants nothing. */
export async function proposeMission(args: CommonArgs & { missionId: string }): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'proposed', missionId: args.missionId }, null)
}

/**
 * §20.100 — Approve a mission under an Authorization V1 proof bound to the exact
 * brief: its objective, scope, authority, budget, deadline, success criteria,
 * approval gates and risks included (§20.126).
 *
 * §20.172 — a proposal a human could not evaluate cannot be approved, so the
 * brief must be complete first. Approval is not activation (§20.100: "may still
 * wait for dependencies").
 */
export async function approveMission(args: ApproveMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  if (!prior.briefComplete) {
    return DENY('activation_incomplete', 'brief_incomplete', prior.missingRequirements)
  }
  return commitAct(open, planFor({ ...args, act: 'approve' }, prior),
    { authorizationId: args.authorizationId, act: 'approve' })
}

/**
 * §20.105 — Activation. "Before activation, Omnira should verify: Project scope.
 * Objective. Owner. Authority. Constraints. Dependencies. Tools. Data access.
 * Approval gates. Budget. Deadline. Reporting. Stop conditions."
 *
 * §20.106 — "If activation requirements are incomplete: The mission remains
 * inactive. Missing elements are reported. No external execution begins." So a
 * failed activation appends NOTHING and returns the typed missing list.
 */
export async function activateMission(args: ActivateMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  const missing: MissionRequirement[] = [...prior.missingRequirements]
  // §20.101/§20.105 — dependencies, tools and blockers are conditions of the
  // world, checked here rather than at brief-completeness time.
  if (prior.dependencies.some(d => d.hardness === 'hard' && !d.satisfied)) missing.push('dependencies')
  if (prior.tools.length === 0) missing.push('tools')
  if (prior.openBlockers.length > 0) missing.push('unresolved_blocker')
  if (missing.length > 0) {
    return DENY('activation_incomplete', 'requirements_incomplete', [...new Set(missing)])
  }

  return commitAct(open, planFor({ ...args, act: 'activate' }, prior),
    { authorizationId: args.authorizationId, act: 'activate' })
}

/**
 * §20.126/§20.127 — a material amendment creates version N+1 under its OWN fresh
 * authority, bound to the CONTENT of N+1.
 *
 * §20.75 — approval expires when the object changes materially, so the amended
 * mission returns to `proposed` and must earn approval again before it can be
 * activated or handed off. Version N stays in the immutable lineage (§20.128);
 * the prior authorization does not float forward.
 *
 * §11.61-style non-material corrections are out of scope for V1 by owner
 * ruling: every amendment here is material and takes the full authority path.
 */
export async function amendMission(args: AmendMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, planFor({ ...args, act: 'amend' }, open.prior),
    { authorizationId: args.authorizationId, act: 'amend' })
}

/** §20.96 — cancellation is not failure, but it is an authority act. */
export async function cancelMission(args: CancelMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, planFor({ ...args, act: 'cancel' }, open.prior),
    { authorizationId: args.authorizationId, act: 'cancel' })
}

/** §20.97 — replaced by a newer mission; the relationship is explicit. */
export async function supersedeMission(args: SupersedeMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  if (args.supersededBy === args.missionId) return DENY('invalid_request', 'supersede-not-self')
  return commitAct(open, planFor({ ...args, act: 'supersede' }, open.prior),
    { authorizationId: args.authorizationId, act: 'supersede' })
}

/**
 * §20.132 — pause. Not an authority act: pausing narrows activity, and requiring
 * a fresh grant to stop something would be a safety tax with no safety benefit.
 */
export async function pauseMission(args: PauseMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'paused', missionId: args.missionId, reason: args.reason }, null)
}

/**
 * §20.133 — restart. "Restart should verify: Objective remains valid. Authority
 * remains valid. Dependencies remain current. Brief version is current."
 *
 * Authority validity is the live operational question, so resuming is refused
 * while hard dependencies are unmet or a blocker is open; the caller re-checks
 * current authorization through the read boundary before resuming.
 */
export async function resumeMission(args: ResumeMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open
  const missing: MissionRequirement[] = []
  if (prior.dependencies.some(d => d.hardness === 'hard' && !d.satisfied)) missing.push('dependencies')
  if (prior.openBlockers.length > 0) missing.push('unresolved_blocker')
  if (missing.length > 0) return DENY('activation_incomplete', 'restart_requirements_incomplete', missing)
  return commitAct(open, { ...carryForward(prior), type: 'resumed', missionId: args.missionId }, null)
}

/**
 * §20.92/§20.94 — close the mission.
 *
 * §20.93 keeps task completion distinct from mission completion, and §20.225
 * forbids completion theatre. So closure requires the mission's own contract to
 * be satisfied: declared evidence exists, minimum success criteria are judged
 * met, no blocker is open, and a completion review (§20.195) has happened.
 *
 * Closing writes NOTHING to the Decision Ledger, Memory, or any calibration
 * surface. A completed mission does not prove the governing decision was
 * correct — that stays a separate act with its own evidence.
 */
export async function closeMission(args: CloseMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  const { prior } = open

  const gaps = missionCompletionGaps(prior, args.closure)
  // §20.94 — partial completion needs the MINIMUM outcome achieved, so the
  // evidence and review gaps still apply; only unmet target criteria are
  // tolerated, and those are not minimum criteria.
  if (gaps.length > 0) return DENY('completion_incomplete', gaps.join(','))

  return commitAct(open, {
    ...carryForward(prior),
    type: args.partial ? 'partially_completed' : 'completed',
    missionId: args.missionId,
    closure: args.closure,
  }, null)
}

/** §20.95 — the objective cannot be achieved, or authority was withdrawn. */
export async function failMission(args: FailMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'failed', missionId: args.missionId, reason: args.reason }, null)
}

/** §20.98 — terminal bookkeeping over an already-closed mission. No engine. */
export async function archiveMission(args: ArchiveMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'archived', missionId: args.missionId }, null)
}

// ── Annotations (§20.78, §20.103, §20.80, §20.195) ────────────────────────────
// None advances the lifecycle generation, so none can collide with a lifecycle
// act or be starved by one.

/** §20.78 — a progress report. */
export async function reportMissionProgress(args: ReportProgressArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'progress_reported', missionId: args.missionId, report: args.report }, null)
}

/** §20.103/§20.87 — record an explicit blocker. A silent blocker is forbidden. */
export async function raiseMissionBlocker(args: RaiseBlockerArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'blocker_raised', missionId: args.missionId, blocker: args.blocker }, null)
}

/** Resolve a raised blocker. The pure core refuses to clear one that is not open. */
export async function clearMissionBlocker(args: ClearBlockerArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'blocker_cleared', missionId: args.missionId, clearsBlockerId: args.blockerId }, null)
}

/** §20.80/§20.81 — record evidence. Completion later reads exactly this. */
export async function recordMissionEvidence(args: RecordEvidenceArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'evidence_recorded', missionId: args.missionId, evidence: args.evidence }, null)
}

/** §20.195 — completion review. Required before a mission may close. */
export async function reviewMission(args: ReviewMissionArgs): Promise<MissionWriteResult> {
  const open = await openFor(args)
  if ('status' in open) return open
  return commitAct(open, { ...carryForward(open.prior), type: 'reviewed', missionId: args.missionId, reviewNote: args.reviewNote }, null)
}
