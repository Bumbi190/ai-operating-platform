/**
 * vNext Phase 14 — Pengar (`/revenue`).
 *
 * Four risks carry this surface, and the suite is organised around them:
 *
 *   1. PRINTING MONEY NOBODY RECORDED. The page this replaces showed a monthly
 *      revenue of 0 kr from an EMPTY table, a net profit and a per-project ROI
 *      from that empty table and a hard-coded 10.5 SEK/USD, a month-end forecast,
 *      week-over-week growth, share-of-spend percentages, and a lead pipeline
 *      whose query selected columns that do not exist. Every figure here must be
 *      a recorded value, the gate's own value, or an explicit absence.
 *
 *   2. IMPLYING PROTECTION. It also drew a budget bar against a hard-coded $100.
 *      Real limits exist, but `H1_SPEND_GATE` is not declared in production, so
 *      the gate is advisory. A limit shown without that sentence reads as a
 *      control that does not exist.
 *
 *   3. LEAKING ACROSS THE OWNER BOUNDARY. `cost_events` and every budget function
 *      are service-role only, so this read cannot be RLS-bound. The scope has to
 *      land inside every query AND in the assembler. `budget_headroom` returns
 *      every project, and a GLOBAL scope's `spent` is summed across all of them.
 *
 *   4. LOSING THE ROLLBACK. `?ui=legacy` must render the previous body exactly —
 *      unsupported figures included — pinned by hash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  assembleMoney,
  isPricingFallback,
  stockholmMonthWindow,
  type AssembleMoneyInput,
  type MoneyModel,
} from '@/lib/os/money'
import {
  ADVISORY_NOTE,
  COST_ESTIMATE_NOTE,
  ENFORCED_NOTE,
  ENFORCEMENT_LABELS,
  GLOBAL_CEILING_MISSING_NOTE,
  GLOBAL_CEILING_UNKNOWN_NOTE,
  GLOBAL_SCOPE_NOTE,
  MONEY_LIMITS,
  NOT_CALCULATED_LABEL,
  NOT_RECORDED_LABEL,
  PROFIT_NOTE,
  PROFIT_UNRECONCILED_NOTE,
  REVENUE_NOTE,
  UNREADABLE_LABEL,
} from '@/lib/os/money-shared'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import { destinationLabel } from '@/lib/nav/registry'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: `NEXT_REDIRECT;${to}` })
  },
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments explain which symbols this surface deliberately does NOT call, so
 *  every "must not reference" assertion reads the code without them. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MINE = '11111111-1111-1111-1111-111111111111'
const MINE2 = '33333333-3333-3333-3333-333333333333'
const THEIRS = '22222222-2222-2222-2222-222222222222'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const WINDOW = stockholmMonthWindow(NOW)

const projectRow = (id: string, slug: string, name: string) => ({ id, slug, name, color: '#123456' })

const costRow = (over: Record<string, unknown> = {}) => ({
  project_id: MINE,
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  agent: 'Script Writer',
  operation: 'Generate Script',
  unit_type: 'tokens',
  units: 1027,
  cost_sek: 1.25,
  created_at: '2026-09-10T08:00:00.000Z',
  ...over,
})

const headroomRow = (over: Record<string, unknown> = {}) => ({
  project_id: MINE,
  slug: 'mitt-projekt',
  scope: 'project_monthly',
  limit_sek: 700,
  spent_sek: 99.64,
  held_sek: 0,
  remaining_sek: 600.36,
  ...over,
})

/** What `budget_headroom` emits for every project when all three platform ceilings exist. */
const globals = (project_id: string) =>
  ['global_daily', 'global_weekly', 'global_monthly'].map((scope) =>
    headroomRow({ project_id, scope, limit_sek: 1500, spent_sek: 99.64, remaining_sek: 1400.36 }))

const input = (over: Partial<AssembleMoneyInput> = {}): AssembleMoneyInput => ({
  scopeIds: [MINE, MINE2],
  projects: {
    ok: true,
    rows: [projectRow(MINE, 'mitt-projekt', 'Mitt Projekt'), projectRow(MINE2, 'andra', 'Andra Projektet')],
  },
  costs: { ok: true, rows: [costRow()] },
  headroom: {
    ok: true,
    rows: [
      headroomRow(),
      headroomRow({ project_id: MINE2, slug: 'andra', limit_sek: 300, spent_sek: 0, held_sek: 0, remaining_sek: 300 }),
      ...globals(MINE),
      ...globals(MINE2),
    ],
  },
  revenue: { ok: true, count: 0 },
  leads: { ok: true, total: 3, withValue: 0 },
  overrides: { ok: true, rows: [], count: 0 },
  enforced: false,
  window: WINDOW,
  projectSlug: null,
  ...over,
})

const render = async (model: MoneyModel) => {
  const { MoneyOverview } = await import('@/components/platform/vnext/MoneyOverview')
  return renderToStaticMarkup(React.createElement(MoneyOverview, { model }))
}

/** Rendered text only — hashed CSS-module class names carry digits of their own. */
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ')

/** The text of one fact tile. */
const fact = (html: string, id: string) =>
  textOf(html.match(new RegExp(`data-fact="${id}"[^>]*>([\\s\\S]*?)</div>`))?.[1] ?? '')

