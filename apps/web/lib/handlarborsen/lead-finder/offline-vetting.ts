import { looksLikePersonnummer, luhnValid, normalizeCompanyName } from './identity'

/**
 * Offline vetting of a LOCAL SCB preview CSV against a PARTIAL, company-only
 * snapshot of known earlier outreach. Pure: no I/O, no network, no secrets.
 *
 * Hard rules enforced here:
 *  - Fails closed (throws VettingError) on bad/personal orgnr, malformed CSV,
 *    unexpected or contact-data columns, > MAX_VETTING_ROWS rows, duplicate
 *    orgnr and on an untrusted snapshot. No partial report is ever returned.
 *  - A row is NEVER outreach-ready and never "cleared": the history snapshot
 *    is partial, so "no match" proves nothing.
 *  - Name/group/scope findings are advisory hints, never ownership or
 *    eligibility claims.
 */

export const MAX_VETTING_ROWS = 50

export type VettingErrorCode =
  | 'csv_malformed' | 'csv_header' | 'csv_cell' | 'csv_empty' | 'too_many_rows'
  | 'bad_orgnr' | 'personal_orgnr' | 'duplicate_orgnr' | 'contact_data' | 'snapshot_untrusted'

export class VettingError extends Error {
  constructor(readonly code: VettingErrorCode, message: string) {
    super(message)
    this.name = 'VettingError'
  }
}

// ---------------------------------------------------------------- snapshot

export const HISTORIC_STATUSES = [
  'previously_contacted', 'prior_refusal_reported', 'existing_interested_contact', 'excluded_from_initial_outreach',
] as const
export type HistoricStatus = (typeof HISTORIC_STATUSES)[number]

export interface SnapshotSource { id: string; label: string; url: string; documentedAt: string; readAt: string }

export interface SnapshotEntry {
  matchKind: 'exact_orgnr' | 'name_only'
  orgnr: string | null
  name: string
  aliases?: string[]
  status: HistoricStatus
  cohort: string
  sourceId: string
  note?: string
}

export interface KnownOutreachSnapshot {
  schemaVersion: 1
  kind: 'handlarborsen_known_outreach_snapshot'
  asOf: string
  PARTIAL: true
  notAConsentList: true
  companyDataOnly: true
  label: string
  sources: SnapshotSource[]
  coverage: { complete: false; missing: string }
  entries: SnapshotEntry[]
}

const SNAPSHOT_KEYS = ['schemaVersion', 'kind', 'asOf', 'PARTIAL', 'notAConsentList', 'companyDataOnly', 'label', 'sources', 'coverage', 'entries']
const ENTRY_KEYS = ['matchKind', 'orgnr', 'name', 'aliases', 'status', 'cohort', 'sourceId', 'note']
const SOURCE_KEYS = ['id', 'label', 'url', 'documentedAt', 'readAt']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PHONE_RE = /(?:\+|\b00)\d[\d\s-]{7,}|\b0\d{1,3}[-\s]?\d{5,}/

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function untrusted(msg: string): never {
  throw new VettingError('snapshot_untrusted', `Snapshot not trusted: ${msg}`)
}

function noContactData(value: string, where: string, code: VettingErrorCode = 'snapshot_untrusted'): void {
  if (value.includes('@') || /https?:\/\//i.test(value) || /\bwww\./i.test(value) || PHONE_RE.test(value)) {
    throw new VettingError(code, `Contact-like data in ${where}`)
  }
}

function str(v: unknown, where: string, max = 300): string {
  if (typeof v !== 'string' || v.trim() === '' || v.length > max) untrusted(`${where} must be a non-empty string`)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v as string)) untrusted(`${where} contains control characters`)
  return v as string
}

function exactKeys(obj: Record<string, unknown>, allowed: string[], where: string): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) untrusted(`unexpected key "${k}" in ${where}`)
}

/** Strict legal-entity orgnr check (10 digits, Luhn, not personnummer-shaped). */
export function parseLegalOrgnr(raw: string): string {
  const cleaned = raw.trim().replace(/-/g, '')
  if (!/^(\d{10}|16\d{10})$/.test(cleaned)) throw new VettingError('bad_orgnr', 'Orgnr is not a 10-digit (or 16-prefixed 12-digit) number')
  const digits = cleaned.length === 12 ? cleaned.slice(2) : cleaned
  if (Number(digits[2]) < 2 || looksLikePersonnummer(digits)) throw new VettingError('personal_orgnr', 'Orgnr has personnummer shape; refusing to process')
  if (!luhnValid(digits)) throw new VettingError('bad_orgnr', 'Orgnr failed the checksum')
  return digits
}

