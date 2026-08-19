/**
 * lib/atlas/mission/principal-read.ts — the sanctioned read boundary for
 * Executive Mission Briefs.
 *
 * ORDERING RULE: authenticate → establish project authority → only then read
 * the privileged store. Unknown mission and foreign-project mission return one
 * indistinguishable `not_permitted`.
 *
 * MISSION READINESS IS RE-EVALUATED LIVE. This is the deliberate opposite of
 * the Decision Ledger, and the difference is canonical rather than stylistic:
 *
 *   A decision's approval is a historical act. §11.180 has an active decision
 *   explain itself as "approved under this authority … and remains active until
 *   this review condition", so a later authorization change is a reason to
 *   review, never a retroactive unmaking. The ledger's governing read touches no
 *   live authorization state at all.
 *
 *   A mission's approval is an operational gate. §20.75 says approval "should
 *   expire if the object changes materially, scope expands, risk changes, the
 *   deadline passes, the workflow version changes, or the project mode
 *   changes", and §20.101 makes Ready depend on "Valid authority" in the
 *   present tense. So a mission whose Authorization V1 proof has expired, been
 *   revoked or been superseded is no longer operationally authorized — and no
 *   NEW handoff may be built on it.
 *
 * What live authority does NOT do is rewrite history. The `activated` act stays
 * exactly where it is; §20.128 forbids silent mutation. What changes is the
 * answer to "may this mission move further right now?", which becomes no, and
 * the derived status becomes `blocked` with an explicit reason (§20.103,
 * §20.87 — no silent blockers).
 *
 * `import 'server-only'` keeps this and the service-role store out of any
 * client bundle. No CRON_SECRET path reaches here: authority is the
 * authenticated human principal, never a shared secret.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { deriveMissionState, effectiveMissionStatus, missionReadiness } from './derive'
import {
  evaluateMissionOperationalAuthority,
  type ProjectModeReader,
} from './operational-authority'
import { createMissionLedgerStore, type MissionLedgerStore } from './store'
import type {
  DerivedMissionState,
  MissionEvaluation,
  MissionOperationalAuthority,
  MissionReadiness,
  MissionRecord,
} from './types'

export type MissionReadStatus =
  | 'ok'
  | 'no_principal'
  | 'project_denied'
  /** Unknown OR foreign — deliberately indistinguishable. */
  | 'not_permitted'
  | 'malformed'
  | 'unavailable'

export interface MissionReadArgs {
  store?: MissionLedgerStore
  now?: string
  /** Injected §20.75 project-mode reader; production callers omit it. */
  projectMode?: ProjectModeReader
}

const DENY = <T>(status: MissionReadStatus, empty: T) => ({ ...empty, status })

/**
 * Resolve one mission's immutable lineage and derived state.
 *
 * Scope comes from the lineage's own recorded project, never from a caller
 * parameter, so a caller cannot widen what they are allowed to see by asking
 * differently.
 */
export async function resolveMission(
  missionId: string,
  args: MissionReadArgs = {},
): Promise<{ state: DerivedMissionState | null; lineage: MissionRecord[]; status: MissionReadStatus }> {
  const empty = { state: null, lineage: [] as MissionRecord[] }

  const access = await resolveProjectAccess()
  if (!access.ok) return DENY('no_principal', empty)

  const store = args.store ?? createMissionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  let lineage: MissionRecord[]
  try {
    lineage = await store.lineage(missionId)
  } catch {
    return DENY('unavailable', empty)
  }
  if (lineage.length === 0) return DENY('not_permitted', empty)
  if (!assertProjectAllowed(lineage[0].projectId, access.allowedProjectIds)) return DENY('not_permitted', empty)

  try {
    return { state: deriveMissionState(lineage, { at }), lineage, status: 'ok' }
  } catch {
    return DENY('malformed', empty)
  }
}

/**
 * May this mission move toward execution or handoff RIGHT NOW?
 *
 * Delegates to the shared seam in `operational-authority.ts`, which the WRITE
 * boundary uses too. Before EI-S1.4B-R1 this logic lived only here, so a direct
 * `resumeMission()` call bypassed it entirely — the two boundaries must never
 * again hold separate copies of the same security question.
 */
export async function isMissionOperationallyAuthorized(
  missionId: string,
  args: MissionReadArgs = {},
): Promise<MissionOperationalAuthority & { status: MissionReadStatus }> {
  const at = args.now ?? new Date().toISOString()
  const read = await resolveMission(missionId, { ...args, now: at })
  if (read.status !== 'ok' || !read.state) {
    return { authorized: false, reason: 'no_authority_act', status: read.status }
  }
  const authority = await evaluateMissionOperationalAuthority(read.state, {
    now: at, projectMode: args.projectMode,
  })
  return { ...authority, status: 'ok' }
}

