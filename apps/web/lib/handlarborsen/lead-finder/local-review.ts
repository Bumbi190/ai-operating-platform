import { parseReviewCsv, parseReviewLegalOrgnr, STATUS_AUDIT_EXPORT_COLUMNS } from './client-review-core'

/**
 * Pure, sanitized display model for the local, owner-only SCB audited review.
 * No network, filesystem or auth here: callers hand in text that was already read.
 * Everything is validated BEFORE rendering; any mismatch yields `unavailable`,
 * never an empty/zero result that could be mistaken for a real one.
 */
export const LOCAL_REVIEW_MAX_ROWS = 100
export const LOCAL_REVIEW_PROVENANCE = 'SCB 2026-10-27'
export const LOCAL_REVIEW_FILTERS = ['all', 'active', 'inactive', 'restricted', 'prior', 'possible_group', 'other_legal_form'] as const
export type LocalReviewFilter = (typeof LOCAL_REVIEW_FILTERS)[number]

/** Safe, enumerated reasons only. Never contains file content, paths or row data. */
export type LocalReviewFailure =
  | 'csv_malformed' | 'header_mismatch' | 'too_many_rows' | 'row_invalid' | 'duplicate_orgnr'
  | 'summary_invalid' | 'summary_mismatch'

export class LocalReviewError extends Error {
  constructor(readonly code: LocalReviewFailure) {
    super('Local review refused: ' + code)
    this.name = 'LocalReviewError'
  }
}
const fail = (code: LocalReviewFailure): never => { throw new LocalReviewError(code) }
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

export interface LocalReviewRow {
  name: string
  orgnr: string
  city: string
  sni: string
  scbActive: boolean
  legalFormCode: string
  legalFormLabel: string
  otherLegalForm: boolean
  restricted: boolean
  restrictedChannels: ('reklam' | 'epost' | 'telefon')[]
  priorContact: boolean
  /** Name-token hypothesis only. Never an ownership claim. */
  groupHypothesis: string | null
  reviewState: 'awaiting_human_review'
  contactability: 'BLOCKED_PENDING_VERIFICATION'
}

export interface LocalReviewCounts {
  total: number
  active: number
  inactive: number
  restricted: number
  priorContact: number
  possibleGroup: number
  otherLegalForm: number
}

export interface LocalReview {
  rows: LocalReviewRow[]
  counts: LocalReviewCounts
  excludedPhysicalPersons: number
  sourceRows: number
  provenance: typeof LOCAL_REVIEW_PROVENANCE
  historyCoverage: 'PARTIAL'
  outreachReady: 0
}

export type LocalReviewState =
  | { status: 'disabled' }
  | { status: 'unavailable'; reason: string }
  | { status: 'ready'; review: LocalReview }

const EXPECTED_SUMMARY = {
  sourceRows: 90, reviewedLegalEntities: 89, excludedPhysicalPersons: 1,
  activePerScb: 83, notActivePerScb: 6, scbRestrictionRows: 1, knownPriorContacts: 1,
} as const

/** Aktiebolag. Anything else is shown but flagged as another legal form. */
const AKTIEBOLAG_CODE = '49'

function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i])
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
// Contact-like content never belongs in a name/city/label field.
const contactLike = (s: string) =>
  /@|https?:\/\/|www\./i.test(s) || /(?:\+|00)?\d(?:[\s-]?\d){7,}/.test(s) || /\b\d{6}[-+]?\d{4}\b/.test(s)
const safeText = (v: string, limit: number): boolean =>
  v.length > 0 && v.length <= limit && v === v.trim() && !/[\u0000-\u001f\u007f<>]/.test(v) && !contactLike(v)

const CHANNELS = [
  ['reklam', 'reklamCode', ['1', '2']],
  ['epost', 'epostCode', ['1', '2']],
  ['telefon', 'telefonCode', ['1', '2', '3']],
] as const

const GENERIC_GROUP_TOKENS = new Set([
  'bil', 'bilar', 'bilhandel', 'bilcenter', 'bilservice', 'bilforsaljning', 'bilforetag', 'motor', 'motors', 'fordon', 'auto', 'car', 'cars',
  'ab', 'aktiebolag', 'aktiebolaget', 'aktiebolags', 'och', 'the', 'nya', 'ny', 'sverige', 'svenska', 'nordic', 'skane', 'syd', 'norr', 'vast', 'ost',
  'center', 'centrum', 'service', 'trading', 'group', 'holding', 'invest', 'fastighet', 'fastigheter',
  'malmo', 'lund', 'helsingborg', 'helsingborgs', 'kristianstad', 'kristianstads', 'ystad', 'ystads', 'goteborg', 'stockholm', 'landskrona',
  'trelleborg', 'eslov', 'hassleholm', 'halmstad', 'karlskrona', 'vaxjo', 'kalmar', 'uppsala', 'orebro', 'linkoping', 'norrkoping',
])

