import { HANDLARBORSEN_PROJECT_ID } from '../../atlas/handlarborsen-test-data/contracts'
import { parseLegalOrgnr } from './offline-vetting'
import type { LocalReview, LocalReviewRow } from './local-review'

/**
 * PREPARATION ONLY. Turn a validated local SCB snapshot into a bounded set of
 * *potential future* database records. There is no network, write, approval,
 * email destination or contact-person field anywhere in this module.
 */
export const MANIFEST_VERSION = 1 as const
export const SOURCE_DATE = '2026-10-27' as const
export const AUDIT_SOURCE = 'hb-scb-status-audited-20261028-061729' as const
export const BLOCKED = 'BLOCKED_PENDING_VERIFICATION' as const

export class ImportManifestError extends Error {
  constructor(readonly code: 'wrong_project'|'snapshot_untrusted'|'row_untrusted'|'duplicate'|'summary_mismatch') {
    super('Import manifest refused: '+code)
    this.name='ImportManifestError'
  }
}
const fail = (code: ImportManifestError['code']): never => { throw new ImportManifestError(code) }

export type CandidateBlockedStatus = 'needs_review' | 'excluded' | 'suppressed'
export type CandidateBlockReason =
  | 'scb_inactive' | 'scb_marketing_restriction' | 'previous_contact_partial_history'
  | 'legal_form_requires_review' | 'possible_name_group_overlap' | 'historical_register_incomplete'

/** Columns align with the FUTURE hb_lead_candidates table proposal. */
export interface CandidateImportRow {
  project_id: typeof HANDLARBORSEN_PROJECT_ID
  orgnr: string
  name: string
  city: string
  county_code: '12'
  sni_codes: string[]
  score: null // Business suitability has NOT been assessed; never fabricate a 0–100 score.
  status: CandidateBlockedStatus
  exclusions: CandidateBlockReason[]
  scb_status_code: '1' | '9'
  legal_form_code: string
  reklam_code: '1' | '2'
  epost_code: '1' | '2'
  telefon_code: '1' | '2' | '3'
  prior_contact: boolean
  history_coverage: 'PARTIAL'
  contactability: typeof BLOCKED
  outreach_ready: false
  provenance: {
    source: 'scb_foretagsregistret'
    retrievedAt: typeof SOURCE_DATE
    audit: typeof AUDIT_SOURCE
    review: 'awaiting_human_review'
  }
}

export interface CandidateImportManifest {
  kind: 'handlarborsen_scb_import_manifest_dry_run'
  version: typeof MANIFEST_VERSION
  projectId: typeof HANDLARBORSEN_PROJECT_ID
  sourceDate: typeof SOURCE_DATE
  sourceAudit: typeof AUDIT_SOURCE
  status: 'PREVIEW_ONLY_NOT_IMPORTED'
  historyCoverage: 'PARTIAL'
  contactability: typeof BLOCKED
  outreachReady: 0
  sourceRows: 90
  sourcePhysicalPersonsExcluded: 1
  count: 89
  stats: {
    needsReview: number
    excluded: number
    suppressed: number
    inactive: 6
    marketingRestricted: 1
    priorContact: 1
    legalFormsRequiringReview: number
  }
  records: CandidateImportRow[]
}

const badText = (v: unknown): boolean => typeof v !== 'string' ||
  v.length < 1 || v.length > 200 || /[<>@\u0000-\u001f\u007f]/.test(v) || /https?:\/\//i.test(v) || /(?:\+|00)?\d(?:[\s-]?\d){7,}/.test(v)

const legalOrg = (orgnr: string) => {
  try { return /^\d{10}$/.test(orgnr) && parseLegalOrgnr(orgnr) === orgnr } catch { return false }
}

