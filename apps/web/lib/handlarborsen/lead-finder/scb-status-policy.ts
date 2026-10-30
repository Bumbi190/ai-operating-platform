import { looksLikePersonnummer, luhnValid } from './identity'

/**
 * SCB status / legal form / marketing-restriction review policy. Pure, no I/O,
 * no network, no secrets.
 *
 * Sources (read 2026-10-27):
 *  - SCB variable descriptions:
 *    https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/variabelbeskrivning/
 *      ftgStat "1" = active PER SCB's criteria (VAT / employer / F-tax) — NOT proof of a
 *      functioning car dealership; "0" = never active; "9" = inactive.
 *      jurform "49" AB, "31" handels-/kommanditbolag, "96" utländsk juridisk person, "99" unresolved.
 *  - SCB AFR OpenAPI v1: GET /v1/juridiskaenheter/{peOrgNr} -> jePartialData and the five
 *    GET /v1/kodtabeller/{ftgstat,jurform,epostsparrtyp,reklamsparrtyp,telefonsparrtyp}koder tables.
 *  - IMY (right to object to direct marketing is absolute for personal data):
 *    https://www.imy.se/privatperson/dataskydd/dina-rattigheter/att-gora-invandningar/
 *
 * Hard rules:
 *  - The documented *combined* "Reklam" codes (11/12/13, 21/22/23) are NOT applied to the separate
 *    reklamSparrTyp / telefonSparrTyp / epostSparrTyp API fields. Their meaning comes only from
 *    the code table the owner fetched with an authenticated request; without it they are UNKNOWN.
 *  - No input can ever produce a contactable result: every result is manual-review-only,
 *    outreachReady=false, contactability=BLOCKED_PENDING_VERIFICATION.
 *  - Output carries no e-mail, phone, address or personal data; unknown input fields are dropped.
 */

export const SCB_STATUS_POLICY_SOURCES = {
  variableDescription: 'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/variabelbeskrivning/',
  imyDirectMarketing: 'https://www.imy.se/privatperson/dataskydd/dina-rattigheter/att-gora-invandningar/',
  scope: 'SCB AFR jePartialData (ftgStat, jurform, reklamSparrTyp, telefonSparrTyp, epostSparrTyp); legal entities only',
} as const

export type ScbStatusClass = 'ACTIVE_PER_SCB' | 'NOT_ACTIVE_PER_SCB' | 'UNKNOWN_NEEDS_REVIEW'
export type ScbLegalFormClass = 'AB' | 'HB_KB' | 'FOREIGN_LEGAL_ENTITY' | 'UNRESOLVED' | 'OTHER_NEEDS_REVIEW' | 'MISSING_NEEDS_REVIEW'
export type MarketingChannel = 'post' | 'email' | 'phone'
export type MarketingSignal = 'CODEBOOK_NOT_VERIFIED' | 'UNKNOWN' | 'OBJECTION_SIGNAL' | 'NO_OBJECTION_SIGNAL_NOT_PERMISSION' | 'MISSING'
export type CodebookKind = 'ftgStat' | 'jurform' | 'reklamSparrTyp' | 'telefonSparrTyp' | 'epostSparrTyp'

export const CONTACTABILITY_BLOCKED = 'BLOCKED_PENDING_VERIFICATION' as const

export interface CodebookEntry { kod: string | number; klartext: string }
export type Codebook = ReadonlyMap<string, string>
export type Codebooks = Partial<Record<CodebookKind, Codebook>>

