import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { resolveProject, loadHistory } = vi.hoisted(() => ({ resolveProject: vi.fn(), loadHistory: vi.fn() }))
vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: resolveProject }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-store', () => ({ loadCompetitorHistory: loadHistory }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404') } }))
import Page from '@/app/(platform)/projects/[slug]/competitors/page'
import { HandlarborsenCompetitors } from '@/components/platform/vnext/HandlarborsenCompetitors'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { EVIDENCE, type PublicScan } from '@/lib/atlas/project-analytics/handlarborsen-competitors'

;(globalThis as unknown as { React: typeof React }).React = React
const authorized = { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen' }
const fetcher = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetcher)
  resolveProject.mockResolvedValue(authorized)
  loadHistory.mockResolvedValue({ status: 'ok', observations: [] })
})
afterEach(() => vi.unstubAllGlobals())

describe('authorized read-only competitors page', () => {
  it.each([null, { ...authorized, id: 'foreign' }, { ...authorized, slug: 'other' }, { ...authorized, name: 'Lookalike' }])(
    'rejects unauthorized identities before history or network', async project => {
      resolveProject.mockResolvedValue(project)
      await expect(Page({ params: { slug: 'handlarborsen' }, searchParams: { scan: '1' } })).rejects.toThrow('404')
      expect(loadHistory).not.toHaveBeenCalled()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it.each([undefined, {}, { scan: '1' }, { scan: ['1', '1'], url: 'https://evil.example' }])(
    'GET only reads history regardless of query input', async searchParams => {
      const html = renderToStaticMarkup(await Page({ params: { slug: 'handlarborsen' }, searchParams }))
      expect(loadHistory).toHaveBeenCalledOnce()
      expect(fetcher).not.toHaveBeenCalled()
      expect(html).toContain('method="post"')
      expect(html).toContain('action="/projects/handlarborsen/competitors/scan"')
      expect(html).toContain('Inga sparade observationer')
      for (const source of EVIDENCE) expect(html).toContain(source.published)
    },
  )
  it('distinguishes unreadable history from no snapshots and disables the scan', async () => {
    loadHistory.mockResolvedValue({ status: 'read_failed' })
    const html = renderToStaticMarkup(await Page({ params: { slug: 'handlarborsen' } }))
    expect(html).toContain('Historiken kunde inte läsas')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('Inga sparade observationer')
  })
  it.each(['__proto__', 'toString', 'saved', 'already_saved'])('does not fabricate success from result=%s', async result => {
    const html = renderToStaticMarkup(await Page({ params: { slug: 'handlarborsen' }, searchParams: { result } }))
    expect(html).toContain('Inga sparade observationer')
    expect(html).not.toContain('Kontrollen har sparats')
    expect(html).not.toContain('sidtitel ändrades')
  })
  it('keeps optional P1 scan rendering escaped and renders saved UTC changes separately', () => {
    const scan: PublicScan = { checked_at: '2026-10-12T09:00:00Z', sources: [{
      id: 'battery-vdn-2025', checked_at: '2026-10-12T09:00:00Z', status: 'metadata_checked', title: '<img src=x> & title',
    }] }
    const html = renderToStaticMarkup(React.createElement(HandlarborsenCompetitors, { scan, history: {
      status: 'ok', observations: ['2026-10-11', '2026-10-12'].map((day, i) => ({ source_id: 'battery-vdn-2025' as const,
        observed_on: day, checked_at: `${day}T09:00:00Z`, status: 'metadata_checked' as const, title: i ? 'New' : 'Old' })),
    } }))
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('(UTC)')
    expect(html).toContain('sidtitel ändrades')
    expect(html).toContain('inga ändringar i produkter')
    expect(html).toContain('inte godkända produktbeslut')
  })
  it('contains no secrets, raw HTML, scheduler or LLM entry points', () => {
    for (const path of [
      'app/(platform)/projects/[slug]/competitors/page.tsx',
      'app/(platform)/projects/[slug]/competitors/scan/route.ts',
      'lib/atlas/project-analytics/handlarborsen-competitor-store.ts',
      'lib/atlas/project-analytics/handlarborsen-competitor-history.ts',
      'components/platform/vnext/HandlarborsenCompetitors.tsx',
    ]) {
      const source = readFileSync(resolve(__dirname, '../..', path), 'utf8')
      expect(source).not.toMatch(/process\.env|dangerouslySetInnerHTML|setInterval|node-cron|from ['"](?:openai|@anthropic-ai)/)
    }
  })
})