/** One `<section>` by a distinguishing attribute. */
const section = (html: string, attr: string) => {
  const i = html.indexOf(attr)
  return i < 0 ? '' : html.slice(i, html.indexOf('</section>', i))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Revenue, profit and derived claims — absence stays absence
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · money nobody recorded is never printed', () => {
  it('unrecorded revenue says so, and is never an amount', async () => {
    const html = await render(assembleMoney(input()))
    expect(fact(html, 'revenue')).toContain(NOT_RECORDED_LABEL)
    expect(fact(html, 'revenue')).toContain(REVENUE_NOTE)
    expect(fact(html, 'revenue')).not.toMatch(/\d\s*kr/)
  })

  it('an unreadable revenue source is unreadable, not "not recorded"', async () => {
    const model = assembleMoney(input({ revenue: { ok: false, count: null } }))
    expect(model.revenue.events).toBeNull()
    const html = await render(model)
    expect(fact(html, 'revenue')).toContain(UNREADABLE_LABEL)
    expect(fact(html, 'revenue')).not.toContain(NOT_RECORDED_LABEL)
  })

  it('profit is never a number', async () => {
    const html = await render(assembleMoney(input()))
    expect(fact(html, 'profit')).toContain(NOT_CALCULATED_LABEL)
    expect(fact(html, 'profit')).toContain(PROFIT_NOTE)
    expect(fact(html, 'profit')).not.toMatch(/\d/)
  })

  it('recorded revenue events still do not produce a profit — and say why', async () => {
    const html = await render(assembleMoney(input({ revenue: { ok: true, count: 2 } })))
    expect(fact(html, 'revenue')).toContain('2 registrerade')
    expect(fact(html, 'revenue')).not.toMatch(/\d\s*kr/)
    expect(fact(html, 'profit')).toContain(PROFIT_UNRECONCILED_NOTE)
    expect(fact(html, 'profit')).not.toMatch(/\d/)
  })

  it('prints no forecast, growth, ROI, net profit, percentage or budget bar', async () => {
    const html = await render(assembleMoney(input({
      costs: { ok: true, rows: [costRow(), costRow({ provider: 'ideogram', unit_type: 'images', model: 'ideogram-v3', cost_sek: 3 })] },
    })))
    expect(html).not.toMatch(/Prognos|prognos|Nettoprofit|\bROI\b|tillväxt|ökade|minskade|%|Budgetvarning|progressbar/)
  })

  it('calls cost an estimate and never an actual or invoiced amount', async () => {
    const html = await render(assembleMoney(input()))
    expect(fact(html, 'cost')).toContain('Beräknad kostnad')
    expect(html).toContain(COST_ESTIMATE_NOTE)
    expect(html).not.toMatch(/faktisk kostnad/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · The ledger — owned rows, recorded values, honest totals
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · the ledger total is owned, recorded and honest about gaps', () => {
  it('the total is the sum of owned rows as recorded', () => {
    const model = assembleMoney(input({
      costs: { ok: true, rows: [costRow({ cost_sek: 1.25 }), costRow({ project_id: MINE2, cost_sek: 2.5 })] },
    }))
    expect(model.cost.totalSek).toBeCloseTo(3.75, 10)
    expect(model.cost.rows).toBe(2)
  })

  it('foreign and platform-level rows never move a total or a breakdown', () => {
    const model = assembleMoney(input({
      costs: { ok: true, rows: [
        costRow({ cost_sek: 1.25 }),
        costRow({ project_id: THEIRS, cost_sek: 987_654, agent: 'SECRET-AGENT' }),
        costRow({ project_id: null, cost_sek: 41, agent: 'PLATFORM-AGENT' }),
      ] },
    }))
    expect(model.cost.totalSek).toBeCloseTo(1.25, 10)
    expect(model.cost.byProject.map((l) => l.key)).toEqual([MINE])
    expect(model.cost.byAgent.map((l) => l.label)).not.toContain('SECRET-AGENT')
    expect(model.cost.byAgent.map((l) => l.label)).not.toContain('PLATFORM-AGENT')
  })

  it('an unreadable ledger is unknown, not zero', async () => {
    const model = assembleMoney(input({ costs: { ok: false, rows: [] } }))
    expect(model.cost.totalSek).toBeNull()
    const html = await render(model)
    expect(fact(html, 'cost')).toContain(UNREADABLE_LABEL)
    expect(fact(html, 'cost')).not.toMatch(/0,00/)
  })

  it('rows handed in beside ok:false are never counted', () => {
    const model = assembleMoney(input({ costs: { ok: false, rows: [costRow({ cost_sek: 500 })] } }))
    expect(model.cost.totalSek).toBeNull()
    expect(model.cost.rows).toBe(0)
    expect(model.cost.byProvider).toEqual([])
  })

  it('a read that reached its cap is labelled incomplete', async () => {
    const rows = Array.from({ length: MONEY_LIMITS.costRows }, (_, i) =>
      costRow({ cost_sek: 0.01, created_at: `2026-09-10T08:${String(i % 60).padStart(2, '0')}:00.000Z` }))
    const model = assembleMoney(input({ costs: { ok: true, rows } }))
    expect(model.cost.truncated).toBe(true)
    expect(fact(await render(model), 'cost')).toContain('ofullständig')
  })

  it('an uncapped read is not labelled incomplete', () => {
    expect(assembleMoney(input()).cost.truncated).toBe(false)
  })

  it('breakdowns are absolute kronor, largest first', () => {
    const model = assembleMoney(input({
      costs: { ok: true, rows: [
        costRow({ provider: 'anthropic', cost_sek: 1 }),
        costRow({ provider: 'ideogram', unit_type: 'images', model: 'ideogram-v3', cost_sek: 5 }),
        costRow({ provider: 'anthropic', cost_sek: 2 }),
      ] },
    }))
    expect(model.cost.byProvider.map((l) => [l.key, l.sek, l.rows])).toEqual([['ideogram', 5, 1], ['anthropic', 3, 2]])
  })

  it('an agent label falls back to the operation, then to "not recorded"', async () => {
    const model = assembleMoney(input({
      costs: { ok: true, rows: [
        costRow({ agent: null, operation: 'Analyze News' }),
        costRow({ agent: null, operation: null, cost_sek: 0.5 }),
      ] },
    }))
    expect(model.cost.byAgent.map((l) => l.label)).toEqual(['Analyze News', null])
    expect(section(await render(model), 'data-section="agents"')).toContain(NOT_RECORDED_LABEL)
  })

  it('recent rows are newest first and capped', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      costRow({ created_at: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T0${i % 10}:00:00.000Z` }))
    const model = assembleMoney(input({ costs: { ok: true, rows } }))
    expect(model.cost.recent).toHaveLength(MONEY_LIMITS.recentRows)
    const ats = model.cost.recent.map((e) => e.at!)
    expect([...ats].sort().reverse()).toEqual(ats)
  })

  it('sub-öre amounts are shown as such, not rounded to zero', async () => {
    const { formatSek } = await import('@/components/platform/vnext/MoneyOverview')
    expect(formatSek(0.0012)).toBe('< 0,01 kr')
    expect(formatSek(null)).toBe('Okänt')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Provider attribution — fallback pricing is flagged, not trusted
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · a row priced by fallback is flagged', () => {
  it('a token row whose model is outside the price table is flagged', () => {
    // Production holds ten of these: an OpenAI TTS model booked under Anthropic.
    expect(isPricingFallback(costRow({ model: 'gpt-4o-mini-tts' }))).toBe(true)
  })

  it('a priced model is not flagged', () => {
    expect(isPricingFallback(costRow({ model: 'claude-haiku-4-5-20251001' }))).toBe(false)
  })

  it('character and image rows are priced from cost_rates and are not judged here', () => {
    expect(isPricingFallback(costRow({ provider: 'elevenlabs', unit_type: 'characters', model: 'tts' }))).toBe(false)
    expect(isPricingFallback(costRow({ provider: 'ideogram', unit_type: 'images', model: 'ideogram-v3' }))).toBe(false)
  })

  it('a row with no model cannot be judged and is not flagged', () => {
    expect(isPricingFallback(costRow({ model: null }))).toBe(false)
  })

  it('an inherited property of the price table is not a price', () => {
    expect(isPricingFallback(costRow({ model: 'constructor' }))).toBe(true)
    expect(isPricingFallback(costRow({ model: 'toString' }))).toBe(true)
  })

  it('flagged rows raise attention and carry a visible tag', async () => {
    const model = assembleMoney(input({ costs: { ok: true, rows: [costRow({ model: 'gpt-4o-mini-tts' })] } }))
    expect(model.attention).toContainEqual({ kind: 'pricing_fallback', rows: 1 })
    expect(await render(model)).toContain('Reservprissatt')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Budgets — the gate's own figures, owned project scopes only
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · budget figures are the gate\'s, never recomputed', () => {
  it('limit, spent, held and remaining pass through verbatim', () => {
    // Remaining deliberately disagrees with limit - spent - held: arithmetic here
    // would be a second budget authority, and the gate's answer must win.
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [headroomRow({ limit_sek: 700, spent_sek: 99.64, held_sek: 3, remaining_sek: 123.45 })] },
    }))
    expect(model.budgets[0].scopes[0]).toMatchObject({ limitSek: 700, spentSek: 99.64, heldSek: 3, remainingSek: 123.45 })
  })

  it('exhausted means nothing left, exactly', () => {
    const at = (remaining_sek: number) =>
      assembleMoney(input({ headroom: { ok: true, rows: [headroomRow({ remaining_sek })] } })).budgets[0].scopes[0].exhausted
    expect(at(0)).toBe(true)
    expect(at(-5)).toBe(true)
    expect(at(0.01)).toBe(false)
  })

  it('global scopes never surface — their spend is summed across every project', () => {
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [
        headroomRow(),
        headroomRow({ scope: 'global_monthly', limit_sek: 1500, spent_sek: 987_794, remaining_sek: -986_294 }),
      ] },
    }))
    const scopes = model.budgets.flatMap((b) => b.scopes.map((s) => s.scope))
    expect(scopes.every((s) => s.startsWith('project_'))).toBe(true)
    expect(model.attention.some((a) => a.kind === 'budget_exhausted')).toBe(false)
  })

  it('a foreign project\'s budget never surfaces', () => {
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [headroomRow(), headroomRow({ project_id: THEIRS, slug: 'theirs', limit_sek: 5_000_000 })] },
    }))
    expect(model.budgets.map((b) => b.project.id)).not.toContain(THEIRS)
    expect(model.unbudgeted.map((p) => p.id)).not.toContain(THEIRS)
  })

  it('a figure the gate did not report is not invented as zero', () => {
    const model = assembleMoney(input({ headroom: { ok: true, rows: [headroomRow({ remaining_sek: null })] } }))
    expect(model.budgets.find((b) => b.project.id === MINE)).toBeUndefined()
  })

  it('an owned project with only global rows has no budget, and that needs attention', () => {
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [headroomRow(), headroomRow({ project_id: MINE2, slug: 'andra', scope: 'global_monthly' })] },
    }))
    expect(model.unbudgeted.map((p) => p.id)).toEqual([MINE2])
    expect(model.attention).toContainEqual(expect.objectContaining({ kind: 'project_without_budget' }))
  })

  it('the gate keys "no budget" on the monthly limit — daily and weekly alone are still refused', () => {
    // budget_reserve: exists(project_budgets where monthly_sek is not null).
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [
        headroomRow(),
        headroomRow({ project_id: MINE2, slug: 'andra', scope: 'project_daily', limit_sek: 20 }),
        headroomRow({ project_id: MINE2, slug: 'andra', scope: 'project_weekly', limit_sek: 35 }),
      ] },
    }))
    expect(model.unbudgeted.map((p) => p.id)).toEqual([MINE2])
    // The limits the gate reported are still shown; they just do not make it a budget.
    expect(model.budgets.find((b) => b.project.id === MINE2)!.scopes.map((s) => s.scope))
      .toEqual(['project_daily', 'project_weekly'])
  })

  it('a configured monthly limit is a budget even if one of its figures was not reported', () => {
    const model = assembleMoney(input({ headroom: { ok: true, rows: [headroomRow({ remaining_sek: null })] } }))
    expect(model.unbudgeted.map((p) => p.id)).not.toContain(MINE)
  })

  it('"no budget" is never claimed when the gate could not be read', () => {
    const model = assembleMoney(input({ headroom: { ok: false, rows: [] } }))
    expect(model.unbudgeted).toEqual([])
    expect(model.attention).toContainEqual({ kind: 'source_unreadable', source: 'budgets' })
  })

  it('scopes are ordered day, week, month', () => {
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [
        headroomRow({ scope: 'project_monthly' }),
        headroomRow({ scope: 'project_daily', limit_sek: 100 }),
        headroomRow({ scope: 'project_weekly', limit_sek: 400 }),
      ] },
    }))
    expect(model.budgets.find((b) => b.project.id === MINE)!.scopes.map((s) => s.scope))
      .toEqual(['project_daily', 'project_weekly', 'project_monthly'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Enforcement — stated wherever a limit appears
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · a limit is never shown as protection it does not give', () => {
  it('the enforcement vocabulary is exactly these two words', () => {
    expect(ENFORCEMENT_LABELS).toEqual({ advisory: 'Rådgivande', enforced: 'Verkställs' })
  })

  it('the flag being off is advisory', () => {
    expect(assembleMoney(input({ enforced: false })).enforcement).toBe('advisory')
  })

  it('the controls panel states enforcement beside the limits', async () => {
    const controls = section(await render(assembleMoney(input())), 'data-controls="true"')
    expect(controls).toContain(ENFORCEMENT_LABELS.advisory)
    expect(controls).toContain(ADVISORY_NOTE)
    expect(controls).toContain('Kvar enligt grinden')
  })

  it('advisory mode never claims calls are refused', async () => {
    const html = await render(assembleMoney(input({
      headroom: { ok: true, rows: [headroomRow({ remaining_sek: -1 })] },
    })))
    expect(html).not.toContain(ENFORCED_NOTE)
    expect(html).not.toContain('Nya anrop nekas')
    expect(html).toContain('nya anrop genomförs ändå')
  })

  it('enforced mode says so — and only then that calls are refused', async () => {
    const html = await render(assembleMoney(input({
      enforced: true,
      headroom: { ok: true, rows: [headroomRow({ remaining_sek: -1 })] },
    })))
    expect(section(html, 'data-controls="true"')).toContain(ENFORCED_NOTE)
    expect(html).not.toContain(ADVISORY_NOTE)
    expect(html).toContain('Nya anrop nekas')
  })

  it('recorded advisory overrides raise attention', () => {
    const model = assembleMoney(input({ overrides: { ok: true, rows: [], count: 2 } }))
    expect(model.attention).toContainEqual({ kind: 'advisory_overrides', count: 2 })
  })

  it('an unreadable override count claims nothing', async () => {
    const model = assembleMoney(input({ overrides: { ok: false, rows: [], count: null } }))
    expect(model.overrides.count).toBeNull()
    const html = await render(model)
    expect(html).toContain('Rådgivande undantag: kunde inte läsas.')
    expect(html).not.toContain('Inga rådgivande undantag')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5b · Platform ceilings — the gate refuses every project without all three
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · the platform ceilings the gate requires', () => {
  it('all three present is configured, and the note says so', async () => {
    const model = assembleMoney(input())
    expect(model.globalCeilings).toBe('configured')
    expect(model.attention.some((a) => a.kind === 'global_ceiling_missing')).toBe(false)
    expect(section(await render(model), 'data-controls="true"')).toContain(GLOBAL_SCOPE_NOTE)
  })

  it('any one missing is missing — the gate would refuse every project', async () => {
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [headroomRow(), headroomRow({ scope: 'global_monthly', limit_sek: 1500 })] },
    }))
    expect(model.globalCeilings).toBe('missing')
    expect(model.attention).toContainEqual({ kind: 'global_ceiling_missing' })
    expect(section(await render(model), 'data-controls="true"')).toContain(GLOBAL_CEILING_MISSING_NOTE)
  })

  it('an unreadable gate is unknown, never configured and never missing', async () => {
    const model = assembleMoney(input({ headroom: { ok: false, rows: [] } }))
    expect(model.globalCeilings).toBe('unknown')
    expect(model.attention.some((a) => a.kind === 'global_ceiling_missing')).toBe(false)
    expect(section(await render(model), 'data-controls="true"')).toContain(GLOBAL_CEILING_UNKNOWN_NOTE)
  })

  it('an unreadable project list is unknown too', () => {
    expect(assembleMoney(input({ projects: { ok: false, rows: [] } })).globalCeilings).toBe('unknown')
  })

  it('a session that owns nothing cannot judge it', () => {
    const model = assembleMoney(input({
      scopeIds: [IMPOSSIBLE_PROJECT_ID],
      projects: { ok: true, rows: [] },
      headroom: { ok: true, rows: [...globals(THEIRS)] },
    }))
    expect(model.globalCeilings).toBe('unknown')
  })

  it('a foreign project\'s rows never count toward presence', () => {
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [headroomRow(), ...globals(THEIRS)] },
    }))
    expect(model.globalCeilings).toBe('missing')
  })

  it('presence is all it reads — a global scope\'s platform-wide spend is never shown', async () => {
    const { formatSek } = await import('@/components/platform/vnext/MoneyOverview')
    const model = assembleMoney(input({
      headroom: { ok: true, rows: [
        headroomRow(),
        ...['global_daily', 'global_weekly', 'global_monthly'].map((scope) =>
          headroomRow({ scope, limit_sek: 1500, spent_sek: 987_794.25, remaining_sek: -986_294.25 })),
      ] },
    }))
    const html = await render(model)
    expect(model.globalCeilings).toBe('configured')
    expect(html).not.toContain(formatSek(987_794.25))
    expect(html).not.toContain(formatSek(-986_294.25))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6 · The window — the gate's Stockholm calendar, DST included
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · the month is the gate\'s month', () => {
  it('September 2026 is bounded in Stockholm summer time', () => {
    expect(WINDOW).toEqual({
      monthKey: '2026-09',
      startUtc: '2026-08-31T22:00:00.000Z',
      endUtc: '2026-09-30T22:00:00.000Z',
    })
  })

  it('October crosses the DST change, so its two edges carry different offsets', () => {
    expect(stockholmMonthWindow(new Date('2026-10-15T12:00:00.000Z'))).toEqual({
      monthKey: '2026-10',
      startUtc: '2026-09-30T22:00:00.000Z',
      endUtc: '2026-10-31T23:00:00.000Z',
    })
  })

  it('a UTC instant already in the next Stockholm month belongs to that month', () => {
    expect(stockholmMonthWindow(new Date('2026-09-30T22:30:00.000Z')).monthKey).toBe('2026-10')
  })

  it('December rolls the year', () => {
    expect(stockholmMonthWindow(new Date('2026-12-20T12:00:00.000Z'))).toEqual({
      monthKey: '2026-12',
      startUtc: '2026-11-30T23:00:00.000Z',
      endUtc: '2026-12-31T23:00:00.000Z',
    })
  })

  it('reuses the one DST implementation rather than restating it', () => {
    const code = codeOnly(read('lib/os/money.ts'))
    expect(code).toMatch(/computeReleaseInstant\(/)
    expect(code).not.toMatch(/getTimezoneOffset|Date\.UTC|\+02:00|\+01:00/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Render
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · the rendered surface', () => {
  it('the loading state claims nothing about the data', async () => {
    const { MoneyOverviewLoading } = await import('@/components/platform/vnext/MoneyOverview')
    const html = renderToStaticMarkup(React.createElement(MoneyOverviewLoading))
    expect(textOf(html)).not.toMatch(/\d/)
    expect(html).toContain('Pengar')
  })

  it('a page that could read nothing says so instead of showing zero', async () => {
    const html = await render(assembleMoney(input({ costs: { ok: false, rows: [] }, headroom: { ok: false, rows: [] } })))
    expect(html).toContain('Varken kostnadsloggen eller budgetgrinden kunde läsas')
  })

  it('an empty ledger is a statement about scope, not about the platform', async () => {
    const html = await render(assembleMoney(input({ costs: { ok: true, rows: [] } })))
    expect(section(html, 'data-section="providers"')).toMatch(/den här sessionen äger/)
  })

  it('the destination is labelled Pengar', () => {
    expect(destinationLabel('revenue')).toBe('Pengar')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Generation — the rollback branch returns before the vNext read
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · generation branch', () => {
  beforeEach(() => { vi.resetModules() })

  const mountPage = async (cookie: string | null, searchParams: Record<string, unknown> = {}) => {
    const seen: Array<string | null | undefined> = []
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: (n: string) => (cookie && n === 'omnira_ui' ? { value: cookie } : undefined) }),
    }))
    vi.doMock('@/lib/os/money', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/os/money')>()),
      loadMoney: async ({ projectSlug }: { projectSlug?: string | null } = {}) => {
        seen.push(projectSlug)
        return assembleMoney(input())
      },
    }))
    vi.doMock('@/app/(platform)/revenue/RevenueLegacy', () => ({
      RevenueLegacy: () => React.createElement('div', null, 'LEGACY BODY'),
    }))
    const mod = await import('@/app/(platform)/revenue/page')
    const el = await mod.default({ searchParams } as never)
    const html = renderToStaticMarkup(el as React.ReactElement)
    return { html, seen }
  }

  it('legacy renders the moved body and never reaches the vNext loader', async () => {
    const { html, seen } = await mountPage('legacy')
    expect(html).toContain('LEGACY BODY')
    expect(seen).toHaveLength(0)
  })

  it('the default generation is vNext', async () => {
    const { html } = await mountPage(null)
    expect(html).not.toContain('LEGACY BODY')
  })

  it('the page branches before it constructs the loader', () => {
    const src = codeOnly(read('app/(platform)/revenue/page.tsx'))
    const branch = src.indexOf('<RevenueLegacy />')
    const load = src.indexOf('loadMoney(')
    expect(branch).toBeGreaterThan(-1)
    expect(load).toBeGreaterThan(branch)
  })

  it('?project= reaches the loader', async () => {
    // React's dev-time stack probing calls the loading component a second time
    // with no props, so every call is recorded and the real one asserted.
    const { seen } = await mountPage(null, { project: 'mitt-projekt' })
    expect(seen).toContain('mitt-projekt')
  })

  it('a repeated ?project= takes the first value', async () => {
    const { seen } = await mountPage(null, { project: ['mitt-projekt', 'andra'] })
    expect(seen).toContain('mitt-projekt')
    expect(seen).not.toContain('andra')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9 · The read — session-scoped, service-role, bounded
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · the loader', () => {
  beforeEach(() => {
    vi.doUnmock('@/lib/os/money')
    vi.doUnmock('next/headers')
    vi.doUnmock('@/app/(platform)/revenue/RevenueLegacy')
    vi.resetModules()
  })

  const seedTables = () => ({
    projects: [
      projectRow(MINE, 'mitt-projekt', 'Mitt Projekt'),
      projectRow(MINE2, 'andra', 'Andra Projektet'),
      projectRow(THEIRS, 'theirs', 'SECRET-PROJECT'),
    ],
    cost_events: [
      costRow({ project_id: MINE, cost_sek: 1.25, created_at: '2026-09-10T08:00:00.000Z' }),
      costRow({ project_id: MINE2, cost_sek: 2.5, created_at: '2026-09-11T08:00:00.000Z' }),
      costRow({ project_id: MINE, cost_sek: 7, created_at: '2026-08-20T08:00:00.000Z' }),
      costRow({ project_id: THEIRS, cost_sek: 987_654, agent: 'SECRET-AGENT', created_at: '2026-09-10T09:00:00.000Z' }),
      costRow({ project_id: null, cost_sek: 41, agent: 'PLATFORM-AGENT', created_at: '2026-09-10T10:00:00.000Z' }),
    ],
    revenue_events: [],
    leads: [{ id: 'l1', project_id: MINE, value_sek: null }, { id: 'l2', project_id: THEIRS, value_sek: 900_000 }],
    spend_advisory_overrides: [],
  })

  const HEADROOM = [
    headroomRow({ project_id: MINE, scope: 'project_monthly' }),
    headroomRow({ project_id: MINE, scope: 'global_monthly', limit_sek: 1500, spent_sek: 987_794, remaining_sek: -986_294 }),
    headroomRow({ project_id: THEIRS, slug: 'theirs', scope: 'project_monthly', limit_sek: 5_000_000 }),
  ]

  const fakeAdmin = (tables: Record<string, any[]>, fail: string[]) => {
    const calls: Array<{ table: string; ops: string[] }> = []
    const rpcs: Array<{ name: string; args: unknown }> = []
    const from = (table: string) => {
      const rec = { table, ops: [] as string[] }
      calls.push(rec)
      let rows = [...(tables[table] ?? [])]
      let head = false
      const q: any = {
        select: (_c: string, o?: { head?: boolean }) => { rec.ops.push('select'); head = !!o?.head; return q },
        in: (c: string, v: string[]) => { rec.ops.push(`in:${c}=${v.join(',')}`); rows = rows.filter((r) => v.includes(r[c])); return q },
        not: (c: string) => { rec.ops.push(`not:${c}`); rows = rows.filter((r) => r[c] != null); return q },
        gte: (c: string, v: string) => { rec.ops.push(`gte:${c}`); rows = rows.filter((r) => String(r[c]) >= v); return q },
        lt: (c: string, v: string) => { rec.ops.push(`lt:${c}`); rows = rows.filter((r) => String(r[c]) < v); return q },
        order: (c: string) => { rec.ops.push(`order:${c}`); return q },
        limit: (n: number) => { rec.ops.push(`limit:${n}`); rows = rows.slice(0, n); return q },
        then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(
            fail.includes(table)
              ? { data: null, error: { message: 'boom' } }
              : { data: head ? null : rows, count: rows.length, error: null },
          ).then(ok, err),
      }
      return q
    }
    const rpc = (name: string, args: unknown) => {
      rpcs.push({ name, args })
      return Promise.resolve({ data: HEADROOM, error: null })
    }
    return { db: { from, rpc }, calls, rpcs }
  }

  const mountLoader = async (o: {
    allowed?: string[]; slug?: string | null; fail?: string[]; spendGate?: boolean; accessOk?: boolean
  } = {}) => {
    const fake = fakeAdmin(seedTables(), o.fail ?? [])
    vi.doMock('@/lib/auth/project-access', () => ({
      resolveProjectAccess: async () =>
        o.accessOk === false
          ? { ok: false, response: null }
          : { ok: true, userId: 'user-me', allowedProjectIds: o.allowed ?? [MINE] },
    }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake.db }))
    vi.doMock('@/lib/ai/execution-flags', () => ({
      executionSafetyFlags: () => ({
        fencing: true, cancel: true, policy_gate: true, unified_executor: true, spend_gate: o.spendGate ?? false,
      }),
      unsafeExecutionFlags: () => [],
    }))
    const { loadMoney } = await import('@/lib/os/money')
    const model = await loadMoney({ projectSlug: o.slug ?? null, now: NOW })
    return { model, ...fake }
  }

  const opsFor = (calls: Array<{ table: string; ops: string[] }>, table: string) =>
    calls.filter((c) => c.table === table).map((c) => c.ops)

  it('returns null when the scope cannot be resolved', async () => {
    const { model, calls } = await mountLoader({ accessOk: false })
    expect(model).toBeNull()
    expect(calls).toEqual([])
  })

  it('scopes the ledger BEFORE its window, ordering and limit — and bounds the window above', async () => {
    const { calls } = await mountLoader()
    const [ops] = opsFor(calls, 'cost_events')
    const at = (op: string) => ops.findIndex((o) => o.startsWith(op))
    expect(ops).toContain(`in:project_id=${MINE}`)
    expect(at('in:project_id')).toBeLessThan(at('gte:created_at'))
    expect(at('gte:created_at')).toBeLessThan(at('order:created_at'))
    expect(at('order:created_at')).toBeLessThan(at('limit:'))
    expect(ops).toContain('lt:created_at')
    expect(ops).toContain(`limit:${MONEY_LIMITS.costRows}`)
  })

  it('every project-owned read carries the owned ids', async () => {
    const { calls } = await mountLoader()
    expect(opsFor(calls, 'projects')[0]).toContain(`in:id=${MINE}`)
    for (const table of ['cost_events', 'revenue_events', 'spend_advisory_overrides']) {
      expect(opsFor(calls, table)[0], table).toContain(`in:project_id=${MINE}`)
    }
    const leads = opsFor(calls, 'leads')
    expect(leads).toHaveLength(2)
    for (const ops of leads) expect(ops).toContain(`in:project_id=${MINE}`)
  })

  it('reads the gate through its own function, at the gate\'s staleness', async () => {
    const { rpcs } = await mountLoader()
    expect(rpcs).toEqual([{ name: 'budget_headroom', args: { p_stale_minutes: 30 } }])
  })

  it('foreign, platform-level and out-of-window money never reaches the model', async () => {
    const { model } = await mountLoader()
    expect(model!.cost.totalSek).toBeCloseTo(1.25, 10)
    expect(model!.cost.byAgent.map((l) => l.label)).not.toContain('SECRET-AGENT')
    expect(model!.cost.byAgent.map((l) => l.label)).not.toContain('PLATFORM-AGENT')
    expect(model!.budgets.map((b) => b.project.id)).toEqual([MINE])
    expect(model!.budgets[0].scopes.map((s) => s.scope)).toEqual(['project_monthly'])
  })

  it('a slug the session does not own narrows to nothing', async () => {
    const { model, calls } = await mountLoader({ slug: 'theirs' })
    expect(opsFor(calls, 'cost_events')[0]).toContain(`in:project_id=${IMPOSSIBLE_PROJECT_ID}`)
    expect(model!.cost.rows).toBe(0)
    expect(model!.budgets).toEqual([])
  })

  it('an owned slug narrows to that project only', async () => {
    const { model, calls } = await mountLoader({ allowed: [MINE, MINE2], slug: 'andra' })
    expect(opsFor(calls, 'cost_events')[0]).toContain(`in:project_id=${MINE2}`)
    expect(model!.cost.totalSek).toBeCloseTo(2.5, 10)
  })

  it('an empty allow-list fails closed, with no first-project fallback', async () => {
    const { model, calls } = await mountLoader({ allowed: [] })
    for (const table of ['cost_events', 'revenue_events', 'spend_advisory_overrides']) {
      expect(opsFor(calls, table)[0], table).toContain(`in:project_id=${IMPOSSIBLE_PROJECT_ID}`)
    }
    expect(model!.cost.rows).toBe(0)
    expect(model!.budgets).toEqual([])
  })

  it('enforcement is the runtime\'s answer', async () => {
    expect((await mountLoader({ spendGate: false })).model!.enforcement).toBe('advisory')
    vi.resetModules()
    expect((await mountLoader({ spendGate: true })).model!.enforcement).toBe('enforced')
  })

  it('a failing ledger read is unreadable, not zero', async () => {
    const { model } = await mountLoader({ fail: ['cost_events'] })
    expect(model!.cost.totalSek).toBeNull()
    expect(model!.attention).toContainEqual({ kind: 'source_unreadable', source: 'costs' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Static boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · boundaries the surface must not cross', () => {
  const LOADER = read('lib/os/money.ts')
  const SHARED = read('lib/os/money-shared.ts')
  const COMPONENT = read('components/platform/vnext/MoneyOverview.tsx')
  const all = [['loader', LOADER], ['component', COMPONENT], ['shared', SHARED]] as const

  it('writes nothing — no action, no mutation', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/'use server'|\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
    }
  })

  it('the only database function it calls is the gate\'s read', () => {
    const rpcNames = [...codeOnly(LOADER).matchAll(/rpc\(\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect(rpcNames).toEqual(['budget_headroom'])
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(
        /budget_reserve|budget_settle|budget_release|reserveSpend|settleSpend|releaseSpend|withGovernedSpend|recordAdvisoryOverride/,
      )
    }
  })

  it('re-prices nothing, and does not read the token estimate the legacy page used', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/calculateCost|getModelPricing|getRates|cost_rates|run_logs|MONTHLY_AI_BUDGET|10\.5/)
    }
  })

  it('reads no environment and exposes no flag value', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/process\.env|H1_SPEND_GATE|readMemoryFlags/)
    }
  })

  it('neither reads nor writes Memory, and does not trigger Dream', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/recordMemoryEvent|atlas\/memory|memory_events|runDreamCycleForProject|lib\/ai\/dream/)
    }
  })

  it('resolves the scope server-side and fails closed', () => {
    const code = codeOnly(LOADER)
    expect(code).toMatch(/resolveProjectAccess\(\)/)
    expect(code).toMatch(/if \(!access\.ok\) return null/)
    expect(code).toMatch(/scopeProjectFilter\(access\.allowedProjectIds\)/)
  })

  it('the shared half stays client-safe', () => {
    expect(codeOnly(SHARED)).not.toMatch(/server-only|supabase|createClient|from\('/)
  })

  it('the loader stays server-only', () => {
    expect(LOADER).toMatch(/^import 'server-only'/m)
  })

  it('the component is a server component, installs no handlers and draws no bars', () => {
    expect(COMPONENT).not.toMatch(/'use client'/)
    expect(codeOnly(COMPONENT)).not.toMatch(/addEventListener|onKeyDown|useEffect|useState|progressbar|width:\s*`/)
  })

  it('the stop authority is nowhere near this surface', () => {
    for (const [name, src] of all) {
      expect(codeOnly(src), name).not.toMatch(/PauseToggle|toggleAutomationPause|toggleProjectExecutionPause|automation_paused/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11 · Rollback — the legacy body is byte-identical, unsupported figures included
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · the rollback body is the body it replaced', () => {
  const LEGACY = read('app/(platform)/revenue/RevenueLegacy.tsx')

  it('is pinned by hash', () => {
    const body = LEGACY.slice(LEGACY.indexOf('import { createAdminClient }'))
    expect(createHash('sha256').update(body).digest('hex'))
      .toBe('53070889a81c45b54b4ff042e6ac73dd3bb496f20dcff4088ffa7a1498fdcae8')
  })

  it('keeps its own service-role reads and its CostIntelligence section', () => {
    expect(LEGACY).toMatch(/createAdminClient/)
    expect(LEGACY).toMatch(/getAllowedProjectIds/)
    expect(LEGACY).toMatch(/<CostIntelligence allowedProjectIds=\{allowedProjectIds\} \/>/)
    expect(read('app/(platform)/revenue/CostIntelligence.tsx')).toMatch(/export async function CostIntelligence/)
  })

  it('keeps the figures Phase 14 found unsupported — a rollback is not a fix', () => {
    expect(LEGACY).toMatch(/MONTHLY_AI_BUDGET_USD = 100/)
    expect(LEGACY).toMatch(/Nettoprofit/)
  })

  it('the segment config moved to the page, which owns it for both generations', () => {
    expect(LEGACY).not.toMatch(/export const dynamic/)
    expect(read('app/(platform)/revenue/page.tsx')).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12 · Layout
// ─────────────────────────────────────────────────────────────────────────────

describe('pengar · layout', () => {
  const CSS = read('components/platform/vnext/MoneyOverview.module.css')

  it('declares its own font, as the other vNext surfaces do', () => {
    expect(CSS).toMatch(/font-family: var\(--font-geist-sans\)/)
  })

  it('is sized in rem so the display-scale preference reaches it', () => {
    expect(CSS).not.toMatch(/font-size:\s*\d+px/)
  })

  it('never scrolls sideways — long text wraps instead', () => {
    expect(CSS).toMatch(/overflow-x: hidden/)
    expect(CSS).toMatch(/overflow-wrap: anywhere/)
  })

  it('aligns figures on tabular numerals', () => {
    expect(CSS).toMatch(/font-variant-numeric: tabular-nums/)
  })

  it('reflows on a phone and honours reduced motion', () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\)/)
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('keeps focus visible on every interactive element it owns', () => {
    expect(CSS).toMatch(/\.inspect:focus-visible/)
    expect(CSS).toMatch(/\.summary:focus-visible/)
  })
})
