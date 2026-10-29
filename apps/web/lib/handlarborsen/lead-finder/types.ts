/**
 * Handlarbörsen lead finder — shared types.
 *
 * `ScbRegisterRecord` is OUR neutral intermediate shape. The mapping from the
 * SCB AFR API response to it is in `scb-client.ts`. See
 * docs/handlarborsen-lead-finder.md.
 */

export interface ScbRegisterRecord {
  /** Raw organisation number as delivered; validated by `normalizeOrgnr`. */
  orgnr: string
  name: string
  /** Workplace id (CFAR). Several records may share one orgnr. */
  cfar?: string | null
  /** Legal form description or code, as delivered. */
  legalForm?: string | null
  /** SNI codes as dotted strings, e.g. "47.811". */
  sniCodes: string[]
  countyCode?: string | null
  municipalityCode?: string | null
  city?: string | null
  active?: boolean
}

export type CandidateStatus =
  | 'needs_review'
  | 'approved_for_outreach_review'
  | 'rejected'
  | 'duplicate'
  | 'excluded'
  | 'suppressed'

export type ExclusionReason =
  | 'existing_account'
  | 'pilot_contact'
  | 'declined'
  | 'already_contacted'
  | 'suppressed'
  | 'excluded'
  | 'inactive'
  | 'out_of_region'
  | 'not_target_segment'
  /** Sole proprietors (orgnr = personnummer) never enter the ordinary review queue. */
  | 'sole_proprietor_gdpr_review'

export interface Provenance {
  source: 'scb_foretagsregistret' | 'fixture'
  /** ISO timestamp of retrieval. */
  retrievedAt: string
  /** Opaque query description (segments, region) — never a credential. */
  query: string
}

export interface WorkplaceRef {
  cfar: string | null
  city: string | null
  municipalityCode: string | null
}

export interface LeadCandidate {
  /** Stable key: hash of orgnr (never the raw orgnr for sole proprietors). */
  identityKey: string
  /** Raw orgnr is only kept for legal entities; null for person-linked ones. */
  orgnr: string | null
  orgnrMasked: string
  name: string
  normalizedName: string
  legalForm: string | null
  soleProprietor: boolean
  sniCodes: string[]
  countyCode: string | null
  /** One entry per workplace — branches are NOT separate companies. */
  workplaces: WorkplaceRef[]
  score: number
  scoreReasons: string[]
  status: CandidateStatus
  exclusions: ExclusionReason[]
  provenance: Provenance
  /** Candidates never carry contact data; contact discovery is a reviewed, separate step. */
  contactData: null
}

export type ExistingEntryKind =
  | 'existing_account'
  | 'pilot_contact'
  | 'declined'
  | 'contacted'
  | 'suppressed'
  | 'excluded'

/** Minimal projection of existing leads/contacts. No emails, only hashes/domains. */
export interface ExistingEntry {
  kind: ExistingEntryKind
  orgnr?: string | null
  companyName?: string | null
  domain?: string | null
}
