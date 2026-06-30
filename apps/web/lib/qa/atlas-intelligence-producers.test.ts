/**
 * Tests for the Atlas Intelligence producer cores — pinning the architectural
 * invariants the v1 audit requires:
 *   • Evidence completeness — every artifact carries an evidence chain; factual
 *     artifacts cite signal-sourced entries.
 *   • Factual-grounding invariant — risk/opportunity return null without a
 *     signal-sourced driver (no speculative objects).
 *   • Confidence vs domain probability — kept independent on risk/opportunity.
 *   • Confidence propagation — never exceeds a sane [0,1] range.
 *
 * Pure cores only; no mocks. (Producers stamp producedAt from the clock, so we
 * never assert on timestamps.)
 */

import { describe, it, expect } from 'vitest'
import { buildBrief } from '@/lib/atlas/intelligence/producers/brief-producer'
import { buildTrend } from '@/lib/atlas/intelligence/producers/trend-producer'
import { buildInsight } from '@/lib/atlas/intelligence/producers/insight-producer'
import { buildRisk } from '@/lib/atlas/intelligence/producers/risk-producer'
import { buildOpportunity } from '@/lib/atlas/intelligence/producers/opportunity-producer'
import type { SignalRecord } from '@/lib/atlas/signals'
import type { IntelligenceObject, TrendBody } from '@/lib/atlas/intelligence/types'

const WINDOW = { since: '2026-06-01T00:00:00.000Z', until: '2026-06-29T00:00:00.000Z' }

function signal(over: Partial<SignalRecord>): SignalRecord {
  return {
    id: 'sig-x',
    contentId: null,
    projectId: 'proj-1',
    source: null,
    kind: 'stripe.mrr_snapshot',
    payload: { mrr_sek: 12000, active_subscribers: 80 },
    version: 'v1',
    producedAt: '2026-06-20T00:00:00.000Z',
    ...over,
  } as SignalRecord
}

function trendObj(over: {
  id: string
  metric: string
  direction: TrendBody['direction']
  changeRatio: number
  r2?: number
  confidence?: number
  withSignalEvidence?: boolean
}): IntelligenceObject<TrendBody> {
  return {
    id: over.id,
    kind: 'trend',
    projectId: 'proj-1',
    subject: { kind: 'metric', id: over.metric, name: over.metric },
    body: {
      metric: over.metric,
      projectId: 'proj-1',
      direction: over.direction,
      changeRatio: over.changeRatio,
      r2: over.r2 ?? 0.9,
      pointCount: 5,
      window: WINDOW,
      baseline: 100,
      current: 100 * (1 + over.changeRatio),
      slope: over.changeRatio,
    },
    evidence: over.withSignalEvidence === false
      ? []
      : [{ sourceId: `${over.id}-sig`, sourceKind: 'signal', label: over.metric, producedAt: WINDOW.since }],
    confidence: over.confidence ?? 0.7,
    producedAt: '2026-06-28T00:00:00.000Z',
    producedBy: 'trend-producer-1.0.0',
    supersededBy: null,
    window: WINDOW,
  }
}

describe('buildBrief — evidence completeness', () => {
  it('cold start: zero signals → low confidence, empty evidence', () => {
    const draft = buildBrief({ scope: 'global', projectId: null, window: WINDOW, signals: [], memoryItems: [] })
    expect(draft.kind).toBe('brief')
    expect(draft.evidence).toEqual([])
    expect(draft.confidence).toBeCloseTo(0.15, 2)
  })

  it('records one signal-sourced evidence entry per signal consumed', () => {
    const signals = [signal({ id: 's1' }), signal({ id: 's2' })]
    const draft = buildBrief({ scope: 'project', projectId: 'proj-1', window: WINDOW, signals, memoryItems: [] })
    expect(draft.evidence).toHaveLength(2)
    expect(draft.evidence.every(e => e.sourceKind === 'signal')).toBe(true)
    expect(draft.confidence).toBeGreaterThan(0.15)
    expect(draft.confidence).toBeLessThanOrEqual(1)
  })
})

