import { describe, expect, it } from 'vitest'
import {
  eligibleForTechnicalQualityRetry, recoverableQualityFailure, sufficientSourceForRetry,
  type QualityRetryDraft,
} from '@/lib/media/quality-retry-policy'

const projectId = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const now = Date.parse('2026-11-19T20:00:00Z')
const row: QualityRetryDraft = {
  project_id: projectId, status: 'pending_review', version: 1,
  generated_at: '2026-11-19T17:20:45Z', published_at: null,
  voice_status: 'none', video_status: 'none', audio_url: null, video_url: null,
  quality_score: { passed: false, overall: 0, verdict: 'Quality check timed out — manual editorial review required.' },
}

describe('The Prompt isolated editorial recovery', () => {
  it('only retries technical failure, never a factual rejection or fabricated legacy approval', () => {
    expect(recoverableQualityFailure(row.quality_score)).toBe(true)
    expect(recoverableQualityFailure({ passed: false, verdict: 'Inaccurate source claims' })).toBe(false)
    expect(recoverableQualityFailure({ passed: true, verdict: 'Quality check parse error — proceeding with caution.' })).toBe(false)
    expect(recoverableQualityFailure({ passed: false, verdict: 'Quality check truncated — manual review required.' })).toBe(true)
  })
  it('restricts recovery by project, exact version, pristine state and age', () => {
    expect(eligibleForTechnicalQualityRetry(row, projectId, now)).toBe(true)
    expect(eligibleForTechnicalQualityRetry({ ...row, version: 2 }, projectId, now)).toBe(true)
    for (const update of [
      { version: 3 }, { status: 'approved' }, { published_at: '2026-11-19' },
      { audio_url: 'https://example.org' }, { video_status: 'rendering' },
      { voice_status: 'ready' }, { project_id: 'other-project' },
      { quality_score: { passed: false, verdict: 'Fabricated claim' } },
    ]) {
      expect(eligibleForTechnicalQualityRetry({ ...row, ...update }, projectId, now)).toBe(false)
    }
    expect(eligibleForTechnicalQualityRetry(row, projectId, now + 4 * 60 * 60 * 1000)).toBe(false)
  })
  it('requires a traceable substantive source, not a headline-only model guess', () => {
    const source = {
      title: 'Chrome security agent test environment',
      summary: 'Chrome engineers evaluate browsing agents with isolated, repeatable tests on realistic synthetic websites instead of the public web.',
      url: 'https://blog.google/security/mirror-dimension-for-agents/',
    }
    expect(sufficientSourceForRetry(source)).toBe(true)
    expect(sufficientSourceForRetry({ ...source, summary: '' })).toBe(false)
    expect(sufficientSourceForRetry({ ...source, url: 'http://example.com' })).toBe(false)
  })
})
