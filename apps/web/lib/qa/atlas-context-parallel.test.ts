/**
 * gatherAtlasContext — concurrency without behaviour change.
 *
 * The latency audit measured cold Atlas context at 2.0–2.3 s and found the cause
 * inside this function: eight independent reads awaited one at a time, each a
 * round trip to a database on another continent. Nothing depended on anything,
 * so the chain was pure waiting.
 *
 * Making them concurrent is only safe if two things stay true, and both are the
 * point of this file: a single dead source must still degrade to its fallback
 * without taking the other seven with it, and the assembled output must not
 * depend on which query happens to finish first.
 *
 * The fake database here settles queries in a controlled order rather than after
 * real milliseconds, so nothing in this suite is timing-flaky.
 */

import { describe, expect, it } from 'vitest'
import { gatherAtlasContext } from '@/lib/atlas/context'

type Row = Record<string, unknown>

/**
 * A Supabase-shaped query builder that resolves when we say so.
 *
 * Every chainable method returns `this`, and the object is thenable — which is
 * exactly how the real client defers execution until awaited.
 */
function makeDb(opts: {
  rows?: Record<string, Row[]>
  reject?: string[]
  /** Called with the table name the moment that query is actually started. */
  onStart?: (table: string) => void
  /** Resolve each table only when its gate is released. */
  gates?: Record<string, Promise<void>>
}) {
  const { rows = {}, reject = [], onStart, gates } = opts
  const started: string[] = []

  return {
    started,
    from(table: string) {
      const builder: any = {
        __table: table,
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        in: () => builder,
        order: () => builder,
        then(resolve: (v: unknown) => void, rejectFn: (e: unknown) => void) {
          started.push(table)
          onStart?.(table)
          const settle = async () => {
            if (gates?.[table]) await gates[table]
            if (reject.includes(table)) throw new Error(`${table} is unavailable`)
            return { data: rows[table] ?? [] }
          }
          return settle().then(resolve, rejectFn)
        },
      }
      return builder
    },
  }
}

const FIXTURE: Record<string, Row[]> = {
  projects: [
    { id: 'p1', name: 'The Prompt', slug: 'ai-media-automation', color: '#111' },
    { id: 'p2', name: 'Familje-Stunden', slug: 'familje-stunden', color: '#222' },
  ],
  cost_events: [
    { project_id: 'p1', provider: 'openai', cost_sek: 100, created_at: new Date().toISOString() },
    { project_id: 'p2', provider: 'anthropic', cost_sek: 40, created_at: new Date().toISOString() },
  ],
  revenue_events: [{ project_id: 'p2', amount_sek: 354, occurred_at: new Date().toISOString() }],
  leads: [{ project_id: 'p2', status: 'qualified' }, { project_id: 'p2', status: 'warm' }],
  media_scripts: [
    { project_id: 'p1', status: 'published', published_at: new Date().toISOString() },
    { project_id: 'p1', status: 'pending_review', published_at: null },
  ],
  approvals: [{ id: 'a1' }, { id: 'a2' }],
  runs: [{ id: 'r1' }],
  memories: [],
}

const ALLOWED = ['p1', 'p2']

/** Everything except the wall-clock stamp, which is time-dependent by design. */
const stable = (ctx: Awaited<ReturnType<typeof gatherAtlasContext>>) => {
  const { generatedAt: _ignored, ...rest } = ctx
  return rest
}

describe('gatherAtlasContext · independent sources run concurrently', () => {
  it('starts every read before any of them has finished', async () => {
    // Each table is gated, so none can settle until we release it. If the reads
    // were still sequential, only the first would ever have started.
    const release: Record<string, () => void> = {}
    const gates: Record<string, Promise<void>> = {}
    for (const t of Object.keys(FIXTURE)) {
      gates[t] = new Promise<void>(r => { release[t] = r })
    }

    const db = makeDb({ rows: FIXTURE, gates })
    const pending = gatherAtlasContext(db as never, ALLOWED)

    // Let the microtask queue drain so every builder has been kicked off.
    await Promise.resolve()
    await Promise.resolve()

    expect(db.started.sort()).toEqual(Object.keys(FIXTURE).sort())
    expect(db.started).toHaveLength(8)

    Object.values(release).forEach(fn => fn())
    await pending
  })
})

