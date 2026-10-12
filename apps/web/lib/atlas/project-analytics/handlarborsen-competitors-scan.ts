import 'server-only'
import { EVIDENCE, ROBOTS_URL, USER_AGENT, normalizeTitle, robotsAllows, type PublicScan, type SourceStatus } from './handlarborsen-competitors'

const MAX_BYTES = 200_000
const TIMEOUT_MS = 8_000
class CheckError extends Error {
  constructor(readonly status: SourceStatus) { super(status) }
}

/** Fixed URLs only, no retry, no redirect, bounded streaming including robots. */
async function readPublicDocument(url: string, robots: boolean, fetcher: typeof fetch): Promise<string> {
  if (!(robots ? url === ROBOTS_URL : EVIDENCE.some(source => source.url === url))) throw new CheckError('fetch_failed')
  const response = await fetcher(url, {
    method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT, Accept: robots ? 'text/plain' : 'text/html' },
  })
  const cancel = async () => { try { await response.body?.cancel() } catch { /* no data retained */ } }
  if (response.status >= 300 && response.status < 400 || response.redirected) {
    await cancel(); throw new CheckError('redirect_refused')
  }
  if (response.status !== 200) { await cancel(); throw new CheckError('http_error') }
  if (!robots && response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/html') {
    await cancel(); throw new CheckError('invalid_content_type')
  }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await cancel(); throw new CheckError('too_large') }
  if (!response.body) throw new CheckError('metadata_missing')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0, text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BYTES) throw new CheckError('too_large')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    try { await reader.cancel() } catch { /* preserve conservative original error */ }
    reader.releaseLock()
  }
}

/** Called only by the authorized manual POST store. No persistence or historical comparison here. */
export async function scanPublicSources(fetcher: typeof fetch = fetch): Promise<PublicScan> {
  const checked_at = new Date().toISOString()
  let allowed = false
  try {
    const policy = await readPublicDocument(ROBOTS_URL, true, fetcher)
    allowed = EVIDENCE.every(source => robotsAllows(policy, new URL(source.url).pathname))
  } catch { /* any robots failure denies the entire scan */ }
  if (!allowed) return {
    checked_at, sources: EVIDENCE.map(source => ({ id: source.id, status: 'robots_denied', title: null, checked_at })),
  }
  const sources: PublicScan['sources'][number][] = []
  for (const source of EVIDENCE) {
    const sourceCheckedAt = new Date().toISOString()
    try {
      const title = normalizeTitle(await readPublicDocument(source.url, false, fetcher))
      sources.push({ id: source.id, status: title ? 'metadata_checked' : 'metadata_missing', title, checked_at: sourceCheckedAt })
    } catch (error) {
      sources.push({ id: source.id, status: error instanceof CheckError ? error.status : 'fetch_failed', title: null, checked_at: sourceCheckedAt })
    }
  }
  return { checked_at, sources }
}
