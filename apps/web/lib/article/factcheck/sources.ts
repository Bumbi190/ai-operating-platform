/**
 * lib/article/factcheck/sources.ts
 *
 * Source intake for the article FactCheck gate. Reuses only what Omnira already
 * runs: the existing Hermes `/read` service (injected as `reader`) and other
 * news items the existing News Hunter already stored (injected as
 * `findCorroborating`). No search API, no new paid integration.
 *
 * Publisher identity and primary/secondary kind come from the host table below,
 * never from model output. Unknown hosts are treated as independent reporting
 * whose publisher group is the registrable host itself.
 */

import type { SourceKind, SourceSnapshot } from './types'

const MIN_SOURCE_CHARS = 400
const MAX_SOURCE_CHARS = 60_000
/** Primary + up to this many corroborating reads. Bounds Hermes load and reviewer input. */
export const MAX_CORROBORATING_SOURCES = 2

interface PublisherPolicy { group: string; kind: 'primary' | 'reporting' }

/** Explicit host identities. Same ownership → same group, so they never count as independent. */
const PUBLISHERS: Readonly<Record<string, PublisherPolicy>> = Object.freeze({
  'wired.com': { group: 'condenast', kind: 'reporting' },
  'arstechnica.com': { group: 'condenast', kind: 'reporting' },
  'theverge.com': { group: 'voxmedia', kind: 'reporting' },
  'reuters.com': { group: 'reuters', kind: 'reporting' },
  'apnews.com': { group: 'associatedpress', kind: 'reporting' },
  'bbc.com': { group: 'bbc', kind: 'reporting' },
  'bbc.co.uk': { group: 'bbc', kind: 'reporting' },
  'techcrunch.com': { group: 'yahoo', kind: 'reporting' },
  'engadget.com': { group: 'yahoo', kind: 'reporting' },
  'venturebeat.com': { group: 'venturebeat', kind: 'reporting' },
  'bloomberg.com': { group: 'bloomberg', kind: 'reporting' },
  'ft.com': { group: 'ft', kind: 'reporting' },
  'cnbc.com': { group: 'nbcuniversal', kind: 'reporting' },
  'technologyreview.com': { group: 'mit', kind: 'reporting' },
  'openai.com': { group: 'openai', kind: 'primary' },
  'anthropic.com': { group: 'anthropic', kind: 'primary' },
  'blog.google': { group: 'google', kind: 'primary' },
  'deepmind.google': { group: 'google', kind: 'primary' },
  'research.google': { group: 'google', kind: 'primary' },
  'ai.meta.com': { group: 'meta', kind: 'primary' },
  'about.fb.com': { group: 'meta', kind: 'primary' },
  'blogs.microsoft.com': { group: 'microsoft', kind: 'primary' },
  'news.microsoft.com': { group: 'microsoft', kind: 'primary' },
  'nvidianews.nvidia.com': { group: 'nvidia', kind: 'primary' },
  'blogs.nvidia.com': { group: 'nvidia', kind: 'primary' },
  'mistral.ai': { group: 'mistral', kind: 'primary' },
  'huggingface.co': { group: 'huggingface', kind: 'primary' },
  'arxiv.org': { group: 'arxiv', kind: 'primary' },
  'github.com': { group: 'github', kind: 'primary' },
  'gov.uk': { group: 'uk-government', kind: 'primary' },
  'europa.eu': { group: 'eu', kind: 'primary' },
  'whitehouse.gov': { group: 'us-government', kind: 'primary' },
  'sec.gov': { group: 'us-sec', kind: 'primary' },
})

function lookupPublisher(host: string): PublisherPolicy | null {
  // Walk up the labels: news.microsoft.com → microsoft.com is NOT assumed; only exact or listed parents.
  const labels = host.split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.')
    if (PUBLISHERS[candidate]) return PUBLISHERS[candidate]
  }
  return null
}

const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i

/**
 * Accept only public https URLs without credentials. This is a pre-filter, not
 * an SSRF defence: the actual fetch happens inside Hermes, which owns egress.
 */
export function safeSourceUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (!url.hostname || PRIVATE_HOST_RE.test(url.hostname)) return null
    if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

export function classifyHost(host: string, role: 'originating' | 'corroborating'): { group: string; kind: SourceKind } {
  const h = host.toLowerCase().replace(/^www\./, '')
  const policy = lookupPublisher(h)
  if (policy?.kind === 'primary') return { group: policy.group, kind: 'primary' }
  const group = policy?.group ?? h
  return { group, kind: role === 'originating' ? 'originating_report' : 'independent_reporting' }
}

// ── Corroboration matching (pure) ───────────────────────────────────────────

const STOP = new Set(('a an and are as at be by for from has have in is it its new of on or that the this ' +
  'to was will with after over says say said into about how why what more than just ai').split(' '))

