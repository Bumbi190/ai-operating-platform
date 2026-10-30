import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const article = { success: true, url: 'https://article.example.test/story', title: 'Synthetic story', text: 'Synthetic text', word_count: 2 }
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('HERMES_URL', 'https://hermes.example.test')
  vi.stubEnv('HERMES_SECRET', 'synthetic-test-secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
function fakeDeadlines() {
  vi.useFakeTimers()
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), ms)
    return controller.signal
  })
}
describe('Hermes article transport deadlines', () => {
  it.each(['headers', 'body'])('aborts a stalled %s read at the caller budget', async stage => {
    fakeDeadlines()
    let signal: AbortSignal | undefined
    const hung = () => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Synthetic timeout', 'TimeoutError')), { once: true })
    })
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      signal = init?.signal
      return stage === 'headers' ? hung() : Promise.resolve({ ok: true, json: hung })
    }))
    const { callHermesRead } = await import('@/lib/media/hermes')
    let finished = false
    const pending = callHermesRead(article.url, 10_000).then(value => { finished = true; return value })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal?.aborted).toBe(true)
    expect(finished).toBe(true)
    expect(await pending).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('preserves the longer default allowance for other consumers', async () => {
    fakeDeadlines()
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((resolve, reject) => {
      setTimeout(() => resolve(Response.json(article)), 15_000)
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })))
    const { callHermesRead } = await import('@/lib/media/hermes')
    const pending = callHermesRead(article.url)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await pending).toEqual(article)
  })
  it('retains the existing authenticated request and successful article response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(article)))
    const { callHermesRead } = await import('@/lib/media/hermes')
    expect(await callHermesRead(article.url, 10_000)).toEqual(article)
    expect(fetch).toHaveBeenCalledWith('https://hermes.example.test/read', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-test-secret' },
      body: JSON.stringify({ url: article.url }),
    }))
  })
  it('keeps HTTP failures on the existing null fallback without retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    const { callHermesRead } = await import('@/lib/media/hermes')
    expect(await callHermesRead(article.url, 10_000)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does no network work when Hermes is unconfigured', async () => {
    vi.stubEnv('HERMES_URL', '')
    vi.stubGlobal('fetch', vi.fn())
    const { callHermesRead } = await import('@/lib/media/hermes')
    expect(await callHermesRead(article.url, 10_000)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('cancels a native loopback POST that never returns headers', async () => {
    const server = createServer(() => {})
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    vi.stubEnv('HERMES_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    let watchdog: ReturnType<typeof setTimeout> | undefined
    try {
      const { callHermesRead } = await import('@/lib/media/hermes')
      const result = await Promise.race([
        callHermesRead(article.url, 50),
        new Promise<string>(resolve => { watchdog = setTimeout(() => resolve('still pending'), 500) }),
      ])
      expect(result).toBeNull()
    } finally {
      clearTimeout(watchdog)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }, 2000)
})
