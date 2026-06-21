/**
 * Tests for lib/atlas/signals.ts — Atlas Signal Platform interface.
 *
 * Mocks @/lib/supabase/admin with a chainable mock that captures the
 * call shape (insert payload, select columns, eq filters, order, limit)
 * and returns a configurable result. We verify:
 *
 *   • recordSignal sends the right insert and maps the returned row
 *   • recordSignal accepts contentId=null (forward-compat for global signals)
 *   • getLatestSignal builds the right query chain and handles empty results
 *   • getLatestSignalsPerKindForContent aggregates correctly client-side
 *   • DB column ↔ TS field mapping (snake_case ↔ camelCase) is correct
 *
 * We do NOT exercise the CHECK constraints (kind/version nonempty) — those
 * live in Postgres, not in our code, and are verified by the migration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock state ───────────────────────────────────────────────────────────────
interface InsertCall {
  table:   string
  payload: Record<string, unknown>
}

interface QueryCall {
  table:    string
  select?:  string
  eqs:      Array<{ col: string; val: unknown }>
  order?:   { col: string; opts?: { ascending: boolean } }
  limit?:   number
}

let insertCalls: InsertCall[] = []
let queryCalls:  QueryCall[]  = []
let insertReturn: { data: unknown; error: { message: string } | null } = { data: null, error: null }
let queryReturn:  { data: unknown; error: { message: string } | null } = { data: null, error: null }

// Chainable mock — every method returns `self` until a terminal awaits
// the configured queryReturn. .insert() returns a separate sub-chain.
function makeMockBuilder(table: string) {
  const qc: QueryCall = { table, eqs: [] }
  queryCalls.push(qc)

  const chain: any = {
    select: (cols?: string) => { qc.select = cols; return chain },
    eq:     (col: string, val: unknown) => { qc.eqs.push({ col, val }); return chain },
    order:  (col: string, opts?: { ascending: boolean }) => { qc.order = { col, opts }; return chain },
    limit:  (n: number) => { qc.limit = n; return chain },
    maybeSingle: async () => queryReturn,
    single:      async () => queryReturn,
    // Allow await directly on the chain (e.g. .order().then(…))
    then: (resolve: (v: unknown) => void) => resolve(queryReturn),
  }
  return chain
}

function makeInsertBuilder(table: string, payload: Record<string, unknown>) {
  insertCalls.push({ table, payload })
  const chain: any = {
    select: (_cols?: string) => chain,
    single: async () => insertReturn,
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (cols?: string) => {
        const b = makeMockBuilder(table)
        return b.select(cols)
      },
      insert: (payload: Record<string, unknown>) => makeInsertBuilder(table, payload),
    }),
  }),
}))

// Must come AFTER the mock so signals.ts loads the mocked admin client.
import {
  recordSignal,
  getLatestSignal,
  getLatestSignalsPerKindForContent,
} from '@/lib/atlas/signals'

describe('atlas-signals — recordSignal', () => {
  beforeEach(() => {
    insertCalls = []
    queryCalls  = []
    insertReturn = { data: null, error: null }
    queryReturn  = { data: null, error: null }
  })

  it('1. builds an insert with all four fields and returns the mapped record', async () => {
    insertReturn = {
      data: {
        id:          'sig-uuid-1',
        content_id:  'content-uuid-1',
        kind:        'impact_score',
        payload:     { value: 87, dimensions: [] },
        version:     'score-engine-1.0.0',
        produced_at: '2026-06-18T12:00:00Z',
      },
      error: null,
    }

    const rec = await recordSignal({
      contentId: 'content-uuid-1',
      kind:      'impact_score',
      payload:   { value: 87, dimensions: [] },
      version:   'score-engine-1.0.0',
    })

    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0].table).toBe('atlas_signals')
    expect(insertCalls[0].payload).toEqual({
      content_id: 'content-uuid-1',
      kind:       'impact_score',
      payload:    { value: 87, dimensions: [] },
      version:    'score-engine-1.0.0',
    })

    // Returned record uses camelCase
    expect(rec).toEqual({
      id:         'sig-uuid-1',
      contentId:  'content-uuid-1',
      kind:       'impact_score',
      payload:    { value: 87, dimensions: [] },
      version:    'score-engine-1.0.0',
      producedAt: '2026-06-18T12:00:00Z',
    })
  })

  it('2. accepts contentId=null cleanly (forward-compat for global signals)', async () => {
    insertReturn = {
      data: {
        id:          'sig-uuid-2',
        content_id:  null,
        kind:        'weekly_market_summary',
        payload:     { week: '2026-W24' },
        version:     'market-summary-0.1.0',
        produced_at: '2026-06-18T12:00:00Z',
      },
      error: null,
    }

    const rec = await recordSignal({
      contentId: null,
      kind:      'weekly_market_summary',
      payload:   { week: '2026-W24' },
      version:   'market-summary-0.1.0',
    })

    expect(insertCalls[0].payload.content_id).toBeNull()
    expect(rec.contentId).toBeNull()
  })

  it('3. throws a labeled error when the insert fails', async () => {
    insertReturn = { data: null, error: { message: 'duplicate key value' } }
    await expect(
      recordSignal({ contentId: 'x', kind: 'k', payload: {}, version: 'v' }),
    ).rejects.toThrow(/recordSignal failed/)
  })

  it('4. throws when the insert returns no row (defensive)', async () => {
    insertReturn = { data: null, error: null }
    await expect(
      recordSignal({ contentId: 'x', kind: 'k', payload: {}, version: 'v' }),
    ).rejects.toThrow(/returned no row/)
  })
})

describe('atlas-signals — getLatestSignal', () => {
  beforeEach(() => {
    insertCalls = []
    queryCalls  = []
    insertReturn = { data: null, error: null }
    queryReturn  = { data: null, error: null }
  })

  it('5. builds the right query chain (eq + eq + order desc + limit 1)', async () => {
    queryReturn = {
      data: {
        id:          'sig-uuid-5',
        content_id:  'content-A',
        kind:        'impact_score',
        payload:     { value: 91 },
        version:     'score-engine-1.0.0',
        produced_at: '2026-06-18T08:00:00Z',
      },
      error: null,
    }
    await getLatestSignal({ contentId: 'content-A', kind: 'impact_score' })

    expect(queryCalls).toHaveLength(1)
    expect(queryCalls[0].table).toBe('atlas_signals')
    expect(queryCalls[0].select).toContain('produced_at')
    expect(queryCalls[0].eqs).toEqual([
      { col: 'content_id', val: 'content-A' },
      { col: 'kind',       val: 'impact_score' },
    ])
    expect(queryCalls[0].order).toEqual({ col: 'produced_at', opts: { ascending: false } })
    expect(queryCalls[0].limit).toBe(1)
  })

  it('6. returns null when no row exists', async () => {
    queryReturn = { data: null, error: null }
    const result = await getLatestSignal({ contentId: 'unknown', kind: 'impact_score' })
    expect(result).toBeNull()
  })

  it('7. maps row to camelCase SignalRecord when found', async () => {
    queryReturn = {
      data: {
        id:          'sig-7',
        content_id:  'c',
        kind:        'impact_score',
        payload:     { value: 76 },
        version:     'score-engine-1.0.0',
        produced_at: '2026-06-18T10:00:00Z',
      },
      error: null,
    }
    const rec = await getLatestSignal({ contentId: 'c', kind: 'impact_score' })
    expect(rec).toEqual({
      id:         'sig-7',
      contentId:  'c',
      kind:       'impact_score',
      payload:    { value: 76 },
      version:    'score-engine-1.0.0',
      producedAt: '2026-06-18T10:00:00Z',
    })
  })

  it('8. surfaces query errors with a labeled message', async () => {
    queryReturn = { data: null, error: { message: 'connection lost' } }
    await expect(
      getLatestSignal({ contentId: 'c', kind: 'impact_score' }),
    ).rejects.toThrow(/getLatestSignal failed/)
  })
})

describe('atlas-signals — getLatestSignalsPerKindForContent', () => {
  beforeEach(() => {
    insertCalls = []
    queryCalls  = []
    insertReturn = { data: null, error: null }
    queryReturn  = { data: null, error: null }
  })

  it('9. keeps the FIRST occurrence per kind (i.e. the latest, since we order DESC)', async () => {
    // Rows arrive sorted by produced_at DESC. For each kind, we want the
    // FIRST one we see (which is the latest in time).
    queryReturn = {
      data: [
        { kind: 'impact_score', payload: { value: 91 }, produced_at: '2026-06-18T10:00:00Z' },
        { kind: 'impact_score', payload: { value: 87 }, produced_at: '2026-06-17T10:00:00Z' },
        { kind: 'opportunity',  payload: { tam: 5e9 }, produced_at: '2026-06-15T10:00:00Z' },
        { kind: 'impact_score', payload: { value: 60 }, produced_at: '2026-06-10T10:00:00Z' },
      ],
      error: null,
    }
    const map = await getLatestSignalsPerKindForContent('content-X')

    expect(queryCalls).toHaveLength(1)
    expect(queryCalls[0].eqs).toEqual([{ col: 'content_id', val: 'content-X' }])
    expect(queryCalls[0].order).toEqual({ col: 'produced_at', opts: { ascending: false } })

    expect(map).toEqual({
      impact_score: { value: 91 },         // latest, not 87 or 60
      opportunity:  { tam: 5e9 },
    })
  })

  it('10. returns empty object when content has no signals', async () => {
    queryReturn = { data: [], error: null }
    const map = await getLatestSignalsPerKindForContent('content-no-signals')
    expect(map).toEqual({})
  })

  it('11. returns empty object when data is null (defensive)', async () => {
    queryReturn = { data: null, error: null }
    const map = await getLatestSignalsPerKindForContent('content-X')
    expect(map).toEqual({})
  })

  it('12. surfaces query errors with a labeled message', async () => {
    queryReturn = { data: null, error: { message: 'timeout' } }
    await expect(
      getLatestSignalsPerKindForContent('content-X'),
    ).rejects.toThrow(/getLatestSignalsPerKindForContent failed/)
  })
})
