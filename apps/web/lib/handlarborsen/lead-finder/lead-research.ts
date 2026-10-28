import { parseReviewLegalOrgnr } from './client-review-core'
import { LOCAL_REVIEW_PROVENANCE, type LocalReview, type LocalReviewRow } from './local-review'

/**
 * Atlas Lead Research Worker v1 - pure, browser-safe core.
 * No network, filesystem, clock, crypto or randomness. Everything here either
 * builds a bounded queue of RESEARCH REQUESTS from the verified local review, or
 * classifies already-collected observations. Nothing here grants outreach permission.
 */
export const LEAD_RESEARCH_DEFAULT_LIMIT = 5
export const LEAD_RESEARCH_MAX_LIMIT = 10
export const LEAD_RESEARCH_MAX_OBSERVATIONS = 5
export const LEAD_RESEARCH_MIN_OBSERVATION_DATE = '2026-10-28'
export const LEAD_RESEARCH_EXCERPT_MAX = 160
export const SWITCHBOARD_LABEL = 'company switchboard'
export const GENERIC_MAILBOXES = ['info', 'kontakt', 'contact', 'kundservice', 'sales', 'foretag', 'service', 'order', 'support'] as const

export const SOURCE_KINDS = ['official_company_site', 'independent_business_source', 'search_snippet'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]
export const BUSINESS_INDICATORS = [
  'cars_for_sale', 'vehicle_stock_listings', 'dealer_purchases_cars', 'auto_repairs_only',
  'wheelchairs_or_mobility_aids', 'financial_or_collection_services', 'unrelated_products',
  'registered_vehicle_trade', // source describes a registration, not actual vehicle sales
] as const
export type BusinessIndicator = (typeof BUSINESS_INDICATORS)[number]

const SALE_INDICATORS: readonly BusinessIndicator[] = ['cars_for_sale', 'vehicle_stock_listings']
const VEHICLE_SIGNALS: readonly BusinessIndicator[] = ['cars_for_sale', 'vehicle_stock_listings', 'dealer_purchases_cars']
const OTHER_INDUSTRY: readonly BusinessIndicator[] = [
  'auto_repairs_only', 'wheelchairs_or_mobility_aids', 'financial_or_collection_services', 'unrelated_products',
]

// ---------------------------------------------------------------- queue

export type ResearchSkipReason = 'inactive_per_scb' | 'prior_contact' | 'scb_marketing_restriction'

export interface ResearchJob {
  id: string
  legalName: string
  orgnr: string
  city: string
  sni: string
  searchQueries: string[]
  status: 'RESEARCH_NOT_STARTED'
  outreachReady: false
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  sourceDate: string
}

export type ResearchQueueResult =
  | {
    status: 'ready'
    jobs: ResearchJob[]
    eligible: number
    skipped: { orgnr: string; reason: ResearchSkipReason }[]
    outreachReady: false
  }
  | { status: 'refused'; reason: string; jobs: []; outreachReady: false }

const refused = (reason: string): ResearchQueueResult => ({ status: 'refused', reason, jobs: [], outreachReady: false })

const EXPECTED = { total: 89, active: 83, inactive: 6, restricted: 1, priorContact: 1 } as const

export function normalizeResearchLimit(limit: unknown): number {
  if (limit === undefined) return LEAD_RESEARCH_DEFAULT_LIMIT
  // An explicit zero/invalid cap must NEVER silently trigger five billable jobs.
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) return 0
  return Math.min(limit, LEAD_RESEARCH_MAX_LIMIT)
}

