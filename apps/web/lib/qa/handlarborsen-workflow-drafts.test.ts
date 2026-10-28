import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HANDLARBORSEN_PROJECT_ID, MARKETPLACE_METRIC_KEYS } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { buildMarketplaceReport, emptyReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { deriveHandlarborsenInsights } from '@/lib/atlas/project-analytics/handlarborsen-insights'
import { deriveHandlarborsenWorkflowDrafts as derive, PAPER_WORKFLOW_DRAFT_RULE_VERSION } from '@/lib/atlas/project-analytics/handlarborsen-workflow-drafts'
import { HandlarborsenWorkflowDrafts } from '@/components/platform/vnext/HandlarborsenWorkflowDrafts'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'
;(globalThis as unknown as { React: typeof React }).React = React

const NOW = new Date('2026-10-12T11:00:00Z')
const AUDIT = [{ status: 'ok', ran_at: '2026-10-12T10:01:00Z', snapshot_date: '2026-10-12' }]
function row(date = '2026-10-12', overrides: Record<string, number | null> = {}) {
  const metrics = { ...Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((key) => [key, 0])),
    companies_registered_total: 10, companies_verified_total: 6, bids_total: 2, bids_last_24h: 0, ...overrides }
  const unknown = Object.entries(metrics).filter(([, value]) => value === null)
  return { project_id: HANDLARBORSEN_PROJECT_ID, snapshot_date: date,
    observed_at: `${date}T10:00:00Z`, captured_at: `${date}T10:01:00Z`, schema_version: 1, window_hours: 24,
    completeness: unknown.length === 0 ? 'complete' : unknown.length === 11 ? 'unavailable' : 'partial',
    unavailable: Object.fromEntries(unknown.map(([key]) => [key, 'query_failed'])), ...metrics }
}
const report = (rows: unknown[] = [row()], audit: unknown[] = AUDIT) => buildMarketplaceReport(rows, NOW, audit)
const render = (r = report(), now = NOW) => renderToStaticMarkup(React.createElement(HandlarborsenWorkflowDrafts, { report: r, now }))
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
}