describe('buildTrend — evidence + cold start', () => {
  it('empty series → null (graceful cold start)', () => {
    expect(buildTrend({ metric: 'mrr_sek', projectId: 'proj-1', window: WINDOW, series: [], priorTrends: [] })).toBeNull()
  })

  it('rising series → rising direction with one signal-sourced entry per point', () => {
    const series = [
      { value: 100, producedAt: '2026-06-02T00:00:00.000Z', signalId: 'a' },
      { value: 110, producedAt: '2026-06-10T00:00:00.000Z', signalId: 'b' },
      { value: 125, producedAt: '2026-06-20T00:00:00.000Z', signalId: 'c' },
    ]
    const draft = buildTrend({ metric: 'mrr_sek', projectId: 'proj-1', window: WINDOW, series, priorTrends: [] })!
    expect(draft).not.toBeNull()
    expect(draft.body.direction).toBe('rising')
    const signalEntries = draft.evidence.filter(e => e.sourceKind === 'signal')
    expect(signalEntries).toHaveLength(3)
  })

  it('single point → insufficient_data, confidence 0.1', () => {
    const draft = buildTrend({
      metric: 'mrr_sek', projectId: 'proj-1', window: WINDOW,
      series: [{ value: 100, producedAt: WINDOW.since, signalId: 'a' }], priorTrends: [],
    })!
    expect(draft.body.direction).toBe('insufficient_data')
    expect(draft.confidence).toBe(0.1)
  })
})

describe('buildInsight — nested intelligence evidence', () => {
  it('cites its source trends via atlas_intelligence evidence', () => {
    const trends = [
      trendObj({ id: 't-up', metric: 'mrr_sek', direction: 'rising', changeRatio: 0.2 }),
      trendObj({ id: 't-down', metric: 'followers_total', direction: 'falling', changeRatio: -0.2 }),
    ]
    const draft = buildInsight({ projectId: 'proj-1', window: WINDOW, trends, briefs: [] })
    expect(draft.kind).toBe('insight')
    expect(draft.evidence.every(e => e.sourceKind === 'atlas_intelligence')).toBe(true)
    expect(new Set(draft.evidence.map(e => e.sourceId))).toEqual(new Set(['t-up', 't-down']))
    expect(draft.confidence).toBeGreaterThanOrEqual(0)
    expect(draft.confidence).toBeLessThanOrEqual(1)
  })
})

describe('buildRisk — factual grounding invariant', () => {
  it('produces a risk from a falling trend that carries signal evidence', () => {
    const trends = [trendObj({ id: 't-mrr', metric: 'mrr_sek', direction: 'falling', changeRatio: -0.25 })]
    const draft = buildRisk({ projectId: 'proj-1', window: WINDOW, trends, insights: [], briefs: [] })!
    expect(draft).not.toBeNull()
    expect(draft.kind).toBe('risk')
    expect(draft.evidence.some(e => e.sourceKind === 'signal')).toBe(true) // factual grounding
    // confidence and likelihood are independent numbers, both within [0,1]
    expect(draft.body.likelihood).toBeGreaterThanOrEqual(0)
    expect(draft.body.likelihood).toBeLessThanOrEqual(1)
    expect(draft.confidence).toBeGreaterThanOrEqual(0)
    expect(draft.confidence).toBeLessThanOrEqual(1)
  })

  it('returns null when the falling driver has no signal-sourced evidence', () => {
    const trends = [trendObj({ id: 't-mrr', metric: 'mrr_sek', direction: 'falling', changeRatio: -0.25, withSignalEvidence: false })]
    expect(buildRisk({ projectId: 'proj-1', window: WINDOW, trends, insights: [], briefs: [] })).toBeNull()
  })

  it('returns null with no falling driver', () => {
    const trends = [trendObj({ id: 't-mrr', metric: 'mrr_sek', direction: 'rising', changeRatio: 0.25 })]
    expect(buildRisk({ projectId: 'proj-1', window: WINDOW, trends, insights: [], briefs: [] })).toBeNull()
  })
})

describe('buildOpportunity — factual grounding invariant', () => {
  it('produces an opportunity from a rising trend with signal evidence', () => {
    const trends = [trendObj({ id: 't-mrr', metric: 'mrr_sek', direction: 'rising', changeRatio: 0.25 })]
    const draft = buildOpportunity({ projectId: 'proj-1', window: WINDOW, trends, insights: [], briefs: [] })!
    expect(draft).not.toBeNull()
    expect(draft.kind).toBe('opportunity')
    expect(draft.evidence.some(e => e.sourceKind === 'signal')).toBe(true)
    expect(draft.body.expectedGain).toBeGreaterThanOrEqual(0)
    expect(draft.confidence).toBeLessThanOrEqual(1)
  })

  it('returns null when the rising driver has no signal evidence, and null with no rising driver', () => {
    const noEv = [trendObj({ id: 't', metric: 'mrr_sek', direction: 'rising', changeRatio: 0.25, withSignalEvidence: false })]
    expect(buildOpportunity({ projectId: 'proj-1', window: WINDOW, trends: noEv, insights: [], briefs: [] })).toBeNull()
    const falling = [trendObj({ id: 't', metric: 'mrr_sek', direction: 'falling', changeRatio: -0.25 })]
    expect(buildOpportunity({ projectId: 'proj-1', window: WINDOW, trends: falling, insights: [], briefs: [] })).toBeNull()
  })
})