function reviewProblem(review: LocalReview): string | null {
  if (!review || !Array.isArray(review.rows)) return 'review_missing'
  if (review.provenance !== LOCAL_REVIEW_PROVENANCE) return 'provenance_untrusted'
  if (review.historyCoverage !== 'PARTIAL') return 'history_not_partial'
  if (review.outreachReady !== 0) return 'outreach_flag_set'
  const c = review.counts
  if (!c || c.total !== EXPECTED.total || c.active !== EXPECTED.active || c.inactive !== EXPECTED.inactive ||
    c.restricted !== EXPECTED.restricted || c.priorContact !== EXPECTED.priorContact) return 'counts_mismatch'
  const rows = review.rows
  if (rows.length !== EXPECTED.total) return 'row_count_mismatch'
  const seen = new Set<string>()
  for (const r of rows) {
    if (typeof r.orgnr !== 'string' || !/^\d{10}$/.test(r.orgnr) || seen.has(r.orgnr)) return 'identifier_invalid'
    seen.add(r.orgnr)
    try { if (parseReviewLegalOrgnr(r.orgnr) !== r.orgnr) return 'identifier_invalid' } catch { return 'identifier_invalid' }
    if (r.contactability !== 'BLOCKED_PENDING_VERIFICATION' || r.reviewState !== 'awaiting_human_review') return 'contactability_not_blocked'
    if (!['49','31','96'].includes(r.legalFormCode) ||
      r.otherLegalForm !== (r.legalFormCode !== '49') ||
      typeof r.name !== 'string' || r.name.length < 2 || r.name.length > 120 ||
      typeof r.city !== 'string' || r.city.length < 1 || r.city.length > 60 ||
      /[@<>\u0000-\u001f]/.test(r.name + r.city) ||
      !/^\d{2}\.\d{3}(;\d{2}\.\d{3})*$/.test(r.sni) ||
      !Array.isArray(r.restrictedChannels) ||
      r.restricted !== (r.restrictedChannels.length > 0) ||
      r.restrictedChannels.some(c => !['reklam','epost','telefon'].includes(c))) return 'row_untrusted'
  }
  if (rows.filter(r => r.scbActive).length !== EXPECTED.active ||
    rows.filter(r => r.restricted).length !== EXPECTED.restricted ||
    rows.filter(r => r.priorContact).length !== EXPECTED.priorContact) return 'counts_mismatch'
  return null
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()

const firstCode = (sni: string) => sni.split(';')[0] ?? sni

function searchQueries(r: LocalReviewRow): string[] {
  return [
    `"${r.name}" ${r.orgnr} officiell webbplats`,
    `"${r.name}" ${r.city} bilar till salu lagerbilar`,
    `"${r.name}" ${r.orgnr} företagsinformation verksamhet`,
  ]
}

/**
 * Deterministic, bounded selection. Greedy: at every step the candidate that adds the least
 * to an already-represented name group, city and SNI code is taken, orgnr as final tie-break.
 * There is deliberately no fit score; this is a research order, not a ranking of quality.
 */
export function buildResearchQueue(review: LocalReview, limit: number = LEAD_RESEARCH_DEFAULT_LIMIT): ResearchQueueResult {
  const problem = reviewProblem(review)
  if (problem) return refused(problem)
  const max = normalizeResearchLimit(limit)

  const skipped: { orgnr: string; reason: ResearchSkipReason }[] = []
  const eligible: LocalReviewRow[] = []
  for (const r of review.rows) {
    if (!r.scbActive) skipped.push({ orgnr: r.orgnr, reason: 'inactive_per_scb' })
    else if (r.priorContact) skipped.push({ orgnr: r.orgnr, reason: 'prior_contact' })
    else if (r.restricted) skipped.push({ orgnr: r.orgnr, reason: 'scb_marketing_restriction' })
    else eligible.push(r)
  }
  skipped.sort((a, b) => a.orgnr.localeCompare(b.orgnr))

  const pool = [...eligible].sort((a, b) => a.orgnr.localeCompare(b.orgnr))
  const picked: LocalReviewRow[] = []
  const cityCount = new Map<string, number>()
  const groupCount = new Map<string, number>()
  const sniCount = new Map<string, number>()
  const codesOf = (r: LocalReviewRow) => r.sni.split(';')
  // NAME hints are only used to order scarce RESEARCH CREDITS. They never
  // determine suitability, eliminate a company or grant outreach permission.
  // Example: an "Inkasso" name goes later than a similarly situated "Bilhandel"
  // name, but can still be researched if later evidence merits it.
  const researchNameHint = (r: LocalReviewRow) => {
    const name = fold(r.name)
    if (/\b(inkasso|kapitalinvest|factoring|kredit|finans|investment|holding)\b/.test(name)) return 2
    if (/\b(bil|bilhandel|bilhandlare|bilar|bilcenter|fordonscenter|motor|motors|cars|automotive|auto|autohub|bilgruppen)\b/.test(name)) return 0
    return 1
  }
  while (picked.length < max && pool.length > 0) {
    let bestIndex = 0
    let best: number[] | null = null
    pool.forEach((r, i) => {
      const group = r.groupHypothesis ? fold(r.groupHypothesis) : null
      const score = [
        group ? groupCount.get(group) ?? 0 : 0,
        cityCount.get(fold(r.city)) ?? 0,
        codesOf(r).reduce((n, c) => n + (sniCount.get(c) ?? 0), 0),
        researchNameHint(r),
      ]
      if (best === null || score[0] < best[0] ||
        (score[0] === best[0] && (score[1] < best[1] ||
          (score[1] === best[1] && (score[2] < best[2] ||
            (score[2] === best[2] && score[3] < best[3])))))) {
        best = score; bestIndex = i
      }
    })
    const [r] = pool.splice(bestIndex, 1)
    picked.push(r)
    if (r.groupHypothesis) groupCount.set(fold(r.groupHypothesis), (groupCount.get(fold(r.groupHypothesis)) ?? 0) + 1)
    cityCount.set(fold(r.city), (cityCount.get(fold(r.city)) ?? 0) + 1)
    for (const c of codesOf(r)) sniCount.set(c, (sniCount.get(c) ?? 0) + 1)
  }

  const sourceDate = LOCAL_REVIEW_PROVENANCE.replace(/^SCB /, '')
  const jobs: ResearchJob[] = picked.map(r => ({
    id: `research:${r.orgnr}`, legalName: r.name, orgnr: r.orgnr, city: r.city, sni: r.sni,
    searchQueries: searchQueries(r).slice(0, 3),
    status: 'RESEARCH_NOT_STARTED', outreachReady: false, contactability: 'BLOCKED_PENDING_VERIFICATION', sourceDate,
  }))
  return { status: 'ready', jobs, eligible: eligible.length, skipped, outreachReady: false }
}

// ---------------------------------------------------------------- URL safety

const PRIVATE_SUFFIXES = [
  'localhost', 'local', 'internal', 'localdomain', 'lan', 'home', 'corp', 'intranet', 'private', 'test', 'invalid', 'example', 'arpa',
]
/** Directories, marketplaces and social profiles are never "the company's official site". */
const NON_OFFICIAL_HOSTS = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'twitter.com', 'x.com', 'google.com',
  'allabolag.se', 'hitta.se', 'eniro.se', 'ratsit.se', 'merinfo.se', 'proff.se', 'upplysning.se',
  'blocket.se', 'bytbil.com', 'wayke.se', 'bilweb.se',
]
/** Group sites may only vouch for a company that is named by organisation number on the page. */
const GROUP_HOSTS = ['bilia.se', 'bilia.com', 'hedinautomotive.com', 'hedinbil.se', 'bilhuset.se']

