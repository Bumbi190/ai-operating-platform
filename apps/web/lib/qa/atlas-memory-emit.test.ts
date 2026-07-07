import { describe, it, expect, afterEach } from 'vitest'
import {
  recordMemoryEvent, eventTypeToClass, isMemoryEnabled,
  type MemoryEventType,
} from '@/lib/atlas/memory/record-event'

/**
 * Atlas Memory M4 Commit 2 — emit API.
 *
 * Unit-level proof of the emit CONTRACT (flag gate, taxonomy mapping, non-throwing,
 * dedupe interpretation). The DB-level wrapper behavior (idempotent insert, episodic
 * consolidated_at, project-scope CHECK) is proven against the staging branch via SQL.
 */

afterEach(() => { delete process.env.ATLAS_MEMORY })

/** Fake admin client recording the rpc call; returns opts.data / opts.error or throws. */
function fakeDb(opts: { data?: unknown; error?: { message: string } | null; throws?: boolean } = {}) {
  const calls: { name: string; params: Record<string, unknown> }[] = []
  const db = {
    rpc: (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params })
      if (opts.throws) return Promise.reject(new Error('connection reset'))
      return Promise.resolve({ data: opts.data ?? null, error: opts.error ?? null })
    },
  }
  return { db, calls }
}

const base = { scope: 'project', eventType: 'feedback', content: 'c', source: 'approval', projectId: 'p1' } as const

describe('eventTypeToClass — central taxonomy mapping', () => {
  it('maps every event_type to the right memory_class', () => {
    const expected: Record<MemoryEventType, string> = {
      decision: 'decision',
      feedback: 'procedural',
      observation: 'procedural',
      fact_assertion: 'semantic',
      outcome: 'episodic',
      reflection: 'episodic',
      correction: 'episodic',
    }
    for (const [t, cls] of Object.entries(expected)) {
      expect(eventTypeToClass(t as MemoryEventType), `${t} → ${cls}`).toBe(cls)
    }
  })
  it('episodic set matches the wrapper (outcome/reflection/correction)', () => {
    const episodic = (['outcome', 'reflection', 'correction'] as MemoryEventType[]).every(t => eventTypeToClass(t) === 'episodic')
    expect(episodic).toBe(true)
  })
})

describe('isMemoryEnabled — flag gate (default OFF)', () => {
  it('is false unless ATLAS_MEMORY === "1"', () => {
    delete process.env.ATLAS_MEMORY; expect(isMemoryEnabled()).toBe(false)
    process.env.ATLAS_MEMORY = '0'; expect(isMemoryEnabled()).toBe(false)
    process.env.ATLAS_MEMORY = 'true'; expect(isMemoryEnabled()).toBe(false)
    process.env.ATLAS_MEMORY = '1'; expect(isMemoryEnabled()).toBe(true)
  })
})

describe('recordMemoryEvent', () => {
  it('flag OFF → skipped, never touches the db', async () => {
    const { db, calls } = fakeDb({ data: 'id-1' })
    const r = await recordMemoryEvent(base, db)
    expect(r).toEqual({ id: null, deduped: false, skipped: true })
    expect(calls).toHaveLength(0)
  })

  it('flag ON → calls atlas_record_event with mapped params and returns the id', async () => {
    process.env.ATLAS_MEMORY = '1'
    const { db, calls } = fakeDb({ data: 'id-1' })
    const r = await recordMemoryEvent({ ...base, sourceId: 'a1' }, db)
    expect(r).toEqual({ id: 'id-1', deduped: false, skipped: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('atlas_record_event')
    expect(calls[0].params).toMatchObject({
      p_scope: 'project', p_event_type: 'feedback', p_content: 'c',
      p_source: 'approval', p_project_id: 'p1', p_source_id: 'a1',
    })
  })

  it('returns deduped when the wrapper returns NULL (idempotent conflict)', async () => {
    process.env.ATLAS_MEMORY = '1'
    const { db } = fakeDb({ data: null })
    const r = await recordMemoryEvent({ ...base, sourceId: 'a1' }, db)
    expect(r).toEqual({ id: null, deduped: true, skipped: false })
  })

  it('never throws on a db error (side-channel) → { id:null }', async () => {
    process.env.ATLAS_MEMORY = '1'
    const { db } = fakeDb({ error: { message: 'boom' } })
    const r = await recordMemoryEvent(base, db)
    expect(r).toEqual({ id: null, deduped: false, skipped: false })
  })

  it('never throws when the rpc call itself throws', async () => {
    process.env.ATLAS_MEMORY = '1'
    const { db } = fakeDb({ throws: true })
    await expect(recordMemoryEvent(base, db)).resolves.toEqual({ id: null, deduped: false, skipped: false })
  })
})
