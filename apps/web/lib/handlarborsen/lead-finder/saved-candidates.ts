import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { looksLikePersonnummer, normalizeOrgnr } from './identity'
import type { CandidateStatus } from './types'

export const MAX_SAVED_CANDIDATES = 100
export type SavedCandidatesStatus = 'disabled' | 'ready' | 'incomplete' | 'unavailable' | 'forbidden'

/** Display-safe, no emails, contact details or pseudonymous sole-proprietor identities. */
export interface SavedCandidateView {
  id: string
  name: string
  orgnr: string
  countyCode: string | null
  score: number | null
  city: string
  scbStatusCode: '1' | '9'
  legalFormCode: '49' | '31' | '96'
  restricted: boolean
  priorContact: boolean
  status: CandidateStatus
  reasons: string[]
  sniCodes: string[]
  source: 'scb_foretagsregistret'
  retrievedAt: string
}

export interface SavedCandidates {
  status: SavedCandidatesStatus
  candidates: SavedCandidateView[]
  /** Review is blocked until suppression sources + SCB restrictions are checked. */
  outreachReady: false
}

const empty = (status: SavedCandidatesStatus): SavedCandidates => ({
  status, candidates: [], outreachReady: false,
})
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' &&
  /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v)
const statuses = new Set<CandidateStatus>([
  'needs_review', 'rejected', 'duplicate', 'excluded', 'suppressed',
])

/** Strict parsing: unknown, cross-project or personal rows disable the whole list. */
export function parseSavedCandidates(rows: unknown, projectId: string): SavedCandidates {
  if (projectId !== HANDLARBORSEN_PROJECT_ID) return empty('forbidden')
  if (!Array.isArray(rows)) return empty('unavailable')
  if (rows.length > MAX_SAVED_CANDIDATES) return empty('incomplete')
  const candidates: SavedCandidateView[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!object(row) || row.project_id !== projectId || !uuid(row.id) ||
      typeof row.name !== 'string' || row.name.trim().length < 2 || row.name.length > 200 ||
      !(row.score === null || (typeof row.score === 'number' && Number.isInteger(row.score) && row.score >= 0 && row.score <= 100)) ||
      !statuses.has(row.status as CandidateStatus) ||
      typeof row.city !== 'string' || row.city.length < 1 || row.city.length > 120 ||
      !['49','31','96'].includes(row.legal_form_code as string) ||
      !['1','9'].includes(row.scb_status_code as string) ||
      !['1','2'].includes(row.reklam_code as string) || !['1','2'].includes(row.epost_code as string) ||
      !['1','2','3'].includes(row.telefon_code as string) ||
      typeof row.prior_contact !== 'boolean' || row.history_coverage !== 'PARTIAL' ||
      row.contactability !== 'BLOCKED_PENDING_VERIFICATION' || row.outreach_ready !== false ||
      ((row.reklam_code === '2' || row.epost_code === '2' || row.telefon_code === '2' || row.telefon_code === '3') && row.status !== 'suppressed') ||
      ((row.scb_status_code === '9' || row.prior_contact === true) && row.status === 'needs_review') ||
      !Array.isArray(row.exclusions) || !row.exclusions.every((s: unknown) => typeof s === 'string') ||
      !Array.isArray(row.sni_codes) || row.sni_codes.length < 1 || row.sni_codes.length > 2 || !row.sni_codes.every((s: unknown) => s === '47.811' || s === '46.711') ||
      !object(row.provenance) || row.provenance.source !== 'scb_foretagsregistret' ||
      row.provenance.retrievedAt !== '2026-10-27' ||
      row.provenance.audit !== 'hb-scb-status-audited-20261028-061729' ||
      row.provenance.review !== 'awaiting_human_review') {
      return empty('unavailable')
    }
    const orgnr = normalizeOrgnr(typeof row.orgnr === 'string' ? row.orgnr : '')
    // Absolutely no sole proprietors, even hashed or masked, may be displayed.
    if (!orgnr || Number(orgnr[2]) < 2 || looksLikePersonnummer(orgnr) || seen.has(row.id)) return empty('unavailable')
    seen.add(row.id)
    candidates.push({
      id: row.id,
      name: row.name.trim(),
      orgnr,
      countyCode: typeof row.county_code === 'string' ? row.county_code : null,
      score: row.score as number | null,
      city: row.city as string,
      scbStatusCode: row.scb_status_code as '1'|'9',
      legalFormCode: row.legal_form_code as '49'|'31'|'96',
      restricted: row.reklam_code === '2' || row.epost_code === '2' || row.telefon_code === '2' || row.telefon_code === '3',
      priorContact: row.prior_contact as boolean,
      status: row.status as CandidateStatus,
      reasons: row.exclusions.slice(0, 10) as string[],
      sniCodes: row.sni_codes.slice(0, 5) as string[],
      source: 'scb_foretagsregistret',
      retrievedAt: row.provenance.retrievedAt,
    })
  }
  return { status: 'ready', candidates, outreachReady: false }
}

export type FetchCandidateRows = (projectId: string, limit: number) => Promise<{
  data: unknown
  error: unknown
}>

export async function loadSavedCandidates(
  projectId: string, enabled: boolean, fetchRows: FetchCandidateRows,
): Promise<SavedCandidates> {
  if (projectId !== HANDLARBORSEN_PROJECT_ID) return empty('forbidden')
  if (!enabled) return empty('disabled')
  try {
    const result = await fetchRows(projectId, MAX_SAVED_CANDIDATES + 1)
    if (result.error) return empty('unavailable')
    return parseSavedCandidates(result.data, projectId)
  } catch {
    return empty('unavailable')
  }
}

export function filterCandidateViews(rows: readonly SavedCandidateView[], search: string, status: string) {
  const q = search.trim().toLocaleLowerCase('sv').slice(0, 80)
  return rows.filter((row) =>
    (status === 'all' || row.status === status) &&
    (!q || `${row.name} ${row.orgnr} ${row.city} ${row.countyCode ?? ''}`.toLocaleLowerCase('sv').includes(q)),
  ).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, 'sv'))
}
