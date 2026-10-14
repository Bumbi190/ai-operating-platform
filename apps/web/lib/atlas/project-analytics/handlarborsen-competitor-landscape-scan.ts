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
 * Read a complete early title from the real document head, before any
 * scriptable element. Ignore completed HTML comments (Squarespace commonly
 * puts them before <title>), but reject unfinished comments/CDATA.
 *
 * Return only a tiny title fragment, never raw remote page markup. This also
 * prevents a fake <title> inside a completed HTML comment from being used.
 */
function safeEarlyTitle(html: string): string | null {
  const head = /<head\b[^>]*>/i.exec(html)
  if (!head) return null
  const afterHead = html.slice(head.index + head[0].length)
  const active = /<\s*\/?(?:script|style|template|noscript|body|iframe|object|svg|head)\b/i.exec(afterHead)
  const prefix = active ? afterHead.slice(0, active.index) : afterHead
  const withoutComments = prefix.replace(/<!--[\s\S]*?-->/g, '')
  if (withoutComments.includes('<!--') || withoutComments.includes('<![CDATA[')) return null
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(withoutComments)
  if (!title || /<[^>]*>/.test(title[1])) return null
  const fragment = '<title>' + title[1] + '</title>'
  return normalizeTitle(fragment) ? fragment : null
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
      // Prefer a bounded, comment-safe title fragment. A full short head may
      // alternatively include a title after a completed script or template.
      if (kind === 'document') {
        const earlyTitle = safeEarlyTitle(result)
        if (earlyTitle) return earlyTitle
        if (/<\/head\s*>/i.test(result)) {
          const withoutComments = result.replace(/<!--[\s\S]*?-->/g, '')
          if (!withoutComments.includes('<!--') && normalizeTitle(withoutComments)) {
            return withoutComments
          }
        }
      }
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
