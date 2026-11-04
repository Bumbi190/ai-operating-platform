/**
 * Narrow server-side PostHog REST adapter. NOT wired into any Nova route.
 * A trusted caller must supply a project-scoped configuration and an
 * already-authorized request. This module never grants authorization.
 * API reference: https://posthog.com/docs/api/dashboards
 */
export type PosthogReadConfig = Readonly<{
  projectId: number
  personalApiKey: string
  appHost: 'https://eu.posthog.com' | 'https://us.posthog.com'
}>

export type PosthogDashboardSummary = Readonly<{ id: number; name: string }>
export type PosthogDashboardResponse = Readonly<{ dashboards: PosthogDashboardSummary[] }>

const MAX_RESPONSE_BYTES = 1024 * 1024

/** Cap decoded bytes as well as advertised length; never trust upstream JSON. */
async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {})
    throw new Error('posthog_response_too_large')
  }
  if (!response.body) throw new Error('posthog_invalid_response')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  const tooLarge = new Error('posthog_response_too_large')
  let finished = false
  try {
    signal.throwIfAborted()
    while (true) {
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) { finished = true; break }
      size += chunk.value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw tooLarge
      chunks.push(chunk.value)
    }
  } catch (error) {
    if (error === tooLarge) throw tooLarge
    throw new Error('posthog_read_failed')
  } finally {
    signal.removeEventListener('abort', cancel)
    if (!finished) cancel()
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    // JSON.parse errors may quote sensitive source text. Do not retain cause.
    throw new Error('posthog_invalid_response')
  }
}

export async function readPosthogDashboards(
  config: PosthogReadConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PosthogDashboardResponse> {
  if (!Number.isSafeInteger(config.projectId) || config.projectId <= 0) {
    throw new Error('posthog_invalid_project')
  }
  if (!['https://eu.posthog.com', 'https://us.posthog.com'].includes(config.appHost)) {
    throw new Error('posthog_invalid_host')
  }
  if (!config.personalApiKey || !config.personalApiKey.trim()) {
    throw new Error('posthog_missing_private_key')
  }
  const url = new URL(`/api/projects/${config.projectId}/dashboards/`, config.appHost)
  url.searchParams.set('limit', '10')
  url.searchParams.set('offset', '0')
  const signal = AbortSignal.timeout(5000)
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.personalApiKey}`, Accept: 'application/json' },
      signal,
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    // Transport/header/redirect errors may contain URLs or credentials.
    throw new Error('posthog_read_failed')
  }
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => {})
    throw new Error('posthog_read_failed')
  }
  const body = await readBoundedJson(response, signal)
  if (!body || typeof body !== 'object' || !('results' in body) || !Array.isArray(body.results)) {
    throw new Error('posthog_invalid_response')
  }
  const results = body.results.slice(0, 10)
  const dashboards: PosthogDashboardSummary[] = results.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('id' in item) || !('name' in item) ||
      typeof item.id !== 'number' || !Number.isSafeInteger(item.id) || item.id <= 0 ||
      typeof item.name !== 'string') {
      throw new Error('posthog_invalid_response')
    }
    return { id: item.id, name: item.name.slice(0, 150) }
  })
  return { dashboards }
}