function firstToken(name: string): { original: string; folded: string } | null {
  const original = name.trim().split(/[\s,.&/-]+/)[0] ?? ''
  const folded = fold(original)
  if (folded.length < 4 || !/^[a-z]+$/.test(folded)) return null
  return { original, folded }
}

function assignGroupHypotheses(rows: Omit<LocalReviewRow, 'groupHypothesis'>[]): LocalReviewRow[] {
  const byToken = new Map<string, number>()
  const tokens = rows.map(r => {
    const t = firstToken(r.name)
    if (!t || GENERIC_GROUP_TOKENS.has(t.folded) || t.folded === fold(r.city)) return null
    byToken.set(t.folded, (byToken.get(t.folded) ?? 0) + 1)
    return t
  })
  return rows.map((r, i) => {
    const t = tokens[i]
    const shared = t && (byToken.get(t.folded) ?? 0) >= 2
    return { ...r, groupHypothesis: shared ? t.original : null }
  })
}

function parseSummary(input: unknown): Record<string, unknown> {
  if (!isObj(input)) return fail('summary_invalid')
  const s = isObj(input.summary) ? input.summary : input
  if (s.outreachReady !== 0 || s.contactability !== 'BLOCKED_PENDING_VERIFICATION' ||
    s.sourceStatus !== 'OFFLINE_CORRECTED_FROM_SCB_CODEBOOKS') return fail('summary_invalid')
  // History coverage may be recorded under either name; none may say anything but PARTIAL.
  const coverage = [s.sourceCoverage, s.historyCoverage].filter(v => v !== undefined)
  if (coverage.length === 0 || coverage.some(v => v !== 'PARTIAL')) return fail('summary_invalid')
  return s
}

/** Throws LocalReviewError. Use buildLocalReview for the non-throwing variant. */
export function parseLocalReview(csvText: string, summaryInput: unknown): LocalReview {
  const summary = parseSummary(summaryInput)

  let table: string[][]
  try { table = parseReviewCsv(csvText) } catch { return fail('csv_malformed') }
  const header = table.shift()
  if (!header || header.length !== STATUS_AUDIT_EXPORT_COLUMNS.length ||
    header.join('|') !== STATUS_AUDIT_EXPORT_COLUMNS.join('|')) return fail('header_mismatch')
  if (table.length > LOCAL_REVIEW_MAX_ROWS) return fail('too_many_rows')

  const seen = new Set<string>()
  const partial: Omit<LocalReviewRow, 'groupHypothesis'>[] = []
  for (const cells of table) {
    if (cells.length !== header.length) return fail('row_invalid')
    const r = Object.fromEntries(header.map((h, i) => [h, cells[i]])) as Record<(typeof STATUS_AUDIT_EXPORT_COLUMNS)[number], string>

    if (r.manual_review_only !== 'true' || r.NOT_CONTACTABLE !== 'true' || r.historyCoverage !== 'PARTIAL') return fail('row_invalid')
    if (r.legalIdentityReview !== 'JE_IDENTITY_CONFIRMED') return fail('row_invalid')
    if (!safeText(r.legalCompanyName, 120) || !safeText(r.city, 60)) return fail('row_invalid')

    if (!/^\d{10}$/.test(r.orgnr) || !luhnValid(r.orgnr)) return fail('row_invalid')
    try { if (parseReviewLegalOrgnr(r.orgnr) !== r.orgnr) return fail('row_invalid') } catch { return fail('row_invalid') }
    if (seen.has(r.orgnr)) return fail('duplicate_orgnr')
    seen.add(r.orgnr)

    if (!/^\d{2}\.\d{3}(;\d{2}\.\d{3})*$/.test(r.sni)) return fail('row_invalid')
    if (!/^\d{1,2}$/.test(r.legalFormCode) || r.legalFormCode === '10') return fail('row_invalid')
    if (!safeText(r.legalFormLabel, 80) || /fysisk/i.test(r.legalFormLabel)) return fail('row_invalid')

    if (!['0', '1', '9'].includes(r.scbStatusCode)) return fail('row_invalid')
    const active = r.scbStatusCode === '1'
    if (r.scbStatusClass !== (active ? 'ACTIVE_PER_SCB_NOT_MARKETING_APPROVAL' : 'NOT_ACTIVE_PER_SCB')) return fail('row_invalid')

    const restrictedChannels: ('reklam' | 'epost' | 'telefon')[] = []
    for (const [channel, column, allowed] of CHANNELS) {
      const code = r[column]
      if (!(allowed as readonly string[]).includes(code)) return fail('row_invalid')
      if (code !== '1') restrictedChannels.push(channel)
    }
    const restricted = restrictedChannels.length > 0
    if (r.marketingReview !== (restricted ? 'RESTRICTION_MANUAL_REVIEW' : 'NO_SCB_RESTRICTION_SIGNAL_NOT_PERMISSION')) return fail('row_invalid')
    if (r.priorContactReview !== 'KNOWN_PRIOR_CONTACT' && r.priorContactReview !== 'NO_MATCH_IN_PARTIAL_HISTORY') return fail('row_invalid')

    partial.push({
      name: r.legalCompanyName, orgnr: r.orgnr, city: r.city, sni: r.sni, scbActive: active,
      legalFormCode: r.legalFormCode, legalFormLabel: r.legalFormLabel, otherLegalForm: r.legalFormCode !== AKTIEBOLAG_CODE,
      restricted, restrictedChannels, priorContact: r.priorContactReview === 'KNOWN_PRIOR_CONTACT',
      reviewState: 'awaiting_human_review', contactability: 'BLOCKED_PENDING_VERIFICATION',
    })
  }

  const rows = assignGroupHypotheses(partial)
  const counts: LocalReviewCounts = {
    total: rows.length,
    active: rows.filter(r => r.scbActive).length,
    inactive: rows.filter(r => !r.scbActive).length,
    restricted: rows.filter(r => r.restricted).length,
    priorContact: rows.filter(r => r.priorContact).length,
    possibleGroup: rows.filter(r => r.groupHypothesis !== null).length,
    otherLegalForm: rows.filter(r => r.otherLegalForm).length,
  }

  // Every number is recomputed from rows and compared with the pinned snapshot.
  const e = EXPECTED_SUMMARY
  if (summary.sourceRows !== e.sourceRows || summary.excludedPhysicalPersons !== e.excludedPhysicalPersons ||
    summary.reviewedLegalEntities !== e.reviewedLegalEntities || summary.activePerScb !== e.activePerScb ||
    summary.notActivePerScb !== e.notActivePerScb || summary.scbRestrictionRows !== e.scbRestrictionRows ||
    summary.knownPriorContacts !== e.knownPriorContacts) return fail('summary_mismatch')
  if (counts.total !== e.reviewedLegalEntities || counts.active !== e.activePerScb || counts.inactive !== e.notActivePerScb ||
    counts.restricted !== e.scbRestrictionRows || counts.priorContact !== e.knownPriorContacts) return fail('summary_mismatch')
  if (e.reviewedLegalEntities + e.excludedPhysicalPersons !== e.sourceRows) return fail('summary_mismatch')
  const channelCount = (c: 'reklam' | 'epost' | 'telefon') => rows.filter(r => r.restrictedChannels.includes(c)).length
  for (const [key, c] of [['reklamRestricted', 'reklam'], ['emailRestricted', 'epost'], ['phoneRestricted', 'telefon']] as const) {
    if (summary[key] !== undefined && summary[key] !== channelCount(c)) return fail('summary_mismatch')
  }

  return {
    rows, counts, excludedPhysicalPersons: e.excludedPhysicalPersons, sourceRows: e.sourceRows,
    provenance: LOCAL_REVIEW_PROVENANCE, historyCoverage: 'PARTIAL', outreachReady: 0,
  }
}

