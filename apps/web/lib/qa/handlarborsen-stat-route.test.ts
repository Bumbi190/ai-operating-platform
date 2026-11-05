import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { resolveProject, readReport, readV3 } = vi.hoisted(() => ({
  resolveProject: vi.fn(), readReport: vi.fn(), readV3: vi.fn(),
}))
vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: resolveProject }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-marketplace-read', () => ({ loadHandlarborsenMarketplaceReport: readReport }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-real-dealer-v3', () => ({ readRealDealerMetricsV3: readV3 }))
import MarketplaceReportPage from '@/app/(platform)/projects/[slug]/marketplace/page'
import { buildMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'

;(globalThis as unknown as { React: typeof React }).React = React
beforeEach(() => vi.resetAllMocks())
describe('marketplace page v3 authorization boundary', () => {
  it('does not read the privileged source when RLS project resolution fails', async () => {
    resolveProject.mockResolvedValue(null)
    await expect(MarketplaceReportPage({ params: { slug: 'handlarborsen' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(readV3).not.toHaveBeenCalled()
    expect(readReport).not.toHaveBeenCalled()
  })
  it('does not read v3 when the marketplace identity gate refuses the project', async () => {
    resolveProject.mockResolvedValue({ id: 'another-project', slug: 'other', name: 'Other' })
    readReport.mockResolvedValue({ status: 'not_permitted' })
    await expect(MarketplaceReportPage({ params: { slug: 'other' } })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(readV3).not.toHaveBeenCalled()
  })
  it('shows an unavailable v3 source without inventing counts or dropping the page', async () => {
    resolveProject.mockResolvedValue({ id: 'authorized-project', slug: 'handlarborsen', name: 'Handlarbörsen' })
    readReport.mockResolvedValue({ status: 'ok', report: buildMarketplaceReport([], new Date()) })
    readV3.mockResolvedValue({ status: 'unavailable', reason: 'source_unavailable' })
    const page = await MarketplaceReportPage({ params: { slug: 'handlarborsen' } })
    const html = renderToStaticMarkup(page)
    expect(readV3).toHaveBeenCalledWith(['authorized-project'])
    expect(html).toContain('source_unavailable')
    expect(html).toContain('Riktiga handlare')
    expect(html).not.toContain('>0</strong>')
  })
})
