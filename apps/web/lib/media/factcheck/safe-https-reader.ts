/**
 * Preview-only HTTPS source reader.
 *
 * Resolves ONLY mapped public news domains, pins validated IPv4 at TLS dial,
 * rejects redirects and invalid bodies, and emits plain article excerpts.
 * No production route imports this. Future activation requires independent
 * network egress, DNS and publisher provenance review.
 */
import {lookup as dnsLookup} from 'node:dns/promises'
import {request as httpsRequest} from 'node:https'
import {isIP} from 'node:net'
import {TextDecoder} from 'node:util'
import {recognizeSource, type ReadResult, type SourceReader} from './source-collector'

export type AddressRecord = Readonly<{address: string; family: number}>
export type ResolveAddresses = (hostname: string) => Promise<readonly AddressRecord[]>
export type RawHttpsResponse = Readonly<{
  status: number
  contentType: string
  contentEncoding: string
  body: Uint8Array
  contentDisposition?: string
}>
export type PinnedHttpsTransport =
  (url: URL, pinnedIpv4: string, signal: AbortSignal) => Promise<RawHttpsResponse>

const MAX_RAW_BODY = 240_000
const MAX_TEXT_BODY = 36_000
const CONNECT_TIMEOUT_MS = 6_000

/**
 * An explicitly conservative IPv4 global-unicast policy. Unsupported and
 * special-purpose ranges fail closed; IPv6-only hosts cannot be read yet.
 */
export function isPublicIpv4(input: unknown): input is string {
  if (typeof input !== 'string' || isIP(input) !== 4) return false
  const parts = input.split('.').map(part => Number(part))
  const [a,b,c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99) ||
      (b === 0 && c === 2))) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100))) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

/**
 * One malicious private A record poisons the whole DNS answer. A/AAAA mixes
 * are permitted only when there is at least one public A and no forbidden A;
 * all outbound TCP connections are pinned to the selected A record.
 */
export function selectPinnedPublicIpv4(records: readonly AddressRecord[]): string | null {
  if (!Array.isArray(records) || records.length === 0 || records.length > 24) return null
  const v4: string[] = []
  for (const record of records) {
    if (!record || (record.family !== 4 && record.family !== 6)) return null
    if (record.family === 4) {
      if (!isPublicIpv4(record.address)) return null
      v4.push(record.address)
    }
  }
  return v4.length > 0 ? v4[0] : null
}

/** Use the OS resolver; do not reuse this result for unrelated URLs. */
const systemResolver: ResolveAddresses = hostname =>
  dnsLookup(hostname, {all: true, order: 'verbatim'})

/**
 * The request maintains the ORIGINAL https hostname for certificate checks
 * and HTTP Host/SNI, while the lookup override prevents a second DNS query.
 * There are deliberately NO redirect-following or proxy-aware clients here.
 */
async function systemPinnedTransfer(
  url: URL,
  pinnedIpv4: string,
  signal: AbortSignal,
): Promise<RawHttpsResponse> {
  return new Promise((resolve, reject) => {
    let total = 0
    const chunks: Buffer[] = []
    const req = httpsRequest(url, {
      method: 'GET',
      agent: false,
      // Node 22's default auto-family selection may ask lookup({all:true});
      // force the single IPv4 socket whose address we already validated.
      family: 4,
      autoSelectFamily: false,
      signal,
      servername: url.hostname,
      rejectUnauthorized: true,
      timeout: CONNECT_TIMEOUT_MS,
      maxHeaderSize: 16_384,
      headers: {
        Accept: 'text/html, text/plain;q=0.9',
        'Accept-Encoding': 'identity',
        'User-Agent': 'ThePromptEditorialFactCheck/1.0 (read-only research)',
      },
      lookup: (hostname, _opts, callback) => {
        // DNS was already resolved and validated. Never defer to system DNS.
        const cb = callback as (
          err: NodeJS.ErrnoException | null, address: string, family: number,
        ) => void
        if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
          cb(new Error('hostname_changed_during_dial'), '', 0)
        } else {
          cb(null, pinnedIpv4, 4)
        }
      },
    }, res => {
      const typeHeader = res.headers['content-type']
      const encodingHeader = res.headers['content-encoding']
      const dispositionHeader = res.headers['content-disposition']
      if (res.statusCode !== 200 ||
          typeof typeHeader !== 'string' ||
          (typeof encodingHeader === 'string' && encodingHeader.toLowerCase() !== 'identity') ||
          typeof dispositionHeader !== 'undefined' ||
          (res.headers['content-length'] !== undefined &&
           (!/^\d+$/.test(String(res.headers['content-length'])) ||
            Number(res.headers['content-length']) > MAX_RAW_BODY))) {
        res.destroy(new Error('http_status_or_headers_rejected'))
        return
      }
      res.on('data', (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += bytes.length
        if (total > MAX_RAW_BODY) {
          res.destroy(new Error('raw_source_oversized'))
          return
        }
        chunks.push(bytes)
      })
      res.once('end', () => resolve({
        status: res.statusCode ?? 0, contentType: typeHeader,
        contentEncoding: typeof encodingHeader === 'string' ? encodingHeader : '',
        body: Buffer.concat(chunks),
      }))
      res.once('error', reject)
    })
    req.once('timeout', () => req.destroy(new Error('source_timeout')))
    req.once('error', reject)
    req.end()
  })
}