/** Non-throwing wrapper: failure becomes `unavailable` with a safe code only. */
export function buildLocalReview(csvText: string, summaryText: string): LocalReviewState {
  let summary: unknown
  try { summary = JSON.parse(summaryText) } catch { return { status: 'unavailable', reason: 'summary_invalid' } }
  try {
    return { status: 'ready', review: parseLocalReview(csvText, summary) }
  } catch (err) {
    return { status: 'unavailable', reason: err instanceof LocalReviewError ? err.code : 'row_invalid' }
  }
}

export function normalizeLocalFilter(value: string): LocalReviewFilter {
  return (LOCAL_REVIEW_FILTERS as readonly string[]).includes(value) ? (value as LocalReviewFilter) : 'all'
}

/**
 * Paginates a filtered snapshot without changing its contents or permissions.
 * An old page number is safely clamped when a search narrows the results.
 */
export function paginateLocalReview(
  rows: LocalReviewRow[], requestedPage: number, pageSize = 15,
): { items: LocalReviewRow[]; page: number; pages: number; from: number; to: number; total: number } {
  const size = Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50 ? pageSize : 15
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Number.isInteger(requestedPage) ? Math.min(pages, Math.max(1, requestedPage)) : 1
  const start = (page - 1) * size
  return {
    items: rows.slice(start, start + size),
    page, pages,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
    total,
  }
}

/** Search on name / orgnr / city plus one filter. Pure and total. */
export function filterLocalReview(rows: LocalReviewRow[], query: string, filter: string): LocalReviewRow[] {
  const q = fold(query.slice(0, 80))
  const digits = q.replace(/\D/g, '')
  const f = normalizeLocalFilter(filter)
  return rows.filter(r => {
    if (f === 'active' && !r.scbActive) return false
    if (f === 'inactive' && r.scbActive) return false
    if (f === 'restricted' && !r.restricted) return false
    if (f === 'prior' && !r.priorContact) return false
    if (f === 'possible_group' && r.groupHypothesis === null) return false
    if (f === 'other_legal_form' && !r.otherLegalForm) return false
    if (!q) return true
    return fold(r.name).includes(q) || fold(r.city).includes(q) || (digits.length >= 3 && r.orgnr.includes(digits))
  })
}
