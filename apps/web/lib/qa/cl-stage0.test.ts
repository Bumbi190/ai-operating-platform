/**
 * Cognitive Loop v1.0 — Stage 0, Commit 6: unit-test sweep (mapping §3 #6).
 *
 * The four mapped areas: hard/soft split · allocation truncation order ·
 * decision unification · reader isolation. Commits 1–5 already lock their
 * own contracts (cl-context-request / cl-readers / cl-latency /
 * cl-assembler / cl-shadow); this file locks the CROSS-cutting Stage-0
 * invariants those files only touch: the role split with a constraints
 * block present, `selectActiveDecisions` as the ONE decision channel, ①'s
 * per-table isolation belt, and the truncation-order ↔ soft-order
 * consistency law. Plus the Commit-5.1 attribution field.
 */
import { describe, it, expect } from 'vitest'
import { assembleContext, renderAssembledContext, ASSEMBLER_VERSION, type AssembledContext } from '@/lib/atlas/context/assembler'
import { computeShadowDiff } from '@/lib/atlas/context/shadow'
import { VolatilityCache } from '@/lib/atlas/context/volatility-cache'
import { SOFT_ORDER } from '@/lib/atlas/context/readers'
import { TRUNCATION_ORDER, STATIC_POLICY_VERSION } from '@/lib/atlas/context/allocation'
import { selectActiveDecisions, gatherAtlasContext } from '@/lib/atlas/context'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import type { ContextRequest } from '@/lib/atlas/context/request'

const NOW = '2026-07-02T12:00:00.000Z'

function baseReq(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return {
    scope: 'global', projectId: null, intents: ['revenue'],
    window: { since: '2026-06-25T12:00:00.000Z', until: NOW },
    view: null, modality: 'chat', outputBudget: 4096,
    ...overrides,
  }
}

// ── Hard/soft split (canonical §6.3: hard→system, soft→user) ─────────────────

describe('hard/soft split — renderAssembledContext with a constraints block present', () => {
  // The constraints reader lands in Stage 1; the renderer's role split is a
  // pure function of AssembledContext, so it is locked NOW with a fabricated
  // hard block — the cutover consumes an already-proven split.
  function fabricated(): AssembledContext {
    return {
      hard: {
        identity: 'Du är Atlas.',
        principles: '\n[PRINCIPER]\nHedra beslut.',
        constraints: { dimension: 'constraints', channel: 'hard', text: '\n\n[BESLUT]\n- Publicera aldrig utan granskning' },
      },
      soft: {
        operational: { dimension: 'operational', channel: 'soft', text: '[①]' },
        activeWork: null,
        view: { dimension: 'view', channel: 'soft', text: '[③]' },
        intelligence: null,
        memory: null,
      },
      allocation: { policyVersion: 'v1', modality: 'chat' },
      provenance: {
        generatedAt: NOW, contextRequest: baseReq(), blocksPresent: ['operational', 'view'],
        blocksDropped: [], cacheHits: [], assemblerVersion: ASSEMBLER_VERSION,
      },
    }
  }

  it('constraints render in SYSTEM, after identity + principles', () => {
    const { system } = renderAssembledContext(fabricated())
    expect(system).toBe('Du är Atlas.\n[PRINCIPER]\nHedra beslut.\n\n[BESLUT]\n- Publicera aldrig utan granskning')
  })

  it('soft blocks render in USER only — no soft content leaks into system, no hard into user', () => {
    const { system, user } = renderAssembledContext(fabricated())
    expect(user).toBe('[①][③]')
    expect(system).not.toContain('[①]')
    expect(user).not.toContain('[BESLUT]')
  })
})

// ── Allocation truncation order (§6.4) ────────────────────────────────────────

describe('truncation order — consistency law', () => {
  it('is exactly the truncatable soft dimensions in reverse soft order (volatile → stable)', () => {
    const truncatableSoft = SOFT_ORDER.filter(d => d !== 'operational')
    expect([...TRUNCATION_ORDER]).toEqual([...truncatableSoft].reverse())
  })
})

