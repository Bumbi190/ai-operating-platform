/**
 * lib/atlas/context/allocation.ts — Static allocation table (CL Commit 3, canonical §6.4)
 *
 * `STATIC_POLICY_vN(channel, modality)`: a static, VERSIONED token-budget
 * contract keyed by (channel, modality) — a resource contract, not
 * selection. It depends only on channel identity and the Context Request's
 * modality, NEVER on block content (mapping §1.1 "May NOT depend on block
 * content"). Retrieval selects and truncates *within* each channel's
 * allocation; the assembler never drops by relevance (§6.4).
 *
 * Frozen rules encoded here:
 *  - Constraints and ① operational are NEVER truncated (§6.4) → 'unbounded'.
 *  - `voice` → lean allocation; ④/⑤ allocated to ZERO by policy so
 *    first-token latency holds (§7 "may allocate ⑤/④ to zero by policy").
 *  - `chat` → fuller; ⑤ matches M4's existing DEFAULT_BUDGET_TOKENS (1 200)
 *    so Stage 2 does not change M4's recall budget.
 *  - `scheduled` → "whatever its producer declares" (§6.4): these are the
 *    static DEFAULTS a scheduled producer gets when it declares nothing.
 *
 * The concrete numbers are V1 policy (operator-tunable), not architecture:
 * change them by shipping STATIC_POLICY_V2 — never by editing V1 in place,
 * so `provenance` stays interpretable historically.
 *
 * Truncation itself is mechanical (tail-cut by token estimate) and content-
 * blind; the fixed TRUNCATION_ORDER runs volatile → stable, so when a total
 * squeeze is ever applied, the most volatile soft blocks give way first.
 */

import type { ContextModality } from '@/lib/atlas/context/request'
import type { ContextDimension } from '@/lib/atlas/context/readers'

/** Channels the allocation table budgets. Matches canonical §6.3's context channels. */
export type AllocationChannel = ContextDimension

/** 'unbounded' = the §6.4 never-truncate rule (constraints, ①). */
export type ChannelBudget = number | 'unbounded'

export type AllocationTable = Record<ContextModality, Record<AllocationChannel, ChannelBudget>>

/** Same coarse heuristic as M4 recall (`recall-memories.ts`) — no tokenizer dependency. */
export const CHARS_PER_TOKEN = 4

/** Marker appended when a block is mechanically truncated (auditability). */
export const TRUNCATION_MARKER = '\n[… avkortat: tokenbudget]'

/**
 * V1 static policy. Versioned and immutable once shipped (see header).
 * Tokens per (modality, channel); 0 = channel allocated away; 'unbounded'
 * = never truncated.
 */
export const STATIC_POLICY_V1: AllocationTable = {
  voice: {
    constraints:  'unbounded',
    operational:  'unbounded',
    activeWork:   300,
    view:         200,
    intelligence: 0,     // §7: voice allocates ④ to zero by policy
    memory:       0,     // §7: voice allocates ⑤ to zero by policy
  },
  chat: {
    constraints:  'unbounded',
    operational:  'unbounded',
    activeWork:   800,
    view:         600,
    intelligence: 1200,
    memory:       1200,  // = M4 DEFAULT_BUDGET_TOKENS (recall-memories.ts)
  },
  scheduled: {
    constraints:  'unbounded',
    operational:  'unbounded',
    activeWork:   800,
    view:         0,     // scheduled reasoning has no operator screen
    intelligence: 1500,
    memory:       1200,
  },
}

/** The version the assembler stamps into `provenance` (auditability). */
export const STATIC_POLICY_VERSION = 'v1'

/**
 * Fixed truncation order under a total squeeze: volatile → stable.
 * Constraints and ① are absent by rule — they are never truncated (§6.4).
 * Content never reorders this list.
 */
export const TRUNCATION_ORDER: readonly AllocationChannel[] = [
  'memory',
  'intelligence',
  'view',
  'activeWork',
] as const

/** Budget lookup — the whole `STATIC_POLICY_vN(channel, modality)` contract. */
export function allocationFor(channel: AllocationChannel, modality: ContextModality): ChannelBudget {
  return STATIC_POLICY_V1[modality][channel]
}

/** Coarse token estimate, shared heuristic with M4 recall. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Mechanical, content-blind tail truncation to a channel budget.
 *  - 'unbounded' → text unchanged (constraints/① rule).
 *  - 0           → '' (channel allocated away, e.g. voice ④/⑤).
 *  - over budget → tail-cut at the token estimate + audit marker.
 * NOT relevance truncation — that is Retrieval's job, inside its allocation.
 */
export function truncateToBudget(text: string, budget: ChannelBudget): string {
  if (budget === 'unbounded') return text
  if (budget <= 0) return ''
  if (estimateTokens(text) <= budget) return text
  return text.slice(0, budget * CHARS_PER_TOKEN) + TRUNCATION_MARKER
}
