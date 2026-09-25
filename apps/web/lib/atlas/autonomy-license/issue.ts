/**
 * lib/atlas/autonomy-license/issue.ts — the human licensing boundary.
 *
 * §18.2 is the rule this whole file enforces: "Executive Intelligence may
 * recommend higher autonomy. Executive Intelligence may not grant itself higher
 * autonomy." Nothing here reads a caller's claim about who it is, what project
 * it means, what definition it belongs to, or whether its decision is valid.
 * Every one of those is a fact resolved server-side, and the two the caller does
 * name — the instance and the decision — are proven rather than trusted.
 *
 * ── THE ISSUER (Ruling 1) ──────────────────────────────────────────────────
 * `resolvePlatformOperator()` and nothing else. Not project ownership: owning a
 * project proves authority over that project, not authority to grant Chapter 18
 * autonomy — the same distinction `lib/auth/platform-operator.ts` already draws
 * for the global kill switch. Not Atlas, not a cron, not a service caller: a
 * machine that can raise its own licence has no licence (§18.247).
 *
 * This is a V1/bootstrap choice and is NOT a claim that Chapter 18 requires
 * platform-operator-only forever. Delegated autonomy approvers (§18.47's
 * "Authorized project owner", "Delegated specialist approver") are a separately
 * reviewed authority phase.
 *
 * ── WHY ISSUANCE READS THE DECISION LEDGER DIRECTLY ────────────────────────
 * `principal-read.isDecisionGoverning` resolves the caller's project membership
 * and denies a decision outside it. Correct for a project member; wrong here for
 * the reason above — the operator need not be a member of the licensed project,
 * so that check would deny the one caller the ruling authorizes. The DECISION's
 * validity is instead proven from its immutable lineage by the same Chapter 11
 * pure core that reader calls, plus the project and materiality facts Ruling 2
 * requires. The authority is the operator; the evidence is the ledger.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  isDecisionGoverning as isGoverningPure,
  LIFECYCLE_ADVANCING,
  orderDecisionRecords,
} from '@/lib/atlas/decision-ledger/derive'
import { createDecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { readInstance } from '@/lib/workflows/store'

import { licenseGenerationOf, deriveLicenseState, MalformedLicenseLineageError } from './derive'
import { compareLevels, INEFFECTIVE_LEVEL, isAutonomyLicenseLevel } from './levels'
import { resolveActionScope } from './scope'
import { createAutonomyLicenseStore, type AutonomyLicenseStore } from './store'
import { LICENSE_ACTS } from './types'
import type { DecisionRecord } from '@/lib/atlas/decision-ledger/types'
import type { AutonomyLicenseLevel } from './levels'
import type { LicenseAct, LicenseEvent } from './types'

/**
 * Why a licensing act was refused. A CLOSED vocabulary, so a caller learns what
 * to fix without the boundary leaking whether some other project's decision
 * exists.
 */
export const LICENSE_REFUSALS = [
  'unauthenticated',
  'no_operator_configured',
  'not_platform_operator',
  'instance_not_found',
  'instance_unavailable',
  'decision_not_found',
  'decision_unavailable',
  'decision_not_governing',
  'decision_project_mismatch',
  'decision_not_material_for_autonomy',
  'action_kinds_required',
  'action_kind_unknown',
  'action_kind_duplicated',
  'invalid_level',
  'invalid_window',
  'license_not_found',
  'license_malformed',
  'license_terminal',
  /** A suspended licence is stopped; only revocation or supersession may follow. */
  'license_suspended',
  /** Stopping something already stopped is outside the approved lifecycle. */
  'license_already_suspended',
  'restriction_raises_level',
  'restriction_adds_action',
  'restriction_extends_window',
  'supersession_target_not_found',
] as const
export type LicenseRefusal = (typeof LICENSE_REFUSALS)[number]

export type LicenseWriteResult =
  | { ok: true; event: LicenseEvent }
  | { ok: false; reason: LicenseRefusal; detail?: string }

const deny = (reason: LicenseRefusal, detail?: string): LicenseWriteResult =>
  ({ ok: false, reason, ...(detail ? { detail } : {}) })

// ── Request shapes ────────────────────────────────────────────────────────────

/**
 * What a human is entitled to decide. Everything else — project, definition,
 * derived class, fingerprint, issuer, generation, decision validity — is a fact
 * the server resolves.
 */
export interface IssueLicenseRequest {
  readonly workflowInstanceId: string
  readonly decisionId: string
  readonly licensedLevel: string
  readonly allowedActionKinds: readonly string[]
  readonly effectiveAt: string
  readonly expiresAt: string
}