/** Validates an unknown value as a trusted snapshot. Throws VettingError('snapshot_untrusted'). */
export function validateSnapshot(input: unknown): KnownOutreachSnapshot {
  if (!isRecord(input)) untrusted('not an object')
  const s = input as Record<string, unknown>
  exactKeys(s, SNAPSHOT_KEYS, 'snapshot')
  if (s.schemaVersion !== 1) untrusted('schemaVersion must be 1')
  if (s.kind !== 'handlarborsen_known_outreach_snapshot') untrusted('wrong kind')
  if (s.PARTIAL !== true) untrusted('must be labelled PARTIAL')
  if (s.notAConsentList !== true) untrusted('must be labelled notAConsentList')
  if (s.companyDataOnly !== true) untrusted('must be labelled companyDataOnly')
  if (typeof s.asOf !== 'string' || !DATE_RE.test(s.asOf)) untrusted('asOf must be YYYY-MM-DD')
  const label = str(s.label, 'label', 600)
  if (!isRecord(s.coverage) || s.coverage.complete !== false) untrusted('coverage.complete must be false')
  const missing = str((s.coverage as Record<string, unknown>).missing, 'coverage.missing', 600)

  if (!Array.isArray(s.sources) || s.sources.length === 0) untrusted('sources missing')
  const sources: SnapshotSource[] = (s.sources as unknown[]).map((raw, i) => {
    if (!isRecord(raw)) untrusted(`sources[${i}] not an object`)
    const r = raw as Record<string, unknown>
    exactKeys(r, SOURCE_KEYS, `sources[${i}]`)
    const url = str(r.url, `sources[${i}].url`)
    if (!/^https:\/\/[a-z0-9.-]+\/\S*$/i.test(url) || url.includes('@')) untrusted(`sources[${i}].url must be a plain https link`)
    const documentedAt = str(r.documentedAt, `sources[${i}].documentedAt`)
    const readAt = str(r.readAt, `sources[${i}].readAt`)
    if (!DATE_RE.test(documentedAt) || !DATE_RE.test(readAt)) untrusted(`sources[${i}] dates must be YYYY-MM-DD`)
    return { id: str(r.id, `sources[${i}].id`, 80), label: str(r.label, `sources[${i}].label`), url, documentedAt, readAt }
  })
  const sourceIds = new Set(sources.map((x) => x.id))
  if (sourceIds.size !== sources.length) untrusted('duplicate source ids')

  if (!Array.isArray(s.entries) || s.entries.length === 0) untrusted('entries missing')
  const seenOrg = new Set<string>()
  const entries: SnapshotEntry[] = (s.entries as unknown[]).map((raw, i) => {
    const where = `entries[${i}]`
    if (!isRecord(raw)) untrusted(`${where} not an object`)
    const r = raw as Record<string, unknown>
    exactKeys(r, ENTRY_KEYS, where)
    const matchKind = r.matchKind
    if (matchKind !== 'exact_orgnr' && matchKind !== 'name_only') untrusted(`${where}.matchKind invalid`)
    const status = r.status
    if (!HISTORIC_STATUSES.includes(status as HistoricStatus)) untrusted(`${where}.status invalid`)
    const name = str(r.name, `${where}.name`, 120)
    noContactData(name, `${where}.name`)
    let aliases: string[] | undefined
    if (r.aliases !== undefined) {
      if (!Array.isArray(r.aliases)) untrusted(`${where}.aliases must be an array`)
      aliases = (r.aliases as unknown[]).map((a, j) => {
        const v = str(a, `${where}.aliases[${j}]`, 120)
        noContactData(v, `${where}.aliases[${j}]`)
        return v
      })
    }
    let note: string | undefined
    if (r.note !== undefined) { note = str(r.note, `${where}.note`, 500); noContactData(note, `${where}.note`) }
    const cohort = str(r.cohort, `${where}.cohort`, 80)
    noContactData(cohort, `${where}.cohort`)
    const sourceId = str(r.sourceId, `${where}.sourceId`, 80)
    if (!sourceIds.has(sourceId)) untrusted(`${where}.sourceId unknown`)

    let orgnr: string | null = null
    if (matchKind === 'exact_orgnr') {
      if (typeof r.orgnr !== 'string') untrusted(`${where}.orgnr required for exact_orgnr`)
      try { orgnr = parseLegalOrgnr(r.orgnr as string) } catch { untrusted(`${where}.orgnr invalid`) }
      if (orgnr !== r.orgnr) untrusted(`${where}.orgnr must be stored as 10 plain digits`)
      if (seenOrg.has(orgnr)) untrusted(`${where}.orgnr duplicated`)
      seenOrg.add(orgnr)
    } else if (r.orgnr !== null && r.orgnr !== undefined) {
      untrusted(`${where}.orgnr must be null for name_only (no invented identifiers)`)
    }
    return { matchKind, orgnr, name, ...(aliases ? { aliases } : {}), status: status as HistoricStatus, cohort, sourceId, ...(note ? { note } : {}) } as SnapshotEntry
  })

  return { schemaVersion: 1, kind: 'handlarborsen_known_outreach_snapshot', asOf: s.asOf as string, PARTIAL: true, notAConsentList: true, companyDataOnly: true, label, sources, coverage: { complete: false, missing }, entries }
}

