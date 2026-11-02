import 'server-only'
import {
  LEAD_RESEARCH_EXCERPT_MAX, parseSafePublicUrl,
  type BusinessIndicator, type ResearchJob,
} from './lead-research'
import type { SearchAdapter } from './lead-research-worker'
import { EXPLICIT_FINANCIAL_ACTIVITY, REGISTRATION_ONLY_VEHICLE_TRADE } from './business-signal-rules'

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
  /** Internal callback for the optional extract stage: public URL candidates only,
   * never returned to the owner as evidence unless independently verified. */
  onCandidateUrl?: (job: ResearchJob, url: string) => void
}

const SALE_SIGNALS: [BusinessIndicator, RegExp][] = [
  ['cars_for_sale', /bilar till salu|personbilar till salu|(?:vi\s+)?säljer\s+(?:alla\s+typer\s+av\s+)?(?:nya\s+|begagnade\s+)?(?:bilar|personbilar)|(?:bedriver|erbjuder|arbetar med) bilförsäljning|(?:vi är|auktoriserad) bilhandlare/i],
  ['vehicle_stock_listings', /vårt billager|bilar i lager|aktuella lagerbilar|aktuellt lager|vårt bilutbud/i],
  ['dealer_purchases_cars', /vi köper (?:din |dina )?(?:bil|bilar)|bedriver bilinköp|köper din bil/i],
]
const REPAIR_SIGNAL = /bilverkstad|bilservice|reparation av bilar|fordonsverkstad/i
const OTHER_SIGNALS: [BusinessIndicator, RegExp][] = [
  ['wheelchairs_or_mobility_aids', /rullstol|elscooter|rörelsehjälpmedel|ledsagarbil/i],
  ['financial_or_collection_services', EXPLICIT_FINANCIAL_ACTIVITY],
]

const keyOk = (k: unknown): k is string => typeof k === 'string' && /^[\x21-\x7e]{8,200}$/.test(k)

/** The search query matching a company does NOT mean its results belong to that company. */
const normalizedWords = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const containsWholePhrase = (haystack: string, phrase: string) =>
  phrase.length >= 5 && (` ${normalizedWords(haystack)} `).includes(` ${phrase} `)

function linkedToLegalCompany(title: string, content: string, url: string, job: ResearchJob): boolean {
  const combined = title + ' ' + content
  // A source explicitly naming another legal entity must not be credited to this one.
  const mentionedOrgnrs = combined.matchAll(/\b(?:org(?:anisations)?\.?\s*nr\.?|organisationsnummer|orgnr)\s*:?\s*(\d{6})[-\s]?(\d{4})(?!\d)/gi)
  for (const m of mentionedOrgnrs) if (m[1] + m[2] !== job.orgnr) return false

  // Exact organisation number is a relevance clue; it is NEVER legal identity proof.
  const exactOrgnr = new RegExp(`(?<!\\d)${job.orgnr.slice(0, 6)}[-\\s]?${job.orgnr.slice(6)}(?!\\d)`)
  if (exactOrgnr.test(combined)) return true

  const fullName = normalizedWords(job.legalName)
  if (containsWholePhrase(combined, fullName)) return true

  // Some directory profile URLs omit "AB"/"filial" while spelling the distinctive
  // company name in /company/<slug> or /foretag/<slug>. One-word generic names
  // ("Inkasso", "Bil") are deliberately not sufficient.
  const stem = fullName.replace(/^aktiebolaget\s+|^aktiebolag\s+/, '')
    .replace(/\s+(?:ab|aktiebolag|handelsbolag|kommanditbolag|filial)$/, '')
  const distinctiveWords = stem.split(' ').filter(w => w.length >= 3)
  if (distinctiveWords.length < 2 || stem.length < 9) return false
  let path: string
  try { path = decodeURIComponent(new URL(url).pathname) } catch { return false }
  return /\/(?:company|companies|foretag|företag|dealer|dealers|handlare|bilhandlare)\//i.test(path) &&
    containsWholePhrase(path, stem)
}

/** Prevent "0 current car listings" or "inga bilar till salu" from becoming sale evidence. */
function negatedSaleSignal(text: string, start: number, end: number): boolean {
  const sentenceStart = Math.max(text.lastIndexOf('.', start), text.lastIndexOf('!', start),
    text.lastIndexOf('?', start), text.lastIndexOf(';', start)) + 1
  const clause = text.slice(Math.max(sentenceStart, start - 90), Math.min(text.length, end + 45))
  return /\b(?:0|inga|ingen|noll)\b[^.!?;]{0,75}\b(?:bilannonser|annonser|bilar|fordon|lagerbilar)\b/i.test(clause) ||
    /\b(?:no|zero)\b[^.!?;]{0,75}\b(?:cars|vehicles|listings)\b/i.test(clause)
}

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

function toObservation(raw: unknown, job: ResearchJob, today: string): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const url = parseSafePublicUrl(r.url)
  if (!url) return null
  const title = typeof r.title === 'string' ? r.title.slice(0, 300) : ''
  const content = typeof r.content === 'string' ? r.content.slice(0, 3000) : ''
  if (!content && !title) return null
  // Search rankings and the search query itself are not evidence about this legal entity.
  if (!linkedToLegalCompany(title, content, url.href, job)) return null

  const text = clean(content || title)
  if (!text) return null

  const indicators: BusinessIndicator[] = []
  let signalAt = -1
  for (const [indicator, re] of SALE_SIGNALS) {
    const m = [...text.matchAll(new RegExp(re.source, 'gi'))]
      .find(hit => !negatedSaleSignal(text, hit.index ?? 0, (hit.index ?? 0) + hit[0].length))
    if (m) { indicators.push(indicator); if (signalAt < 0 || m.index < signalAt) signalAt = m.index }
  }
  const sale = indicators.includes('cars_for_sale') || indicators.includes('vehicle_stock_listings')
  if (!sale && !indicators.length) {
    const repair = REPAIR_SIGNAL.exec(text)
    if (repair) { indicators.push('auto_repairs_only'); signalAt = repair.index }
  }
  // A register entry describing trade is a research clue, never a claim
  // that the company is presently selling vehicles.
  if (!indicators.length) {
    const registration = REGISTRATION_ONLY_VEHICLE_TRADE.exec(text)
    if (registration) { indicators.push('registered_vehicle_trade'); signalAt = registration.index }
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

      // Search for the legal entity first, not broad marketplace car listings.
      const query = `"${job.legalName}" ${job.orgnr} officiell webbplats bilhandel`
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
        // A branded official URL may be discoverable even when its search
        // excerpt does not contain the company's exact legal name or orgnr.
        // Pass only its safe URL to the optional extraction candidate sink;
        // it NEVER becomes a trusted search observation by this path.
        if (options.onCandidateUrl && result && typeof result === 'object') {
          const candidate = parseSafePublicUrl((result as Record<string, unknown>).url)
          if (candidate) { try { options.onCandidateUrl(job, candidate.href) } catch { /* optional sink fails closed */ } }
        }
        const o = toObservation(result, job, today)
        if (o) observations.push(o)
      }
      return observations
    },
  }
}