function projectRow(row: LocalReviewRow): CandidateImportRow {
  if (!row || badText(row.name) || badText(row.city) || !legalOrg(row.orgnr) ||
    !/^\d{2}\.\d{3}(;\d{2}\.\d{3})*$/.test(row.sni) ||
    !['49','31','96'].includes(row.legalFormCode) ||
    row.contactability !== BLOCKED || row.reviewState !== 'awaiting_human_review' ||
    row.otherLegalForm !== (row.legalFormCode !== '49') ||
    !Array.isArray(row.restrictedChannels) ||
    row.restricted !== (row.restrictedChannels.length > 0) ||
    row.restrictedChannels.some(x => !['reklam','epost','telefon'].includes(x)) ||
    typeof row.scbActive !== 'boolean' || typeof row.priorContact !== 'boolean') fail('row_untrusted')
  const channels = new Set(row.restrictedChannels)
  if (channels.size !== row.restrictedChannels.length) fail('row_untrusted')
  const exclusions: CandidateBlockReason[] = ['historical_register_incomplete']
  if (!row.scbActive) exclusions.push('scb_inactive')
  if (row.restricted) exclusions.push('scb_marketing_restriction')
  if (row.priorContact) exclusions.push('previous_contact_partial_history')
  if (row.otherLegalForm) exclusions.push('legal_form_requires_review')
  if (row.groupHypothesis) exclusions.push('possible_name_group_overlap')

  // Restriction always takes precedence over inactivity and prior contact.
  const status: CandidateBlockedStatus =
    row.restricted ? 'suppressed' : (!row.scbActive || row.priorContact ? 'excluded' : 'needs_review')
  const codes = {
    reklam_code: channels.has('reklam') ? '2' as const : '1' as const,
    epost_code: channels.has('epost') ? '2' as const : '1' as const,
    telefon_code: channels.has('telefon') ? '2' as const : '1' as const,
  }
  return {
    project_id: HANDLARBORSEN_PROJECT_ID,
    orgnr: row.orgnr, name: row.name, city: row.city, county_code: '12',
    sni_codes: row.sni.split(';'), score: null, status, exclusions,
    scb_status_code: row.scbActive ? '1' : '9', legal_form_code: row.legalFormCode,
    ...codes, prior_contact: row.priorContact, history_coverage: 'PARTIAL',
    contactability: BLOCKED, outreach_ready: false,
    provenance: {
      source:'scb_foretagsregistret', retrievedAt:SOURCE_DATE,
      audit:AUDIT_SOURCE, review:'awaiting_human_review',
    },
  }
}

export function makeCandidateImportManifest(review: LocalReview, projectId: string): CandidateImportManifest {
  if (projectId !== HANDLARBORSEN_PROJECT_ID) fail('wrong_project')
  if (!review || review.sourceRows !== 90 || review.excludedPhysicalPersons !== 1 ||
    review.historyCoverage !== 'PARTIAL' || review.outreachReady !== 0 ||
    review.provenance !== 'SCB 2026-10-27' ||
    !Array.isArray(review.rows) || review.rows.length !== 89 ||
    review.counts.total !== 89 || review.counts.active !== 83 ||
    review.counts.inactive !== 6 || review.counts.restricted !== 1 ||
    review.counts.priorContact !== 1) fail('snapshot_untrusted')

  const seen = new Set<string>()
  const records = review.rows.map(row => {
    const rec = projectRow(row)
    if (seen.has(rec.orgnr)) fail('duplicate')
    seen.add(rec.orgnr)
    return rec
  }).sort((a,b) => a.orgnr.localeCompare(b.orgnr))

  const count=(predicate:(r:CandidateImportRow)=>boolean)=>
    records.filter(predicate).length
  const stats = {
    needsReview: count(r=>r.status==='needs_review'),
    excluded: count(r=>r.status==='excluded'),
    suppressed: count(r=>r.status==='suppressed'),
    inactive: count(r=>r.scb_status_code==='9') as 6,
    marketingRestricted: count(r=>r.status==='suppressed') as 1,
    priorContact: count(r=>r.prior_contact) as 1,
    legalFormsRequiringReview: count(r=>r.legal_form_code !== '49'),
  }
  if (stats.inactive !== 6 || stats.marketingRestricted !== 1 || stats.priorContact !== 1 ||
    stats.needsReview+stats.excluded+stats.suppressed !== 89) fail('summary_mismatch')

  return {
    kind:'handlarborsen_scb_import_manifest_dry_run',
    version:MANIFEST_VERSION, projectId:HANDLARBORSEN_PROJECT_ID,
    sourceDate:SOURCE_DATE, sourceAudit:AUDIT_SOURCE, status:'PREVIEW_ONLY_NOT_IMPORTED',
    historyCoverage:'PARTIAL',contactability:BLOCKED,outreachReady:0,
    sourceRows:90,sourcePhysicalPersonsExcluded:1,count:89,stats,records,
  }
}
