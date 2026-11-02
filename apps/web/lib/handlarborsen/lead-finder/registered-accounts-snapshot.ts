/**
 * Read-only snapshot of Handlarbörsen's SEPARATE Supabase project's
 * public.organizations table, observed via an authorised Supabase read
 * on 2026-10-29. NOT a live sync or legal verification service.
 *
 * 11 registrations: 3 status=verified, 2 pending, 6 closed. The "verified"
 * state is the site's account state; two verified accounts are internal
 * test organisations and must never be described as pilot customers.
 * No emails, phones, auth user IDs, addresses or person-shaped/test
 * organisation numbers are copied into Omnira source or client data.
 */
import type { ExistingEntry } from './types'
import { normalizeOrgnr, looksLikePersonnummer } from './identity'

export const REGISTERED_ACCOUNT_SNAPSHOT = Object.freeze({
  source: 'handlarborsen_organizations_snapshot' as const,
  asOf: '2026-10-29',
  total: 11,
  verified: 3,
  pending: 2,
  closed: 6,
  checkedLegalEntities: 3,
  knownInternalTestAccountsAmongVerified: 2,
  coverageComplete: false as const,
})
export type RegisteredAccountSnapshotSummary = typeof REGISTERED_ACCOUNT_SNAPSHOT

/** The only entries with syntactically valid, non-person legal org numbers
 * and a verified account status in the observed 2026-10-29 snapshot.
 * These entries are PREVENTION-ONLY, never a reason to contact an account.
 */
const verified: readonly Readonly<{ companyName: string; orgnr: string; testAccount: boolean }>[] = [
  { companyName: 'familje-stunden AB', orgnr: '5595433995', testAccount: true },
  { companyName: 'Bromölla kylteknik', orgnr: '9698027720', testAccount: true },
  { companyName: 'Tiltiana Holdings AB', orgnr: '5569622110', testAccount: false },
]

/** Internal, ephemeral exclusion baseline; never serialise the entries as
 * client props or expose the source project credentials. A nonmatch means
 * nothing because the snapshot is not live and excludes non-verified rows.
 */
export function registeredAccountExclusions(): readonly ExistingEntry[] {
  return verified.flatMap(({ companyName, orgnr }) => {
    const safe = normalizeOrgnr(orgnr)
    return safe && !looksLikePersonnummer(safe)
      ? [{ companyName, orgnr: safe, domain: null, kind: 'existing_account' as const }]
      : []
  })
}