export interface SafeUrl { href: string; host: string }

/** Strict public https URL or null. Never returns anything for IPs, credentials, ports or private names. */
export function parseSafePublicUrl(input: unknown): SafeUrl | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > 300) return null
  if (input !== input.trim() || /[\u0000-\u0020\u007f<>"'\\]/.test(input)) return null
  let u: URL
  try { u = new URL(input) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password || u.port !== '') return null
  const host = u.hostname.toLowerCase()
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null
  const labels = host.split('.')
  if (labels.length < 2) return null
  if (labels.some(l => l.length === 0 || l.length > 63 || l.startsWith('-') || l.endsWith('-'))) return null
  const tld = labels[labels.length - 1]
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(tld)) return null // also rejects dotted IPv4 forms
  if (PRIVATE_SUFFIXES.includes(tld)) return null
  u.hash = ''
  return { href: u.href, host }
}

const stripWww = (h: string) => h.replace(/^www\./, '')
const hostMatches = (host: string, domain: string) => host === domain || host.endsWith('.' + domain)
/** True for directories, marketplaces and social hosts: these can never be an official company site. */
export const isNonOfficialHost = (host: string) => NON_OFFICIAL_HOSTS.some(d => hostMatches(host, d))
const sameSiteFamily = (a: string, b: string) => {
  const x = stripWww(a), y = stripWww(b)
  return x === y || x.endsWith('.' + y) || y.endsWith('.' + x)
}

