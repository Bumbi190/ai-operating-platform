import { describe, expect, it } from 'vitest'
import { readInstagramGrowthPanels } from '../content-growth/instagram-read'

const PROMPT_ID = '11111111-1111-1111-1111-111111111111'
const FAMILY_ID = '22222222-2222-2222-2222-222222222222'
const OTHER_ID = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-10-23T10:00:00Z')

const projects = [
  { id: PROMPT_ID, slug: 'ai-media-automation' },
  { id: FAMILY_ID, slug: 'familje-stunden' },
  { id: OTHER_ID, slug: 'unrelated-business' },
]
const insight = (id: string, project_id: string, views: number | null, opts: Record<string, unknown> = {}) => ({
  id, project_id, platform: 'instagram', views, reach: 100,
  shares: 10, saved: 5, followers_gained: null,
  published_at: '2026-10-20T12:00:00Z', fetched_at: '2026-10-22T12:00:00Z',
  ...opts,
})

function dbFor(
  posts: Record<string, unknown>[],
  opts: { failProjects?: boolean; failInsights?: boolean } = {},
) {
  const reads: Array<{ table: string; filters: [string, string, unknown][] }> = []
  const db = {
    from(table: string) {
      const filters: [string, string, unknown][] = []
      const query = {
        select: () => query,
        in: (column: string, values: string[]) => { filters.push(['in', column, values]); return query },
        eq: (column: string, value: string) => { filters.push(['eq', column, value]); return query },
        gte: (column: string, value: string) => { filters.push(['gte', column, value]); return query },
        order: () => query,
        limit: () => query,
        then(resolve: (result: unknown) => unknown) {
          reads.push({ table, filters: [...filters] })
          const source = table === 'projects' ? projects : posts
          const data = source.filter(row => filters.every(([op, key, val]) => {
            const record = row as Record<string, any>
            if (op === 'in') return (val as string[]).includes(record[key])
            if (op === 'eq') return record[key] === val
            if (op === 'gte') return record[key] >= val
            return true
          }))
          return Promise.resolve(resolve({
            data: opts.failProjects && table === 'projects' || opts.failInsights && table === 'media_insights' ? null : data,
            error: (opts.failProjects && table === 'projects') || (opts.failInsights && table === 'media_insights') ? { message: 'simulated failure' } : null,
          }))
        },
      }
      return query
    },
  }
  return { db, reads }
}

describe('authenticated read-only Instagram growth panels', () => {
  it('does not query at all when no project access exists', async () => {
    const { db, reads } = dbFor([insight('a', PROMPT_ID, 100)])
    const result = await readInstagramGrowthPanels(db, [], 90, NOW)
    expect(result['the-prompt'].status).toBe('no_access')
    expect(result['familje-stunden'].status).toBe('no_access')
    expect(reads).toEqual([])
  })

  it('restricts project and insight queries to exact allowed brand-specific IDs', async () => {
    const { db, reads } = dbFor([
      insight('p1', PROMPT_ID, 100),
      insight('p2', PROMPT_ID, 300, { shares: null, reach: null }),
      insight('f1', FAMILY_ID, 200),
      insight('other', OTHER_ID, 900000),
      insight('wrong-platform', PROMPT_ID, 999, { platform: 'youtube' }),
      insight('wrong-project', OTHER_ID, 9000, { platform: 'instagram' }),
      insight('old', PROMPT_ID, 800, { published_at: '2025-01-01T00:00:00Z' }),
    ])
    const result = await readInstagramGrowthPanels(db, [PROMPT_ID, FAMILY_ID, OTHER_ID], 90, NOW)
    const p = result['the-prompt']
    const f = result['familje-stunden']
    expect(p.status).toBe('ready')
    expect(f.status).toBe('ready')
    if (p.status !== 'ready' || f.status !== 'ready') throw new Error('expected ready')
    expect(p.summary.sampleSize).toBe(2)
    expect(f.summary.sampleSize).toBe(1)
    expect(p.summary.medianViews).toBe(200)
    expect(f.summary.medianViews).toBe(200)
    expect(p.summary.posts[1].sharesPerReach).toBeNull()
    expect(p.summary.posts.every(post => post.brand === 'the-prompt')).toBe(true)
    const insightReads = reads.filter(r => r.table === 'media_insights')
    expect(insightReads).toHaveLength(2)
    expect(insightReads.map(r => r.filters.find(f => f[1] === 'project_id')?.[2]).sort()).toEqual([PROMPT_ID, FAMILY_ID].sort())
    expect(reads[0].filters).toContainEqual(['in', 'id', [PROMPT_ID, FAMILY_ID, OTHER_ID]])
    expect(reads[0].filters).toContainEqual(['in', 'slug', ['ai-media-automation', 'familje-stunden']])
  })

  it('does not treat NULL views as zero or infer absent follow counts', async () => {
    const { db } = dbFor([
      insight('unknown', PROMPT_ID, null), insight('valid', PROMPT_ID, 0, { reach: null, saved: null }),
    ])
    const result = await readInstagramGrowthPanels(db, [PROMPT_ID], 90, NOW)
    const p = result['the-prompt']
    expect(p.status).toBe('ready')
    if (p.status !== 'ready') throw new Error('expected ready')
    expect(p.summary.sampleSize).toBe(1)
    expect(p.skippedUnknownViews).toBe(1)
    expect(p.summary.posts[0].follows).toBeNull()
    expect(p.summary.posts[0].sharesPerReach).toBeNull()
    expect(p.summary.posts[0].viewMultiple).toBeNull()
    expect(result['familje-stunden'].status).toBe('no_access')
  })

  it('reports missing and errored insight sources honestly', async () => {
    const empty = await readInstagramGrowthPanels(dbFor([]).db, [PROMPT_ID], 90, NOW)
    expect(empty['the-prompt'].status).toBe('no_data')
    const error = await readInstagramGrowthPanels(dbFor([], { failInsights: true }).db, [PROMPT_ID], 90, NOW)
    expect(error['the-prompt'].status).toBe('unavailable')
    const projectError = await readInstagramGrowthPanels(dbFor([], { failProjects: true }).db, [PROMPT_ID], 90, NOW)
    expect(projectError['the-prompt'].status).toBe('unavailable')
  })

  it('rejects unbounded collection time windows', async () => {
    await expect(readInstagramGrowthPanels(dbFor([]).db, [PROMPT_ID], 999, NOW)).rejects.toThrow('Invalid Instagram time window')
  })
})