// ---------------------------------------------------------------- CSV

export const PREVIEW_CSV_COLUMNS = [
  'legalCompanyName', 'workplaceName', 'orgnr', 'city', 'sni', 'source', 'retrievedAt', 'workplaceCount',
  'manual_review_only', 'NOT_CONTACTABLE', 'suppression_status', 'opt_out_status',
] as const

/** RFC 4180 parser. Throws on unterminated quotes and stray quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let cellStarted = false
  let closedQuote = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else { inQuotes = false; closedQuote = true }
      } else cell += ch
      continue
    }
    if (ch === '"') {
      if (cell !== '' || cellStarted) throw new VettingError('csv_malformed', 'Stray quote inside an unquoted field')
      inQuotes = true; cellStarted = true; closedQuote = false
    } else if (ch === ',') {
      row.push(cell); cell = ''; cellStarted = false; closedQuote = false
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''; cellStarted = false; closedQuote = false
      if (!(row.length === 1 && row[0] === '')) rows.push(row)
      row = []
    } else {
      if (closedQuote) throw new VettingError('csv_malformed', 'Characters after a closing quote')
      cell += ch
    }
  }
  if (inQuotes) throw new VettingError('csv_malformed', 'Unterminated quoted field')
  if (cell !== '' || cellStarted || row.length > 0) {
    row.push(cell)
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
  }
  return rows
}

export interface PreviewRow {
  legalName: string
  orgnr: string
  city: string
  sni: string
  source: string
  retrievedAt: string
}

const SNI_RE = /^\d{2}\.\d{3}(;\d{2}\.\d{3})*$/

function cellText(v: string, field: string, max: number): string {
  const t = v.trim()
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) throw new VettingError('csv_cell', `Control characters in ${field}`)
  if (t.length > max) throw new VettingError('csv_cell', `${field} too long`)
  noContactData(t, field, 'contact_data')
  return t
}

/** Parses and validates the local preview CSV. Fails closed on anything unexpected. */
export function parsePreviewCsv(text: string): PreviewRow[] {
  const table = parseCsv(text)
  if (table.length === 0) throw new VettingError('csv_empty', 'CSV has no header')
  const header = table[0].map((h) => h.trim())
  const expected: readonly string[] = PREVIEW_CSV_COLUMNS
  const missing = expected.filter((c) => !header.includes(c))
  const extra = header.filter((c) => !expected.includes(c))
  if (missing.length || extra.length || new Set(header).size !== header.length) {
    // Header names are fixed identifiers from the producer; unexpected ones are NOT echoed (could be contact columns).
    throw new VettingError('csv_header', `CSV header mismatch (missing ${missing.length}, unexpected ${extra.length})`)
  }
  const body = table.slice(1)
  if (body.length === 0) throw new VettingError('csv_empty', 'CSV has no data rows')
  if (body.length > MAX_VETTING_ROWS) throw new VettingError('too_many_rows', `More than ${MAX_VETTING_ROWS} rows`)

  const idx = Object.fromEntries(header.map((h, i) => [h, i])) as Record<(typeof PREVIEW_CSV_COLUMNS)[number], number>
  const seen = new Set<string>()
  return body.map((cells, n) => {
    if (cells.length !== header.length) throw new VettingError('csv_malformed', `Row ${n + 1} has ${cells.length} fields, expected ${header.length}`)
    const get = (c: (typeof PREVIEW_CSV_COLUMNS)[number], max = 200) => cellText(cells[idx[c]], c, max)
    // Every cell is scanned for contact-like data, including ones we drop.
    for (const c of PREVIEW_CSV_COLUMNS) get(c, 400)
    const legalName = get('legalCompanyName')
    if (!legalName) throw new VettingError('csv_cell', `Row ${n + 1}: legalCompanyName missing`)
    const orgnr = parseLegalOrgnr(get('orgnr', 20))
    if (seen.has(orgnr)) throw new VettingError('duplicate_orgnr', `Duplicate orgnr in rows (row ${n + 1})`)
    seen.add(orgnr)
    const city = get('city', 80)
    const sni = get('sni', 80)
    if (!SNI_RE.test(sni)) throw new VettingError('csv_cell', `Row ${n + 1}: sni malformed`)
    const retrievedAt = get('retrievedAt', 20)
    if (!DATE_RE.test(retrievedAt)) throw new VettingError('csv_cell', `Row ${n + 1}: retrievedAt malformed`)
    const source = get('source')
    if (!source) throw new VettingError('csv_cell', `Row ${n + 1}: source missing`)
    if (!/^[1-9]\d{0,3}$/.test(get('workplaceCount', 10))) throw new VettingError('csv_cell', `Row ${n + 1}: workplaceCount malformed`)
    // The producer must declare the row as unreviewed/not contactable; anything else is untrusted input.
    if (get('manual_review_only', 10) !== 'true' || get('NOT_CONTACTABLE', 10) !== 'true') throw new VettingError('csv_cell', `Row ${n + 1}: review/contactability flags not as expected`)
    if (get('suppression_status', 40) !== 'NOT_CHECKED' || get('opt_out_status', 40) !== 'UNKNOWN') throw new VettingError('csv_cell', `Row ${n + 1}: suppression/opt-out claims not as expected`)
    return { legalName, orgnr, city, sni, source, retrievedAt }
  })
}