// ---------------------------------------------------------------- observations

interface Observation {
  url: SafeUrl
  sourceKind: SourceKind
  observedOn: string
  identityByOrgnr: boolean
  identityByName: boolean
  indicators: BusinessIndicator[]
  excerpt: string
  email: { value: string; url: SafeUrl } | null
  phone: { value: string; url: SafeUrl } | null
  contactRejections: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const normName = (s: string) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim()

function validIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= LEAD_RESEARCH_MIN_OBSERVATION_DATE
}

/** Excerpts are short human-readable evidence, never carriers of contact data or markup. */
function safeExcerpt(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.length === 0 || t.length > LEAD_RESEARCH_EXCERPT_MAX) return null
  if (/[\u0000-\u001f\u007f<>]/.test(t) || /@|https?:\/\/|www\./i.test(t) || /(?:\+|00)?\d(?:[\s-]?\d){7,}/.test(t)) return null
  return t
}

function matchesOrgnr(v: unknown, orgnr: string): boolean {
  if (typeof v !== 'string') return false
  const t = v.trim()
  return /^\d{10}$/.test(t) ? t === orgnr : /^\d{6}-\d{4}$/.test(t) && t.replace('-', '') === orgnr
}

function parseEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return /^[a-z0-9]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(t) ? t : null
}

function parsePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!/^\+?[\d\s()-]{6,20}$/.test(t)) return null
  const digits = t.replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 15) return null
  return t
}

const isSwedishMobile = (phone: string) => {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  const national = d.startsWith('46') ? d.slice(2) : d.startsWith('0') ? d.slice(1) : d
  return /^7/.test(national)
}

function parseObservation(raw: unknown, job: ResearchJob): Observation | null {
  if (!isObj(raw)) return null
  const url = parseSafePublicUrl(raw.sourceUrl)
  if (!url) return null
  if (!(SOURCE_KINDS as readonly string[]).includes(raw.sourceKind as string)) return null
  const sourceKind = raw.sourceKind as SourceKind
  if (sourceKind === 'official_company_site' && NON_OFFICIAL_HOSTS.some(d => hostMatches(url.host, d))) return null
  if (!validIsoDate(raw.observedOn)) return null
  const excerpt = safeExcerpt(raw.excerpt)
  if (!excerpt) return null
  const ind = raw.observedBusinessIndicators
  if (!Array.isArray(ind) || ind.length > BUSINESS_INDICATORS.length ||
    !ind.every(i => (BUSINESS_INDICATORS as readonly string[]).includes(i as string)) || new Set(ind).size !== ind.length) return null

  // A mismatching organisation number means "another company"; it can never be offset by a matching name.
  const hasOrgnr = raw.orgnrOnPage !== undefined && raw.orgnrOnPage !== null
  const identityByOrgnr = hasOrgnr && matchesOrgnr(raw.orgnrOnPage, job.orgnr)
  const identityByName = !hasOrgnr && typeof raw.legalNameOnPage === 'string' && raw.legalNameOnPage.length <= 120 &&
    normName(raw.legalNameOnPage) !== '' && normName(raw.legalNameOnPage) === normName(job.legalName)

  const contactRejections: string[] = []
  let email: Observation['email'] = null
  if (raw.generalBusinessEmail !== undefined) {
    const addr = parseEmail(raw.generalBusinessEmail)
    const where = parseSafePublicUrl(raw.emailSourceUrl)
    if (!addr) contactRejections.push('email_invalid')
    else if (!(GENERIC_MAILBOXES as readonly string[]).includes(addr.split('@')[0])) contactRejections.push('email_not_generic')
    else if (!where) contactRejections.push('email_source_url_unsafe')
    else email = { value: addr, url: where }
  }
  let phone: Observation['phone'] = null
  if (raw.switchboardPhone !== undefined) {
    const num = parsePhone(raw.switchboardPhone)
    const where = parseSafePublicUrl(raw.phoneSourceUrl)
    if (!num) contactRejections.push('phone_invalid')
    else if (typeof raw.phoneLabel !== 'string' || raw.phoneLabel.trim().toLowerCase() !== SWITCHBOARD_LABEL) contactRejections.push('phone_not_labeled_switchboard')
    else if (isSwedishMobile(num)) contactRejections.push('phone_is_mobile')
    else if (!where) contactRejections.push('phone_source_url_unsafe')
    else phone = { value: num, url: where }
  }

  return {
    url, sourceKind, observedOn: raw.observedOn, identityByOrgnr, identityByName,
    indicators: ind as BusinessIndicator[], excerpt, email, phone, contactRejections,
  }
}

