import { beforeEach, describe, it, expect, vi } from 'vitest'
import {
  buildOverviewModel,
  loadOverviewModel
} from '@/lib/overview/view-model'
import { readOverviewPages } from '@/lib/overview/read-pages'
const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  db: null as any,
  adminCalls: 0,
  error: null as unknown
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user }, error: auth.error })
    }
  })
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    auth.adminCalls++
    return auth.db
  }
}))
const now = new Date('2026-10-15T12:00:00Z'),
  A = 'a',
  B = 'b',
  ARCH = 'arch'
function database(
  tables: Record<string, any[]>,
  errors: Record<string, number> = {}
) {
  const queries: { table: string; ops: any[] }[] = [],
    calls: Record<string, number> = {}
  return {
    queries,
    from(table: string) {
      const ops: any[] = []
      queries.push({ table, ops })
      let rows = [...(tables[table] ?? [])],
        start = 0,
        end = Infinity
      calls[table] = (calls[table] ?? 0) + 1
      const call = calls[table]
      const q: any = {
        select: (fields: string) => {
          ops.push(['select', fields])
          return q
        },
        eq: (k: string, v: any) => {
          ops.push(['eq', k, v])
          rows = rows.filter((r) => r[k] === v)
          return q
        },
        in: (k: string, v: any[]) => {
          ops.push(['in', k, v])
          rows = rows.filter((r) => v.includes(r[k]))
          return q
        },
        gte: (...v: any[]) => {
          ops.push(['gte', ...v])
          return q
        },
        lt: (...v: any[]) => {
          ops.push(['lt', ...v])
          return q
        },
        lte: (...v: any[]) => {
          ops.push(['lte', ...v])
          return q
        },
        order: (...v: any[]) => {
          ops.push(['order', ...v])
          return q
        },
        range: (a: number, b: number) => {
          start = a
          end = b
          ops.push(['range', a, b])
          return q
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve(
            errors[table] === -1 || errors[table] === call
              ? { data: null, error: { message: 'denied' } }
              : { data: rows.slice(start, end + 1), error: null }
          ).then(resolve, reject)
      }
      return q
    }
  }
}
function fixtures() {
  return {
    projects: [
      {
        id: A,
        owner_id: 'owner-a',
        name: 'Alpha',
        slug: 'alpha',
        color: '#67e8f9'
      },
      { id: B, owner_id: 'owner-b', name: 'SECRET Beta', slug: 'beta' },
      {
        id: ARCH,
        owner_id: 'owner-a',
        name: 'Old',
        slug: 'old',
        project_lifecycle: [{ state: 'archived' }]
      }
    ],
    cost_events: [
      {
        id: 'c1',
        project_id: A,
        cost_sek: 10,
        created_at: '2026-10-14T10:00:00Z'
      },
      {
        id: 'c2',
        project_id: A,
        cost_sek: '-1.5',
        created_at: '2026-10-14T10:00:00Z'
      },
      {
        id: 'cb',
        project_id: B,
        cost_sek: 999,
        created_at: '2026-10-14T10:00:00Z'
      },
      {
        id: 'ca',
        project_id: ARCH,
        cost_sek: 100,
        created_at: '2026-10-14T10:00:00Z'
      }
    ],
    runs: [
      {
        id: 'r1',
        project_id: A,
        status: 'running',
        created_at: '2026-09-01T10:00:00Z'
      },
      {
        id: 'r2',
        project_id: A,
        status: 'future_status',
        created_at: '2026-10-15T10:00:00Z'
      },
      {
        id: 'rf',
        project_id: A,
        status: 'failed',
        created_at: '2026-10-14T13:00:00Z'
      },
      {
        id: 'rb',
        project_id: B,
        status: 'running',
        created_at: '2026-10-14T10:00:00Z'
      }
    ],
    approvals: [
      { id: 'ap', project_id: A, status: 'pending' },
      { id: 'global', project_id: null, status: 'pending' },
      { id: 'bp', project_id: B, status: 'pending' }
    ]
  }
}
beforeEach(() => {
  auth.user = null
  auth.db = null
  auth.error = null
  auth.adminCalls = 0
})
describe('owner overview model', () => {
  it('excludes foreign and archived projects before all aggregation', async () => {
    const db = database(fixtures()),
      m = await buildOverviewModel({ db, userId: 'owner-a', period: 7, now })
    expect(m.projects.rows.map((p) => p.id)).toEqual([A])
    expect(m.costByProject.value).toEqual([{ projectId: A, costSek: 8.5 }])
    expect(m.costByDay.value?.reduce((n, d) => n + d.costSek, 0)).toBe(8.5)
    expect(m.costByDay.value).toHaveLength(7)
    expect(m.totals.running).toEqual({ state: 'complete', value: 1 })
    expect(m.totals.failed24h.value).toBe(1)
    expect(m.totals.pendingApprovals.value).toBe(1)
    expect(m.runsByDay.value?.at(-1)?.counts.future_status).toBe(1)
    expect(
      m.runsByDay.value?.reduce((n, d) => n + (d.counts.running ?? 0), 0)
    ).toBe(0)
    expect(m.projects.rows[0].runningRuns.value).toBe(1)
    for (const q of db.queries.filter((q) => q.table !== 'projects'))
      expect(q.ops).toContainEqual(['in', 'project_id', [A]])
    expect(JSON.stringify(m)).not.toContain('SECRET')
  })
  it('distinguishes a verified empty owner from failed project verification', async () => {
    const emptyDb = database({ projects: [] }),
      empty = await buildOverviewModel({
        db: emptyDb,
        userId: 'empty',
        period: 7,
        now
      })
    expect(empty.totals.running).toEqual({ state: 'complete', value: 0 })
    expect(emptyDb.queries.every((q) => q.table === 'projects')).toBe(true)
    const failedDb = database(fixtures(), { projects: -1 }),
      failed = await buildOverviewModel({
        db: failedDb,
        userId: 'owner-a',
        period: 7,
        now
      })
    expect(failed.projects.state).toBe('unavailable')
    expect(failed.totals.running.value).toBeNull()
    expect(failedDb.queries.every((q) => q.table === 'projects')).toBe(true)
    const mismatched = database(fixtures(), { projects: 1 }),
      m = await buildOverviewModel({
        db: mismatched,
        userId: 'owner-a',
        period: 7,
        now
      })
    expect(m.totals.running.value).toBeNull()
    expect(mismatched.queries.every((q) => q.table === 'projects')).toBe(true)
  })
  it('keeps one failed source unavailable without pretending it costs zero', async () => {
    const m = await buildOverviewModel({
      db: database(fixtures(), { cost_events: -1 }),
      userId: 'owner-a',
      period: 7,
      now
    })
    expect(m.costByDay).toEqual({ state: 'unavailable', value: null })
    expect(m.costByProject.value).toBeNull()
    expect(m.totals.running.value).toBe(1)
  })
  it.each([null, '', NaN, 'not-money'])(
    'rejects malformed registered cost %s',
    async (cost) => {
      const f = fixtures()
      f.cost_events = [
        {
          id: 'bad',
          project_id: A,
          cost_sek: cost,
          created_at: '2026-10-14T10:00:00Z'
        }
      ] as any
      const m = await buildOverviewModel({
        db: database(f),
        userId: 'owner-a',
        period: 7,
        now
      })
      expect(m.costByDay.state).toBe('partial')
      expect(m.costByDay.value).toBeNull()
    }
  )
  it('marks malformed timestamps partial instead of filling a zero series', async () => {
    const f = fixtures()
    f.cost_events[0].created_at = 'invalid'
    const m = await buildOverviewModel({
      db: database(f),
      userId: 'owner-a',
      period: 7,
      now
    })
    expect(m.costByDay).toEqual({ state: 'partial', value: null })
  })
  it('authenticates before creating an admin reader', async () => {
    expect(await loadOverviewModel(7)).toBeNull()
    expect(auth.adminCalls).toBe(0)
    auth.user = { id: 'owner-a' }
    auth.error = { message: 'bad session' }
    expect(await loadOverviewModel(7)).toBeNull()
    expect(auth.adminCalls).toBe(0)
  })
})
describe('bounded complete pagination', () => {
  it('reads the next page and marks a later error partial', async () => {
    const result = await readOverviewPages(async (from) =>
      from === 0
        ? {
            data: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })),
            error: null
          }
        : { data: null, error: new Error('late failure') }
    )
    expect(result.state).toBe('partial')
    expect(result.rows).toHaveLength(500)
  })
  it('does not certify a full last allowed page as complete', async () => {
    let calls = 0
    const result = await readOverviewPages(async (from) => {
      calls++
      return {
        data: Array.from({ length: 500 }, (_, i) => ({ id: String(from + i) })),
        error: null
      }
    })
    expect(calls).toBe(40)
    expect(result.state).toBe('partial')
  })
  it('detects duplicate identities between pages', async () => {
    const result = await readOverviewPages(async (from) => ({
      data:
        from === 0
          ? Array.from({ length: 500 }, (_, i) => ({ id: String(i) }))
          : [{ id: '1' }],
      error: null
    }))
    expect(result.state).toBe('partial')
  })
  it('returns complete for a successful empty response', async () => {
    expect(
      await readOverviewPages(async () => ({ data: [], error: null }))
    ).toEqual({ state: 'complete', rows: [] })
  })
})

