/**
 * lib/atlas/delegation/principal-read.ts — the public read surface.
 *
 * Two layers, kept explicitly apart for the same reason the Mission module
 * keeps them apart:
 *
 *   lifecycleStatus  what the immutable lineage says happened
 *   effectiveStatus  what is true right now, once the live Mission is consulted
 *
 * `invalidated` exists only in the second. An envelope can be permanently,
 * truthfully `accepted` in the ledger and completely unusable this second
 * because the Mission behind it was cancelled, amended, expired or revoked
 * (§21.27). Storing that as a column would mean writing to the ledger every
 * time the world changed, which is both impossible and dishonest — so it is
 * derived, every read, from the Mission itself.
 *
 * `usable` is the question a caller actually has, and it is deliberately the
 * conjunction of everything: accepted, not revoked, Mission authorizes, version
 * still pinned, containment still holds.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { resolveMissionEvaluation, type MissionReadArgs } from '@/lib/atlas/mission/principal-read'
import type { MissionAuthorityReason } from '@/lib/atlas/mission/types'
import { envelopeIsContained } from './attenuate'
import { registryAvailability } from './availability'
import { deriveDelegationState, MalformedDelegationError } from './derive'
import { parentFromMission } from './principal-write'
import { createDelegationLedgerStore, type DelegationLedgerStore } from './store'
import type { DelegationRecord, DelegationStatus, DerivedDelegationState } from './types'

export type DelegationReadStatus =
  | 'ok'
  | 'no_principal'
  | 'project_denied'
  /** Unknown OR foreign — deliberately indistinguishable. */
  | 'not_permitted'
  | 'malformed'
  | 'unavailable'

export interface DelegationReadArgs {
  store?: DelegationLedgerStore
  now?: string
  mission?: Pick<MissionReadArgs, 'store' | 'projectMode' | 'availability'>
}

/** Why an envelope is not usable right now. */
export type DelegationUnusableReason =
  | 'usable'
  | 'not_accepted'
  | 'rejected'
  | 'revoked'
  /** §21.14 — the parent Mission does not authorize movement. */
  | 'mission_not_authorized'
  /** §21.15 — the Mission advanced past the pinned version. */
  | 'mission_version_changed'
  /** §6.39 — the envelope is no longer contained by its Mission. */
  | 'delegation_exceeds_mission'
  | 'mission_unreadable'

export interface DelegationEvaluation {
  lifecycleStatus: DelegationStatus
  effectiveStatus: DelegationStatus
  usable: boolean
  reason: DelegationUnusableReason
  /** The live Mission's own authority verdict, carried for reporting. */
  missionAuthority: MissionAuthorityReason | null
  state: DerivedDelegationState
}

const DENY = <T>(status: DelegationReadStatus, empty: T) => ({ ...empty, status })

/**
 * Resolve one envelope's lineage and its derived state.
 *
 * Scope comes from the lineage's own recorded project, never from a caller
 * parameter, so a caller cannot widen what they may see by asking differently.
 */
export async function resolveDelegation(
  envelopeId: string,
  args: DelegationReadArgs = {},
): Promise<{ state: DerivedDelegationState | null; lineage: DelegationRecord[]; status: DelegationReadStatus }> {
  const empty = { state: null, lineage: [] as DelegationRecord[] }

  const access = await resolveProjectAccess()
  if (!access.ok) return DENY('no_principal', empty)

  const store = args.store ?? createDelegationLedgerStore()

  let lineage: DelegationRecord[]
  try {
    lineage = await store.lineage(envelopeId)
  } catch {
    return DENY('unavailable', empty)
  }
  if (lineage.length === 0) return DENY('not_permitted', empty)
  if (!assertProjectAllowed(lineage[0].projectId, access.allowedProjectIds)) {
    return DENY('not_permitted', empty)
  }

  try {
    return { state: deriveDelegationState(lineage), lineage, status: 'ok' }
  } catch (error) {
    if (error instanceof MalformedDelegationError) return DENY('malformed', empty)
    return DENY('malformed', empty)
  }
}

/**
 * THE public evaluation surface.
 *
 * Consults the live Mission on every call. An envelope is never authority on
 * its own, so nothing here shortcuts that read for a "fast path" — a fast
 * answer about authority that skips the authority is not an optimization.
 */
