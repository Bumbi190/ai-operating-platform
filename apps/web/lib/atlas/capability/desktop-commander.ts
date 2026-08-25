/**
 * lib/atlas/capability/desktop-commander.ts — Desktop Commander, DECLARED and
 * DELIBERATELY UNLICENSED (Desktop Commander Phase 0).
 *
 * WHY THIS FILE EXISTS AT ALL. Phase 0 grants nothing and builds nothing. Its
 * one job is that a capability we have decided NOT to connect cannot later be
 * connected by accident, and cannot be forgotten while the rest of Omnira is
 * built. A prose document alone does neither: it is not checked by anything.
 * So the decision is written here as data, the availability answer is written
 * as a function that always refuses, and `lib/qa/desktop-commander-unlicensed.
 * test.ts` fails if either is quietly reversed.
 *
 * WHAT THIS FILE IS NOT:
 *   • Not a tool registry. Omnira has no runtime tool registry yet — only the
 *     design in `MARK_XXXIX_TOOL_ARCHITECTURE_AUDIT.md` §11, whose phasing puts
 *     a `desktop-agent` runtime at v1.3. Building one here to hold a single
 *     unlicensed entry would be Phase 1 infrastructure wearing a Phase 0 label.
 *   • Not a capability broker. §21.13's Delegation Envelope already IS the
 *     bound ("the MAXIMUM a Manager could ever reach, never a grant that it may
 *     reach it") and `mission/capability.ts` already is the availability seam.
 *     A second gate beside them would be a second place to get it wrong.
 *   • Not an autonomy license. §18.2 — "Executive Intelligence may recommend
 *     higher autonomy. Executive Intelligence may not grant itself higher
 *     autonomy." No file in this repository can issue the license; only an
 *     authorized decision-maker can, and none has.
 *   • Not an import of the MCP. Nothing here opens a connection, spawns a
 *     process, or touches a filesystem. There is no client in this module and
 *     Phase 0 adds none anywhere.
 *
 * THE LOAD-BEARING FACT (verified 2026-08-25, read-only, DC v0.2.47): Desktop
 * Commander's own `allowedDirectories` and `blockedCommands` are NOT a security
 * boundary. Its README states that directory restrictions and command blocking
 * "can be bypassed through various methods including symlinks, command
 * substitution, and absolute paths or code execution", and that
 * `allowedDirectories` "only restricts filesystem operations, not terminal
 * commands." The installed configuration additionally has `allowedDirectories:
 * []`, which its own source (`isPathAllowed`) treats as UNRESTRICTED. Omnira
 * therefore classifies Desktop Commander on the host as a privileged capability
 * equivalent to shell access as the founder's user — see
 * `docs/architecture/desktop-commander-capability.md` for the full model.
 */

import type { MissionCapabilityAvailability } from '../mission/capability'
import type { MissionToolBound } from '../mission/types'

/**
 * The canonical tool identifier, in the `desktop.*` namespace the tool-registry
 * design reserves for host-side runtimes. Fixed now so that every later
 * document, license and envelope names the same thing, and so a second spelling
 * cannot appear beside it.
 */
export const DESKTOP_COMMANDER_TOOL_ID = 'desktop.commander' as const

/**
 * Canonical Ch18.49 license status. `draft` is one of the twelve statuses the
 * chapter names, and §18.50 defines it exactly: "A Draft license is incomplete.
 * It grants no authority."
 *
 * This is deliberately NOT a new `experimental → sandboxed → delegated →
 * production` enum. Omnira already has a canonical lifecycle and inventing a
 * parallel one would create two vocabularies for one question.
 */
export const DESKTOP_COMMANDER_LICENSE_STATUS = 'draft' as const

/**
 * Canonical Ch18.10 autonomy level. L0 — Observe: "Read approved information…
 * It may not recommend, prepare, modify, or act unless separately allowed."
 *
 * L0 is the ceiling Phase 0 asserts, not a grant. §18.6: "Capability must never
 * be interpreted as permission."
 */
export const DESKTOP_COMMANDER_AUTONOMY_LEVEL = 'L0' as const

/** Phase 0 invariant. Flipping this alone must never be sufficient to execute. */
export const DESKTOP_COMMANDER_AUTONOMOUS_EXECUTION = false

