/**
 * lib/atlas/delegation/availability.ts — §20.105 / §21.16 capability proof.
 *
 * The first sanctioned real implementation of `MissionCapabilityAvailability`.
 * EI-S1.4B shipped `unprovenAvailability`, which proves nothing and says so.
 * This replaces it for the delegation path with a check that consults an actual
 * shipped source of truth — and, where no such source exists, still refuses to
 * pretend.
 *
 * THE HONEST ANSWER PER CATEGORY:
 *
 *   DATA — real. `DOMAIN_REGISTRY` is not a convenience list; it IS the
 *   security boundary for `get_records`, and only what it declares is
 *   reachable. So "can this Mission read `leads`?" has a true, checkable answer
 *   in this repository today, and this file gives it.
 *
 *   DATA, WRITE ACCESS — fails closed. The registry proves what may be READ.
 *   No shipped registry authorizes a Mission to WRITE a resource, so a declared
 *   `access: 'write'` scope is unproven by construction. Reading a read-only
 *   registry as if it also granted writes is precisely the optimism this seam
 *   exists to prevent.
 *
 *   TOOLS — fails closed. There is no enumerated tool registry in this
 *   codebase: no `TOOL_REGISTRY`, no `ToolName` union, no per-project tool
 *   inventory. `MissionToolBound.tool` is a free string, so matching it against
 *   workflow or agent names would mean inventing a naming convention and then
 *   trusting it. An invented convention is not a source of truth. Until a real
 *   registry ships, a Mission that declares tools cannot prove it has them.
 *
 * The one non-false answer that is NOT optimism: a Mission declaring no tools
 * and no data has nothing to prove, and vacuous satisfaction is a fact rather
 * than a guess.
 *
 * READ-ONLY BY CONTRACT. This function performs no writes and reaches no
 * network. Availability is a question; asking it must never change anything.
 */

import { DOMAIN_REGISTRY, type RecordDomain } from '../data-registry'
import type { MissionCapabilityAvailability } from '../mission/capability'
import type { MissionDataScope, MissionToolBound } from '../mission/types'

const REGISTERED = new Set<string>(Object.keys(DOMAIN_REGISTRY) as RecordDomain[])

/** A declared read scope is proven iff the registry actually exposes it. */
export function dataScopeIsProven(scope: MissionDataScope): boolean {
  if (scope.access !== 'read') return false
  return REGISTERED.has(scope.resource)
}

/**
 * Why each unproven capability is unproven, so a §21.17 rejection can name a
 * specific subject instead of shrugging at the whole envelope.
 */
export interface CapabilityFinding {
  subject: string
  kind: 'tool' | 'data'
  reason: 'no_tool_registry' | 'unregistered_resource' | 'write_not_authorized'
}

export function capabilityFindings(input: {
  tools: MissionToolBound[]
  dataScope: MissionDataScope[]
}): CapabilityFinding[] {
  const findings: CapabilityFinding[] = []
  for (const t of input.tools) {
    findings.push({ subject: t.tool, kind: 'tool', reason: 'no_tool_registry' })
  }
  for (const d of input.dataScope) {
    if (d.access === 'write') {
      findings.push({ subject: d.resource, kind: 'data', reason: 'write_not_authorized' })
    } else if (!REGISTERED.has(d.resource)) {
      findings.push({ subject: d.resource, kind: 'data', reason: 'unregistered_resource' })
    }
  }
  return findings
}

/**
 * The sanctioned availability check for the delegation path.
 *
 * `projectId` is accepted because the seam's contract carries it and a future
 * per-project inventory will need it. It is deliberately unused today: pausing
 * to consult a project-scoped source that does not exist would be theatre, and
 * a check that appears project-aware while ignoring the project is worse than
 * one that is honestly global.
 */
export const registryAvailability: MissionCapabilityAvailability = async ({ tools, dataScope }) => {
  const findings = capabilityFindings({ tools, dataScope })
  const dataFindings = findings.filter(f => f.kind === 'data')
  return {
    // Vacuously true with nothing declared; never true with a tool declared.
    tools: tools.length === 0,
    data: dataFindings.length === 0,
    unavailable: findings.map(f => f.subject),
  }
}
