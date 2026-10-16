import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mock = vi.hoisted(() => ({
  gate: vi.fn(),
  history: vi.fn(async (): Promise<any> => ({ status: 'ok', history: { status: 'ok' } })),
  candidates: vi.fn(async (): Promise<any> => ({
    status: 'ok', candidates: [], awaitingReview: 0,
  })),
  publicScan: vi.fn(async (): Promise<any> => ({ checked_at: '', sources: [] })),
  landscape: vi.fn(async (): Promise<any> => ({ checkedAt: '', observations: [] })),
  render: vi.fn((_props: any) => null as any),
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404') } }))
vi.mock('@/lib/auth/organization-competitor-access', () => ({
  authorizeOrganizationCompetitorAction: mock.gate,
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-history-service', () => ({
  competitorHistoryEnabled: () => true,
  loadOrganizationCompetitorHistory: mock.history,
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service', () => ({
  candidateMemoryEnabled: () => true,
  loadOrganizationCandidateMemory: mock.candidates,
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitors-scan', () => ({
  scanPublicSources: mock.publicScan,
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-landscape-scan', () => ({
  scanCompetitorLandscape: mock.landscape,
}))
vi.mock('@/components/platform/vnext/HandlarborsenCompetitors', () => ({
  HandlarborsenCompetitors: (props: any) => {
    mock.render(props)
    return React.createElement('div', null, 'authorized-competing-page')
  },
}))
import Page from '@/app/organization/projects/[slug]/competitors/page'

;(globalThis as unknown as { React: typeof React }).React = React
beforeEach(() => {
  vi.clearAllMocks()
  mock.gate.mockResolvedValue({ ok: true })
})

describe('collaborator competitors page is separately scoped', () => {
  it('denies unauthorized or wrong-project visits before any scan or privileged read', async () => {
    for (const [slug, grant] of [
      ['other', { ok: true }],
      ['handlarborsen', { ok: false, status: 'forbidden' }],
      ['handlarborsen', { ok: false, status: 'unauthorized' }],
    ] as const) {
      mock.gate.mockResolvedValue(grant)
      await expect(Page({ params: { slug }, searchParams: { scan: '1' } })).rejects.toThrow('404')
      expect(mock.publicScan).not.toHaveBeenCalled()
      expect(mock.landscape).not.toHaveBeenCalled()
      expect(mock.history).not.toHaveBeenCalled()
      expect(mock.candidates).not.toHaveBeenCalled()
    }
  })
  it('renders the shared data but with the collaborator-only endpoint mode', async () => {
    const page = await Page({ params: { slug: 'handlarborsen' } })
    expect(renderToStaticMarkup(page)).toContain('authorized-competing-page')
    expect(mock.gate).toHaveBeenCalledWith('view_competitors')
    expect(mock.history).toHaveBeenCalledTimes(1)
    expect(mock.candidates).toHaveBeenCalledTimes(1)
    expect(mock.publicScan).not.toHaveBeenCalled()
    expect(mock.render).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'collaborator', historyEnabled: true, memoryEnabled: true, canSaveHistory: true,
    }))
  })
  it('only scans fixed public sources after the collaborator authorization', async () => {
    await Page({ params: { slug: 'handlarborsen' }, searchParams: { scan: '1' } })
    expect(mock.gate).toHaveBeenCalledWith('view_competitors')
    expect(mock.publicScan).toHaveBeenCalledOnce()
    expect(mock.landscape).toHaveBeenCalledOnce()
  })
})