export class ScbCodebookError extends Error {
  constructor(public readonly kind: CodebookKind, public readonly reason: string) {
    super(`SCB code table ${kind} rejected: ${reason}`)
    this.name = 'ScbCodebookError'
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const MAX_LABEL = 120
const MAX_CODES = 500
const safeText = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL)

/**
 * Validates an authenticated code-table response ({kod, klartext}[]). ftgStat/jurform codes are
 * strings, the three marketing tables use integers (per the OpenAPI schemas). Fails closed: any
 * malformed row, wrong key set, wrong code type or duplicate rejects the whole table.
 */
export function buildCodebook(kind: CodebookKind, raw: unknown): Codebook {
  const stringCodes = kind === 'ftgStat' || kind === 'jurform'
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CODES) throw new ScbCodebookError(kind, 'not a bounded non-empty array')
  const map = new Map<string, string>()
  for (const row of raw) {
    if (!isObject(row)) throw new ScbCodebookError(kind, 'row is not an object')
    const keys = Object.keys(row).sort().join(',')
    if (keys !== 'klartext,kod') throw new ScbCodebookError(kind, 'row keys differ from {kod,klartext}')
    const { kod, klartext } = row
    if (stringCodes) {
      if (typeof kod !== 'string' || !/^[0-9A-Za-z]{1,4}$/.test(kod)) throw new ScbCodebookError(kind, 'code is not a short string')
    } else if (typeof kod !== 'number' || !Number.isInteger(kod) || kod < 0 || kod > 999) {
      throw new ScbCodebookError(kind, 'code is not a small integer')
    }
    if (typeof klartext !== 'string' || !safeText(klartext)) throw new ScbCodebookError(kind, 'klartext missing')
    const key = String(kod)
    if (map.has(key)) throw new ScbCodebookError(kind, 'duplicate code')
    map.set(key, safeText(klartext))
  }
  return map
}

export function classifyFtgStat(code: unknown): { code: string | null; class: ScbStatusClass } {
  if (typeof code !== 'string') return { code: null, class: 'UNKNOWN_NEEDS_REVIEW' }
  const c = code.trim()
  if (c === '1') return { code: c, class: 'ACTIVE_PER_SCB' }
  if (c === '0' || c === '9') return { code: c, class: 'NOT_ACTIVE_PER_SCB' }
  return { code: /^[0-9A-Za-z]{1,4}$/.test(c) ? c : null, class: 'UNKNOWN_NEEDS_REVIEW' }
}

const DOCUMENTED_FORMS: Record<string, { class: ScbLegalFormClass; label: string }> = {
  '49': { class: 'AB', label: 'Aktiebolag' },
  '31': { class: 'HB_KB', label: 'Handels-/kommanditbolag' },
  '96': { class: 'FOREIGN_LEGAL_ENTITY', label: 'Utländsk juridisk person' },
  '99': { class: 'UNRESOLVED', label: 'Oklar juridisk form' },
}

/** Only 49/31/96/99 have a documented meaning here; every other code is flagged, never guessed. */
export function classifyLegalForm(code: unknown, codebook?: Codebook): { code: string | null; label: string | null; class: ScbLegalFormClass } {
  if (typeof code !== 'string' || !/^[0-9A-Za-z]{1,4}$/.test(code.trim())) return { code: null, label: null, class: 'MISSING_NEEDS_REVIEW' }
  const c = code.trim()
  const documented = DOCUMENTED_FORMS[c]
  if (documented) return { code: c, label: codebook?.get(c) ?? documented.label, class: documented.class }
  return { code: c, label: codebook?.get(c) ?? null, class: 'OTHER_NEEDS_REVIEW' }
}

const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()
const accentFold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()
/**
 * The exact authenticated SCB codebooks were retrieved on 2026-10-27.
 * Map code+description PER CHANNEL, not a free-text 'contains spärr' guess.
 * A lack of a restriction signal is NEVER contact permission.
 */
const VERIFIED_CHANNEL_LABELS: Record<MarketingChannel,Record<string,{label:string;restricted:boolean}>> = {
  post: {
    '1':{label:'tar emot reklam',restricted:false},
    '2':{label:'har fransagt sig reklam',restricted:true},
  },
  email: {
    '1':{label:'ej epostsparrat',restricted:false},
    '2':{label:'epostsparrat',restricted:true},
  },
  phone: {
    '1':{label:'ej telefonnummersparrat',restricted:false},
    '2':{label:'telefonnummersparr telemarketing',restricted:true},
    '3':{label:'nix-telefon',restricted:true},
  },
}
// Anything hinting at an objection / block. Checked FIRST so negations ("ej spärr") fail closed.
const OBJECTION = /spärr|sparr|avstå|avsta|nej|ej\b|inte|vill ej|motsät|motsat|avböj|avboj|förbud|forbud|blockera|no direct|declin|opt.?out|refus|object|not\b|\bno\b/
// The only labels accepted as "no objection signal": explicit and exact. Still never permission.
const NO_OBJECTION_EXACT = new Set(['ingen spärr', 'ingen spärrmarkering', 'ingen spärr finns'])

