import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { loadHandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import { HandlarborsenPosthogTraffic } from '@/components/platform/vnext/HandlarborsenPosthogTraffic'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
;(globalThis as unknown as { React: typeof React }).React = React
const project = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG }
const scope = { allowedProjectIds: [project.id] }
const env = { HANDLARBORSEN_POSTHOG_PROJECT_ID: '245437', HANDLARBORSEN_POSTHOG_READ_TOKEN: 'phx_test_readonly_0123456789' }
const now = new Date('2026-11-05T14:00:00Z')
const days = ['2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05']
const trends = { results: [
  { order: 0, days, data: [0,0,0,0,0,2,0] },
  { order: 1, days, data: [0,0,0,0,0,1,0] },
  { order: 2, days, data: [0,0,0,0,0,0,0] },
] }
function reader(sessionResponse: () => Response | Promise<Response>) {
  const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    const query = JSON.parse(String(options?.body)).query
    if (query.kind === 'TrendsQuery') return Response.json(trends)
    if (query.kind === 'WebOverviewQuery') return sessionResponse()
    throw Error('Unexpected provider query')
  })
  return { fetcher, run: () => loadHandlarborsenTraffic(project, scope, { env, now, fetcher }) }
}
const sessions = (value: unknown) => Response.json({ results: [
  { key: 'visitors', kind: 'unit', value: 1, previous: null },
  { key: 'views', kind: 'unit', value: 2, previous: null },
  { key: 'sessions', kind: 'unit', value, previous: null },
] })
describe('PostHog sessions for the complete UTC period', () => {
  it('reads the native period count and renders it with its measurement limits', async () => {
    const { run, fetcher } = reader(() => sessions(1))
    const traffic = await run()
    expect(traffic).toMatchObject({ status: 'available', totalPageviews: 2, sessions: { status: 'available', count: 1 } })
    expect(fetcher).toHaveBeenCalledTimes(2)
    const [, options] = fetcher.mock.calls.find(([, options]) => JSON.parse(String(options?.body)).query.kind === 'WebOverviewQuery')!
    const body = JSON.parse(String(options?.body))
    expect(body.query.dateRange).toEqual({ date_from: '2026-10-30', date_to: '2026-11-05' })
    expect(body.query.properties).toEqual([{ key: '$host', type: 'event', operator: 'exact', value: ['handlarborsen.se','www.handlarborsen.se'] }])
    expect(body.query.filterTestAccounts).toBe(false)
    expect(body.query.compareFilter?.compare ?? false).toBe(false)
    expect(options?.redirect).toBe('error')
    expect(options?.cache).toBe('no-store')
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer ' + env.HANDLARBORSEN_POSTHOG_READ_TOKEN })
    if (traffic?.status !== 'available') throw Error('Expected available traffic')
    const html = renderToStaticMarkup(createElement(HandlarborsenPosthogTraffic, { traffic }))
    expect(html).toContain('PostHog-sessioner')
    expect(html).toContain('cookieless')
    expect(html).toContain('inte ett exakt antal personer')
    expect(html).not.toContain('Inväntar verifierad sessionsmätning')
  })
  it('preserves actual zero sessions rather than treating zero as missing', async () => {
    expect(await reader(() => sessions(0)).run()).toMatchObject({ sessions: { status: 'available', count: 0 } })
  })
  it.each([-1, '1', 1.5, null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sessions %s while retaining pageviews', async value => {
    expect(await reader(() => sessions(value)).run()).toMatchObject({ status: 'available', totalPageviews: 2, sessions: { status: 'unavailable' } })
  })
  it('rejects a missing or duplicate sessions metric', async () => {
    for (const results of [[], [{ key: 'sessions', kind: 'unit', value: 1 }, { key: 'sessions', kind: 'unit', value: 2 }]]) {
      expect(await reader(() => Response.json({ results })).run()).toMatchObject({ status: 'available', sessions: { status: 'unavailable' } })
    }
  })
  it.each([403, 500, 202])('keeps existing traffic when the sessions provider returns %s', async status => {
    const traffic = await reader(() => Response.json({}, { status })).run()
    expect(traffic).toMatchObject({ status: 'available', totalPageviews: 2, sessions: { status: status === 403 ? 'missing_permission' : 'unavailable' } })
    if (traffic?.status !== 'available') throw Error('Expected traffic')
    const html = renderToStaticMarkup(createElement(HandlarborsenPosthogTraffic, { traffic }))
    expect(html.replace(/<[^>]*>/g, '')).toContain('Sessioner—')
    if (status === 403) expect(html).toContain('Läsbehörighet för sessioner saknas')
  })
  it('contains sessions network and oversized-body failures independently', async () => {
    for (const result of [() => Promise.reject(new Error('network')), () => new Response('x'.repeat(32769))]) {
      expect(await reader(result).run()).toMatchObject({ status: 'available', totalPageviews: 2, sessions: { status: 'unavailable' } })
    }
  })
  it('does not read either source without project authorization', async () => {
    const fetcher = vi.fn()
    expect(await loadHandlarborsenTraffic(project, { allowedProjectIds: [] }, { env, now, fetcher })).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

it('retains parsed pageviews when sessions consumes the entire shared deadline', async () => {
  vi.useFakeTimers()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Deadline', 'TimeoutError')), ms)
    return controller.signal
  })
  try {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      if (JSON.parse(String(options?.body)).query.kind === 'TrendsQuery') return Response.json(trends)
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
      })
    })
    const pending = loadHandlarborsenTraffic(project, scope, { env, now, fetcher })
    await vi.advanceTimersByTimeAsync(7000)
    expect(await pending).toMatchObject({ status: 'available', totalPageviews: 2, sessions: { status: 'unavailable' } })
  } finally {
    timeout.mockRestore()
    vi.useRealTimers()
  }
})
