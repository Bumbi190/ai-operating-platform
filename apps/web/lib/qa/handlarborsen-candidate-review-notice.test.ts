import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { deriveCandidateReviewNotice } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-notice'
import { HandlarborsenCandidateReviewNotice } from '@/components/platform/vnext/HandlarborsenCandidateReviewNotice'
import type { CandidateMemoryLoad } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'

const candidate = {
  name: 'TradingSolutions D2D',
  host: 'tradingsolutions.se',
  officialUrl: 'https://www.tradingsolutions.se/d2d/',
  observedOn: '2026-10-15',
  relevance: 'Granskad digital B2B-fordonshandel.',
  provenance: 'independently_checked_official_website',
  firstSeenAt: '2026-10-16T20:23:40.736Z',
  lifecycle: 'candidate_for_review',
  foundedRecently: 'not_verified',
  executable: false,
} as const

const saved: CandidateMemoryLoad = {
  status: 'ok', candidates: [candidate], awaitingReview: 1,
}

const render = (audience: 'owner' | 'collaborator', memory: CandidateMemoryLoad | null, enabled = true) =>
  renderToStaticMarkup(createElement(HandlarborsenCandidateReviewNotice, {
    audience, memory, enabled,
  }))

describe('Atlas project competitor review cue (read-only)', () => {
  it('does not show a notification or query hook while disabled or with an empty reviewed list', () => {
    expect(deriveCandidateReviewNotice(false, saved)).toEqual({ state: 'hidden' })
    expect(render('owner', saved, false)).toBe('')
    expect(deriveCandidateReviewNotice(true, { status: 'ok', candidates: [], awaitingReview: 0 }))
      .toEqual({ state: 'hidden' })
    expect(render('collaborator', { status: 'ok', candidates: [], awaitingReview: 0 })).toBe('')
  })

  it('only shows real, persisted review evidence without claiming a push, unread status or company launch', () => {
    expect(deriveCandidateReviewNotice(true, saved)).toEqual({
      state: 'pending',
      count: 1,
      latest: {
        name: 'TradingSolutions D2D',
        host: 'tradingsolutions.se',
        firstSeenAt: '2026-10-16T20:23:40.736Z',
      },
    })
    const html = render('owner', saved)
    expect(html).toContain('1 konkurrentkandidat')
    expect(html).toContain('TradingSolutions D2D')
    expect(html).toContain('2026-10-16')
    expect(html).toContain('inte att företaget är nystartat')
    expect(html).toContain('inte en skickad avisering')
    expect(html).toContain('href="/projects/handlarborsen/competitors"')
    expect(html).not.toContain('oläst')
    expect(html).not.toContain('Upptäckt automatiskt')
  })

  it('links a collaborator to only the reviewed organization project, not owner-only routes', () => {
    const html = render('collaborator', saved)
    expect(html).toContain('href="/organization/projects/handlarborsen/competitors"')
    expect(html).not.toContain('href="/projects/handlarborsen/competitors"')
    expect(html).not.toContain('/api/')
  })

  it('signals failed reads as unavailable, never 0 pending', () => {
    for (const x of [null, { status: 'invalid' }, { status: 'unavailable' }, { status: 'forbidden' }] as const) {
      const html = render('owner', x as CandidateMemoryLoad | null)
      expect(html).toContain('Kandidatminnet kan inte läsas')
      expect(html).toContain('okänt, inte noll')
      expect(html).not.toContain('0 konkurrentkandidater')
      expect(html).not.toContain('Granska källor')
    }
  })

  it('rejects inconsistent counts, duplicate hosts and forged metadata', () => {
    for (const x of [
      { status: 'ok', candidates: [candidate], awaitingReview: 0 },
      { status: 'ok', candidates: [candidate, candidate], awaitingReview: 2 },
      { status: 'ok', candidates: [{ ...candidate, firstSeenAt: 'bad' }], awaitingReview: 1 },
      { status: 'ok', candidates: [{ ...candidate, executable: true }], awaitingReview: 1 },
      { status: 'ok', candidates: [{ ...candidate, lifecycle: 'approved' }], awaitingReview: 1 },
    ]) {
      expect(deriveCandidateReviewNotice(true, x as CandidateMemoryLoad)).toEqual({ state: 'unavailable' })
    }
  })

  it('sorts by persisted timestamp then stable host instead of API order', () => {
    const earlier = { ...candidate, name: 'Alpha Dealer', host: 'alpha-dealer.se', firstSeenAt: '2026-10-14T10:20:00.000Z' }
    const latest = { ...candidate, name: 'Newer Dealer', host: 'newer-dealer.se', firstSeenAt: '2026-10-16T22:10:00.000Z' }
    const result = deriveCandidateReviewNotice(true, {
      status: 'ok', candidates: [earlier, candidate, latest], awaitingReview: 3,
    })
    expect(result.state).toBe('pending')
    if (result.state === 'pending') expect(result.latest.name).toBe('Newer Dealer')
  })
})