// ---------------------------------------------------------------- evaluation

export type EvidenceClassification = 'DEALER_EVIDENCE' | 'OUT_OF_SCOPE_EVIDENCE' | 'NEEDS_FURTHER_RESEARCH'

export interface ContactProposal {
  generalBusinessEmail: { value: string; sourceUrl: string } | null
  switchboardPhone: { value: string; sourceUrl: string } | null
  status: 'NEEDS_MANUAL_CONTACT_CHECK'
  contactability: 'BLOCKED_PENDING_VERIFICATION'
}

export interface EvidenceItem {
  sourceUrl: string
  sourceKind: SourceKind
  observedOn: string
  indicators: BusinessIndicator[]
  excerpt: string
}

export interface LeadEvidenceResult {
  jobId: string
  orgnr: string
  classification: EvidenceClassification
  reasons: string[]
  identityVerified: boolean
  officialSite: string | null
  evidence: EvidenceItem[]
  rejectedObservations: number
  contactProposal: ContactProposal | null
  contactReviewState: 'NEEDS_MANUAL_CONTACT_CHECK'
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  outreachReady: false
}

function jobIsValid(job: unknown): job is ResearchJob {
  if (!isObj(job) || typeof job.orgnr !== 'string' || typeof job.legalName !== 'string' ||
    job.legalName.length < 2 || job.legalName.length > 120 || /[@<>\u0000-\u001f]/.test(job.legalName) ||
    job.status !== 'RESEARCH_NOT_STARTED' || job.outreachReady !== false ||
    job.contactability !== 'BLOCKED_PENDING_VERIFICATION' ||
    typeof job.id !== 'string' || job.id !== 'research:' + job.orgnr) return false
  try { return parseReviewLegalOrgnr(job.orgnr) === job.orgnr }
  catch { return false }
}