describe('gatherAtlasContext · output does not depend on completion order', () => {
  it('produces identical context whichever query finishes first', async () => {
    const build = async (order: string[]) => {
      const release: Record<string, () => void> = {}
      const gates: Record<string, Promise<void>> = {}
      for (const t of Object.keys(FIXTURE)) gates[t] = new Promise<void>(r => { release[t] = r })

      const db = makeDb({ rows: FIXTURE, gates })
      const pending = gatherAtlasContext(db as never, ALLOWED)
      await Promise.resolve()
      for (const t of order) release[t]()
      return stable(await pending)
    }

    const forward = await build(Object.keys(FIXTURE))
    const reversed = await build([...Object.keys(FIXTURE)].reverse())

    expect(reversed).toEqual(forward)
  })

  it('keeps the canonical field shape and business ordering', async () => {
    const db = makeDb({ rows: FIXTURE })
    const ctx = await gatherAtlasContext(db as never, ALLOWED)

    // Businesses stay sorted by month cost, descending — p1 (100) before p2 (40).
    expect(ctx.businesses.map(b => b.slug)).toEqual(['ai-media-automation', 'familje-stunden'])
    expect(ctx.totals.costMonthSek).toBe(140)
    expect(ctx.totals.revenueMonthSek).toBe(354)
    expect(ctx.businesses[1].qualifiedLeads).toBe(2)
    expect(ctx.businesses[0].publishedThisWeek).toBe(1)
    expect(ctx.businesses[0].pendingReview).toBe(1)
    // 2 raw approvals + 1 pendingReview across businesses.
    expect(ctx.totals.pendingApprovals).toBe(3)
    expect(ctx.totals.failedRuns24h).toBe(1)
  })
})

describe('gatherAtlasContext · one dead source never takes the others with it', () => {
  it('degrades a single failed source to its fallback', async () => {
    const db = makeDb({ rows: FIXTURE, reject: ['revenue_events'] })
    const ctx = await gatherAtlasContext(db as never, ALLOWED)

    expect(ctx.totals.revenueMonthSek).toBe(0)          // the failed source
    expect(ctx.totals.costMonthSek).toBe(140)           // everything else intact
    expect(ctx.businesses).toHaveLength(2)
    expect(ctx.totals.failedRuns24h).toBe(1)
  })

  it('degrades several failed sources independently', async () => {
    const db = makeDb({ rows: FIXTURE, reject: ['revenue_events', 'leads', 'runs'] })
    const ctx = await gatherAtlasContext(db as never, ALLOWED)

    expect(ctx.totals.revenueMonthSek).toBe(0)
    expect(ctx.totals.failedRuns24h).toBe(0)
    expect(ctx.businesses.every(b => b.qualifiedLeads === 0)).toBe(true)
    // Surviving sources are untouched.
    expect(ctx.totals.costMonthSek).toBe(140)
    expect(ctx.businesses.map(b => b.name)).toEqual(['The Prompt', 'Familje-Stunden'])
  })

  it('still returns a usable context when every source fails', async () => {
    // The whole builder must not reject — that would erase the caller's context
    // block entirely, including everything assembled around it.
    const db = makeDb({ rows: FIXTURE, reject: Object.keys(FIXTURE) })
    const ctx = await gatherAtlasContext(db as never, ALLOWED)

    expect(ctx.businesses).toEqual([])
    expect(ctx.totals.costMonthSek).toBe(0)
    expect(ctx.topPriority).toBeNull()
    expect(ctx.decisions).toEqual([])
    expect(typeof ctx.generatedAt).toBe('string')
  })

  it('never rejects, which is what makes the concurrent launch safe', async () => {
    const db = makeDb({ rows: FIXTURE, reject: ['projects'] })
    await expect(gatherAtlasContext(db as never, ALLOWED)).resolves.toBeDefined()
  })
})

describe('gatherAtlasContext · scoping inputs are unchanged', () => {
  it('reads exactly the eight expected tables and no others', async () => {
    const db = makeDb({ rows: FIXTURE })
    await gatherAtlasContext(db as never, ALLOWED)

    expect([...db.started].sort()).toEqual([
      'approvals', 'cost_events', 'leads', 'media_scripts',
      'memories', 'projects', 'revenue_events', 'runs',
    ])
  })

  it('behaves the same when the caller owns no projects', async () => {
    const db = makeDb({ rows: FIXTURE })
    const ctx = await gatherAtlasContext(db as never, [])
    // Scoping is applied by applyProjectScope, not by this function; the point
    // here is that an empty allow-list changes nothing about the call shape.
    expect(db.started).toHaveLength(8)
    expect(ctx).toBeDefined()
  })
})
