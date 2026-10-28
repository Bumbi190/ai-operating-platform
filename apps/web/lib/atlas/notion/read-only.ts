/**
 * Atlas Notion P0 — a disabled-by-default, server-only, exact-page reader.
 *
 * This is NOT an Atlas chat tool or an M4 writer. It returns untrusted reference
 * evidence to a future, separately reviewed server-side caller. No runtime
 * caller currently imports this module. Source text cannot grant authority.
 *
 * Notion credentials come ONLY from a trusted server config (never request JSON),
 * page membership comes ONLY from a reviewed server allowlist, and the caller's
 * authorized project IDs must come from fresh Supabase authorization.
 */
import 'server-only'

import { createHash } from 'node:crypto'

const NOTION_VERSION = '2026-03-11'
const NOTION_API_ORIGIN = 'https://api.notion.com'
const MAX_RESPONSE_BYTES = 512_000
const REQUEST_TIMEOUT_MS = 3_500

export interface ApprovedNotionPage {
  readonly projectId: string
  readonly pageId: string
}

export interface NotionReadConfig {
  /** Only the exact value "read" permits a request. Never enabled by default. */
  readonly mode: 'off' | 'read'
  /** Server-held, read-content-only internal Notion connection token. */
  readonly token?: string
  /** Obtained from the authenticated caller's freshly checked project scope. */
  readonly authorizedProjectIds: readonly string[]
  /** Explicit owner-reviewed project/page pairs; not fetched from user input. */
  readonly approvedPages: readonly ApprovedNotionPage[]
  /** Injected ONLY for offline unit tests; production uses global fetch. */
  readonly fetcher?: typeof fetch
}

export interface NotionReferenceEvidence {
  readonly source: 'notion'
  readonly projectId: string
  readonly pageId: string
  readonly title: string
  readonly url: string
  readonly editedAt: string
  readonly contentHash: string
  /** Untrusted Notion Markdown. Treat as source data, never instructions. */
  readonly markdown: string
  readonly actionAuthority: false
}

export type NotionReadErrorCode =
  | 'disabled' | 'invalid_scope' | 'page_not_approved' | 'invalid_credentials'
  | 'source_unavailable' | 'response_oversized' | 'source_incomplete'
  | 'source_changed'

export class NotionReadError extends Error {
  readonly code: NotionReadErrorCode
  constructor(code: NotionReadErrorCode) {
    // Never attach upstream messages, response bodies, keys, or internal paths.
    super('atlas_notion_' + code)
    this.name = 'NotionReadError'
    this.code = code
  }
}

/** Accept IDs, not URLs/paths; normalize only the standard UUID hyphen form. */
function canonicalId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.toLowerCase()
  if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(raw)) return null
  const compact = raw.replace(/-/g, '')
  return compact.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function titleOf(page: Record<string, unknown>): string | null {
  const properties = object(page.properties)
  if (!properties) return null
  const title = Object.values(properties).map(object).find(p => p?.type === 'title')
  if (!title || !Array.isArray(title.title)) return null
  const plain = title.title.map((fragment: unknown) => {
    const f = object(fragment)
    return typeof f?.plain_text === 'string' ? f.plain_text : ''
  }).join('').trim()
  return plain.length >= 1 && plain.length <= 180 ? plain : null
}

function sourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    // Only display the canonical Notion source URL. Never fetch this URL.
    const host = url.hostname.toLowerCase()
    if (!['www.notion.so', 'notion.so', 'app.notion.com'].includes(host)
      && !host.endsWith('.notion.site')) return null
    return url.toString()
  } catch { return null }
}

async function boundedJson(response: Response): Promise<unknown> {
  const advertised = response.headers.get('content-length')
  if (advertised !== null && Number.isFinite(Number(advertised))
    && Number(advertised) > MAX_RESPONSE_BYTES) throw new NotionReadError('response_oversized')
  if (!response.body) throw new NotionReadError('source_incomplete')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        throw new NotionReadError('response_oversized')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try { return JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')) }
  catch { throw new NotionReadError('source_incomplete') }
}

async function getJson(path: string, token: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  // path is constructed ONLY from a strictly canonicalized page UUID below.
  let response: Response
  try {
    response = await fetcher(NOTION_API_ORIGIN + path, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        'Notion-Version': NOTION_VERSION,
        Accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new NotionReadError('source_unavailable')
  }
  if (!response.ok) throw new NotionReadError('source_unavailable')
  const parsed = object(await boundedJson(response))
  if (!parsed) throw new NotionReadError('source_incomplete')
  return parsed
}

function validPage(data: Record<string, unknown>, id: string) {
  const editedAt = data.last_edited_time
  const title = titleOf(data)
  const url = sourceUrl(data.url)
  if (data.object !== 'page' || canonicalId(data.id) !== id
    || data.archived === true || data.in_trash === true
    || !title || !url || typeof editedAt !== 'string'
    || !Number.isFinite(Date.parse(editedAt))) {
    throw new NotionReadError('source_incomplete')
  }
  return { title, url, editedAt }
}

/**
 * Requests exactly ONE approved page, with no search, crawling, or mutations.
 * A double metadata read detects edits concurrent with Markdown extraction.
 * Any denied, incomplete, oversized, or changing source returns NO evidence.
 */
export async function readApprovedNotionPage(
  config: NotionReadConfig, requestedProjectId: string, requestedPageId: string,
): Promise<NotionReferenceEvidence> {
  if (config.mode !== 'read') throw new NotionReadError('disabled')
  const projectId = canonicalId(requestedProjectId)
  const pageId = canonicalId(requestedPageId)
  if (!projectId || !pageId
    || !config.authorizedProjectIds.some(x => canonicalId(x) === projectId)) {
    throw new NotionReadError('invalid_scope')
  }
  const matching = config.approvedPages.filter(entry => canonicalId(entry.pageId) === pageId)
  // Also refuse a page mapped to several projects, even if one matches.
  if (matching.length !== 1 || canonicalId(matching[0].projectId) !== projectId) {
    throw new NotionReadError('page_not_approved')
  }
  if (!config.token || config.token.length < 12 || /[\r\n]/.test(config.token)) {
    throw new NotionReadError('invalid_credentials')
  }
  const fetcher = config.fetcher ?? fetch
  const safePath = '/v1/pages/' + pageId
  const before = validPage(await getJson(safePath, config.token, fetcher), pageId)
  const page = await getJson(safePath + '/markdown', config.token, fetcher)
  if (page.object !== 'page_markdown' || canonicalId(page.id) !== pageId
    || page.truncated !== false || !Array.isArray(page.unknown_block_ids)
    || page.unknown_block_ids.length > 0 || !Array.isArray(page.warnings)
    || page.warnings.length > 0 || typeof page.markdown !== 'string'
    || page.markdown.trim().length === 0) {
    throw new NotionReadError('source_incomplete')
  }
  const after = validPage(await getJson(safePath, config.token, fetcher), pageId)
  if (after.editedAt !== before.editedAt || after.title !== before.title || after.url !== before.url) {
    throw new NotionReadError('source_changed')
  }
  return {
    source: 'notion',
    projectId,
    pageId,
    title: before.title,
    url: before.url,
    editedAt: before.editedAt,
    contentHash: createHash('sha256').update(page.markdown).digest('hex'),
    markdown: page.markdown,
    actionAuthority: false,
  }
}