// ---------------------------------------------------------------- vetting

/** Advisory words only: a hit asks for human review, it never rejects. Matched on normalised (folded) names. */
export const OUT_OF_SCOPE_HINT_WORDS = [
  'permobil', 'hjalpmedel', 'inkasso', 'kapital', 'invest', 'demontering', 'skrot', 'forvaltning', 'fastighet', 'holding',
  'finans', 'uthyrning', 'taxi', 'transport', 'bemanning',
] as const

/** First-token stoplist for the tentative group-overlap hint (too generic to indicate a group). */
const GENERIC_TOKENS = new Set([
  'bil', 'bilar', 'bilhandel', 'bilcenter', 'bilservice', 'motor', 'motors', 'fordon', 'auto', 'car', 'cars', 'sverige', 'svenska',
  'skane', 'malmo', 'lund', 'nordic', 'och', 'the', 'nya', 'ny', 'aktiebolaget', 'kristianstads', 'helsingborgs', 'malmos', 'ystads',
])

export type PriorContactResult = 'EXACT_ORGNR_MATCH' | 'NAME_ONLY_POSSIBLE_MATCH' | 'NO_MATCH_IN_PARTIAL_SNAPSHOT'

export interface HistoricMatchRef { status: HistoricStatus; cohort: string; knownAs: string; sourceId: string }

export interface VettedCandidate {
  legalName: string
  orgnr: string
  city: string
  sni: string
  source: string
  retrievedAt: string
  reviewState: 'awaiting_human_review'
  qualification: 'MANUAL_REVIEW_ONLY'
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  /** Literal false: this module can never produce an outreach-ready row. */
  outreachReady: false
  fitReviewFlags: string[]
  priorContactReview: {
    result: PriorContactResult
    flags: string[]
    exactMatches: HistoricMatchRef[]
    nameOnlyMatches: HistoricMatchRef[]
    note: string
  }
  groupReview: { flags: string[]; sharedNameToken: string | null; note: string }
  unknowns: string[]
  reasons: string[]
}

export interface VettingStats {
  totalRows: number
  exactHistoricMatches: number
  nameOnlyHistoricMatches: number
  noMatchInPartialSnapshot: number
  groupOverlapCandidates: number
  possibleOutOfScopeCandidates: number
  /** Always 0 while history is partial. */
  cleared: 0
  outreachReady: 0
  historyCoverage: 'PARTIAL'
}

export interface VettingReport {
  schemaVersion: 1
  kind: 'handlarborsen_offline_vetting_report'
  generatedAt: string
  localOnly: true
  statement: string
  provenance: {
    input: { rows: number; sources: string[]; retrievedAt: string[] }
    snapshot: { asOf: string; PARTIAL: true; exactEntries: number; nameOnlyEntries: number; sources: SnapshotSource[]; coverageMissing: string }
  }
  stats: VettingStats
  candidates: VettedCandidate[]
}

