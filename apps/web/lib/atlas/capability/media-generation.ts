/**
 * lib/atlas/capability/media-generation.ts — media generation, DECLARED and
 * DELIBERATELY UNLICENSED (MuAPI bootstrap).
 *
 * WHY THIS FILE EXISTS. `lib/media/providers/*` gives Omnira a working way to
 * reach a generative-media vendor. Nothing in that directory decides whether an
 * AGENT may reach for it, and the two questions must not be answered by the
 * same switch: `MUAPI_ENABLED` is an infrastructure fact ("the runtime can
 * talk to MuAPI"), while this file is an authority fact ("a project agent may
 * spend money making a video"). Collapsing them would mean that the moment an
 * operator enabled the provider to run a health check, every workflow that
 * could generate media silently became allowed to.
 *
 * This is the sibling of `desktop-commander.ts` and follows it deliberately:
 * the decision is written as data, the availability answer is a function that
 * always refuses, and `lib/qa/muapi-media-provider.test.ts` fails if either is
 * quietly reversed.
 *
 * WHAT THIS FILE IS NOT:
 *   • Not a second execution gate. `lib/media/providers/gate.ts` governs whether
 *     an outbound HTTP call may happen at all. This governs whether a MISSION
 *     may declare media generation among its tools. Both must pass; neither
 *     substitutes for the other, and the ordering is not interchangeable — the
 *     provider gate can refuse a call that this file would have permitted, and
 *     this file refuses missions the provider gate knows nothing about.
 *   • Not a spend authority. §18.6 — capability must never be interpreted as
 *     permission — and a budget is a further permission still. The spend seam
 *     is declared in `gate.ts` with a refusing default.
 *   • Not a provider choice. Which vendor serves a request is the Provider
 *     Router's decision; this file names a capability, not a supplier.
 *
 * THE LOAD-BEARING FACT: media generation is IRREVERSIBLE SPEND. Unlike a
 * read-only tool, a single successful call debits a wallet and cannot be undone
 * by rolling back a deploy. MuAPI's own documentation states costs "are debited
 * from the wallet on completion". That is why the default here is refusal and
 * why the test mode exists at all — MuAPI sandbox keys (`is_test: true`) return
 * mock outputs WITHOUT billing, which is the only configuration in which an
 * unattended mistake is free.
 */

import type { MissionCapabilityAvailability } from '../mission/capability'
import type { MissionToolBound } from '../mission/types'
import { describeMediaProviders } from '@/lib/media/providers/router'
import type { MediaProviderId, MediaProviderMode } from '@/lib/media/providers/types'

/**
 * The canonical tool identifier, in the `media.*` namespace. Fixed now so every
 * later document, license and delegation envelope names the same thing and a
 * second spelling cannot appear beside it.
 */
export const MEDIA_GENERATION_TOOL_ID = 'media.generate' as const

/**
 * Canonical Ch18.49 license status. §18.50: "A Draft license is incomplete. It
 * grants no authority." Not a new enum — Omnira already has this vocabulary.
 */
export const MEDIA_GENERATION_LICENSE_STATUS = 'draft' as const

/** Canonical Ch18.10 autonomy level. L0 — Observe. A ceiling, not a grant. */
export const MEDIA_GENERATION_AUTONOMY_LEVEL = 'L0' as const

/** The bootstrap invariant. Flipping this alone must never be enough to spend. */
export const MEDIA_GENERATION_AUTONOMOUS_EXECUTION = false

/**
 * Grants a media-generation binding WOULD require. `payment:spend` is listed
 * separately from `network:send` on purpose: every other network capability in
 * Omnira is reversible, and treating spend as a special case of sending is how
 * a cost control gets designed as a rate limit.
 */
export const MEDIA_GENERATION_REQUIRED_GRANTS = [
  'network:send',
  'payment:spend',
  'storage:write',
] as const

/** Responsibilities this capability may NEVER hold, whatever a license says. */
export const MEDIA_GENERATION_PROHIBITED_RESPONSIBILITIES = [
  /** Ch27 — an executor never approves its own irreversible act. */
  'approval_gate',
  /** §18.2 — a capability that can widen its own license has no license. */
  'autonomy_licensing',
  /** A generator must never also be the judge of whether output is publishable. */
  'quality_control',
  /** Publishing is a separate, separately-authorized act (lib/media/*.ts). */
  'publishing',
  /** Ch6 — project scope is authorization, resolved before any tool is reached. */
  'project_authorization',
  /** Budget belongs to the spend policy, never to the thing doing the spending. */
  'budget_authority',
] as const

/**
 * Hard prerequisites for ANY license above L0. Each names a real system in this
 * repository or one already scheduled; a prerequisite that cannot be checked
 * against a real module is a wish.
 */
