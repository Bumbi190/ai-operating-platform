/**
 * lib/atlas/context/assembler.ts — The assembler (CL Commit 4, canonical §6.2–§6.4, L2)
 *
 * "Context Assembly is pure composition. It never selects." (L2)
 *
 * `assembleContext` invokes the registered readers (Invariant E), places
 * their blocks in the FIXED soft order ①②③④⑤ (§6.3, stable → volatile),
 * applies the static allocation (§6.4, mechanical + content-blind), and
 * emits exactly one immutable `AssembledContext` with full provenance
 * (§6.2). Then it is done — no streaming, no tools, no observation.
 *
 * What this module may NOT do (boundaries, enforced by §1.5 grep guards):
 *  - rank, relevance-judge, or relevance-truncate (L2/L3 — Retrieval's job)
 *  - reach the substrate directly (§5.1 — no Supabase client import; the
 *    DB handle passes THROUGH to readers, it is never queried here)
 *  - call a tool or a model (§5.2 — no `anthropic.*`)
 *  - read one reader's output from another (Invariant E)
 *
 * Latency contract wiring (§7), per the operator's Commit-3 rulings:
 *  - ① and ② (the I/O-backed, frame-independent reads) are cached per
 *    tenant for 45s — the `_liveCtxCache` pattern. "Framing never re-runs
 *    the operational snapshot."
 *  - ③ is computed on EVERY request: it is pure, zero-I/O, and derived from
 *    `req.view`, which changes per turn. Caching it would serve stale view
 *    state (operator ruling on the §7 interpretation, 2026-07-02).
 *  - ④/⑤ (Retrieval reads, registered in Stages 2–3) run behind
 *    `withDeadline`; a miss composes as absent and is recorded in
 *    `provenance.blocksDropped` — the sanctioned non-determinism (§7).
 *
 * Determinism: given the same reader outputs and the same `now`, the
 * composition is identical (§6.2 "deterministic given its inputs"). Reader
 * I/O is the only nondeterministic input, and it sits behind the contract.
 */

import type { ContextRequest, ContextModality } from '@/lib/atlas/context/request'
import {
  CONTEXT_READERS,
  SOFT_ORDER,
  type ContextBlock,
  type ContextDimension,
  type ContextReader,
  type ReaderEnv,
} from '@/lib/atlas/context/readers'
import { allocationFor, truncateToBudget, STATIC_POLICY_VERSION } from '@/lib/atlas/context/allocation'
import { withDeadline } from '@/lib/atlas/context/deadline'
import { VolatilityCache, tenantKey, DEFAULT_TTL_MS } from '@/lib/atlas/context/volatility-cache'

// ── Latency policy (assembler-local wiring of §7) ─────────────────────────────

/** Dimensions cached per tenant (I/O-backed, frame-independent). Operator ruling: ③ excluded. */
const CACHED_PER_TENANT: readonly ContextDimension[] = ['operational', 'activeWork'] as const

/**
 * Hard per-source deadlines for the Retrieval reads (§7 names ④/⑤ only).
 * ①②③ run un-deadlined in v1 — exactly like today's live path, so the
 * Stage-1 cutover cannot drop a block today's behavior would have kept.
 * The ④/⑤ values are V1 placeholders (implementation judgment, flagged in
 * the commit report); Stages 2–3 revisit them against the measured voice
 * first-token budget before those readers ever go live.
 */
const DEADLINE_MS: Partial<Record<ContextDimension, number>> = {
  intelligence: 300,
  memory: 300,
}

// Module-level cache, one entry per (dimension, tenant) — the same lifetime
// semantics as chat/route.ts `_liveCtxCache` (per serverless instance).
const _stableBlockCache = new VolatilityCache<ContextBlock | null>(DEFAULT_TTL_MS)

/**
 * Assembler implementation version, stamped into provenance (and from there
 * into the shadow log) so every recorded diff stays attributable to the
 * exact composition logic that produced it. Bump on ANY change to
 * composition/order/cache/deadline wiring — policy numbers version
 * separately via STATIC_POLICY_VERSION.
 */
export const ASSEMBLER_VERSION = 'cl-v1.0-stage0'

// ── AssembledContext (canonical §6.3) ─────────────────────────────────────────

export interface AssembledContext {
  hard: {
    /** Base persona/system text — supplied by the caller, passed through verbatim. */
    identity: string | null
    principles: string | null
    /** HARD constraints block (selectActiveDecisions via the constraints reader — Stage 1; null until then). */
    constraints: ContextBlock | null
  }
  soft: {
    operational: ContextBlock | null
    activeWork: ContextBlock | null
    view: ContextBlock | null
    intelligence: ContextBlock | null
    memory: ContextBlock | null
  }
  allocation: { policyVersion: string; modality: ContextModality }
  provenance: {
    generatedAt: string
    /** Safe to log verbatim — the request states shape, never content (§6.3). */
    contextRequest: ContextRequest
    blocksPresent: ContextDimension[]
    blocksDropped: { dimension: ContextDimension; reason: 'deadline' | 'error' }[]
    /** Which blocks were served from the tenant cache this turn (audit). */
    cacheHits: ContextDimension[]
    /** Composition-logic version (see ASSEMBLER_VERSION) — keeps every recorded diff attributable. */
    assemblerVersion: string
  }
}

