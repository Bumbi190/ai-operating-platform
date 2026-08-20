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
  DelegationActorKind,
  DelegationActType,
  DelegationRecord,
  DelegationReplan,
  DelegationStatus,
  DerivedDelegationState,
} from './types'

/** The Manager's one ledger identity. Duplicated nowhere: the write boundary imports it from here. */
export const MANAGER_ACTOR_ID = 'atlas.manager'

/**
 * §21.19 — which actor may perform which act.
 *
 * Provenance is not decoration. "The Manager accepted this" is a claim the
 * ledger makes about who bound themselves to a contract, and a lineage that
 * lets an Executive record a Manager acceptance — or a Manager record its own
 * delegation — is institutional history that cannot be trusted.
 *
 * `system` is deliberately absent from every entry. V1 has no system act, and
 * inventing one to fill the enum would create an actor with no principal behind
 * it. The kind stays reserved in the type and is invalid on all six acts.
 */
export const DELEGATION_ACT_ACTOR: Record<DelegationActType, DelegationActorKind> = {
  // The Executive cuts and withdraws the envelope.
  'delegation.prepared': 'executive_principal',
  'delegation.revoked':  'executive_principal',
  // The Manager decides and replans. §21.16 — acceptance is the Manager's act.
  'delegation.accepted': 'manager',
  'delegation.rejected': 'manager',
  'delegation.replan.operational': 'manager',
  'delegation.replan.referred':    'manager',
}

/** Acts that end the acceptance decision. At most one may ever appear. */
export const DELEGATION_DECIDING_ACTS: readonly DelegationActType[] = [
  'delegation.accepted',
  'delegation.rejected',
] as const

/**
 * Deterministic causal order.
 *
 * `lineageSequence` FIRST, and it alone decides: it is unique per envelope, so
 * the comparison is total before any other field is consulted. The remaining
 * keys are unreachable stable tie-breaks, kept only so the sort never depends
 * on input order if a lineage is ever read from somewhere that lost the
 * uniqueness guarantee.
 *
 * WHY NOT `occurredAt` FIRST. A wall clock does not establish causality between
 * two writers, and two acts stamped in the same millisecond fell through to
 * `recordId` — a random UUID deciding whether a Manager's replan happened
 * before or after an Executive's revocation. The sequence is derived from the
 * lineage a writer actually READ, so it records what that writer knew, which is
 * the only honest basis for "what came first".
 */
export function orderDelegationRecords(records: DelegationRecord[]): DelegationRecord[] {
  return [...records].sort((a, b) => {
    if (a.lineageSequence !== b.lineageSequence) return a.lineageSequence - b.lineageSequence
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1
    return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0
  })
}

/** The position a new act must claim, given the exact lineage a writer read. */
export function nextLineageSequence(records: DelegationRecord[]): number {
  return records.length
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

  // §21.18 — the positions must be exactly 0..n-1, each claimed once.
  //
  // Uniqueness is enforced by the database, and the write boundary derives each
  // position from the lineage it read, so a gap or a duplicate cannot arise
  // through the sanctioned path. Reaching one here means a row was written
  // around that path, and a lineage whose causal order is ambiguous must stop
  // the caller rather than hand back a plausible-looking envelope.
  const seen = new Set<number>()
  for (const r of ordered) {
    if (!Number.isInteger(r.lineageSequence) || r.lineageSequence < 0) {
      fail(`lineage sequence ${r.lineageSequence} is not a position`)
    }
    if (seen.has(r.lineageSequence)) fail(`lineage sequence ${r.lineageSequence} claimed twice`)
    seen.add(r.lineageSequence)
  }
  for (let i = 0; i < ordered.length; i += 1) {
    if (ordered[i].lineageSequence !== i) {
      fail(`lineage sequence gap at position ${i}: found ${ordered[i].lineageSequence}`)
    }
  }

  if (first.actType !== 'delegation.prepared') {
    fail(`delegation lineage does not begin with prepared: ${first.actType}`)
  }
  const envelope = first.envelope
  if (!envelope) fail('prepared act carries no envelope')

  // §21.19 — the envelope JSON must agree with the relational columns carrying
  // it. A row whose columns say Mission A while its payload says Mission B is
  // not a disagreement to resolve; it is corrupt institutional history, and the
  // two halves would authorize different things depending on which one a reader
  // happened to trust. Every later check in this file reads the COLUMNS, so an
  // unchecked payload could quietly become the authority a caller acts on.
  if (envelope.envelopeId !== first.envelopeId) fail('envelope id disagrees with its record')
  if (envelope.projectId !== first.projectId) fail('envelope project disagrees with its record')
  if (envelope.missionId !== first.missionId) fail('envelope mission disagrees with its record')
  if (envelope.missionVersion !== first.missionVersion) fail('envelope mission version disagrees with its record')
  if (envelope.missionBoundHash !== first.missionBoundHash) fail('envelope bound hash disagrees with its record')
  // §3.5 — Stage 1 ships exactly one hop. A stored envelope naming any other
  // recipient is either corrupt or from a stage that does not exist yet.
  if (envelope.delegatedTo !== 'manager') fail(`envelope delegates to ${envelope.delegatedTo}, not manager`)

  // §21.19 — every act is performed by the actor canon assigns to it.
  for (const r of ordered) {
    const expected = DELEGATION_ACT_ACTOR[r.actType]
    if (!expected) fail(`unknown act type ${r.actType}`)
    if (r.actorKind !== expected) {
      fail(`${r.actType} recorded by ${r.actorKind}, expected ${expected}`)
    }
    if (expected === 'executive_principal') {
      // A human act names its human. Unattributable authority is not authority.
      if (!r.actorId || r.actorId.trim().length === 0) fail(`${r.actType} has no acting principal`)
    } else if (r.actorId !== MANAGER_ACTOR_ID) {
      // The Manager has exactly one identity. An arbitrary string here would let
      // a row claim "some manager" accepted, which is not a party to anything.
      fail(`${r.actType} manager identity is ${r.actorId}, expected ${MANAGER_ACTOR_ID}`)
    }
  }

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
  // §21.27 — REVOCATION IS A HARD STOP. Authority ended at that position, so no
  // Manager act may sit causally after it. Comparing positions rather than
  // timestamps is the whole point: a replan stamped in the same millisecond as
  // the revocation used to be ordered by a random identifier, which meant the
  // same history could be read either way.
  if (revocation) {
    for (const r of replans) {
      if (r.lineageSequence > revocation.lineageSequence) {
        fail(`replan at position ${r.lineageSequence} follows revocation at ${revocation.lineageSequence}`)
      }
    }
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
