/**
 * Standalone FactCheck source intake. No live caller, no model or DB writes.
 *
 * Only a trusted/egress-restricted reader may be injected. This module itself
 * does NOT fetch URLs. A URL allowlist is NOT a complete SSRF defense: actual
 * network egress must prohibit DNS rebinding, redirects to private IPs, and
 * arbitrary outbound destinations BEFORE this becomes a live route.
 */
import {createHash} from 'node:crypto'
import type {SourceKind, SourceSnapshot} from './contract'

interface PublisherPolicy {
  readonly group: string
  readonly kind: SourceKind
}
/** Explicit host identities. Never derive a publisher group from LLM output. */
const PUBLISHERS: Readonly<Record<string, PublisherPolicy>> = Object.freeze({
  'wired.com': {group: 'condenast', kind: 'independent_reporting'},
  'www.wired.com': {group: 'condenast', kind: 'independent_reporting'},
  'arstechnica.com': {group: 'condenast', kind: 'independent_reporting'},
  'www.arstechnica.com': {group: 'condenast', kind: 'independent_reporting'},
  'theverge.com': {group: 'voxmedia', kind: 'independent_reporting'},
  'www.theverge.com': {group: 'voxmedia', kind: 'independent_reporting'},
  'reuters.com': {group: 'reuters', kind: 'independent_reporting'},
  'www.reuters.com': {group: 'reuters', kind: 'independent_reporting'},
  'apnews.com': {group: 'associatedpress', kind: 'independent_reporting'},
  'www.apnews.com': {group: 'associatedpress', kind: 'independent_reporting'},
  'bbc.com': {group: 'bbc', kind: 'independent_reporting'},
  'www.bbc.com': {group: 'bbc', kind: 'independent_reporting'},
  'bbc.co.uk': {group: 'bbc', kind: 'independent_reporting'},
  'www.bbc.co.uk': {group: 'bbc', kind: 'independent_reporting'},
  'techcrunch.com': {group: 'techcrunch', kind: 'independent_reporting'},
  'www.techcrunch.com': {group: 'techcrunch', kind: 'independent_reporting'},
  'openai.com': {group: 'openai', kind: 'primary'},
  'www.openai.com': {group: 'openai', kind: 'primary'},
  'anthropic.com': {group: 'anthropic', kind: 'primary'},
  'www.anthropic.com': {group: 'anthropic', kind: 'primary'},
  'deepmind.google': {group: 'google', kind: 'primary'},
  'blog.google': {group: 'google', kind: 'primary'},
  'research.google': {group: 'google', kind: 'primary'},
  'www.gov.uk': {group: 'uk-government', kind: 'primary'},
  'gov.uk': {group: 'uk-government', kind: 'primary'},
  'questions-statements.parliament.uk': {group: 'uk-parliament', kind: 'primary'},
})

export type SourceRef = Readonly<{url: string; group: string; kind: SourceKind}>
export type ReadResult = {
  success: boolean
  /** FINAL URL, not the requested URL, as observed by the trusted reader. */
  url: string
  title: string
  text: string
}
/** The future network adapter is responsible for enforcing the passed signal. */
export type SourceReader = (url: string, signal: AbortSignal) => Promise<ReadResult | null>
export type SourceReceipt = Readonly<{
  sourceId: string
  url: string
  publisherGroup: string
  retrievedAt: string
  textSha256: string
  characterCount: number
}>
export type SourceCollection =
  | Readonly<{ok: true; snapshots: readonly SourceSnapshot[]; receipts: readonly SourceReceipt[]}>
  | Readonly<{ok: false; reason: string; snapshots: readonly []; receipts: readonly []}>

const MAX_URL_CHARS = 1800
const MAX_TEXT_CHARS = 36_000
const MIN_TEXT_CHARS = 70
const MAX_SOURCES = 6
const PER_SOURCE_TIMEOUT_MS = 7_000

