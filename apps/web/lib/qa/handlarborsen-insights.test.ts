import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HANDLARBORSEN_PROJECT_ID,
  MARKETPLACE_METRIC_KEYS,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  buildMarketplaceReport,
  COMPLETENESS_LABELS,
  emptyReport,
  type MarketplaceReport,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  deriveHandlarborsenInsights,
  HANDLARBORSEN_INSIGHT_RULE_VERSION,
} from '@/lib/atlas/project-analytics/handlarborsen-insights'
import { HandlarborsenInsights } from '@/components/platform/vnext/HandlarborsenInsights'
;(globalThis as unknown as { React: typeof React }).React = React
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('No storage access allowed')
  },
}))
const NOW = new Date('2026-10-12T11:00:00.000Z')
const AUDIT = [{ status: 'ok', ran_at: '2026-10-12T10:01:00.000Z', snapshot_date: '2026-10-12' }]
function row(date = '2026-10-12', metrics: Record<string, number | null> = {}) {
  const values = {
    ...Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((key) => [key, 0])),
    companies_registered_total: 10,
    companies_verified_total: 6,
    bids_total: 2,
    bids_last_24h: 0,
    ...metrics,
  }
  const nulls = Object.entries(values).filter(([, value]) => value === null)
  return {
    project_id: HANDLARBORSEN_PROJECT_ID,
    snapshot_date: date,
    observed_at: `${date}T10:00:00.000Z`,
    captured_at: `${date}T10:01:00.000Z`,
    schema_version: 1,
    window_hours: 24,
    completeness: nulls.length === 0 ? 'complete' : nulls.length === 11 ? 'unavailable' : 'partial',
    unavailable: Object.fromEntries(nulls.map(([key]) => [key, 'query_failed'])),
    ...values,
  }
}
const report = (rows = [row()], runs: unknown[] | undefined = AUDIT) =>
  buildMarketplaceReport(rows, NOW, runs)
const derive = (r = report(), now = NOW) => deriveHandlarborsenInsights(r, now)
const rule = (r: MarketplaceReport, name: string) =>
  derive(r).insights.find((insight) => insight.rule === name)
const html = (r: MarketplaceReport, now = NOW) =>
  renderToStaticMarkup(React.createElement(HandlarborsenInsights, { report: r, now }))
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
}

