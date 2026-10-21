import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import * as React from 'react'
import { createElement, isValidElement, Suspense, type ReactElement } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// vitest compiles JSX with the classic transform: components need React in scope.
;(globalThis as unknown as { React: typeof React }).React = React
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('admin client must not be created here') } }))
vi.mock('@/app/actions/automation', () => ({}))

const getProjectBySlug = vi.fn()
vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: (s: string) => getProjectBySlug(s) }))

const loadCommandCenter = vi.fn()
vi.mock('@/lib/os/project-command-center', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/os/project-command-center')>()
  return { ...actual, loadProjectCommandCenter: (p: unknown) => loadCommandCenter(p) }
})

const loadReport = vi.fn()
vi.mock('@/lib/atlas/project-analytics/handlarborsen-marketplace-read', () => ({
  loadHandlarborsenMarketplaceReport: (...a: unknown[]) => loadReport(...a),
}))
const loadTraffic = vi.fn()
vi.mock('@/lib/atlas/project-analytics/handlarborsen-posthog-traffic', () => ({
  loadHandlarborsenTraffic: (...a: unknown[]) => loadTraffic(...a),
}))
const candidateEnabled = vi.fn(() => false)
const loadCandidateMemory = vi.fn()
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service', () => ({
  candidateMemoryEnabled: () => candidateEnabled(),
  loadCandidateMemory: (...a: unknown[]) => loadCandidateMemory(...a),
}))

