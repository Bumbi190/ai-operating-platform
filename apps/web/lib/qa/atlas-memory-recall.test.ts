/**
 * Tests for lib/atlas/memory/recall-memories.ts — Atlas Memory M4 Commit 5.
 *
 * The pure core assembleMemoryPack is tested without mocks. The critical
 * guardrail is the ISOLATION belt: a row from a project not in the allowed set
 * must never appear in the pack (foreign project → 0 rows). We also pin the
 * pin/focus salience override, deterministic ranking, the token budget, and the
 * per-entity diversity cap. recallMemories' flag-off short-circuit is verified
 * directly (no DB needed).
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  assembleMemoryPack,
  recallMemories,
  type RecallRow,
} from '@/lib/atlas/memory/recall-memories'

const ALLOWED = 'proj-allowed'
const FOREIGN = 'proj-foreign'

function row(over: Partial<RecallRow>): RecallRow {
  return {
    kind: 'memory',
    id: 'm-1',
    scope: 'project',
    project_id: ALLOWED,
    memory_class: 'procedural',
    entity_kind: 'metric',
    entity_id: 'mrr_sek',
    summary: 'MRR trending up',
    confidence: 0.7,
    evidence_count: 3,
    last_seen_at: '2026-06-28T00:00:00.000Z',
    pinned: false,
    salience: 0.5,
    focus_match: false,
    ...over,
  }
}

describe('assembleMemoryPack — isolation belt (critical guardrail)', () => {
  it('drops rows from a project not in the allowed set (foreign project → 0 rows)', () => {
    const rows = [
      row({ id: 'ok', project_id: ALLOWED }),
      row({ id: 'foreign', project_id: FOREIGN }),
    ]
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [ALLOWED] })
    expect(pack.items.map((i) => i.id)).toEqual(['ok'])
    expect(pack.items.some((i) => i.projectId === FOREIGN)).toBe(false)
  })

  it('always keeps world-scope rows regardless of allowed projects', () => {
    const rows = [row({ id: 'w', scope: 'world', project_id: null })]
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [] })
    expect(pack.items.map((i) => i.id)).toEqual(['w'])
  })

  it('with no allowed projects, only world rows survive', () => {
    const rows = [
      row({ id: 'p', scope: 'project', project_id: ALLOWED }),
      row({ id: 'w', scope: 'world', project_id: null }),
    ]
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [] })
    expect(pack.items.map((i) => i.id)).toEqual(['w'])
  })
})

describe('assembleMemoryPack — salience, ranking, budget, diversity', () => {
  it('pinned rows are forced to the top (salience override)', () => {
    const rows = [
      row({ id: 'low', salience: 0.9, pinned: false, entity_id: 'a' }),
      row({ id: 'pin', salience: 0.1, pinned: true, entity_id: 'b' }),
    ]
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [ALLOWED] })
    expect(pack.items[0].id).toBe('pin')
    expect(pack.items[0].salience).toBe(1)
  })

  it('focus_match adds a boost that can reorder', () => {
    const rows = [
      row({ id: 'plain', salience: 0.6, focus_match: false, entity_id: 'a' }),
      row({ id: 'focus', salience: 0.5, focus_match: true, entity_id: 'b' }),
    ]
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [ALLOWED] })
    expect(pack.items[0].id).toBe('focus') // 0.5 + 0.15 = 0.65 > 0.6
  })

  it('enforces the per-entity diversity cap', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ id: `e${i}`, entity_kind: 'metric', entity_id: 'mrr_sek', salience: 0.9 - i * 0.01 }),
    )
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [ALLOWED], maxPerEntity: 3 })
    expect(pack.items).toHaveLength(3) // capped at 3 for the same entity
  })

  it('respects the token budget', () => {
    const big = 'x'.repeat(400) // ~100 tokens each at 4 chars/token
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: `b${i}`, entity_id: `e${i}`, summary: big, salience: 0.9 - i * 0.01 }),
    )
    // budget 200 tokens = 800 chars → only 2 items of ~400 chars fit
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [ALLOWED], budgetTokens: 200 })
    expect(pack.items.length).toBe(2)
    expect(pack.totalConsidered).toBe(10)
  })

  it('is deterministic for equal salience (stable id tiebreak)', () => {
    const rows = [
      row({ id: 'b', entity_id: 'b', salience: 0.5 }),
      row({ id: 'a', entity_id: 'a', salience: 0.5 }),
    ]
    const pack = assembleMemoryPack(rows, { allowedProjectIds: [ALLOWED] })
    expect(pack.items.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('recallMemories — flag gate (shadow)', () => {
  afterEach(() => {
    delete process.env.ATLAS_MEMORY_RECALL
  })

  it('is an inert no-op when ATLAS_MEMORY_RECALL is off', async () => {
    delete process.env.ATLAS_MEMORY_RECALL
    const pack = await recallMemories({ userId: 'u1' }) // no db → must not be touched
    expect(pack.skipped).toBe(true)
    expect(pack.items).toEqual([])
  })
})
