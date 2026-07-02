/**
 * lib/atlas/context/request.ts — Context Request (Cognitive Loop, canonical §6.1/§6.3)
 *
 * The generalized `ContextRequest` contract. This is NOT a new concept: the
 * canonical doc is explicit that this is "EI's existing §6 boundary and the
 * existing ContextRequest type, generalized out of EI" (§6.1). The
 * EI-specific resolver — `lib/atlas/intelligence/context-request.ts`
 * (`resolveContextRequest`, `ContextIntent`, `SignalQuery`) — is untouched by
 * this file and keeps serving the Accumulation-Loop producers exactly as it
 * does today (`brief-orchestrator.ts`). This module only lifts the *shape*
 * of the request one level up, so a reasoning trigger (operator turn;
 * scheduled brief; scheduled plan) can state bounded intent and scope once,
 * generally, for the assembler (Stage 0+) — not for any single producer.
 *
 * This file states shape only. It performs no I/O, no DB reads, no
 * selection, and no ranking — `deriveContextRequest` is a pure function of
 * its input. Relevance selection stays Retrieval's job (`recallMemories`,
 * `queryIntelligence`, `selectActiveDecisions`); this module never touches
 * that boundary.
 *
 * Canonical ref: §6.1 (begins), §6.3 (the contract).
 */

import type { ClientViewEnvelope } from '@/lib/atlas/view-context'
import type { ContextIntent } from '@/lib/atlas/intelligence/context-request'

// Re-exported so callers of the generalized ContextRequest don't need to
// reach into the EI-specific module for the intent vocabulary. The type
// itself is still owned and defined by `intelligence/context-request.ts`;
// this is a type-only re-export, not a redefinition (no new concept).
export type { ContextIntent }

// ── ContextRequest (canonical §6.3) ───────────────────────────────────────────

/** The reasoning trigger that produced this Context Request (canonical §6.1). */
export type ContextModality = 'voice' | 'chat' | 'scheduled'

/**
 * Bounded intent and scope for a single reasoning trigger. States *shape*,
 * never content: which project(s), what business intents are in frame, the
 * time window, the current view (untrusted hint, normalized later by the ③
 * reader — never re-resolved here), the modality, and the reasoner's output
 * budget for this turn.
 *
 * Deliberately flat and serializable — safe to log verbatim in
 * `AssembledContext.provenance` (mapping §6.3) without leaking content.
 */
export interface ContextRequest {
  scope:      'project' | 'global'
  projectId?: string | null
  intents:    ContextIntent[]
  window:     { since: string; until: string }
  /** Untrusted client view envelope, if any. Normalized by the ③ reader — this module never re-resolves it. */
  view?:      ClientViewEnvelope | null
  /** A shape property, not content (canonical §6.3). Drives STATIC_POLICY_vN allocation (§6.4), never block selection. */
  modality:   ContextModality
  /** Reasoner output ceiling for this turn. */
  outputBudget: number
}

// ── Turn (the reasoning trigger) ──────────────────────────────────────────────

/**
 * The reasoning trigger, described generally enough to cover an operator
 * turn (voice or chat) and scheduled reasoning (brief/plan), per canonical
 * §6.1 ("At a reasoning trigger: operator turn; scheduled brief; scheduled
 * plan."). `deriveContextRequest` reads only this shape — never a live
 * request object, never a DB row — so it stays a pure function.
 */
export interface Turn {
  /** Which of the two loops raised this trigger (canonical §3). */
  trigger: 'operator' | 'scheduled'
  /** Voice channel flag. Only meaningful when `trigger === 'operator'`. */
  voice?: boolean
  /** The caller's already-resolved project isolation boundary (see `lib/atlas/isolation.ts`). Never widened here. */
  allowedProjectIds: string[]
  /** A specific project in focus, if any. Must be a member of `allowedProjectIds`; if not, the request degrades to `scope: 'global'`. */
  projectId?: string | null
  /** Untrusted client view envelope, passed through verbatim. */
  view?: ClientViewEnvelope | null
  /** Narrow the default intent set. Defaults to all EI business intents (matches the existing Accumulation-Loop default in `brief-orchestrator.ts`). */
  intents?: ContextIntent[]
  /** Override the default trailing window. */
  window?: { since: string; until: string }
  /** Override the modality-derived default reasoner output ceiling. */
  outputBudget?: number
  /** Deterministic clock for pure derivation (tests); defaults to the current time. */
  now?: string
}

// ── Defaults (shape-level policy, not selection) ──────────────────────────────

const ALL_INTENTS: ContextIntent[] = ['revenue', 'audience', 'content_performance', 'agent_activity']

const DEFAULT_WINDOW_DAYS = 7

/**
 * Modality-keyed default output ceiling. Mirrors the token ceilings already
 * live in `chat/route.ts` (`voice ? 150 : (fastPath ? 1200 : 4096)`) so
 * deriving a ContextRequest today does not change today's behavior. This is
 * a resource default, not a relevance decision (canonical §6.4).
 */
const DEFAULT_OUTPUT_BUDGET: Record<ContextModality, number> = {
  voice:     150,
  chat:      4096,
  scheduled: 8192,
}

function deriveModality(turn: Turn): ContextModality {
  if (turn.trigger === 'scheduled') return 'scheduled'
  return turn.voice ? 'voice' : 'chat'
}

function deriveScope(turn: Turn): { scope: ContextRequest['scope']; projectId: string | null } {
  const projectId = turn.projectId ?? null
  if (projectId && turn.allowedProjectIds.includes(projectId)) {
    return { scope: 'project', projectId }
  }
  // A projectId outside the caller's allow-list is not trusted (isolation
  // boundary, `lib/atlas/isolation.ts`) — degrade to global scope rather than
  // silently widening or narrowing the caller's access.
  return { scope: 'global', projectId: null }
}

function deriveWindow(turn: Turn): { since: string; until: string } {
  if (turn.window) return turn.window
  const until = turn.now ?? new Date().toISOString()
  const since = new Date(new Date(until).getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  return { since, until }
}

/**
 * Derive a `ContextRequest` from a reasoning trigger. Pure: no I/O, no DB,
 * no model call, no selection or ranking of content — it only decides what
 * shape of context to ask for, never what fills it (canonical §6.1).
 */
export function deriveContextRequest(turn: Turn): ContextRequest {
  const modality = deriveModality(turn)
  const { scope, projectId } = deriveScope(turn)

  return {
    scope,
    projectId,
    intents: turn.intents ?? ALL_INTENTS,
    window: deriveWindow(turn),
    view: turn.view ?? null,
    modality,
    outputBudget: turn.outputBudget ?? DEFAULT_OUTPUT_BUDGET[modality],
  }
}
