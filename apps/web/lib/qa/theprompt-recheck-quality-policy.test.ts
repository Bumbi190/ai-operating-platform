import { describe, expect, it } from 'vitest'
import { eligibleForRecheck, validateRecheckInput, type RecheckDraft } from '@/lib/media/recheck-quality-policy'
import { parseQualityScore, shouldRegenerate } from '@/lib/media/quality-evaluation'

const payload = { expectedVersion: 1, hook: 'A plant can now show an AI-powered expression.', script: 'OATs are a Carnegie Mellon research prototype with E Ink avatars that respond to sensors. Their creator hopes these companions might encourage care, but lasting behavior change has not been established.', captions: ['The idea behind OATs', 'Research prototype, not a proven habit cure'], cta: 'Would you attach an OAT to a houseplant?' }
const row: RecheckDraft = {
  id: 'test', project_id: 'project', status: 'pending_review', version: 1,
  voice_status: 'none', video_status: 'none', audio_url: null,
  video_url: null, published_at: null,
}

describe('The Prompt single-draft quality recheck safety', () => {
  it('accepts only strict, versioned, nonempty operator input', () => {
    expect(validateRecheckInput(payload)).toEqual(payload)
    expect(validateRecheckInput({ ...payload, extra: 'bypass' })).toBeNull()
    expect(validateRecheckInput({ ...payload, expectedVersion: 0 })).toBeNull()
    expect(validateRecheckInput({ ...payload, expectedVersion: '1' })).toBeNull()
    expect(validateRecheckInput({ ...payload, script: '' })).toBeNull()
    expect(validateRecheckInput({ ...payload, hook: '' })).toBeNull()
    expect(validateRecheckInput({ ...payload, captions: [] })).toBeNull()
    expect(validateRecheckInput({ ...payload, captions: ['only one'] })).toBeNull()
    expect(validateRecheckInput({ ...payload, cta: '' })).toBeNull()
    expect(validateRecheckInput([])).toBeNull()
  })
  it('only allows pristine unpublished pending-review drafts with matching version', () => {
    expect(eligibleForRecheck(row, payload)).toBe(true)
    for (const diff of [
      { version: 2 }, { status: 'approved' }, { status: 'published' },
      { status: 'rejected' }, { project_id: null },
      { voice_status: 'ready' }, { video_status: 'rendering' },
      { audio_url: 'asset' }, { video_url: 'asset' },
      { published_at: '2026-11-16T00:00:00Z' },
    ]) expect(eligibleForRecheck({ ...row, ...diff }, payload)).toBe(false)
  })
  it('rejects invalid, truncated, and unsupported editorial approval', () => {
    expect(shouldRegenerate(parseQualityScore('{bad json'))).toBe(true)
    expect(shouldRegenerate(parseQualityScore(JSON.stringify({
      hook_strength: 9, retention_score: 9, visual_relevance: 9,
      shareability: 9, discussion_potential: 9, hallucination_risk: 2,
      passed: true, verdict: 'unsafe', weak_spots: [],
    })))).toBe(true)
  })
})