export interface MarketingAssessment {
  channel: MarketingChannel
  field: 'reklamSparrTyp' | 'epostSparrTyp' | 'telefonSparrTyp'
  code: number | null
  label: string | null
  signal: MarketingSignal
}

const CHANNEL_FIELD = { post: 'reklamSparrTyp', email: 'epostSparrTyp', phone: 'telefonSparrTyp' } as const

/** Exact code lookup in the channel's own verified table; no cross-channel or combined-"Reklam" fallback. */
export function assessMarketingCode(channel: MarketingChannel, value: unknown, codebook?: Codebook): MarketingAssessment {
  const field = CHANNEL_FIELD[channel]
  const code = typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999 ? value : null
  const base = { channel, field, code }
  if (code === null) return { ...base, label: null, signal: value === undefined || value === null ? 'MISSING' : 'UNKNOWN' }
  if (!codebook) return { ...base, label: null, signal: 'CODEBOOK_NOT_VERIFIED' }
  const label = codebook.get(String(code))
  if (label === undefined) return { ...base, label: null, signal: 'UNKNOWN' }
  const n = norm(label)
  const verified = VERIFIED_CHANNEL_LABELS[channel][String(code)]
  if (verified) {
    if (accentFold(label) === verified.label) {
      return { ...base, label, signal: verified.restricted ? 'OBJECTION_SIGNAL' : 'NO_OBJECTION_SIGNAL_NOT_PERMISSION' }
    }
    // A codebook changed meaning unexpectedly: never silently call it clear.
    if (verified.restricted) return { ...base, label, signal: OBJECTION.test(n) ? 'OBJECTION_SIGNAL' : 'UNKNOWN' }
  }
  if (NO_OBJECTION_EXACT.has(n)) return { ...base, label, signal: 'NO_OBJECTION_SIGNAL_NOT_PERMISSION' }
  if (OBJECTION.test(n)) return { ...base, label, signal: 'OBJECTION_SIGNAL' }
  return { ...base, label, signal: 'UNKNOWN' }
}

export type RejectionReason = 'not_an_object' | 'bad_expected_orgnr' | 'personal_or_unsupported_orgnr' | 'bad_checksum' | 'orgnr_mismatch' | 'identifier_missing' | 'physical_person_jurform'

interface Fixed {
  manualReviewOnly: true
  outreachReady: false
  contactability: typeof CONTACTABILITY_BLOCKED
}
const FIXED: Fixed = { manualReviewOnly: true, outreachReady: false, contactability: CONTACTABILITY_BLOCKED }

export interface ScbStatusRejected extends Fixed { ok: false; reason: RejectionReason }
export interface ScbStatusReview extends Fixed {
  ok: true
  orgnr: string
  legalName: string | null
  status: { code: string | null; class: ScbStatusClass; label: string | null }
  legalForm: { code: string | null; label: string | null; class: ScbLegalFormClass }
  marketing: Record<MarketingChannel, MarketingAssessment>
  warnings: string[]
  needsReview: boolean
  source: typeof SCB_STATUS_POLICY_SOURCES
}
export type ScbStatusResult = ScbStatusRejected | ScbStatusReview

/** Legal-entity orgnr only: 10 digits (optional hyphen / "16" prefix), 3rd digit >= 2, Luhn. */
export function parseLegalOrgnr(raw: unknown): { ok: true; orgnr: string } | { ok: false; reason: RejectionReason } {
  if (typeof raw !== 'string') return { ok: false, reason: 'personal_or_unsupported_orgnr' }
  const s = raw.trim()
  if (!/^\d{6}-?\d{4}$/.test(s) && !/^16\d{6}-?\d{4}$/.test(s)) return { ok: false, reason: 'personal_or_unsupported_orgnr' }
  let d = s.replace('-', '')
  if (d.length === 12) d = d.slice(2)
  if (Number(d[2]) < 2 || looksLikePersonnummer(d)) return { ok: false, reason: 'personal_or_unsupported_orgnr' }
  if (!luhnValid(d)) return { ok: false, reason: 'bad_checksum' }
  return { ok: true, orgnr: d }
}