const UNKNOWNS = [
  'ACTIVITY_STATUS_UNKNOWN', 'LEGAL_STATUS_UNKNOWN', 'DEALER_FIT_UNVERIFIED', 'SCB_EPOST_SPARR_TYP_UNKNOWN',
  'SCB_REKLAM_SPARR_TYP_UNKNOWN', 'SCB_TELEFON_SPARR_TYP_UNKNOWN', 'INTERNAL_SUPPRESSIONS_NOT_COMPARED', 'HISTORY_COVERAGE_INCOMPLETE',
]

const tokens = (normalized: string): string[] => normalized.split(' ').filter(Boolean)

function containsTokenSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true
  }
  return false
}

function groupToken(normalizedName: string): string | null {
  const first = tokens(normalizedName)[0]
  return first && first.length >= 4 && !GENERIC_TOKENS.has(first) ? first : null
}

export function vetPreview(csvText: string, snapshotInput: unknown, opts: { generatedAt?: string } = {}): VettingReport {
  const snapshot = validateSnapshot(snapshotInput)
  const rows = parsePreviewCsv(csvText)

  const exactByOrg = new Map<string, SnapshotEntry>()
  for (const e of snapshot.entries) if (e.matchKind === 'exact_orgnr' && e.orgnr) exactByOrg.set(e.orgnr, e)
  const nameKeys = snapshot.entries.map((e) => ({
    entry: e,
    keys: [e.name, ...(e.aliases ?? [])].map((n) => tokens(normalizeCompanyName(n))).filter((t) => t.length > 0),
  }))
  const ref = (e: SnapshotEntry, knownAs = e.name): HistoricMatchRef => ({ status: e.status, cohort: e.cohort, knownAs, sourceId: e.sourceId })

  const groupCounts = new Map<string, number>()
  for (const r of rows) {
    const g = groupToken(normalizeCompanyName(r.legalName))
    if (g) groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1)
  }

  const candidates: VettedCandidate[] = rows.map((r) => {
    const normalized = normalizeCompanyName(r.legalName)
    const nameTokens = tokens(normalized)

    const exact = exactByOrg.get(r.orgnr)
    const exactMatches = exact ? [ref(exact)] : []
    const nameOnlyMatches: HistoricMatchRef[] = []
    for (const { entry, keys } of nameKeys) {
      if (exact && entry === exact) continue
      if (entry.orgnr && entry.orgnr === r.orgnr) continue
      const hit = keys.find((k) => containsTokenSequence(nameTokens, k))
      if (hit) nameOnlyMatches.push(ref(entry, entry.name))
    }

    const priorFlags: string[] = []
    let result: PriorContactResult = 'NO_MATCH_IN_PARTIAL_SNAPSHOT'
    let note = 'No match in a PARTIAL snapshot. This does NOT show that the company was never contacted.'
    if (exactMatches.length) {
      result = 'EXACT_ORGNR_MATCH'
      priorFlags.push('PRIOR_CONTACT_DO_NOT_TREAT_AS_NEW')
      if (exactMatches.some((m) => m.status === 'prior_refusal_reported')) priorFlags.push('PRIOR_REFUSAL_REPORTED_NEEDS_HUMAN_CONFIRMATION')
      note = 'Exact orgnr found in known earlier outreach. Human confirmation required before any recontact consideration.'
    } else if (nameOnlyMatches.length) {
      result = 'NAME_ONLY_POSSIBLE_MATCH'
      priorFlags.push('POSSIBLE_PRIOR_CONTACT_NAME_ONLY_NEEDS_MANUAL_CHECK')
      note = 'Name resembles a previously contacted/held company, orgnr not verified. Could be a different legal entity.'
    }

    const fitFlags: string[] = []
    for (const w of OUT_OF_SCOPE_HINT_WORDS) if (normalized.includes(w)) fitFlags.push(`POSSIBLE_OUT_OF_SCOPE_WORD:${w}`)
    if (/,/.test(r.legalName)) fitFlags.push('NAME_LOOKS_LIKE_PERSON_REVIEW')

    const g = groupToken(normalized)
    const groupFlags = g && (groupCounts.get(g) ?? 0) > 1 ? [`POSSIBLE_NAME_GROUP_OVERLAP:${g}`] : []

    return {
      legalName: r.legalName, orgnr: r.orgnr, city: r.city, sni: r.sni, source: r.source, retrievedAt: r.retrievedAt,
      reviewState: 'awaiting_human_review',
      qualification: 'MANUAL_REVIEW_ONLY',
      contactability: 'BLOCKED_PENDING_VERIFICATION',
      outreachReady: false,
      fitReviewFlags: fitFlags,
      priorContactReview: { result, flags: priorFlags, exactMatches, nameOnlyMatches, note },
      groupReview: {
        flags: groupFlags,
        sharedNameToken: groupFlags.length ? g : null,
        note: groupFlags.length ? 'Shared name token only. Ownership or group membership is NOT established.' : 'No shared-name hint. This says nothing about ownership.',
      },
      unknowns: [...UNKNOWNS],
      reasons: [
        'contactability not verified (SCB marketing/e-mail/phone restriction codes not read; internal suppressions not compared)',
        ...(exactMatches.length ? ['exact orgnr found in known earlier outreach'] : []),
        ...(nameOnlyMatches.length ? ['name-only possible historic match'] : []),
        'known-outreach history is PARTIAL; absence of a match clears nothing',
      ],
    }
  })

  const count = (p: (c: VettedCandidate) => boolean) => candidates.filter(p).length
  const stats: VettingStats = {
    totalRows: candidates.length,
    exactHistoricMatches: count((c) => c.priorContactReview.result === 'EXACT_ORGNR_MATCH'),
    nameOnlyHistoricMatches: count((c) => c.priorContactReview.result === 'NAME_ONLY_POSSIBLE_MATCH'),
    noMatchInPartialSnapshot: count((c) => c.priorContactReview.result === 'NO_MATCH_IN_PARTIAL_SNAPSHOT'),
    groupOverlapCandidates: count((c) => c.groupReview.flags.length > 0),
    possibleOutOfScopeCandidates: count((c) => c.fitReviewFlags.some((f) => f.startsWith('POSSIBLE_OUT_OF_SCOPE_WORD'))),
    cleared: 0,
    outreachReady: 0,
    historyCoverage: 'PARTIAL',
  }

  return {
    schemaVersion: 1,
    kind: 'handlarborsen_offline_vetting_report',
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    localOnly: true,
    statement: 'Manual review only. No row is cleared or outreach-ready: history is PARTIAL, activity/legal status and contact restrictions are UNKNOWN. Do not upload or send.',
    provenance: {
      input: { rows: rows.length, sources: [...new Set(rows.map((r) => r.source))], retrievedAt: [...new Set(rows.map((r) => r.retrievedAt))] },
      snapshot: {
        asOf: snapshot.asOf, PARTIAL: true,
        exactEntries: snapshot.entries.filter((e) => e.matchKind === 'exact_orgnr').length,
        nameOnlyEntries: snapshot.entries.filter((e) => e.matchKind === 'name_only').length,
        sources: snapshot.sources, coverageMissing: snapshot.coverage.missing,
      },
    },
    stats,
    candidates,
  }
}

