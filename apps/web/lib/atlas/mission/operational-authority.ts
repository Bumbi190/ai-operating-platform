/**
 * lib/atlas/mission/operational-authority.ts — may this mission move RIGHT NOW?
 *
 * The single evaluation used by BOTH the write boundary and the read boundary.
 * EI-S1.4B-R1 exists partly because those two disagreed: `resumeMission` said
 * "the caller re-checks authority through the read boundary", which is a
 * comment, not an invariant — and a direct call to `resumeMission()` appended a
 * `resumed` act with no valid authority at all. A security property that
 * depends on some other code path having run first is not a security property.
 *
 * Mission authority is an OPERATIONAL GATE (§20.75), unlike the Decision
 * Ledger's historical approval (§11.180). Everything §20.75 lists as expiring
 * an approval is evaluated here:
 *
 *   material object / scope / risk change  → version N+1 + fresh authority
 *                                            (the amendment path handles it)
 *   deadline passes                        → `deadline_expired`
 *   project mode changes                   → `project_mode_changed`
 *   workflow version changes               → NOT APPLICABLE in V1. Mission V1
 *                                            binds no workflow, and inventing a
 *                                            workflow field to satisfy a future
 *                                            clause would be fake authority.
 *                                            Lands with EI-S1.4D.
 *
 * Plus the two proofs the mission's authority rests on: the Authorization V1
 * grant for the exact material version, and — when a Decision Ledger decision
 * is the authority source — that decision still governing at the exact version
 * the mission pinned.
 *
 * Fail-closed by construction: every path that cannot prove authority returns
 * `authorized: false` with a typed reason. No path returns true by default.
 */

import 'server-only'

import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import { resolveDecision } from '@/lib/atlas/decision-ledger/principal-read'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPastDeadline } from './derive'
import type { DerivedMissionState, MissionOperationalAuthority } from './types'

type AnyDb = any

/** Reads a project's current `atlas_mode`. Injectable so tests stay offline. */
export interface ProjectModeReader {
  (projectId: string): Promise<string | null>
}

/**
 * §20.75 project-mode input. `projects.atlas_mode` is a real Stage 1 primitive
 * (active | observer | hibernate | archived) already in production, so this is
 * one string and one equality check — not a policy engine.
 */
export const readProjectMode: ProjectModeReader = async (projectId) => {
  const { data, error } = await (createAdminClient() as AnyDb)
    .from('projects').select('atlas_mode').eq('id', projectId).maybeSingle()
  if (error) throw new Error(`[atlas-mission-ledger] project mode read failed: ${error.message}`)
  return (data?.atlas_mode as string | undefined) ?? null
}

export interface OperationalAuthorityArgs {
  now?: string
  projectMode?: ProjectModeReader
}

/**
 * Evaluate a mission's live operational authority.
 *
 * Takes an already-derived state so it can run BEFORE an irreversible append
 * (the write boundary) and equally on a read. It performs no writes.
 */
export async function evaluateMissionOperationalAuthority(
  state: DerivedMissionState,
  args: OperationalAuthorityArgs = {},
): Promise<MissionOperationalAuthority> {
  const at = args.now ?? new Date().toISOString()

  // §20.99 — a mission that was never approved has no authority to lose.
  const authority = state.authorityRecord
  if (!authority) return { authorized: false, reason: 'no_authority_act' }

  // §20.75 — "Approval should expire if… the deadline passes." Checked before
  // the seams, because a passed deadline denies regardless of what they say.
  if (isPastDeadline(state.deadline, at)) {
    return { authorized: false, reason: 'deadline_expired', detail: state.deadline ?? undefined }
  }

  // §20.75 — "…the project mode changes." Compare the mode snapshotted when the
  // mission was last authorized against the live value. A mission approved
  // while a project was `active` must not keep authorizing work after the
  // project moved to observer, hibernate or archived.
  if (state.projectMode) {
    let currentMode: string | null
    try {
      currentMode = await (args.projectMode ?? readProjectMode)(state.projectId)
    } catch {
      // Cannot prove the mode is unchanged → cannot authorize.
      return { authorized: false, reason: 'project_mode_changed', detail: 'unreadable' }
    }
    if (currentMode !== state.projectMode) {
      return {
        authorized: false,
        reason: 'project_mode_changed',
        detail: `${state.projectMode}->${currentMode ?? 'unknown'}`,
      }
    }
  }

  // §20.75/§20.101 — the proof must still be effective for this exact project,
  // mission version and action. A material amendment changed the bound hash, so
  // a stale proof cannot match it.
  const resolved = await isAuthorizationEffective(
    authority.authorizationId,
    {
      projectId: state.projectId,
      target: { targetType: 'mission', targetId: state.missionId, versionHash: authority.boundVersionHash },
      actionKind: authority.actionKind,
    },
    { now: at },
  )
  if (!resolved.effective) {
    return { authorized: false, reason: 'authorization_invalid', detail: `${resolved.status}:${resolved.reason}` }
  }
  // §20.55 — the proof must still belong to the human it was recorded for.
  if (resolved.state?.principalId !== authority.principalId) {
    return { authorized: false, reason: 'authorization_invalid', detail: 'principal_changed' }
  }

  const governing = await evaluateGoverningDecision(state, at)
  if (governing) return governing

  return { authorized: true, reason: 'authorized' }
}

/**
 * §20.137/§20.54 — when a Decision Ledger decision is the authority source, the
 * direction it authorized must still stand, AT THE VERSION THE MISSION PINNED.
 *
 * Returns a denial, or `null` when the decision is fine (or irrelevant).
 *
 * The version check is the reason `decisionVersion` is recorded at all. A
 * decision that materially amends to N+1 is, by §11.62, a different commitment:
 * different scope, risk, duration or authority. If the mission says version N
 * authorized its direction, silently accepting N+1 would let the institution
 * change what it decided without anyone re-examining the mission built on it.
 * Canonically that makes the mission need review or amendment (§20.125,
 * §20.129); it does not rewrite the Decision Ledger, which is read-only here.
 *
 * Unknown and foreign decisions deny identically, so this never becomes a
 * cross-project decision-id oracle. A caller-supplied `decisionRef.projectId`
 * proves nothing — the real scope comes from the decision's own record.
 */
export async function evaluateGoverningDecision(
  state: DerivedMissionState,
  at: string,
): Promise<MissionOperationalAuthority | null> {
  if (state.authoritySource?.kind !== 'decision_ledger' || !state.decisionRef) return null

  const decision = await resolveDecision(state.decisionRef.decisionId, { now: at })
  if (decision.status !== 'ok' || !decision.state) {
    return { authorized: false, reason: 'governing_decision_invalid', detail: 'unknown_or_foreign' }
  }
  if (decision.state.projectId !== state.projectId) {
    return { authorized: false, reason: 'governing_decision_invalid', detail: 'unknown_or_foreign' }
  }
  // §11.55/§11.56/§11.57 — expired, superseded and reversed decisions no longer
  // authorize direction.
  const stands = decision.state.status === 'approved' || decision.state.status === 'active'
  if (!stands) {
    return { authorized: false, reason: 'governing_decision_invalid', detail: decision.state.status }
  }
  if (decision.state.version !== state.decisionRef.decisionVersion) {
    return {
      authorized: false,
      reason: 'governing_decision_invalid',
      detail: `version_drift:${state.decisionRef.decisionVersion}->${decision.state.version}`,
    }
  }
  return null
}
