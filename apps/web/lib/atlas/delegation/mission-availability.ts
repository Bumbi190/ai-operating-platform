/**
 * lib/atlas/delegation/mission-availability.ts — Manager acceptance AS the
 * Mission's §20.105 availability proof.
 *
 * THIS IS THE SEAM EI-S1.4C EXISTED TO CLOSE. Before EI-S1.4C-R1, capability
 * availability and Manager acceptance were two parallel facts: a Mission could
 * be handed any implementation that answered "tools: true, data: true" and
 * activate, while an accepted Delegation Envelope sat beside it proving nothing.
 * The canonical chain is not parallel, it is sequential:
 *
 *     Mission
 *       → Delegation Envelope (attenuated from an exact version)
 *       → Manager ACCEPT (§21.16 checks actually pass)
 *       → accepted capability proof            ← this file
 *       → separate mission.activate Authorization V1 proof
 *       → Active
 *
 * WHAT THIS DOES NOT DO: it does not activate anything. It answers one question
 * — "is this capability proven for this exact Mission version?" — and the
 * Mission write boundary still requires its own, separate `mission.activate`
 * authorization, its own §20.106 checklist, and every other requirement.
 * Manager acceptance is a NECESSARY input to activation and never a sufficient
 * one. §3.5: the Manager coordinates; it does not grant itself a Mission.
 *
 * NO CACHE, EVER. Every evaluation re-reads the envelope and re-asks the live
 * Mission. An acceptance is a fact about a moment; treating it as a standing
 * permission is exactly the mistake §21.27 revocation exists to prevent.
 */

import 'server-only'

import type { MissionCapabilityAvailability, MissionCapabilityQuery } from '@/lib/atlas/mission/capability'
import type { MissionDataScope, MissionToolBound } from '@/lib/atlas/mission/types'
import { registryAvailability } from './availability'
import { resolveDelegationEvaluation, type DelegationReadArgs } from './principal-read'
import type { DelegationEnvelope } from './types'

/** Write subsumes read; read never subsumes write. Same lattice as attenuation. */
const ACCESS_RANK: Record<MissionDataScope['access'], number> = { read: 1, write: 2 }

const toolKey = (t: MissionToolBound) => `${t.tool} ${t.restriction ?? ''}`

/**
 * §21.13 — does the accepted envelope COVER everything being asked about?
 *
 * This is the direction people get backwards. Attenuation guarantees
 * `delegation ⊆ mission`. Availability needs the opposite guarantee about the
 * queried set: `queried ⊆ delegation`. A Manager that accepted an envelope
 * carrying tool A has proven A — it has said nothing whatsoever about B, and a
 * Mission requiring A + B must not read "the Manager accepted" as covering both.
 *
 * The envelope is never widened here to make a proof fit. If the query reaches
 * outside the accepted envelope, the answer is no.
 */
export function envelopeCovers(
  envelope: DelegationEnvelope,
  query: Pick<MissionCapabilityQuery, 'tools' | 'dataScope'>,
): { covered: boolean; uncovered: string[] } {
  const uncovered: string[] = []

  const held = new Set(envelope.tools.map(toolKey))
  for (const t of query.tools) {
    // Restriction is part of the key: an envelope carrying `publish` restricted
    // to drafts has not proven availability of unrestricted `publish`.
    if (!held.has(toolKey(t))) uncovered.push(`tool:${t.tool}`)
  }

  const best = new Map<string, number>()
  for (const d of envelope.dataScope) {
    best.set(d.resource, Math.max(best.get(d.resource) ?? 0, ACCESS_RANK[d.access]))
  }
  for (const d of query.dataScope) {
    if ((best.get(d.resource) ?? 0) < ACCESS_RANK[d.access]) {
      uncovered.push(`data:${d.resource}:${d.access}`)
    }
  }

  return { covered: uncovered.length === 0, uncovered }
}

export interface AcceptedDelegationAvailabilityArgs extends DelegationReadArgs {
  /**
   * The real capability source consulted after the delegation proof holds.
   * Defaults to `registryAvailability`. An accepted envelope establishes that
   * the Manager took the work on; it does not conjure a tool into existence, so
   * the underlying source still has to say yes.
   */
  source?: MissionCapabilityAvailability
}

/**
 * Build a `MissionCapabilityAvailability` backed by one accepted Delegation.
 *
 * Every evaluation re-proves, in order:
 *
 *   1. the envelope exists and is readable by this principal in this project
 *   2. its lineage status is `accepted`
 *   3. its EFFECTIVE status is usable — which is where the live Mission is
 *      re-asked, and therefore where authority expiry, revocation, project-mode
 *      change, governing-decision invalidation, version drift, bound-hash drift
 *      and lost containment all fail closed (see `resolveDelegationEvaluation`)
 *   4. the envelope's mission id matches the asking Mission
 *   5. the envelope's mission version matches the asking version
 *   6. the envelope's project matches the asking project
 *   7. the accepted envelope COVERS every queried tool and data scope
 *   8. the real underlying availability source still proves the capability
 *
 * Any failure returns `{ tools: false, data: false }`. There is deliberately no
 * partial credit and no "mostly usable": a caller asking whether it may proceed
 * gets one answer, and the safe answer to a broken proof is no.
 */
export function availabilityFromAcceptedDelegation(
  envelopeId: string,
  args: AcceptedDelegationAvailabilityArgs = {},
): MissionCapabilityAvailability {
  const source = args.source ?? registryAvailability

  return async (query: MissionCapabilityQuery) => {
    const deny = (unavailable: string[]) => ({ tools: false, data: false, unavailable })

    const { evaluation, status } = await resolveDelegationEvaluation(envelopeId, args)
    if (status !== 'ok' || !evaluation) return deny(['delegation_unreadable'])

    // Steps 2 and 3. `usable` already requires lifecycle `accepted`, but both
    // are asserted so the intent survives a future change to either.
    if (evaluation.lifecycleStatus !== 'accepted') return deny([`delegation_${evaluation.lifecycleStatus}`])
    if (!evaluation.usable) return deny([`delegation_${evaluation.reason}`])

    const envelope = evaluation.state.envelope

    // Steps 4–6. Exact identity. A proof cut for Mission A in this project must
    // never answer for Mission B merely because both want the same tools.
    if (envelope.missionId !== query.missionId) return deny(['mission_mismatch'])
    if (envelope.missionVersion !== query.missionVersion) return deny(['mission_version_mismatch'])
    if (envelope.projectId !== query.projectId) return deny(['project_mismatch'])

    // Step 7. Coverage.
    const coverage = envelopeCovers(envelope, query)
    if (!coverage.covered) return deny(coverage.uncovered)

    // Step 8. The underlying source still has to prove the capability itself.
    let proven
    try {
      proven = await source(query)
    } catch {
      return deny(['availability_source_unreadable'])
    }
    return {
      tools: proven.tools,
      data: proven.data,
      ...(proven.unavailable ? { unavailable: proven.unavailable } : {}),
    }
  }
}
