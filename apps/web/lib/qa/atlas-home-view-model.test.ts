import { describe, expect, it } from 'vitest'
import {
  assembleAtlasHomeViewModel,
  buildAtlasHomeViewModel,
} from '@/lib/atlas/home-view-model'

const NOW = new Date('2026-08-16T10:00:00.000Z')

function project(id: string, name = id) {
  return {
    id,
    name,
    slug: id,
    color: '#22d3ee',
    created_at: '2026-01-01T00:00:00.000Z',
    atlas_mode: 'active',
  }
}

describe('Atlas Home presentation boundary', () => {
  it('includes owned rows and excludes unauthorized rows before serialization', () => {
    const model = assembleAtlasHomeViewModel({
      allowedProjectIds: ['owned'],
      projectRows: [project('owned'), project('foreign')],
      runRows: [
        { id: 'r-owned', project_id: 'owned', status: 'running', created_at: NOW.toISOString(), finished_at: null },
        { id: 'r-foreign', project_id: 'foreign', status: 'failed', created_at: NOW.toISOString(), finished_at: null },
      ],
      approvalRows: [
        { id: 'a-owned', project_id: 'owned', status: 'pending', output_key: 'owned', created_at: NOW.toISOString(), reviewed_at: null },
        { id: 'a-foreign', project_id: 'foreign', status: 'pending', output_key: 'foreign', created_at: NOW.toISOString(), reviewed_at: null },
      ],
      now: NOW,
    })

    expect(model.projects.map((item) => item.id)).toEqual(['owned'])
    expect(model.activity.map((item) => item.projectId)).toEqual(['owned', 'owned'])
    expect(model.totals).toMatchObject({ projects: 1, runningRuns: 1, pendingApprovals: 1 })
    expect(JSON.stringify(model)).not.toContain('foreign')
  })

  it('does not fabricate unavailable run or approval metrics', () => {
    const model = assembleAtlasHomeViewModel({
      allowedProjectIds: ['owned'],
      projectRows: [project('owned')],
      runRows: null,
      approvalRows: null,
      now: NOW,
    })

    expect(model.totals.runningRuns).toBeNull()
    expect(model.totals.failedRuns24h).toBeNull()
    expect(model.totals.pendingApprovals).toBeNull()
    expect(model.projects[0]).toMatchObject({ runningRuns: null, pendingApprovals: null })
    expect(model.availability).toEqual({ projects: true, runs: false, approvals: false })
  })

  it('returns an honest empty model when the user has no projects', async () => {
    const calls: string[] = []
    const db = {
      from(table: string) {
        calls.push(table)
        return {
          select() {
            return {
              eq() { return Promise.resolve({ data: [] }) },
            }
          },
        }
      },
    }

    const model = await buildAtlasHomeViewModel({ db, userId: 'user-empty', now: NOW })
    expect(model.projects).toEqual([])
    expect(model.activity).toEqual([])
    expect(model.totals).toEqual({ projects: 0, runningRuns: 0, pendingApprovals: 0, failedRuns24h: 0 })
    expect(calls).toEqual(['projects'])
  })
})

describe('Atlas Home server query scoping', () => {
  it('applies the owned project ids to project, run, and approval queries', async () => {
    const scopes: Array<{ table: string; column: string; values: string[] }> = []
    const tableVisits = new Map<string, number>()

    const results: Record<string, Array<{ data: unknown[]; error?: unknown }>> = {
      projects: [
        { data: [{ id: 'owned' }] },
        { data: [project('owned'), project('foreign')] },
      ],
      runs: [{ data: [
        { id: 'r1', project_id: 'owned', status: 'running', created_at: NOW.toISOString(), finished_at: null },
        { id: 'r2', project_id: 'foreign', status: 'failed', created_at: NOW.toISOString(), finished_at: null },
      ] }],
      approvals: [{ data: [
        { id: 'a1', project_id: 'owned', status: 'pending', output_key: 'one', created_at: NOW.toISOString(), reviewed_at: null },
        { id: 'a2', project_id: 'foreign', status: 'pending', output_key: 'two', created_at: NOW.toISOString(), reviewed_at: null },
      ] }],
    }

    const db = {
      from(table: string) {
        const visit = tableVisits.get(table) ?? 0
        tableVisits.set(table, visit + 1)
        const result = results[table]?.[visit] ?? { data: [] }
        const builder: any = {
          select() { return builder },
          eq(column: string, value: string) {
            expect(table).toBe('projects')
            expect({ column, value }).toEqual({ column: 'owner_id', value: 'user-1' })
            return builder
          },
          in(column: string, values: string[]) {
            scopes.push({ table, column, values })
            return builder
          },
          order() { return builder },
          limit() { return builder },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve) },
        }
        return builder
      },
    }

    const model = await buildAtlasHomeViewModel({ db, userId: 'user-1', now: NOW })

    expect(scopes).toEqual(expect.arrayContaining([
      { table: 'projects', column: 'id', values: ['owned'] },
      { table: 'runs', column: 'project_id', values: ['owned'] },
      { table: 'approvals', column: 'project_id', values: ['owned'] },
    ]))
    expect(model.projects.map((item) => item.id)).toEqual(['owned'])
    expect(model.activity.every((item) => item.projectId === 'owned')).toBe(true)
  })
})
