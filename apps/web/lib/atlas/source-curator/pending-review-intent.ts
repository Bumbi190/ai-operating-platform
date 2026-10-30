/**
 * Deterministic guard for a specialist workflow that is NOT connected to Atlas.
 *
 * Atlas and Nova are the SAME operator assistant; Nova is the voice / Agent
 * Office persona, not a separate agent or identity with its own permissions.
 * This is an explicit operator request, not a source of permissions. Recognizing
 * it means "do NOT choose unrelated CRM, inbox, workflow, Notion or action tools";
 * it emphatically does not grant Nova Source Curator read/index/approval rights.
 *
 * Remove/replace the pending reply only when a separately reviewed, authorized
 * project-scoped Nova Source Curator tool is actually deployed.
 */
const LEAD = /^(?:(?:hej|hallå|tjena)\s*[!,.:]?\s+)?(?:(?:nova|atlas)\s*[!,.:]?\s+|(?:atlas)\s*[!,.:]?\s+(?:be|låt)\s+nova\s+|jag\s+(?:vill|önskar)\s+att\s+(?:nova|atlas)\s+(?:ska\s+)?)/iu
// Atlas and Nova are the same assistant; a direct document-review request in
// the Atlas chat must not fall through to generic CRM tools either.
const DIRECT_REVIEW = /^(?:granska|förhandsgranska|kontrollera|verifiera|kvalitetsgranska|gå\s+igenom)\s+/iu
const HB = /handlarb[oö]rsen(?:s)?\b/iu
const SOURCE = /(?:kunskaps(?:käll(?:or|orna)?|dokument(?:en)?|underlag(?:et)?|bas(?:en)?)|projektkunskap(?:en)?|källgranskning(?:en)?|source[\s-]?curator)/iu
const REVIEW = /(?:^|\s)(?:granska|granskar|förhandsgranska|förhandsgranskar|kontrollera|kontrollerar|verifiera|verifierar|kvalitetsgranska|kvalitetsgranskar|gå\s+igenom)(?=$|[\s,.:!?])/iu
const NEGATED = /(?:granska|granskar|förhandsgranska|förhandsgranskar|kontrollera|kontrollerar|verifiera|verifierar|kvalitetsgranska|kvalitetsgranskar|gå\s+igenom)\s+(?:inte|ej|aldrig)(?=$|[\s,.:!?])/iu

export const NOVA_CURATOR_NOT_CONNECTED_REPLY =
  'Jag är Atlas, som du också kallar Nova i Agent Office. ' +
  'Min granskning av Handlarbörsens kunskapskällor är ännu inte ansluten till chatten. ' +
  'Jag har inte granskat, klassat eller godkänt några dokument i den här turen. ' +
  'Jag har inte använt CRM, inkorg eller utskicksverktyg. ' +
  'Ingen publicering eller OpenViking-indexering har startats.'

export function isPendingNovaCuratorRequest(input: unknown): boolean {
  if (typeof input !== 'string' || input.length > 1200) return false
  const text = input.normalize('NFC').toLocaleLowerCase('sv-SE').trim()
  if (!text || (!LEAD.test(text) && !DIRECT_REVIEW.test(text)) || !HB.test(text) || !SOURCE.test(text)) return false
  if (!REVIEW.test(text) || NEGATED.test(text)) return false
  return true
}
