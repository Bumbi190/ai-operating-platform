import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HandlarborsenCompetitorDiscovery } from '@/components/platform/vnext/HandlarborsenCompetitorDiscovery'
import { deriveCandidateReviewNotice } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-notice'
import type { CandidateMemoryLoad } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import type { CandidateReviewLoad } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-service'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const item = {
  name: 'TradingSolutions D2D', host: 'tradingsolutions.se',
  officialUrl: 'https://www.tradingsolutions.se/d2d/',
  observedOn: '2026-10-15',
  relevance: 'Officiellt verifierad B2B-bilauktion.',
  provenance: 'independently_checked_official_website' as const,
  firstSeenAt: '2026-10-16T20:23:40.736Z',
  lifecycle: 'candidate_for_review' as const,
  foundedRecently: 'not_verified' as const,
  executable: false as const,
}
const memory: CandidateMemoryLoad = { status: 'ok', candidates: [item], awaitingReview: 1 }
const reviews = (status: 'pending'|'interesting'|'reviewed'|'ignored'): CandidateReviewLoad => ({
  status: 'ok', awaitingReview: ['pending','interesting'].includes(status)?1:0,
  entries: [{
    host: item.host, status, changedAt: '2026-10-17T07:01:00.000Z',
    totalDecisions: 1,
    history: [{ id: 1, status, at: '2026-10-17T07:01:00.000Z' }],
  }],
})
const display = (data: CandidateReviewLoad|null, enabled = true) =>
  renderToStaticMarkup(React.createElement(HandlarborsenCompetitorDiscovery, {
    memory, memoryEnabled:true, reviews:data, reviewEnabled:enabled, mode:'collaborator',
  }))

describe('candidate human review status and project cue', () => {
  it('shows limited, explicit human choices and preserved audit history for authorized reviewer', () => {
    const html = display(reviews('interesting'))
    expect(html).toContain('Intressant – undersök vidare')
    expect(html).toContain('Markera granskad')
    expect(html).toContain('Ignorera')
    expect(html).toContain('Återöppna för granskning')
    expect(html).toContain('Visa beslutshistorik (1 beslut)')
    expect(html).toContain('2026-10-17 07:01 UTC')
    expect(html).toContain('Sparad kandidatsignal')
    expect(html).not.toContain('Godkänn publicering')
  })

  it('fails closed on an unavailable or mismatched decision register', () => {
    const fail = display({status:'unavailable'})
    expect(fail).toContain('Granskningshistoriken kan inte verifieras')
    expect(fail).not.toContain('Markera intressant')
    expect(fail).not.toContain('Ignorera')
    expect(display({status:'ok',entries:[],awaitingReview:0})).toContain('Kandidaten saknas i beslutsregistret')
  })

  it('never exposes inactive P2 controls on ordinary candidate memory in production', () => {
    const html = display(null,false)
    expect(html).toContain('Sparad kandidatsignal')
    expect(html).not.toContain('Markera intressant')
    expect(html).not.toContain('Markera granskad')
  })

  it('Atlas counts interesting or pending but does not nag reviewed or ignored candidates', () => {
    expect(deriveCandidateReviewNotice(true,memory,reviews('interesting'),true).state).toBe('pending')
    expect(deriveCandidateReviewNotice(true,memory,reviews('pending'),true).state).toBe('pending')
    expect(deriveCandidateReviewNotice(true,memory,reviews('reviewed'),true)).toEqual({state:'hidden'})
    expect(deriveCandidateReviewNotice(true,memory,reviews('ignored'),true)).toEqual({state:'hidden'})
    expect(deriveCandidateReviewNotice(true,memory,{status:'unavailable'},true)).toEqual({state:'unavailable'})
  })

  it('the initial legacy cue remains unchanged while separate review flag is OFF', () => {
    const before = deriveCandidateReviewNotice(true,memory)
    const after = deriveCandidateReviewNotice(true,memory,null,false)
    expect(after).toEqual(before)
    expect(before.state).toBe('pending')
  })
})
