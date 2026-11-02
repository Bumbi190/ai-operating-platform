import {describe, it, expect} from 'vitest'
import {
  DISTRIBUTION_STAGES,
  summariseDistributionCohort,
  type DistributionCount,
} from '@/lib/handlarborsen/distribution/funnel'

const observedAt = '2026-10-27T12:00:00Z'
const verified = (
  stage: (typeof DISTRIBUTION_STAGES)[number],
  count: number,
): DistributionCount => ({stage, status: 'verified', count, source: 'fixture', observedAt})

describe('Handlarbörsen distribution (offline analytics only)', () => {
  it('shows missing sources as unavailable, never fake zero', () => {
    const result = summariseDistributionCohort({cohortId: 'pilot-skane', observations: []})
    expect(result.stages).toHaveLength(DISTRIBUTION_STAGES.length)
    expect(result.stages.every(row => row.status === 'unavailable' && row.count === null)).toBe(true)
    expect(result.identifiedToFirstListing).toEqual({
      status: 'unavailable', reason: 'missing_or_partial_evidence',
    })
  })

  it('calculates activation only for counts in the supplied cohort', () => {
    const result = summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [
        verified('identified', 50),
        verified('send_accepted', 30),
        verified('registered', 10),
        verified('first_listing_published', 5),
      ],
    })
    expect(result.contactToRegistration).toEqual({
      status: 'verified', numerator: 10, denominator: 30, percent: 33.3,
    })
    expect(result.registrationToFirstListing).toEqual({
      status: 'verified', numerator: 5, denominator: 10, percent: 50,
    })
    expect(result.identifiedToFirstListing).toEqual({
      status: 'verified', numerator: 5, denominator: 50, percent: 10,
    })
    expect(result.stages.find(row => row.stage === 'company_verified')?.status).toBe('unavailable')
  })

  it('keeps partial reads partial and never derives rates from them', () => {
    const result = summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [
        {stage: 'send_accepted', status: 'partial', count: 6,
          source: 'incomplete-provider-page', observedAt, reason: 'next page unavailable'},
        verified('registered', 2),
      ],
    })
    expect(result.contactToRegistration).toEqual({
      status: 'unavailable', reason: 'missing_or_partial_evidence',
    })
    expect(result.stages.find(row => row.stage === 'send_accepted')).toMatchObject({
      status: 'partial', count: 6, reason: 'next page unavailable',
    })
  })

  it('distinguishes verified zero from unavailable', () => {
    const result = summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [verified('send_accepted', 0), verified('registered', 0)],
    })
    expect(result.contactToRegistration).toEqual({
      status: 'unavailable', reason: 'zero_denominator',
    })
    expect(result.stages.find(row => row.stage === 'send_accepted')?.count).toBe(0)
  })

  it('does not show an impossible cross-source conversion as success', () => {
    const result = summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [verified('send_accepted', 2), verified('registered', 3)],
    })
    expect(result.contactToRegistration).toEqual({
      status: 'unavailable', reason: 'cohort_inconsistent',
    })
  })

  it('rejects duplicate stage observations', () => {
    expect(() => summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [verified('identified', 5), verified('identified', 6)],
    })).toThrow('Duplicate stage')
  })

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid counts (%s)', count => {
      expect(() => summariseDistributionCohort({
        cohortId: 'pilot-skane',
        observations: [verified('identified', count)],
      })).toThrow('safe integers')
    },
  )

  it('rejects incomplete provenance and unknown states', () => {
    expect(() => summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [{stage: 'identified', status: 'verified', count: 2, source: '',
        observedAt}] ,
    })).toThrow('source required')

    expect(() => summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [{
        stage: 'identified', status: 'unavailable', reason: '',
      }],
    })).toThrow('reason required')

    expect(() => summariseDistributionCohort({
      cohortId: 'pilot-skane',
      observations: [{
        stage: 'fake-stage', status: 'verified', count: 2, source: 'test', observedAt,
      } as unknown as DistributionCount],
    })).toThrow('Unknown distribution stage')
  })
})