describe('Handlarbörsen paper workflow drafts', () => {
  const fetch = vi.fn(() => { throw new Error('Paper proposals cannot fetch') })
  beforeEach(() => { fetch.mockClear(); vi.stubGlobal('fetch', fetch) })
  afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals() })

  it('10/6 retains the population caveat and only proposes manual review', () => {
    const draft = derive(report(), NOW).find((item) => item.kind === 'review_company_status')!
    expect(draft).toMatchObject({ status: 'preview_only', executable: false, projectId: HANDLARBORSEN_PROJECT_ID,
      sourceSnapshotDate: '2026-10-12', observedAt: '2026-10-12T10:00:00Z' })
    expect(draft.evidence.map((item) => item.value)).toEqual([10, 6])
    expect(draft.evidenceSummary).toContain('stängda företag')
    expect(draft.evidenceSummary).toContain('inte källverifierad')
    expect(draft.humanChecklist.join(' ')).toContain('är inte antalet som väntar')
    expect(JSON.stringify(draft)).not.toMatch(/4 väntar|60\s*%|approved|scheduled/)
  })

  it('2 total/zero 24h preserves exact provenance without demand or trend claims', () => {
    const r = report()
    const draft = derive(r, NOW).find((item) => item.kind === 'check_bid_activity')!
    const insight = deriveHandlarborsenInsights(r, NOW).insights.find((item) => item.rule === 'bid-window')!
    expect(draft.evidence).toEqual(insight.evidence)
    expect(draft.sourceInsightId).toBe(insight.id)
    expect(draft.evidenceSummary).toContain('2 bud totalt. 0 bud')
    expect(draft.humanChecklist.join(' ')).toContain('noll nya bud bevisar inte brist på efterfrågan')
    expect(draft.evidence[1].window.complete).toBeNull()
    expect(draft.evidenceRefs).toEqual([draft.evidence[0].snapshotRef])
  })

  it('null and missing required values never produce the affected business draft; zero stays zero', () => {
    for (const key of ['bids_total', 'bids_last_24h', 'companies_registered_total', 'companies_verified_total']) {
      const r = report([row('2026-10-12', { [key]: null })])
      const absent = key.startsWith('bids') ? 'check_bid_activity' : 'review_company_status'
      expect(derive(r, NOW).some((item) => item.kind === absent)).toBe(false)
      expect(derive(r, NOW)[0].evidence.find((item) => item.metricKey === key)?.value).toBeNull()
      r.latest!.metrics = r.latest!.metrics.filter((item) => item.key !== key)
      expect(derive(r, NOW).some((item) => item.kind === absent)).toBe(false)
    }
    const draft = derive(report([row('2026-10-12', { bids_total: 0 })]), NOW).find((item) => item.kind === 'check_bid_activity')!
    expect(draft.evidence.map((item) => item.value)).toEqual([0, 0])
  })

  it('stale, failed collector, unknown audit and invalid clock never offer an unblocked business draft', () => {
    const failed = report([row()], [...AUDIT, { status: 'error', ran_at: '2026-10-12T10:30:00Z', snapshot_date: '2026-10-12' }])
    for (const [r, now] of [
      [report(), new Date('2026-10-13T12:00:01Z')], [failed, NOW],
      [report([row()], []), NOW], [report(), new Date('invalid')],
    ] as const) {
      const drafts = derive(r, now)
      expect(drafts.length).toBeGreaterThan(0)
      expect(drafts.every((item) => item.status === 'blocked' && item.blockers.length > 0)).toBe(true)
    }
    const skipped = report([row()], [...AUDIT, { status: 'skipped', ran_at: '2026-10-12T10:30:00Z', snapshot_date: '2026-10-12' }])
    expect(derive(skipped, NOW).every((item) => item.status === 'blocked')).toBe(true)
  })

  it('one snapshot and missing calendar dates only yield checks, without invented trends or persistent inactivity', () => {
    for (const r of [report(), report([row('2026-10-10'), row()])]) {
      const drafts = derive(r, NOW)
      expect(drafts.map((item) => item.kind)).toEqual(['review_data_quality', 'review_company_status', 'check_bid_activity'])
      expect(drafts[0].status).toBe('blocked')
      expect(drafts[0].evidenceSummary).toContain('intilliggande')
      expect(drafts[2].humanChecklist.join(' ')).toContain('invänta jämförbara')
      expect(drafts.map((item) => item.evidenceSummary).join(' ')).not.toMatch(/ökning idag|ihållande|minskad efterfrågan/)
    }
  })

  it.each(['no_snapshot', 'invalid_snapshot', 'read_failed', 'not_enabled'] as const)('%s yields only a safe blocked quality notice', (state) => {
    const r = { ...report(), state }
    const drafts = derive(r, NOW)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ kind: 'review_data_quality', status: 'blocked', sourceSnapshotDate: null, observedAt: null, evidence: [] })
    expect(render(r)).not.toContain('10 registrerade')
  })

  it('rejects corrupt/foreign rows and missing dates without leaking numeric evidence', () => {
    for (const r of [report([{ ...row(), project_id: 'foreign' }]), report([{ ...row(), schema_version: 9 }]), emptyReport('no_snapshot')]) {
      expect(derive(r, NOW).flatMap((item) => item.evidence)).toEqual([])
    }
    const r = report(); r.latest!.snapshotDate = ''
    expect(derive(r, NOW).flatMap((item) => item.evidence)).toEqual([])
  })

  it('is immutable, bounded, unique and stable while evidence ages; changed evidence changes identity', () => {
    const r = report(); freeze(r)
    const first = derive(r, NOW)
    expect(derive(r, NOW)).toEqual(first)
    expect(derive(r, new Date('2026-10-12T12:00:00Z')).map((item) => item.id)).toEqual(first.map((item) => item.id))
    expect(first.length).toBeLessThanOrEqual(3)
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length)
    for (const item of first) expect(item.id).toBe(`${HANDLARBORSEN_PROJECT_ID}:${PAPER_WORKFLOW_DRAFT_RULE_VERSION}:${item.sourceInsightId}`)
    expect(derive(report([row('2026-10-12', { bids_total: 3 })]), NOW).find((item) => item.kind === 'check_bid_activity')!.id).not.toBe(first.find((item) => item.kind === 'check_bid_activity')!.id)
    expect(JSON.stringify(first)).not.toMatch(/actionKind|provider|accountId|destination|scheduledAt/)
  })

  it('server renders accessible evidence disclosure and manual steps, without active controls', () => {
    const markup = render()
    expect(markup).toContain('aria-labelledby="hb-workflow-drafts"')
    expect(markup).toContain('Förhandsutkast – inte sparade')
    expect(markup).toContain('Manuella steg')
    expect(markup).toContain('handlarborsen.marketplace')
    expect(markup).toContain('Snapshotreferens')
    expect(markup.match(/<summary>/g)).toHaveLength(6) // three manual checklists + three source disclosures
    expect(markup.match(/Manuella steg – visa checklista/g)).toHaveLength(3)
    expect(markup.match(/data-paper-draft=/g)).toHaveLength(3)
    expect(markup).not.toMatch(/<button\b|<form\b|<a\b|onClick|\b(?:Run|Approve|Publish|Kör|Godkänn|Publicera)\b/)
  })

  it('overview places drafts after Atlas evidence using the shared report and explicit time', () => {
    const r = report()
    const markup = renderToStaticMarkup(React.createElement(HandlarborsenOverview, { report: r, reportHref: null, now: NOW }))
    expect(markup.indexOf('id="hb-workflow-drafts"')).toBeGreaterThan(markup.indexOf('id="hb-atlas-evidence"'))
    expect(markup).toContain('10 registrerade, 6 verifierade')
    const stale = renderToStaticMarkup(React.createElement(HandlarborsenOverview, { report: r, reportHref: null, now: new Date('2026-10-14T11:00:00Z') }))
    expect(stale).not.toContain('data-paper-draft="review_company_status"')
    expect(renderToStaticMarkup(React.createElement(HandlarborsenOverview, { report: emptyReport('no_snapshot'), reportHref: null, now: NOW }))).toContain('Blockerat underlag')
  })
})
