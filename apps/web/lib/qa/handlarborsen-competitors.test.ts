import { describe, expect, it, vi } from 'vitest'
import {
  EVIDENCE, ROBOTS_URL, normalizeTitle, robotsAllows, summarizeScan,
} from '@/lib/atlas/project-analytics/handlarborsen-competitors'
import { scanPublicSources } from '@/lib/atlas/project-analytics/handlarborsen-competitors-scan'

const ROBOTS = 'User-agent: *\nDisallow: /m/\nDisallow: /popup/\nDisallow: /helpforms/\n'
const ALLOWED_DOCUMENTS = [
  'https://handlarbudet.se/nyheter/nya-varudeklarationen-batteritester-och-servicehistorik/',
  'https://handlarbudet.se/nyheter/handlarbudet-infor-garanterat-bud-bindande-pris-inom-30-minuter/',
  'https://handlarbudet.se/nyheter/vi-lanserar-handlarbudet-trading-support/',
]
const html = (body = '<title>Public announcement</title>') => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })
function fixture(document = () => html(), robots = () => new Response(ROBOTS)) {
  return vi.fn<typeof fetch>(async (url) => String(url) === ROBOTS_URL ? robots() : document())
}

describe('public competitor observation boundaries', () => {
  it('requires a valid applicable robots group and honours longest path and allow ties', () => {
    expect(robotsAllows(ROBOTS, '/m/public/handlarbudet.aspx')).toBe(false)
    expect(robotsAllows(ROBOTS, '/%6d/public/handlarbudet.aspx')).toBe(false)
    expect(robotsAllows(ROBOTS, '/popup/a')).toBe(false)
    expect(robotsAllows(ROBOTS, '/helpforms/a')).toBe(false)
    expect(robotsAllows(ROBOTS, '/nyheter/example/')).toBe(true)
    expect(robotsAllows('', '/nyheter/')).toBe(false)
    expect(robotsAllows('<html>error</html>', '/nyheter/')).toBe(false)
    expect(robotsAllows('User-agent: other\nDisallow:', '/nyheter/')).toBe(false)
    const rules = 'User-agent: *\nDisallow: /nyheter/*\nAllow: /nyheter/open$'
    expect(robotsAllows(rules, '/nyheter/open')).toBe(true)
    expect(robotsAllows(rules, '/nyheter/open/')).toBe(false)
    expect(robotsAllows('User-agent: *\nDisallow: /\nUser-agent: OmniraCompetitorCheck\nAllow: /nyheter/', '/nyheter/a')).toBe(true)
    expect(robotsAllows('User-agent: *\nAllow: /\nDisallow: /', '/a')).toBe(true)
    expect(robotsAllows('User-agent: *\nDisallow: /m/\n\nUser-agent: *\nDisallow: /nyheter/', '/nyheter/a')).toBe(false)
  })

  it('normalizes only a bounded safe title, excluding scripts, markup and controls', () => {
    expect(normalizeTitle('<title> A &amp; B <b>news</b>\u0000 </title>')).toBe('A & B news')
    expect(normalizeTitle('<script><title>Injected</title></script><title>Safe</title>')).toBe('Safe')
    expect(normalizeTitle('<title>&#x3c;img src=x onerror=alert(1)&#x3e;</title>')).toBeNull()
    expect(normalizeTitle('<title>' + 'x'.repeat(400) + '</title>')?.length).toBeLessThanOrEqual(160)
    expect(normalizeTitle('<p>No title</p>')).toBeNull()
    expect(normalizeTitle('<title>Kontakt test@example.se +46 70 123 45 67</title>')).toBe('Kontakt [kontaktuppgift borttagen] [kontaktuppgift borttagen]')
  })

  it('only requests robots then the three immutable allowlisted documents with safe options', async () => {
    const fetcher = fixture()
    const result = await scanPublicSources(fetcher)
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(['https://handlarbudet.se/robots.txt', ...ALLOWED_DOCUMENTS])
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ redirect: 'manual', credentials: 'omit', cache: 'no-store', method: 'GET' })
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(init?.headers).toMatchObject({ 'User-Agent': expect.stringContaining('OmniraCompetitorCheck') })
      expect(init?.headers).not.toHaveProperty('Cookie')
      expect(init?.headers).not.toHaveProperty('Authorization')
    }
    expect(result.sources.every(s => s.status === 'metadata_checked')).toBe(true)
    expect(Number.isNaN(Date.parse(result.checked_at))).toBe(false)
    expect(summarizeScan(result)).toEqual({ checked: 3, failed: 0 })
    expect(Object.isFrozen(EVIDENCE)).toBe(true)
    expect(EVIDENCE.every(Object.isFrozen)).toBe(true)
  })

  it.each([
    () => new Response('missing', { status: 404 }),
    () => new Response('', { status: 302, headers: { location: 'https://evil.example' } }),
    () => new Response('User-agent: *\nDisallow: /nyheter/'),
    () => new Response('<html>not robots</html>'),
    () => new Response('x'.repeat(200001)),
    () => { throw new Error('network unavailable') },
  ])('fails closed for the entire scan when robots fails or denies any source', async (robots) => {
    const fetcher = fixture(() => html(), robots)
    const result = await scanPublicSources(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.sources.every(s => s.status === 'robots_denied')).toBe(true)
  })

  it.each([
    [() => new Response('', { status: 301, headers: { location: 'https://handlarbudet.se/m/private' } }), 'redirect_refused'],
    [() => new Response('error', { status: 500 }), 'http_error'],
    [() => new Response('json', { headers: { 'content-type': 'application/json' } }), 'invalid_content_type'],
    [() => html('<title>' + 'x'.repeat(205000) + '</title>'), 'too_large'],
    [() => new Response('', { headers: { 'content-type': 'text/html', 'content-length': '205000' } }), 'too_large'],
    [() => html('no metadata'), 'metadata_missing'],
    [() => { throw new DOMException('timeout', 'TimeoutError') }, 'fetch_failed'],
  ] as const)('reports document errors conservatively without redirect follow-up', async (document, status) => {
    const fetcher = fixture(document)
    const result = await scanPublicSources(fetcher)
    expect(result.sources.map(s => s.status)).toEqual([status, status, status])
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(summarizeScan(result)).toEqual({ checked: 0, failed: 3 })
  })

  it('cancels a stream as soon as it crosses the byte bound', async () => {
    const cancel = vi.fn()
    const fetcher = fixture(() => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(200001)); }, cancel,
    }), { headers: { 'content-type': 'text/html' } }))
    const result = await scanPublicSources(fetcher)
    expect(result.sources.every(s => s.status === 'too_large')).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(3)
  })
})