export async function resolveDelegationEvaluation(
  envelopeId: string,
  args: DelegationReadArgs = {},
): Promise<{ evaluation: DelegationEvaluation | null; status: DelegationReadStatus }> {
  const at = args.now ?? new Date().toISOString()
  const read = await resolveDelegation(envelopeId, args)
  if (read.status !== 'ok' || !read.state) return { evaluation: null, status: read.status }
  const state = read.state

  const settle = (
    effectiveStatus: DelegationStatus,
    reason: DelegationUnusableReason,
    missionAuthority: MissionAuthorityReason | null,
  ) => ({
    evaluation: {
      lifecycleStatus: state.status,
      effectiveStatus,
      usable: reason === 'usable',
      reason,
      missionAuthority,
      state,
    },
    status: 'ok' as const,
  })

  // Lineage-terminal states need no Mission read: nothing the Mission says can
  // make a revoked or rejected envelope usable again.
  if (state.status === 'revoked') return settle('revoked', 'revoked', null)
  if (state.status === 'rejected') return settle('rejected', 'rejected', null)
  if (state.status !== 'accepted') return settle(state.status, 'not_accepted', null)

  const { evaluation: mission, status } = await resolveMissionEvaluation(state.missionId, {
    ...args.mission,
    now: at,
    availability: args.mission?.availability ?? registryAvailability,
  })
  // A Mission that cannot be read cannot authorize. Fail closed rather than
  // treating an unreadable parent as a permissive one.
  if (status !== 'ok' || !mission) return settle('invalidated', 'mission_unreadable', null)

  if (!mission.authority.authorized) {
    return settle('invalidated', 'mission_not_authorized', mission.authority.reason)
  }
  if (mission.state.version !== state.missionVersion) {
    return settle('invalidated', 'mission_version_changed', mission.authority.reason)
  }
  const violations = envelopeIsContained(parentFromMission(mission), state.envelope)
  if (violations.length > 0) {
    return settle('invalidated', 'delegation_exceeds_mission', mission.authority.reason)
  }

  return settle('accepted', 'usable', mission.authority.reason)
}

/**
 * §21.27 — the minimum revocation rule, as a single question.
 *
 * Any caller about to rely on a delegation asks this and gets one boolean that
 * already accounts for the Mission. There is deliberately no cheaper variant.
 */
export async function isDelegationUsable(
  envelopeId: string,
  args: DelegationReadArgs = {},
): Promise<{ usable: boolean; reason: DelegationUnusableReason; status: DelegationReadStatus }> {
  const { evaluation, status } = await resolveDelegationEvaluation(envelopeId, args)
  if (!evaluation) return { usable: false, reason: 'mission_unreadable', status }
  return { usable: evaluation.usable, reason: evaluation.reason, status: 'ok' }
}

/**
 * Bounded audit listing for one project, newest first. The caller names the
 * scope, so `project_denied` reveals nothing they did not already assert.
 */
export async function listProjectDelegations(
  projectId: string,
  args: DelegationReadArgs & { limit?: number } = {},
): Promise<{ records: DelegationRecord[]; status: DelegationReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { records: [], status: 'no_principal' }
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) {
    return { records: [], status: 'project_denied' }
  }
  const store = args.store ?? createDelegationLedgerStore()
  try {
    return { records: await store.byProject(projectId, args.limit), status: 'ok' }
  } catch {
    return { records: [], status: 'unavailable' }
  }
}

/**
 * Every delegation cut from one Mission.
 *
 * Scope is taken from the records themselves and filtered against the caller's
 * projects, so an unknown mission and a foreign mission both return an empty
 * list rather than different answers.
 */
export async function listMissionDelegations(
  missionId: string,
  args: DelegationReadArgs & { limit?: number } = {},
): Promise<{ records: DelegationRecord[]; status: DelegationReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { records: [], status: 'no_principal' }
  const store = args.store ?? createDelegationLedgerStore()
  try {
    const records = await store.byMission(missionId, args.limit)
    return {
      records: records.filter(r => assertProjectAllowed(r.projectId, access.allowedProjectIds)),
      status: 'ok',
    }
  } catch {
    return { records: [], status: 'unavailable' }
  }
}
