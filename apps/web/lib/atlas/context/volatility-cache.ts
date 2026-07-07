/**
 * lib/atlas/context/volatility-cache.ts — Volatility-split cache (CL Commit 3, canonical §7)
 *
 * "①②③ are frame-independent → cached per tenant (~45s). Only ④/⑤ vary by
 * Context Request; framing never re-runs the operational snapshot." (§7)
 *
 * This module generalizes the exact pattern already live in
 * `chat/route.ts#_liveCtxCache` (Map keyed by the sorted allow-list, 45s
 * TTL) — mapping §1.1 names that pattern as the thing to reuse. The
 * mapping places the cache "inside assembler.ts"; it is built here as its
 * own module in THIS commit so the mechanism ships and is testable before
 * the assembler exists (Commit 4 wires it internally — placement is
 * mapping-level, not architectural, per mapping §0).
 *
 * Tenant-isolation invariant (mapping §1.1 "May NOT cache constraints/live
 * incorrectly across tenants"): the cache key ALWAYS starts from the
 * caller's sorted allow-list — identical to `_liveCtxCache`'s key — so one
 * tenant's snapshot can never serve another. An empty allow-list is its own
 * key (the zero-rows tenant), never a wildcard.
 *
 * The cache stores values; it never computes, selects, or drops. TTL is
 * time-based only — content never influences caching.
 */

export const DEFAULT_TTL_MS = 45_000 // = chat/route.ts LIVE_CTX_TTL_MS

/**
 * Tenant key from the caller's already-resolved allow-list — the same
 * expression `_liveCtxCache` uses (`[...ids].sort().join(',')`).
 */
export function tenantKey(allowedProjectIds: string[]): string {
  return [...allowedProjectIds].sort().join(',')
}

interface Entry<T> {
  at: number
  value: T
}

/**
 * A minimal TTL cache over a Map, matching the `_liveCtxCache` semantics:
 * read-through `get` with an explicit `set`, entries valid for `ttlMs`.
 * Expired entries are overwritten on the next `set` (same behavior as the
 * live pattern; no background sweeper in v1).
 */
export class VolatilityCache<T> {
  private entries = new Map<string, Entry<T>>()

  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  /** The cached value if present and fresh, else undefined. */
  get(key: string, now: number = Date.now()): T | undefined {
    const e = this.entries.get(key)
    if (!e) return undefined
    if (now - e.at >= this.ttlMs) return undefined
    return e.value
  }

  set(key: string, value: T, now: number = Date.now()): void {
    this.entries.set(key, { at: now, value })
  }

  /** Read-through helper: fresh hit → cached; miss → compute, store, return. */
  async getOrCompute(key: string, compute: () => Promise<T>, now?: number): Promise<T> {
    const hit = this.get(key, now)
    if (hit !== undefined) return hit
    const value = await compute()
    this.set(key, value, now)
    return value
  }

  /** Test/ops hook. */
  clear(): void {
    this.entries.clear()
  }
}