// ---------------------------------------------------------------- output

/** CSV field with quote doubling and spreadsheet formula-injection neutralisation. */
export function csvField(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${v.replace(/"/g, '""')}"`
}

export const REPORT_CSV_HEADER = [
  'legalName', 'orgnr', 'city', 'fitReviewFlags', 'priorContactReview', 'groupReview', 'qualification', 'contactability', 'source',
] as const

export function renderReportCsv(report: VettingReport): string {
  const lines = [REPORT_CSV_HEADER.join(',')]
  for (const c of report.candidates) {
    const prior = [c.priorContactReview.result, ...c.priorContactReview.flags].join('; ')
    lines.push([
      c.legalName, c.orgnr, c.city, c.fitReviewFlags.join('; '), prior, c.groupReview.flags.join('; '),
      c.qualification, c.contactability, c.source,
    ].map(csvField).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

/**
 * True only for a .csv file directly inside `<tempRoot>\hb-scb-paged-*`.
 * Windows path semantics, case-insensitive; rejects `..` escapes.
 */
export function isApprovedPreviewInput(inputPath: string, tempRoot: string, pathApi: typeof import('node:path').win32): boolean {
  const full = pathApi.resolve(inputPath)
  const root = pathApi.resolve(tempRoot)
  const dir = pathApi.dirname(full)
  if (pathApi.dirname(dir).toLowerCase() !== root.toLowerCase()) return false
  if (!/^hb-scb-paged-[A-Za-z0-9-]+$/.test(pathApi.basename(dir))) return false
  return pathApi.extname(full).toLowerCase() === '.csv'
}
