/**
 * get_records executor (Foundation 2) — isolation + whitelist behavior.
 *
 * Uses a chainable mock db that records every select/in/eq/order/limit so we can
 * assert: project scoping is ALWAYS applied, never SELECT *, PII gated, by-id is
 * an extra filter (not a scope bypass), empty allow-list returns nothing,
 * disallowed filters are dropped, project narrowing maps slug→id with a
 * membership check, limit is capped, and truncation runs.
 */
import { describe, it, expect } from 'vitest'
import { fetchRecords } from '@/lib/atlas/record-access'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

interface QueryState {
  table: string
  select?: string
  ins: { col: string; vals: string[] }[]
  eqs: { col: string; val: unknown }[]
  order?: { col: string; opts: { ascending: boolean } }
  limit?: number
}

function makeDb(seed: Record<string, any[]>) {
  const queries: QueryState[] = []
  function builder(table: string) {
    const st: QueryState = { table, ins: [], eqs: [] }
    const b: any = {
      select(cols: string) { st.select = cols; return b },
      in(col: string, vals: string[]) { st.ins.push({ col, vals }); return b },
      eq(col: string, val: unknown) { st.eqs.push({ col, val }); return b },
      order(col: string, opts: { ascending: boolean }) { st.order = { col, opts }; return b },
      limit(n: number) { st.limit = n; return b },
      then(resolve: (v: { data: any[]; error: null }) => void) {
        queries.push(st)
        let rows = (seed[st.table] ?? []).slice()
        for (const { col, vals } of st.ins) rows = rows.filter((r: any) => vals.includes(r[col]))
        for (const { col, val } of st.eqs) rows = rows.filter((r: any) => r[col] === val)
        if (st.limit != null) rows = rows.slice(0, st.limit)
        resolve({ data: rows, error: null })
      },
    }
    return b
  }
  return { db: { from: (t: string) => builder(t) }, queries }
}

const PROJECTS = [
  { id: 'p-prompt', slug: 'ai-media-automation' },
  { id: 'p-gain', slug: 'gainpilot' },
  { id: 'p-other', slug: 'someone-elses' }, // exists globally but NOT owned below
]
const OWNED = ['p-prompt', 'p-gain']

const leadRow = (id: string, project_id: string, extra: any = {}) => ({
  id, project_id, name: `Lead ${id}`, source: 'web', status: 'qualified',
  value_sek: 1000, created_at: '2026-06-01', email: `${id}@x.com`, phone: '070', ...extra,
})

function seedDb() {
  return makeDb({
    projects: PROJECTS,
    leads: [leadRow('l1', 'p-prompt'), leadRow('l2', 'p-gain'), leadRow('l3', 'p-other')],
    memories: [{ id: 'm1', project_id: 'p-prompt', key: 'k', source: 'operator', updated_at: '2026-06-01', value: 'x'.repeat(500) }],
  })
}

const lastMain = (queries: QueryState[]) => queries[queries.length - 1]
const projScope = (q: QueryState) => q.ins.find(i => i.col === 'project_id')

describe('fetchRecords — domain + column whitelisting', () => {
  it('rejects an unknown domain', async () => {
    const { db } = seedDb()
    const r = await fetchRecords(db, { domain: 'platform_tokens' }, OWNED)
    expect(r.error).toMatch(/Okänd domän/)
    expect(r.rows).toEqual([])
  })

  it('selects only whitelisted columns (no SELECT *, no PII by default)', async () => {
    const { db, queries } = seedDb()
    await fetchRecords(db, { domain: 'leads' }, OWNED)
    const q = lastMain(queries)
    expect(q.select).toBe('id, name, source, status, value_sek, created_at')
    expect(q.select).not.toContain('*')
    expect(q.select).not.toContain('email')
    expect(q.select).not.toContain('phone')
  })

  it('includes PII columns only when include_pii is true', async () => {
    const { db, queries } = seedDb()
    await fetchRecords(db, { domain: 'leads', includePii: true }, OWNED)
    expect(lastMain(queries).select).toBe('id, name, source, status, value_sek, created_at, email, phone')
  })
})

