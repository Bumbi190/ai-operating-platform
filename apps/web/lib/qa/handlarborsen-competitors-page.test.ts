import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { resolveProject, denyAdmin, denyDb } = vi.hoisted(() => ({
  resolveProject: vi.fn(),
  denyAdmin: vi.fn(() => { throw new Error('service role forbidden') }),
  denyDb: vi.fn(() => { throw new Error('unexpected database access') }),
}))
vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: resolveProject }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: denyAdmin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: denyDb }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404') } }))
import Page from '@/app/(platform)/projects/[slug]/competitors/page'
import { HandlarborsenCompetitors } from '@/components/platform/vnext/HandlarborsenCompetitors'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { EVIDENCE, type PublicScan } from '@/lib/atlas/project-analytics/handlarborsen-competitors'

;(globalThis as unknown as { React: typeof React }).React = React
const authorized = {
  id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen', color: '#ffffff', settings: {},
  executionPaused: false, pausedAt: null, pausedReason: null,
}
const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/robots.txt')
  ? new Response('User-agent: *\nDisallow: /m/')
  : new Response('<title>Public news</title>', { headers: { 'content-type': 'text/html' } }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetcher)
  resolveProject.mockResolvedValue(authorized)
})
afterEach(() => vi.unstubAllGlobals())

describe('project-authorized manual competitors page', () => {
  it.each([null, { ...authorized, id: 'foreign' }, { ...authorized, slug: 'other' }, { ...authorized, name: 'Lookalike' }])(
    '404s unauthorized identities before any network I/O', async project => {
      resolveProject.mockResolvedValue(project)
      await expect(Page({ params: { slug: 'handlarborsen' }, searchParams: { scan: '1' } })).rejects.toThrow('404')
      expect(fetcher).not.toHaveBeenCalled()
      expect(denyAdmin).not.toHaveBeenCalled()
      expect(denyDb).not.toHaveBeenCalled()
    },
  )
  it.each([undefined, {}, { scan: '0' }, { scan: ['1', '1'] }, { scan: 'true' }])(
    'renders the dossier without scanning unless scan is exactly 1', async searchParams => {
      const element = await Page({ params: { slug: 'handlarborsen' }, searchParams })
      const html = renderToStaticMarkup(element)
      expect(resolveProject).toHaveBeenCalledWith('handlarborsen')
      expect(fetcher).not.toHaveBeenCalled()
      expect(html).toContain('Inte kontrollerad i denna vy')
      expect(html).toContain('manuell läsning')
      expect(html).toContain('ej aktiverad')
      expect(html).toContain('ej inkopplat')
      expect(html).toContain('Kontrollera offentliga källor')
      expect(html).toContain('method="get"')
      expect(html).toContain('name="scan" value="1"')
      expect(html).not.toContain('prefetch')
    },
  )
  it('scans once after RLS resolution and renders statuses, dated source links and no writes', async () => {
    const element = await Page({ params: { slug: 'handlarborsen' }, searchParams: { scan: '1', url: 'https://evil.example' } })
    const html = renderToStaticMarkup(element)
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('evil.example'))).toBe(false)
    expect(html).toContain('3 av 3')
    expect(html).toContain('dateTime=')
    for (const source of EVIDENCE) {
      expect(html).toContain(`href="${source.url}"`)
      expect(html).toContain(source.published)
    }
    expect(denyAdmin).not.toHaveBeenCalled()
    expect(denyDb).not.toHaveBeenCalled()
  })
  it('renders untrusted title metadata as escaped plain text and keeps review ideas distinct', () => {
    const scan: PublicScan = { checked_at: '2026-10-12T09:00:00.000Z', sources: [{
      id: 'battery-vdn-2025', checked_at: '2026-10-12T09:00:01.000Z', status: 'metadata_checked',
      title: '<img src=x onerror=alert(1)> & unsafe',
    }] }
    const html = renderToStaticMarkup(React.createElement(HandlarborsenCompetitors, { scan }))
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('Granskningsidé')
    expect(html).toContain('inte godkända produktbeslut')
    expect(html).toContain('Historiska förändringar')
    expect(html).toContain('framtida lagring och godkännande')
  })
  it('has no secret, storage, scheduler, LLM or raw HTML entry points in this slice', () => {
    const paths = [
      'app/(platform)/projects/[slug]/competitors/page.tsx',
      'lib/atlas/project-analytics/handlarborsen-competitors.ts',
      'lib/atlas/project-analytics/handlarborsen-competitors-scan.ts',
      'components/platform/vnext/HandlarborsenCompetitors.tsx',
    ]
    for (const path of paths) {
      const source = readFileSync(resolve(__dirname, '../..', path), 'utf8')
      expect(source).not.toMatch(/process\.env|createAdminClient|\.from\(|\.rpc\(|\.insert\(|\.upsert\(|dangerouslySetInnerHTML|setInterval|node-cron|\/media\/cron\/competitors|from ['"](?:openai|@anthropic-ai)/)
    }
  })
})
