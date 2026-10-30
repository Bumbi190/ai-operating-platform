import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const authorized = () => new Request('https://example.test/api/media/cron/warmup', {
  headers: { authorization: 'Bearer synthetic-cron-secret' },
})

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('HERMES_URL', 'https://hermes.example.test')
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Hermes warmup deadline', () => {
  it('keeps unauthorized requests away from Hermes', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { GET } = await import('@/app/api/media/cron/warmup/route')
    expect((await GET(new Request('https://example.test'))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed when the cron secret is absent', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { GET } = await import('@/app/api/media/cron/warmup/route')
    expect((await GET(authorized())).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('skips unconfigured Hermes without network work', async () => {
    vi.stubEnv('HERMES_URL', '')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { GET } = await import('@/app/api/media/cron/warmup/route')
    expect(await (await GET(authorized())).json()).toMatchObject({ status: 'skipped' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('lets a 50-second cold start finish inside the function budget', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), ms)
      return controller.signal
    })
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(null, { status: 200 })), 50_000)
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Synthetic timeout', 'TimeoutError'))
      }, { once: true })
    })))
    const { GET, maxDuration } = await import('@/app/api/media/cron/warmup/route')
    let finished = false
    const pending = GET(authorized()).then(response => { finished = true; return response })
    await vi.advanceTimersByTimeAsync(49_999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await (await pending).json()).toMatchObject({ status: 'warm', hermes: true })
    expect(maxDuration * 1000).toBeGreaterThan(55_000)
  })

  it('aborts a nonresponding transport and returns cold before the function limit', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), ms)
      return controller.signal
    })
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal
      signal?.addEventListener('abort', () => reject(new DOMException('Synthetic timeout', 'TimeoutError')), { once: true })
    })))
    const { GET, maxDuration } = await import('@/app/api/media/cron/warmup/route')
    let finished = false
    const pending = GET(authorized()).then(response => { finished = true; return response })
    await vi.advanceTimersByTimeAsync(54_999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal?.aborted).toBe(true)
    expect(finished).toBe(true)
    expect(await (await pending).json()).toMatchObject({ status: 'cold', hermes: false })
    expect(maxDuration * 1000).toBeGreaterThan(55_000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([503, 401])('returns cold for HTTP %s without retrying', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    const { GET } = await import('@/app/api/media/cron/warmup/route')
    expect(await (await GET(authorized())).json()).toMatchObject({ status: 'cold', hermes: false })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps network exception details out of the public response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('synthetic-private-detail')))
    const { GET } = await import('@/app/api/media/cron/warmup/route')
    const response = await GET(authorized())
    expect(await response.text()).not.toContain('synthetic-private-detail')
  })

  it('cancels a real local HTTP request that never returns headers', async () => {
    const server = createServer(() => {})
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    vi.stubEnv('HERMES_URL', `http://127.0.0.1:${port}`)
    try {
      const { checkHermesHealth } = await import('@/lib/media/hermes')
      // Native fetch and native AbortSignal: verifies actual transport cancellation.
      let watchdog: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          checkHermesHealth(50),
          new Promise<string>(resolve => { watchdog = setTimeout(() => resolve('request still pending'), 500) }),
        ])
        expect(result).toBe(false)
      } finally {
        clearTimeout(watchdog)
      }
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }, 2000)
})
