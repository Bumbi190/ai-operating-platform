/**
 * Atlas OpenViking P1: disabled-by-default, single-endpoint search-only transport.
 * Unlike the broad draft #343 transport, callers cannot send arbitrary methods
 * or invoke resource write/delete APIs. Nothing in production imports this.
 */
import 'server-only'

export interface OpenVikingReadConfig {
  readonly baseUrl: string
  readonly apiKey: string
  readonly timeoutMs: number
}

const RESPONSE_LIMIT = 131_072
const PROJECT_ROOT = /^viking:\/\/resources\/omnira\/projects\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/knowledge\/[0-9a-f]{64}$/

function originOf(input: string): string | null {
  try {
    const url = new URL(input)
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    return (!url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/' && !!url.hostname
      && (url.protocol === 'https:' || (local && url.protocol === 'http:')))
      ? url.origin : null
  } catch { return null }
}

function validKey(key: unknown): key is string {
  return typeof key === 'string' && key.trim().length >= 12
    && key.length <= 1_024 && !/[\r\n]/.test(key)
}

export function readClientConfig(env: Record<string, string | undefined> = process.env): OpenVikingReadConfig | null {
  if (env.ATLAS_OPENVIKING_MODE !== 'read' || !validKey(env.ATLAS_OPENVIKING_API_KEY)) return null
  const baseUrl = originOf(env.ATLAS_OPENVIKING_URL ?? '')
  return baseUrl ? { baseUrl, apiKey: env.ATLAS_OPENVIKING_API_KEY, timeoutMs: 1_200 } : null
}

/** The response is untrusted IDs/metadata, never source evidence itself. */
export async function searchOpenVikingIdentifiers(args: {
  config: OpenVikingReadConfig
  projectRoot: string
  query: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}): Promise<unknown> {
  const base = originOf(args.config.baseUrl)
  if (!base || !validKey(args.config.apiKey) || !PROJECT_ROOT.test(args.projectRoot)
    || !args.query.trim() || args.query.length > 2_000) {
    throw new Error('OpenViking read rejected')
  }
  const control = new AbortController()
  const abort = () => control.abort()
  if (args.signal?.aborted) control.abort()
  else args.signal?.addEventListener('abort', abort, { once: true })
  const duration = Number.isFinite(args.config.timeoutMs)
    ? Math.max(1, Math.min(args.config.timeoutMs, 5_000))
    : 1_200
  const timer = setTimeout(abort, duration)
  try {
    const response = await (args.fetcher ?? fetch)(base + '/api/v1/search/find', {
      method: 'POST',
      headers: { 'X-API-Key': args.config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: args.query.trim(), target_uri: args.projectRoot,
        context_type: 'resource', level: 2, limit: 8 }),
      redirect: 'error', cache: 'no-store', credentials: 'omit', signal: control.signal,
    })
    if (!response.ok || !response.body) throw new Error('OpenViking source unavailable')
    const size = response.headers.get('content-length')
    if (size !== null && Number.isFinite(Number(size)) && Number(size) > RESPONSE_LIMIT) {
      throw new Error('OpenViking oversized response')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        bytes += next.value.byteLength
        if (bytes > RESPONSE_LIMIT) throw new Error('OpenViking oversized response')
        chunks.push(next.value)
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    clearTimeout(timer)
    args.signal?.removeEventListener('abort', abort)
  }
}