/** A restriction re-states the whole grant it narrows. Ruling 7 restricts it. */
export interface RestrictLicenseRequest {
  readonly licenseId: string
  readonly licensedLevel: string
  readonly allowedActionKinds: readonly string[]
  readonly effectiveAt: string
  readonly expiresAt: string
  readonly reason?: string | null
}

export interface LicenseIdRequest {
  readonly licenseId: string
  readonly reason?: string | null
}

export interface SupersedeLicenseRequest extends LicenseIdRequest {
  readonly supersededByLicenseId: string
}

// ── Shared preconditions ──────────────────────────────────────────────────────
//
// ── THERE IS NO DEPENDENCY-INJECTION PARAMETER, DELIBERATELY ───────────────
// An earlier revision accepted an optional `args` object carrying `operator`,
// `store`, `instance`, `decisionLineage` and `now`. That made the authority
// boundary overridable by any future caller:
//
//     issueAutonomyLicense(request, {
//       operator: { ok: true, actor: 'user:…' },   // no session at all
//       instance: …, decisionLineage: …, store: …, now: …,
//     })
//
// — which bypasses resolvePlatformOperator(), the real workflow-instance read,
// the real Decision Ledger read, the governing check and the server clock. The
// whole point of this module is that the PUBLIC boundary proves authority, so
// the public boundary takes the human request and nothing else.
//
// Tests reach the same coverage by mocking the imported dependencies
// (`vi.mock`), which cannot be reached from production code. A pure helper may
// prepare or evaluate DATA, but the function that can cause `store.append(...)`
// sits behind these checks and has no way to skip them.

/** The issuer, or the reason there is none. Never a caller-supplied actor. */
async function authorize(): Promise<{ ok: true; actor: string } | { ok: false; reason: LicenseRefusal }> {
  const operator = await resolvePlatformOperator()
  if (operator.ok) return { ok: true, actor: operator.actor }
  switch (operator.reason) {
    case 'unauthenticated':        return { ok: false, reason: 'unauthenticated' }
    case 'no_operator_configured': return { ok: false, reason: 'no_operator_configured' }
    default:                       return { ok: false, reason: 'not_platform_operator' }
  }
}

interface Subject { project_id: string; def_key: string; def_hash: string }

/**
 * The licence subject, resolved from the instance itself (Ruling 5).
 *
 * The caller may NAME a workflow instance. It may not assert that instance's
 * project, definition key or definition hash — those come from the row, so a
 * licence can never bind to a project or definition its own subject does not
 * have.
 */
async function loadSubject(
  workflowInstanceId: string,
): Promise<{ ok: true; subject: Subject } | { ok: false; reason: LicenseRefusal }> {
  try {
    const instance = await readInstance(createAdminClient() as never, workflowInstanceId)
    if (!instance) return { ok: false, reason: 'instance_not_found' }
    return {
      ok: true,
      subject: { project_id: instance.project_id, def_key: instance.def_key, def_hash: instance.def_hash },
    }
  } catch {
    return { ok: false, reason: 'instance_unavailable' }
  }
}

interface DecisionPin { decisionId: string; version: number; recordId: string }

/**
 * Ruling 2's seven proofs, in the order they can fail cheapest.
 *
 * The pinned identity is EXISTING ledger identity — the immutable `record_id`
 * and `version` of the governing act — not a hash invented here. Ruling 2:
 * "Prefer an existing immutable record_id / version combination rather than
 * inventing another decision hash if the existing ledger already supplies
 * enough identity." It does.
 */
async function proveDecision(
  decisionId: string,
  projectId: string,
  at: string,
): Promise<{ ok: true; pin: DecisionPin } | { ok: false; reason: LicenseRefusal }> {
  let lineage: unknown[]
  try {
    lineage = await createDecisionLedgerStore().lineage(decisionId)
  } catch {
    return { ok: false, reason: 'decision_unavailable' }
  }
  if (lineage.length === 0) return { ok: false, reason: 'decision_not_found' }

  const records = lineage as DecisionRecord[]
  const first = lineage[0] as { projectId?: string }
  if (first?.projectId !== projectId) return { ok: false, reason: 'decision_project_mismatch' }

  const governing = isGoverningPure(records, { at })
  if (!governing.governing || !governing.state) {
    return { ok: false, reason: 'decision_not_governing' }
  }

  // §18.272 requires the licence to connect to the Decision Ledger; Ruling 2
  // requires the connection to be an autonomy decision specifically. A decision
  // that governs but was not about autonomy does not authorize an autonomy
  // grant, however healthy it is.
  if (!governing.state.materiality.includes('autonomy')) {
    return { ok: false, reason: 'decision_not_material_for_autonomy' }
  }

  // The governing act: the latest lifecycle-advancing record in canonical order.
  // Annotations (`outcome_observed`, `reviewed`) record something ABOUT the
  // decision without moving it, so they can never be the act a licence pins.
  const ordered = orderDecisionRecords(records)
  const advancing = ordered.filter(r => LIFECYCLE_ADVANCING.has(r.type))
  const act = advancing[advancing.length - 1]
  if (!act) return { ok: false, reason: 'decision_not_governing' }

  return { ok: true, pin: { decisionId, version: act.version, recordId: act.recordId } }
}

