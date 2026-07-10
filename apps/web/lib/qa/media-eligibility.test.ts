import { describe, expect, it } from 'vitest'
import { assertScriptProductionEligible, type EligibleScript } from '@/lib/media/eligibility'

function script(overrides: Partial<EligibleScript> = {}): EligibleScript {
  return {
    id: 'script-1',
    project_id: 'project-1',
    news_item_id: 'news-1',
    status: 'approved',
    voice_status: 'none',
    video_status: 'none',
    published_at: null,
    media_news_items: {
      id: 'news-1',
      project_id: 'project-1',
      status: 'approved',
      novelty_verdict: 'new',
      novelty_policy_outcome: 'novelty_passed',
      novelty_reviewed_at: '2026-07-08T12:00:00Z',
      novelty_workflow_run_id: 'run-1',
      novelty_input_evidence: { priorItems: [] },
      candidate_idempotency_key: 'media-candidate:v1:key',
      candidate_identity: 'url:https://example.com/news',
      editorial_approved_at: '2026-07-08T12:05:00Z',
    },
    ...overrides,
  }
}

describe('media production eligibility guard', () => {
  it('blocks unreviewed scripts before voice, image, render, or publish work', () => {
    const candidate = script({
      media_news_items: {
        id: 'news-1',
        project_id: 'project-1',
        status: 'pending_novelty_review',
        novelty_verdict: null,
        novelty_policy_outcome: null,
        novelty_reviewed_at: null,
        novelty_workflow_run_id: null,
        novelty_input_evidence: null,
        candidate_idempotency_key: null,
        candidate_identity: null,
        editorial_approved_at: null,
      },
    })

    expect(() => assertScriptProductionEligible(candidate, 'voice')).toThrow(/not production eligible|novelty/i)
    expect(() => assertScriptProductionEligible(candidate, 'images')).toThrow(/not production eligible|novelty/i)
    expect(() => assertScriptProductionEligible(candidate, 'render')).toThrow(/not production eligible|novelty/i)
    expect(() => assertScriptProductionEligible(candidate, 'publish')).toThrow(/not production eligible|novelty/i)
  })

  it('blocks novelty-passed items until editorial approval', () => {
    const candidate = script({
      media_news_items: {
        id: 'news-1',
        project_id: 'project-1',
        status: 'pending_editorial_review',
        novelty_verdict: 'new',
        novelty_policy_outcome: 'novelty_passed',
        novelty_reviewed_at: '2026-07-08T12:00:00Z',
        novelty_workflow_run_id: 'run-1',
        novelty_input_evidence: { priorItems: [] },
        candidate_idempotency_key: 'media-candidate:v1:key',
        candidate_identity: 'url:https://example.com/news',
        editorial_approved_at: null,
      },
    })

    expect(() => assertScriptProductionEligible(candidate, 'voice')).toThrow(/Editorial approval/)
  })

  it('blocks cross-project script/news relationships', () => {
    const candidate = script({
      media_news_items: {
        id: 'news-1',
        project_id: 'other-project',
        status: 'approved',
        novelty_verdict: 'new',
        novelty_policy_outcome: 'novelty_passed',
        novelty_reviewed_at: '2026-07-08T12:00:00Z',
        novelty_workflow_run_id: 'run-1',
        novelty_input_evidence: { priorItems: [] },
        candidate_idempotency_key: 'media-candidate:v1:key',
        candidate_identity: 'url:https://example.com/news',
        editorial_approved_at: '2026-07-08T12:05:00Z',
      },
    })

    expect(() => assertScriptProductionEligible(candidate, 'render')).toThrow(/different projects/)
  })

  it('allows approved reviewed scripts into production stages', () => {
    expect(() => assertScriptProductionEligible(script(), 'voice')).not.toThrow()
    expect(() => assertScriptProductionEligible(script(), 'render')).not.toThrow()
    expect(() => assertScriptProductionEligible(script(), 'publish')).not.toThrow()
  })

  it('blocks music generation when a non-retryable music asset already exists', () => {
    expect(() => assertScriptProductionEligible(script({ background_music_url: 'https://cdn.example/music.mp3' }), 'music')).toThrow(/already/)
    expect(() => assertScriptProductionEligible(script(), 'music')).not.toThrow()
  })
})