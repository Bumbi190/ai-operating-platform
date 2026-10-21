import { EVIDENCE } from './handlarborsen-competitors'
import { COMPETITOR_SITES } from './handlarborsen-competitor-landscape'

/**
 * An independently checked OFFICIAL website is evidence that a candidate has
 * a relevant offering. It is not evidence of when the business was founded.
 *
 * Search API result listings are intentionally excluded: some providers forbid
 * retaining those results. Only source records with independently checked
 * provenance may enter this durable-candidate boundary.
 */
export type OfficialCandidateEvidence = Readonly<{
  name: string
  officialUrl: string
  observedOn: string
  relevance: string
  provenance: 'independently_checked_official_website'
}>

export type DiscoveryCandidate = OfficialCandidateEvidence & Readonly<{
  host: string
  identity: string
  lifecycle: 'candidate_for_review'
  foundedRecently: 'not_verified'
}>

export type DiscoveryNotice = Readonly<{
  identity: string
  title: 'Möjlig konkurrent upptäckt för Omnira'
  sourceUrl: string
  sourceObservedOn: string
  reviewOnly: true
  executable: false
}>

export type DiscoveryResult = Readonly<{
  status: 'ok' | 'invalid'
  candidates: readonly DiscoveryCandidate[]
  notices: readonly DiscoveryNotice[]
  existingCount: number
  knownCount: number
  duplicateCount: number
  invalidCount: number
}>

/** Intentional exact-host identity; never collapse unrelated multi-level TLDs. */
export function officialHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
      || parsed.search || parsed.hash) return null
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
    if (host.length > 160 || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host)
      || host.split('.').some(part => part.startsWith('-') || part.endsWith('-'))
      || host.startsWith('xn--')) return null
    return host
  } catch {
    return null
  }
}

export const KNOWN_OFFICIAL_HOSTS: readonly string[] = Object.freeze(
  [...new Set([
    ...EVIDENCE.map(item => officialHost(item.url)),
    ...COMPETITOR_SITES.map(item => officialHost(item.url)),
    'handlarborsen.se',
  ].filter((value): value is string => !!value))].sort(),
)

function validDay(day: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const parsed = new Date(day + 'T00:00:00.000Z')
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === day
    && parsed.getTime() <= now.getTime()
}

function safeText(text: string, max: number): boolean {
  return typeof text === 'string' && text.length > 0 && text.length <= max
    && text === text.trim() && !/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)
}

export function reconcileDiscovery(
  evidence: readonly OfficialCandidateEvidence[],
  previousHosts: readonly string[],
  now: Date,
): DiscoveryResult {
  if (!Array.isArray(evidence) || !Array.isArray(previousHosts) || evidence.length > 30
    || !Number.isFinite(now.getTime())) {
    return { status: 'invalid', candidates: [], notices: [], existingCount: 0, knownCount: 0, duplicateCount: 0, invalidCount: Array.isArray(evidence) ? evidence.length : 0 }
  }

  const known = new Set(KNOWN_OFFICIAL_HOSTS)
  // Historical stores may carry www-prefixed hosts; normalize as official URLs.
  const previous = new Set(previousHosts
    .filter(x => typeof x === 'string')
    .map(x => officialHost('https://' + x + '/'))
    .filter((x): x is string => !!x))
  const seen = new Set<string>()
  const candidates: DiscoveryCandidate[] = []
  const notices: DiscoveryNotice[] = []
  let existingCount = 0, knownCount = 0, duplicateCount = 0, invalidCount = 0

  // Stable ordering makes the review queue deterministic, even across providers.
  for (const item of [...evidence].sort((a, b) => String(a?.officialUrl ?? '').localeCompare(String(b?.officialUrl ?? '')))) {
    const host = item && officialHost(item.officialUrl)
    if (!host || !safeText(item.name, 90) || !safeText(item.relevance, 320)
      || item.provenance !== 'independently_checked_official_website'
      || !validDay(item.observedOn, now)) { invalidCount++; continue }
    if (seen.has(host)) { duplicateCount++; continue }
    seen.add(host)
    if (known.has(host)) { knownCount++; continue }
    if (previous.has(host)) { existingCount++; continue }
    candidates.push({
      ...item,
      host,
      identity: 'hb-discovery:' + host,
      lifecycle: 'candidate_for_review',
      foundedRecently: 'not_verified',
    })
    notices.push({
      identity: 'hb-discovery:' + host,
      title: 'Möjlig konkurrent upptäckt för Omnira',
      sourceUrl: item.officialUrl,
      sourceObservedOn: item.observedOn,
      reviewOnly: true,
      executable: false,
    })
  }
  return { status: 'ok', candidates, notices, existingCount, knownCount, duplicateCount, invalidCount }
}
