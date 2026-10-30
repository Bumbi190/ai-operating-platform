/**
 * Manually reviewed business-only historical safety baseline.
 * Evidence: "Handlarbörsen – aktuellt läge och nästa steg" in Notion,
 * status through 2026-10-28. Source is NOT the missing original 139-row
 * dealer spreadsheet and does NOT prove a complete historic outreach audit.
 *
 * No individual recipients, email addresses, phones, or person identifiers.
 * These entries block treating a match as a new contact; they NEVER permit outreach.
 * Every added campaign requires a separate reviewed source update.
 */
import type { ExistingEntry, ExistingEntryKind } from './types'

export const DOCUMENTED_PILOT_HISTORY_AS_OF = '2026-10-28'
export const DOCUMENTED_PILOT_HISTORY_SOURCE =
  'https://app.notion.com/p/3fb7b977c5b881e08e22c4659aca4d51'

type ProofKind = 'batch_3a_sent' | 'founding_sent' | 'active_conversation' |
  'existing_pilot_account' | 'historically_excluded'
type Proof = Readonly<{
  companyName: string
  orgnr?: string
  kind: ExistingEntryKind
  proof: ProofKind
}>

// Campaign status "sent" was verified 2026-10-26. This is NOT a
// recipient-by-recipient delivery receipt. Never send an automatic follow-up.
const batch3a: readonly Proof[] = [
  { companyName: 'Halmstad Bil AB', orgnr: '5594304734', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'Sjöstaden Bil', orgnr: '5563221430', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'Fikratsson Bil', orgnr: '5569547853', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'Andersson Bil AB', orgnr: '5594326802', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'Skövde Bilcenter', orgnr: '5569452971', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'WM Bil', orgnr: '5564755006', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'Wiklunds Bil', orgnr: '5567011241', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'Sahls Bil', orgnr: '5569357824', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'Kalmarsunds Bilförmedling', orgnr: '5595270520', kind: 'contacted', proof: 'batch_3a_sent' },
  { companyName: 'HEWI Motor', orgnr: '5594701202', kind: 'contacted', proof: 'batch_3a_sent' },
]

// These five received the first invitation 2026-10-08. Only source-documented
// trading names are provided; no invented organisation numbers.
const founding: readonly Proof[] = [
  { companyName: 'GP Motor', kind: 'contacted', proof: 'founding_sent' },
  { companyName: 'Autolane', kind: 'contacted', proof: 'founding_sent' },
  { companyName: 'Moberg Bil', kind: 'contacted', proof: 'founding_sent' },
  { companyName: 'Tjänstebils Experten', kind: 'contacted', proof: 'founding_sent' },
  { companyName: 'Newman Bil Hässleholm', kind: 'contacted', proof: 'founding_sent' },
]

const other: readonly Proof[] = [
  // Kareby asked for time and said they would return, 2026-10-26.
  { companyName: 'Kareby Bil', kind: 'contacted', proof: 'active_conversation' },
  // Handelsnamn / juridiskt företag: confirmed by the contact 2026-10-26;
  // verified HB organization, not a new unregistered dealer.
  { companyName: 'EVExperten', orgnr: '5569622110', kind: 'existing_account', proof: 'existing_pilot_account' },
  { companyName: 'Tiltiana Holdings AB', orgnr: '5569622110', kind: 'existing_account', proof: 'existing_pilot_account' },
  // Previously excluded from the pilot; no claim that these opted out.
  { companyName: 'Bilenia', kind: 'excluded', proof: 'historically_excluded' },
  { companyName: 'Cartrade Europe AB', kind: 'excluded', proof: 'historically_excluded' },
]

export const DOCUMENTED_PILOT_HISTORY: readonly Proof[] = Object.freeze(
  [...batch3a, ...founding, ...other].map(p => Object.freeze(p)),
)

export function documentedPilotHistoryEntries(): readonly ExistingEntry[] {
  return DOCUMENTED_PILOT_HISTORY.map(({ companyName, orgnr, kind }) => ({
    companyName, orgnr: orgnr ?? null, kind,
    domain: null,
  }))
}

export const DOCUMENTED_PILOT_HISTORY_COUNTS = Object.freeze({
  batch3a: batch3a.length,
  founding: founding.length,
  other: other.length,
  coverageComplete: false as const,
})