/**
 * THE public evaluation surface (EI-S1.4B-R1).
 *
 * Before R1 a caller could read `status: 'active'` from `resolveMission` while
 * `isMissionOperationallyAuthorized` said the mission could not move, with no
 * documented relationship between the two answers — and no API ever returned
 * `ready` at all, despite the README claiming a sixteen-status public surface.
 *
 * This returns all four layers together, so the relationship is explicit:
 *
 *   lifecycleStatus  what the immutable record says happened
 *   authority        whether the mission may move further right now
 *   readiness        §20.101, plus what V1 deliberately does not verify
 *   effectiveStatus  the canonical §20.98 status to show a human
 *
 * `ready` and authority-driven `blocked` exist only here. Neither is persisted;
 * neither can be asserted by a caller.
 */
export async function resolveMissionEvaluation(
  missionId: string,
  args: MissionReadArgs = {},
): Promise<{ evaluation: MissionEvaluation | null; status: MissionReadStatus }> {
  const at = args.now ?? new Date().toISOString()
  const read = await resolveMission(missionId, { ...args, now: at })
  if (read.status !== 'ok' || !read.state) return { evaluation: null, status: read.status }

  const authority = await evaluateMissionOperationalAuthority(read.state, {
    now: at, projectMode: args.projectMode,
  })
  const readiness = missionReadiness(read.state, authority, at)
  return {
    evaluation: {
      lifecycleStatus: read.state.status,
      effectiveStatus: effectiveMissionStatus(read.state, authority, readiness),
      authority,
      readiness,
      state: read.state,
    },
    status: 'ok',
  }
}

/**
 * §20.101 — is the mission Ready?
 *
 * Kept as a focused accessor over `resolveMissionEvaluation`, so it can never
 * disagree with the effective status.
 */
export async function resolveMissionReadiness(
  missionId: string,
  args: MissionReadArgs = {},
): Promise<{ readiness: MissionReadiness | null; authority: MissionOperationalAuthority | null; state: DerivedMissionState | null; status: MissionReadStatus }> {
  const { evaluation, status } = await resolveMissionEvaluation(missionId, args)
  if (!evaluation) return { readiness: null, authority: null, state: null, status }
  return {
    readiness: evaluation.readiness,
    authority: evaluation.authority,
    state: evaluation.state,
    status: 'ok',
  }
}

/**
 * Bounded audit listing for one project, newest first. The caller names the
 * scope, so `project_denied` reveals nothing they did not already assert.
 */
export async function listProjectMissions(
  projectId: string,
  args: MissionReadArgs & { limit?: number } = {},
): Promise<{ missions: DerivedMissionState[]; status: MissionReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { missions: [], status: 'no_principal' }
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return { missions: [], status: 'project_denied' }

  const store = args.store ?? createMissionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  let rows: MissionRecord[]
  try {
    rows = await store.byProject(projectId, args.limit)
  } catch {
    return { missions: [], status: 'unavailable' }
  }

  const byMission = new Map<string, MissionRecord[]>()
  for (const row of rows) {
    const list = byMission.get(row.missionId) ?? []
    list.push(row)
    byMission.set(row.missionId, list)
  }

  const missions: DerivedMissionState[] = []
  for (const lineage of byMission.values()) {
    try {
      missions.push(deriveMissionState(lineage, { at }))
    } catch {
      // A malformed lineage is surfaced by `resolveMission` for that mission
      // rather than poisoning the whole listing.
      continue
    }
  }
  missions.sort((a, b) => (a.lastRecordAt < b.lastRecordAt ? 1 : -1))
  return { missions, status: 'ok' }
}

/**
 * §20.98 — missions currently awaiting a human: those whose brief is complete
 * and which have not yet been approved.
 *
 * Derived from the same lineage as everything else, so it can never disagree
 * with `resolveMission`.
 */
export async function listMissionsAwaitingApproval(
  projectId: string,
  args: MissionReadArgs & { limit?: number } = {},
): Promise<{ missions: DerivedMissionState[]; status: MissionReadStatus }> {
  const listed = await listProjectMissions(projectId, args)
  if (listed.status !== 'ok') return listed
  return { missions: listed.missions.filter(m => m.status === 'awaiting_approval'), status: 'ok' }
}

/**
 * §20.195 — missions whose evidence is in and which are waiting on a completion
 * review.
 */
export async function listMissionsAwaitingReview(
  projectId: string,
  args: MissionReadArgs & { limit?: number } = {},
): Promise<{ missions: DerivedMissionState[]; status: MissionReadStatus }> {
  const listed = await listProjectMissions(projectId, args)
  if (listed.status !== 'ok') return listed
  return { missions: listed.missions.filter(m => m.status === 'awaiting_review'), status: 'ok' }
}
