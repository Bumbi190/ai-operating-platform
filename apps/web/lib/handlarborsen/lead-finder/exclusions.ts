import { normalizeCompanyName, normalizeDomain, normalizeOrgnr } from './identity'
import type { ExclusionReason, ExistingEntry, ExistingEntryKind } from './types'

const KIND_TO_REASON: Record<ExistingEntryKind, ExclusionReason> = {
  existing_account: 'existing_account',
  pilot_contact: 'pilot_contact',
  declined: 'declined',
  contacted: 'already_contacted',
  suppressed: 'suppressed',
  excluded: 'excluded',
}

export interface ExclusionIndex {
  byOrgnr: Map<string, Set<ExclusionReason>>
  byName: Map<string, Set<ExclusionReason>>
  byDomain: Map<string, Set<ExclusionReason>>
}

function add(map: Map<string, Set<ExclusionReason>>, key: string | null, reason: ExclusionReason) {
  if (!key) return
  const set = map.get(key) ?? new Set<ExclusionReason>()
  set.add(reason)
  map.set(key, set)
}

export function buildExclusionIndex(entries: readonly ExistingEntry[]): ExclusionIndex {
  const index: ExclusionIndex = { byOrgnr: new Map(), byName: new Map(), byDomain: new Map() }
  for (const e of entries) {
    const reason = KIND_TO_REASON[e.kind]
    add(index.byOrgnr, normalizeOrgnr(e.orgnr), reason)
    const name = normalizeCompanyName(e.companyName)
    add(index.byName, name.length >= 3 ? name : null, reason)
    add(index.byDomain, normalizeDomain(e.domain), reason)
  }
  return index
}

export function lookupExclusions(
  index: ExclusionIndex,
  c: { orgnr: string | null; normalizedName: string },
): ExclusionReason[] {
  const out = new Set<ExclusionReason>()
  if (c.orgnr) index.byOrgnr.get(c.orgnr)?.forEach((r) => out.add(r))
  if (c.normalizedName) index.byName.get(c.normalizedName)?.forEach((r) => out.add(r))
  return [...out]
}

/**
 * Projection of a `sales_contacts.data` jsonb document (fields confirmed in
 * migration 20261017100633_atlas_sales_pilot.sql: companyName, email,
 * history, suppressed, excluded). The mailbox is reduced to its domain here so
 * no address leaves this function.
 */
export function entriesFromSalesContactData(data: Record<string, unknown>): ExistingEntry[] {
  const companyName = typeof data.companyName === 'string' ? data.companyName : null
  const email = typeof data.email === 'string' ? data.email : ''
  const domain = email.includes('@') ? email.split('@')[1] : null
  const base = { companyName, domain }
  const out: ExistingEntry[] = []
  if (data.suppressed === true) out.push({ ...base, kind: 'suppressed' })
  if (data.excluded === true) out.push({ ...base, kind: 'excluded' })
  if (data.history === 'contacted') out.push({ ...base, kind: 'contacted' })
  // Any other row is still a known pilot contact and must not be rediscovered.
  if (out.length === 0) out.push({ ...base, kind: 'pilot_contact' })
  return out
}