// ── Decision unification (Retrieval: selectActiveDecisions) ──────────────────

describe('decision unification — selectActiveDecisions is the one decision channel', () => {
  const row = (key: string, value: string, updated_at: string, source = 'operator') => ({ key, value, source, updated_at })

  it('supersedes by key: only the latest row per key survives', () => {
    const out = selectActiveDecisions([
      row('pricing', 'Gammal prissättning', '2026-06-01T00:00:00Z'),
      row('pricing', 'Ny prissättning', '2026-06-20T00:00:00Z'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('Ny prissättning')
  })

  it('sorts newest first and caps at 12', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(`k${i}`, `Beslut ${i}`, `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`))
    const out = selectActiveDecisions(rows)
    expect(out).toHaveLength(12)
    expect(out[0].text).toBe('Beslut 19') // newest first
  })

  it('truncates decision text at 200 chars and drops rows without key/value', () => {
    const long = 'x'.repeat(250)
    const out = selectActiveDecisions([
      row('long', long, '2026-06-20T00:00:00Z'),
      { key: '', value: 'no key', source: 'operator', updated_at: '2026-06-20T00:00:00Z' },
      { key: 'no-value', value: '', source: 'operator', updated_at: '2026-06-20T00:00:00Z' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('x'.repeat(200) + '…')
  })
})

// ── Reader isolation (① per-table belt; ②③ locked in cl-readers) ─────────────

describe('① operational isolation — every project-native read is scoped', () => {
  function trackingDb() {
    const scoped: { table: string; column: string; values: string[] }[] = []
    function builder(table: string) {
      const b: any = {
        select() { return b }, gte() { return b }, order() { return b }, limit() { return b },
        eq() { return b },
        in(column: string, values: string[]) { scoped.push({ table, column, values }); return b },
        then(resolve: (x: { data: any[]; error: null }) => void) { resolve({ data: [], error: null }) },
      }
      return b
    }
    return { db: { from: (t: string) => builder(t) }, scoped }
  }

  it('empty allow-list → EVERY table gatherAtlasContext touches is pinned to the impossible id', async () => {
    const { db, scoped } = trackingDb()
    await gatherAtlasContext(db, [])
    // Isolation scoping goes through .in('project_id' | 'id', …) — other .in()
    // calls (e.g. memories .in('source', …)) are content filters, not scope.
    const scope = scoped.filter(s => s.column === 'project_id' || s.column === 'id')
    const tables = [...new Set(scope.map(s => s.table))].sort()
    // The full ① read surface, each behind the isolation belt:
    expect(tables).toEqual(['approvals', 'cost_events', 'leads', 'media_scripts', 'memories', 'projects', 'revenue_events', 'runs'])
    for (const s of scope) expect(s.values, `${s.table}.${s.column}`).toEqual([IMPOSSIBLE_PROJECT_ID])
  })

  it('foreign project → zero rows end-to-end through the ① reader path', async () => {
    // Seedless tracking db returns no rows for the impossible id — the
    // composed context must degrade to zero everywhere, never leak.
    const { db } = trackingDb()
    const ctx = await gatherAtlasContext(db, [])
    expect(ctx.businesses).toEqual([])
    expect(ctx.decisions).toEqual([])
    expect(ctx.totals.costMonthSek).toBe(0)
  })
})

// ── Attribution (operator request, Commit 5.1) ────────────────────────────────

describe('shadow-log attribution', () => {
  it('every AssembledContext and ShadowDiff carries assembler + allocation-policy versions', async () => {
    const a = await assembleContext(baseReq(), { db: null, allowedProjectIds: ['p1'] }, {
      now: NOW, cache: new VolatilityCache(45_000), readers: {},
    })
    expect(a.provenance.assemblerVersion).toBe(ASSEMBLER_VERSION)
    const d = computeShadowDiff({ live: '', action: '', view: '' }, a, 1)
    expect(d.versions).toEqual({ assembler: ASSEMBLER_VERSION, allocationPolicy: STATIC_POLICY_VERSION })
  })
})
