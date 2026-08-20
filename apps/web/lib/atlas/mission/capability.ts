/**
 * lib/atlas/mission/capability.ts — §20.105 tool and data AVAILABILITY.
 *
 * "Before activation, Omnira should verify: … Tools. Data access." Declaring a
 * tool is not the same as having it, and EI-S1.4B-R1 conflated the two: it
 * checked `tools.length > 0`, reported `ready: true`, and simultaneously
 * admitted `unverified: ['tool_availability', 'data_availability']`. A mission
 * cannot be canonically Ready while an input it requires is unproven.
 *
 * Stage 1 has no production capability-availability primitive. Rather than
 * pretend otherwise, this seam is injectable and its PRODUCTION DEFAULT FAILS
 * CLOSED: absence of proof is never proof of availability. A production mission
 * may therefore be Approved but must not become Ready or Active on declaration
 * alone. Nothing is lost — EI-S1.4B executes nothing either way.
 *
 * EI-S1.4C supplies the real check: §21.16 makes "Required tools exist" part of
 * Manager's delegation acceptance, which is where the knowledge actually lives.
 */

import type { MissionDataScope, MissionToolBound } from './types'

export interface MissionAvailability {
  tools: boolean
  data:  boolean
  /** Which declared tools/resources could not be proven, for reporting. */
  unavailable?: string[]
}

/**
 * WHICH mission is asking, and about what.
 *
 * EI-S1.4C-R1 added the mission identity. Before it, the query carried only
 * `projectId`, `tools` and `dataScope` — enough for a capability-only check,
 * and NOT enough for any proof that derives from a specific artifact. A
 * delegation-derived proof cut for Mission A would have satisfied Mission B in
 * the same project merely because both requested the same tools, since the seam
 * never told the implementation which mission it was answering about.
 *
 * EVERY FIELD HERE IS SERVER-DERIVED. The mission write and read boundaries
 * populate them from the mission's own derived state, never from a caller
 * parameter: identity a caller supplies is identity a caller can forge, and
 * this is a security boundary.
 */
export interface MissionCapabilityQuery {
  projectId: string
  /** The exact mission asking. Taken from the lineage, never from a caller. */
  missionId: string
  /** The exact version asking. A proof for version N must not answer for N+1. */
  missionVersion: number
  tools: MissionToolBound[]
  dataScope: MissionDataScope[]
}

/**
 * Proves whether a mission's declared tools and data are actually usable.
 * Read-only by contract: an availability check must never have a side effect.
 *
 * Implementations may ignore the identity fields when their answer genuinely
 * does not depend on which mission is asking (a pure capability lookup), but
 * any implementation whose answer derives from a specific artifact MUST check
 * them.
 */
export interface MissionCapabilityAvailability {
  (input: MissionCapabilityQuery): Promise<MissionAvailability>
}

/**
 * The production default: nothing is proven available.
 *
 * Deliberately not a stub that returns `true`. Until EI-S1.4C provides the
 * sanctioned verification, a real mission stops at Approved, which is the
 * correct and safe answer rather than a convenient one.
 */
// Ignores the mission identity deliberately: it proves nothing for any mission,
// so which mission is asking cannot change the answer.
export const unprovenAvailability: MissionCapabilityAvailability = async ({ tools, dataScope }) => ({
  tools: false,
  data: false,
  unavailable: [...tools.map(t => t.tool), ...dataScope.map(d => d.resource)],
})
