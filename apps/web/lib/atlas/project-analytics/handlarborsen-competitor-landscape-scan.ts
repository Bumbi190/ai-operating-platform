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

/**
 * Accept a short, complete <title> before any active/scriptable markup in the
 * document head. A malformed/unfinished script or an HTML comment cannot supply
 * a trusted early title. The existing normalizer still strips unsafe content.
 */
function hasSafeEarlyTitle(html: string): boolean {
  const head = /<head\b[^>]*>/i.exec(html)
  const title = /<title\b[^>]*>[\s\S]*?<\/title\s*>/i.exec(html)
  if (!head || !title || title.index < head.index + head[0].length) return false
  const preceding = html.slice(head.index + head[0].length, title.index)
  if (/<\s*\/?(?:script|style|template|noscript|body|iframe|object|svg)\b/i.test(preceding))
    return false
  if (preceding.includes('<!--') || preceding.includes('<![CDATA[')) return false
  return normalizeTitle(html) !== null
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
    throw new RejectedSource('robots_unavailable')
  }
  const contentLength = response.headers.get('content-length')
  // robots rules must be fully read, but a public HTML title may occur in
  // the first 200 KB of a document whose *total* size is much larger.
  if (kind === 'robots' && contentLength && Number(contentLength) > MAX_BYTES) {
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
      const remaining = MAX_BYTES - bytes
      if (remaining <= 0) throw new RejectedSource('too_large')
      // Inspect no more than the bounded prefix, even if a server delivers
      // an oversized chunk; always cancel the stream after finding the title.
      const prefix = chunk.value.subarray(0, remaining)
      bytes += prefix.byteLength
      result += decoder.decode(prefix, { stream: true })
      // A valid title before the first executable tag may be accepted without
      // waiting for a potentially enormous head. Otherwise require the whole
      // head before using the normalizer (which removes complete scripts).
      if (kind === 'document' && (
        hasSafeEarlyTitle(result) || (/<\/head\s*>/i.test(result) && normalizeTitle(result))
      )) return result
      if (chunk.value.byteLength > remaining) throw new RejectedSource('too_large')
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
      if (!robotsAllows(policy, new URL(site.url).pathname)) {
        // A challenge/error document is not a known Disallow directive.
        // We still refuse to access the source in either case.
        if (/^\s*</.test(policy) || !/(?:^|\n)\s*user-agent\s*:/i.test(policy)) {
          status = 'robots_unavailable'
        }
      } else {
        try {
          title = normalizeTitle(await readBounded(site.url, 'document', fetcher))
          status = title ? 'metadata_checked' : 'metadata_missing'
        } catch (error) {
          status = error instanceof RejectedSource ? error.status : 'fetch_failed'
        }
      }
    } catch {
      // Network/challenge/invalid robots is not evidence of an explicit
      // Disallow directive. Fail closed while stating the accurate reason.
      status = 'robots_unavailable'
    }
    observations.push({ id: site.id, title, status, checkedAt: observedAt })
  }
  return { checkedAt, observations }
}
