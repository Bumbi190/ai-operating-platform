/**
 * Cognitive Loop v1.0 — Stage 0, Commit 4: assembler (pure compose) + renderAssembledContext.
 *
 * Locks L2 ("pure composition, never selects") and the §6.2–§6.4 contract:
 * fixed ①②③④⑤ order, static content-blind allocation, ①② tenant-cached /
 * ③ per-turn (operator ruling), ④/⑤ deadline-dropped into blocksDropped,
 * immutable output, hard→system / soft→user rendering.
 *
 * This is the `lib/qa/cl-assembler.test.ts` artifact the Stage-0 gate names
 * (mapping §4); the shadow-diff harness lands with Commit 5.
 */
import { describe, it, expect } from 'vitest'
import { assembleContext, renderAssembledContext } from '@/lib/atlas/context/assembler'
import { VolatilityCache } from '@/lib/atlas/context/volatility-cache'
import { TRUNCATION_MARKER, CHARS_PER_TOKEN } from '@/lib/atlas/context/allocation'
import type { ContextBlock, ContextReader, ReaderEnv } from '@/lib/atlas/context/readers'
import type { ContextRequest } from '@/lib/atlas/context/request'

const NOW = '2026-07-02T12:00:00.000Z'

function baseReq(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return {
    scope: 'global', projectId: null, intents: ['revenue'],
    window: { since: '2026-06-25T12:00:00.000Z', until: NOW },
    view: null, modality: 'chat', outputBudget: 4096,
    ...overrides,
  }
}

const env = (ids: string[] = ['p1']): ReaderEnv => ({ db: null, allowedProjectIds: ids })

function stubReader(dim: ContextBlock['dimension'], text: string, counter?: { n: number }): ContextReader {
  return async () => {
    if (counter) counter.n += 1
    return { dimension: dim, channel: 'soft', text }
  }
}

// Every test injects its own readers + cache: the assembler is exercised as
// pure composition over controlled inputs (no DB, no real readers).

describe('assembleContext — fixed order, pure composition', () => {
  it('composes soft blocks in ①②③④⑤ order regardless of reader timing', async () => {
    const slowFirst: ContextReader = () =>
      new Promise(res => setTimeout(() => res({ dimension: 'operational', channel: 'soft', text: '[①]' }), 30))
    const a = await assembleContext(baseReq(), env(), {
      now: NOW,
      cache: new VolatilityCache(45_000),
      readers: {
        operational: slowFirst,
        activeWork: stubReader('activeWork', '[②]'),
        view: stubReader('view', '[③]'),
      },
    })
    expect(renderAssembledContext(a).user).toBe('[①][②][③]')
    expect(a.provenance.blocksPresent).toEqual(['operational', 'activeWork', 'view'])
  })

  it('treats an unregistered dimension as an absent block (④/⑤ before Stages 2–3)', async () => {
    const a = await assembleContext(baseReq(), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      readers: { operational: stubReader('operational', '[①]') },
    })
    expect(a.soft.intelligence).toBeNull()
    expect(a.soft.memory).toBeNull()
    expect(a.provenance.blocksDropped).toEqual([]) // absent ≠ dropped
  })

  it('emits an immutable AssembledContext (§6.2)', async () => {
    const a = await assembleContext(baseReq(), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      readers: { operational: stubReader('operational', '[①]') },
    })
    expect(Object.isFrozen(a)).toBe(true)
    expect(Object.isFrozen(a.soft)).toBe(true)
    expect(Object.isFrozen(a.provenance)).toBe(true)
    expect(() => { (a.soft as any).operational = null }).toThrow()
  })
})

describe('assembleContext — static allocation (§6.4)', () => {
  it('mechanically truncates an over-budget soft block and keeps ① unbounded', async () => {
    const huge = 'x'.repeat(900 * CHARS_PER_TOKEN) // over chat activeWork budget (800)
    const a = await assembleContext(baseReq(), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      readers: {
        operational: stubReader('operational', huge),   // unbounded — untouched
        activeWork: stubReader('activeWork', huge),     // 800 tokens — truncated
      },
    })
    expect(a.soft.operational!.text).toBe(huge)
    expect(a.soft.activeWork!.text).toBe(huge.slice(0, 800 * CHARS_PER_TOKEN) + TRUNCATION_MARKER)
  })

  it('composes a zero-allocated channel as absent (voice ④/⑤ policy, not a drop)', async () => {
    const a = await assembleContext(baseReq({ modality: 'voice' }), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      readers: {
        operational: stubReader('operational', '[①]'),
        intelligence: stubReader('intelligence', '[④ would-be artifact]'),
      },
      deadlineMs: {},
    })
    expect(a.soft.intelligence).toBeNull()
    expect(a.provenance.blocksPresent).toEqual(['operational'])
    expect(a.provenance.blocksDropped).toEqual([]) // policy absence ≠ drop
  })
})