it('does not turn a later cost page failure into a complete total', async () => {
  const f = fixtures()
  f.cost_events = Array.from({ length: 500 }, (_, i) => ({
    id: 'cost-' + i,
    project_id: A,
    cost_sek: 1,
    created_at: '2026-10-14T10:00:00Z'
  }))
  const m = await buildOverviewModel({
    db: database(f, { cost_events: 2 }),
    userId: 'owner-a',
    period: 7,
    now
  })
  expect(m.costByDay).toEqual({ state: 'partial', value: null })
  expect(m.costByProject.value).toBeNull()
})
it('defensively omits trashed projects and cost rows outside the period', async () => {
  const f = fixtures()
  f.projects.push({
    id: 'trash',
    owner_id: 'owner-a',
    name: 'Trash',
    slug: 'trash',
    project_lifecycle: [{ state: 'trashed' }]
  } as any)
  f.cost_events.push({
    id: 'old-cost',
    project_id: A,
    cost_sek: 1000,
    created_at: '2026-09-14T10:00:00Z'
  })
  const m = await buildOverviewModel({
    db: database(f),
    userId: 'owner-a',
    period: 7,
    now
  })
  expect(m.projects.rows.map((p) => p.id)).toEqual([A])
  expect(m.costByProject.value).toEqual([{ projectId: A, costSek: 8.5 }])
})

it('loads the growth data for the authenticated dashboard without accepting another owner source',async()=>{
 const f:any=fixtures()
 const today=new Date().toISOString().slice(0,10)
 f.account_snapshots=[{id:'growth-own',project_id:A,platform:'instagram',snapshot_date:today,captured_at:today+'T00:00:00Z',followers:42,reach:null,account_id:'own-ig'}]
 auth.user={id:'owner-a'};auth.error=null;auth.db=database(f)
 const model:any=await loadOverviewModel(7)
 expect(model?.growth?.social.find((s:any)=>s.projectId===A&&s.platform==='instagram')?.followers).toBe(42)
})