import { MARKETPLACE_METRIC_KEYS } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { MARKETPLACE_METRIC_DEFINITIONS, buildMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { ACTIVITY_KEYS, HEADLINE_KEYS, buildHandlarborsenOverview } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'
import { HandlarborsenOwnerBrief } from '@/components/platform/vnext/HandlarborsenOwnerBrief'
import { ProjectCommandCenter } from '@/components/platform/vnext/ProjectCommandCenter'

const HB_ID = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const NOW = new Date('2026-10-10T11:00:00.000Z')

function row(overrides: Record<string, unknown> = {}, metrics: Record<string, number | null> = {}, observedAt = '2026-10-10T10:22:00.000Z') {
  const base: Record<string, unknown> = {
    project_id: HB_ID, snapshot_date: '2026-10-10', observed_at: observedAt, captured_at: observedAt,
    schema_version: 1, window_hours: 24, completeness: 'complete', unavailable: {},
  }
  MARKETPLACE_METRIC_KEYS.forEach((k, i) => { base[k] = 501 + i })
  return { ...base, ...metrics, ...overrides }
}
const report = (rows: unknown[], now = NOW) => buildMarketplaceReport(rows, now)
const render = (r: ReturnType<typeof report>) =>
  renderToStaticMarkup(createElement(HandlarborsenOverview, { report: r, reportHref: '/projects/handlarborsen/marketplace' }))

describe('overview model', () => {
  it('headline (6) + activity (5) cover exactly the 11 metrics, once each', () => {
    expect(HEADLINE_KEYS).toHaveLength(6)
    expect(ACTIVITY_KEYS).toHaveLength(5)
    expect([...HEADLINE_KEYS, ...ACTIVITY_KEYS].sort()).toEqual([...MARKETPLACE_METRIC_KEYS].sort())
    for (const k of ACTIVITY_KEYS) expect(MARKETPLACE_METRIC_DEFINITIONS.find((d) => d.key === k)?.kind).toBe('window24h')
    for (const k of HEADLINE_KEYS) expect(MARKETPLACE_METRIC_DEFINITIONS.find((d) => d.key === k)?.kind).not.toBe('window24h')
  })

  it('takes every figure from the stored report, in order, with Swedish labels', () => {
    const m = buildHandlarborsenOverview(report([row()]))
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    expect(m.headline.map((i) => i.key)).toEqual([...HEADLINE_KEYS])
    expect(m.headline.map((i) => i.value)).toEqual(HEADLINE_KEYS.map((k) => 501 + MARKETPLACE_METRIC_KEYS.indexOf(k)))
    expect(m.activity.map((i) => i.value)).toEqual(ACTIVITY_KEYS.map((k) => 501 + MARKETPLACE_METRIC_KEYS.indexOf(k)))
    expect(m.headline[0].label).toBe('Registrerade företag')
  })

  it('shows time, freshness and quality', () => {
    const m = buildHandlarborsenOverview(report([row()]))
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    expect(m.meta.map((x) => x.label)).toEqual(['Uppmätt', 'Aktualitet', 'Datakvalitet'])
    expect(m.meta[1]).toMatchObject({ value: 'Aktuell', tone: 'ok' })
    expect(m.meta[2].value).toContain('Komplett · 11 av 11')
    expect(m.notices).toEqual([])
  })

  it('a null stays null with its reason; it is never turned into 0', () => {
    const m = buildHandlarborsenOverview(report([row({ completeness: 'partial', unavailable: { bids_total: 'query_failed', bids_last_24h: 'invalid_count' } }, { bids_total: null, bids_last_24h: null })]))
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    const bids = m.headline.find((i) => i.key === 'bids_total')!
    expect(bids).toMatchObject({ value: null, note: 'Kunde inte beräknas hos Handlarbörsen' })
    expect(m.activity.find((i) => i.key === 'bids_last_24h')).toMatchObject({ value: null, note: 'Ogiltigt värde från källan' })
    expect(m.notices[0].text).toContain('2 mätvärden saknas')
  })

  it('a genuine zero is a zero', () => {
    const m = buildHandlarborsenOverview(report([row({}, { bids_total: 0 })]))
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    expect(m.headline.find((i) => i.key === 'bids_total')!.value).toBe(0)
  })

  it('a report older than 26 h is flagged stale', () => {
    const m = buildHandlarborsenOverview(report([row()], new Date('2026-10-11T13:00:00.000Z')))
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    expect(m.meta[1]).toMatchObject({ value: 'Äldre än 26 tim', tone: 'warning' })
    expect(m.notices.some((n) => n.text.includes('26 tim'))).toBe(true)
    const fresh = buildHandlarborsenOverview(report([row()], new Date('2026-10-11T10:00:00.000Z')))
    if (fresh.kind !== 'kpi') throw new Error('expected kpi')
    expect(fresh.meta[1].tone).toBe('ok') // 23.6 h
  })

  it('one snapshot: no change text anywhere, and the history section says why', () => {
    const m = buildHandlarborsenOverview(report([row()]))
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    expect([...m.headline, ...m.activity].every((i) => i.note === null)).toBe(true)
    expect(m.historyText).toContain('bara en rapport')
    expect(m.historyText).toContain('ingen ökning eller minskning kan bedömas')
  })

  it('two snapshots: change appears on headline figures only, as words and sign, never on 24 h figures', () => {
    const m = buildHandlarborsenOverview(report([row({ snapshot_date: '2026-10-09' }, { companies_registered_total: 490 }), row()]))
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    expect(m.headline[0].note).toBe('+11 sedan 2026-10-09')
    expect(m.activity.every((i) => i.note === null)).toBe(true)
    expect(m.historyText).toContain('2 rapporter sparade')
  })

  it.each([
    ['no snapshot', [] as unknown[], 'Ingen rapport ännu'],
    ['corrupt latest', [row({ schema_version: 7 })], 'Senaste rapporten kunde inte verifieras'],
  ])('%s → one honest note and no figures', (_n, rows, title) => {
    const m = buildHandlarborsenOverview(report(rows))
    expect(m).toMatchObject({ kind: 'note', title })
    expect(render(report(rows))).not.toMatch(/>\s*\d+\s*</)
  })
})

describe('rendered overview', () => {
  it('uses the same verified candidate cue for KPI and no-data views, scoped to the proper role link', () => {
    const pending = {
      status: 'ok' as const, awaitingReview: 1,
      candidates: [{
        name: 'TradingSolutions D2D', host: 'tradingsolutions.se',
        officialUrl: 'https://www.tradingsolutions.se/d2d/',
        observedOn: '2026-10-15',
        relevance: 'Officiell B2B-auktionsplattform',
        provenance: 'independently_checked_official_website' as const,
        firstSeenAt: '2026-10-16T20:23:40.736Z',
        lifecycle: 'candidate_for_review' as const,
        foundedRecently: 'not_verified' as const,
        executable: false as const,
      }],
    }
    for (const rows of [[row()], []] as unknown[][]) {
      const html = renderToStaticMarkup(createElement(HandlarborsenOverview, {
        report: report(rows), reportHref: null,
        candidateMemory: pending, candidateMemoryEnabled: true,
        candidateAudience: 'owner',
      }))
      expect(html).toContain('1 konkurrentkandidat')
      expect(html).toContain('TradingSolutions D2D')
      expect(html).toContain('href="/projects/handlarborsen/competitors"')
      const hidden = renderToStaticMarkup(createElement(HandlarborsenOverview, {
        report: report(rows), reportHref: null,
        candidateMemory: pending, candidateMemoryEnabled: false,
      }))
      expect(hidden).not.toContain('1 konkurrentkandidat')
    }
    const collaborator = renderToStaticMarkup(createElement(HandlarborsenOverview, {
      report: report([row()]), reportHref: null,
      candidateMemory: pending, candidateMemoryEnabled: true,
      candidateAudience: 'collaborator',
    }))
    expect(collaborator).toContain('href="/organization/projects/handlarborsen/competitors"')
  })
  it('opts only this project into clearer KPI type in both data and no-data states', () => {
    expect(render(report([row()]))).toContain('data-prominent="true"')
    expect(render(report([]))).toContain('data-prominent="true"')
    const css = readFileSync(resolve(__dirname, '../../components/platform/vnext/KpiOverview.module.css'), 'utf8')
    expect(css).toContain(".overview[data-prominent='true']")
  })

  it('leads with big numbers, shows Okänt for null, links the full report and includes the saved-data visuals', () => {
    const html = render(report([row({ completeness: 'partial', unavailable: { vehicles_reserved: 'query_failed' } }, { vehicles_reserved: null })]))
    expect(html).toContain('Registrerade företag')
    expect(html).toContain('Aktivitet senaste 24 h')
    expect(html).toContain('Historisk utveckling')
    expect(html).toContain('href="/projects/handlarborsen/marketplace"')
    expect(html).toContain('Okänt')
    expect(html).toContain('id="hb-market-pulse"')
    expect(html).toContain('id="hb-executive-heading"')
    expect(html).toContain('Det viktigaste just nu')
    expect(html).toContain('Konkurrentbevakning')
    expect(html).toContain('href="/projects/handlarborsen/competitors"')
    expect(html.indexOf('id="hb-executive-heading"')).toBeLessThan(html.indexOf('id="hb-trend-companies"'))
    expect(html).toContain('Fördjupning · alla nyckeltal')
    expect(html).toContain('id="hb-trend-companies"')
    expect(html).toContain('id="hb-trend-vehicles"')
    expect(html).toContain('id="hb-trend-trading"')
    expect(html).not.toMatch(/<canvas|[↑↓▲▼]/)
  })
})

describe('project page', () => {
  // Warm the large RLS-scoped page module outside the first test's 5s budget.
  beforeAll(async () => { await import('@/app/(platform)/projects/[slug]/page') })
  const HB = { id: HB_ID, slug: 'handlarborsen', name: 'Handlarbörsen', color: '#2563EB', settings: {}, executionPaused: false, pausedAt: null, pausedReason: null }
  const OTHER = { ...HB, id: '22222222-2222-2222-2222-222222222222', slug: 'the-prompt', name: 'The Prompt' }

  async function loaded(project: typeof HB): Promise<ReactElement<{ overview?: unknown; briefing?: ReactElement; model: unknown }>> {
    getProjectBySlug.mockResolvedValue(project)
    const { default: Page } = await import('@/app/(platform)/projects/[slug]/page')
    const suspense = await Page({ params: { slug: project.slug } }) as ReactElement<{ children: ReactElement }>
    const child = suspense.props.children as ReactElement<{ project: unknown }>
    const typeFn = child.type as (p: unknown) => Promise<ReactElement<{ overview?: unknown; briefing?: ReactElement; model: unknown }>>
    const workspace = await typeFn(child.props)
    if (workspace.type !== Suspense) return workspace
    const reportChild = (workspace.props as unknown as { children: ReactElement }).children
    return (reportChild.type as typeof typeFn)(reportChild.props)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    loadCommandCenter.mockResolvedValue({ links: { marketplace: '/projects/handlarborsen/marketplace' } })
    loadReport.mockResolvedValue({ status: 'ok', report: report([row()]) })
    loadTraffic.mockResolvedValue(null)
    candidateEnabled.mockReturnValue(false)
  })

  it('Handlarbörsen: reads the report through the authorized reader and passes the overview above the workspace', async () => {
    const el = await loaded(HB)
    expect(el.type).toBe(ProjectCommandCenter)
    expect(isValidElement(el.props.overview)).toBe(true)
    expect(el.props.briefing?.type).toBe(HandlarborsenOwnerBrief)
    expect(el.props.briefing?.props.report).toBe((el.props.overview as ReactElement).props.report)
    expect(loadReport).toHaveBeenCalledTimes(1)
    expect(loadReport).toHaveBeenCalledWith(HB, { allowedProjectIds: [HB.id] })
    expect(loadCommandCenter).toHaveBeenCalledTimes(1) // workflows etc. are still loaded
    const fetch = vi.fn(() => { throw new Error('Evidence rendering must not fetch') })
    vi.stubGlobal('fetch', fetch)
    try {
      const overview = el.props.overview as ReactElement
      const markup = renderToStaticMarkup(React.cloneElement(overview, { now: NOW }))
      expect(markup).toContain('id="hb-atlas-evidence"')
      expect(markup).toContain('handlarborsen-insights-1.0.0')
      expect(fetch).not.toHaveBeenCalled()
      expect(loadReport).toHaveBeenCalledTimes(1)
      expect(loadTraffic).toHaveBeenCalledTimes(1) // existing traffic path only
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reads candidate memory only when its feature is enabled and the RLS project is Handlarbörsen', async () => {
    candidateEnabled.mockReturnValue(true)
    const candidateMemory = { status: 'ok', candidates: [], awaitingReview: 0 }
    loadCandidateMemory.mockResolvedValue(candidateMemory)
    const el = await loaded(HB)
    expect(loadCandidateMemory).toHaveBeenCalledOnce()
    expect((el.props.overview as ReactElement).props.candidateMemory).toBe(candidateMemory)
    expect((el.props.overview as ReactElement).props.candidateMemoryEnabled).toBe(true)
    loadCandidateMemory.mockClear()
    await loaded(OTHER)
    expect(loadCandidateMemory).not.toHaveBeenCalled()
  })

  it('streams the workspace without a brief while the shared report is pending', async () => {
    let resolveReport!: (value: unknown) => void
    loadReport.mockReturnValue(new Promise((resolve) => { resolveReport = resolve }))
    getProjectBySlug.mockResolvedValue(HB)
    const { default: Page } = await import('@/app/(platform)/projects/[slug]/page')
    const page = await Page({ params: { slug: HB.slug } }) as ReactElement<{ children: ReactElement }>
    const workspaceLoader = page.props.children
    const boundary = await (workspaceLoader.type as (p: unknown) => Promise<ReactElement>)(workspaceLoader.props)
    expect(boundary.type).toBe(Suspense)
    const { fallback, children } = boundary.props as { fallback: ReactElement; children: ReactElement }
    expect(fallback.type).toBe(ProjectCommandCenter)
    expect(fallback.props.model).toBeDefined()
    expect(fallback.props.briefing).toBeUndefined()
    expect(renderToStaticMarkup(fallback.props.overview)).not.toContain('hb-atlas-evidence')
    expect(isValidElement(fallback.props.overview)).toBe(true)
    resolveReport({ status: 'ok', report: report([row()]) })
    const final = await (children.type as (p: unknown) => Promise<ReactElement>)(children.props)
    expect(final.props.briefing.type).toBe(HandlarborsenOwnerBrief)
    expect(loadReport).toHaveBeenCalledTimes(1)
  })

  it('another project: no report read, no overview, nothing empty rendered', async () => {
    loadCommandCenter.mockResolvedValue({ links: { marketplace: null } })
    const el = await loaded(OTHER)
    expect(el.props.overview).toBeUndefined()
    expect(el.props.briefing).toBeUndefined()
    expect(loadReport).not.toHaveBeenCalled()
    expect(loadTraffic).not.toHaveBeenCalled()
  })

  it.each([
    ['right slug, wrong id', { ...HB, id: '33333333-3333-3333-3333-333333333333' }],
    ['right id, wrong slug', { ...HB, slug: 'handlarborsen-2' }],
    ['right id and slug, wrong name', { ...HB, name: 'Annat namn' }],
  ])('%s: treated as an ordinary project', async (_n, project) => {
    const el = await loaded(project)
    expect(el.props.overview).toBeUndefined()
    expect(el.props.briefing).toBeUndefined()
    expect(loadReport).not.toHaveBeenCalled()
    expect(loadTraffic).not.toHaveBeenCalled()
  })

  it('a refused read (not_permitted) shows no overview but the workspace still loads', async () => {
    loadReport.mockResolvedValue({ status: 'not_permitted' })
    const el = await loaded(HB)
    expect(el.props.overview).toBeUndefined()
    expect(el.props.briefing).toBeUndefined()
    expect(el.props.model).toBeDefined()
    expect(loadTraffic).not.toHaveBeenCalled()
    expect(loadReport).toHaveBeenCalledTimes(1)
  })

  it('an inaccessible project stops at the page auth gate before any report or provider read', async () => {
    getProjectBySlug.mockResolvedValue(null)
    const { default: Page } = await import('@/app/(platform)/projects/[slug]/page')
    await expect(Page({ params: { slug: HB.slug } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(loadReport).not.toHaveBeenCalled()
    expect(loadTraffic).not.toHaveBeenCalled()
    expect(loadCommandCenter).not.toHaveBeenCalled()
  })

  it('a corrupt report is authorized but renders no evidence panel or leaked values', async () => {
    loadReport.mockResolvedValue({ status: 'ok', report: report([row({ schema_version: 9 })]) })
    const el = await loaded(HB)
    const markup = renderToStaticMarkup(el.props.overview as ReactElement)
    expect(markup).not.toContain('hb-atlas-evidence')
    expect(markup).not.toContain('501')
    expect(loadReport).toHaveBeenCalledTimes(1)
  })

  it('the command center keeps every workspace section with and without the overview', () => {
    const model: any = {
      project: { id: 'x', name: 'N', slug: 's', color: '#000', href: '/projects/s', executionPaused: false, pausedAt: null, pausedReason: null },
      links: {}, activity: { activeRuns: 0, lastRun: { state: 'ok', at: null } },
      workflows: { state: 'ok', total: 0, items: [] }, instances: { state: 'ok', total: 0, items: [] },
      approvals: { state: 'ok', total: 0, items: [] }, runs: { state: 'ok', total: 0, items: [] },
      agents: { state: 'ok', total: 0, items: [] }, outputs: { state: 'ok', total: 0, items: [] },
    }
    const without = renderToStaticMarkup(createElement(ProjectCommandCenter, { model }))
    const withOverview = renderToStaticMarkup(createElement(ProjectCommandCenter, { model, overview: createElement('p', null, 'KPI-SLOT') }))
    for (const id of ['pcc-workflows', 'pcc-approvals', 'pcc-runs', 'pcc-agents', 'pcc-outputs']) {
      expect(without).toContain(id)
      expect(withOverview).toContain(id)
    }
    expect(without).not.toContain('Arbetsyta')
    expect(withOverview.indexOf('KPI-SLOT')).toBeLessThan(withOverview.indexOf('pcc-workflows'))
    expect(withOverview).toContain('Arbetsyta')
  })
})
