import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { buildExclusionIndex, entriesFromSalesContactData, lookupExclusions, type ExclusionIndex } from './exclusions'
import { looksLikePersonnummer, normalizeCompanyName, normalizeOrgnr } from './identity'
import type { ExistingEntry } from './types'
import type { SavedCandidates } from './saved-candidates'

/**
 * Verified Omnira source: public.sales_contacts(project_id,data jsonb).
 * This does NOT include the historic dealer outreach list held outside Omnira.
 * This model intentionally never includes raw email addresses.
 */
export const MAX_KNOWN_CONTACTS = 500
export type KnownContactStatus = 'disabled' | 'ready' | 'unavailable' | 'incomplete' | 'forbidden'
export type KnownContacts = Readonly<{
  status: KnownContactStatus
  count: number | null
  entries: readonly ExistingEntry[]
  source: 'omnira_sales_contacts'
  /** Cannot claim complete lead dedupe until the separate pilot register is connected. */
  externalPilotRegistryConnected: false
}>

const empty = (status: KnownContactStatus): KnownContacts => ({
  status, count: null, entries: [], source: 'omnira_sales_contacts',
  externalPilotRegistryConnected: false,
})

const isObject = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x)

/** A fail-closed mapper: no row can silently disappear from the suppression baseline. */
export function parseKnownContacts(rows: unknown, projectId: string): KnownContacts {
  if (projectId !== HANDLARBORSEN_PROJECT_ID) return empty('forbidden')
  if (!Array.isArray(rows)) return empty('unavailable')
  if (rows.length > MAX_KNOWN_CONTACTS) return empty('incomplete')

  const entries: ExistingEntry[] = []
  for (const row of rows) {
    if (!isObject(row) || row.project_id !== projectId || !isObject(row.data)) {
      return empty('unavailable')
    }
    const data = row.data
    // A contact without an identifying company cannot safely be ruled out.
    if (typeof data.companyName !== 'string' || data.companyName.trim().length < 2) {
      return empty('incomplete')
    }
    const mapped = entriesFromSalesContactData(data)
    if (mapped.length === 0) return empty('incomplete')
    const orgnr = typeof data.orgnr === 'string' ? normalizeOrgnr(data.orgnr) : null
    // A person-linked identifier needs a separate privacy workflow; never
    // include or hash it inside the ordinary lead comparison baseline.
    if (orgnr && looksLikePersonnummer(orgnr)) return empty('incomplete')
    for (const entry of mapped) {
      entries.push(orgnr ? { ...entry, orgnr } : entry)
    }
  }
  return {
    status: 'ready', count: rows.length, entries,
    source: 'omnira_sales_contacts', externalPilotRegistryConnected: false,
  }
}

export type FetchKnownRows = (projectId: string, limit: number) => Promise<{
  data: unknown
  error: unknown
}>

/**
 * No access outside verified project, no queries without opt-in and no
 * service-role access. The caller has to authenticate the session first.
 */
export async function loadKnownContacts(
  projectId: string,
  enabled: boolean,
  fetchRows: FetchKnownRows,
): Promise<KnownContacts> {
  if (projectId !== HANDLARBORSEN_PROJECT_ID) return empty('forbidden')
  if (!enabled) return empty('disabled')
  try {
    const result = await fetchRows(projectId, MAX_KNOWN_CONTACTS + 1)
    if (result.error) return empty('unavailable')
    return parseKnownContacts(result.data, projectId)
  } catch {
    return empty('unavailable')
  }
}

/** For server-side preview only; never serialize the index to a browser. */
export function eligibleExclusions(known: KnownContacts): ExclusionIndex | null {
  return known.status === 'ready' && known.externalPilotRegistryConnected
    ? buildExclusionIndex(known.entries)
    : null
}

/** Safe to render. The returned object contains no entries, emails or domains. */
export function knownContactSummary(known: KnownContacts) {
  return {
    status: known.status,
    count: known.count,
    externalPilotRegistryConnected: known.externalPilotRegistryConnected,
    reviewBlocked: true as const,
  }
}

/**
 * Display-only reconciliation against the ACTUAL Omnira sales_contacts rows.
 * This does NOT establish outreach eligibility: the separate historical pilot
 * register and SCB opt-out flags still need independent verification.
 * No contact row, email or domain is copied into the candidate view.
 */
export function reconcileSavedCandidates(saved: SavedCandidates, known: KnownContacts): SavedCandidates {
  if (saved.status !== 'ready' || known.status !== 'ready') return saved
  const index = buildExclusionIndex(known.entries)
  return {
    ...saved,
    candidates: saved.candidates.map(candidate => {
      const matches = lookupExclusions(index, {
        orgnr: candidate.orgnr,
        normalizedName: normalizeCompanyName(candidate.name),
      })
      if (matches.length === 0) return candidate
      const status = candidate.status === 'suppressed' || matches.includes('suppressed')
        ? 'suppressed'
        : (candidate.status === 'needs_review' || candidate.status === 'approved_for_outreach_review')
          ? 'excluded'
          : candidate.status
      return {
        ...candidate, status,
        reasons: [...new Set([...candidate.reasons, ...matches])].slice(0, 10),
      }
    }),
    outreachReady: false,
  }
}
