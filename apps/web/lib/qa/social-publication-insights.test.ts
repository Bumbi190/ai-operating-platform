import { describe, expect, it } from 'vitest'
import { refreshSocialPublicationInstagramInsights as refresh } from '../media/social-publication-insights'

const F = '22222222-2222-2222-2222-222222222222'
const X = '33333333-3333-3333-3333-333333333333'
const B = '44444444-4444-4444-4444-444444444444'
const NOW = new Date('2026-10-23T12:00:00.000Z').getTime()
const binding = { projectId: F, bindingId: B, externalAccountId: '1234567890', platform: 'instagram' }
const published = (id: string, provider_id: string, patch: Record<string, unknown> = {}) => ({
  id, project_id: F, binding_id: B, account_id: '1234567890',
  provider_id, updated_at: '2026-10-21T12:00:00Z',
  state: 'published', channel: 'instagram', ...patch,
})

function fixture(records: Record<string, unknown>[], initiallyExisting: Record<string, unknown>[] = []) {
  const queries: { table: string; filters: [string,string,unknown][] }[] = []
  const writes: Record<string, unknown>[] = []
  // Own in-memory rows to simulate database-level ownership checks and
  // a conflicting concurrent unique-key claim.
  const existing = initiallyExisting.map(r => ({ platform: 'instagram', id: 'mid-' + r.instagram_media_id, ...r }))
  let raceBeforeInsert: Record<string, unknown> | null = null
  const race = (row: Record<string, unknown>) => { raceBeforeInsert = row }
  const db = {
    from(table: string) {
      const filters: [string,string,unknown][] = []
      let limit = 80
      let patch: Record<string, unknown> | null = null
      const matches = (r: Record<string, unknown>) => filters.every(([op,field,value]) =>
        op === 'eq' ? r[field] === value
        : op === 'is' ? r[field] === value
        : op === 'not' ? r[field] !== value
        : true)
      const query: any = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.push(['eq', field, value]); return query },
        is: (field: string, value: unknown) => { filters.push(['is', field, value]); return query },
        not: (field: string, _operator: string, value: unknown) => { filters.push(['not',field,value]); return query },
        order: () => query,
        limit: (n: number) => { limit = n; return query },
        update: (values: Record<string, unknown>) => { patch = values; return query },
        insert: async (row: Record<string, unknown>) => {
          expect(table).toBe('media_insights')
          if (raceBeforeInsert) {
            existing.push(raceBeforeInsert)
            raceBeforeInsert = null
          }
          if (existing.some(r => r.instagram_media_id === row.instagram_media_id)) {
            return { error: { code: '23505' } }
          }
          existing.push({ ...row, id: 'new-' + row.instagram_media_id })
          writes.push(row)
          return { error: null }
        },
        maybeSingle: async () => {
          queries.push({ table, filters: [...filters] })
          const rows = existing.filter(matches)
          if (patch !== null) {
            if (rows.length === 1) {
              Object.assign(rows[0], patch)
              writes.push({ ...patch })
            }
            return { data: rows[0] ?? null, error: null }
          }
          return { data: rows[0] ?? null, error: null }
        },
        then: (resolve: (v: unknown) => unknown) => {
          queries.push({ table, filters: [...filters] })
          return Promise.resolve(resolve({ data: records.filter(matches).slice(0, limit), error: null }))
        },
      }
      return query
    },
  }
  return { db, queries, writes, existing, race }
}
function deps(f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) {
  const fetched: string[] = []
  return {
    db: f.db,
    now: () => NOW,
    activeBindings: async () => ({ ok: true as const, bindings: [binding] }),
    resolve: async () => ({ ok: true as const, credential: { projectId: F, bindingId: B, accountId: '1234567890', token: 'only-in-memory' } }),
    fetch: async (id: string) => { fetched.push(id); return { ok: true, metrics: { views: 10, reach: 20, saved: 1, shares: 2 } } },
    fetched,
    ...patch,
  }
}