describe('pure Handlarbörsen evidence rules', () => {
  const fetch = vi.fn(() => {
    throw new Error('No provider requests allowed')
  })
  beforeEach(() => {
    fetch.mockClear()
    vi.stubGlobal('fetch', fetch)
  })
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('10/6 is a status-review proposal with the closed-company caveat, never approval or conversion', () => {
    const insight = rule(report(), 'company-status')!
    expect(insight.kind).toBe('proposal')
    expect(insight.observation).toContain('10 registrerade, 6 verifierade vid observationen')
    expect(insight.observation).toContain('stängda företag')
    expect(insight.observation).toContain('inte källverifierad')
    expect(insight.evidence.map((item) => item.value)).toEqual([10, 6])
    expect(JSON.stringify(insight)).not.toMatch(/4 väntar|60\s*%|conversionRate|conversion_rate/)
    expect(insight.evidence[1].semanticKind).toBe('population_unverified')
  })

  it('2 total/0 rolling bids are separate observations with a human check, without demand or causal inference', () => {
    const insight = rule(report(), 'bid-window')!
    expect(insight.kind).toBe('proposal')
    expect(insight.observation).toContain('2 bud totalt. 0 bud')
    expect(insight.observation).not.toMatch(/minsk|efterfrågan|trafik|orsak/)
    if (insight.kind !== 'proposal') throw new Error('Expected proposal')
    expect(insight.reviewReason).toContain('fastställer varken efterfrågan eller orsak')
    expect(insight.nextCheck).toContain('publicerat utbud')
    expect(insight.evidence[0].window.start).toBe('2026-10-12T10:00:00.000Z')
    expect(insight.evidence[1].window).toEqual({
      start: '2026-10-11T10:00:00.000Z',
      end: '2026-10-12T10:00:00.000Z',
      timezone: 'UTC',
      complete: null,
    })
  })

  it('one snapshot has no trend; a real October 10/12 gap creates no artificial point or today trend', () => {
    for (const r of [
      report(),
      report([
        row('2026-10-10', { vehicles_published_active: 4 }),
        row('2026-10-12', { vehicles_published_active: 9 }),
      ]),
    ]) {
      expect(rule(r, 'published-stock')).toBeUndefined()
      expect(derive(r).quality.blockedRules).toContainEqual(
        expect.objectContaining({
          rule: 'published-stock',
          reason: expect.stringContaining('intilliggande'),
        }),
      )
      expect(
        derive(r)
          .insights.map((item) => item.observation)
          .join(' '),
      ).not.toMatch(/idag|ökning/)
    }
  })

  it('only published stock trends on consecutive observed UTC dates with both real values', () => {
    const r = report([
      row('2026-10-11', { vehicles_published_active: 0, bids_last_24h: 100 }),
      row('2026-10-12', { vehicles_published_active: 3, bids_last_24h: 0 }),
    ])
    const insight = rule(r, 'published-stock')!
    expect(insight.kind).toBe('fact')
    expect(insight.observation).toContain('+3 mellan 2026-10-11 och 2026-10-12')
    expect(insight.evidence.map((item) => [item.metricKey, item.value])).toEqual([
      ['vehicles_published_active', 0],
      ['vehicles_published_active', 3],
    ])
    expect(
      derive(r)
        .insights.filter((item) =>
          item.evidence.some((e) => e.metricKey === 'companies_verified_total'),
        )
        .every((item) => item.rule !== 'published-stock'),
    ).toBe(true)
    expect(derive(r).insights.filter((item) => item.rule === 'published-stock')).toHaveLength(1)
    r.history.previous!.observedAt = '2026-10-10T23:00:00Z'
    expect(rule(r, 'published-stock')).toBeUndefined()
    const unknownPrevious = report([row('2026-10-11', { vehicles_published_active: null }), row()])
    expect(rule(unknownPrevious, 'published-stock')).toBeUndefined()
  })

  it('known zero stays zero, while null or missing required metrics block the numeric rule', () => {
    expect(
      rule(report([row('2026-10-12', { bids_total: 0 })]), 'bid-window')!.evidence[0].value,
    ).toBe(0)
    for (const key of ['bids_total', 'bids_last_24h'] as const) {
      const r = report([row('2026-10-12', { [key]: null })])
      expect(rule(r, 'bid-window')).toBeUndefined()
      const unknown = rule(r, 'quality')!.evidence.find((item) => item.metricKey === key)!
      expect(unknown).toMatchObject({
        value: null,
        availability: 'unknown',
        reason: 'Kunde inte beräknas hos Handlarbörsen',
      })
      r.latest!.metrics = r.latest!.metrics.filter((metric) => metric.key !== key)
      expect(rule(r, 'bid-window')).toBeUndefined()
      expect(rule(r, 'quality')!.evidence.find((item) => item.metricKey === key)?.value).toBeNull()
    }
  })

  it('partial allows only known levels with full quality evidence, and unavailable gives no numeric insight', () => {
    const r = report([row('2026-10-12', { offers_last_24h: null })])
    expect(rule(r, 'company-status')).toBeDefined()
    expect(derive(r).quality).toMatchObject({
      completeness: 'partial',
      availableCount: 10,
      totalCount: 11,
      reportState: 'ok',
      freshness: 'fresh',
    })
    expect(rule(r, 'company-status')!.evidence[0].quality).toEqual(derive(r).quality)
    const unavailable = report([
      row('2026-10-12', Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((key) => [key, null]))),
    ])
    expect(derive(unavailable).insights.every((item) => item.kind === 'quality')).toBe(true)
    expect(
      derive(unavailable)
        .insights.flatMap((item) => item.evidence)
        .every((item) => item.value === null),
    ).toBe(true)
  })

  it('freshness is recomputed with a strict >26 h boundary, independent of report build time', () => {
    const r = report()
    expect(derive(r, new Date('2026-10-13T12:00:00.000Z')).quality.freshness).toBe('fresh')
    const stale = derive(r, new Date('2026-10-13T12:00:00.001Z'))
    expect(stale.quality.freshness).toBe('stale')
    expect(stale.insights.every((item) => item.kind === 'quality')).toBe(true)
  })

  it('failed collection audit blocks business proposals, while unknown audit is explicitly unknown', () => {
    const failed = report(
      [row()],
      [...AUDIT, { status: 'error', ran_at: '2026-10-12T10:30:00Z', snapshot_date: '2026-10-12' }],
    )
    expect(derive(failed).quality.collection?.latestAttemptFailed).toBe(true)
    expect(derive(failed).insights.every((item) => item.kind === 'quality')).toBe(true)
    const unknown = buildMarketplaceReport([row()], NOW)
    expect(derive(unknown).quality.collection).toBeNull()
    expect(derive(unknown).quality.reasons.join(' ')).toContain('audit är okänd')
  })

  it.each(['no_snapshot', 'invalid_snapshot', 'read_failed', 'not_enabled'] as const)(
    '%s never leaks stale populated data',
    (state) => {
      const r = { ...report(), state }
      expect(derive(r).insights.flatMap((item) => item.evidence)).toEqual([])
      expect(derive(r).quality.availableCount).toBeNull()
      expect(html(r)).toBe('')
    },
  )

  it('handles missing/invalid latest timestamps, corrupt rows and invalid clocks without numerical claims', () => {
    const r = report()
    r.latest!.observedAt = 'invalid'
    expect(derive(r).insights.flatMap((item) => item.evidence)).toEqual([])
    expect(html(r)).toBe('')
    r.latest!.observedAt = '2026-10-12T10:00:00'
    expect(derive(r).insights.flatMap((item) => item.evidence)).toEqual([])
    r.latest = null
    expect(derive(r).quality.freshness).toBe('unknown')
    expect(html(r)).toBe('')
    expect(
      derive(buildMarketplaceReport([{ ...row(), schema_version: 7 }], NOW)).insights[0].kind,
    ).toBe('quality')
    expect(derive(report(), new Date('invalid')).evaluatedAt).toBeNull()
    expect(
      derive(report(), new Date('2026-10-11T00:00:00Z')).insights.flatMap((item) => item.evidence),
    ).toEqual([])
    expect(derive(emptyReport('no_snapshot')).insights.flatMap((item) => item.evidence)).toEqual([])
  })

  it('uses observed UTC dates even when timestamps carry an explicit offset', () => {
    const r = report()
    r.latest!.observedAt = '2026-10-12T12:00:00+02:00'
    expect(rule(r, 'bid-window')!.evidence[1].window.end).toBe('2026-10-12T10:00:00.000Z')
    r.latest!.observedAt = '2026-10-12T00:30:00+02:00' // October 11 in UTC
    expect(derive(r).insights.flatMap((item) => item.evidence)).toEqual([])
  })

  it('is deterministic, immutable, versioned and has stable IDs within a freshness category', () => {
    const r = report()
    freeze(r)
    const first = derive(r)
    expect(derive(r)).toEqual(first)
    expect(first.evaluatedAt).toBe('2026-10-12T11:00:00.000Z')
    expect(first.insights.map((item) => item.id)).toEqual(
      derive(r, new Date('2026-10-12T12:00:00Z')).insights.map((item) => item.id),
    )
    expect(new Set(first.insights.map((item) => item.id)).size).toBe(first.insights.length)
    expect(
      first.insights.every((item) => item.ruleVersion === HANDLARBORSEN_INSIGHT_RULE_VERSION),
    ).toBe(true)
    expect(rule(report([row('2026-10-12', { bids_total: 3 })]), 'bid-window')!.id).not.toBe(
      rule(r, 'bid-window')!.id,
    )
    expect(first.insights[1].evidence[0]).toMatchObject({
      source: 'handlarborsen.marketplace',
      projectId: HANDLARBORSEN_PROJECT_ID,
      schemaVersion: 1,
      snapshotDate: '2026-10-12',
      observedAt: '2026-10-12T10:00:00.000Z',
      capturedAt: '2026-10-12T10:01:00.000Z',
      collectorVersion: null,
    })
  })

  it('server renders at most three reviewable insights, exact evidence and sources with no executable controls', () => {
    const r = report([row('2026-10-11'), row()])
    const markup = html(r)
    expect(markup).toContain('aria-labelledby="hb-atlas-evidence"')
    expect(markup).toContain('Atlas Intelligence')
    expect(markup).toContain('Regelbaserad analys · Ej exekverat')
    expect(markup).toContain('2 förslag att granska')
    expect(markup).toContain('Att granska')
    expect(markup).toContain('handlarborsen.marketplace')
    expect(markup).toContain('Snapshotreferens')
    expect(markup).toContain('collectorversion okänd')
    expect(markup).toContain(HANDLARBORSEN_INSIGHT_RULE_VERSION)
    expect(markup).toContain('2026-10-11T10:00:00.000Z')
    const disclosures = markup.match(/<details>[\s\S]*?<\/details>/g)!
    expect(disclosures).toHaveLength(3)
    expect(markup).not.toMatch(/<details\s+open|<button\b|<form\b|<a\b|\bonClick\b|\b(?:Run|Publish|Kör|Publicera|LLM|AI)\b/)
    const escaped = (value: unknown) => renderToStaticMarkup(React.createElement('span', null, String(value))).slice(6, -7)
    for (const insight of derive(r).insights) {
      const detail = disclosures.find((item) => item.includes(`<code>${insight.rule}</code>`))!
      expect(detail).toBeDefined()
      expect(detail).toContain('<summary>Visa exakt evidens och proveniens</summary>')
      expect(detail).toContain(insight.ruleVersion)
      expect(detail).toContain('11/11 mått')
      expect(detail).toContain(escaped(JSON.stringify(insight.quality.collection)))
      expect(detail).toContain(derive(r).evaluatedAt)
      if (insight.kind === 'proposal') expect(detail).toContain(escaped(insight.reviewReason))
      for (const item of insight.evidence) {
        expect(detail).toContain(`<code>${item.metricKey}</code>: <strong>${item.value ?? 'Okänt'}</strong>`)
        for (const value of [item.observedAt, item.capturedAt, item.snapshotDate, item.source,
          item.projectId, item.snapshotRef, item.collectorId, item.semanticKind,
          item.availability, item.window.start, item.window.end]) {
          expect(detail).toContain(escaped(value))
        }
        expect(detail).toContain(`schema ${item.schemaVersion}`)
        expect(detail).toContain(COMPLETENESS_LABELS[item.completeness])
        expect(detail).toContain(`täckning ${item.window.complete === null ? 'okänd' : 'punktobservation'}`)
      }
    }
    const compact = markup.replace(/<details>[\s\S]*?<\/details>/g, '')
    expect(compact).not.toContain('Snapshotreferens')
    expect(compact).not.toContain(HANDLARBORSEN_INSIGHT_RULE_VERSION)
    expect(compact).not.toContain('companies_registered_total')
    expect(markup.indexOf('data-kind="proposal"')).toBeLessThan(markup.indexOf('data-kind="fact"'))
    const staleMarkup = html(r, new Date('2026-10-14T12:00:00Z'))
    expect(staleMarkup).toContain('Äldre än 26 h')
    expect(staleMarkup).not.toContain('Förslag · Att granska')
    expect(staleMarkup).not.toContain('förslag att granska')
    for (const block of derive(r, new Date('2026-10-14T12:00:00Z')).quality.blockedRules) {
      expect(staleMarkup).toContain(block.rule)
      expect(staleMarkup).toContain(escaped(block.reason))
    }
  })

  it('keeps quality warnings and blocked reasons while counting only grounded proposals', () => {
    for (const r of [
      report(), // history gap warning beside two proposals
      report([row('2026-10-11'), row('2026-10-12', { offers_last_24h: null })]),
      report([row()], [...AUDIT, { status: 'error', ran_at: '2026-10-12T10:30:00Z', snapshot_date: '2026-10-12' }]),
      report([row('2026-10-12', { companies_registered_total: 6, bids_last_24h: 1 })]),
    ]) {
      const analysis = derive(r)
      const markup = html(r)
      const count = analysis.insights.filter((insight) => insight.kind === 'proposal').length
      if (count) expect(markup).toContain(`${count} förslag att granska`)
      else expect(markup).not.toContain('förslag att granska')
      expect(markup.match(/<details>/g)!.length).toBeLessThanOrEqual(3)
      expect(markup).toContain('data-kind="quality"')
      for (const reason of analysis.quality.reasons) expect(markup).toContain(reason)
      for (const block of analysis.quality.blockedRules) expect(markup).toContain(block.reason)
      if (analysis.quality.collection?.latestAttemptFailed) {
        expect(markup).not.toContain('data-kind="proposal"')
        expect(markup).not.toContain('data-kind="fact"')
      }
      if (analysis.quality.completeness === 'partial') {
        expect(markup).toContain('<code>offers_last_24h</code>: <strong>Okänt</strong>')
        expect(markup).toContain('Kunde inte beräknas hos Handlarbörsen')
      }
    }
  })
})
