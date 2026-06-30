/**
 * Tests for lib/atlas/intelligence/memory-context.ts — Atlas Memory M4 Commit 6.
 *
 * The Context Request memory boundary is the only path by which Executive
 * Intelligence receives Memory (Memory → recallMemories → here → EI). We pin:
 *   • channel separation — decision-class memories become CONSTRAINTS, never
 *     recall items ("data not instructions").
 *   • the ATLAS_MEMORY_INJECT gate — default OFF is an inert no-op (empty
 *     context, no recall attempted), so default behaviour is unchanged.
 *   • the items-only seam used by orchestrators.
 *
 * splitMemoryPack is pure (no mocks). The flag tests need no DB because the
 * gate short-circuits before any recall.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  splitMemoryPack,
  resolveMemoryContext,
  resolveMemoryItems,
  isMemoryInjectEnabled,
} from '@/lib/atlas/intelligence/memory-context'
import type { MemoryPack, MemoryRecallItem } from '@/lib/atlas/memory/recall-memories'

function item(over: Partial<MemoryRecallItem>): MemoryRecallItem {
  return {
    kind: 'memory',
    id: 'm-1',
    scope: 'project',
    projectId: 'p1',
    memoryClass: 'procedural',
    entityKind: 'metric',
    entityId: 'mrr_sek',
    summary: 'MRR trending up',
    confidence: 0.7,
    evidenceCount: 3,
    lastSeenAt: '2026-06-28T00:00:00.000Z',
    pinned: false,
    salience: 0.6,
    focusMatch: false,
    ...over,
  }
}

function pack(items: MemoryRecallItem[]): MemoryPack {
  return { items, totalConsidered: items.length, budgetTokens: 1200, skipped: false }
}

describe('splitMemoryPack — channel separation', () => {
  it('promotes decision-class memories to constraints, not recall items', () => {
    const ctx = splitMemoryPack(
      pack([
        item({ id: 'proc', memoryClass: 'procedural', summary: 'reels at 18:00 do best' }),
        item({ id: 'dec', memoryClass: 'decision', summary: 'never auto-publish without review' }),
        item({ id: 'epi', kind: 'event', memoryClass: 'episodic', summary: 'drain succeeded' }),
      ]),
    )
    expect(ctx.constraints).toEqual(['never auto-publish without review'])
    expect(ctx.items.map((i) => i.id)).toEqual(['proc', 'epi'])
    expect(ctx.items.some((i) => i.content.includes('auto-publish'))).toBe(false)
  })

  it('maps recall items to the MemoryItem shape with episodic eventType for events', () => {
    const ctx = splitMemoryPack(pack([item({ id: 'epi', kind: 'event', memoryClass: 'episodic', confidence: 0.4 })]))
    expect(ctx.items[0]).toEqual({
      id: 'epi',
      content: 'MRR trending up',
      eventType: 'episodic',
      confidence: 0.4,
      occurredAt: '2026-06-28T00:00:00.000Z',
    })
  })

  it('yields an empty context for an empty pack', () => {
    expect(splitMemoryPack(pack([]))).toEqual({ items: [], constraints: [] })
  })
})

describe('resolveMemoryContext — ATLAS_MEMORY_INJECT gate (default OFF)', () => {
  afterEach(() => {
    delete process.env.ATLAS_MEMORY_INJECT
    delete process.env.ATLAS_MEMORY_RECALL
  })

  it('is OFF by default', () => {
    delete process.env.ATLAS_MEMORY_INJECT
    expect(isMemoryInjectEnabled()).toBe(false)
  })

  it('returns an empty context (no recall attempted) when inject is off', async () => {
    delete process.env.ATLAS_MEMORY_INJECT
    const ctx = await resolveMemoryContext({ projectIds: ['p1'] }) // no db passed → must not be used
    expect(ctx).toEqual({ items: [], constraints: [] })
  })

  it('items-only seam returns [] when inject is off', async () => {
    delete process.env.ATLAS_MEMORY_INJECT
    expect(await resolveMemoryItems({ projectIds: ['p1'] })).toEqual([])
  })

  it('inject ON but recall OFF still yields empty (layered flags, no DB)', async () => {
    process.env.ATLAS_MEMORY_INJECT = '1'
    delete process.env.ATLAS_MEMORY_RECALL // recall short-circuits before any DB
    const ctx = await resolveMemoryContext({ projectIds: ['p1'] })
    expect(ctx).toEqual({ items: [], constraints: [] })
  })
})
