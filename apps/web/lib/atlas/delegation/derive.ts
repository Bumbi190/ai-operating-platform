/**
 * lib/atlas/delegation/derive.ts — the delegation lineage, reduced.
 *
 * Pure. Given the immutable acts, this returns what they mean. It never asks
 * the clock about authority, never reads the Mission, and never talks to the
 * database, so every rule below can be exercised directly in a test.
 *
 * WHAT IS AND IS NOT DERIVED HERE:
 *
 *   Derived here — `prepared`, `accepted`, `rejected`, `revoked`. Each is a
 *   fact the lineage itself records.
 *
 *   NOT derived here — `invalidated`. An envelope is invalidated when the
 *   PARENT MISSION stops authorizing it (§21.27), which is a live question
 *   about another record, not a fact in this lineage. Deriving it here would
 *   mean either storing a stale copy of Mission state or lying. The live answer
 *   is assembled in `principal-read.ts`, exactly as the Mission module keeps
 *   `lifecycleStatus` and `effectiveStatus` apart.
 */

import type {
  DelegationActType,
  DelegationRecord,
  DelegationReplan,
  DelegationStatus,
  DerivedDelegationState,
} from './types'

/** Acts that end the acceptance decision. At most one may ever appear. */
export const DELEGATION_DECIDING_ACTS: readonly DelegationActType[] = [
  'delegation.accepted',
  'delegation.rejected',
] as const

/**
 * Deterministic order.
 *
 * `occurredAt` first, then `recordId` as the tie-break. Two acts at the same
 * instant are a genuine ambiguity, so the tie-break is only ever applied to
 * ANNOTATION acts (replans), never to acts that decide authority — a same
 * instant collision between two deciding acts is rejected below rather than
 * settled by whichever identifier happens to sort first.
 */
export function orderDelegationRecords(records: DelegationRecord[]): DelegationRecord[] {
  return [...records].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1
    return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0
  })
}

export class MalformedDelegationError extends Error {}

function fail(why: string): never {
  throw new MalformedDelegationError(why)
}

/**
 * Reduce a lineage to its derived state.
 *
 * Throws rather than returning a best guess. A delegation lineage that violates
 * these invariants is corrupt, and a corrupt authority record must stop the
 * caller, not hand it a plausible-looking envelope.
 */
export function deriveDelegationState(records: DelegationRecord[]): DerivedDelegationState {
  if (records.length === 0) fail('empty delegation lineage')

  const ordered = orderDelegationRecords(records)
  const first = ordered[0]

  if (first.actType !== 'delegation.prepared') {
    fail(`delegation lineage does not begin with prepared: ${first.actType}`)
  }
  const envelope = first.envelope
  if (!envelope) fail('prepared act carries no envelope')

  // Every act must agree on what it is an act ABOUT. A row that drifts on any
  // of these is not a later act in this lineage; it is a different delegation
  // wearing the same id, and treating it as one would let a foreign row edit
  // this envelope's meaning.
  for (const r of ordered) {
    if (r.envelopeId !== first.envelopeId) fail('lineage mixes envelope ids')
    if (r.projectId !== first.projectId) fail('lineage mixes projects')
    if (r.missionId !== first.missionId) fail('lineage mixes missions')
    if (r.missionVersion !== first.missionVersion) fail('lineage mixes mission versions')
    if (r.missionBoundHash !== first.missionBoundHash) fail('lineage mixes mission bound hashes')
  }

  let prepared = 0
  let deciding = 0
  let revoked = 0
  for (const r of ordered) {
    if (r.actType === 'delegation.prepared') prepared += 1
    if (r.actType === 'delegation.accepted' || r.actType === 'delegation.rejected') deciding += 1
    if (r.actType === 'delegation.revoked') revoked += 1
  }
  // §21.16 — an envelope is decided once. A second decision is not an update,
  // it is a contradiction, and immutability means it can never be reconciled.
  if (prepared !== 1) fail(`expected exactly one prepared act, found ${prepared}`)
  if (deciding > 1) fail(`delegation decided more than once (${deciding})`)
  if (revoked > 1) fail(`delegation revoked more than once (${revoked})`)

  const decision = ordered.find(
    r => r.actType === 'delegation.accepted' || r.actType === 'delegation.rejected',
  )
  const revocation = ordered.find(r => r.actType === 'delegation.revoked')

  // §21.17 — a rejection ends the handoff. Revoking what was already refused is
  // meaningless, and permitting it would blur two different endings.
  if (revocation && decision?.actType === 'delegation.rejected') {
    fail('rejected delegation cannot also be revoked')
  }

  const replans = ordered.filter(
    r => r.actType === 'delegation.replan.operational' || r.actType === 'delegation.replan.referred',
  )
  // §21.20 — replanning is something a Manager does with work it ACCEPTED.
  // A replan against an undecided or refused envelope has no work to replan.
  if (replans.length > 0 && decision?.actType !== 'delegation.accepted') {
    fail('replan recorded against a delegation that was never accepted')
  }

  let status: DelegationStatus = 'prepared'
  if (decision?.actType === 'delegation.accepted') status = 'accepted'
  if (decision?.actType === 'delegation.rejected') status = 'rejected'
  if (revocation) status = 'revoked'

  const referrals: DelegationReplan[] = replans
    .filter(r => r.actType === 'delegation.replan.referred' && r.replan)
    .map(r => r.replan as DelegationReplan)

  return {
    envelopeId: first.envelopeId,
    projectId: first.projectId,
    status,
    envelope,
    missionId: first.missionId,
    missionVersion: first.missionVersion,
    missionBoundHash: first.missionBoundHash,
    preparedAt: first.occurredAt,
    decidedAt: decision?.occurredAt ?? null,
    rejections: decision?.actType === 'delegation.rejected' ? decision.rejections : [],
    revokedReason: revocation?.revokedReason ?? null,
    referrals,
  }
}

/**
 * §21.18 — may this envelope still be decided?
 *
 * Immutability once decided (accepted, rejected or revoked) is the whole point:
 * an accepted envelope whose bounds could still move is not a contract.
 */
export function isDecidable(state: DerivedDelegationState): boolean {
  return state.status === 'prepared'
}

/** Is this envelope in a state where accepted work could proceed at all? */
export function isLive(state: DerivedDelegationState): boolean {
  return state.status === 'accepted'
}
