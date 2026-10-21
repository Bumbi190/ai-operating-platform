import { describe, expect, it, vi } from 'vitest'
import {
  COMPETITOR_SITES,
  summarizeLandscape,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape'
import { scanCompetitorLandscape } from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape-scan'

const policy = 'User-agent: *\nDisallow: /private\nAllow: /'
const html = (title: string) => new Response('<title>' + title + '</title>', {
  headers: { 'content-type': 'text/html' },
})

describe('manual competitor market landscape boundary', () => {
  it('freezes three dated official sources and uses no query/user-supplied URL', () => {
    expect(COMPETITOR_SITES).toHaveLength(3)
    expect(Object.isFrozen(COMPETITOR_SITES)).toBe(true)
    expect(COMPETITOR_SITES.every(Object.isFrozen)).toBe(true)
    expect(COMPETITOR_SITES.map(site => site.name)).toEqual(['AutoProff', 'BCA Sverige', 'AUTO1.com'])
    for (const site of COMPETITOR_SITES) {
      expect(new URL(site.url).protocol).toBe('https:')
      expect(site.robotsUrl).toBe(new URL('/robots.txt', site.url).toString())
      expect(site.observedOn).toBe('2026-10-14')
    }
  })

  it('fetches robots first for each immutable source, max six GETs, with no credentials or redirects', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => String(input).endsWith('/robots.txt')
      ? new Response(policy, { headers: { 'content-type': 'text/plain' } })
      : html('Public dealer marketplace'))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(6)
    for (let i = 0; i < COMPETITOR_SITES.length; i++) {
      expect(String(fetcher.mock.calls[i * 2][0])).toBe(COMPETITOR_SITES[i].robotsUrl)
      expect(String(fetcher.mock.calls[i * 2 + 1][0])).toBe(COMPETITOR_SITES[i].url)
    }
    for (const [url, init] of fetcher.mock.calls) {
      expect(COMPETITOR_SITES.some(site => site.url === String(url) || site.robotsUrl === String(url))).toBe(true)
      expect(init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store' })
      expect(init?.headers).not.toHaveProperty('Authorization')
      expect(init?.headers).not.toHaveProperty('Cookie')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(scan.observations.every(x => x.status === 'metadata_checked')).toBe(true)
    expect(summarizeLandscape(scan)).toMatchObject({ checked: 3, failed: 0, completed: true })
    expect(summarizeLandscape(null)).toMatchObject({ checked: 0, completed: false })
  })

  it('fails closed per website when robots forbid access, and continues to other public sites', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (String(url) === COMPETITOR_SITES[0].robotsUrl)
        return new Response('User-agent: *\nDisallow: /')
      if (String(url).endsWith('/robots.txt')) return new Response(policy)
      return html('Available source')
    })
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.map(x => x.status)).toEqual([
      'robots_denied', 'metadata_checked', 'metadata_checked',
    ])
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(fetcher.mock.calls.map(([url]) => String(url))).not.toContain(COMPETITOR_SITES[0].url)
  })

  it('refuses HTML redirects, unexpected content types and oversized responses without follow-ups', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (String(url).endsWith('/robots.txt')) return new Response(policy)
      if (String(url) === COMPETITOR_SITES[0].url)
        return new Response('', { status: 302, headers: { location: 'https://example.invalid/' } })
      if (String(url) === COMPETITOR_SITES[1].url)
        return new Response('{}', { headers: { 'content-type': 'application/json' } })
      return new Response('x'.repeat(200001) + '<title>too late</title>', { headers: { 'content-type': 'text/html', 'content-length': '300000' } })
    })
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.map(x => x.status)).toEqual([
      'redirect_refused', 'invalid_content_type', 'too_large',
    ])
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('example.invalid'))).toBe(false)
  })

  it('accepts a bounded title prefix from a large page and cancels the unread body', async () => {
    const cancel = vi.fn()
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (String(url).endsWith('/robots.txt')) return new Response(policy)
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html><head><title>Verified marketplace</title></head>'))
          // Intentionally do not close: early title detection must cancel
          // the response rather than downloading the whole large document.
        },
        cancel,
      }), { headers: { 'content-type': 'text/html', 'content-length': '900000' } })
    })
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.map(x => x.status)).toEqual([
      'metadata_checked', 'metadata_checked', 'metadata_checked',
    ])
    expect(scan.observations.every(x => x.title === 'Verified marketplace')).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(3)
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it('takes only the bounded prefix when a single chunk exceeds 200 KB', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/robots.txt')
      ? new Response(policy)
      : new Response(
          '<html><head><title>Early official heading</title></head>' + 'x'.repeat(250000),
          { headers: { 'content-type': 'text/html', 'content-length': '250055' } },
        ))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.every(x => x.status === 'metadata_checked')).toBe(true)
    expect(scan.observations.every(x => x.title === 'Early official heading')).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it('accepts a complete official head title before huge later scripts', async () => {
    const fixture = '<!doctype html><html><head>' +
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
      '<title>AutoProff official B2B</title>' +
      '<script>' + 'x'.repeat(225000) + '</script></head></html>'
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/robots.txt')
      ? new Response(policy)
      : new Response(fixture, { headers: { 'content-type': 'text/html' } }))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.every(x => x.status === 'metadata_checked')).toBe(true)
    expect(scan.observations.every(x => x.title === 'AutoProff official B2B')).toBe(true)
  })

  it('does not accept a fake title inside an unfinished script as official metadata', async () => {
    const fixture = '<html><head><script><title>not a page title</title>' + 'x'.repeat(225000)
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/robots.txt')
      ? new Response(policy)
      : new Response(fixture, { headers: { 'content-type': 'text/html' } }))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.every(x => x.status === 'too_large')).toBe(true)
  })

  it('accepts a completed HTML comment before a real early title on large HTML', async () => {
    const fixture = '<!doctype html><html><head>' +
      '<meta charset="utf-8"><!-- Squarespace theme metadata -->' +
      '<title>AutoProff SE &mdash; B2B Marketplace</title>' +
      '<script>' + 'x'.repeat(230000) + '</script></head></html>'
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/robots.txt')
      ? new Response(policy)
      : new Response(fixture, { headers: { 'content-type': 'text/html' } }))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.every(x => x.status === 'metadata_checked')).toBe(true)
    expect(scan.observations.every(x => x.title === 'AutoProff SE — B2B Marketplace')).toBe(true)
  })

  it('ignores fake titles inside completed comments and accepts the subsequent real title', async () => {
    const fixture = '<html><head><!-- <title>Fake title</title> -->' +
      '<meta charset="utf-8"><title>Actual dealer title</title>' +
      '<script>' + 'x'.repeat(230000) + '</script></head></html>'
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/robots.txt')
      ? new Response(policy)
      : new Response(fixture, { headers: { 'content-type': 'text/html' } }))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.every(x => x.status === 'metadata_checked')).toBe(true)
    expect(scan.observations.every(x => x.title === 'Actual dealer title')).toBe(true)
  })

  it('refuses fake titles within unfinished HTML comments', async () => {
    const fixture = '<html><head><!-- <title>Fake title</title>' + 'x'.repeat(230000)
    const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/robots.txt')
      ? new Response(policy)
      : new Response(fixture, { headers: { 'content-type': 'text/html' } }))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(scan.observations.every(x => x.status === 'too_large')).toBe(true)
  })

  it('never treats invalid robots or failure as permission to retrieve its document', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('<html>invalid robots</html>'))
    const scan = await scanCompetitorLandscape(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(scan.observations.every(x => x.status === 'robots_unavailable')).toBe(true)
  })
})
