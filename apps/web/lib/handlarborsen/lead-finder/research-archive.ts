import { parseReviewLegalOrgnr } from './client-review-core'
import { parseSafePublicUrl } from './lead-research'
import { normalizeCompanyName } from './identity'
import { buildExclusionIndex, lookupExclusions } from './exclusions'
import type { KnownContacts } from './known-contacts'
import type { ExistingEntry } from './types'

/**
 * Non-contactable, legal-entity-only results of the manually approved
 * 2026-10-28 research run. No emails, phone numbers or personal identities.
 * Never treats a search result or apparent brand domain as legal verification.
 */
export const RESEARCH_ARCHIVE_COUNT = 81
export const RESEARCH_ARCHIVE_MAX_FILE_BYTES = 95_000
export const ARCHIVE_LABELS = [
  'Företagsuppgifter – mer research',
  'Bilförsäljning på möjlig egen webbplats – juridik ej verifierad',
  'Handlarprofil på marknadsplats – juridik ej verifierad',
  'Registrerad bilhandel – aktuell försäljning ej verifierad',
  'Annan verksamhet indikerad – manuell kontroll',
  'Inga relevanta källor',
] as const
export type ArchiveLabel = typeof ARCHIVE_LABELS[number]

export type ArchiveCompany = {
  orgnr: string
  name: string
  city: string
  matches: number
  ownDomain: string | null
  source: string
  label: ArchiveLabel
  sale: boolean
  registeredOnly: boolean
  other: boolean
  contactable: false
}

export type ArchiveSummary = {
  totalSCB: 89
  eligible: 81
  covered: 81
  entries: number
  budgetBookkeeping: number
  budgetCap: 120
  potentialOwnDomain: number
  saleSignalsToReview: number
  registeredOnly: number
  noRelevantSource: number
  noneContactable: true
}

export type ArchiveReport = { counts: ArchiveSummary; result: ArchiveCompany[] }
export type ArchiveParse =
  | { ok: true; value: ArchiveReport }
  | { ok: false; reason: 'shape_invalid' | 'company_invalid' | 'counts_invalid' }

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const plainName = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length >= 2 && v.length <= max &&
  !/[\u0000-\u001f\u007f<>@]/.test(v) && !/https?:\/\//i.test(v)
const legalOrgnr = (s: unknown): s is string => {
  if (typeof s !== 'string') return false
  try { return parseReviewLegalOrgnr(s) === s } catch { return false }
}
const safeUrl = (v: unknown): v is string =>
  typeof v === 'string' && (v === '' || parseSafePublicUrl(v)?.href === v)

export function parseResearchArchive(input: unknown): ArchiveParse {
  if (!object(input) || Object.keys(input).sort().join(',') !== 'counts,result' ||
    !object(input.counts) || !Array.isArray(input.result) ||
    input.result.length !== RESEARCH_ARCHIVE_COUNT) return { ok: false, reason: 'shape_invalid' }
  const keys = ['orgnr', 'name', 'city', 'matches', 'ownDomain', 'source',
    'label', 'sale', 'registeredOnly', 'other', 'contactable']
  const seen = new Set<string>()
  const result: ArchiveCompany[] = []
  for (const raw of input.result) {
    if (!object(raw) || Object.keys(raw).sort().join(',') !== [...keys].sort().join(',') ||
      !legalOrgnr(raw.orgnr) || seen.has(raw.orgnr) ||
      !plainName(raw.name, 120) || !plainName(raw.city, 60) ||
      !Number.isInteger(raw.matches) || (raw.matches as number) < 0 || (raw.matches as number) > 5 ||
      !safeUrl(raw.source) || !(raw.ownDomain === null || (typeof raw.ownDomain === 'string' && safeUrl(raw.ownDomain) && raw.ownDomain !== '')) ||
      !(ARCHIVE_LABELS as readonly unknown[]).includes(raw.label) ||
      typeof raw.sale !== 'boolean' || typeof raw.registeredOnly !== 'boolean' ||
      typeof raw.other !== 'boolean' || raw.contactable !== false ||
      (raw.matches === 0 && raw.source !== '' && raw.source !== raw.ownDomain) ||
      (raw.sale && raw.label !== ARCHIVE_LABELS[1] && raw.label !== ARCHIVE_LABELS[2]) ||
      (raw.label === ARCHIVE_LABELS[5] && raw.matches !== 0)) {
      return { ok: false, reason: 'company_invalid' }
    }
    seen.add(raw.orgnr)
    result.push(raw as ArchiveCompany)
  }
  const c = input.counts
  if (Object.keys(c).sort().join(',') !== [
    'totalSCB', 'eligible', 'covered', 'entries', 'budgetBookkeeping',
    'budgetCap', 'potentialOwnDomain', 'saleSignalsToReview',
    'registeredOnly', 'noRelevantSource', 'noneContactable',
  ].sort().join(',') ||
    c.totalSCB !== 89 || c.eligible !== 81 || c.covered !== 81 ||
    c.budgetCap !== 120 || c.noneContactable !== true ||
    !Number.isInteger(c.entries) || (c.entries as number) < 0 || (c.entries as number) > 120 ||
    !Number.isInteger(c.budgetBookkeeping) || (c.budgetBookkeeping as number) < 0 || (c.budgetBookkeeping as number) > 120 ||
    c.potentialOwnDomain !== result.filter(x => x.ownDomain).length ||
    c.saleSignalsToReview !== result.filter(x => x.sale).length ||
    c.registeredOnly !== result.filter(x => x.registeredOnly && !x.sale).length ||
    c.noRelevantSource !== result.filter(x => x.matches === 0).length) {
    return { ok: false, reason: 'counts_invalid' }
  }
  return { ok: true, value: { counts: c as ArchiveSummary, result } }
}

export type ArchiveCrmState = 'matched_existing_contact' | 'matched_documented_history' | 'no_match_in_partial_history' | 'crm_unavailable'
export type ArchiveReviewCompany = ArchiveCompany & {
  crm: ArchiveCrmState
  crmReasons: readonly string[]
  outreachReady: false
  historyComplete: false
}
export type ArchiveReview = {
  status: 'ready'
  report: { counts: ArchiveSummary; result: ArchiveReviewCompany[] }
  sourceDigest: string
  createdAt: string
  crmStatus: KnownContacts['status']
  outreachReady: false
  historyComplete: false
} | { status: 'disabled' | 'unavailable' | 'empty' }

/** Exact normalized name/orgnr only. A nonmatch never proves a new lead. */
export function reconcileArchiveWithCrm(
  report: ArchiveReport, known: KnownContacts,
  documented: readonly ExistingEntry[] = [],
): ArchiveReviewCompany[] {
  const index = known.status === 'ready' ? buildExclusionIndex(known.entries) : null
  const documentedIndex = documented.length > 0 ? buildExclusionIndex(documented) : null
  return report.result.map(company => {
    const identity = { orgnr: company.orgnr, normalizedName: normalizeCompanyName(company.name) }
    const crmReasons = index ? lookupExclusions(index, identity) : []
    const documentedReasons = documentedIndex ? lookupExclusions(documentedIndex, identity) : []
    return {
      ...company,
      crm: crmReasons.length > 0 ? 'matched_existing_contact' as const :
        documentedReasons.length > 0 ? 'matched_documented_history' as const :
        !index ? 'crm_unavailable' as const : 'no_match_in_partial_history' as const,
      // Reasons are exclusion categories only; never serialize names, email,
      // contact details or private history rows into the client response.
      crmReasons: [...new Set([...crmReasons, ...documentedReasons])],
      outreachReady: false as const,
      historyComplete: false as const,
    }
  })
}
