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
 * Proves whether a mission's declared tools and data are actually usable.
 * Read-only by contract: an availability check must never have a side effect.
 */
export interface MissionCapabilityAvailability {
  (input: {
    projectId: string
    tools: MissionToolBound[]
    dataScope: MissionDataScope[]
  }): Promise<MissionAvailability>
}

/**
 * The production default: nothing is proven available.
 *
 * Deliberately not a stub that returns `true`. Until EI-S1.4C provides the
 * sanctioned verification, a real mission stops at Approved, which is the
 * correct and safe answer rather than a convenient one.
 */
export const unprovenAvailability: MissionCapabilityAvailability = async ({ tools, dataScope }) => ({
  tools: false,
  data: false,
  unavailable: [...tools.map(t => t.tool), ...dataScope.map(d => d.resource)],
})
