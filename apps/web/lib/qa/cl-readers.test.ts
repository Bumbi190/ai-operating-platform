/**
 * Cognitive Loop v1.0 — Stage 0, Commit 2: reader registry + ①/②/③ readers.
 *
 * Locks the reader contract (Invariant E/F): `ContextRequest → block | null`,
 * never throws, self-scoped (empty allow-list → impossible id → zero rows),
 * bounded, no selection. Also locks the two deliberate ① differences vs the
 * legacy path: no [BESLUT] in ① (constraints are the HARD channel) and
 * verbatim view handling in ③ (flag gate preserved).
 *
 * Full-suite tests for allocation/truncation/decision-unification land in
 * CL Commit 6 per the mapping; this file covers what Commit 2 ships.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { CONTEXT_READERS, SOFT_ORDER } from '@/lib/atlas/context/readers'
import { readOperational, renderOperationalBlock } from '@/lib/atlas/context/readers/operational'
import { readActiveWork, renderInFlightRuns } from '@/lib/atlas/context/readers/active-work'
import { readView } from '@/lib/atlas/context/readers/view'
import { normalizeView, renderViewBlock } from '@/lib/atlas/view-context'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import type { ContextRequest } from '@/lib/atlas/context/request'
import type { AtlasContext } from '@/lib/atlas/context'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function baseReq(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return {
    scope: 'global',
    projectId: null,
    intents: ['revenue'],
    window: { since: '2026-06-24T12:00:00.000Z', until: '2026-07-01T12:00:00.000Z' },
    view: null,
    modality: 'chat',
    outputBudget: 4096,
    ...overrides,
  }
}

// Mock query builder in the established lib/qa style (action-memory.test.ts):
// records .in()/.eq() constraints, resolves rows from a seed at await time.
interface Q { table: string; select?: string; ins: { c: string; v: string[] }[]; eqs: { c: string; v: unknown }[] }
function makeDb(seed: Record<string, any[]> = {}) {
  const queries: Q[] = []
  function builder(table: string) {
    const st: Q = { table, ins: [], eqs: [] }
    const b: any = {
      select(c: string) { st.select = c; return b },
      in(c: string, v: string[]) { st.ins.push({ c, v }); return b },
      eq(c: string, v: unknown) { st.eqs.push({ c, v }); return b },
      gte() { return b },
      order() { return b },
      limit() { return b },
      then(resolve: (x: { data: any[]; error: null }) => void) {
        queries.push(st)
        let rows = (seed[st.table] ?? []).slice()
        for (const { c, v } of st.ins) rows = rows.filter((r: any) => c === 'status' ? v.includes(r[c]) : v.includes(r[c]))
        for (const { c, v } of st.eqs) rows = rows.filter((r: any) => r[c] === v)
        resolve({ data: rows, error: null })
      },
    }
    return b
  }
  return { db: { from: (t: string) => builder(t) }, queries }
}

const throwingDb = { from: () => { throw new Error('boom') } }

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString()

// ── Registry (Invariant E) ────────────────────────────────────────────────────

describe('reader registry', () => {
  it('fixes the soft composition order ①②③④⑤ (stable → volatile, never content-dependent)', () => {
    expect(SOFT_ORDER).toEqual(['operational', 'activeWork', 'view', 'intelligence', 'memory'])
  })
  it('registers exactly ①②③ in Stage 0 Commit 2 (④/⑤/constraints land in their mapped stages)', () => {
    expect(Object.keys(CONTEXT_READERS).sort()).toEqual(['activeWork', 'operational', 'view'])
    expect(CONTEXT_READERS.intelligence).toBeUndefined()
    expect(CONTEXT_READERS.memory).toBeUndefined()
    expect(CONTEXT_READERS.constraints).toBeUndefined()
  })
})

// ── ① Operational ─────────────────────────────────────────────────────────────

describe('① operational reader', () => {
  const ctx: AtlasContext = {
    generatedAt: '2026-07-01T12:00:00.000Z',
    totals: {
      costTodaySek: 12.4, costWeekSek: 80, costMonthSek: 240.6, forecastMonthSek: 480,
      revenueMonthSek: 1500, pendingApprovals: 2, failedRuns24h: 1,
    },
    byProvider: [],
    businesses: [{
      id: 'p1', name: 'The Prompt', slug: 'the-prompt', color: '#000', focus: '', principle: '',
      revenueMonthSek: 1000, costMonthSek: 200, qualifiedLeads: 3, publishedThisWeek: 2, pendingReview: 1,
    }],
    topPriority: { label: 'Granska 3 väntande godkännanden', href: '/approvals' },
    decisions: [{ key: 'd1', text: 'Publicera aldrig utan granskning', source: 'operator', updatedAt: '2026-06-30T10:00:00.000Z' }],
  }

  it('renders the [LIVE LÄGE] block with totals, businesses and top priority', () => {
    const text = renderOperationalBlock(ctx)
    expect(text).toContain('[LIVE LÄGE —')
    expect(text).toContain('Kostnad idag: 12 kr · denna månad: 241 kr (prognos 480 kr).')
    expect(text).toContain('- The Prompt: intäkt 1000 kr, kostnad 200 kr, 3 leads, 2 publicerat denna vecka, 1 att granska.')
    expect(text).toContain('Viktigaste åtgärden nu: Granska 3 väntande godkännanden.')
  })

  it('does NOT render [BESLUT] — decisions belong to the HARD constraints channel, injected once', () => {
    const text = renderOperationalBlock(ctx)
    expect(text).not.toContain('[BESLUT')
    expect(text).not.toContain('Publicera aldrig utan granskning')
  })

  it('carries decisions in meta (for Stage-1 constraints unification), unrendered', async () => {
    // gatherAtlasContext over an empty seed degrades every slice to zero — fine here.
    const { db } = makeDb({ projects: [], memories: [] })
    const block = await readOperational(baseReq(), { db, allowedProjectIds: ['p1'] })
    expect(block).not.toBeNull()
    expect(block!.dimension).toBe('operational')
    expect(block!.channel).toBe('soft')
    expect(Array.isArray(block!.meta!.decisions)).toBe(true)
  })

  it('never throws: a failing db degrades to null (absent block, not an error)', async () => {
    const block = await readOperational(baseReq(), { db: throwingDb, allowedProjectIds: ['p1'] })
    expect(block).toBeNull()
  })
})

// ── ② Active work ─────────────────────────────────────────────────────────────

describe('② active-work reader', () => {
  it('composes [SENASTE ÅTGÄRDER] + [PÅGÅENDE KÖRNINGAR] from the two declared sources', async () => {
    const { db } = makeDb({
      atlas_actions: [{ project_id: 'p1', action_type: 'dream_delegation', summary: 'Delegerade X', target_id: 't1', status: 'pending', created_at: iso(5) }],
      runs: [{ project_id: 'p1', id: 'r1', status: 'running', created_at: iso(3), workflows: { name: 'daily-brief' } }],
    })
    const block = await readActiveWork(baseReq(), { db, allowedProjectIds: ['p1'] })
    expect(block).not.toBeNull()
    expect(block!.text).toContain('[SENASTE ÅTGÄRDER')
    expect(block!.text).toContain('Delegerade X')
    expect(block!.text).toContain('[PÅGÅENDE KÖRNINGAR')
    expect(block!.text).toContain('- [running] daily-brief · id=r1')
    expect(block!.meta).toMatchObject({ hasRecentDelegation: true, inFlightCount: 1 })
  })

  it('self-scopes BOTH reads: empty allow-list → impossible project id on atlas_actions and runs', async () => {
    const { db, queries } = makeDb({ atlas_actions: [], runs: [] })
    await readActiveWork(baseReq(), { db, allowedProjectIds: [] })
    for (const table of ['atlas_actions', 'runs']) {
      const q = queries.find(q => q.table === table)
      expect(q, `${table} was queried`).toBeTruthy()
      const scope = q!.ins.find(i => i.c === 'project_id')
      expect(scope, `${table} scoped by project_id`).toBeTruthy()
      expect(scope!.v).toEqual([IMPOSSIBLE_PROJECT_ID])
    }
  })

  it('reads only non-terminal run states (bounded, no relevance judgment)', async () => {
    const { db, queries } = makeDb({ runs: [] })
    await readActiveWork(baseReq(), { db, allowedProjectIds: ['p1'] })
    const statusFilter = queries.find(q => q.table === 'runs')!.ins.find(i => i.c === 'status')
    expect(statusFilter!.v).toEqual(['pending', 'running', 'awaiting_approval'])
  })

  it('returns null when both halves are empty (absent block)', async () => {
    const { db } = makeDb({ atlas_actions: [], runs: [] })
    expect(await readActiveWork(baseReq(), { db, allowedProjectIds: ['p1'] })).toBeNull()
  })

  it('never throws: each half degrades independently on db failure', async () => {
    expect(await readActiveWork(baseReq(), { db: throwingDb, allowedProjectIds: ['p1'] })).toBeNull()
  })

  it('renderInFlightRuns marks pending as queued-not-started (honesty framing)', () => {
    const text = renderInFlightRuns([{ id: 'r2', status: 'pending', created_at: iso(1), workflows: null }])
    expect(text).toContain('"pending" är köad, inte startad')
    expect(text).toContain('- [pending] · id=r2')
  })
})

// ── ③ View ────────────────────────────────────────────────────────────────────

describe('③ view reader', () => {
  const envlope = { pathname: '/approvals', search: '?state=pending', selection: [{ domain: 'approval', id: 'a1', label: 'Post X' }] }
  const prevFlag = process.env.ATLAS_VIEW_AWARENESS
  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ATLAS_VIEW_AWARENESS
    else process.env.ATLAS_VIEW_AWARENESS = prevFlag
  })

  it('is gated by ATLAS_VIEW_AWARENESS exactly like the live path (off → null)', async () => {
    process.env.ATLAS_VIEW_AWARENESS = '0'
    const block = await readView(baseReq({ view: envlope }), { db: null, allowedProjectIds: [] })
    expect(block).toBeNull()
  })

  it('reuses normalizeView/renderViewBlock verbatim — byte-identical output', async () => {
    process.env.ATLAS_VIEW_AWARENESS = '1'
    const block = await readView(baseReq({ view: envlope }), { db: null, allowedProjectIds: [] })
    expect(block).not.toBeNull()
    expect(block!.text).toBe(renderViewBlock(normalizeView(envlope)!))
    expect(block!.meta!.normalizedView).toEqual(normalizeView(envlope))
  })

  it('returns null for an unusable envelope (no valid route) and for no view at all', async () => {
    process.env.ATLAS_VIEW_AWARENESS = '1'
    expect(await readView(baseReq({ view: { pathname: 'not-a-route' } }), { db: null, allowedProjectIds: [] })).toBeNull()
    expect(await readView(baseReq(), { db: null, allowedProjectIds: [] })).toBeNull()
  })
})