export interface AssembleOptions {
  /** Base persona text, owned by the route until (and after) cutover; never invented here. */
  identity?: string | null
  principles?: string | null
  /** Test seams — production callers omit all of these. */
  readers?: Partial<Record<ContextDimension, ContextReader>>
  cache?: VolatilityCache<ContextBlock | null>
  deadlineMs?: Partial<Record<ContextDimension, number>>
  now?: string
}

// ── Composition ───────────────────────────────────────────────────────────────

async function invokeReader(
  dim: ContextDimension,
  reader: ContextReader,
  req: ContextRequest,
  env: ReaderEnv,
  deadlineMs: number | undefined,
  dropped: AssembledContext['provenance']['blocksDropped'],
): Promise<ContextBlock | null> {
  if (deadlineMs === undefined) {
    // Un-deadlined (①②③): readers never throw by contract; belt-and-braces
    // anyway — a contract breach degrades to an absent block, never a 500.
    try { return await reader(req, env) } catch { return null }
  }
  const r = await withDeadline(() => reader(req, env), deadlineMs)
  if (r.status === 'ok') return r.value
  dropped.push({ dimension: dim, reason: r.reason })
  return null
}

/**
 * Pure composition (§6.2): selected-blocks-in → composed-context-out.
 * Emits exactly one immutable `AssembledContext`.
 */
export async function assembleContext(
  req: ContextRequest,
  env: ReaderEnv,
  opts: AssembleOptions = {},
): Promise<AssembledContext> {
  const readers = opts.readers ?? CONTEXT_READERS
  const cache = opts.cache ?? _stableBlockCache
  const deadlines = opts.deadlineMs ?? DEADLINE_MS
  const tenant = tenantKey(env.allowedProjectIds)

  const dropped: AssembledContext['provenance']['blocksDropped'] = []
  const cacheHits: ContextDimension[] = []

  // Invoke all registered soft readers concurrently (they are independent by
  // Invariant E; concurrency mirrors today's Promise.allSettled pattern).
  const results = await Promise.all(SOFT_ORDER.map(async dim => {
    const reader = readers[dim]
    if (!reader) return [dim, null] as const // unregistered dimension = absent (④/⑤ until Stages 2–3)

    if (CACHED_PER_TENANT.includes(dim)) {
      const key = `${dim}:${tenant}`
      const hit = cache.get(key)
      if (hit !== undefined) {
        cacheHits.push(dim)
        return [dim, hit] as const
      }
      const block = await invokeReader(dim, reader, req, env, deadlines[dim], dropped)
      cache.set(key, block)
      return [dim, block] as const
    }

    return [dim, await invokeReader(dim, reader, req, env, deadlines[dim], dropped)] as const
  }))

  // Apply the static allocation (§6.4): mechanical, content-blind. A block
  // whose channel is allocated to zero (e.g. voice ④/⑤) composes as absent —
  // policy absence, not a drop; the policy version in provenance explains it.
  const soft: AssembledContext['soft'] = {
    operational: null, activeWork: null, view: null, intelligence: null, memory: null,
  }
  for (const [dim, block] of results) {
    if (!block) continue
    const text = truncateToBudget(block.text, allocationFor(dim, req.modality))
    if (!text) continue
    soft[dim as keyof AssembledContext['soft']] = { ...block, text }
  }

  const blocksPresent = SOFT_ORDER.filter(d => soft[d as keyof AssembledContext['soft']] !== null)

  const assembled: AssembledContext = {
    hard: {
      identity: opts.identity ?? null,
      principles: opts.principles ?? null,
      constraints: null, // Stage 1 (constraints reader + decision unification)
    },
    soft,
    allocation: { policyVersion: STATIC_POLICY_VERSION, modality: req.modality },
    provenance: {
      generatedAt: opts.now ?? new Date().toISOString(),
      contextRequest: req,
      blocksPresent,
      blocksDropped: dropped,
      cacheHits,
      assemblerVersion: ASSEMBLER_VERSION,
    },
  }

  // Immutable by contract (§6.2). Shallow-freeze each layer; block text is a
  // primitive so the composed context cannot be edited after emission.
  Object.freeze(assembled.hard)
  Object.freeze(assembled.soft)
  Object.freeze(assembled.allocation)
  Object.freeze(assembled.provenance)
  return Object.freeze(assembled)
}

// ── Rendering (§6.3 role split) ───────────────────────────────────────────────

/**
 * Render the assembled context for the model call: HARD → system role,
 * SOFT → user role in the fixed ①②③④⑤ order (§6.3 "ordered stable →
 * volatile"). Pure string concatenation — block text is composed verbatim,
 * so the Stage-0 shadow diff compares real content, not rendering drift.
 */
export function renderAssembledContext(a: AssembledContext): { system: string; user: string } {
  const system = [a.hard.identity, a.hard.principles, a.hard.constraints?.text]
    .filter((s): s is string => !!s)
    .join('')

  const user = SOFT_ORDER
    .map(d => a.soft[d as keyof AssembledContext['soft']]?.text)
    .filter((s): s is string => !!s)
    .join('')

  return { system, user }
}
