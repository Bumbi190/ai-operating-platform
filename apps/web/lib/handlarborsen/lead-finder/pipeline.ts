import { hashIdentity, looksLikePersonnummer, maskOrgnr, normalizeCompanyName, normalizeOrgnr } from './identity'
import { lookupExclusions, type ExclusionIndex } from './exclusions'
import type { CandidateStatus, ExclusionReason, LeadCandidate, Provenance, ScbRegisterRecord, WorkplaceRef } from './types'

/**
 * Candidate segments. SNI2025 codes are taken from the brief and MUST be
 * re-verified against SCB's code list before a live run.
 */
export const TARGET_SNI = Object.freeze({ '47.811': 40, '46.711': 20 } as Record<string, number>)
/** Skåne län. */
export const SKANE_COUNTY_CODE = '12'
export const MAX_PREVIEW_CANDIDATES = 50

export interface PreviewOptions {
  existing: ExclusionIndex
  provenance: Provenance
  countyCode?: string
  limit?: number
}

export interface PreviewReport {
  dryRun: true
  candidates: LeadCandidate[]
  skipped: { invalidOrgnr: number; duplicateWorkplaces: number }
  counts: Record<CandidateStatus, number>
  /** Always false: importing candidates never triggers outreach. */
  outreachTriggered: false
}

function isSoleProprietor(legalForm: string | null | undefined, orgnr: string): boolean {
  if (legalForm && /enskild/i.test(legalForm)) return true
  return looksLikePersonnummer(orgnr)
}

function score(rec: ScbRegisterRecord, countyCode: string, sole: boolean): { score: number; reasons: string[] } {
  let s = 0
  const reasons: string[] = []
  const sni = Math.max(0, ...rec.sniCodes.map((c) => TARGET_SNI[c] ?? 0))
  if (sni) { s += sni; reasons.push(`sni:${sni}`) }
  if (rec.countyCode === countyCode) { s += 30; reasons.push('region') }
  // Unknown status (undefined, as the SCB client leaves it) must not earn points.
  if (rec.active === true) { s += 10; reasons.push('active') }
  if (!sole) { s += 10; reasons.push('legal_entity') } else reasons.push('sole_proprietor_review')
  return { score: Math.min(100, s), reasons }
}

/**
 * Normalise → dedupe by orgnr (workplaces are folded into ONE candidate) →
 * exclusion check → score. Pure; performs no writes and no network calls.
 */
export function buildPreview(records: readonly ScbRegisterRecord[], opts: PreviewOptions): PreviewReport {
  const county = opts.countyCode ?? SKANE_COUNTY_CODE
  const limit = Math.min(opts.limit ?? MAX_PREVIEW_CANDIDATES, MAX_PREVIEW_CANDIDATES)
  const byKey = new Map<string, LeadCandidate>()
  const seenWorkplaces = new Set<string>()
  const skipped = { invalidOrgnr: 0, duplicateWorkplaces: 0 }

  for (const rec of records) {
    const orgnr = normalizeOrgnr(rec.orgnr)
    if (!orgnr) { skipped.invalidOrgnr++; continue }
    const wpKey = `${orgnr}:${rec.cfar ?? ''}`
    if (seenWorkplaces.has(wpKey)) { skipped.duplicateWorkplaces++; continue }
    seenWorkplaces.add(wpKey)

    const workplace: WorkplaceRef = { cfar: rec.cfar ?? null, city: rec.city ?? null, municipalityCode: rec.municipalityCode ?? null }
    const identityKey = hashIdentity(orgnr)
    const existing = byKey.get(identityKey)
    if (existing) {
      existing.workplaces.push(workplace)
      // A branch in the target region lifts the whole company's regional fit.
      if (rec.countyCode === county && existing.countyCode !== county) {
        existing.countyCode = county
        const rescored = score({ ...rec, sniCodes: [...new Set([...existing.sniCodes, ...rec.sniCodes])] }, county, existing.soleProprietor)
        existing.score = rescored.score
        existing.scoreReasons = rescored.reasons
      }
      existing.sniCodes = [...new Set([...existing.sniCodes, ...rec.sniCodes])]
      continue
    }

    const sole = isSoleProprietor(rec.legalForm, orgnr)
    const normalizedName = normalizeCompanyName(rec.name)
    const { score: s, reasons } = score(rec, county, sole)
    byKey.set(identityKey, {
      identityKey,
      orgnr: sole ? null : orgnr,
      orgnrMasked: maskOrgnr(orgnr),
      name: sole ? '' : rec.name,
      normalizedName: sole ? '' : normalizedName,
      legalForm: rec.legalForm ?? null,
      soleProprietor: sole,
      sniCodes: [...rec.sniCodes],
      countyCode: rec.countyCode ?? null,
      workplaces: [workplace],
      score: s,
      scoreReasons: reasons,
      status: 'needs_review',
      exclusions: [],
      provenance: opts.provenance,
      contactData: null,
      // Exclusion matching below uses the raw orgnr/name even for sole
      // proprietors; those fields are then discarded from the output.
      // Sole proprietors are excluded (sole_proprietor_gdpr_review), never queued.
    })
    const c = byKey.get(identityKey)!
    const reasons2: ExclusionReason[] = lookupExclusions(opts.existing, { orgnr, normalizedName })
    if (sole) reasons2.push('sole_proprietor_gdpr_review')
    if (rec.active === false) reasons2.push('inactive')
    if (!rec.sniCodes.some((code) => code in TARGET_SNI)) reasons2.push('not_target_segment')
    c.exclusions = reasons2
    c.status = statusFor(reasons2)
  }

  const all = [...byKey.values()]
  // Region is evaluated after workplaces are folded, so a branch outside
  // Skåne does not exclude a company that has a Skåne workplace.
  for (const c of all) {
    if (c.countyCode !== county) { c.exclusions.push('out_of_region'); c.status = statusFor(c.exclusions) }
  }
  const eligible = all.filter((c) => c.status === 'needs_review').sort((a, b) => b.score - a.score || a.identityKey.localeCompare(b.identityKey))
  const candidates = [...eligible.slice(0, limit), ...all.filter((c) => c.status !== 'needs_review')]
  const counts = { needs_review: 0, approved_for_outreach_review: 0, rejected: 0, duplicate: 0, excluded: 0, suppressed: 0 } as Record<CandidateStatus, number>
  for (const c of candidates) counts[c.status]++
  return { dryRun: true, candidates, skipped, counts, outreachTriggered: false }
}

function statusFor(reasons: readonly ExclusionReason[]): CandidateStatus {
  if (reasons.includes('suppressed')) return 'suppressed'
  if (reasons.length === 0) return 'needs_review'
  return 'excluded'
}
