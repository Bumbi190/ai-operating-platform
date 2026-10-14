import 'server-only'
import {
  COMPETITOR_SITES,
  type LandscapeObservation,
  type LandscapeScan,
  type LandscapeSourceStatus,
} from './handlarborsen-competitor-landscape'
import { normalizeTitle, robotsAllows, USER_AGENT } from './handlarborsen-competitors'

const MAX_BYTES = 200_000
const REQUEST_TIMEOUT_MS = 8_000

class RejectedSource extends Error {
  constructor(readonly status: LandscapeSourceStatus) { super(status) }
}

async function readBounded(url: string, kind: 'robots' | 'document', fetcher: typeof fetch): Promise<string> {
  const allowed = COMPETITOR_SITES.some(site =>
    kind === 'robots' ? site.robotsUrl === url : site.url === url,
  )
  if (!allowed) throw new RejectedSource('fetch_failed')
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: kind === 'robots' ? 'text/plain' : 'text/html',
    },
  })
  const cancel = async () => { try { await response.body?.cancel() } catch {} }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    await cancel()
    throw new RejectedSource('redirect_refused')
  }
  if (response.status !== 200) {
    await cancel()
    throw new RejectedSource('http_error')
  }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (kind === 'document' && contentType !== 'text/html') {
    await cancel()
    throw new RejectedSource('invalid_content_type')
  }
  if (kind === 'robots' && contentType && contentType !== 'text/plain') {
    await cancel()
    throw new RejectedSource('robots_denied')
  }
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    await cancel()
    throw new RejectedSource('too_large')
  }
  if (!response.body) throw new RejectedSource('metadata_missing')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0, result = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BYTES) throw new RejectedSource('too_large')
      result += decoder.decode(chunk.value, { stream: true })
    }
    return result + decoder.decode()
  } finally {
    try { await reader.cancel() } catch {}
    reader.releaseLock()
  }
}

/** Owner-initiated, three fixed competitor URLs; max six GETs, no retries or writes. */
export async function scanCompetitorLandscape(fetcher: typeof fetch = fetch): Promise<LandscapeScan> {
  const checkedAt = new Date().toISOString()
  const observations: LandscapeObservation[] = []
  for (const site of COMPETITOR_SITES) {
    const observedAt = new Date().toISOString()
    let status: LandscapeSourceStatus = 'robots_denied'
    let title: string | null = null
    try {
      const policy = await readBounded(site.robotsUrl, 'robots', fetcher)
      if (robotsAllows(policy, new URL(site.url).pathname)) {
        try {
          title = normalizeTitle(await readBounded(site.url, 'document', fetcher))
          status = title ? 'metadata_checked' : 'metadata_missing'
        } catch (error) {
          status = error instanceof RejectedSource ? error.status : 'fetch_failed'
        }
      }
    } catch {
      status = 'robots_denied'
    }
    observations.push({ id: site.id, title, status, checkedAt: observedAt })
  }
  return { checkedAt, observations }
}