/** A licence window must be a real, forward interval. */
function validateWindow(effectiveAt: string, expiresAt: string): LicenseRefusal | null {
  const start = Date.parse(effectiveAt)
  const end = Date.parse(expiresAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return 'invalid_window'
  if (end <= start) return 'invalid_window'
  return null
}

/**
 * Untrusted level input, refused rather than thrown.
 *
 * An earlier revision validated by calling `levelIndex()`, which THROWS on an
 * unknown level — so a request carrying `L9` escaped this boundary as an
 * exception instead of returning `{ ok: false, reason: 'invalid_level' }`. The
 * guard is the non-throwing membership test; `levelIndex` keeps throwing for
 * internal impossibilities, which is a different job.
 */

// ── ISSUE ─────────────────────────────────────────────────────────────────────

/**
 * Issue a licence.
 *
 * Takes the human request and NOTHING ELSE. The operator, the workflow subject,
 * the decision lineage, the issue-time clock and the store are all resolved by
 * the boundary itself — see the note above `authorize`.
 */
export async function issueAutonomyLicense(
  request: IssueLicenseRequest,
): Promise<LicenseWriteResult> {
  const auth = await authorize()
  if (!auth.ok) return deny(auth.reason)

  const subject = await loadSubject(request.workflowInstanceId)
  if (!subject.ok) return deny(subject.reason)

  const requestedLevel = request.licensedLevel
  if (!isAutonomyLicenseLevel(requestedLevel)) return deny('invalid_level', String(requestedLevel))
  const windowRefusal = validateWindow(request.effectiveAt, request.expiresAt)
  if (windowRefusal) return deny(windowRefusal)

  const scope = resolveActionScope(request.allowedActionKinds, subject.subject.def_key)
  if (!scope.ok) return deny(scope.reason, scope.detail)

  // The issue-time clock is the SERVER's. "Is this decision currently
  // governing?" is evaluated as of now, and a caller must not be able to
  // backdate that evaluation to a moment when a lapsed decision still stood.
  const decision = await proveDecision(
    request.decisionId,
    subject.subject.project_id,
    new Date().toISOString(),
  )
  if (!decision.ok) return deny(decision.reason)

  const store = createAutonomyLicenseStore()
  try {
    const event = await store.append({
      licenseId: crypto.randomUUID(),
      act: 'LICENSE_ISSUED',
      projectId: subject.subject.project_id,
      workflowInstanceId: request.workflowInstanceId,
      boundDefKey: subject.subject.def_key,
      boundDefHash: subject.subject.def_hash,
      licensedLevel: requestedLevel,
      allowedActionKinds: scope.scope.entries.map(e => e.actionKind),
      actionScopeFingerprint: scope.scope.fingerprint,
      decisionId: decision.pin.decisionId,
      decisionVersion: decision.pin.version,
      decisionRecordId: decision.pin.recordId,
      effectiveAt: request.effectiveAt,
      expiresAt: request.expiresAt,
      supersededByLicenseId: null,
      reason: null,
      actor: auth.actor,
    })
    return { ok: true, event }
  } catch (error) {
    return deny('license_malformed', String((error as Error).message))
  }
}

// ── RESTRICT ──────────────────────────────────────────────────────────────────

/**
 * Ruling 7: a restriction may ONLY narrow level, action set and time window.
 *
 * This boundary refuses a widening restriction with a specific reason, and
 * `derive.ts` refuses it again by construction. Both exist because they fail
 * differently: this one tells the human what they got wrong, and the fold means
 * a future writer that forgets the rule still cannot widen authority.
 */
export async function restrictAutonomyLicense(
  request: RestrictLicenseRequest,
): Promise<LicenseWriteResult> {
  const current = await loadCurrent(request.licenseId)
  if (!current.ok) return deny(current.reason)

  const auth = await authorize()
  if (!auth.ok) return deny(auth.reason)

  const requestedLevel = request.licensedLevel
  if (!isAutonomyLicenseLevel(requestedLevel)) return deny('invalid_level', String(requestedLevel))

  // ── A suspended licence cannot be restricted back into effect ───────────
  // Ruling 7 removed RESUMED, so no act clears a suspension. A restriction is a
  // narrowing act, never a resurrection: on `ISSUED → SUSPENDED → RESTRICTED`
  // the last act would be RESTRICTED, the status would compute as `restricted`,
  // and the licence would silently return to effective. Restoring autonomy
  // after a suspension requires a NEW reviewed licence lineage — the same rule
  // the RPC and the pure fold enforce independently.
  if (current.state.status === 'suspended') {
    return deny('license_suspended', 'a suspension is cleared only by a new licence lineage')
  }

  if (compareLevels(requestedLevel, current.state.licensedLevel) > 0) {
    return deny('restriction_raises_level')
  }

  const windowRefusal = validateWindow(request.effectiveAt, request.expiresAt)
  if (windowRefusal) return deny(windowRefusal)
  if (Date.parse(request.effectiveAt) < Date.parse(current.state.effectiveAt)) {
    return deny('restriction_extends_window', 'start-moved-earlier')
  }
  if (Date.parse(request.expiresAt) > Date.parse(current.state.expiresAt)) {
    return deny('restriction_extends_window', 'end-moved-later')
  }

  // Re-resolved against the CURRENT registry, so a restriction cannot smuggle
  // in a kind the registry no longer declares under a class it used to have.
  const scope = resolveActionScope(request.allowedActionKinds, current.state.boundDefKey)
  if (!scope.ok) return deny(scope.reason, scope.detail)
  const next = new Set(scope.scope.entries.map(e => e.actionKind))
  if ([...next].some(kind => !current.state.actionKinds.includes(kind))) {
    return deny('restriction_adds_action')
  }

  return append(current, auth.actor, {
    act: 'LICENSE_RESTRICTED',
    licensedLevel: requestedLevel,
    allowedActionKinds: scope.scope.entries.map(e => e.actionKind),
    actionScopeFingerprint: scope.scope.fingerprint,
    effectiveAt: request.effectiveAt,
    expiresAt: request.expiresAt,
    reason: request.reason ?? null,
  })
}

// ── SUSPEND / REVOKE / SUPERSEDE ──────────────────────────────────────────────

export async function suspendAutonomyLicense(
  request: LicenseIdRequest,
): Promise<LicenseWriteResult> {
  const current = await loadCurrent(request.licenseId)
  if (!current.ok) return deny(current.reason)
  // A suspension is a STOP, and stopping something already stopped is not a
  // narrowing act of any kind. The approved lifecycle admits exactly two acts
  // after a suspension — revocation and supersession — so a second suspension is
  // outside it. Refused here, by the RPC, and by the pure fold: "suspended"
  // means stopped, and a redundant stop is how a lifecycle vocabulary starts
  // growing meanings nobody agreed to.
  if (current.state.status === 'suspended') return deny('license_already_suspended')
  return finishLifecycle(current, 'LICENSE_SUSPENDED', request)
}

/** §18.57 — terminal for this licence lineage. */
export async function revokeAutonomyLicense(
  request: LicenseIdRequest,
): Promise<LicenseWriteResult> {
  const current = await loadCurrent(request.licenseId)
  if (!current.ok) return deny(current.reason)
  return finishLifecycle(current, 'LICENSE_REVOKED', request)
}

/** §18.56 — a replacement licence lineage exists. */
export async function supersedeAutonomyLicense(
  request: SupersedeLicenseRequest,
): Promise<LicenseWriteResult> {
  const current = await loadCurrent(request.licenseId)
  if (!current.ok) return deny(current.reason)
  const replacement = await loadCurrent(request.supersededByLicenseId)
  if (!replacement.ok) return deny('supersession_target_not_found')
  // §18.243 — autonomy is not transferable between unrelated contexts. A
  // supersession may not point a licence at another project's instance.
  if (replacement.state.workflowInstanceId !== current.state.workflowInstanceId) {
    return deny('supersession_target_not_found', 'subject-mismatch')
  }
  const auth = await authorize()
  if (!auth.ok) return deny(auth.reason)
  return append(current, auth.actor, {
    act: 'LICENSE_SUPERSEDED',
    licensedLevel: current.state.licensedLevel,
    allowedActionKinds: current.state.actionKinds,
    actionScopeFingerprint: current.state.recordedFingerprint,
    effectiveAt: current.state.effectiveAt,
    expiresAt: current.state.expiresAt,
    reason: request.reason ?? null,
    supersededByLicenseId: request.supersededByLicenseId,
  })
}

/** Authorize, then append — shared by the two acts that carry no new terms. */
async function finishLifecycle(
  current: CurrentLicense,
  act: Extract<LicenseAct, 'LICENSE_SUSPENDED' | 'LICENSE_REVOKED'>,
  request: LicenseIdRequest,
): Promise<LicenseWriteResult> {
  const auth = await authorize()
  if (!auth.ok) return deny(auth.reason)
  return append(current, auth.actor, {
    act,
    licensedLevel: current.state.licensedLevel,
    allowedActionKinds: current.state.actionKinds,
    actionScopeFingerprint: current.state.recordedFingerprint,
    effectiveAt: current.state.effectiveAt,
    expiresAt: current.state.expiresAt,
    reason: request.reason ?? null,
  })
}

interface CurrentLicense {
  ok: true
  state: ReturnType<typeof deriveLicenseState>
  lineage: LicenseEvent[]
}

/**
 * The licence a lifecycle act applies to, with its chain. A terminal lineage
 * (revoked or superseded) accepts no further act — `revocation` is the whole
 * point of a terminal state, and resuming autonomy after a suspension requires
 * a NEW reviewed act rather than an appended one (Ruling 7).
 */
async function loadCurrent(
  licenseId: string,
): Promise<CurrentLicense | { ok: false; reason: LicenseRefusal }> {
  const store = createAutonomyLicenseStore()
  let lineage: LicenseEvent[]
  try {
    lineage = await store.lineage(licenseId)
  } catch {
    return { ok: false, reason: 'license_not_found' }
  }
  if (lineage.length === 0) return { ok: false, reason: 'license_not_found' }

  let state: ReturnType<typeof deriveLicenseState>
  try {
    state = deriveLicenseState(lineage)
  } catch (error) {
    if (error instanceof MalformedLicenseLineageError) return { ok: false, reason: 'license_malformed' }
    throw error
  }

  if (state.status === 'revoked' || state.status === 'superseded') {
    return { ok: false, reason: 'license_terminal' }
  }
  return { ok: true, state, lineage }
}

/**
 * Append the next act.
 *
 * `generation` is derived from the chain this process just read, and the
 * database independently rejects a duplicate `(license_id, license_generation)`
 * — so if two humans act on the same licence state at once, exactly one row
 * lands and the other caller gets a refusal rather than a second canonicity.
 */
async function append(
  current: CurrentLicense,
  actor: string,
  fields: {
    act: LicenseAct
    licensedLevel: AutonomyLicenseLevel
    allowedActionKinds: readonly string[]
    actionScopeFingerprint: string
    effectiveAt: string
    expiresAt: string
    reason: string | null
    supersededByLicenseId?: string | null
  },
): Promise<LicenseWriteResult> {
  if (!LICENSE_ACTS.includes(fields.act)) return deny('license_malformed', fields.act)
  const generation = licenseGenerationOf(current.lineage)

  const store = createAutonomyLicenseStore()
  try {
    const event = await store.append({
      licenseId: current.state.licenseId,
      act: fields.act,
      projectId: current.state.projectId,
      workflowInstanceId: current.state.workflowInstanceId,
      boundDefKey: current.state.boundDefKey,
      boundDefHash: current.state.boundDefHash,
      licensedLevel: fields.licensedLevel,
      allowedActionKinds: fields.allowedActionKinds,
      actionScopeFingerprint: fields.actionScopeFingerprint,
      decisionId: current.state.decision.decisionId,
      decisionVersion: current.state.decision.version,
      decisionRecordId: current.state.decision.recordId,
      effectiveAt: fields.effectiveAt,
      expiresAt: fields.expiresAt,
      supersededByLicenseId: fields.supersededByLicenseId ?? null,
      reason: fields.reason,
      actor,
    })
    // `generation` is passed for the caller's benefit only if the store needs
    // it; the RPC derives it under the lock. Assert the invariant so a future
    // store that stops deriving it cannot silently break serialization.
    if (event.generation !== generation) {
      throw new Error(`generation mismatch: expected ${generation}, stored ${event.generation}`)
    }
    return { ok: true, event }
  } catch (error) {
    return deny('license_malformed', String((error as Error).message))
  }
}

/** The always-safe answer, exported so no caller invents its own default. */
export const NO_AUTONOMY: AutonomyLicenseLevel = INEFFECTIVE_LEVEL
