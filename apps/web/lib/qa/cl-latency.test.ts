/**
 * Cognitive Loop v1.0 — Stage 0, Commit 3: static allocation + deadline + volatility cache.
 *
 * Locks the latency contract (canonical §6.4/§7): allocation is static and
 * content-blind, constraints/① are never truncated, voice allocates ④/⑤ to
 * zero, deadline misses drop (never throw), and the cache is tenant-keyed
 * exactly like the live `_liveCtxCache` pattern.
 */
import { describe, it, expect } from 'vitest'
import {
  STATIC_POLICY_V1,
  STATIC_POLICY_VERSION,
  TRUNCATION_ORDER,
  TRUNCATION_MARKER,
  CHARS_PER_TOKEN,
  allocationFor,
  estimateTokens,
  truncateToBudget,
} from '@/lib/atlas/context/allocation'
import { withDeadline } from '@/lib/atlas/context/deadline'
import { VolatilityCache, tenantKey, DEFAULT_TTL_MS } from '@/lib/atlas/context/volatility-cache'

const MODALITIES = ['voice', 'chat', 'scheduled'] as const
const CHANNELS = ['constraints', 'operational', 'activeWork', 'view', 'intelligence', 'memory'] as const

// ── Allocation (§6.4) ─────────────────────────────────────────────────────────

describe('STATIC_POLICY_V1 — shape and frozen rules', () => {
  it('covers every (modality, channel) pair — the contract is total', () => {
    for (const m of MODALITIES) for (const c of CHANNELS) {
      expect(STATIC_POLICY_V1[m][c], `${m}/${c}`).toBeDefined()
    }
    expect(STATIC_POLICY_VERSION).toBe('v1')
  })

  it('never truncates constraints or ① operational, in any modality (§6.4)', () => {
    for (const m of MODALITIES) {
      expect(allocationFor('constraints', m)).toBe('unbounded')
      expect(allocationFor('operational', m)).toBe('unbounded')
    }
  })

  it('voice allocates ④ intelligence and ⑤ memory to zero by policy (§7)', () => {
    expect(allocationFor('intelligence', 'voice')).toBe(0)
    expect(allocationFor('memory', 'voice')).toBe(0)
  })

  it('chat ⑤ budget equals the M4 recall default (1200) so Stage 2 changes nothing', () => {
    expect(allocationFor('memory', 'chat')).toBe(1200)
  })

  it('truncation order is fixed, volatile → stable, and excludes the never-truncated channels', () => {
    expect(TRUNCATION_ORDER).toEqual(['memory', 'intelligence', 'view', 'activeWork'])
    expect(TRUNCATION_ORDER).not.toContain('constraints')
    expect(TRUNCATION_ORDER).not.toContain('operational')
  })
})

describe('truncateToBudget — mechanical and content-blind', () => {
  it('returns text unchanged under budget and for unbounded', () => {
    expect(truncateToBudget('kort text', 100)).toBe('kort text')
    expect(truncateToBudget('x'.repeat(10_000), 'unbounded')).toBe('x'.repeat(10_000))
  })
  it('returns empty for a zero budget (channel allocated away)', () => {
    expect(truncateToBudget('anything', 0)).toBe('')
  })
  it('tail-cuts over budget at the token estimate and appends the audit marker', () => {
    const budget = 10
    const text = 'a'.repeat(budget * CHARS_PER_TOKEN + 50)
    const out = truncateToBudget(text, budget)
    expect(out).toBe('a'.repeat(budget * CHARS_PER_TOKEN) + TRUNCATION_MARKER)
  })
  it('estimateTokens uses the shared M4 heuristic (ceil chars/4)', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})

// ── Deadline (§7) ─────────────────────────────────────────────────────────────

describe('withDeadline — drops, never throws', () => {
  it('returns ok with the value when the read beats the deadline', async () => {
    const r = await withDeadline(async () => 42, 1_000)
    expect(r).toMatchObject({ status: 'ok', value: 42 })
  })

  it('drops with reason=deadline when the read is too slow (and does not throw)', async () => {
    const slow = () => new Promise<string>(res => setTimeout(() => res('late'), 80))
    const r = await withDeadline(slow, 10)
    expect(r.status).toBe('dropped')
    if (r.status === 'dropped') expect(r.reason).toBe('deadline')
  })

  it('drops with reason=error when the read rejects (never surfaces the error)', async () => {
    const r = await withDeadline(async () => { throw new Error('boom') }, 1_000)
    expect(r.status).toBe('dropped')
    if (r.status === 'dropped') expect(r.reason).toBe('error')
  })

  it('treats ms<=0 as an immediate deadline for a pending read', async () => {
    const never = () => new Promise<string>(() => {})
    const r = await withDeadline(never, 0)
    expect(r.status).toBe('dropped')
  })
})

// ── Volatility cache (§7) ─────────────────────────────────────────────────────

describe('volatility cache — tenant-keyed, TTL-bounded', () => {
  it('tenantKey matches the live _liveCtxCache expression (sorted, joined)', () => {
    expect(tenantKey(['b', 'a'])).toBe('a,b')
    expect(tenantKey([])).toBe('')          // the zero-rows tenant is its own key
    expect(DEFAULT_TTL_MS).toBe(45_000)     // = chat/route.ts LIVE_CTX_TTL_MS
  })

  it('serves a fresh hit and expires it after TTL (time-based only)', () => {
    const c = new VolatilityCache<string>(45_000)
    c.set('t1', 'snapshot', 1_000)
    expect(c.get('t1', 1_000 + 44_999)).toBe('snapshot')
    expect(c.get('t1', 1_000 + 45_000)).toBeUndefined()
  })

  it('NEVER serves one tenant from another tenant’s entry (isolation invariant)', () => {
    const c = new VolatilityCache<string>()
    c.set(tenantKey(['p1']), 'tenant-1-snapshot')
    expect(c.get(tenantKey(['p2']))).toBeUndefined()
    expect(c.get(tenantKey([]))).toBeUndefined()
    expect(c.get(tenantKey(['p1', 'p2']))).toBeUndefined()
  })

  it('getOrCompute computes once per TTL window and returns the cached value inside it', async () => {
    const c = new VolatilityCache<number>(45_000)
    let computed = 0
    const compute = async () => { computed += 1; return computed }
    expect(await c.getOrCompute('k', compute, 1_000)).toBe(1)
    expect(await c.getOrCompute('k', compute, 2_000)).toBe(1)  // hit — no recompute
    expect(await c.getOrCompute('k', compute, 46_001)).toBe(2) // expired — recompute
    expect(computed).toBe(2)
  })
})