type ParserNode = Readonly<{
  nodeName?: string
  tagName?: string
  value?: string
  childNodes?: readonly unknown[]
}>
function asNode(value: unknown): ParserNode {
  return value && typeof value === 'object' ? value as ParserNode : {}
}
const SKIP_NODES = new Set([
  'head','script','style','noscript','svg','iframe','nav',
  'header','footer','aside','form','template','button',
])
const BREAK_NODES = new Set([
  'p','div','section','article','main','h1','h2','h3','h4',
  'li','ul','ol','blockquote','br','tr','table',
])
function findNamed(root: unknown, name: string): unknown | null {
  const node = asNode(root)
  if (node.tagName === name) return root
  for (const child of node.childNodes ?? []) {
    const result = findNamed(child,name)
    if (result) return result
  }
  return null
}
function textParts(root: unknown, parts: string[]): void {
  const node = asNode(root)
  const name = node.tagName ?? node.nodeName ?? ''
  if (SKIP_NODES.has(name)) return
  if (name === '#text' && typeof node.value === 'string') {
    parts.push(node.value)
    return
  }
  if (BREAK_NODES.has(name)) parts.push('\n')
  for (const child of node.childNodes ?? []) textParts(child,parts)
  if (BREAK_NODES.has(name)) parts.push('\n')
}
function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
async function decodeDocument(
  contentType: string, raw: Uint8Array,
): Promise<{title: string; text: string} | null> {
  const ct = contentType.toLowerCase()
  if (!/^text\/(?:plain|html)(?:;|$)/.test(ct)) return null
  if (/charset\s*=\s*["']?([a-z0-9-]+)/.test(ct) &&
      !/charset\s*=\s*["']?utf-?8(?:["';\s]|$)/.test(ct)) return null
  let rawText: string
  try { rawText = new TextDecoder('utf-8', {fatal: true}).decode(raw) }
  catch { return null }
  let title = 'Source text'
  let text: string
  if (/^text\/plain/.test(ct)) {
    text = normalizeText(rawText)
  } else {
    // parse5 is already a pinned web-workspace dependency, not a new package.
    const {parse} = await import('parse5')
    const doc = parse(rawText)
    const root = findNamed(doc,'article') ?? findNamed(doc,'main')
    if (!root) return null // No reliable article/main boundary: HOLD.
    const buffer: string[] = []
    textParts(root,buffer)
    text = normalizeText(buffer.join(''))
    const headNode = findNamed(root,'h1') ?? findNamed(doc,'title')
    if (headNode) {
      const titleParts: string[] = []
      textParts(headNode,titleParts)
      title = normalizeText(titleParts.join('')).slice(0,200) || title
    }
  }
  if (text.length < 70 || text.length > MAX_TEXT_BODY) return null
  return {title,text}
}

/** Offline-fixture injection for networking tests, NOT a runtime provider. */
export function createPinnedReaderForOfflineTests(
  resolveAddresses: ResolveAddresses,
  transport: PinnedHttpsTransport,
): SourceReader {
  return (url, signal) => readWithPinnedTransport(url, signal, resolveAddresses, transport)
}

async function readWithPinnedTransport(
  rawUrl: string,
  signal: AbortSignal,
  resolveAddresses: ResolveAddresses,
  transport: PinnedHttpsTransport,
): Promise<ReadResult | null> {
  const source = recognizeSource(rawUrl)
  if (!source || signal.aborted) return null
  try {
    const url = new URL(source.url)
    const addresses = await resolveAddresses(url.hostname)
    if (signal.aborted) return null
    const pinnedIpv4 = selectPinnedPublicIpv4(addresses)
    if (!pinnedIpv4) return null
    const response = await transport(url, pinnedIpv4, signal)
    if (signal.aborted || response.status !== 200 ||
        response.contentEncoding && response.contentEncoding.toLowerCase() !== 'identity' ||
        response.contentDisposition ||
        response.body.length > MAX_RAW_BODY) return null
    const extracted = await decodeDocument(response.contentType, response.body)
    if (!extracted) return null
    return {success: true, url: source.url, ...extracted}
  } catch {
    return null // DNS, certificate, transport, parse or timeout → HOLD.
  }
}

/**
 * Privileged implementation for later audited, READ-ONLY adapter wiring.
 * No existing production route imports this. Never call on untrusted URLs.
 */
export const readAllowedPublicHttpsSource: SourceReader = (url,signal) =>
  readWithPinnedTransport(url,signal,systemResolver,systemPinnedTransfer)