/**
 * The capability grants a Desktop Commander binding WOULD require, in the
 * vocabulary the tool-registry design uses (`filesystem:write`, `desktop:input`,
 * `network:send`, …). Recorded so the eventual license negotiates against a
 * written list rather than an improvised one.
 *
 * `process:spawn` is listed separately from `filesystem:write` on purpose: the
 * verified bypass property means a granted terminal subsumes every filesystem
 * restriction, so the two cannot be reasoned about as independent grants.
 */
export const DESKTOP_COMMANDER_REQUIRED_GRANTS = [
  'filesystem:read',
  'filesystem:write',
  'process:spawn',
  'network:send',
] as const

/**
 * Responsibilities Desktop Commander may NEVER hold, whatever a later license
 * says. These are boundaries between systems, not risk ratings, so no autonomy
 * level and no approval can move them.
 */
export const DESKTOP_COMMANDER_PROHIBITED_RESPONSIBILITIES = [
  /** Ch22 — Memory is not a filesystem, and a file is not a memory. */
  'atlas_memory',
  /** Ch2 — judgment is EI's; DC transforms bytes and never interprets them. */
  'executive_intelligence',
  'intelligence_graph',
  /** Ch21 — delegation cuts authority; an executor never widens its own. */
  'delegation',
  /** Ch6 — project scope is authorization, resolved before any tool is reached. */
  'project_authorization',
  /** Ch23 — retrieval is the Knowledge/Research layer's, never the executor's. */
  'web_research_retrieval',
  /** §18.2 — a capability that can widen its own license has no license. */
  'autonomy_licensing',
] as const

/**
 * The hard prerequisites for ANY license above L0. Each names a system that
 * already exists in this repository or is already scheduled; none invents one.
 * A prerequisite list that cannot be checked against real modules is a wish.
 */
export const DESKTOP_COMMANDER_PREREQUISITES = [
  /** `lib/atlas/isolation.ts` — allow-list resolution, fail-closed. Shipped. */
  'project_isolation',
  /** `lib/atlas/delegation/*` — Envelope V1 + §6.39 attenuation. Shipped. */
  'delegation_envelope',
  /** `mission/capability.ts` — a real availability proof, not `unproven`. */
  'capability_availability_proof',
  /** OS-level isolation. NOT SHIPPED and not in scope for Phase 0 or 1. */
  'execution_isolation',
  /** Ch27 Approval Inbox — per-action gate for anything irreversible. */
  'approval_gate',
  /** Ch17 §17.38 — credential scope by project/tool/action/duration/actor. */
  'secret_isolation',
  /** Ch18.128 — an issued, scoped, expiring license from a human. */
  'autonomy_license',
  /** Ch26 — every invocation auditable, or the boundary is unprovable. */
  'audit_trail',
] as const

export type DesktopCommanderPrerequisite = (typeof DESKTOP_COMMANDER_PREREQUISITES)[number]

/**
 * The tool bound a Desktop Commander delegation would have to carry.
 *
 * `restriction` is populated deliberately. `attenuate.ts`'s `toolKey` folds the
 * restriction into the containment key precisely so a child cannot drop it and
 * inherit an unrestricted tool — so an unrestricted bound must never be the
 * shape anyone copies from.
 */
export const DESKTOP_COMMANDER_TOOL_BOUND: MissionToolBound = {
  tool: DESKTOP_COMMANDER_TOOL_ID,
  restriction: 'unlicensed — Phase 0 declares this capability and grants nothing',
}

/**
 * The availability answer for Desktop Commander: never available.
 *
 * Shaped as a `MissionCapabilityAvailability` so that IF a future increment
 * wires this identifier into the mission-readiness seam before a license
 * exists, the wiring compiles and still refuses. It mirrors the production
 * default `unprovenAvailability` rather than replacing it, and matches
 * Delegation's typed `tool_unavailable` refusal ground (§21.16), which is the
 * canonical way a Manager declines a tool it may not reach.
 *
 * The identity fields are ignored on purpose: no mission, version or project
 * can change this answer while the license status is `draft`.
 */
export const desktopCommanderAvailability: MissionCapabilityAvailability = async ({ tools, dataScope }) => ({
  tools: false,
  data: false,
  unavailable: [...tools.map(t => t.tool), ...dataScope.map(d => d.resource)],
})

/**
 * Whether a declared tool set reaches for Desktop Commander. A read-only
 * predicate for callers that need to notice the identifier; it authorizes
 * nothing and has no side effect.
 */
export const requestsDesktopCommander = (tools: readonly MissionToolBound[]): boolean =>
  tools.some(t => t.tool === DESKTOP_COMMANDER_TOOL_ID)