describe('assembleContext — volatility cache wiring (§7 + operator ruling)', () => {
  it('caches ①② per tenant; ③ recomputes every turn', async () => {
    const c1 = { n: 0 }, c2 = { n: 0 }, c3 = { n: 0 }
    const cache = new VolatilityCache<ContextBlock | null>(45_000)
    const readers = {
      operational: stubReader('operational', '[①]', c1),
      activeWork: stubReader('activeWork', '[②]', c2),
      view: stubReader('view', '[③]', c3),
    }
    await assembleContext(baseReq(), env(['p1']), { now: NOW, cache, readers })
    const second = await assembleContext(baseReq(), env(['p1']), { now: NOW, cache, readers })
    expect(c1.n).toBe(1) // ① served from tenant cache
    expect(c2.n).toBe(1) // ② served from tenant cache
    expect(c3.n).toBe(2) // ③ recomputed per turn (never cached — stale-view guard)
    expect(second.provenance.cacheHits).toEqual(['operational', 'activeWork'])
  })

  it('NEVER serves one tenant from another tenant’s cache entry', async () => {
    const c1 = { n: 0 }
    const cache = new VolatilityCache<ContextBlock | null>(45_000)
    const readers = { operational: stubReader('operational', '[①]', c1) }
    await assembleContext(baseReq(), env(['p1']), { now: NOW, cache, readers })
    await assembleContext(baseReq(), env(['p2']), { now: NOW, cache, readers })
    await assembleContext(baseReq(), env([]), { now: NOW, cache, readers })
    expect(c1.n).toBe(3) // three tenants → three reads, zero cross-serving
  })
})

describe('assembleContext — deadline drops (§7, ④/⑤ only)', () => {
  it('drops a slow deadlined reader into blocksDropped (reason=deadline) and composes it absent', async () => {
    const slow: ContextReader = () =>
      new Promise(res => setTimeout(() => res({ dimension: 'memory', channel: 'soft', text: '[⑤ late]' }), 80))
    const a = await assembleContext(baseReq(), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      readers: { operational: stubReader('operational', '[①]'), memory: slow },
      deadlineMs: { memory: 10 },
    })
    expect(a.soft.memory).toBeNull()
    expect(a.provenance.blocksDropped).toEqual([{ dimension: 'memory', reason: 'deadline' }])
    expect(a.soft.operational!.text).toBe('[①]') // the turn degrades, never worse
  })

  it('records a failing deadlined reader as reason=error, never throwing', async () => {
    const failing: ContextReader = async () => { throw new Error('substrate down') }
    const a = await assembleContext(baseReq(), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      readers: { intelligence: failing },
      deadlineMs: { intelligence: 300 },
    })
    expect(a.soft.intelligence).toBeNull()
    expect(a.provenance.blocksDropped).toEqual([{ dimension: 'intelligence', reason: 'error' }])
  })

  it('runs ①②③ un-deadlined: a slow ① still composes (today-equivalent behavior)', async () => {
    const slow: ContextReader = () =>
      new Promise(res => setTimeout(() => res({ dimension: 'operational', channel: 'soft', text: '[① slow]' }), 60))
    const a = await assembleContext(baseReq(), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      readers: { operational: slow },
    })
    expect(a.soft.operational!.text).toBe('[① slow]')
    expect(a.provenance.blocksDropped).toEqual([])
  })
})

describe('renderAssembledContext — role split (§6.3)', () => {
  it('renders hard→system (identity+principles+constraints) and soft→user in fixed order', async () => {
    const a = await assembleContext(baseReq(), env(), {
      now: NOW, cache: new VolatilityCache(45_000),
      identity: 'Du är Atlas.', principles: '\nPrinciper: hedra beslut.',
      readers: {
        view: stubReader('view', '[③]'),
        operational: stubReader('operational', '[①]'),
      },
    })
    const { system, user } = renderAssembledContext(a)
    expect(system).toBe('Du är Atlas.\nPrinciper: hedra beslut.')
    expect(user).toBe('[①][③]')
  })

  it('provenance echoes the ContextRequest and stamps the allocation policy version', async () => {
    const req = baseReq({ modality: 'voice' })
    const a = await assembleContext(req, env(), { now: NOW, cache: new VolatilityCache(45_000), readers: {} })
    expect(a.provenance.contextRequest).toEqual(req)
    expect(a.provenance.generatedAt).toBe(NOW)
    expect(a.allocation).toEqual({ policyVersion: 'v1', modality: 'voice' })
  })
})
