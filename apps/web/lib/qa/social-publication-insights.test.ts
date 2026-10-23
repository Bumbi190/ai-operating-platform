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

function fixture(records: Record<string, unknown>[], existing: Record<string, unknown>[] = []) {
  const queries: { table: string; filters: [string,string,unknown][] }[] = []
  const writes: Record<string, unknown>[] = []
  const db = {
    from(table: string) {
      const filters: [string,string,unknown][] = []
      let limit = 80
      const query: any = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.push(['eq', field, value]); return query },
        not: (field: string, _operator: string, value: unknown) => { filters.push(['not',field,value]); return query },
        order: () => query,
        limit: (n: number) => { limit = n; return query },
        maybeSingle: async () => {
          queries.push({ table, filters: [...filters] })
          const id = filters.find(f => f[1] === 'instagram_media_id')?.[2]
          return { data: existing.find(r => r.instagram_media_id === id) ?? null, error: null }
        },
        upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
          expect(table).toBe('media_insights')
          expect(opts).toEqual({ onConflict: 'instagram_media_id' })
          writes.push(row)
          return { error: null }
        },
        then: (resolve: (v: unknown) => unknown) => {
          queries.push({ table, filters: [...filters] })
          const matches = records.filter(row => filters.every(([op,field,value]) =>
            op === 'eq' ? row[field] === value : row[field] !== value))
          return Promise.resolve(resolve({ data: matches.slice(0, limit), error: null }))
        },
      }
      return query
    },
  }
  return { db, queries, writes }
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
  it('uses only published receipts matching the verified project and binding, stores existing schema', async () => {
    const f = fixture([
      published('first', '100'),
      published('second', '200', { binding_id: 'bad' }),
      published('third', '300', { project_id: X }),
      published('fourth', '400', { state: 'uncertain' }),
      published('fifth', '500', { channel: 'facebook' }),
      published('sixth', '600', { account_id: 'other' }),
    ])
    const x = deps(f)
    const r = await refresh({}, x)
    expect(r).toEqual({ status: 'complete', planned: 1, attempted: 1, written: 1, skipped: 0 })
    expect(x.fetched).toEqual(['100'])
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]).toMatchObject({
      project_id: F, platform: 'instagram', script_id: null, instagram_media_id: '100',
      views: 10, reach: 20, saved: 1, shares: 2,
    })
    const publicationRead = f.queries.find(q => q.table === 'social_publications')!
    for (const [key,val] of [['project_id',F],['binding_id',B],['account_id','1234567890'],['channel','instagram'],['state','published']]) {
      expect(publicationRead.filters).toContainEqual(['eq',key,val])
    }
  })

  it('refuses mixed credential identity before fetching or writing insights', async () => {
    const f = fixture([published('a','100')])
    const x = deps(f, {
      resolve: async () => ({ ok: true as const, credential: { projectId: X, bindingId: B, accountId: '1234567890', token: 'wrong' } }),
    })
    const r = await refresh({}, x)
    expect(r.written).toBe(0)
    expect(r.status).toBe('unavailable')
    expect(f.queries).toHaveLength(1) // project-scoped receipt read first
    expect(f.writes).toHaveLength(0)
  })

  it('refuses foreign and legacy records already using the provider ID', async () => {
    const f = fixture([published('a','100'), published('b','200')], [
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

  it('never invents zeroes for missing metrics and preserves provider counts', async () => {
    const f = fixture([published('a','100')])
    const x = deps(f, { fetch: async () => ({ ok: true, metrics: { views: undefined, reach: undefined, saved: 0, shares: 0 } }) })
    const r = await refresh({}, x)
    expect(r.written).toBe(1)
    expect(f.writes[0]).toMatchObject({ views: null, reach: null, saved: 0, shares: 0 })
  })

  it('does not call any credentials, provider or DB if there is no time budget', async () => {
    const f = fixture([published('a','100')])
    const x = deps(f, { activeBindings: async () => { throw Error('must not call') } })
    const r = await refresh({ deadlineAt: NOW + 10_000 }, x)
    expect(r.status).toBe('time_budget_exhausted')
    expect(f.queries).toEqual([])
  })

  it('does not fetch if listActiveBindings is unavailable and caps provider calls', async () => {
    const f = fixture(Array.from({ length: 7 }, (_, i) => published('x'+i, String(100+i))))
    const bad = deps(f, { activeBindings: async () => ({ ok: false as const }) })
    expect((await refresh({}, bad)).status).toBe('unavailable')
    expect(f.writes).toHaveLength(0)
    const x = deps(f)
    const r = await refresh({ perProject: 2 }, x)
    expect(r.written).toBe(2)
    expect(x.fetched).toHaveLength(2)
  })
})
