/** Server-side HTTP transport. Never logs URLs, credentials, responses or source text. */
export interface OpenVikingConfig { baseUrl: string; apiKey: string; timeoutMs: number }
export function readClientConfig(env: Record<string, string | undefined> = process.env): OpenVikingConfig | null {
  try {
    const key = env.ATLAS_OPENVIKING_API_KEY
    if (!key || key.length > 1024 || /[\r\n]/.test(key)) return null
    const url = new URL(env.ATLAS_OPENVIKING_URL ?? '')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) return null
    return { baseUrl: url.href.replace(/\/+$/, ''), apiKey: key, timeoutMs: 1200 }
  } catch { return null }
}
export async function requestJson(
  config: OpenVikingConfig, path: string, init: RequestInit = {}, signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, config.timeoutMs)
  try {
    const headers = new Headers(init.headers)
    headers.set('X-API-Key', config.apiKey)
    if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
    const response = await fetch(config.baseUrl + path, {
      ...init, headers, signal: controller.signal, redirect: 'error', cache: 'no-store',
    })
    if (!response.ok || !response.body) throw new Error('OpenViking request failed')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        length += next.value.byteLength
        if (length > 131_072) throw new Error('OpenViking response exceeds limit')
        chunks.push(next.value)
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