export function evaluateLeadEvidence(job: ResearchJob, observations: unknown): LeadEvidenceResult {
  const base = {
    contactReviewState: 'NEEDS_MANUAL_CONTACT_CHECK', contactability: 'BLOCKED_PENDING_VERIFICATION', outreachReady: false,
  } as const
  const result = (
    classification: EvidenceClassification, reasons: string[], extra: Partial<LeadEvidenceResult> = {},
  ): LeadEvidenceResult => ({
    jobId: jobIsValid(job) ? job.id : 'unknown',
    orgnr: jobIsValid(job) ? job.orgnr : 'unknown',
    classification, reasons, identityVerified: false, officialSite: null, evidence: [], rejectedObservations: 0,
    contactProposal: null, ...base, ...extra,
  })

  if (!jobIsValid(job)) return result('NEEDS_FURTHER_RESEARCH', ['job_invalid'])
  if (!Array.isArray(observations) || observations.length === 0) return result('NEEDS_FURTHER_RESEARCH', ['no_observations'])
  if (observations.length > LEAD_RESEARCH_MAX_OBSERVATIONS) return result('NEEDS_FURTHER_RESEARCH', ['too_many_observations'], { rejectedObservations: observations.length })

  const accepted: Observation[] = []
  for (const raw of observations) {
    const o = parseObservation(raw, job)
    if (o) accepted.push(o)
  }
  const rejected = observations.length - accepted.length
  const reasons: string[] = []
  if (rejected > 0) reasons.push('observations_rejected')
  const evidence: EvidenceItem[] = accepted.map(o => ({
    sourceUrl: o.url.href, sourceKind: o.sourceKind, observedOn: o.observedOn, indicators: o.indicators, excerpt: o.excerpt,
  }))
  if (accepted.length === 0) return result('NEEDS_FURTHER_RESEARCH', [...reasons, 'no_valid_observations'], { rejectedObservations: rejected })

  // Identity needs an official site. Group-owned domains require the exact organisation number.
  const verified = accepted.find(o => {
    if (o.sourceKind !== 'official_company_site') return false
    const group = GROUP_HOSTS.some(d => hostMatches(o.url.host, d))
    return o.identityByOrgnr || (!group && o.identityByName)
  })
  const partial = { evidence, rejectedObservations: rejected }
  if (!verified) {
    const officialSeen = accepted.some(o => o.sourceKind === 'official_company_site')
    return result('NEEDS_FURTHER_RESEARCH', [...reasons, officialSeen ? 'identity_not_proven' : 'no_official_site'], partial)
  }

  const site = verified.url.host
  const onSite = accepted.filter(o => o.sourceKind === 'official_company_site' && sameSiteFamily(o.url.host, site))
  const saleOnSite = onSite.some(o => o.indicators.some(i => SALE_INDICATORS.includes(i)))
  const anyVehicleSignal = accepted.some(o => o.indicators.some(i => VEHICLE_SIGNALS.includes(i)))
  const otherIndustry = onSite.some(o => o.indicators.some(i => OTHER_INDUSTRY.includes(i)))

  let classification: EvidenceClassification = 'NEEDS_FURTHER_RESEARCH'
  if (saleOnSite) { classification = 'DEALER_EVIDENCE'; reasons.push('official_site_vehicle_sale_evidence') }
  else if (otherIndustry && !anyVehicleSignal) { classification = 'OUT_OF_SCOPE_EVIDENCE'; reasons.push('official_site_other_industry_evidence') }
  else reasons.push(anyVehicleSignal ? 'vehicle_signal_not_on_verified_official_site' : 'no_business_evidence')

  // General contacts: only for a verified legal entity, only from the verified site family.
  let emailProposal: ContactProposal['generalBusinessEmail'] = null
  let phoneProposal: ContactProposal['switchboardPhone'] = null
  for (const o of onSite) {
    for (const r of o.contactRejections) reasons.push(r)
    if (!emailProposal && o.email) {
      const domain = o.email.value.split('@')[1]
      const siteBare = stripWww(site)
      if (!(siteBare === domain || siteBare.endsWith('.' + domain))) reasons.push('email_domain_mismatch')
      else if (!sameSiteFamily(o.email.url.host, site)) reasons.push('email_source_not_on_official_site')
      else emailProposal = { value: o.email.value, sourceUrl: o.email.url.href }
    }
    if (!phoneProposal && o.phone) {
      if (!sameSiteFamily(o.phone.url.host, site)) reasons.push('phone_source_not_on_official_site')
      else phoneProposal = { value: o.phone.value, sourceUrl: o.phone.url.href }
    }
  }
  const contactProposal: ContactProposal | null = emailProposal || phoneProposal
    ? { generalBusinessEmail: emailProposal, switchboardPhone: phoneProposal, status: 'NEEDS_MANUAL_CONTACT_CHECK', contactability: 'BLOCKED_PENDING_VERIFICATION' }
    : null
  if (contactProposal) reasons.push('general_contact_proposed_manual_check')

  return result(classification, [...new Set(reasons)], {
    identityVerified: true, officialSite: verified.url.href, contactProposal, ...partial,
  })
}
