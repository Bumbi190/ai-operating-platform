import { describe, expect, it } from 'vitest'
import {
  analyzeGrowthFunnel,
  classifyGrowthAction,
  DIGITAL_GROWTH_VERSION,
  type GrowthFunnel,
  type GrowthProject,
  type GrowthWindow,
} from '../growth-intelligence/decision-engine'

function sample(
  project: GrowthProject,
  funnel: GrowthFunnel,
  entrants: number | null,
  converted: number | null,
  period: 'previous' | 'current' = 'current',
): GrowthWindow {
  return {
    project, funnel, entrants, converted,
    startDate: period === 'current' ? '2026-10-08' : '2026-10-01',
    endDate: period === 'current' ? '2026-10-14' : '2026-10-07',
    attributionWindowDays: 7,
    measurementKey: 'verified-cohort-event-v1',
    evidence: [{
      ref: 'provider:source-123',
      provider: 'posthog',
      project,
      verified: true,
      capturedAt: '2026-10-17T12:00:00Z',
    }],
  }
}

describe('Atlas digital growth intelligence (no execution)', () => {
  it('produces a project-bound, owner-gated experiment draft on a directional decline', () => {
    const before = sample('familje-stunden', 'landing_to_trial', 200, 80, 'previous')
    const now = sample('familje-stunden', 'landing_to_trial', 200, 35)
    before.evidence = [{ ...before.evidence[0], ref: 'provider:baseline-456' }]
    const result = analyzeGrowthFunnel(now, before)
    expect(result.version).toBe(DIGITAL_GROWTH_VERSION)
    expect(result.status).toBe('needs_review')
    expect(result.currentRate).toBeCloseTo(0.175)
    expect(result.previousRate).toBeCloseTo(0.4)
    expect(result.relativeChange).toBeCloseTo(-0.5625)
    expect(result.evidenceRefs).toEqual(['provider:source-123', 'provider:baseline-456'])
    expect(result.proposal).toMatchObject({
      project: 'familje-stunden',
      type: 'draft_experiment',
      execution: 'not_authorized',
      humanApprovalBeforeExternalExecution: true,
      allowedSpendSek: 0,
      primaryMetric: 'landing_to_trial',
    })
    expect(result.proposal?.suggestedCheck).toMatch(/parent/i)
    expect(result.proposal?.suggestedCheck).not.toMatch(/dealer|news/i)
  })

  it('never claims success or failure for tiny pilot cohorts', () => {
    const result = analyzeGrowthFunnel(
      sample('handlarborsen', 'dealer_contact_to_pilot', 5, 1),
      sample('handlarborsen', 'dealer_contact_to_pilot', 5, 4, 'previous'),
    )
    expect(result.status).toBe('insufficient_sample')
    expect(result.proposal).toBeNull()
  })

  it('does not invent a campaign from improving verified video metrics', () => {
    const result = analyzeGrowthFunnel(
      sample('the-prompt', 'profile_to_follow', 200, 80),
      sample('the-prompt', 'profile_to_follow', 200, 40, 'previous'),
    )
    expect(result.status).toBe('stable_or_improved')
    expect(result.proposal).toBeNull()
  })

  it('blocks cross-project comparisons and project-mismatched evidence', () => {
    const current = sample('familje-stunden', 'landing_to_trial', 200, 10)
    const other = sample('the-prompt', 'profile_to_follow', 200, 100, 'previous')
    expect(analyzeGrowthFunnel(current, other).status).toBe('data_gap')
    const wrong = { ...current, evidence: [{ ...current.evidence[0], project: 'handlarborsen' as const }] }
    expect(analyzeGrowthFunnel(wrong, sample('familje-stunden', 'landing_to_trial', 200, 100, 'previous')).status).toBe('data_gap')
    const wrongFunnel = sample('handlarborsen', 'landing_to_trial', 100, 5)
    expect(analyzeGrowthFunnel(wrongFunnel).status).toBe('data_gap')
  })

  it('rejects unverifiable sources, bogus dates, missing counts and impossible conversions', () => {
    const base = sample('familje-stunden', 'landing_to_trial', 200, 50)
    const before = sample('familje-stunden', 'landing_to_trial', 200, 100, 'previous')
    expect(analyzeGrowthFunnel({ ...base, evidence: [{ ...base.evidence[0], verified: false }] }, before).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...base, evidence: [] }, before).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...base, endDate: '2026-02-30' }, before).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...base, converted: 250 }, before).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...base, entrants: null }, before).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...base, entrants: -1 }, before).status).toBe('data_gap')
  })

  it('requires the same metric definition, window length and nonoverlapping periods', () => {
    const now = sample('handlarborsen', 'verified_dealer_to_listing', 200, 10)
    const earlier = sample('handlarborsen', 'verified_dealer_to_listing', 200, 100, 'previous')
    expect(analyzeGrowthFunnel({ ...now, measurementKey: 'v2' }, earlier).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...now, attributionWindowDays: 14 }, earlier).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...now, endDate: '2026-10-20' }, earlier).status).toBe('data_gap')
    expect(analyzeGrowthFunnel({ ...now, startDate: '2026-10-03' }, earlier).status).toBe('data_gap')
  })

  it('does not invent a baseline or infer significance from no visitors', () => {
    const now = sample('the-prompt', 'video_to_profile', 0, 0)
    expect(analyzeGrowthFunnel(now).status).toBe('data_gap')
    expect(analyzeGrowthFunnel(now).proposal).toBeNull()
    expect(analyzeGrowthFunnel(now, sample('the-prompt', 'video_to_profile', 100, 30, 'previous')).status).toBe('insufficient_sample')
  })

  it('blocks external actions, spending, cross-project access and fake budget values', () => {
    expect(classifyGrowthAction({ project: 'handlarborsen', type: 'read_only_analysis' }, 'handlarborsen')).toMatchObject({
      verdict: 'draft_only', authorizesExternalExecution: false,
    })
    for (const type of ['send_email', 'publish', 'run_paid_ads', 'change_price', 'change_production', 'access_private_records'] as const) {
      expect(classifyGrowthAction({ project: 'handlarborsen', type }, 'handlarborsen')).toMatchObject({
        verdict: 'approval_required', requiresOwnerApproval: true, authorizesExternalExecution: false,
      })
    }
    expect(classifyGrowthAction({ project: 'familje-stunden', type: 'local_draft', requestedSpendSek: 1 }, 'familje-stunden').verdict).toBe('approval_required')
    expect(classifyGrowthAction({ project: 'familje-stunden', type: 'local_draft' }, 'the-prompt').verdict).toBe('blocked')
    expect(classifyGrowthAction({ project: 'familje-stunden', type: 'local_draft', requestedSpendSek: Number.NaN }, 'familje-stunden').verdict).toBe('blocked')
  })

  it('keeps source identifiers separate and never returns raw private data', () => {
    const current = sample('handlarborsen', 'listing_to_interest', 100, 5)
    const previous = sample('handlarborsen', 'listing_to_interest', 100, 50, 'previous')
    const result = analyzeGrowthFunnel(current, previous)
    expect(result.status).toBe('needs_review')
    expect(result.proposal?.suggestedCheck).toContain('listing')
    expect(result.proposal?.execution).toBe('not_authorized')
    expect(result.evidenceRefs).toEqual(['provider:source-123'])
  })
})
