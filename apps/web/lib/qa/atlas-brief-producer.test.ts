/**
 * Tests for brief-producer.ts — the pure Brief Producer core.
 *
 * No mocks: buildBrief is pure and deterministic, so we feed it signal/memory
 * fixtures and assert on the returned draft. We verify:
 *   • empty input → honest low-confidence "insufficient data" brief
 *   • stripe + social + impact signals → typed metrics + findings
 *   • complete evidence chain (one entry per signal + memory item)
 *   • memory enrichment surfaces as evidence + a finding + confidence boost
 *   • determinism (same input → deep-equal output)
 *   • producer identity/version + subject scoping
 */

import { describe, it, expect } from 'vitest'
import type { SignalRecord } from '@/lib/atlas/signals'
import {
  buildBrief,
  BRIEF_PRODUCER_ID,
  BRIEF_PRODUCER_VERSION,
  type BriefInput,
  type BriefMemoryContext,
} from '@/lib/atlas/intelligence/producers/brief-producer'

const WINDOW = { since: '2026-06-22T00:00:00.000Z', until: '2026-06-29T00:00:00.000Z' }

function signal(over: Partial<SignalRecord>): SignalRecord {
  return {
    id: 'sig-default',
    contentId: null,
    projectId: 'proj-1',
    source: null,
    kind: 'impact_score',
    payload: {},
    version: 'v1',
    producedAt: '2026-06-25T00:00:00.000Z',
    ...over,
  }
}

const stripeSig = signal({
  id: 'sig-stripe',
  kind: 'stripe.mrr_snapshot',
  source: 'stripe',
  payload: { mrr_sek: 12450, active_subscribers: 83 },
  producedAt: '2026-06-28T06:00:00.000Z',
})

const socialSig = signal({
  id: 'sig-social',
  kind: 'social.account_snapshot',
  source: 'instagram',
  payload: {
    platforms: {
      instagram: { followers: 5200 },
      facebook: { followers: 1800 },
      youtube: null,
    },
  },
  producedAt: '2026-06-28T06:05:00.000Z',
})

const impactA = signal({ id: 'sig-impact-a', kind: 'impact_score', projectId: null, payload: { value: 91 } })
const impactB = signal({ id: 'sig-impact-b', kind: 'impact_score', projectId: null, payload: { value: 74 } })

describe('buildBrief', () => {
  it('produces an honest low-confidence brief when there is no data', () => {
    const draft = buildBrief({ projectId: 'proj-1', window: WINDOW, signals: [] })

    expect(draft.kind).toBe('brief')
    expect(draft.evidence).toEqual([])
    expect(draft.findings).toEqual([])
    expect(draft.body.signalCounts).toEqual({})
    expect(draft.body.memoryUsed).toBe(0)
    expect(draft.confidence).toBe(0.1)
    expect(draft.summary).toMatch(/insufficient data/i)
  })

  it('extracts typed metrics from stripe, social, and impact signals', () => {
    const input: BriefInput = {
      projectId: 'proj-1',
      window: WINDOW,
      signals: [stripeSig, socialSig, impactA, impactB],
    }
    const draft = buildBrief(input)

    expect(draft.body.metrics.mrrSek).toBe(12450)
    expect(draft.body.metrics.activeSubscribers).toBe(83)
    expect(draft.body.metrics.followersByPlatform).toEqual({ instagram: 5200, facebook: 1800 })
    expect(draft.body.metrics.scoredContentCount).toBe(2)
    expect(draft.body.metrics.topImpactScore).toBe(91)
    expect(draft.body.signalCounts).toEqual({
      'stripe.mrr_snapshot': 1,
      'social.account_snapshot': 1,
      impact_score: 2,
    })

    const labels = draft.findings.map((f) => f.label)
    expect(labels).toEqual(['revenue', 'audience', 'content_impact'])
  })

  it('builds a complete evidence chain — one entry per signal', () => {
    const draft = buildBrief({
      projectId: 'proj-1',
      window: WINDOW,
      signals: [stripeSig, socialSig, impactA, impactB],
    })
    expect(draft.evidence).toHaveLength(4)
    expect(draft.evidence.every((e) => e.sourceKind === 'signal')).toBe(true)
    expect(new Set(draft.evidence.map((e) => e.refId))).toEqual(
      new Set(['sig-stripe', 'sig-social', 'sig-impact-a', 'sig-impact-b']),
    )
  })

  it('folds memory in as evidence, a finding, and a confidence boost', () => {
    const memory: BriefMemoryContext[] = [
      { id: 'mem-1', summary: 'Churn rose last month', confidence: 0.7, lastSeenAt: '2026-06-20T00:00:00.000Z' },
    ]
    const base = buildBrief({ projectId: 'proj-1', window: WINDOW, signals: [stripeSig] })
    const enriched = buildBrief({ projectId: 'proj-1', window: WINDOW, signals: [stripeSig], memory })

    expect(enriched.body.memoryUsed).toBe(1)
    expect(enriched.findings.map((f) => f.label)).toContain('memory_context')
    const memEvidence = enriched.evidence.filter((e) => e.sourceKind === 'memory')
    expect(memEvidence).toHaveLength(1)
    expect(memEvidence[0].refId).toBe('mem-1')
    expect(enriched.confidence).toBeGreaterThan(base.confidence)
  })

  it('scopes a global brief when projectId is null', () => {
    const draft = buildBrief({ projectId: null, window: WINDOW, signals: [impactA] })
    expect(draft.subject).toEqual({ kind: 'global', ref: null })
    expect(draft.projectId).toBeNull()
  })

  it('stamps producer identity and version', () => {
    const draft = buildBrief({ projectId: 'proj-1', window: WINDOW, signals: [impactA] })
    expect(draft.producedBy).toBe(BRIEF_PRODUCER_ID)
    expect(draft.version).toBe(BRIEF_PRODUCER_VERSION)
  })

  it('is deterministic regardless of input signal ordering', () => {
    const a = buildBrief({ projectId: 'proj-1', window: WINDOW, signals: [stripeSig, socialSig, impactA, impactB] })
    const b = buildBrief({ projectId: 'proj-1', window: WINDOW, signals: [impactB, impactA, socialSig, stripeSig] })
    expect(a).toEqual(b)
  })

  it('keeps confidence within [0.1, 0.95]', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      signal({ id: `s-${i}`, kind: 'impact_score', projectId: null, payload: { value: 50 } }),
    )
    const draft = buildBrief({
      projectId: 'proj-1',
      window: WINDOW,
      signals: [stripeSig, socialSig, ...many],
      memory: [{ id: 'm', summary: 'x' }],
    })
    expect(draft.confidence).toBeGreaterThanOrEqual(0.1)
    expect(draft.confidence).toBeLessThanOrEqual(0.95)
  })
})