describe('fetchRecords — project isolation', () => {
  it('always scopes by project_id to the allowed set', async () => {
    const { db, queries } = seedDb()
    const r = await fetchRecords(db, { domain: 'leads' }, OWNED)
    expect(projScope(lastMain(queries))?.vals).toEqual(OWNED)
    expect(r.rows.map(x => x.id)).toEqual(['l1', 'l2']) // never l3 (p-other)
  })

  it('empty allow-list → impossible id → zero rows (never global)', async () => {
    const { db, queries } = seedDb()
    const r = await fetchRecords(db, { domain: 'leads' }, [])
    expect(projScope(lastMain(queries))?.vals).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(r.rows).toEqual([])
  })

  it('by-id is an EXTRA filter, not a scope bypass', async () => {
    const { db, queries } = seedDb()
    const r = await fetchRecords(db, { domain: 'leads', id: 'l3' }, OWNED) // l3 belongs to p-other
    const q = lastMain(queries)
    expect(q.eqs.some(e => e.col === 'id' && e.val === 'l3')).toBe(true)
    expect(projScope(q)?.vals).toEqual(OWNED) // scope still applied
    expect(r.rows).toEqual([]) // l3 excluded by scope despite matching id
  })

  it('narrows to a project via slug→id with a membership check', async () => {
    const { db, queries } = seedDb()
    const r = await fetchRecords(db, { domain: 'leads', project: 'The Prompt' }, OWNED)
    expect(r.project).toBe('ai-media-automation')
    expect(projScope(lastMain(queries))?.vals).toEqual(['p-prompt'])
    expect(r.rows.map(x => x.id)).toEqual(['l1'])
  })

  it('returns no data for a real project the user does not own', async () => {
    const { db, queries } = seedDb()
    const r = await fetchRecords(db, { domain: 'leads', project: 'someone-elses' }, OWNED)
    expect(r.note).toMatch(/åtkomst/)
    expect(r.rows).toEqual([])
    // only the projects-membership query ran; no leads query
    expect(queries.some(q => q.table === 'leads')).toBe(false)
  })

  it('unknown project name → no data', async () => {
    const { db } = seedDb()
    const r = await fetchRecords(db, { domain: 'leads', project: '!!!nope!!!' }, OWNED)
    expect(r.note).toMatch(/Okänt projekt/)
    expect(r.rows).toEqual([])
  })
})

describe('fetchRecords — filters, limit, truncation', () => {
  it('applies a whitelisted filter and drops disallowed key + value', async () => {
    const { db, queries } = seedDb()
    await fetchRecords(db, { domain: 'leads', filters: { status: 'qualified', bogus: 'x', status_bad: 'y' } }, OWNED)
    const q = lastMain(queries)
    expect(q.eqs.some(e => e.col === 'status' && e.val === 'qualified')).toBe(true)
    expect(q.eqs.some(e => e.col === 'bogus')).toBe(false)
  })

  it('drops a disallowed filter VALUE', async () => {
    const { db, queries } = seedDb()
    await fetchRecords(db, { domain: 'leads', filters: { status: 'totally-made-up' } }, OWNED)
    expect(lastMain(queries).eqs.some(e => e.col === 'status')).toBe(false)
  })

  it('caps limit at the domain maxLimit', async () => {
    const { db, queries } = seedDb()
    await fetchRecords(db, { domain: 'leads', limit: 9999 }, OWNED)
    expect(lastMain(queries).limit).toBe(25)
  })

  it('truncates configured free-text columns (memories.value)', async () => {
    const { db } = seedDb()
    const r = await fetchRecords(db, { domain: 'memories' }, OWNED)
    const val = r.rows[0].value as string
    expect(val.length).toBe(241) // 240 + ellipsis
    expect(val.endsWith('…')).toBe(true)
  })
})