/**
 * Evaluates one sanitized/synthetic jePartialData object against the expected legal orgnr.
 * Only the allowlisted properties are read; everything else (including any contact field) is
 * ignored and never copied to the result.
 */
export function evaluateScbCompany(input: { expectedOrgnr: unknown; expectedLegalName?: string | null; je: unknown; codebooks?: Codebooks }): ScbStatusResult {
  const reject = (reason: RejectionReason): ScbStatusRejected => ({ ok: false, reason, ...FIXED })
  const expected = parseLegalOrgnr(input.expectedOrgnr)
  if (!expected.ok) return reject(expected.reason === 'bad_checksum' ? 'bad_checksum' : 'bad_expected_orgnr')
  const je = input.je
  if (!isObject(je)) return reject('not_an_object')

  const idRaw = typeof je.peOrgNr === 'string' ? je.peOrgNr : typeof je.orgNr === 'string' ? je.orgNr : undefined
  if (idRaw === undefined) return reject('identifier_missing')
  const id = parseLegalOrgnr(idRaw)
  if (!id.ok) return reject(id.reason)
  if (id.orgnr !== expected.orgnr) return reject('orgnr_mismatch')
  // If both identifiers are present they must agree.
  if (typeof je.peOrgNr === 'string' && typeof je.orgNr === 'string') {
    const other = parseLegalOrgnr(je.orgNr)
    if (!other.ok || other.orgnr !== expected.orgnr) return reject('orgnr_mismatch')
  }

  // A SCB physical person (jurform 10) may pass a superficial 10-digit
  // organisation-number checksum. Reject before serialising name or orgnr.
  if (je.jurform === '10') return reject('physical_person_jurform')

  const books = input.codebooks ?? {}
  const warnings: string[] = []
  const legalName = typeof je.namn === 'string' && safeText(je.namn) ? safeText(je.namn) : null
  if (legalName === null) warnings.push('LEGAL_NAME_MISSING')
  else if (input.expectedLegalName && norm(safeText(input.expectedLegalName)) !== norm(legalName)) warnings.push('LEGAL_NAME_CHANGED_REVIEW')

  const st = classifyFtgStat(je.ftgStat)
  const status = { ...st, label: st.code ? books.ftgStat?.get(st.code) ?? null : null }
  if (st.class === 'UNKNOWN_NEEDS_REVIEW') warnings.push('STATUS_UNKNOWN')
  if (st.class === 'NOT_ACTIVE_PER_SCB') warnings.push('NOT_ACTIVE_PER_SCB')
  if (st.class === 'ACTIVE_PER_SCB') warnings.push('ACTIVE_PER_SCB_IS_NOT_PROOF_OF_DEALER_OR_PERMISSION')

  const legalForm = classifyLegalForm(je.jurform, books.jurform)
  if (legalForm.class !== 'AB' && legalForm.class !== 'HB_KB') warnings.push(`LEGAL_FORM_${legalForm.class}`)

  const marketing = {
    post: assessMarketingCode('post', je.reklamSparrTyp, books.reklamSparrTyp),
    email: assessMarketingCode('email', je.epostSparrTyp, books.epostSparrTyp),
    phone: assessMarketingCode('phone', je.telefonSparrTyp, books.telefonSparrTyp),
  }
  for (const ch of ['post', 'email', 'phone'] as const) {
    const sig = marketing[ch].signal
    if (sig === 'OBJECTION_SIGNAL') warnings.push(`MARKETING_OBJECTION_${ch.toUpperCase()}`)
    else if (sig !== 'NO_OBJECTION_SIGNAL_NOT_PERMISSION') warnings.push(`MARKETING_${sig}_${ch.toUpperCase()}`)
  }

  // Complete historic consent/suppression state and human validation are still
  // missing even when SCB returns 'active' and no explicit block signals.
  const needsReview = true
  return { ok: true, orgnr: expected.orgnr, legalName, status, legalForm, marketing, warnings, needsReview, source: SCB_STATUS_POLICY_SOURCES, ...FIXED }
}