export const MEDIA_GENERATION_PREREQUISITES = [
  /** `lib/media/providers/gate.ts` — three-state execution gate. Shipped. */
  'provider_execution_gate',
  /** `config.ts` — test/production credential separation. Shipped. */
  'credential_mode_separation',
  /** Governed by `lib/cost/governed-spend.ts` once a MuAPI path becomes billable. */
  'spend_policy',
  /** Per-project budget with reconciliation against cost_events. NOT SHIPPED. */
  'project_budget',
  /** Ch27 Approval Inbox — per-action gate for irreversible spend. */
  'approval_gate',
  /** A QC pass between generation and any downstream use. NOT SHIPPED. */
  'output_quality_control',
  /** The Media Orchestrator this provider layer sits under. NOT SHIPPED. */
  'media_orchestrator',
  /** Ch18.128 — an issued, scoped, expiring license from a human. */
  'autonomy_license',
] as const

export type MediaGenerationPrerequisite = (typeof MEDIA_GENERATION_PREREQUISITES)[number]

/**
 * The tool bound a media-generation delegation would carry. `restriction` is
 * populated deliberately: `attenuate.ts`'s `toolKey` folds it into the
 * containment key precisely so a child cannot drop it and inherit an
 * unrestricted tool, so an unrestricted bound must not be the shape copied.
 */
export const MEDIA_GENERATION_TOOL_BOUND: MissionToolBound = {
  tool: MEDIA_GENERATION_TOOL_ID,
  restriction: 'unlicensed — the capability is declared and grants no execution',
}

/**
 * The availability answer for media generation: never available.
 *
 * Shaped as a `MissionCapabilityAvailability` so that IF a future increment
 * wires this identifier into the mission-readiness seam before a license
 * exists, the wiring compiles and still refuses. It mirrors the production
 * default `unprovenAvailability` rather than replacing it.
 *
 * Note what this does NOT consult: the provider's configured mode. Even a fully
 * configured, health-checked MuAPI in test mode returns `false` here, because
 * the question this seam answers is about authority and not about reachability.
 */
export const mediaGenerationAvailability: MissionCapabilityAvailability = async ({ tools, dataScope }) => ({
  tools: false,
  data: false,
  unavailable: [...tools.map(t => t.tool), ...dataScope.map(d => d.resource)],
})

/** Whether a declared tool set reaches for media generation. Authorizes nothing. */
export const requestsMediaGeneration = (tools: readonly MissionToolBound[]): boolean =>
  tools.some(t => t.tool === MEDIA_GENERATION_TOOL_ID)

// ── Operator-facing status ───────────────────────────────────────────────────

/**
 * What an operator sees. Four separate facts, kept separate on purpose:
 *
 *   available  — the code path exists (a build-time fact)
 *   provider   — which vendor would serve it (a routing fact)
 *   mode       — disabled / test / production (a configuration fact)
 *   execution  — whether anything may actually run (an AUTHORITY fact)
 *
 * The last is the one that matters and the one a single boolean would have
 * hidden. `execution` stays `'disabled'` while the license is `draft` even when
 * mode is `test` and the credential is valid, because the provider being
 * reachable has never been the same thing as an agent being allowed to use it.
 */
export interface MediaGenerationCapabilityStatus {
  capability: typeof MEDIA_GENERATION_TOOL_ID
  available: boolean
  provider: MediaProviderId | null
  mode: MediaProviderMode
  execution: 'enabled' | 'disabled'
  licenseStatus: typeof MEDIA_GENERATION_LICENSE_STATUS
  autonomyLevel: typeof MEDIA_GENERATION_AUTONOMY_LEVEL
  /** Prerequisites still unmet. Non-empty means no license can be issued yet. */
  blockedBy: readonly MediaGenerationPrerequisite[]
}

/**
 * The prerequisites that are NOT satisfied today. Hardcoded rather than probed
 * because each one is a design decision a human has to make, not a module whose
 * presence a filesystem check could prove.
 */
export const MEDIA_GENERATION_UNMET_PREREQUISITES: readonly MediaGenerationPrerequisite[] = [
  'spend_policy',
  'project_budget',
  'approval_gate',
  'output_quality_control',
  'media_orchestrator',
  'autonomy_license',
] as const

/**
 * Read-only capability status. Never touches the network — safe to render on a
 * dashboard whether or not any provider is configured.
 */
export function describeMediaGenerationCapability(): MediaGenerationCapabilityStatus {
  const providers = describeMediaProviders()
  const primary = providers[0] ?? null

  return {
    capability: MEDIA_GENERATION_TOOL_ID,
    available: providers.length > 0,
    provider: primary?.provider ?? null,
    mode: primary?.mode ?? 'disabled',
    // Deliberately NOT derived from `primary.executionAllowed`. Autonomous
    // execution stays disabled while the license is draft, regardless of how
    // the provider is configured.
    execution: MEDIA_GENERATION_AUTONOMOUS_EXECUTION ? 'enabled' : 'disabled',
    licenseStatus: MEDIA_GENERATION_LICENSE_STATUS,
    autonomyLevel: MEDIA_GENERATION_AUTONOMY_LEVEL,
    blockedBy: MEDIA_GENERATION_UNMET_PREREQUISITES,
  }
}