export function titleTokens(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9\s.-]/g, ' ').split(/\s+/)
      .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
      .filter((t) => t.length > 1 && !STOP.has(t)),
  )
}

/** Jaccard similarity of headline tokens. Cheap, deterministic, explainable. */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a)
  const tb = titleTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

export const CORROBORATION_MIN_SIMILARITY = 0.3

export interface CorroborationCandidate { id: string; title: string; url: string | null }

/**
 * Choose up to MAX_CORROBORATING_SOURCES candidates about the same story from
 * publisher groups other than the originating one (and other than each other).
 */
export function pickCorroborating(
  origin: { title: string; url: string | null },
  candidates: readonly CorroborationCandidate[],
): Array<{ id: string; url: URL; similarity: number }> {
  const originUrl = safeSourceUrl(origin.url)
  const usedGroups = new Set<string>()
  if (originUrl) usedGroups.add(classifyHost(originUrl.hostname, 'originating').group)

  const ranked = candidates
    .map((c) => ({ c, url: safeSourceUrl(c.url), similarity: titleSimilarity(origin.title, c.title) }))
    .filter((x): x is { c: CorroborationCandidate; url: URL; similarity: number } =>
      x.url !== null && x.similarity >= CORROBORATION_MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)

  const out: Array<{ id: string; url: URL; similarity: number }> = []
  for (const x of ranked) {
    const group = classifyHost(x.url.hostname, 'corroborating').group
    if (usedGroups.has(group)) continue
    usedGroups.add(group)
    out.push({ id: x.c.id, url: x.url, similarity: x.similarity })
    if (out.length >= MAX_CORROBORATING_SOURCES) break
  }
  return out
}

// ── Collection (I/O injected) ───────────────────────────────────────────────

export interface ReadResult { success: boolean; url: string; title: string; text: string }
export type SourceReader = (url: string) => Promise<ReadResult | null>

export interface CollectSourcesInput {
  newsItem: { title: string; url: string | null }
  corroborating: readonly CorroborationCandidate[]
  reader: SourceReader
  now?: () => Date
}

export interface CollectSourcesResult {
  sources: SourceSnapshot[]
  /** Human-readable trail of what was tried and why something was skipped. */
  log: string[]
}

async function readOne(
  reader: SourceReader, requested: URL, role: 'originating' | 'corroborating', id: string,
  now: () => Date, log: string[],
): Promise<SourceSnapshot | null> {
  let result: ReadResult | null = null
  try {
    result = await reader(requested.toString())
  } catch (e) {
    log.push(`${id} ${requested.hostname}: read_error ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
  if (!result?.success) { log.push(`${id} ${requested.hostname}: unavailable`); return null }
  // Classify by the FINAL url the reader reports (redirects), not the one requested.
  const finalUrl = safeSourceUrl(result.url || requested.toString())
  if (!finalUrl) { log.push(`${id} ${requested.hostname}: unsafe_final_url`); return null }
  const text = (result.text ?? '').trim()
  if (text.length < MIN_SOURCE_CHARS) { log.push(`${id} ${finalUrl.hostname}: too_short (${text.length})`); return null }
  const { group, kind } = classifyHost(finalUrl.hostname, role)
  log.push(`${id} ${finalUrl.hostname}: ok ${kind} group=${group} chars=${text.length}`)
  return {
    id, url: finalUrl.toString(), host: finalUrl.hostname.replace(/^www\./, ''),
    publisherGroup: group, kind, retrievedAt: now().toISOString(),
    title: (result.title ?? '').slice(0, 300), text: text.slice(0, MAX_SOURCE_CHARS),
  }
}

/**
 * Read the originating report plus independent coverage. A failed read is
 * recorded and skipped; it never throws. An empty result means the article
 * cannot be fact-checked and the job must block before any model spend.
 */
export async function collectSources(input: CollectSourcesInput): Promise<CollectSourcesResult> {
  const now = input.now ?? (() => new Date())
  const log: string[] = []
  const sources: SourceSnapshot[] = []

  const origin = safeSourceUrl(input.newsItem.url)
  if (!origin) log.push('s1: originating url missing or unsafe')
  else {
    const s = await readOne(input.reader, origin, 'originating', 's1', now, log)
    if (s) sources.push(s)
  }

  const picks = pickCorroborating(input.newsItem, input.corroborating)
  if (picks.length === 0) log.push('no corroborating coverage found among stored news items')
  let n = 2
  for (const p of picks) {
    const s = await readOne(input.reader, p.url, 'corroborating', `s${n++}`, now, log)
    if (s && !sources.some((x) => x.publisherGroup === s.publisherGroup)) sources.push(s)
  }
  return { sources, log }
}
