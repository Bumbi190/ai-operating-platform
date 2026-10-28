import 'server-only'
import {
  LEAD_RESEARCH_EXCERPT_MAX, parseSafePublicUrl,
  type BusinessIndicator, type ResearchJob,
} from './lead-research'
import type { SearchAdapter } from './lead-research-worker'

/**
 * Tavily search adapter for the Atlas lead research worker (server-only).
 * Exactly one fixed endpoint, one basic search per job, no retries, no redirects,
 * no fetching of any result page. The key lives only in the Authorization header:
 * it is never put in a URL, a body, an error or a log line. Tavily output is
 * untrusted: it is reduced to short sanitized observations that
 * evaluateLeadEvidence() re-validates. Nothing here grants outreach permission.
 */
export const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
export const TAVILY_MAX_RESULTS = 3
export const TAVILY_MAX_RESPONSE_BYTES = 150_000
export const TAVILY_MAX_REQUESTS = 5

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>

export interface TavilyAdapterOptions {
  key: string | undefined
  fetchImpl: FetchImpl
  now?: () => Date
}

const SALE_SIGNALS: [BusinessIndicator, RegExp][] = [
  ['cars_for_sale', /bilar till salu|begagnade (?:bilar|personbilar)|vi säljer (?:begagnade )?(?:bilar|personbilar)|bilförsäljning|bilhandlare|personbilar till salu/i],
  ['vehicle_stock_listings', /lagerbilar|vårt billager|bilar i lager|aktuellt lager|vårt bilutbud|\bbillager\b/i],
  ['dealer_purchases_cars', /vi köper (?:din |dina )?(?:bil|bilar)|bilinköp|köper din bil/i],
]
const REPAIR_SIGNAL = /bilverkstad|bilservice|reparation av bilar|fordonsverkstad/i
const OTHER_SIGNALS: [BusinessIndicator, RegExp][] = [
  ['wheelchairs_or_mobility_aids', /rullstol|elscooter|rörelsehjälpmedel|ledsagarbil/i],
  ['financial_or_collection_services', /inkasso|factoring|skuldrådgivning|kreditupplysning/i],
]

const keyOk = (k: unknown): k is string => typeof k === 'string' && /^[\x21-\x7e]{8,200}$/.test(k)

/** Strip markup, URLs, emails, phone numbers and long identifiers from untrusted text. */
function clean(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\S*@\S*/g, ' ')
    .replace(/(?:\+|00)?\d(?:[\s().-]?\d){5,}/g, ' ')
    .replace(/\S{25,}/g, ' ')
    .replace(/[<>@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function excerptAround(text: string, at: number): string {
  const start = at > 40 ? at - 40 : 0
  let slice = text.slice(start, start + LEAD_RESEARCH_EXCERPT_MAX)
  if (start > 0) slice = slice.replace(/^\S*\s/, '')
  if (start + LEAD_RESEARCH_EXCERPT_MAX < text.length) slice = slice.replace(/\s\S*$/, '')
  return slice.trim()
}

function toObservation(raw: unknown, today: string): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const url = parseSafePublicUrl(r.url)
  if (!url) return null
  const title = typeof r.title === 'string' ? r.title.slice(0, 300) : ''
  const content = typeof r.content === 'string' ? r.content.slice(0, 3000) : ''
  if (!content && !title) return null

  const text = clean(content || title)
  if (!text) return null

  const indicators: BusinessIndicator[] = []
  let signalAt = -1
  for (const [indicator, re] of SALE_SIGNALS) {
    const m = re.exec(text)
    if (m) { indicators.push(indicator); if (signalAt < 0 || m.index < signalAt) signalAt = m.index }
  }
  const sale = indicators.includes('cars_for_sale') || indicators.includes('vehicle_stock_listings')
  if (!sale && !indicators.length) {
    const repair = REPAIR_SIGNAL.exec(text)
    if (repair) { indicators.push('auto_repairs_only'); signalAt = repair.index }
  }
  if (!indicators.length) {
    for (const [indicator, re] of OTHER_SIGNALS) {
      const m = re.exec(text)
      if (m) { indicators.push(indicator); signalAt = m.index; break }
    }
  }
  const excerpt = excerptAround(text, Math.max(signalAt, 0))
  if (!excerpt) return null

  // Tavily returns a search excerpt, not authenticated content fetched from the
  // company's site. Neither a plausible URL nor an orgnr appearing in the
  // snippet proves legal identity. Never promote search output to official evidence.
  return {
    sourceUrl: url.href, sourceKind: 'search_snippet', observedOn: today,
    observedBusinessIndicators: indicators, excerpt,
  }
}

async function readBounded(response: Response): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > TAVILY_MAX_RESPONSE_BYTES) throw new Error('response_too_large')
  if (!response.body) throw new Error('response_invalid')
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > TAVILY_MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error('response_too_large')
      }
      parts.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const raw = new Uint8Array(size)
  let at = 0
  for (const part of parts) { raw.set(part, at); at += part.byteLength }
  return new TextDecoder('utf-8', { fatal: true }).decode(raw)
}

export function makeTavilyResearchAdapter(options: TavilyAdapterOptions): SearchAdapter {
  const key = options.key?.trim()
  if (!keyOk(key)) throw new Error('tavily_key_missing')
  const fetchImpl = options.fetchImpl
  const now = options.now ?? (() => new Date())
  const seen = new Set<string>()

  return {
    name: 'tavily-basic',
    async collect(job: ResearchJob, signal: AbortSignal): Promise<unknown> {
      // Hard spend cap per adapter instance: one request per company, five per batch, never repeated.
      if (seen.has(job.id) || seen.size >= TAVILY_MAX_REQUESTS) throw new Error('request_budget_exceeded')
      seen.add(job.id)

      const query = `"${job.legalName}" ${job.orgnr} bilar till salu`
      const response = await fetchImpl(TAVILY_SEARCH_URL, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query, search_depth: 'basic', max_results: TAVILY_MAX_RESULTS,
          include_answer: false, include_raw_content: false, include_images: false,
        }),
      })
      if (!response.ok) throw new Error('search_failed')
      let parsed: unknown
      try { parsed = JSON.parse(await readBounded(response)) } catch { throw new Error('search_failed') }
      const results = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>).results : null
      if (!Array.isArray(results)) throw new Error('search_failed')

      const today = now().toISOString().slice(0, 10)
      const observations: Record<string, unknown>[] = []
      for (const result of results.slice(0, TAVILY_MAX_RESULTS)) {
        const o = toObservation(result, today)
        if (o) observations.push(o)
      }
      return observations
    },
  }
}