/**
 * Canonicalizes only explicitly approved public news/primary-source hosts.
 * Refuses credentials, custom ports, insecure URLs, arbitrary query parameters,
 * fragment and domain suffix tricks. Tracking params may be stripped safely.
 */
export function recognizeSource(input: unknown): SourceRef | null {
  if (typeof input !== 'string' || !input || input.length > MAX_URL_CHARS) return null
  try {
    // URL() normalizes ../ and %2e%2e away. Inspect the RAW route first.
    const rawRoute = input.slice(input.indexOf('/', input.indexOf('://') + 3))
      .split(/[?#]/, 1)[0]
    if (/%2e|%2f|%5c|%00/i.test(rawRoute) ||
        /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawRoute)) return null
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.port || url.hash || url.hostname.endsWith('.') ||
        url.pathname === '/' || url.pathname.length > 1000 ||
        url.pathname.includes('\\') || /%2f|%5c|%00|%2e/i.test(url.pathname)) return null
    const policy = PUBLISHERS[url.hostname]
    if (!policy) return null
    for (const key of [...url.searchParams.keys()]) {
      if (!/^utm_(?:source|medium|campaign|term|content)$/.test(key)) return null
      url.searchParams.delete(key)
    }
    const canonical = url.toString()
    return {url: canonical, group: policy.group, kind: policy.kind}
  } catch {
    return null
  }
}

/**
 * Collects immutable in-memory source text and checks each final URL against
 * the preauthorized identity. Readers are injected; no network occurs by default.
 * Any failure aborts the entire batch; partial evidence cannot be approved.
 */
export async function collectVerifiedSources(
  urls: readonly string[],
  reader: SourceReader,
  nowMs: number,
): Promise<SourceCollection> {
  const refused = (reason: string): SourceCollection => ({
    ok: false, reason, snapshots: [], receipts: [],
  })
  if (!Array.isArray(urls) || urls.length < 2 || urls.length > MAX_SOURCES ||
      !Number.isFinite(nowMs)) return refused('invalid_collection_request')
  const refs = urls.map(recognizeSource)
  if (refs.some(ref => !ref)) return refused('untrusted_source_url')
  const recognized = refs as SourceRef[]
  const seenUrls = new Set(recognized.map(ref => ref.url))
  if (seenUrls.size !== recognized.length) return refused('duplicate_source_url')
  if (new Set(recognized.map(ref => ref.group)).size < 2) {
    return refused('same_publisher_not_independent')
  }

  const snapshots: SourceSnapshot[] = []
  const receipts: SourceReceipt[] = []
  for (const [index, source] of recognized.entries()) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PER_SOURCE_TIMEOUT_MS)
    let response: ReadResult | null
    try {
      // Race the read: a hung worker may ignore AbortSignal. No retries.
      response = await Promise.race([
        reader(source.url, controller.signal),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('source_timeout')), {once: true})
        }),
      ])
    } catch {
      return refused('source_reader_failed')
    } finally {
      clearTimeout(timeout)
      controller.abort()
    }
    // The reader's final URL must be EXACTLY the approved canonical identity.
    const final = recognizeSource(response?.url)
    if (!response?.success || !final || final.url !== source.url ||
        typeof response.title !== 'string' || !response.title.trim() ||
        typeof response.text !== 'string' ||
        response.text.length < MIN_TEXT_CHARS ||
        response.text.length > MAX_TEXT_CHARS) {
      return refused('source_identity_or_body_invalid')
    }
    const id = 'source-' + index
    const retrievedAt = new Date(nowMs).toISOString()
    snapshots.push({
      id, url: source.url, publisherGroup: source.group,
      kind: source.kind, retrievedAt, text: response.text,
    })
    receipts.push({
      sourceId: id, url: source.url, publisherGroup: source.group,
      retrievedAt,
      textSha256: createHash('sha256').update(response.text).digest('hex'),
      characterCount: response.text.length,
    })
  }
  return {ok: true, snapshots, receipts}
}