describe('social publication Instagram Insights adapter', () => {
  it('uses only published receipts matching project + binding, inserts into existing schema', async () => {
    const f = fixture([
      published('first','100'),
      published('other-binding','200', { binding_id: 'bad' }),
      published('foreign','300', { project_id: X }),
      published('uncertain','400', { state: 'uncertain' }),
      published('facebook','500', { channel: 'facebook' }),
      published('wrong-account','600', { account_id: 'other' }),
    ])
    const x = deps(f)
    const r = await refresh({}, x)
    expect(r).toEqual({ status: 'complete', planned: 1, attempted: 1, written: 1, skipped: 0 })
    expect(x.fetched).toEqual(['100'])
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]).toMatchObject({ project_id: F, platform: 'instagram', script_id: null,
      instagram_media_id: '100', views: 10, reach: 20, saved: 1, shares: 2 })
    const read = f.queries.find(q => q.table === 'social_publications')!
    for (const [key,val] of [['project_id',F],['binding_id',B],['account_id','1234567890'],['channel','instagram'],['state','published']]) {
      expect(read.filters).toContainEqual(['eq',key,val])
    }
  })

  it('refuses mixed credential identity before provider fetch or database write', async () => {
    const f = fixture([published('a','100')])
    const x = deps(f, { resolve: async () => ({ ok: true as const,
      credential: { projectId: X, bindingId: B, accountId: '1234567890', token: 'wrong' } }) })
    const r = await refresh({}, x)
    expect(r.status).toBe('unavailable')
    expect(r.written).toBe(0)
    expect(f.writes).toHaveLength(0)
  })

  it('refuses foreign or legacy records already using the provider ID', async () => {
    const f = fixture([published('a','100'),published('b','200')], [
      { instagram_media_id: '100', project_id: X, script_id: null },
      { instagram_media_id: '200', project_id: F, script_id: 'legacy-script' },
    ])
    const x = deps(f)
    const r = await refresh({}, x)
    expect(r.status).toBe('partial')
    expect(r.written).toBe(0)
    expect(x.fetched).toEqual([])
    expect(f.writes).toHaveLength(0)
  })

  it('updates an existing same-project row only with atomic ownership predicates', async () => {
    const f = fixture([published('a','100')], [{ instagram_media_id: '100', id: 'row-100',
      project_id: F, script_id: null, platform: 'instagram', views: 1 }])
    const r = await refresh({}, deps(f))
    expect(r.written).toBe(1)
    expect(f.existing[0].views).toBe(10)
    const guard = f.queries.find(q => q.table === 'media_insights' && q.filters.some(f => f[1] === 'id'))
    expect(guard?.filters).toContainEqual(['eq','project_id',F])
    expect(guard?.filters).toContainEqual(['eq','instagram_media_id','100'])
    expect(guard?.filters).toContainEqual(['eq','platform','instagram'])
    expect(guard?.filters).toContainEqual(['is','script_id',null])
  })

  it('blocks a concurrent unique-media claim instead of overwriting foreign data', async () => {
    const f = fixture([published('a','100')])
    f.race({ id: 'foreign-row', instagram_media_id: '100', project_id: X,
      platform: 'instagram', script_id: null, views: 99 })
    const r = await refresh({}, deps(f))
    expect(r.status).toBe('partial')
    expect(r.written).toBe(0)
    expect(f.existing.find(x => x.id === 'foreign-row')?.views).toBe(99)
    expect(f.writes).toHaveLength(0)
  })

  it('represents missing counters as null, real zeroes as zero', async () => {
    const f = fixture([published('a','100')])
    const r = await refresh({}, deps(f, { fetch: async () => ({ ok: true,
      metrics: { views: undefined, reach: undefined, saved: 0, shares: 0 } }) }))
    expect(r.written).toBe(1)
    expect(f.writes[0]).toMatchObject({ views: null, reach: null, saved: 0, shares: 0 })
  })

  it('has no provider or DB calls when deadline is already exhausted', async () => {
    const f = fixture([published('a','100')])
    const r = await refresh({ deadlineAt: NOW + 10_000 }, deps(f, {
      activeBindings: async () => { throw Error('must not call') },
    }))
    expect(r.status).toBe('time_budget_exhausted')
    expect(f.queries).toEqual([])
  })

  it('stops safely on inaccessible bindings and caps calls', async () => {
    const f = fixture(Array.from({ length: 7 },(_,i)=>published('x'+i,String(100+i))))
    expect((await refresh({},deps(f,{ activeBindings: async () => ({ ok: false as const }) }))).status).toBe('unavailable')
    const x = deps(f)
    const r = await refresh({ perProject: 2 },x)
    expect(r.written).toBe(2)
    expect(x.fetched).toHaveLength(2)
  })

  it('skips credential verification when no published receipts exist', async () => {
    const f = fixture([])
    const r = await refresh({},deps(f,{resolve: async () => { throw Error('should not resolve') }}))
    expect(r.status).toBe('complete')
    expect(r.written).toBe(0)
  })
})
