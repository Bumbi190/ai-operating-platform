/**
 * Fetch official-source article text directly when Hermes is unavailable.
 *
 * SECURITY: strict official-origin allowlist, short timeouts, no open redirects,
 * no local/private IP resolution from any requester-controlled URL, limited
 * response size and article-title correlation. No JS execution or paid calls.
 */
import 'server-only'
import { parse } from 'parse5'
import { officialPrimarySourceUrl } from './daily-editorial-policy'
import type { GroundingResult } from './types'

interface HtmlNode {
  nodeName?: string
  tagName?: string
  value?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: HtmlNode[]
}

const MAX_BYTES = 1_800_000
const MAX_WORDS = 3_500
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'to', 'of', 'in', 'at', 'on', 'for', 'with',
  'and', 'or', 'by', 'its', 'new', 'from', 'now', 'our',
])
const SKIP_ELEMENTS = new Set([
  'nav', 'aside', 'footer', 'script', 'style', 'noscript',
  'button', 'form', 'select', 'svg', 'figcaption',
])

function nodes(node: HtmlNode, tag: string): HtmlNode[] {
  const out: HtmlNode[] = []
  function walk(current: HtmlNode) {
    if (SKIP_ELEMENTS.has(current.tagName ?? '')) return
    if (current.tagName === tag) out.push(current)
    for (const ch of current.childNodes ?? []) walk(ch)
  }
  walk(node)
  return out
}

function textOf(node: HtmlNode): string {
  if (SKIP_ELEMENTS.has(node.tagName ?? '')) return ''
  if (node.nodeName === '#text') return node.value ?? ''
  return (node.childNodes ?? []).map(textOf).join(' ')
    .replace(/\s+/g, ' ').trim()
}

function attribute(node: HtmlNode, name: string): string {
  return node.attrs?.find(a => a.name === name)?.value ?? ''
}

function tokens(s: string): string[] {
  return s.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

function titleMatches(sourceTitle: string, heading: string): boolean {
  const wanted = [...new Set(tokens(sourceTitle))]
  const got = new Set(tokens(heading))
  return wanted.length >= 2
    && wanted.filter(w => got.has(w)).length >= Math.max(2, Math.ceil(wanted.length * 0.65))
}

/** Pure HTML extraction used by the reader and tests. No network side effects. */
export function extractOfficialArticleText(
  html: string, expectedTitle: string,
): string | null {
  if (html.length > MAX_BYTES || html.length < 500) return null
  const doc = parse(html) as unknown as HtmlNode
  const headings = nodes(doc, 'h1').map(textOf).filter(Boolean)
  if (!headings.some(h => titleMatches(expectedTitle, h))) return null

  const article = nodes(doc, 'article')[0] ?? nodes(doc, 'main')[0]
  if (!article) return null
  const segments: string[] = []
  const seen = new Set<string>()
  function visit(n: HtmlNode) {
    if (SKIP_ELEMENTS.has(n.tagName ?? '')) return
    const tag = n.tagName ?? ''
    if (['p', 'h2', 'h3', 'li'].includes(tag)) {
      const t = textOf(n)
      // Section headings and benchmark list items often carry the qualifiers
      // (thinking tier, evaluation cohort, source attribution) that an AI
      // fact-checker MUST see to avoid misreading isolated statistics.
      const minimum = tag === 'p' ? 45 : tag === 'li' ? 25 : 8
      if (t.length >= minimum && !seen.has(t)) {
        seen.add(t)
        segments.push(tag === 'h2' ? '## ' + t : tag === 'h3' ? '### ' + t : t)
      }
      return
    }
    for (const child of n.childNodes ?? []) visit(child)
  }
  visit(article)
  const text = segments.join('\n\n')
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  if (wordCount < 150) return null
  // Keep paragraph and heading boundaries when clipping. Flattening the
  // whole source into a single line previously stripped benchmark context.
  let remaining = MAX_WORDS
  const retained: string[] = []
  for (const segment of segments) {
    if (remaining <= 0) break
    const words = segment.split(/\s+/).filter(Boolean)
    const chunk = words.slice(0, remaining)
    if (chunk.length > 0) retained.push(chunk.join(' '))
    remaining -= chunk.length
  }
  return retained.join('\n\n')
}

/**
 * The official DeepMind news index links to articles hosted on blog.google.
 * Only select links with a near-exact title ↔ URL slug match.
 */
export function matchOfficialDeepMindIndexLink(
  html: string, expectedTitle: string,
): string | null {
  if (html.length > MAX_BYTES || html.length < 300) return null
  const doc = parse(html) as unknown as HtmlNode
  const titleWords = [...new Set(tokens(expectedTitle))]
  if (titleWords.length < 2) return null
  for (const a of nodes(doc, 'a')) {
    const href = attribute(a, 'href')
    let url: URL
    try { url = new URL(href, 'https://deepmind.google/blog/') } catch { continue }
    if (url.hostname !== 'blog.google' || url.protocol !== 'https:') continue
    if (!officialPrimarySourceUrl(url.href)) continue
    const linkWords = new Set(tokens(decodeURIComponent(url.pathname)))
    const matches = titleWords.filter(w => linkWords.has(w)).length
    if (matches >= Math.max(2, Math.ceil(titleWords.length * 0.8))) {
      return url.origin + url.pathname
    }
  }
  return null
}

async function getLimitedOfficialHtml(
  url: string, signal: AbortSignal,
): Promise<{ html: string; url: string } | null> {
  if (!officialPrimarySourceUrl(url)) return null
  let current = url
  for (let redirect = 0; redirect < 3; redirect++) {
    if (!officialPrimarySourceUrl(current)) return null
    let response: Response
    try {
      response = await fetch(current, {
        method: 'GET', redirect: 'manual', cache: 'no-store', signal,
        headers: { Accept: 'text/html,application/xhtml+xml' },
      })
    } catch { return null }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      try { current = new URL(location, current).href } catch { return null }
      if (!officialPrimarySourceUrl(current)) return null
      continue
    }
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) return null
    const lengthHeader = Number(response.headers.get('content-length') ?? 0)
    if (lengthHeader > MAX_BYTES) return null
    const reader = response.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_BYTES) { await reader.cancel(); return null }
        chunks.push(value)
      }
    } catch { return null }
    const joined = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
    return { html: new TextDecoder().decode(joined), url: current }
  }
  return null
}

export interface VerifiedOfficialArticle {
  grounding: GroundingResult
  canonicalUrl: string
}

export async function readDirectOfficialArticle(
  candidateUrl: string, expectedTitle: string,
): Promise<VerifiedOfficialArticle | null> {
  if (!officialPrimarySourceUrl(candidateUrl)) return null
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 12_000)
  try {
    let targetUrl = candidateUrl
    // DeepMind's current listing leads to blog.google as the canonical publisher.
    if (new URL(candidateUrl).hostname === 'deepmind.google') {
      const listing = await getLimitedOfficialHtml('https://deepmind.google/blog/', abort.signal)
      if (listing) {
        const mapped = matchOfficialDeepMindIndexLink(listing.html, expectedTitle)
        if (mapped) targetUrl = mapped
      }
    }
    const page = await getLimitedOfficialHtml(targetUrl, abort.signal)
    if (!page) return null
    const text = extractOfficialArticleText(page.html, expectedTitle)
    if (!text) return null
    return {
      canonicalUrl: page.url,
      grounding: {
        text, mode: 'strong',
        wordCount: text.trim().split(/\s+/).length,
        source: 'primary_fetch',
      },
    }
  } finally { clearTimeout(timeout) }
}
