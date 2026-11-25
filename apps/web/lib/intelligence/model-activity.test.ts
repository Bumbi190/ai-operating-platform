import { describe, expect, it } from 'vitest'
import { modelActivityUnavailable, summarizeModelActivity, readModelActivity } from './model-activity'

const NOW = new Date('2026-11-25T10:00:00Z')
const AT = '2026-11-25T09:30:00Z'
const event = (overrides: Record<string, unknown> = {}) => ({
  project_id: 'mine', run_id: 'run-1', provider: 'aws-bedrock',
  model: 'claude-sonnet-4-6', cost_sek: '1.2500', created_at: AT,
  ...overrides,
})

describe('cost-event evidence in Intelligence Graph', () => {
  it('attributes registered models and exact per-run cost, not agent configuration', () => {
    const result = summarizeModelActivity([
      event(), event({ cost_sek: 0.75 }),
      event({ run_id: 'run-2', cost_sek: '0.25' }),
      event({ run_id: null, model: null, provider: 'other', cost_sek: '0.10' }),
    ], ['mine'], [
      { id: 'run-1', project_id: 'mine' }, { id: 'run-2', project_id: 'mine' },
    ], 24, NOW)
    expect(result.state).toBe('complete')
    expect(result.recordedCalls).toBe(4)
    expect(result.unlinkedCalls).toBe(1)
    expect(result.observedCostSek).toBe(2.35)
    expect(result.byModel.find(row => row.model === 'claude-sonnet-4-6')).toMatchObject({
      projectId: 'mine', calls: 3, costSek: 2.25, runIds: ['run-1', 'run-2'],
    })
    expect(result.byRun.find(row => row.runId === 'run-1')).toMatchObject({
      calls: 2, costSek: 2,
    })
    expect(result.byRun.find(row => row.runId === 'run-2')).toMatchObject({
      calls: 1, costSek: 0.25,
    })
    expect(result.byModel.find(row => row.model === null)?.calls).toBe(1)
  })

  it('never attributes another project or same-id foreign run to an owner', () => {
    const result = summarizeModelActivity([
      event(), event({ project_id: 'secret', model: 'private', cost_sek: 99 }),
      event({ run_id: 'run-cross', model: 'other', cost_sek: 2 }),
    ], ['mine'], [
      { id: 'run-1', project_id: 'mine' },
      { id: 'run-cross', project_id: 'secret' },
    ], 24, NOW)
    expect(result.state).toBe('partial')
    expect(result.observedCostSek).toBe(3.25)
    expect(result.recordedCalls).toBe(2)
    expect(result.unlinkedCalls).toBe(1)
    expect(result.byRun.map(row => row.runId)).toEqual(['run-1'])
    expect(JSON.stringify(result)).not.toContain('private')
  })

  it('rejects missing, future and invalid amounts rather than showing zero', () => {
    const result = summarizeModelActivity([
      event({ cost_sek: null }), event({ cost_sek: 'NaN' }),
      event({ created_at: '2026-11-26T00:00:00Z' }),
      event({ created_at: '2026-11-20T10:00:00Z' }),
      event({ cost_sek: '-0.5', model: null }),
    ], ['mine'], [{ id: 'run-1', project_id: 'mine' }], 24, NOW)
    expect(result.state).toBe('partial')
    expect(result.recordedCalls).toBe(1)
    expect(result.observedCostSek).toBe(-0.5)
    expect(result.byModel[0].model).toBeNull()
  })

  it('keeps models with the same name separate across projects and providers', () => {
    const snapshot = summarizeModelActivity([
      event({ model: 'same', provider: 'aws', project_id: 'mine', cost_sek: 1 }),
      event({ model: 'same', provider: 'direct', project_id: 'mine', cost_sek: 2 }),
      event({ model: 'same', provider: 'aws', project_id: 'mine-2', cost_sek: 3 }),
    ], ['mine', 'mine-2'], [], 24, NOW)
    expect(snapshot.byModel).toHaveLength(3)
    expect(snapshot.byRun).toHaveLength(0)
    expect(snapshot.unlinkedCalls).toBe(3)
  })

  it('marks capped samples partial and does not call their sum a complete bill', () => {
    const sample = Array.from({ length: 5001 }, () => event({ cost_sek: 1 }))
    const result = summarizeModelActivity(sample, ['mine'], [], 24, NOW, true)
    expect(result.state).toBe('partial')
    expect(result.recordedCalls).toBe(5000)
    expect(result.observedCostSek).toBe(5000)
  })

  it('returns explicit unavailable state for a missing source', () => {
    expect(modelActivityUnavailable(24)).toMatchObject({
      state: 'unavailable', observedCostSek: null, byModel: [], byRun: [],
    })
  })

  it('queries only authorized project ids and refuses data-source errors', async () => {
    const scopes: string[][] = []
    const db = {
      from(table: string) {
        expect(table).toBe('cost_events')
        const q = {
          select: () => q,
          in: (_key: string, ids: string[]) => { scopes.push(ids); return q },
          gte: () => q,
          lte: () => q,
          order: () => q,
          range: () => q,
          then: (ok: (result: unknown) => void) => ok({ data: [event()], error: null }),
        }
        return q
      },
    }
    const result = await readModelActivity(db, ['mine'], [{ id: 'run-1', project_id: 'mine' }], 24, NOW)
    expect(scopes).toEqual([['mine']])
    expect(result.recordedCalls).toBe(1)
    const unavailable = await readModelActivity({
      from() {
        const q = { select: () => q, in: () => q, gte: () => q, lte: () => q, order: () => q, range: () => q,
          then: (ok: (result: unknown) => void) => ok({ data: null, error: { message: 'offline' } }) }
        return q
      },
    }, ['mine'], [], 24, NOW)
    expect(unavailable.state).toBe('unavailable')
  })

  it('paginates past the default 1000 rows without silently truncating', async () => {
    const rows = Array.from({ length: 1601 }, (_, index) => event({
      id: 'e-' + index, cost_sek: 1, run_id: null,
    }))
    const ranges: Array<[number, number]> = []
    const db = {
      from: () => {
        const q = {
          select: () => q, in: () => q, gte: () => q, lte: () => q, order: () => q,
          range: (from: number, to: number) => {
            ranges.push([from, to])
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
          },
        }
        return q
      },
    }
    const result = await readModelActivity(db, ['mine'], [], 24, NOW)
    expect(result.state).toBe('complete')
    expect(result.recordedCalls).toBe(1601)
    expect(result.observedCostSek).toBe(1601)
    expect(ranges).toEqual([[0,499],[500,999],[1000,1499],[1500,1999]])
  })

  it('marks a failed later page partial instead of claiming complete coverage', async () => {
    let pages = 0
    const db = {
      from: () => {
        const q = {
          select: () => q, in: () => q, gte: () => q, lte: () => q, order: () => q,
          range: () => {
            pages++
            return Promise.resolve(pages === 1
              ? { data: Array.from({ length: 500 }, () => event()), error: null }
              : { data: null, error: { message: 'unavailable' } })
          },
        }
        return q
      },
    }
    const result = await readModelActivity(db, ['mine'], [], 24, NOW)
    expect(result.state).toBe('partial')
    expect(result.recordedCalls).toBe(500)
  })

  it('excludes attribution-only rows from provider call counts', () => {
    const result = summarizeModelActivity([
      event({ metadata: { attribution_only: true }, cost_sek: 0 }),
      event({ metadata: { attribution_only: false } }),
    ], ['mine'], [], 24, NOW)
    expect(result.recordedCalls).toBe(1)
    expect(result.observedCostSek).toBe(1.25)
    expect(result.state).toBe('complete')
  })

  it('does not query cost events for an empty authorized scope', async () => {
    const result = await readModelActivity({ from() { throw new Error('must not read') } }, [], [], 24, NOW)
    expect(result).toMatchObject({ state: 'complete', recordedCalls: 0, byModel: [] })
  })
})
